#!/usr/bin/env bash
# Build the site and serve it to the local network: tools/serve.sh [port] [host]
# Everything is served from this machine (Pyodide and numpy included); browsers need no internet.
# The first run also creates .venv (numpy, to build the model bundle) and installs node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${1:-8080}
HOST=${2:-0.0.0.0}

git submodule update --init --quiet
[ -d node_modules ] || npm ci --no-audit --no-fund
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install --quiet numpy==2.4.4      # the release's pin (vendor/silences/requirements.txt)
fi
.venv/bin/python tools/build_bundle.py
node tools/vendor_pyodide.mjs
npx vite build --logLevel warn
echo "Serving on http://${HOST}:${PORT}/ ($(git describe --always --dirty), silences $(git -C vendor/silences describe --always))"
exec npx vite preview --host "$HOST" --port "$PORT" --strictPort
