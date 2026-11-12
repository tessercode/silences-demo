"""The demo's bridge to the Silences release: one call runs the chain and returns every intermediate.

    run(text, fist, seed, segmenter, weights)  ->  a JSON-ready dict

The chain itself is silences.pipeline.compose, the five boards' own arithmetic. The two LIF forms
(fed spikes, the network of record since silences v1.2.0; fed currents) and the MLP are the deployed
models in the firmware's Q16.16 (FixedWindowNet), the BiGRU is the deployed five-seed ensemble, so
all four match the chain goldens bit for bit. Everything added here only observes: trace_lif /
trace_mlp re-run one gap of a network, decode_traced is beam.decode with the beam recorded after
each gap, and the tests check each against the untraced original.
"""
import json
import time

import numpy as np

from silences import MODELS, RECORDS, ROOT, encoder_ref, frames, front_end
from silences.decoder.beam import BEAM_WIDTH, GAMMA, MORSE_INVERSE, MORSE_PREFIXES, decode
from silences.decoder.charlm import logp_q16
from silences.fixedpoint import q16
from silences.fixedpoint.q16 import FRAC, ONE
from silences.fixedpoint.window_net import FixedWindowNet
from silences.morse import MORSE_TABLE
from silences.operators import OPERATORS
from silences.pipeline import CONSOLE_FIST, compose
from silences.segmenters import bigru, oracle
from silences.segmenters.lif import LIF, SpikeFedLIF
from silences.segmenters.mlp import MLP

SEGMENTERS = ("spk", "lif", "mlp", "bigru", "oracle")
WINDOW_NETS = ("spk", "lif", "mlp")                 # the feedforward networks: a window of gaps in, one gap's class out
# The deployed networks' fitted decoder weights: (record, row) in records/<record>/fit.json (silences v1.2.0).
# The spike-fed network's fit is its float row's; the record evaluates the fixed-point network at those
# weights (records/spike_fed/fidelity.json, "float_fit/fx"), as the port gate did.
FIT_ROWS = dict(spk=("spike_fed", "spk40_op12_seed0"), lif=("matched", "lif_op12_seed0_fx"),
                mlp=("matched", "mlp_op12_seed0_fx"), bigru=("matched", "bigru_deployed"))
DEPLOYED = dict(T=1.0, gamma=GAMMA)
FIST_NUMBER = {name: n for n, name in CONSOLE_FIST.items()}
DEMO_FITS = ROOT / "demo_fits.json"                 # written by tools/build_bundle.py
CLASS_NAMES = ("intra-letter", "inter-letter", "inter-word")


# ---- decoder weights ----
def extract_fits(records=RECORDS):
    """{text: {segmenter: {T, gamma, cer, wer}}} from records/<record>/fit.json (key beta = gamma)."""
    fits = {rec: json.loads((records / rec / "fit.json").read_text())["fits"] for rec in {r for r, _ in FIT_ROWS.values()}}
    texts = sorted(fits["matched"])
    assert all(sorted(f) == texts for f in fits.values())
    return {text: {seg: dict(T=fits[rec][text][row]["T"], gamma=fits[rec][text][row]["beta"],
                             cer=fits[rec][text][row]["cer"], wer=fits[rec][text][row]["wer"])
                   for seg, (rec, row) in FIT_ROWS.items()}
            for text in texts}


_FITS = None


def fits():
    global _FITS
    if _FITS is None:
        _FITS = json.loads(DEMO_FITS.read_text()) if DEMO_FITS.exists() else extract_fits()
    return _FITS


def decoder_weights(segmenter, weights, T=None, gamma=None):
    """weights: 'eng' or 'rand' (that text's fit), 'deployed', or 'custom' (T and gamma given).
    The oracle has no fit; it decodes at the deployed weights."""
    if weights == "custom":
        return dict(T=float(T), gamma=float(gamma), source="custom")
    if weights == "deployed" or segmenter == "oracle":
        return dict(DEPLOYED, source="deployed")
    f = fits()[weights][segmenter]
    return dict(T=float(f["T"]), gamma=float(f["gamma"]), source=f"fit_{weights}")


def _q(x):
    return int(round(float(x) * ONE))


# ---- models ----
_NETS = {}


