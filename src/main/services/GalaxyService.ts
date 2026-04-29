import { join } from 'path'
import * as fs from 'fs'
import type { DatabaseService } from './DatabaseService'
import type { FileService } from './FileService'
import { GraphAnalysisService } from './GraphAnalysisService'
import type {
  GalaxyData,
  GalaxyNode,
  GalaxyEdge,
  GalaxyCluster,
  GalaxyComet,
  GalaxyConstellation
} from '../../shared/types'

const TYPE_COLORS: Record<string, string> = {
  personne: '#ff9d4d',
  entreprise: '#5b8def',
  domaine: '#a855f7',
  projet: '#22d3ee',
  note: '#facc15',
  journal: '#f472b6'
}

/** Human-readable cluster label based on dominant entity type */
const TYPE_LABELS: Record<string, string> = {
  personne: 'Personnes',
  entreprise: 'Entreprises',
  domaine: 'Domaines',
  projet: 'Projets',
  note: 'Notes',
  journal: 'Journal'
}

interface ClusterOverrides {
  /** key = top-member entity name, value = user-chosen label */
  byTopMember: Record<string, string>
}

export class GalaxyService {
  private analysis = new GraphAnalysisService()

  constructor(
    private db: DatabaseService,
    private files: FileService,
    private basePath: string
  ) {}

  private overridesPath(): string {
    return join(this.basePath, '_System', 'galaxy-clusters.json')
  }

  private loadOverrides(): ClusterOverrides {
    try {
      const raw = fs.readFileSync(this.overridesPath(), 'utf-8')
      const parsed = JSON.parse(raw) as ClusterOverrides
      return { byTopMember: parsed.byTopMember || {} }
    } catch {
      return { byTopMember: {} }
    }
  }

  private saveOverrides(o: ClusterOverrides): void {
    try {
      fs.mkdirSync(join(this.basePath, '_System'), { recursive: true })
      fs.writeFileSync(this.overridesPath(), JSON.stringify(o, null, 2), 'utf-8')
    } catch (err) {
      console.error('[GalaxyService] saveOverrides failed:', err)
    }
  }

