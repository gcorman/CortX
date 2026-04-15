# CortX Python Sidecar

Persistent child process launched by the Electron main process. Handles:
- **Document extraction** — PDF, DOCX, XLSX, PPTX, HTML via [docling](https://github.com/DS4SD/docling)
- **Semantic embeddings** — `intfloat/multilingual-e5-small` (384 dimensions, French + English)

Communicates with the main process via newline-delimited JSON on stdin/stdout.  
See `cortx_extractor.py` for the full protocol.

**The sidecar is optional.** Without it, `LibraryService.ingest()` fails gracefully — all other KB and agent features work normally.

---

## Option A — Download pre-built binary (recommended)

Requires: Node.js 18+, Windows, internet access.

```bash
npm run setup-sidecar
```

This fetches `cortx-extractor-win32-x64.zip` from the latest GitHub Release and installs it to `resources/python-sidecar/`.

---

## Option B — Build from source

Requires: Python 3.10+, ~5 GB free disk space, internet access (first run only).

```powershell
cd python-sidecar
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
.\build.ps1
```

`build.ps1` runs PyInstaller, pre-downloads the embedding model, and copies the output to `resources/python-sidecar/`.

### macOS / Linux

The sidecar has not been tested on macOS or Linux yet. You can attempt a source build:

```bash
cd python-sidecar
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pyinstaller cortx-extractor.spec   # or run the equivalent pyinstaller flags from build.ps1
```

PRs adding a `build.sh` and CI support for non-Windows platforms are welcome.

---

## Protocol reference

```
IN  (one JSON line per request):
    {"id": "<uuid>", "cmd": "health"}
    {"id": "<uuid>", "cmd": "extract", "path": "<absolute path>", "options": {}}
    {"id": "<uuid>", "cmd": "embed", "texts": ["...", "..."]}
    {"id": "<uuid>", "cmd": "shutdown"}

OUT (one JSON line per response):
    {"id": "<uuid>", "ok": true,  "data": {...}}
    {"id": "<uuid>", "ok": false, "error": "<message>"}
```

All errors return `{"ok": false}` — the process never crashes on bad input.