def net(segmenter):
    if segmenter not in _NETS:
        if segmenter == "spk":
            _NETS[segmenter] = FixedWindowNet.from_spk(SpikeFedLIF.load(MODELS / "spk40" / "op12" / "seed0.pkl"))
        elif segmenter == "lif":
            _NETS[segmenter] = FixedWindowNet.from_lif(LIF.load(MODELS / "lif" / "op12" / "seed0.pkl"))
        elif segmenter == "mlp":
            _NETS[segmenter] = FixedWindowNet.from_mlp(MLP.load(MODELS / "mlp" / "op12" / "seed0.pkl"))
        elif segmenter == "bigru":
            _NETS[segmenter] = bigru.deployed()
    return _NETS[segmenter]


def producer(segmenter, labels):
    """The segmenter as compose() calls it: (ticks, ch, tu_us) -> lp3 rows."""
    if segmenter in WINDOW_NETS:
        return net(segmenter).lp3_ticks
    if segmenter == "bigru":
        seeds = net("bigru")
        return lambda t, c, tu: bigru.lp3_ticks(seeds, t, c, tu)
    return lambda t, c, tu: oracle.producer()(dict(labels=labels))


# ---- traces (observe only) ----
def trace_lif(fnet, feat_q, g):
    """FixedWindowNet.logits for gap g, recording each hidden layer's spikes and the readout membrane.
    For the spike-fed network ('spk') the input spike trains are recorded first, as a layer of their own."""
    spk_in = fnet.kind == "spk"
    if spk_in:
        S_in = fnet.encode_q(feat_q[g:g + 1])                          # (T, 1, 84) regular ON/OFF trains
    else:
        I0 = fnet._matvec(feat_q[g:g + 1], *fnet.layers_q[0], shift=True)
    mem = [np.zeros((1, Wt.shape[1]), np.int64) for Wt, _ in fnet.layers_q]
    out = np.zeros((1, 3), np.int64)
    spikes = [[] for _ in fnet.layers_q[:-1]]        # per layer, per step: indices of the neurons that fired
    readout = []
    for t in range(fnet.T):
        cur = None
        for i, (Wt, b) in enumerate(fnet.layers_q):
            if i == 0:
                I = fnet._matvec(S_in[t], Wt, b, shift=False) if spk_in else I0
            else:
                I = fnet._matvec(cur, Wt, b, shift=False)
            m = q16.fxmul_round(fnet.beta_q, mem[i]) + I
            if i < len(fnet.layers_q) - 1:
                spk = (m >= fnet.theta_q).astype(np.int64)
                mem[i] = m - spk * fnet.theta_q
                cur = spk
                spikes[i].append(np.flatnonzero(spk[0]).tolist())
            else:
                mem[i] = m
                out += m
                readout.append([v / ONE for v in m[0].tolist()])
    layers = dict(spikes=spikes, sizes=[Wt.shape[1] for Wt, _ in fnet.layers_q[:-1]],
                  names=[f"layer {i + 1}" for i in range(len(spikes))], units=["LIF"] * len(spikes))
    if spk_in:
        # the input trains first: 42 ON channels then 42 OFF channels, one regular train per channel
        layers = dict(spikes=[[np.flatnonzero(S_in[t, 0]).tolist() for t in range(fnet.T)]] + spikes,
                      sizes=[S_in.shape[2]] + layers["sizes"], names=["input"] + layers["names"],
                      units=["channels"] + layers["units"], scale=fnet.scale_q / ONE)
    return dict(logits_q=(out // fnet.T)[0].tolist(), readout=readout, T=fnet.T,
                threshold=fnet.theta_q / ONE, beta=fnet.beta_q / ONE, **layers)


def trace_mlp(fnet, feat_q, g):
    """FixedWindowNet.logits for gap g, recording each hidden layer's tanh activations."""
    z, hidden = feat_q[g:g + 1], []
    for i, (Wt, b) in enumerate(fnet.layers_q):
        z = fnet._matvec(z, Wt, b, shift=True)
        if i < len(fnet.layers_q) - 1:
            z = q16.TANH.vec(z)
            hidden.append([v / ONE for v in z[0].tolist()])
    return dict(logits_q=z[0].tolist(), hidden=hidden)


def trace_bigru(seeds, feats_q):
    """The first ensemble member's forward and reverse hidden states over the whole transmission."""
    S = seeds[0]
    return dict(fwd=(S._direction("fwd", feats_q) / ONE).round(3).tolist(),
                rev=(S._direction("rev", feats_q) / ONE).round(3).tolist(), n_seeds=len(seeds))


def decode_traced(channels, lp3, gamma_q, beam_width=BEAM_WIDTH):
    """silences.decoder.beam.decode, also returning the beam (text, letter in progress, score) after each gap."""
    N = len(channels)
    if N == 0:
        return None, None, None, []
    beam, steps = [("", channels[0], 0, ())], []
    for i in range(N - 1):
        lp_in, lp_il, lp_iw = int(lp3[i][0]), int(lp3[i][1]), int(lp3[i][2])
        c_next, next_beam = channels[i + 1], []
        for emitted, current, score, seg in beam:
            if current + c_next in MORSE_PREFIXES:
                next_beam.append((emitted, current + c_next, score + lp_in, seg + (0,)))
            if current in MORSE_INVERSE:
                ch = MORSE_INVERSE[current]
                lm = logp_q16(ch, emitted) + gamma_q
                next_beam.append((emitted + ch, c_next, score + lp_il + lm, seg + (1,)))
                next_beam.append((emitted + ch + " ", c_next, score + lp_iw + lm, seg + (2,)))
        next_beam.sort(key=lambda s: s[2], reverse=True)
        beam = next_beam[:beam_width]
        steps.append([[e, c, s, sg[-1]] for e, c, s, sg in beam])
        if not beam:
            return None, None, None, steps
    final = [(emitted + MORSE_INVERSE[current], score + logp_q16(MORSE_INVERSE[current], emitted) + gamma_q, seg)
             for emitted, current, score, seg in beam if current in MORSE_INVERSE]
    if not final:
        return None, None, None, steps
    best = max(final, key=lambda s: s[1])
    return best[0].strip(), list(best[2]), int(best[1]), steps


# ---- scoring (evaluation.metrics.cer_wer, copied: that module imports scipy) ----
def levenshtein(a, b):
    n, m = len(a), len(b)
    if n == 0:
        return m
    if m == 0:
        return n
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        ai = a[i - 1]
        for j in range(1, m + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if ai == b[j - 1] else 1))
        prev = cur
    return prev[m]


