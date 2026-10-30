"""Write tools/parity_expected.json: the bridge's results in CPython for a fixed set of cases, which
tools/pyodide_parity.mjs re-runs in Pyodide and compares field by field."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(REPO / "py"), str(REPO / "vendor" / "silences")]

import demo_api as d  # noqa: E402
from silences.morse import MORSE_TABLE  # noqa: E402

FIELDS = ("tu_us", "decoded_text", "seg", "final_score_q16", "cer", "wer", "gap_accuracy")


def digest(o):
    """The fields compared, plus hashes of the posteriors, the beam and the trace."""
    h = lambda x: hashlib.sha256(json.dumps(x).encode()).hexdigest()[:16]   # noqa: E731
    return dict({k: o.get(k) for k in FIELDS}, lp3=h(o.get("lp3_q16")), beam=h(o.get("beam")),
                trace=h(o.get("trace")), error=o.get("error"))


def cases(n=100):
    rng = np.random.default_rng(2026)
    letters, fists = sorted(MORSE_TABLE), [f["name"] for f in d.fists()]
    out = []
    for i in range(n):
        text = " ".join("".join(rng.choice(letters, rng.integers(2, 7))) for _ in range(rng.integers(1, 9)))
        out.append(dict(text=text, fist=fists[i % 5], seed=int(rng.integers(1, 10_000)),
                        segmenter=d.SEGMENTERS[i % 4], weights=("eng", "rand", "deployed")[i % 3]))
    return out


if __name__ == "__main__":
    res = [dict(case=c, expect=digest(d.run(**c))) for c in cases()]
    (REPO / "tools" / "parity_expected.json").write_text(json.dumps(res, indent=1))
    print(f"{len(res)} cases")
