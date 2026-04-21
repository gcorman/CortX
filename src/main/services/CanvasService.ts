import * as fs from 'fs'
import { join } from 'path'
import type {
  CanvasConfig,
  CanvasSummary,
  CanvasNode,
  CanvasEdge,
  AgentCanvasSuggestion
} from '../../shared/types'
import type { DatabaseService } from './DatabaseService'
import type { LLMService } from './LLMService'

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'canvas'
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export class CanvasService {
  constructor(
    private basePath: string,
    private db: DatabaseService,
    private llm: LLMService
  ) {}

  setBasePath(basePath: string): void {
    this.basePath = basePath
  }

  private get canvasDir(): string {
    return join(this.basePath, '_System', 'canvases')
  }

  private ensureDir(): void {
    fs.mkdirSync(this.canvasDir, { recursive: true })
  }

  private pathFor(id: string): string {
    return join(this.canvasDir, `${id}.json`)
  }

  list(): CanvasSummary[] {
    this.ensureDir()
    const files = fs.readdirSync(this.canvasDir).filter((f) => f.endsWith('.json'))
    const summaries: CanvasSummary[] = []
    for (const f of files) {
      try {
        const raw = fs.readFileSync(join(this.canvasDir, f), 'utf-8')
        const config = JSON.parse(raw) as CanvasConfig
        summaries.push({
          id: config.id,
          name: config.name,
          description: config.description,
          created: config.created,
          modified: config.modified,
          nodeCount: config.nodes.length,
          edgeCount: config.edges.length
        })
      } catch {
        // skip malformed
      }
    }
    return summaries.sort((a, b) => b.modified.localeCompare(a.modified))
  }

  load(id: string): CanvasConfig | null {
    try {
      const raw = fs.readFileSync(this.pathFor(id), 'utf-8')
      return JSON.parse(raw) as CanvasConfig
    } catch {
      return null
    }
  }

  save(config: CanvasConfig): void {
    this.ensureDir()
    const updated: CanvasConfig = { ...config, modified: new Date().toISOString() }
    fs.writeFileSync(this.pathFor(config.id), JSON.stringify(updated, null, 2), 'utf-8')
  }

  create(name: string): CanvasConfig {
    this.ensureDir()
    const now = new Date().toISOString()
    const base = slugify(name)
    let id = base
    let i = 2
    while (fs.existsSync(this.pathFor(id))) {
      id = `${base}-${i++}`
    }
    const config: CanvasConfig = {
      id,
      name,
      created: now,
      modified: now,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
    fs.writeFileSync(this.pathFor(id), JSON.stringify(config, null, 2), 'utf-8')
    return config
  }

  delete(id: string): void {
    try {
      fs.unlinkSync(this.pathFor(id))
    } catch {
      // already gone
    }
  }

  rename(id: string, newName: string): void {
    const cfg = this.load(id)
    if (!cfg) return
    cfg.name = newName
    cfg.modified = new Date().toISOString()
    this.save(cfg)
  }

  /**
   * Ask the LLM to suggest nodes + edges to add to an existing canvas, given a user prompt.
   * The agent can reference KB entities (returned with real filePaths) and propose sticky notes.
   */
  async agentSuggest(canvasId: string, prompt: string): Promise<AgentCanvasSuggestion> {
    const canvas = this.load(canvasId)
    const existingEntityPaths = new Set(
      (canvas?.nodes || []).filter((n) => n.kind === 'entity').map((n) => n.data.filePath)
    )

    const allFiles = this.db.getFiles().slice(0, 200)
    const kbCatalog = allFiles
      .map((f) => `- "${f.title}" | type=${f.type} | path=${f.path}`)
      .join('\n')

    const existingNodes = (canvas?.nodes || [])
      .slice(0, 30)
      .map((n) => {
        if (n.kind === 'entity') return `- entity "${n.data.title}" (${n.data.filePath})`
        if (n.kind === 'note') return `- note "${(n.data.text || '').slice(0, 60)}"`
        return `- group "${n.data.text || ''}"`
      })
      .join('\n')

    const systemPrompt = `Tu aides un utilisateur à construire un canvas spatial de connaissances.
Tu reçois un prompt et tu proposes des TUILES à ajouter au canvas. Deux types:
- "entity": référence un fichier existant de la base de connaissances (filePath copié EXACTEMENT depuis le catalogue)
- "note": texte libre (2-30 mots) pour commenter ou ponctuer

RÈGLES STRICTES:
- Les entités DOIVENT copier un filePath du catalogue à l'identique (ne reformule pas, ne traduis pas, ne raccourcis pas)
- Ne duplique pas les entités déjà présentes dans le canvas
- Propose 3 à 8 tuiles au total (au moins une entity quand le catalogue contient des éléments pertinents)
- Propose 0 à 6 edges reliant des tuiles (par indices), avec un label court optionnel (2-5 mots)
- Les couleurs de notes: teal, orange, purple, blue, pink, neutral
- Les positions x/y sont optionnelles (le client les recalcule si absentes)

Réponds UNIQUEMENT en JSON valide, sans texte autour, sans \`\`\`. Format:
{
  "summary": "court résumé en 1 phrase",
  "nodes": [
    { "kind": "entity", "filePath": "Reseau/Nom.md" },
    { "kind": "note", "text": "Idée courte", "color": "teal" }
  ],
  "edges": [ { "sourceIdx": 0, "targetIdx": 1, "label": "lien" } ]
}`

    const userMessage = `CATALOGUE KB (extrait):
${kbCatalog}

CANVAS ACTUEL (${canvas?.name || 'nouveau'}):
${existingNodes || '(vide)'}

PROMPT UTILISATEUR:
${prompt}

Propose les tuiles et liens à ajouter.`

    const raw = await this.llm.sendMessage([{ role: 'user', content: userMessage }], systemPrompt)
    console.log('[CanvasService.agentSuggest] raw LLM output:\n', raw.slice(0, 2000))

    const parsed = this.parseSuggestion(raw, existingEntityPaths, allFiles)
    console.log(`[CanvasService.agentSuggest] parsed nodes=${parsed.nodes.length} edges=${parsed.edges.length}`)
    return parsed
  }

  private extractJson(raw: string): string | null {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced && fenced[1]) return fenced[1].trim()
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first >= 0 && last > first) return raw.slice(first, last + 1)
    return null
  }

  private parseSuggestion(
    raw: string,
    existingEntityPaths: Set<string | undefined>,
    allFiles: Array<{ path: string; title: string; type: string }>
  ): AgentCanvasSuggestion {
    const fallback: AgentCanvasSuggestion = { nodes: [], edges: [], summary: '' }

    const jsonStr = this.extractJson(raw)
    if (!jsonStr) {
      console.warn('[CanvasService] no JSON block found in LLM response')
      return fallback
    }

    type LLMNode = {
      kind?: string
      type?: string
      filePath?: string
      path?: string
      file?: string
      title?: string
      text?: string
      content?: string
      color?: string
      x?: number
      y?: number
    }
    type LLMEdge = {
      sourceIdx?: number
      targetIdx?: number
      source?: number | string
      target?: number | string
      label?: string
    }

    let parsed: { summary?: string; nodes?: LLMNode[]; edges?: LLMEdge[] }
    try {
      parsed = JSON.parse(jsonStr)
    } catch (err) {
      console.warn('[CanvasService] JSON.parse failed:', err instanceof Error ? err.message : err)
      return fallback
    }

    const pathLookup = new Map(allFiles.map((f) => [f.path, f]))
    const titleLookup = new Map(
      allFiles.map((f) => [f.title.toLowerCase().trim(), f] as const)
    )

    const resolveFile = (n: LLMNode): { path: string; title: string; type: string } | null => {
      const candidatePath = n.filePath || n.path || n.file
      if (candidatePath) {
        const exact = pathLookup.get(candidatePath)
        if (exact) return exact
        // try case-insensitive + slash normalization
        const norm = candidatePath.replace(/\\/g, '/').toLowerCase()
        for (const [k, v] of pathLookup) {
          if (k.replace(/\\/g, '/').toLowerCase() === norm) return v
        }
      }
      const candidateTitle = (n.title || '').toLowerCase().trim()
      if (candidateTitle) {
        const byTitle = titleLookup.get(candidateTitle)
        if (byTitle) return byTitle
      }
      return null
    }

    const nodes: CanvasNode[] = []
    const indexToId = new Map<number, string>()
    const rawNodes = parsed.nodes || []

    rawNodes.forEach((n, idx) => {
      const pos = { x: Number(n.x) || 0, y: Number(n.y) || 0 }
      const kind = String(n.kind || n.type || '').toLowerCase()
      const looksEntity = kind === 'entity' || !!(n.filePath || n.path || n.file)

      if (looksEntity) {
        const file = resolveFile(n)
        if (!file) {
          console.warn('[CanvasService] entity node skipped (path/title not found):', n.filePath || n.path || n.title)
          return
        }
        if (existingEntityPaths.has(file.path)) return
        const id = randomId('n')
        indexToId.set(idx, id)
        nodes.push({
          id,
          kind: 'entity',
          position: pos,
          data: { filePath: file.path, title: file.title, entityType: file.type }
        })
        return
      }

      const text = n.text || n.content
      if (text) {
        const validColors = ['teal', 'orange', 'purple', 'blue', 'pink', 'neutral'] as const
        const color = validColors.includes(n.color as typeof validColors[number])
          ? (n.color as typeof validColors[number])
          : 'neutral'
        const id = randomId('n')
        indexToId.set(idx, id)
        nodes.push({ id, kind: 'note', position: pos, data: { text: String(text).slice(0, 400), color } })
      }
    })

    // Spread default positions in a grid if LLM didn't provide any (or all at 0,0)
    const allAtOrigin = nodes.every((n) => n.position.x === 0 && n.position.y === 0)
    if (allAtOrigin && nodes.length > 0) {
      const cols = Math.min(3, nodes.length)
      const spacingX = 260
      const spacingY = 180
      nodes.forEach((n, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        n.position = {
          x: col * spacingX - ((cols - 1) * spacingX) / 2,
          y: row * spacingY
        }
      })
    }

    const edges: CanvasEdge[] = (parsed.edges || [])
      .map((e) => {
        const si = typeof e.sourceIdx === 'number' ? e.sourceIdx : Number(e.source)
        const ti = typeof e.targetIdx === 'number' ? e.targetIdx : Number(e.target)
        const source = Number.isFinite(si) ? indexToId.get(si) : undefined
        const target = Number.isFinite(ti) ? indexToId.get(ti) : undefined
        if (!source || !target || source === target) return null
        return {
          id: randomId('e'),
          source,
          target,
          label: e.label ? String(e.label).slice(0, 40) : undefined,
          kind: 'freeform' as const
        }
      })
      .filter((e): e is CanvasEdge => e !== null)

    return { nodes, edges, summary: String(parsed.summary || '').slice(0, 200) }
  }
}
