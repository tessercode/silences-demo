"""Pack what the browser needs into public/silences_bundle.tar: the silences package, the committed
models, the char-LM table, the operator table, the decoder-weight fits and the bridge.

Paths inside the tar mirror the release repo, so silences.ROOT resolves unchanged once it is
unpacked in Pyodide's filesystem."""
import io
import json
import sys
import tarfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REL = REPO / "vendor" / "silences"
sys.path[:0] = [str(REPO / "py"), str(REL)]

import demo_api  # noqa: E402

FILES = ["models/lif/committed.pkl", "models/mlp/committed.pkl", "models/bigru/pool_q16.npz",
         "models/charlm_mix_q16.bin", "firmware/encoder/fists.h", "LICENSE"]


def main(out=REPO / "public" / "silences_bundle.tar"):
    out.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(out, "w") as tar:
        for p in sorted((REL / "silences").rglob("*.py")):
            tar.add(p, arcname=str(p.relative_to(REL)))
        for f in FILES:
            tar.add(REL / f, arcname=f)
        tar.add(REPO / "py" / "demo_api.py", arcname="demo_api.py")
        fits = json.dumps(demo_api.extract_fits(REL / "records" / "decoder_weights" / "fit.json"), indent=1).encode()
        info = tarfile.TarInfo("demo_fits.json")
        info.size = len(fits)
        tar.addfile(info, io.BytesIO(fits))
    print(f"{out.relative_to(REPO)}: {out.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
