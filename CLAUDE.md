# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Electron in dev mode (electron-vite, HMR for renderer)
npm run build     # Type-check + build main/preload/renderer to out/
npm run dist      # Build + package Windows installer (NSIS) into dist/
npm run rebuild   # Rebuild better-sqlite3 native bindings against current Electron
```

No test runner configured. `postinstall` runs `electron-builder install-app-deps` to fix native modules. If `better-sqlite3` fails at runtime, run `npm run rebuild`.

The Python sidecar (`resources/python-sidecar/`) must be built separately once docling is installed — it handles PDF/DOCX/XLSX text extraction and embedding generation. Until it is built, `LibraryService.ingest()` will fail gracefully but library indexing won't work.

## Architecture

CortX is an Electron desktop app: an AI agent that reads natural-language input and proposes structured edits to a local Markdown knowledge base, with automatic Git versioning. The user reviews proposals and accepts/rejects them — the agent never writes files autonomously.

### Process layout

- **`src/main/`** — Node.js main process. Owns all filesystem, SQLite, Git, LLM, and library access.
- **`src/preload/index.ts`** — `contextBridge` exposes `window.cortx.{app, db, files, llm, git, agent, library, idle}` to the renderer. All renderer→main communication goes through `ipcRenderer.invoke`.
- **`src/renderer/`** — React 18 + Tailwind UI. Three resizable panels (chat / center graph+tags+files+library / agent activity) via `react-resizable-panels`. State in Zustand stores under `renderer/stores/`.
- **`src/shared/types.ts`** — Types shared across processes. Source of truth for `AgentAction`, `AgentResponse`, `CortxAPI`, etc.
- **`src/renderer/i18n/`** — Full French/English translation system. `useT()` hook reads language from `uiStore`; language persists to localStorage.

### The agent pipeline (`src/main/services/AgentPipeline.ts`)

Core of the product. **Propose-then-execute** architecture — do not collapse into single auto-execute.

1. **`process(input)`** — retrieves KB context via `DatabaseService.search()` + library context via `retrieveLibraryContext()`, builds a system prompt with `promptBuilder`, calls LLM, parses JSON response (strict → code block → regex fallbacks), normalizes actions, returns them with `status: 'proposed'`. **No files written.**
2. **`preview(action)`** — returns `{ before, after }` for proposal modal. Computes modified content via `computeModifiedContent` without touching disk.
3. **`execute(actions, summary)`** — only called after user clicks Accept. Writes files, runs `gitService.commitAll()`, re-indexes everything, logs to `agent_log` table.
4. **`undo(commitHash)`** — `git revert` + reindex.
5. **`rewriteFile(filePath)`** — asks LLM to reorganize file structure without losing content/wikilinks. Commits as `"Rewrite: {filePath}"`, reindexes. Returns commit hash for undo.
6. **`saveManualEdit(filePath, content)`** — saves user edits from the preview panel. Commits, reindexes, logs to `agent_log`. Returns commit hash.
7. **`deleteFile(filePath)`** — deletes KB file from disk + DB (entities, relations, FTS). Refuses `_System/*`. Commits, reindexes.
8. **`saveBrief(subject, body, kind?)`** — archives a brief/insight to `Fiches/YYYY-MM-DD_HH-MM_slug.md` with frontmatter. Sanitizes LLM output (strips leading frontmatter, duplicate H1, code fences).
9. **`listFiches()`** — returns sorted list of `Fiches/` files with metadata (subject, kind, created, excerpt).
10. **`deleteFiche(filePath)`** — deletes from `Fiches/` only.

### Multi-hop context expansion

`AgentPipeline.expandMultiHop(contextFiles, libraryChunks)` runs a second-pass after initial retrieval: extracts KB wikilinks + library chunk references from the primary results, then pulls those additional files/chunks into the context window. Agent sees a coherent cross-file picture without hallucinating links.

### File modification rules

`computeModifiedContent` / `smartMerge` logic is deliberately conservative — LLMs frequently send partial content that overwrites entire files. Rules:

- Full replace happens **only** if `operation: "replace"` is explicitly set.
- `operation: "replace_line"` requires `old_content` and does a string replace.
- A `section` field targets a specific Markdown heading; default operation is `append`.
- With **no section and no operation**, `smartMerge()` parses headings out of new content and appends each block under matching existing headings, or appends the whole block at the end. Dedupes against existing content.
- Frontmatter is only re-stringified when the original file had frontmatter (avoids gray-matter inserting empty `---\n---\n`).

### `normalizeActions` is a compatibility shim

Different LLMs (Claude, llama.cpp, Ollama, LM Studio) return varying field names. `normalizeActions` accepts `file | path | filename | filepath`, `action | type`, and French verbs (`créer`, `modifier`). Auto-routes files into directories (`Reseau/`, `Entreprises/`, `Domaines/`, `Projets/`, `Journal/`) based on the `type:` field in frontmatter when the LLM omits a directory.

### Storage layout

User data lives outside the repo, in a configurable base path (default `~/Documents/CortX-Base/`):

```
CortX-Base/
├── Reseau/                 # personne entities
├── Entreprises/            # entreprise entities
├── Domaines/               # domaine entities
├── Projets/                # projet entities
├── Journal/                # journal entries
├── Fiches/                 # auto-generated briefs (saveBrief / idle insight archival)
├── Bibliotheque/           # imported library docs (PDF, DOCX, XLSX, PPTX…) — git-ignored
├── _Templates/             # user templates (not enforced by agent)
├── _System/
│   ├── cortx.db            # SQLite (FTS5, entities, relations, library, agent_log)
│   ├── cortx.db-wal/shm    # WAL files — git-ignored
│   ├── idle-insights.json  # persisted IdleService insights
│   └── library-cache/      # extracted text + embeddings cache — git-ignored
└── .git/                   # auto-commits per accepted action
```

Config (base path, LLM provider, API key, model, validation mode) persists to `app.getPath('userData')/cortx-config.json`. The `app:setConfig` IPC handler preserves masked API keys (`'***'`) so the renderer can hide secrets without losing them on save.

### LLM provider abstraction (`LLMService`)

Two providers behind one interface:
- `anthropic` — uses `@anthropic-ai/sdk`, **requires API key**.
- `openai-compatible` — plain `fetch` against any OpenAI-style `/v1/chat/completions` endpoint (llama.cpp, Ollama, LM Studio). **No API key required** — do not add a key check for this provider.

Both support streaming via `onDelta` callback.

### Library system (`LibraryService` + `PythonSidecar`)

Library is a separate subsystem for importing non-Markdown documents alongside the KB.

- **Supported formats:** PDF, DOCX, XLSX, PPTX, HTML, TXT, MD
- **Storage:** `Bibliotheque/` dir; chunks + embeddings in SQLite library tables
- **Indexing flow:** `LibraryService.ingest()` → `PythonSidecar.request()` (docling extracts text; generates e5-small 384-dim embeddings) → chunks (500-word max) stored with FTS5 + embeddings
- **Search modes:** `'lexical'` (FTS5), `'semantic'` (cosine on embeddings), `'hybrid'` (both)
- **Auto-linking:** when a KB file contains `[[DocTitle]]` that matches a library doc title/filename, a `file_library_links` row is created. Reverse: library docs mention KB entity names → `library_links` rows. Both appear as edges in the graph.
- **Python sidecar (`PythonSidecar.ts`):** spawned lazily, newline-delimited JSON protocol on stdin/stdout. 10-minute timeout for first docling model load. `isAvailable()` guards all ingest paths.

### Idle service (`IdleService`)

Background exploration loop that generates insights from the graph:

- Phases cycle: `selecting` → `examining` → `thinking` → `insight` → `resting`
- Explores graph neighbors, detects missing relations, generates textual insights via LLM
- Insights displayed in `InsightPanel`; can be archived to `Fiches/` via `saveBrief(kind='idle-insight')`
- Persists to `_System/idle-insights.json`
- IPC: `idle:start`, `idle:stop`, `idle:getInsights`, `idle:dismissInsight`, `idle:saveInsightAsFiche`, `idle:getConfig`, `idle:setConfig`
- Active phase + explored nodes/edges mirrored in `idleStore` for graph highlighting

### Indexing

`DatabaseService` uses better-sqlite3 with FTS5. After any file write or accepted action, `AgentPipeline.reindexAll()` re-walks the base path. Entity types `personne | entreprise | domaine | projet | note | journal | fiche` are indexed; wikilinks `[[Name]]` are parsed into the `relations` table (19 inferred relation types). The graph (`getGraphData()`) merges KB entity nodes + library document nodes into one dataset.

**All DB tables:**
1. `files` — path, type, title, tags, content_hash, timestamps
2. `entities` — id, name, type, file_path, aliases
3. `relations` — source/target entity IDs, relation_type, source_file
4. `files_fts` — FTS5 virtual table (path, title, content)
5. `kb_embeddings` — file_path, vector BLOB, embedded_at
6. `library_documents` — id, path, filename, mime_type, hash_sha256, title, author, page_count, summary, tags, status
7. `library_chunks` — id, document_id, chunk_index, page range, heading, text
8. `library_chunks_fts` — FTS5 virtual table (text, heading)
9. `library_embeddings` — chunk_id → vector BLOB
10. `library_links` — document_id ↔ entity_id (auto-detected mentions)
11. `file_library_links` — file_path ↔ document_id (from `[[wikilinks]]`)
12. `agent_log` — timestamp, input_text, actions_json, commit_hash, status

### Title resolution and wikilink rename

**Graph node label** uses this priority chain (same in `DatabaseService.indexEntitiesFromFile` and `FileService.getEffectiveTitle`):
1. `frontmatter.title`
2. First H1 heading (`# Heading`)
3. Filename without `.md`

**`files:updateTitle` IPC** (triggered from file preview header):
1. Reads old effective title via `FileService.getEffectiveTitle()`
2. Updates frontmatter + H1 in the target file
3. Calls `FileService.updateWikilinksForRename(oldTitle, newTitle)` — case-insensitive regex replace of `[[oldTitle]]` → `[[newTitle]]` across all KB files
4. Reindexes target file + all modified files
5. Returns `{ updatedLinks: number }` — renderer shows count in toast

**Visual indicators in `FilePreview`:**
- **Preview mode:** frontmatter badge section shows `⬡ <effective title>` — indicates which element (frontmatter / H1 / filename) is driving the graph node label
- **Edit mode:** live info bar above the textarea parses the draft and shows current effective title + source
- **`MarkdownRenderer`:** when `graphTitleSource === 'h1'`, the first H1 gets a small `graphe` badge so the user knows that heading controls the graph node label

### Renderer state flow

```
ChatInput → chatStore.sendMessage()
  → window.cortx.agent.process()           # proposals only
  → message stored with proposed actions
User clicks Accept on a message
  → chatStore.acceptActions(messageId)
  → window.cortx.agent.execute()           # actual writes + commit
  → statuses flip to 'validated'
  → graphStore.loadGraph() + fileStore reload

User edits file in FilePreview
  → textarea draft → Ctrl+S / Save button
  → window.cortx.agent.saveManualEdit()    # commit + reindex
  → reload graph + files

User renames title in FilePreview header
  → window.cortx.files.updateTitle()       # updates file + all wikilinks
  → reload graph + files
  → toast shows "X links updated"
```

The graph (Cytoscape + cose-bilkent) and tag browser **poll every 5s** rather than relying on event push — needed because IPC-driven invalidation missed cases where files were created outside a normal accept flow.

### Zustand stores (`src/renderer/stores/`)

| Store | Key state |
|-------|-----------|
| `uiStore` | `activeCenterView` (graph\|tags\|files\|library), theme, language, toasts, filePreviewPath, settings open/close |
| `chatStore` | messages, isProcessing, streamProgress, stream buffer |
| `fileStore` | files list, selectedFile |
| `graphStore` | nodes, edges, filterTypes, selectedNodeId |
| `agentStore` | proposed actions, suggestions, conflicts |
| `libraryStore` | documents, selectedDocId, preview, searchResults, ingestQueue, status |
| `ficheStore` | fiches list from `Fiches/` |
| `idleStore` | isActive, phase, activeNodeIds, activeEdgeKeys, insights, draftCount |

## Reference docs in repo

- **`README.md`** — Full product vision, positioning, roadmap. Read for *why* decisions were made (local-first, propose-then-execute, Markdown).
- **`CortX_Agent_Prompt_V1.md`** and **`prompts/`** — Agent system prompt template. `promptBuilder.ts` injects DB state into it.