def cer_wer(truth, decoded):
    true_s = " ".join(truth.split())
    dec_s = " ".join(decoded.split()) if decoded else ""
    tw, dw = true_s.split(" "), (dec_s.split(" ") if dec_s else [])
    return levenshtein(true_s, dec_s), len(true_s), levenshtein(tw, dw), len(tw)


# ---- the call ----
def fists():
    return [dict(OPERATORS[name], number=n) for n, name in sorted(CONSOLE_FIST.items())]


def count_marks(text):
    """Marks the encoder sends for text: one per dot or dash. The front end's frame holds at most
    frames.N_MARKS_MAX of them; the page counts the same way before it calls run."""
    return sum(len(MORSE_TABLE[c]) for c in encoder_ref.clean_text(text) if c != " ")


def meta():
    """What the page needs once, at load: the fists, the fitted decoder weights, and the mark cap."""
    return dict(fists=fists(), fits=fits(), morse=dict(MORSE_TABLE), n_marks_max=frames.N_MARKS_MAX)


def gap_labels(lidx, widx, i0, i1):
    """True class of each gap between marks i0..i1: 0 intra-letter, 1 inter-letter, 2 inter-word."""
    return [0 if lidx[j + 1] == lidx[j] else (2 if widx[j + 1] != widx[j] else 1) for j in range(i0, i1)]


