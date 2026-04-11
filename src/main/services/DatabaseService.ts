import Database from 'better-sqlite3'
import type { CortxFile, Entity, Relation, GraphData, FileContent, AgentLogEntry } from '../../shared/types'

/**
 * Infer the entity type from a file path when frontmatter doesn't declare one.
 * Maps the standard CortX directories to their entity types.
 */
function inferTypeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase().replace(/\\/g, '/')
  if (/(^|\/)reseau\//.test(lower) || /(^|\/)r[ée]seau\//.test(lower)) return 'personne'
  if (/(^|\/)entreprises?\//.test(lower)) return 'entreprise'
  if (/(^|\/)domaines?\//.test(lower)) return 'domaine'
  if (/(^|\/)projets?\//.test(lower)) return 'projet'
  if (/(^|\/)journal\//.test(lower)) return 'journal'
  return 'note'
}

/**
 * Infer a semantic relation type from context when a wikilink is found.
 *
 * Priority:
 *  1. Verb/keyword hints in the line or enclosing heading (strong signal)
 *  2. Source-type → target-type default (structural fallback)
 *  3. Generic "lié à"
 *
 * Labels are stored with underscores (`travaille_chez`) and the renderer
 * converts them to spaces for display (`travaille chez`).
 */
function inferRelationType(
  sourceType: string,
  targetType: string,
  line: string,
  heading: string
): string {
  const text = (line + ' ' + heading).toLowerCase()

  // --- Keyword-driven inference (works regardless of entity types) ---
  if (/\ba[ _]?quitt|ancien(?:ne)?[ _]?(?:poste|emploi|employeur)|anciennement|ex[- ]employ/.test(text)) {
    return 'ancien_employé'
  }
  if (/\bdirige|pilote|chef\s+de|responsable\s+de|head\s+of|lead\b/.test(text)) {
    if (sourceType === 'personne' && targetType === 'projet') return 'dirige'
    if (sourceType === 'personne' && targetType === 'entreprise') return 'dirige'
  }
  if (/\bconcurrent|rival|competitor/.test(text)) {
    return 'concurrent'
  }
  if (/\bfiliale|appartient\s+au?\s+groupe|maison[ _-]m[èe]re|rachet[ée]e?\s+par|acquise?\s+par/.test(text)) {
    return 'filiale_de'
  }
  if (/\bpartenaire|alliance|collabor|fournisseur|client\b/.test(text)) {
    if (sourceType === 'entreprise' && targetType === 'entreprise') return 'partenaire_de'
  }
  if (/\bpr[ée]sent[ée](?:e)?\s+par/.test(text)) {
    return 'présenté_par'
  }
  if (/\brencontr[ée]|d[ée]jeuner|entretien|meeting|r[ée]union/.test(text)) {
    if (sourceType === 'personne' && targetType === 'personne') return 'connaît'
    if (sourceType === 'journal') return 'évoque'
  }
  if (/\bconna[iî]t|conna[iî]ssance|contact\s+(?:de|chez)|ami|coll[èe]gue/.test(text)) {
    if (sourceType === 'personne' && targetType === 'personne') return 'connaît'
  }
  if (/\bexpert(?:e)?|sp[ée]cialiste|comp[ée]tence|expertise|sp[ée]cialis[ée]/.test(text)) {
    if (targetType === 'domaine') return 'expert_en'
  }
  if (/\bop[èe]re\s+dans|secteur|actif\s+dans|march[ée]\s+de|industrie/.test(text)) {
    if (sourceType === 'entreprise' && targetType === 'domaine') return 'opère_dans'
  }
  if (/\bparticipe|contribue\s+[àa]|membre\s+de/.test(text)) {
    if (targetType === 'projet') return 'participe_à'
  }
  if (/\bsous[- ]domaine|sous[- ]cat[eé]gorie|branche\s+de|fait\s+partie\s+de/.test(text)) {
    if (sourceType === 'domaine' && targetType === 'domaine') return 'sous_domaine_de'
  }
  if (/\btravaille|employ[ée]|directeur|directrice|ing[eé]nieur|responsable|manager|ceo|cto|cfo|coo|fondateur|fondatrice|stagiaire|consultant|chez\s+\[?\[?/.test(text)) {
    if (targetType === 'entreprise') return 'employé_chez'
  }

  // --- Structural defaults (no keyword hit) ---
  const pair = `${sourceType}->${targetType}`
  const defaults: Record<string, string> = {
    'personne->entreprise': 'employé_chez',
    'personne->personne': 'connaît',
    'personne->domaine': 'expert_en',
    'personne->projet': 'travaille_sur',
    'personne->note': 'évoqué_dans',
    'personne->journal': 'évoqué_dans',

    'entreprise->entreprise': 'liée_à',
    'entreprise->domaine': 'opère_dans',
    'entreprise->projet': 'participe_à',
    'entreprise->personne': 'emploie',
    'entreprise->note': 'évoquée_dans',
    'entreprise->journal': 'évoquée_dans',

    'domaine->domaine': 'liée_à',
    'domaine->entreprise': 'inclut',
    'domaine->personne': 'inclut',
    'domaine->projet': 'inclut',
    'domaine->note': 'évoqué_dans',
    'domaine->journal': 'évoqué_dans',

    'projet->personne': 'implique',
    'projet->entreprise': 'implique',
    'projet->domaine': 'concerne',
    'projet->projet': 'liée_à',
    'projet->note': 'évoqué_dans',
    'projet->journal': 'évoqué_dans',

    'journal->personne': 'évoque',
    'journal->entreprise': 'évoque',
    'journal->domaine': 'évoque',
    'journal->projet': 'évoque',
    'journal->note': 'évoque',
    'journal->journal': 'liée_à',

    'note->personne': 'référence',
    'note->entreprise': 'référence',
    'note->domaine': 'référence',
    'note->projet': 'référence',
    'note->note': 'liée_à',
    'note->journal': 'référence'
  }
  return defaults[pair] || 'liée_à'
}

export class DatabaseService {
  private db!: Database.Database

  constructor(private dbPath: string) {}

  initialize(): void {
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.createTables()
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        type TEXT,
        title TEXT,
        tags TEXT DEFAULT '[]',
        content_hash TEXT,
        created_at TEXT,
        modified_at TEXT,
        status TEXT DEFAULT 'actif'
      );

      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT,
        aliases TEXT DEFAULT '[]',
        FOREIGN KEY (file_path) REFERENCES files(path)
      );

      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_entity_id INTEGER NOT NULL,
        target_entity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        source_file TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_entity_id) REFERENCES entities(id),
        FOREIGN KEY (target_entity_id) REFERENCES entities(id)
      );

      CREATE TABLE IF NOT EXISTS agent_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        input_text TEXT,
        input_type TEXT,
        actions_json TEXT,
        commit_hash TEXT,
        status TEXT DEFAULT 'success'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        path,
        title,
        content,
        content_rowid='rowid'
      );

      -- ── Library tables ────────────────────────────────────────────────
      -- One row per imported document (PDF, DOCX, XLSX, …)
      CREATE TABLE IF NOT EXISTS library_documents (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        hash_sha256 TEXT,
        title TEXT,
        author TEXT,
        page_count INTEGER,
        summary TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        added_at TEXT NOT NULL,
        indexed_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT
      );

      -- One row per text chunk extracted from a document
      CREATE TABLE IF NOT EXISTS library_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        page_from INTEGER,
        page_to INTEGER,
        heading TEXT,
        text TEXT NOT NULL
      );

      -- FTS5 index over chunks
      CREATE VIRTUAL TABLE IF NOT EXISTS library_chunks_fts USING fts5(
        text,
        heading,
        document_id UNINDEXED,
        content='library_chunks',
        content_rowid='id'
      );

      -- Embeddings stored as BLOB (float32 array serialised as JSON for now;
      -- can be migrated to sqlite-vec when packaging is validated)
      CREATE TABLE IF NOT EXISTS library_embeddings (
        chunk_id INTEGER PRIMARY KEY REFERENCES library_chunks(id) ON DELETE CASCADE,
        vector BLOB NOT NULL
      );

      -- Detected links between library documents and knowledge-base entities
      CREATE TABLE IF NOT EXISTS library_links (
        document_id TEXT NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
        entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        link_type TEXT NOT NULL DEFAULT 'mention_auto',
        PRIMARY KEY (document_id, entity_id, link_type)
      );

      -- Links FROM .md knowledge-base files TO library documents via [[wikilinks]].
      -- Populated by indexEntitiesFromFile() when a wikilink matches a library doc title.
      CREATE TABLE IF NOT EXISTS file_library_links (
        file_path TEXT NOT NULL,
        document_id TEXT NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
        PRIMARY KEY (file_path, document_id)
      );
    `)
  }

  // --- Files ---

  indexFile(fileContent: FileContent): void {
    const fm = fileContent.frontmatter
    const title = this.extractTitle(fileContent.body) || fileContent.path.split('/').pop()?.replace('.md', '') || ''
    const tags = JSON.stringify(fm.tags || [])
    const contentHash = this.simpleHash(fileContent.raw)

    this.db.prepare(`
      INSERT OR REPLACE INTO files (path, type, title, tags, content_hash, created_at, modified_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileContent.path,
      (fm.type as string) || inferTypeFromPath(fileContent.path),
      title,
      tags,
      contentHash,
      fm.created instanceof Date ? fm.created.toISOString().split('T')[0] : (fm.created as string) || new Date().toISOString().split('T')[0],
      fm.modified instanceof Date ? fm.modified.toISOString().split('T')[0] : (fm.modified as string) || new Date().toISOString().split('T')[0],
      (fm.status as string) || 'actif'
    )

    // Update FTS
    this.db.prepare('DELETE FROM files_fts WHERE path = ?').run(fileContent.path)
    this.db.prepare('INSERT INTO files_fts (path, title, content) VALUES (?, ?, ?)').run(
      fileContent.path,
      title,
      fileContent.body
    )

    // Index entities from file
    this.indexEntitiesFromFile(fileContent)
  }

  private indexEntitiesFromFile(fileContent: FileContent): void {
    const fm = fileContent.frontmatter
    // Type comes from frontmatter, but if missing we infer it from the
    // directory the file lives in. Without this, every file with a missing
    // `type:` ends up as a generic "note" and the relation classifier falls
    // back to "mentionne" for everything.
    const type = (fm.type as string) || inferTypeFromPath(fileContent.path)
    const title = (fm.title as string) || this.extractTitle(fileContent.body) || fileContent.path.split('/').pop()?.replace('.md', '') || ''

    // Index all known entity types as graph nodes
    const entityTypes = ['personne', 'entreprise', 'domaine', 'projet', 'note', 'journal']
    if (entityTypes.includes(type)) {
      const existing = this.db.prepare('SELECT id FROM entities WHERE file_path = ?').get(fileContent.path) as { id: number } | undefined
      if (!existing) {
        this.db.prepare('INSERT INTO entities (name, type, file_path, aliases) VALUES (?, ?, ?, ?)')
          .run(title, type, fileContent.path, '[]')
      } else {
        this.db.prepare('UPDATE entities SET name = ?, type = ? WHERE file_path = ?')
          .run(title, type, fileContent.path)
      }
    }

    // Clear previous relations coming from this file — they may be stale
    // (a line was edited, a link removed, or the inferred type changed).
    this.db.prepare('DELETE FROM relations WHERE source_file = ?').run(fileContent.path)
    this.db.prepare('DELETE FROM file_library_links WHERE file_path = ?').run(fileContent.path)

    const sourceEntity = this.db.prepare('SELECT id, type FROM entities WHERE file_path = ?').get(fileContent.path) as { id: number; type: string } | undefined

    // Walk the body line by line to keep the surrounding context for each link.
    // This lets us infer the relation type from verbs like "travaille", "connait", etc.
    const lines = fileContent.body.split('\n')
    const seen = new Set<string>() // dedupe per (target, type) within this file
    const seenLibLinks = new Set<string>() // dedupe library doc links

    let currentHeading = ''
    for (const rawLine of lines) {
      const headingMatch = rawLine.match(/^(#{1,6})\s+(.+?)\s*$/)
      if (headingMatch) {
        currentHeading = headingMatch[2].trim()
        continue
      }

      const linkMatches = [...rawLine.matchAll(/\[\[([^\]]+)\]\]/g)]
      if (linkMatches.length === 0) continue

      for (const m of linkMatches) {
        const targetName = m[1].trim()

        // --- Check library documents (title, full filename, or filename without extension) ---
        // Matches: [[Q6_2026_OKRs.xlsx]] → filename exact match
        // Matches: [[Q6_2026_OKRs]]      → filename stripped of extension
        // Matches: [[GUIDE DE NOTATION]] → title match
        type LibDocRow = { id: string }
        const libDoc = this.db.prepare(`
          SELECT id FROM library_documents
          WHERE status = 'indexed' AND (
            LOWER(title) = LOWER(?) OR
            LOWER(filename) = LOWER(?) OR
            LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(filename, '.pdf',''), '.docx',''), '.xlsx',''), '.txt',''), '.pptx','')) = LOWER(?)
          )
          LIMIT 1
        `).get(targetName, targetName, targetName) as LibDocRow | undefined

        if (libDoc && !seenLibLinks.has(libDoc.id)) {
          seenLibLinks.add(libDoc.id)
          this.db.prepare(
            'INSERT OR IGNORE INTO file_library_links (file_path, document_id) VALUES (?, ?)'
          ).run(fileContent.path, libDoc.id)
        }

        // --- Check knowledge-base entities ---
        if (!sourceEntity) continue
        const targetEntity = this.db.prepare('SELECT id, type FROM entities WHERE LOWER(name) = LOWER(?)').get(targetName) as { id: number; type: string } | undefined
        if (!targetEntity || targetEntity.id === sourceEntity.id) continue

        const relType = inferRelationType(
          sourceEntity.type,
          targetEntity.type,
          rawLine,
          currentHeading
        )

        const key = `${targetEntity.id}:${relType}`
        if (seen.has(key)) continue
        seen.add(key)

        this.db.prepare(
          'INSERT INTO relations (source_entity_id, target_entity_id, relation_type, source_file) VALUES (?, ?, ?, ?)'
        ).run(sourceEntity.id, targetEntity.id, relType, fileContent.path)
      }
    }
  }

  getFiles(): CortxFile[] {
    const rows = this.db.prepare('SELECT * FROM files ORDER BY modified_at DESC').all() as Array<{
      path: string; type: string; title: string; tags: string; created_at: string; modified_at: string; status: string
    }>

    return rows.map((r) => ({
      path: r.path,
      type: r.type as CortxFile['type'],
      title: r.title,
      tags: JSON.parse(r.tags || '[]'),
      created: r.created_at,
      modified: r.modified_at,
      related: [],
      status: r.status as CortxFile['status']
    }))
  }

  getEntities(): Entity[] {
    const rows = this.db.prepare('SELECT * FROM entities ORDER BY name').all() as Array<{
      id: number; name: string; type: string; file_path: string; aliases: string
    }>

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as Entity['type'],
      filePath: r.file_path,
      aliases: JSON.parse(r.aliases || '[]')
    }))
  }

  getRelations(): Relation[] {
    return this.db.prepare('SELECT * FROM relations').all() as Relation[]
  }

  findEntity(name: string): Entity | null {
    // Exact match first
    const exact = this.db.prepare(
      'SELECT * FROM entities WHERE LOWER(name) = LOWER(?)'
    ).get(name) as { id: number; name: string; type: string; file_path: string; aliases: string } | undefined

    if (exact) {
      return {
        id: exact.id,
        name: exact.name,
        type: exact.type as Entity['type'],
        filePath: exact.file_path,
        aliases: JSON.parse(exact.aliases || '[]')
      }
    }

    // Fuzzy: LIKE match
    const fuzzy = this.db.prepare(
      'SELECT * FROM entities WHERE LOWER(name) LIKE ?'
    ).get(`%${name.toLowerCase()}%`) as { id: number; name: string; type: string; file_path: string; aliases: string } | undefined

    if (fuzzy) {
      return {
        id: fuzzy.id,
        name: fuzzy.name,
        type: fuzzy.type as Entity['type'],
        filePath: fuzzy.file_path,
        aliases: JSON.parse(fuzzy.aliases || '[]')
      }
    }

    return null
  }

  search(query: string): CortxFile[] {
    if (!query.trim()) return this.getFiles()

    try {
      const rows = this.db.prepare(`
        SELECT f.* FROM files f
        JOIN files_fts fts ON f.path = fts.path
        WHERE files_fts MATCH ?
        ORDER BY rank
        LIMIT 20
      `).all(query) as Array<{
        path: string; type: string; title: string; tags: string; created_at: string; modified_at: string; status: string
      }>

      return rows.map((r) => ({
        path: r.path,
        type: r.type as CortxFile['type'],
        title: r.title,
        tags: JSON.parse(r.tags || '[]'),
        created: r.created_at,
        modified: r.modified_at,
        related: [],
        status: r.status as CortxFile['status']
      }))
    } catch {
      // FTS query syntax error, fall back to LIKE
      const rows = this.db.prepare(
        'SELECT * FROM files WHERE title LIKE ? OR path LIKE ? LIMIT 20'
      ).all(`%${query}%`, `%${query}%`) as Array<{
        path: string; type: string; title: string; tags: string; created_at: string; modified_at: string; status: string
      }>

      return rows.map((r) => ({
        path: r.path,
        type: r.type as CortxFile['type'],
        title: r.title,
        tags: JSON.parse(r.tags || '[]'),
        created: r.created_at,
        modified: r.modified_at,
        related: [],
        status: r.status as CortxFile['status']
      }))
    }
  }

  /**
   * Return library document IDs referenced by a KB file via [[wikilinks]].
   * Used for multi-hop retrieval: "this project mentions planning.xlsx → fetch its chunks".
   */
  getLibraryDocIdsLinkedFrom(filePath: string): string[] {
    const rows = this.db.prepare(
      'SELECT document_id FROM file_library_links WHERE file_path = ?'
    ).all(filePath) as Array<{ document_id: string }>
    return rows.map((r) => r.document_id)
  }

  /**
   * Return KB file paths that contain a [[wikilink]] to a specific library document.
   * Used for reverse lookup: "which project uses this .xlsx file?".
   */
  getKbFilesLinkingTo(docId: string): string[] {
    const rows = this.db.prepare(
      'SELECT file_path FROM file_library_links WHERE document_id = ?'
    ).all(docId) as Array<{ file_path: string }>
    return rows.map((r) => r.file_path)
  }

  /**
   * Return file paths of KB entities wikilinked from a given KB file.
   * Used for KB→KB multi-hop: a project file links to a person or company file.
   */
  getKbFilesLinkedFrom(filePath: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT e.file_path
      FROM relations r
      JOIN entities src ON src.id = r.source_entity_id
      JOIN entities e   ON e.id   = r.target_entity_id
      WHERE src.file_path = ?
        AND e.file_path IS NOT NULL
        AND e.file_path != ?
    `).all(filePath, filePath) as Array<{ file_path: string }>
    return rows.map((r) => r.file_path).filter(Boolean)
  }

  getTags(): Array<{ tag: string; count: number }> {
    const rows = this.db.prepare('SELECT tags FROM files').all() as Array<{ tags: string }>
    const tagCounts = new Map<string, number>()

    for (const row of rows) {
      const tags = JSON.parse(row.tags || '[]') as string[]
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
  }

  getGraphData(): GraphData {
    const entities = this.getEntities()
    const relations = this.db.prepare('SELECT * FROM relations').all() as Array<{
      source_entity_id: number; target_entity_id: number; relation_type: string
    }>

    const nodes = entities.map((e) => ({
      id: String(e.id),
      label: e.name,
      type: e.type,
      filePath: e.filePath
    }))

    const entityIds = new Set(entities.map((e) => e.id))
    const edges = relations
      .filter((r) => entityIds.has(r.source_entity_id) && entityIds.has(r.target_entity_id))
      .map((r) => ({
        source: String(r.source_entity_id),
        target: String(r.target_entity_id),
        label: r.relation_type
      }))

    // --- Library documents as graph nodes ---
    try {
      const libDocs = this.db.prepare(
        "SELECT id, title, filename, path FROM library_documents WHERE status = 'indexed'"
      ).all() as Array<{ id: string; title: string | null; filename: string; path: string }>

      for (const doc of libDocs) {
        nodes.push({
          id: `lib:${doc.id}`,
          label: doc.title || doc.filename,
          type: 'document' as GraphNode['type'],
          filePath: doc.path,
        })
      }

      // Library links: library doc → entity (auto-detected during ingest)
      const libLinks = this.db.prepare(
        'SELECT document_id, entity_id, link_type FROM library_links'
      ).all() as Array<{ document_id: string; entity_id: number; link_type: string }>

      for (const link of libLinks) {
        if (entityIds.has(link.entity_id)) {
          edges.push({
            source: `lib:${link.document_id}`,
            target: String(link.entity_id),
            label: link.link_type,
          })
        }
      }

      // File→library links: entity → library doc via [[wikilinks]] in .md files
      const fileLibLinks = this.db.prepare(
        'SELECT fl.file_path, fl.document_id, e.id as entity_id FROM file_library_links fl JOIN entities e ON e.file_path = fl.file_path'
      ).all() as Array<{ file_path: string; document_id: string; entity_id: number }>

      const libDocIds = new Set(libDocs.map(d => d.id))
      for (const link of fileLibLinks) {
        if (entityIds.has(link.entity_id) && libDocIds.has(link.document_id)) {
          edges.push({
            source: String(link.entity_id),
            target: `lib:${link.document_id}`,
            label: 'réf. doc',
          })
        }
      }
    } catch {
      // Library tables may not exist yet — silently skip
    }

    return { nodes, edges }
  }

  getEntitySummary(): string {
    const entities = this.getEntities()
    const grouped = new Map<string, string[]>()
    for (const e of entities) {
      const list = grouped.get(e.type) || []
      list.push(e.name)
      grouped.set(e.type, list)
    }

    const lines: string[] = []
    for (const [type, names] of grouped) {
      lines.push(`${type.charAt(0).toUpperCase() + type.slice(1)}s : ${names.join(', ')}`)
    }
    return lines.join('\n') || 'Aucune entite connue.'
  }

  getTopTags(limit = 10): string {
    const tags = this.getTags()
    return tags.slice(0, limit).map((t) => t.tag).join(', ') || 'Aucun tag.'
  }

  getFileCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }
    return row.count
  }

  getLastModified(): string {
    const row = this.db.prepare('SELECT modified_at FROM files ORDER BY modified_at DESC LIMIT 1').get() as { modified_at: string } | undefined
    return row?.modified_at || 'Jamais'
  }

  // --- Agent Log ---

  logAgentAction(inputText: string, inputType: string, actionsJson: string, commitHash: string, status = 'success'): void {
    this.db.prepare(
      'INSERT INTO agent_log (input_text, input_type, actions_json, commit_hash, status) VALUES (?, ?, ?, ?, ?)'
    ).run(inputText, inputType, actionsJson, commitHash, status)
  }

  /**
   * Fully remove a file and all its DB traces: files table, FTS index,
   * entity row, and all relations where this entity is source OR target.
   */
  removeFile(filePath: string): void {
    // Find the entity for this file before removing it
    const entity = this.db.prepare(
      'SELECT id FROM entities WHERE file_path = ?'
    ).get(filePath) as { id: number } | undefined

    if (entity) {
      // Remove all relations involving this entity (as source or target)
      this.db.prepare(
        'DELETE FROM relations WHERE source_entity_id = ? OR target_entity_id = ?'
      ).run(entity.id, entity.id)
      // Also remove relations from other files that pointed to this entity
      // (handled above via target_entity_id = entity.id)
      this.db.prepare('DELETE FROM entities WHERE id = ?').run(entity.id)
    }

    // Clean FTS and files table
    this.db.prepare('DELETE FROM files_fts WHERE path = ?').run(filePath)
    this.db.prepare('DELETE FROM files WHERE path = ?').run(filePath)
  }

  /**
   * Remove DB entries for any file paths that no longer exist on disk.
   * Called at the end of reindexAll to keep the DB in sync after deletions.
   */
  purgeStaleFiles(existingPaths: Set<string>): void {
    const dbPaths = (this.db.prepare('SELECT path FROM files').all() as Array<{ path: string }>)
      .map((r) => r.path)
    for (const p of dbPaths) {
      if (!existingPaths.has(p)) {
        this.removeFile(p)
      }
    }
  }

  addRelation(sourceId: number, targetId: number, relationType: string, sourceFile: string): void {
    // Check for existing relation
    const existing = this.db.prepare(
      'SELECT id FROM relations WHERE source_entity_id = ? AND target_entity_id = ? AND relation_type = ?'
    ).get(sourceId, targetId, relationType)

    if (!existing) {
      this.db.prepare(
        'INSERT INTO relations (source_entity_id, target_entity_id, relation_type, source_file) VALUES (?, ?, ?, ?)'
      ).run(sourceId, targetId, relationType, sourceFile)
    }
  }

  // --- Helpers ---

  private extractTitle(body: string): string {
    const match = body.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : ''
  }

  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return hash.toString(36)
  }

  /** Expose the raw better-sqlite3 instance for services that need direct access (e.g. LibraryService). */
  getDb(): Database.Database {
    return this.db
  }

  close(): void {
    this.db.close()
  }
}
