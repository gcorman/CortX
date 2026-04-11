# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Electron in dev mode (electron-vite, HMR for renderer)
npm run build     # Type-check + build main/preload/renderer to out/
npm run dist      # Build + package Windows installer (NSIS) into dist/
npm run rebuild   # Rebuild better-sqlite3 native bindings against current Electron
```

There is no test runner configured. After installing dependencies, `postinstall` runs `electron-builder install-app-deps` to fix native modules. If `better-sqlite3` fails to load at runtime, run `npm run rebuild`.

## Architecture

CortX is an Electron desktop app: an AI agent that reads natural-language input and proposes structured edits to a local Markdown knowledge base, with automatic Git versioning. The user reviews proposals and accepts/rejects them — the agent never writes files autonomously.

### Process layout

- **`src/main/`** — Node.js main process. Owns all filesystem, SQLite, Git, and LLM access.
- **`src/preload/index.ts`** — `contextBridge` exposes `window.cortx.{app, db, files, llm, git, agent}` to the renderer. All renderer→main communication goes through `ipcRenderer.invoke`.
- **`src/renderer/`** — React 18 + Tailwind UI. Three resizable panels (chat / center graph+tags+file / agent activity) via `react-resizable-panels`. State in Zustand stores under `renderer/stores/`.
- **`src/shared/types.ts`** — Types shared across processes. Source of truth for `AgentAction`, `AgentResponse`, `CortxAPI`, etc.

### The agent pipeline (`src/main/services/AgentPipeline.ts`)

This is the core of the product. It is a **propose-then-execute** architecture — splitting it back into a single auto-execute call would break the UX contract.

1. **`process(input)`** — retrieves context via `DatabaseService.search()`, builds a system prompt with `promptBuilder`, calls the LLM, parses the JSON response (with multi-layered fallbacks: strict → code block → regex extraction), normalizes actions, and returns them with `status: 'proposed'`. **No files are written.**
2. **`preview(action)`** — returns `{ before, after }` for the proposal modal. Computes the modified content via `computeModifiedContent` without touching disk.
3. **`execute(actions, summary)`** — only called after user clicks Accept. Writes files, runs `gitService.commitAll()`, re-indexes everything, logs to `agent_log` table.
4. **`undo(commitHash)`** — `git revert` + reindex.

### File modification rules

The `computeModifiedContent` / `smartMerge` logic is deliberately conservative — LLMs frequently send partial content that previously **overwrote entire files**. Rules:

- A full replace happens **only** if `operation: "replace"` is explicitly set.
- `operation: "replace_line"` requires `old_content` and does a string replace.
- A `section` field targets a specific Markdown heading; default operation is `append`.
- With **no section and no operation**, `smartMerge()` parses headings out of the new content and appends each block under matching existing headings, or appends the whole block at the end. It also dedupes against existing content.
- Frontmatter is only re-stringified when the original file had frontmatter (avoids gray-matter inserting empty `---\n---\n`).

### `normalizeActions` is a compatibility shim

Different LLMs (Codex, llama.cpp, Ollama, LM Studio) return varying field names. `normalizeActions` accepts `file | path | filename | filepath`, `action | type`, and French verbs (`créer`, `modifier`). It also auto-routes files into directories (`Reseau/`, `Entreprises/`, `Domaines/`, `Projets/`, `Journal/`) based on the `type:` field detected in frontmatter when the LLM omits a directory.

### Storage layout

User data lives outside the repo, in a configurable base path (default `~/Documents/CortX-Base/`):

```
CortX-Base/
├── Reseau/, Entreprises/, Domaines/, Projets/, Journal/   # Markdown files
├── _System/cortx.db                                       # SQLite (FTS5 index, entities, relations, agent_log)
└── .git/                                                  # Auto-commits per accepted action
```

Config (base path, LLM provider, API key, model, validation mode) persists to `app.getPath('userData')/cortx-config.json`. The `app:setConfig` IPC handler preserves masked API keys (`'***'`) so the renderer can hide secrets without losing them on save.

### LLM provider abstraction (`LLMService`)

Two providers behind one interface:
- `anthropic` — uses `@anthropic-ai/sdk`, **requires API key**.
- `openai-compatible` — plain `fetch` against any OpenAI-style `/v1/chat/completions` endpoint (llama.cpp, Ollama, LM Studio). **No API key required** — do not add a key check for this provider.

### Indexing

`DatabaseService` uses better-sqlite3 with FTS5. After any file write or accepted action, `AgentPipeline.reindexAll()` re-walks the base path. Entity types `personne | entreprise | domaine | projet | note | journal` are indexed; wikilinks `[[Name]]` are parsed into the `relations` table for the graph view.

### Renderer state flow

```
ChatInput → chatStore.sendMessage()
  → window.cortx.agent.process()         # proposals only
  → message stored with proposed actions
User clicks Accept on a message
  → chatStore.acceptActions(messageId)
  → window.cortx.agent.execute()         # actual writes + commit
  → statuses flip to 'validated'
  → graphStore.loadGraph() + fileStore reload
```

The graph (Cytoscape + cose-bilkent) and tag browser **poll every 5s** rather than relying on event push — this was needed because IPC-driven invalidation missed cases where the agent created files outside a normal accept flow.

## Reference docs in repo

- **`README.md`** — Full product vision, positioning, roadmap. Read this for *why* decisions were made (e.g. why local-first, why propose-then-execute, why Markdown).
- **`CortX_Agent_Prompt_V1.md`** and **`prompts/`** — The agent system prompt template. `promptBuilder.ts` injects DB state into it.