def run(text, fist="cootie_corrected", seed=1, segmenter="lif", weights="eng", T=None, gamma=None, gap=None):
    """Run text through the chain. gap selects the gap whose network internals are traced
    (default: the first misclassified gap, else the first)."""
    t_start = time.perf_counter()
    op = OPERATORS[fist]
    params = (op["wpm"], op["r"], op["sigma_elem"], op["sigma_gap"], op["omega"])
    ticks, chans, lidx, widx, words = encoder_ref.render(text, *params, seed)
    ideal, _, _, _, _ = encoder_ref.render(text, op["wpm"], op["r"], 0.0, 0.0, 0.0, seed)
    out = dict(fist=fist, fist_params=op, seed=seed, segmenter=segmenter,
               nominal_tu_us=round(1.2e6 / op["wpm"]), ideal_ticks_us=ideal,
               letter_of_mark=lidx, word_of_mark=widx, morse=dict(MORSE_TABLE))
    if not ticks:
        return dict(out, error="no characters to send")
    wave = encoder_ref.waveform(ticks, chans)
    rise, fall = (np.array([w[k] for w in wave], dtype=np.int64) for k in range(2))
    (i0, i1), *_ = front_end.split_transmissions(rise, fall)[0]
    labels = gap_labels(lidx, widx, i0, i1)
    truth = " ".join(words[widx[i0]:widx[i1] + 1])
    t0 = time.perf_counter()
    c = compose(text, FIST_NUMBER[fist], seed, producer(segmenter, labels))
    t_chain = time.perf_counter() - t0
    out.update(c, text_clean=encoder_ref.clean_text(text), first_mark=i0, last_mark=i1, truth=truth, labels=labels)
    if c["overflow"]:
        return dict(out, error=f"transmission longer than the front end's {frames.N_MARKS_MAX}-mark frame")

    w = decoder_weights(segmenter, weights, T, gamma)
    T_q, gamma_q = _q(w["T"]), _q(w["gamma"])
    lp3 = c["lp3_q16"]
    lp3_s = q16.scale_lp3(lp3, T_q)
    m_ch = [m[1] for m in c["marks"]]
    channels = ["." if b == 0 else "-" for b in m_ch]
    t0 = time.perf_counter()
    dec, seg, score, steps = decode_traced(channels, lp3_s, gamma_q)
    t_decode = time.perf_counter() - t0

    pred = [int(np.argmax(r)) for r in lp3]
    errs = [i for i, (p, l) in enumerate(zip(pred, labels)) if p != l]
    ce, nc, we, nw = cer_wer(truth, dec)
    seg_sum = sum(lp3_s[i][k] for i, k in enumerate(seg)) if seg else None
    n_letters = len(dec.replace(" ", "")) if dec else 0
    out.update(weights=w, lp3_scaled_q16=lp3_s, decoded_text=dec, seg=seg, final_score_q16=score,
               beam_died=dec is None, beam=steps,
               score_parts=None if score is None else dict(segmenter=seg_sum, gamma=n_letters * gamma_q,
                                                           lm=score - seg_sum - n_letters * gamma_q),
               argmax=pred, gap_errors=errs, gap_accuracy=1 - len(errs) / max(len(labels), 1),
               seg_errors=[i for i, (s, l) in enumerate(zip(seg or [], labels)) if s != l],
               cer=ce / max(nc, 1), wer=we / max(nw, 1), edits=dict(char=ce, chars=nc, word=we, words=nw),
               decoded_deployed=c["decoded_text"])

    tg = gap if gap is not None else (errs[0] if errs else 0)
    ticks_c, tu = [m[0] for m in c["marks"]], c["tu_us"]
    out["interval_tu"] = (np.diff(ticks_c) / tu).round(4).tolist()
    if segmenter in WINDOW_NETS:
        fnet = net(segmenter)
        feat_q = fnet.features_q(ticks_c, m_ch, tu)
        out["features"] = dict(kind="window", W=fnet.W, standardized=(feat_q / ONE).round(3).tolist())
        tr = trace_mlp(fnet, feat_q, tg) if segmenter == "mlp" else trace_lif(fnet, feat_q, tg)
        out["trace"] = dict(tr, gap=tg, kind=segmenter)
    elif segmenter == "bigru":
        feats = bigru.features_q(ticks_c, m_ch, tu)
        out["features"] = dict(kind="gap9", rows=(feats / ONE).round(4).tolist(),
                               names=[f"isi_pop{k}" for k in range(6)] + ["ch_next", "sig_dur", "sig_chan"])
        out["trace"] = dict(trace_bigru(net("bigru"), feats), kind="bigru")
    out["timing_ms"] = dict(chain=round(1e3 * t_chain, 1), decode=round(1e3 * t_decode, 1),
                            total=round(1e3 * (time.perf_counter() - t_start), 1))
    return out


def run_json(*args, **kw):
    return json.dumps(run(*args, **kw), default=lambda o: o.item() if hasattr(o, "item") else list(o))
