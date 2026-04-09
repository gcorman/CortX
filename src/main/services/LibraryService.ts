/**
 * LibraryService
 * ==============
 * Manages the document library (PDF, DOCX, XLSX, …) stored in
 * CortX-Base/Bibliotheque/.
 *
 * Responsibilities:
 *  - Import (copy + extract + chunk + embed + link)
 *  - CRUD on library_documents
 *  - Hybrid search (FTS5 lexical + cosine on stored embeddings)
 *  - Providing context chunks to AgentPipeline
 */

import * as path from 'path'
import * as fs from 'fs'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import { shell, BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'

import type { LibraryDocument, LibraryChunkResult, LibraryIngestProgress } from '../../shared/types'
import { pythonSidecar } from './PythonSidecar'

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const LIBRARY_DIR = 'Bibliotheque'
const CACHE_DIR = path.join('_System', 'library-cache')

/** Maximum words per chunk (fallback chunker). */
const CHUNK_MAX_WORDS = 500
/** Overlap words between adjacent chunks (fallback chunker). */
const CHUNK_OVERLAP_WORDS = 50
/** Embedding batch size for the sidecar. */
const EMBED_BATCH_SIZE = 32

// -------------------------------------------------------------------------
// LibraryService
// -------------------------------------------------------------------------

export class LibraryService {
  private db!: Database.Database
  private basePath!: string

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  initialize(db: Database.Database, basePath: string): void {
    this.db = db
    this.basePath = basePath
    fs.mkdirSync(this.libraryPath(), { recursive: true })
    fs.mkdirSync(this.cachePath(), { recursive: true })
  }

  // -----------------------------------------------------------------------
  // Paths
  // -----------------------------------------------------------------------

  libraryPath(): string {
    return path.join(this.basePath, LIBRARY_DIR)
  }

  cachePath(): string {
    return path.join(this.basePath, CACHE_DIR)
  }

  private absoluteDocPath(relativePath: string): string {
    return path.join(this.libraryPath(), relativePath)
  }

  private cacheFilePath(docId: string, ext: string): string {
    return path.join(this.cachePath(), `${docId}${ext}`)
  }

  // -----------------------------------------------------------------------
  // Import / Ingest
  // -----------------------------------------------------------------------

  /**
   * Import a single file into the library.
   * Progress events are emitted via `emitProgress`.
   */
  async ingest(
    absoluteSourcePath: string,
    emitProgress: (p: LibraryIngestProgress) => void,
    targetFolder = ''
  ): Promise<LibraryDocument> {
    const filename = path.basename(absoluteSourcePath)
    const relativeTarget = targetFolder
      ? path.join(targetFolder, filename)
      : filename
    const absoluteTarget = this.absoluteDocPath(relativeTarget)
    const id = randomUUID()

    emitProgress({ documentId: id, filename, stage: 'copying' })

    // 1. Copy file to Bibliotheque/
    fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true })
    fs.copyFileSync(absoluteSourcePath, absoluteTarget)

    // 2. Compute SHA-256 + size
    const hash = this._sha256(absoluteTarget)
    const size = fs.statSync(absoluteTarget).size
    const mimeType = guessMime(filename)

    // 3. Insert pending record
    this.db.prepare(`
      INSERT OR REPLACE INTO library_documents
        (id, path, filename, mime_type, size, hash_sha256, added_at, status)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `).run(id, relativeTarget, filename, mimeType, size, hash)

    const doc = this._toDoc(this.db.prepare('SELECT * FROM library_documents WHERE id = ?').get(id) as RawDoc)

    try {
      emitProgress({ documentId: id, filename, stage: 'extracting' })
      await this._extract(id, absoluteTarget, filename, emitProgress)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.db.prepare(`UPDATE library_documents SET status = 'error', error_message = ? WHERE id = ?`)
        .run(msg, id)
      emitProgress({ documentId: id, filename, stage: 'error', message: msg })
      return this._toDoc(this.db.prepare('SELECT * FROM library_documents WHERE id = ?').get(id) as RawDoc)
    }

    emitProgress({ documentId: id, filename, stage: 'done' })
    return this._toDoc(this.db.prepare('SELECT * FROM library_documents WHERE id = ?').get(id) as RawDoc)
  }

  async ingestMany(
    absolutePaths: string[],
    emitProgress: (p: LibraryIngestProgress) => void,
    targetFolder = ''
  ): Promise<LibraryDocument[]> {
    const results: LibraryDocument[] = []
    for (const p of absolutePaths) {
      results.push(await this.ingest(p, emitProgress, targetFolder))
    }
    return results
  }

  // -----------------------------------------------------------------------
  // Extraction pipeline
  // -----------------------------------------------------------------------

  private async _extract(
    id: string,
    absolutePath: string,
    filename: string,
    emitProgress: (p: LibraryIngestProgress) => void
  ): Promise<void> {
    const sidecarReady = await pythonSidecar.ensureReady()

    let markdown: string
    let metadata: { title?: string; author?: string; page_count?: number }
    let structure: Array<{ heading?: string; text: string; page_from?: number; page_to?: number }>

    if (sidecarReady) {
      // Use Docling for high-quality extraction
      const resp = await pythonSidecar.send({ cmd: 'extract', path: absolutePath })
      if (!resp.ok) throw new Error(resp.error ?? 'Extraction failed')

      markdown = resp.markdown as string
      metadata = (resp.metadata as typeof metadata) ?? {}
      structure = (resp.structure as typeof structure) ?? []
    } else {
      // Fallback: plain text read (only works for .md / .txt)
      const ext = path.extname(filename).toLowerCase()
      if (ext === '.md' || ext === '.txt') {
        markdown = fs.readFileSync(absolutePath, 'utf8')
        metadata = { title: path.basename(filename, ext) }
        structure = [{ text: markdown }]
      } else {
        throw new Error(
          'Sidecar Python non disponible — seuls les fichiers .md et .txt peuvent être importés sans lui.'
        )
      }
    }

    // Save extracted markdown to cache
    fs.writeFileSync(this.cacheFilePath(id, '.md'), markdown, 'utf8')

    // Update document metadata
    this.db.prepare(`
      UPDATE library_documents
      SET title = ?, author = ?, page_count = ?, status = 'extracting'
      WHERE id = ?
    `).run(metadata.title ?? null, metadata.author ?? null, metadata.page_count ?? null, id)

    // --- Chunking ---
    emitProgress({ documentId: id, filename, stage: 'chunking' })

    const chunks = this._buildChunks(structure, markdown)
    const insertChunk = this.db.prepare(`
      INSERT INTO library_chunks (document_id, chunk_index, page_from, page_to, heading, text)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    // Delete stale chunks first (re-ingest case).
    // For external-content FTS5, we must use the special 'delete' command
    // before removing the source rows — otherwise the FTS index corrupts.
    this._deleteChunksAndFts(id)

    const insertMany = this.db.transaction((chks: typeof chunks) => {
      for (const c of chks) {
        insertChunk.run(id, c.chunkIndex, c.pageFrom ?? null, c.pageTo ?? null, c.heading ?? null, c.text)
      }
    })
    insertMany(chunks)

    // Rebuild FTS for this document
    const rows = this.db.prepare('SELECT id, text, heading, document_id FROM library_chunks WHERE document_id = ?')
      .all(id) as Array<{ id: number; text: string; heading: string | null; document_id: string }>
    const insertFts = this.db.prepare(
      'INSERT INTO library_chunks_fts(rowid, text, heading, document_id) VALUES (?, ?, ?, ?)'
    )
    const ftsInsertMany = this.db.transaction(() => {
      for (const row of rows) {
        insertFts.run(row.id, row.text, row.heading ?? '', row.document_id)
      }
    })
    ftsInsertMany()

    // --- Embeddings ---
    if (sidecarReady) {
      emitProgress({ documentId: id, filename, stage: 'embedding' })
      await this._embedChunks(id, rows)
    }

    // --- Link detection ---
    emitProgress({ documentId: id, filename, stage: 'linking' })
    this._detectLinks(id, markdown)

    // Mark indexed
    this.db.prepare(`
      UPDATE library_documents SET status = 'indexed', indexed_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  // -----------------------------------------------------------------------
  // Chunking
  // -----------------------------------------------------------------------

  private _buildChunks(
    structure: Array<{ heading?: string; text: string; page_from?: number; page_to?: number }>,
    fallbackMarkdown: string
  ): Array<{ chunkIndex: number; heading?: string; text: string; pageFrom?: number; pageTo?: number }> {
    const chunks: ReturnType<typeof this._buildChunks> = []

    if (structure.length > 0) {
      let idx = 0
      for (const section of structure) {
        if (!section.text.trim()) continue
        const words = section.text.split(/\s+/)
        if (words.length <= CHUNK_MAX_WORDS) {
          chunks.push({
            chunkIndex: idx++,
            heading: section.heading,
            text: section.text.trim(),
            pageFrom: section.page_from,
            pageTo: section.page_to,
          })
        } else {
          // Sliding window within long section
          for (let start = 0; start < words.length; start += CHUNK_MAX_WORDS - CHUNK_OVERLAP_WORDS) {
            const slice = words.slice(start, start + CHUNK_MAX_WORDS).join(' ')
            chunks.push({
              chunkIndex: idx++,
              heading: section.heading,
              text: slice,
              pageFrom: section.page_from,
              pageTo: section.page_to,
            })
          }
        }
      }
    } else {
      // Fallback: sliding window over full markdown
      const words = fallbackMarkdown.split(/\s+/)
      let idx = 0
      for (let start = 0; start < words.length; start += CHUNK_MAX_WORDS - CHUNK_OVERLAP_WORDS) {
        chunks.push({
          chunkIndex: idx++,
          text: words.slice(start, start + CHUNK_MAX_WORDS).join(' '),
        })
      }
    }

    return chunks
  }

  // -----------------------------------------------------------------------
  // Embeddings
  // -----------------------------------------------------------------------

  private async _embedChunks(
    documentId: string,
    rows: Array<{ id: number; text: string }>
  ): Promise<void> {
    // Delete stale embeddings
    this.db.prepare(`
      DELETE FROM library_embeddings WHERE chunk_id IN
        (SELECT id FROM library_chunks WHERE document_id = ?)
    `).run(documentId)

    const insertEmb = this.db.prepare(
      'INSERT OR REPLACE INTO library_embeddings (chunk_id, vector) VALUES (?, ?)'
    )

    for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
      const batch = rows.slice(i, i + EMBED_BATCH_SIZE)
      const resp = await pythonSidecar.send({
        cmd: 'embed',
        texts: batch.map(r => r.text),
      })
      if (!resp.ok) continue // skip embedding on error, FTS still works

      const vectors = resp.vectors as number[][]
      const insertBatch = this.db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          // Store as JSON blob (simple, no native extension required)
          const blob = Buffer.from(JSON.stringify(vectors[j]))
          insertEmb.run(batch[j].id, blob)
        }
      })
      insertBatch()
    }
  }

  // -----------------------------------------------------------------------
  // Entity link detection
  // -----------------------------------------------------------------------

  private _detectLinks(documentId: string, markdown: string): void {
    type EntityRow = { id: number; name: string; aliases: string }
    const entities = this.db.prepare('SELECT id, name, aliases FROM entities').all() as EntityRow[]

    this.db.prepare('DELETE FROM library_links WHERE document_id = ?').run(documentId)
    const insertLink = this.db.prepare(`
      INSERT OR IGNORE INTO library_links (document_id, entity_id, link_type)
      VALUES (?, ?, 'mention_auto')
    `)

    const lowerMarkdown = markdown.toLowerCase()
    const insertAll = this.db.transaction(() => {
      for (const entity of entities) {
        const names: string[] = [entity.name]
        try {
          const aliases: string[] = JSON.parse(entity.aliases || '[]')
          names.push(...aliases)
        } catch { /* ignore */ }

        const found = names.some(n => n && lowerMarkdown.includes(n.toLowerCase()))
        if (found) insertLink.run(documentId, entity.id)
      }
    })
    insertAll()
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  list(folder?: string): LibraryDocument[] {
    let rows: RawDoc[]
    if (folder) {
      rows = this.db.prepare(
        "SELECT * FROM library_documents WHERE path LIKE ? ORDER BY added_at DESC"
      ).all(`${folder}%`) as RawDoc[]
    } else {
      rows = this.db.prepare(
        "SELECT * FROM library_documents ORDER BY added_at DESC"
      ).all() as RawDoc[]
    }
    return rows.map(r => this._toDoc(r))
  }

  get(id: string): LibraryDocument | null {
    const row = this.db.prepare('SELECT * FROM library_documents WHERE id = ?').get(id) as RawDoc | undefined
    return row ? this._toDoc(row) : null
  }

  delete(id: string): void {
    const doc = this.get(id)
    if (!doc) return

    // Move to system trash
    const absPath = this.absoluteDocPath(doc.path)
    if (fs.existsSync(absPath)) shell.trashItem(absPath)

    // Remove cache files
    for (const ext of ['.md', '.json']) {
      const cf = this.cacheFilePath(id, ext)
      if (fs.existsSync(cf)) fs.rmSync(cf)
    }

    // Clean up FTS5 external-content index *before* cascading delete
    this._deleteChunksAndFts(id)
    // Now cascade handles embeddings + links
    this.db.prepare('DELETE FROM library_documents WHERE id = ?').run(id)
  }

  rename(id: string, newFilename: string): void {
    const doc = this.get(id)
    if (!doc) throw new Error(`Document not found: ${id}`)

    const oldAbs = this.absoluteDocPath(doc.path)
    const newRelative = path.join(path.dirname(doc.path), newFilename)
    const newAbs = this.absoluteDocPath(newRelative)

    fs.renameSync(oldAbs, newAbs)
    this.db.prepare('UPDATE library_documents SET path = ?, filename = ? WHERE id = ?')
      .run(newRelative, newFilename, id)
  }

  getPreview(id: string): { markdown: string; pageCount: number | null } {
    const cacheFile = this.cacheFilePath(id, '.md')
    const doc = this.get(id)
    const markdown = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile, 'utf8') : '_Document non encore extrait._'
    return { markdown, pageCount: doc?.pageCount ?? null }
  }

  openOriginal(id: string): void {
    const doc = this.get(id)
    if (!doc) throw new Error(`Document not found: ${id}`)
    shell.openPath(this.absoluteDocPath(doc.path))
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  async search(
    query: string,
    mode: 'lexical' | 'semantic' | 'hybrid' = 'hybrid',
    limit = 6
  ): Promise<LibraryChunkResult[]> {
    const lexicalResults = mode !== 'semantic' ? this._lexicalSearch(query, limit * 3) : []
    const semanticResults = mode !== 'lexical' ? await this._semanticSearch(query, limit * 3) : []

    if (mode === 'lexical') return lexicalResults.slice(0, limit)
    if (mode === 'semantic') return semanticResults.slice(0, limit)

    // Hybrid: Reciprocal Rank Fusion
    return this._rrfFusion(lexicalResults, semanticResults, limit)
  }

  private _lexicalSearch(query: string, limit: number): LibraryChunkResult[] {
    // Escape FTS5 special characters
    const safeQuery = query.replace(/['"*^()]/g, ' ').trim()
    if (!safeQuery) return []

    type FtsRow = {
      id: number
      document_id: string
      heading: string | null
      text: string
      page_from: number | null
      page_to: number | null
      rank: number
      title: string | null
      path: string
    }

    const rows = this.db.prepare(`
      SELECT
        lc.id, lc.document_id, lc.heading, lc.text, lc.page_from, lc.page_to,
        fts.rank,
        ld.title, ld.path
      FROM library_chunks_fts fts
      JOIN library_chunks lc ON lc.id = fts.rowid
      JOIN library_documents ld ON ld.id = lc.document_id
      WHERE library_chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(safeQuery, limit) as FtsRow[]

    return rows.map((r, i) => ({
      chunkId: r.id,
      documentId: r.document_id,
      documentTitle: r.title,
      documentPath: r.path,
      heading: r.heading,
      text: r.text,
      pageFrom: r.page_from,
      pageTo: r.page_to,
      score: 1 / (i + 1), // rank proxy for RRF
    }))
  }

  private async _semanticSearch(query: string, limit: number): Promise<LibraryChunkResult[]> {
    if (!await pythonSidecar.ensureReady()) return []

    const resp = await pythonSidecar.send({ cmd: 'embed_query', text: query })
    if (!resp.ok || !resp.vector) return []

    const queryVec = resp.vector as number[]

    // Load all embeddings and compute cosine similarity in JS
    // Acceptable for libraries up to ~50k chunks; upgrade to sqlite-vec when needed
    type EmbRow = { chunk_id: number; vector: Buffer }
    const embeddings = this.db.prepare(`
      SELECT e.chunk_id, e.vector
      FROM library_embeddings e
      JOIN library_chunks lc ON lc.id = e.chunk_id
      JOIN library_documents ld ON ld.id = lc.document_id
      WHERE ld.status = 'indexed'
    `).all() as EmbRow[]

    const scored: Array<{ chunkId: number; score: number }> = embeddings.map(row => {
      const vec: number[] = JSON.parse(row.vector.toString('utf8'))
      return { chunkId: row.chunk_id, score: cosineSimilarity(queryVec, vec) }
    })

    scored.sort((a, b) => b.score - a.score)
    const topIds = scored.slice(0, limit).map(s => s.chunkId)
    if (topIds.length === 0) return []

    const placeholders = topIds.map(() => '?').join(',')
    type ChunkRow = {
      id: number
      document_id: string
      heading: string | null
      text: string
      page_from: number | null
      page_to: number | null
      title: string | null
      path: string
    }
    const rows = this.db.prepare(`
      SELECT lc.id, lc.document_id, lc.heading, lc.text, lc.page_from, lc.page_to, ld.title, ld.path
      FROM library_chunks lc
      JOIN library_documents ld ON ld.id = lc.document_id
      WHERE lc.id IN (${placeholders})
    `).all(...topIds) as ChunkRow[]

    // Reattach scores
    const scoreMap = new Map(scored.map(s => [s.chunkId, s.score]))
    return rows.map(r => ({
      chunkId: r.id,
      documentId: r.document_id,
      documentTitle: r.title,
      documentPath: r.path,
      heading: r.heading,
      text: r.text,
      pageFrom: r.page_from,
      pageTo: r.page_to,
      score: scoreMap.get(r.id) ?? 0,
    }))
  }

  private _rrfFusion(
    lexical: LibraryChunkResult[],
    semantic: LibraryChunkResult[],
    limit: number
  ): LibraryChunkResult[] {
    const K = 60 // standard RRF constant
    const scoreMap = new Map<number, { score: number; result: LibraryChunkResult }>()

    const addRank = (results: LibraryChunkResult[], rankOffset: number) => {
      results.forEach((r, i) => {
        const rrf = 1 / (K + i + rankOffset)
        const existing = scoreMap.get(r.chunkId)
        if (existing) {
          existing.score += rrf
        } else {
          scoreMap.set(r.chunkId, { score: rrf, result: { ...r } })
        }
      })
    }

    addRank(lexical, 0)
    addRank(semantic, 0)

    return [...scoreMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, result }) => ({ ...result, score }))
  }

  // -----------------------------------------------------------------------
  // Reindex all
  // -----------------------------------------------------------------------

  async reindexAll(
    emitProgress: (p: LibraryIngestProgress) => void
  ): Promise<{ added: number; updated: number; removed: number }> {
    const stats = { added: 0, updated: 0, removed: 0 }
    const libPath = this.libraryPath()
    if (!fs.existsSync(libPath)) return stats

    const onDisk = this._walkLibrary(libPath)
    const inDb = new Map(
      (this.db.prepare('SELECT id, path, hash_sha256 FROM library_documents').all() as Array<{
        id: string; path: string; hash_sha256: string | null
      }>).map(r => [r.path, r])
    )

    // Remove documents no longer on disk
    for (const [relPath, row] of inDb) {
      if (!onDisk.has(relPath)) {
        this.delete(row.id)
        stats.removed++
      }
    }

    // Add or update
    for (const [relPath, absPath] of onDisk) {
      const hash = this._sha256(absPath)
      const existing = inDb.get(relPath)
      if (!existing) {
        await this.ingest(absPath, emitProgress)
        stats.added++
      } else if (existing.hash_sha256 !== hash) {
        this.delete(existing.id)
        await this.ingest(absPath, emitProgress)
        stats.updated++
      }
    }

    return stats
  }

  private _walkLibrary(dir: string, base = dir): Map<string, string> {
    const result = new Map<string, string>()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        for (const [k, v] of this._walkLibrary(abs, base)) result.set(k, v)
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        result.set(path.relative(base, abs), abs)
      }
    }
    return result
  }

  // -----------------------------------------------------------------------
  // Helpers for AgentPipeline context injection
  // -----------------------------------------------------------------------

  /**
   * Returns the top chunks for a query, formatted for prompt injection.
   * Called by AgentPipeline.process().
   */
  async getContextChunks(query: string, limit = 6): Promise<LibraryChunkResult[]> {
    return this.search(query, 'hybrid', limit)
  }

  /** Lists documents linked to a specific entity. */
  getLinkedDocuments(entityId: number): LibraryDocument[] {
    const rows = this.db.prepare(`
      SELECT ld.*
      FROM library_documents ld
      JOIN library_links ll ON ll.document_id = ld.id
      WHERE ll.entity_id = ?
    `).all(entityId) as RawDoc[]
    return rows.map(r => this._toDoc(r))
  }

  // -----------------------------------------------------------------------
  // Internal serialisation
  // -----------------------------------------------------------------------

  private _toDoc(row: RawDoc): LibraryDocument {
    return {
      id: row.id,
      path: row.path,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      title: row.title,
      author: row.author,
      pageCount: row.page_count,
      summary: row.summary,
      tags: (() => { try { return JSON.parse(row.tags || '[]') } catch { return [] } })(),
      addedAt: row.added_at,
      indexedAt: row.indexed_at,
      status: row.status as LibraryDocument['status'],
      errorMessage: row.error_message ?? undefined,
    }
  }

  /**
   * Safely removes all chunks + their FTS5 entries for a document.
   *
   * External-content FTS5 tables cannot be updated with normal DELETE.
   * We must issue the special `INSERT INTO fts(fts, rowid, ...) VALUES('delete', ...)`
   * command *before* deleting the source rows, otherwise the FTS index corrupts
   * and subsequent reads throw "database disk image is malformed".
   */
  private _deleteChunksAndFts(documentId: string): void {
    const existing = this.db.prepare(
      'SELECT id, text, heading, document_id FROM library_chunks WHERE document_id = ?'
    ).all(documentId) as Array<{ id: number; text: string; heading: string | null; document_id: string }>

    if (existing.length > 0) {
      const deleteFts = this.db.prepare(
        "INSERT INTO library_chunks_fts(library_chunks_fts, rowid, text, heading, document_id) VALUES('delete', ?, ?, ?, ?)"
      )
      const txn = this.db.transaction(() => {
        for (const row of existing) {
          deleteFts.run(row.id, row.text, row.heading ?? '', row.document_id)
        }
      })
      txn()
    }

    // Now safe to delete the source rows
    this.db.prepare('DELETE FROM library_chunks WHERE document_id = ?').run(documentId)
  }

  private _sha256(filePath: string): string {
    const buf = fs.readFileSync(filePath)
    return createHash('sha256').update(buf).digest('hex')
  }
}

// -------------------------------------------------------------------------
// Standalone helpers
// -------------------------------------------------------------------------

interface RawDoc {
  id: string
  path: string
  filename: string
  mime_type: string | null
  size: number | null
  hash_sha256: string | null
  title: string | null
  author: string | null
  page_count: number | null
  summary: string | null
  tags: string
  added_at: string
  indexed_at: string | null
  status: string
  error_message: string | null
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.pptx', '.html', '.txt', '.md',
])

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  }
  return map[ext] ?? 'application/octet-stream'
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// Singleton
export const libraryService = new LibraryService()