  async getData(): Promise<GalaxyData> {
    const entities = this.db.getEntities()
    const relations = this.db.getRelations()
    const fileRows = this.db.getFiles()
    const fileByPath = new Map(fileRows.map((f) => [f.path, f]))

    // ── Nodes ────────────────────────────────────────────────────────────
    const nodes: GalaxyNode[] = []
    const nodeIds: string[] = []
    const degree = new Map<string, number>()
    for (const r of relations) {
      const s = String(r.sourceEntityId)
      const t = String(r.targetEntityId)
      degree.set(s, (degree.get(s) ?? 0) + 1)
      degree.set(t, (degree.get(t) ?? 0) + 1)
    }

    for (const e of entities) {
      const id = String(e.id)
      const file = fileByPath.get(e.filePath)
      const modifiedAt = file?.modified || new Date().toISOString()
      const createdAt = file?.created || modifiedAt
      nodes.push({
        id,
        label: e.name,
        type: e.type as GalaxyNode['type'],
        filePath: e.filePath,
        degree: degree.get(id) ?? 0,
        clusterId: 0,
        modifiedAt,
        createdAt
      })
      nodeIds.push(id)
    }

    // ── Edges ────────────────────────────────────────────────────────────
    const entityIds = new Set(nodeIds)
    const edges: GalaxyEdge[] = []
    for (const r of relations) {
      const s = String(r.sourceEntityId)
      const t = String(r.targetEntityId)
      if (!entityIds.has(s) || !entityIds.has(t)) continue
      const sourceFile = fileByPath.get(r.sourceFile)
      edges.push({
        source: s,
        target: t,
        label: r.relationType,
        createdAt: sourceFile?.modified || new Date().toISOString()
      })
    }

    // ── Louvain clustering ───────────────────────────────────────────────
    let { communities, count } = this.analysis.louvain(nodeIds, edges)

    // Fallback: if Louvain is degenerate (too many tiny clusters — usually means
    // sparse graph where each node has no incentive to merge), group by entity type.
    // Threshold: more than n/3 clusters, but at least 8 minimum before triggering.
    const degenerateThreshold = Math.max(8, Math.ceil(nodes.length / 3))
    if (count > degenerateThreshold) {
      const typeToId = new Map<string, number>()
      let nextTypeId = 0
      const typeCommunities = new Map<string, number>()
      for (const node of nodes) {
        if (!typeToId.has(node.type)) typeToId.set(node.type, nextTypeId++)
        typeCommunities.set(node.id, typeToId.get(node.type)!)
      }
      communities = typeCommunities
      count = nextTypeId
    }

    for (const node of nodes) {
      node.clusterId = communities.get(node.id) ?? 0
    }

    // Build cluster summaries
    const overrides = this.loadOverrides()
    const clusterMap = new Map<number, { members: GalaxyNode[]; typeCounts: Map<string, number> }>()
    for (const node of nodes) {
      let entry = clusterMap.get(node.clusterId)
      if (!entry) {
        entry = { members: [], typeCounts: new Map() }
        clusterMap.set(node.clusterId, entry)
      }
      entry.members.push(node)
      entry.typeCounts.set(node.type, (entry.typeCounts.get(node.type) ?? 0) + 1)
    }

    const now = Date.now()
    const NINETY_DAYS = 90 * 86400_000
    const clusters: GalaxyCluster[] = []
    for (let i = 0; i < count; i++) {
      const entry = clusterMap.get(i)
      if (!entry || entry.members.length === 0) continue
      // Top member by degree
      const top = entry.members.reduce((a, b) => (b.degree > a.degree ? b : a))
      const dominantType = Array.from(entry.typeCounts.entries()).reduce(
        (a, b) => (b[1] > a[1] ? b : a)
      )[0]
      const recent = entry.members.filter((m) => {
        const t = Date.parse(m.modifiedAt)
        return Number.isFinite(t) && now - t < NINETY_DAYS
      }).length
      const activity = entry.members.length > 0 ? recent / entry.members.length : 0

      // label = top member name (unique per cluster, meaningful).
      // typeLabel = dominant entity type category (context, shown smaller).
      // Custom overrides are persisted keyed by the top member name.
      const typeLabel = TYPE_LABELS[dominantType] ?? dominantType
      clusters.push({
        id: i,
        label: top.label,
        typeLabel,
        customLabel: overrides.byTopMember[top.label] ?? null,
        color: TYPE_COLORS[dominantType] || '#94a3b8',
        memberIds: entry.members.map((m) => m.id),
        activity
      })
    }

    // ── Comets (library docs) ────────────────────────────────────────────
    const comets: GalaxyComet[] = []
    try {
      const rawDb = this.db.getDb()
      const libDocs = rawDb
        .prepare(
          "SELECT id, title, filename, path, added_at FROM library_documents WHERE status = 'indexed'"
        )
        .all() as Array<{
        id: string
        title: string | null
        filename: string
        path: string
        added_at: string
      }>

      const libLinks = rawDb
        .prepare('SELECT document_id, entity_id FROM library_links')
        .all() as Array<{ document_id: string; entity_id: number }>
      const fileLibLinks = rawDb
        .prepare(
          'SELECT fl.document_id, e.id as entity_id FROM file_library_links fl JOIN entities e ON e.file_path = fl.file_path'
        )
        .all() as Array<{ document_id: string; entity_id: number }>

      const targetsByDoc = new Map<string, Set<string>>()
      for (const l of libLinks) {
        if (!entityIds.has(String(l.entity_id))) continue
        let s = targetsByDoc.get(l.document_id)
        if (!s) {
          s = new Set()
          targetsByDoc.set(l.document_id, s)
        }
        s.add(String(l.entity_id))
      }
      for (const l of fileLibLinks) {
        if (!entityIds.has(String(l.entity_id))) continue
        let s = targetsByDoc.get(l.document_id)
        if (!s) {
          s = new Set()
          targetsByDoc.set(l.document_id, s)
        }
        s.add(String(l.entity_id))
      }

      for (const doc of libDocs) {
        const targets = targetsByDoc.get(doc.id)
        if (!targets || targets.size === 0) continue
        comets.push({
          id: doc.id,
          label: doc.title || doc.filename,
          filePath: doc.path,
          addedAt: doc.added_at,
          targetEntityIds: Array.from(targets)
        })
      }
    } catch {
      // library tables may not exist
    }

    // ── Constellations (Fiches) ──────────────────────────────────────────
    const constellations: GalaxyConstellation[] = []
    const entityNameToId = new Map<string, string>()
    for (const e of entities) {
      entityNameToId.set(e.name.toLowerCase(), String(e.id))
      for (const a of e.aliases) entityNameToId.set(a.toLowerCase(), String(e.id))
    }

    try {
      const ficheFiles = await this.files.listMarkdownFiles('Fiches')
      for (const fp of ficheFiles) {
        const file = await this.files.readFile(fp)
        if (!file) continue
        const wikilinks = Array.from(file.body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g))
        const ids = new Set<string>()
        for (const match of wikilinks) {
          const name = match[1].trim().toLowerCase()
          const id = entityNameToId.get(name)
          if (id) ids.add(id)
        }
        if (ids.size < 2) continue
        const fm = file.frontmatter
        const subject = (fm.subject as string) || fp.split('/').pop() || fp
        const rawCreated = fm.created
        const createdAt =
          rawCreated instanceof Date
            ? rawCreated.toISOString()
            : String(rawCreated || new Date().toISOString())
        constellations.push({
          filePath: fp,
          label: subject,
          createdAt,
          entityIds: Array.from(ids)
        })
      }
    } catch (err) {
      console.error('[GalaxyService] fiches read failed:', err)
    }

    // ── Time range ───────────────────────────────────────────────────────
    let minT = Infinity
    let maxT = -Infinity
    for (const n of nodes) {
      const t = Date.parse(n.createdAt)
      if (Number.isFinite(t)) {
        if (t < minT) minT = t
        if (t > maxT) maxT = t
      }
    }
    if (!Number.isFinite(minT)) {
      minT = Date.now() - 30 * 86400_000
      maxT = Date.now()
    }

    return {
      nodes,
      edges,
      clusters,
      comets,
      constellations,
      timeRange: {
        min: new Date(minT).toISOString(),
        max: new Date(maxT).toISOString()
      }
    }
  }

  renameCluster(topMemberLabel: string, newLabel: string): void {
    const o = this.loadOverrides()
    if (newLabel.trim()) {
      o.byTopMember[topMemberLabel] = newLabel.trim()
    } else {
      delete o.byTopMember[topMemberLabel]
    }
    this.saveOverrides(o)
  }
}
