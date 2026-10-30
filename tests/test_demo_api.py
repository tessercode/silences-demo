"""The bridge reproduces the release's chain and only observes it."""
import json

import numpy as np
import pytest

import demo_api as d
from silences import FIRMWARE, RECORDS
from silences.decoder.beam import decode
from silences.evaluation import metrics
from silences.fixedpoint import q16
from silences.morse import MORSE_TABLE
from silences.pipeline import CONSOLE_FIST

GOLDEN = FIRMWARE / "golden"
CHAINS = dict(lif="chain_lif.json", mlp="chain_mlp.json", bigru="chain_bigru_n5.json")


def _golden_decode(g):
    e = g["expected_decode"]
    if isinstance(e, dict):
        return e["text"], e["seg"], e["final_score_q16"]
    return e, g["expected_seg"], g["expected_score"]


@pytest.mark.parametrize("segmenter", CHAINS)
def test_chain_goldens(segmenter):
    """At the deployed decoder weights the bridge decodes every chain golden as the firmware does."""
    vectors = [g for g in json.loads((GOLDEN / CHAINS[segmenter]).read_text())["vectors"] if not g.get("overflow")]
    assert vectors
    for g in vectors:
        o = d.run(g["text"], CONSOLE_FIST[int(g["fist"])], int(g["seed"]), segmenter, "deployed")
        assert o["tu_us"] == g["tu_us"] and o["lp3_q16"] == g["lp3_q16"], g["vid"]
        assert (o["decoded_text"], o["seg"], o["final_score_q16"]) == _golden_decode(g), g["vid"]
        assert o["decoded_deployed"] == o["decoded_text"]


def _sentences(n, seed=0):
    rng = np.random.default_rng(seed)
    letters = sorted(MORSE_TABLE)
    return [" ".join("".join(rng.choice(letters, rng.integers(2, 7))) for _ in range(rng.integers(1, 9)))
            for _ in range(n)]


@pytest.mark.parametrize("segmenter", d.SEGMENTERS)
def test_decode_traced_is_decode(segmenter):
    """The traced beam returns what beam.decode returns, at every weight setting."""
    for i, text in enumerate(_sentences(100, seed=1)):
        weights = ("eng", "rand", "deployed")[i % 3]
        o = d.run(text, d.fists()[i % 5]["name"], i, segmenter, weights)
        if o.get("error"):
            continue
        channels = ["." if m[1] == 0 else "-" for m in o["marks"]]
        lp3_s = q16.scale_lp3(o["lp3_q16"], d._q(o["weights"]["T"]))
        assert lp3_s == o["lp3_scaled_q16"]
        expect = decode(channels, lp3_s, d._q(o["weights"]["gamma"]))
        assert (o["decoded_text"], o["seg"], o["final_score_q16"]) == expect, text


@pytest.mark.parametrize("segmenter", ("lif", "mlp"))
def test_network_traces_are_the_network(segmenter):
    """The traced forward pass of a gap gives the same logits as FixedWindowNet.logits."""
    fnet = d.net(segmenter)
    trace = d.trace_lif if segmenter == "lif" else d.trace_mlp
    for i, text in enumerate(_sentences(10, seed=2)):
        o = d.run(text, "cootie_corrected", i, segmenter, "deployed")
        if o.get("error"):
            continue
        ticks, ch = [m[0] for m in o["marks"]], [m[1] for m in o["marks"]]
        feat_q = fnet.features_q(ticks, ch, o["tu_us"])
        logits = fnet.logits(feat_q)
        for g in range(len(feat_q)):
            assert trace(fnet, feat_q, g)["logits_q"] == logits[g].tolist()


def test_cer_wer_is_the_records():
    for text in _sentences(50, seed=3):
        o = d.run(text, "cootie_high_jitter", 7, "lif", "eng")
        if not o.get("error"):
            assert d.cer_wer(o["truth"], o["decoded_text"]) == metrics.cer_wer(o["truth"], o["decoded_text"])


def test_fits_come_from_the_record():
    fit = json.loads((RECORDS / "decoder_weights" / "fit.json").read_text())["fits"]
    got = d.extract_fits(RECORDS / "decoder_weights" / "fit.json")
    for text in ("eng", "rand"):
        for seg, row in d.FIT_ROWS.items():
            assert (got[text][seg]["T"], got[text][seg]["gamma"]) == (fit[text][row]["T"], fit[text][row]["beta"])


def test_labels_and_truth():
    o = d.run("HI EM", "fast_normalr", 3, "oracle", "deployed")
    # H=.... I=.. E=. M=--: three intra, inter, intra, word, inter, intra
    assert o["labels"] == [0, 0, 0, 1, 0, 2, 1, 0]
    assert o["truth"] == "HI EM" and o["gap_accuracy"] == 1.0


def _text_of_marks(n):
    """Pangram text cut at the last letter that keeps it within n marks."""
    base, out = "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG ", ""
    for c in base * 20:
        if c != " " and d.count_marks(out + c) > n:
            break
        out += c
    return out.strip()


def test_count_marks_is_the_encoder():
    for text in ["HI EM", "cq cq de w1aw k", "Ünïcode, 73!  ok", _text_of_marks(256)]:
        op = d.OPERATORS["fast_normalr"]
        ticks = d.encoder_ref.render(text, op["wpm"], op["r"], 0.0, 0.0, 0.0, 1)[0]
        assert d.count_marks(text) == len(ticks)


@pytest.mark.parametrize("fist", sorted(d.OPERATORS))
def test_the_page_cap_never_overflows(fist):
    """Text the page accepts (at most N_MARKS_MAX marks) decodes as one transmission on every fist."""
    text = _text_of_marks(d.frames.N_MARKS_MAX)
    assert d.count_marks(text) > d.frames.N_MARKS_MAX - 5
    for seg in d.SEGMENTERS:
        o = d.run(text, fist, 1, seg)
        assert "error" not in o and o["n_captures"] == 1 and o["last_mark"] + 1 == d.count_marks(text)
    over = text + " " + "E" * (d.frames.N_MARKS_MAX + 1 - d.count_marks(text))
    assert "error" in d.run(over, fist, 1, "lif")
