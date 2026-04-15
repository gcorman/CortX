# Contributing to CortX

Thanks for your interest. CortX is an Electron + React desktop app built around a **propose-then-execute** AI agent. Before diving in, read `CLAUDE.md` — it is the authoritative technical reference for architecture, data flow, and coding rules.

---

## Quick start

### Prerequisites

- Node.js ≥ 18
- Python 3.10+ (only needed if you want to work on library ingestion / the sidecar)
- Windows (primary target), macOS and Linux are untested but the Electron stack is cross-platform

### Install & run

```bash
git clone https://github.com/<your-fork>/CortX.git
cd CortX
npm install        # also runs electron-builder install-app-deps (native modules)
npm run dev        # Electron + Vite HMR
```

If `better-sqlite3` crashes at startup:

```bash
npm run rebuild    # recompiles native bindings against current Electron version
```

### Build

```bash
npm run build      # type-check + compile to out/
npm run dist       # package Windows installer into dist/
```

---

## Project layout

```
src/
  main/          Node.js main process (filesystem, SQLite, Git, LLM, IPC)
  preload/       contextBridge — exposes window.cortx.* to renderer
  renderer/      React 18 + Tailwind (components, stores, i18n)
  shared/        Types and constants shared across processes
    types.ts     Source of truth for all interfaces
    constants.ts KB directory names and mappings — edit here, nowhere else
resources/
  python-sidecar/  PDF/DOCX/XLSX extraction + embedding generation (docling)
```

The two most important files before you change anything: `src/shared/types.ts` and `src/main/services/AgentPipeline.ts`.

---

## Ground rules

### Never auto-execute agent actions

The agent pipeline is **propose-then-execute** by design. `AgentPipeline.process()` must only return proposals — no file writes. Writes happen exclusively in `execute()` after the user clicks Accept. Do not collapse this into a single step.

### Directory names live in one place

All KB directory names (`Reseau`, `Entreprises`, etc.) and their mappings are in `src/shared/constants.ts`. Import from there. Never hard-code a directory string elsewhere.

### LLM providers

- `anthropic` provider uses `@anthropic-ai/sdk`.
- `openai-compatible` uses plain `fetch` and **must not** require an API key — it covers llama.cpp, Ollama, and LM Studio.
- Both must support the `onDelta` streaming callback.

### i18n

All user-facing strings go through the `useT()` hook. Add keys to both `fr` and `en` in `src/renderer/i18n/translations.ts`.

### DB schema changes

Add migrations inside `DatabaseService.ts` using `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` patterns. Never drop tables or columns.

---

## Coding conventions

- TypeScript strict mode. No `any` except at SQLite row boundaries (cast explicitly).
- Renderer state lives in Zustand stores (`src/renderer/stores/`). No prop drilling past two levels.
- IPC handlers go in `src/main/ipc/`. Bridge declarations go in `src/preload/index.ts` and the `CortxAPI` interface in `src/shared/types.ts`.
- No test runner is configured yet. If you add tests, add a `test` script to `package.json` and document the runner here.

---

## Submitting changes

1. Fork, create a branch: `git checkout -b feat/my-thing`
2. Keep commits focused — one logical change per commit.
3. Open a PR against `main`. Describe *what* changed and *why*; reference any related issue.
4. If your change touches the agent pipeline, the DB schema, or IPC surface, note it explicitly — those are the highest-risk areas.

---

## Python sidecar (optional)

The sidecar handles PDF/DOCX/XLSX extraction and embedding generation. It is not required for core agent/KB work.

```bash
cd resources/python-sidecar
pip install -r requirements.txt   # installs docling and e5-small dependencies
python build.py                   # packages sidecar binary
```

Until built, `LibraryService.ingest()` fails gracefully — the rest of the app works normally.

---

## Reporting issues

Use [GitHub Issues](../../issues). Include:
- OS and Electron version (`Help → About` in the app)
- LLM provider and model
- Steps to reproduce
- Whether the issue is in the main process (check DevTools → Console + the terminal running `npm run dev`) or the renderer
