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
import { webService } from './WebService'

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
  async agentSuggest(canvasId: string, prompt: string, useInternet = false): Promise<AgentCanvasSuggestion> {
    const canvas = this.load(canvasId)
    const existingEntityPaths = new Set(
      (canvas?.nodes || []).filter((n) => n.kind === 'entity').map((n) => n.data.filePath)
    )

    const allFiles = this.db.getFiles().slice(0, 200)
    console.log(`[CanvasService.agentSuggest] catalog size: ${allFiles.length} files`)

    // Numbered catalog — LLM returns idx instead of copying a path string
    const kbCatalog = allFiles.length > 0
      ? allFiles.map((f, i) => `[${i}] "${f.title}" | ${f.type}`).join('\n')
      : '(aucun fichier indexé)'

    const existingNodes = (canvas?.nodes || [])
      .slice(0, 30)
      .map((n) => {
        if (n.kind === 'entity') return `- entity "${n.data.title}"`
        if (n.kind === 'note') return `- note "${(n.data.text || '').slice(0, 60)}"`
        return `- group "${n.data.text || ''}"`
      })
      .join('\n')

    const internetBlock = useInternet ? `
MODE INTERNET ACTIF — des sources web sont fournies en contexte.
Tu DOIS impérativement:
- Créer au moins 3 notes avec des faits CONCRETS issus des sources (chiffres, acteurs, réglementations, sites géographiques, dates clés)
- Utiliser des couleurs variées pour les notes web: orange pour les risques, blue pour les acteurs/réglementations, teal pour les contextes
- Les notes doivent être informatives et précises, pas génériques (ex: "INERIS: 1300 sites SEVESO en France" vaut mieux que "Sites industriels")
- Tu peux proposer jusqu'à 12 tuiles au total
` : ''

    const systemPrompt = `Tu aides un utilisateur à construire un canvas spatial de connaissances.
Tu reçois un prompt et tu proposes des TUILES à ajouter au canvas. Deux types:
- "entity": référence une entrée du catalogue KB par son numéro (champ "idx")
- "note": texte libre (5-40 mots) pour annoter, contextualiser ou apporter une information web
${internetBlock}
RÈGLES STRICTES:
- Les entités utilisent "idx" = le numéro entre crochets dans le catalogue (ex: [3] → "idx": 3)
- Ne duplique pas les entités déjà présentes dans le canvas
- Propose ${useInternet ? '6 à 12' : '3 à 8'} tuiles au total (au moins une entity quand le catalogue contient des éléments pertinents)
- Propose 0 à ${useInternet ? '10' : '6'} edges reliant des tuiles (par leur position dans le tableau nodes), avec un label court (2-5 mots)
- Les couleurs de notes: teal, orange, purple, blue, pink, neutral

Réponds UNIQUEMENT en JSON valide, sans texte autour, sans \`\`\`. Format:
{
  "summary": "court résumé en 1 phrase",
  "nodes": [
    { "kind": "entity", "idx": 3 },
    { "kind": "note", "text": "Idée courte", "color": "teal" }
  ],
  "edges": [ { "sourceIdx": 0, "targetIdx": 1, "label": "lien" } ]
}`

    // Optional web context — use deterministic keyword extraction for the search query.
    // (LLM distillation was unreliable: reasoning models prefixed answers with "*  Input:" etc.)
    let webContext = ''
    if (useInternet) {
      try {
        const searchQuery = this.distillSearchQuery(prompt)
        const result = await webService.searchAndFetch(searchQuery, { limit: 5, perPageChars: 3500 })
        webContext = webService.formatSearchAsContext(result)
        console.log(`[CanvasService.agentSuggest] web context: ${webContext.length} chars from query: "${searchQuery}"`)
      } catch (err) {
        console.warn('[CanvasService.agentSuggest] web search failed:', err)
      }
    }

    const userMessage = `CATALOGUE KB (extrait):
${kbCatalog}
${webContext ? `\nSOURCES WEB RÉCUPÉRÉES:\n${webContext}\n` : ''}
CANVAS ACTUEL (${canvas?.name || 'nouveau'}):
${existingNodes || '(vide)'}

PROMPT UTILISATEUR:
${prompt}

Propose les tuiles et liens à ajouter.`

    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: userMessage }
    ]
    let raw = await this.llm.sendMessage(messages, systemPrompt)
    console.log('[CanvasService.agentSuggest] raw LLM output:\n', raw.slice(0, 2000))

    // If the first pass returned reasoning / no JSON, do a dedicated extraction pass
    // (replaces the old follow-up, which triggered yet more reasoning with Gemini).
    if (!this.extractJson(raw)) {
      console.log('[CanvasService.agentSuggest] no JSON in first pass — extraction pass')
      const extractSys = 'Tu convertis une analyse de canvas en JSON strict. Tu réponds UNIQUEMENT avec du JSON valide. Pas de texte, pas de raisonnement, pas de markdown, pas de ```.'
      const extractMsg = `Convertis cette analyse en JSON selon ce schéma exact:
{
  "summary": "résumé 1 phrase",
  "nodes": [
    {"kind":"entity","idx":<numéro du catalogue>},
    {"kind":"note","text":"<texte 5-40 mots>","color":"<teal|orange|purple|blue|pink|neutral>"}
  ],
  "edges": [{"sourceIdx":<position dans nodes>,"targetIdx":<position dans nodes>,"label":"<2-5 mots>"}]
}

ANALYSE À CONVERTIR:
${raw}

CATALOGUE KB (pour retrouver les idx):
${kbCatalog.slice(0, 3000)}

JSON UNIQUEMENT:`
      try {
        const extracted = await this.llm.sendMessage(
          [{ role: 'user', content: extractMsg }],
          extractSys
        )
        console.log('[CanvasService.agentSuggest] extraction output:\n', extracted.slice(0, 1500))
        if (this.extractJson(extracted)) raw = extracted
        else raw = raw + '\n\n' + extracted  // keep both for multi-strategy parser
      } catch (err) {
        console.warn('[CanvasService.agentSuggest] extraction pass failed:', err)
      }
    }

    const parsed = this.parseSuggestion(raw, existingEntityPaths, allFiles, allFiles.length, useInternet)
    console.log(`[CanvasService.agentSuggest] parsed nodes=${parsed.nodes.length} edges=${parsed.edges.length} debug="${parsed._debug}"`)
    return parsed
  }

  /**
   * Deterministic keyword extraction for a web-search query.
   * Strips French/English stopwords and generic canvas verbs; keeps ≤8 meaningful terms.
   */
  private distillSearchQuery(prompt: string): string {
    const stopwords = new Set([
      // articles / prépositions / pronoms FR
      'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'où', 'dans', 'sur',
      'par', 'pour', 'au', 'aux', 'avec', 'ce', 'ces', 'cet', 'cette', 'tout', 'tous', 'toutes',
      'est', 'sont', 'être', 'fait', 'faire', 'son', 'sa', 'ses', 'leur', 'leurs',
      'qui', 'que', 'quoi', 'dont', 'quel', 'quels', 'quelle', 'quelles',
      'comment', 'quand', 'pourquoi', 'notamment', 'principales', 'principaux', 'plus', 'mondiales',
      'mondiaux', 'tous', 'toutes',
      // anglais
      'the', 'and', 'of', 'in', 'on', 'for', 'to', 'with', 'by', 'is', 'are', 'this', 'that',
      'all', 'from', 'about', 'which', 'what', 'when', 'where', 'why', 'how', 'main', 'most',
      // verbes spécifiques canvas
      'cartographie', 'cartographier', 'liste', 'lister', 'recense', 'recenser', 'identifie',
      'identifier', 'montre', 'montrer', 'affiche', 'afficher'
    ])
    const words = prompt
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')  // strip accents for stopword match
      .replace(/[,.;:!?"()[\]{}\\/]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopwords.has(w))
    // Keep original-cased version of each kept keyword for readability
    const lowerSet = new Set(words.slice(0, 8))
    const original = prompt.split(/\s+/).filter((w) => {
      const norm = w.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
      return lowerSet.has(norm)
    })
    const query = (original.length > 0 ? original.slice(0, 8) : words.slice(0, 8)).join(' ')
    return query.slice(0, 120) || prompt.slice(0, 100)
  }

  /**
   * Scan raw string for first complete balanced JSON object or array.
   * Avoids the bug where first+lastIndexOf spans across multiple objects.
   */
  private extractFirstBalancedJson(raw: string): string | null {
    const start = raw.search(/[{[]/)
    if (start < 0) return null
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i]
      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{' || ch === '[') depth++
      if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0) return raw.slice(start, i + 1)
      }
    }
    return null
  }

  /**
   * Try to find a JSON object that looks like the expected shape
   * { summary, nodes, edges } anywhere in the response.
   */
  private extractJson(raw: string): string | null {
    // 1. Fenced code block
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) return fenced[1].trim()
    // 2. First balanced JSON object that contains a "nodes" key
    let offset = 0
    while (offset < raw.length) {
      const slice = raw.slice(offset)
      const start = slice.search(/\{/)
      if (start < 0) break
      const candidate = this.extractFirstBalancedJson(slice.slice(start))
      if (candidate) {
        if (/"nodes"\s*:/.test(candidate)) return candidate
        offset += start + 1  // skip this object, keep searching
      } else {
        break
      }
    }
    // 3. First balanced JSON object/array (any)
    return this.extractFirstBalancedJson(raw)
  }

  /**
   * Fallback: parse a model response where nodes appear as standalone JSON
   * objects (any of: `N: {...}`, `* {...}`, `- {...}`, bare `{...}` on a line)
   * and edges as `N -> M` patterns — common "reasoning mode" output.
   */
  private parseNumberedListFormat(raw: string): {
    summary: string
    nodes: Array<Record<string, unknown>>
    edges: Array<{ sourceIdx: number; targetIdx: number; label?: string }>
  } | null {
    const rawNodes: Array<Record<string, unknown>> = []
    let m: RegExpExecArray | null

    // ── Strategy A: inline JSON objects `{ ... }` (bullet lists) ──────────
    const objRegex = /\{[^{}]+\}/g
    while ((m = objRegex.exec(raw)) !== null) {
      try {
        const obj = JSON.parse(m[0]) as Record<string, unknown>
        if (obj.kind || obj.idx !== undefined || obj.text || obj.filePath) {
          rawNodes.push(obj)
        }
      } catch { /* skip malformed */ }
    }

    // ── Strategy B: "Node N: Entity [idx] (Name)" / "Node N: Note "text" (color)" ─
    if (rawNodes.length === 0) {
      // Entity lines — two sub-formats:
      //   old: "Node 0: Entity [38] (BITD)"
      //   new: "Node 0: Entity [38] "Nucléaire" (Central theme)"
      // m[1]=nodePos, m[2]=kbIdx, m[3]=quotedTitle, m[4]=parenDesc
      const entityRx = /\bNode\s+(\d+):\s+Entity\s+\[(\d+)\](?:\s*"([^"]+)")?(?:\s*\(([^)]+)\))?/gi
      while ((m = entityRx.exec(raw)) !== null) {
        rawNodes.push({
          kind: 'entity',
          idx: parseInt(m[2], 10),
          _nodePos: parseInt(m[1], 10),
          _name: m[3]?.trim() ?? m[4]?.trim() ?? ''  // prefer quoted title, fall back to paren desc
        })
      }
      // Note lines: `Node 1: Note "text" (color)` or `Node 1: Note "text"`
      const noteRx = /\bNode\s+(\d+):\s+Note\s+"([^"]+)"(?:\s*\((\w+)\))?/gi
      while ((m = noteRx.exec(raw)) !== null) {
        rawNodes.push({
          kind: 'note',
          text: m[2],
          color: m[3] ?? 'neutral',
          _nodePos: parseInt(m[1], 10),
          _name: m[2]  // use note text as name for edge resolution
        })
      }
      // Sort by original node position so array index = node position
      rawNodes.sort((a, b) => ((a._nodePos as number) ?? 0) - ((b._nodePos as number) ?? 0))
    }

    // ── Strategy C: loose Gemini-reasoning format ──────────────────────────
    // Sub-patterns handled:
    //   C1: `*Node N (Entity):* [kbIdx] Name`      — explicit numbered entity
    //   C2: `*Node N (Note - Color):* "text"`       — explicit numbered note
    //   C3: `*Note N (Context - Color):* "text"`    — standalone note (earlier format)
    //   C4: `[N] Name (desc)` inline fallback       — deduped by KB idx
    if (rawNodes.length === 0) {
      const validColors = ['teal', 'orange', 'purple', 'blue', 'pink', 'neutral'] as const
      const colorMap: Record<string, typeof validColors[number]> = {
        teal: 'teal', orange: 'orange', purple: 'purple', blue: 'blue', pink: 'pink', neutral: 'neutral',
        rose: 'pink', rouge: 'orange', bleu: 'blue', violet: 'purple', vert: 'teal', jaune: 'orange'
      }
      const seenNoteNum = new Set<number>()
      const seenKbIdx = new Set<number>()

      // C1: `*Node 1 (Entity):* [43] DARPA (description)`
      const entityNodeRx = /\*?\s*Node\s+(\d+)\s*\(Entity[^)]*\)\s*:\s*\*?\s*\[(\d+)\]\s+([A-Za-zÀ-ÿ][^(\n,\[]{1,60}?)(?=\s*[(.:\n,\[]|$)/gi
      while ((m = entityNodeRx.exec(raw)) !== null) {
        const kbIdx = parseInt(m[2], 10)
        if (seenKbIdx.has(kbIdx)) continue
        seenKbIdx.add(kbIdx)
        rawNodes.push({
          kind: 'entity', idx: kbIdx,
          _nodePos: parseInt(m[1], 10) - 1,
          _name: m[3].trim().replace(/[\s.,]+$/, '')
        })
      }

      // C2: `*Node 4 (Note - Teal):* "USA: 70% of notable AI models..."`
      const noteNodeRx = /\*?\s*Node\s+(\d+)\s*\(Note[^)]*?(teal|orange|purple|blue|pink|neutral|rose|rouge|bleu|violet)[^)]*\)\s*:\s*\*?\s*([^\n]{5,400})/gi
      while ((m = noteNodeRx.exec(raw)) !== null) {
        const noteNum = parseInt(m[1], 10)
        if (seenNoteNum.has(noteNum)) continue
        seenNoteNum.add(noteNum)
        const color = colorMap[m[2].toLowerCase()] ?? 'neutral'
        const line = m[3].trim()
        const quoted = line.match(/"([^"]{8,300})"/)
        const text = (quoted?.[1] ?? line).replace(/\s*\(Source[^)]*\)\s*$/i, '').trim().slice(0, 300)
        if (text.length >= 6) {
          rawNodes.push({ kind: 'note', text, color, _nodePos: noteNum - 1, _name: text.slice(0, 40) })
        }
      }

      // C3: `*Note 1 (Context - Teal):* "text"` — standalone note (earlier Gemini format)
      const noteRxLoose = /\*?\s*Note\s+(\d+)\s*\(([^)]*?(teal|orange|purple|blue|pink|neutral|rose|rouge|bleu|violet|vert|jaune)[^)]*)\)\s*:\s*\*?([^\n]{5,400})/gi
      while ((m = noteRxLoose.exec(raw)) !== null) {
        const noteNum = parseInt(m[1], 10)
        if (seenNoteNum.has(noteNum)) continue
        seenNoteNum.add(noteNum)
        const color = colorMap[m[3].toLowerCase()] ?? 'neutral'
        const line = m[4].trim()
        const quoted = line.match(/"([^"]{8,300})"/)
        const text = (quoted?.[1] ?? line).replace(/\s*\(Source[^)]*\)\s*$/i, '').trim().slice(0, 300)
        if (text.length >= 6) {
          rawNodes.push({ kind: 'note', text, color, _nodePos: noteNum + 100, _name: text.slice(0, 40) })
        }
      }

      // C4: `[N] Name (desc)` or `[N] "Name"` — inline entity fallback, deduped
      const entityRxLoose = /\[(\d+)\]\s+(?:"([^"]+)"|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s\-'&.]{1,50}?))(?=\s*[,.(:\n\[]|$)/g
      let c4Pos = 500
      while ((m = entityRxLoose.exec(raw)) !== null) {
        const kbIdx = parseInt(m[1], 10)
        if (seenKbIdx.has(kbIdx)) continue
        seenKbIdx.add(kbIdx)
        const name = (m[2] ?? m[3] ?? '').trim().replace(/[\s.,]+$/, '')
        if (name.length < 2) continue
        rawNodes.push({ kind: 'entity', idx: kbIdx, _nodePos: c4Pos++, _name: name })
      }
    }

    if (rawNodes.length === 0) return null

    // ── Name → array-index map (used by Format C named-edge parser) ───────
    const nameToIdx = new Map<string, number>()
    rawNodes.forEach((n, arrayIdx) => {
      const name = String(n._name || n.text || '').toLowerCase().trim()
      if (name) nameToIdx.set(name, arrayIdx)
    })

    // ── Edges ──────────────────────────────────────────────────────────────
    const edges: Array<{ sourceIdx: number; targetIdx: number; label?: string }> = []

    // Format A: `0 -> 1 (label)` — plain numbers
    const edgeRxA = /\b(\d+)\s*->\s*(\d+)\s*(?:\(([^)]+)\))?/g
    while ((m = edgeRxA.exec(raw)) !== null) {
      const rawLabel = m[3]?.trim()
      const label = rawLabel
        ? rawLabel.replace(/^label:\s*"?([^"]*)"?\s*$/, '$1').trim() || rawLabel
        : undefined
      edges.push({ sourceIdx: parseInt(m[1], 10), targetIdx: parseInt(m[2], 10), label })
    }

    // Format B: `Node 0 -> Node 1`
    if (edges.length === 0) {
      const edgeRxB = /Node\s+(\d+)\s*->\s*Node\s+(\d+)/gi
      while ((m = edgeRxB.exec(raw)) !== null) {
        edges.push({ sourceIdx: parseInt(m[1], 10), targetIdx: parseInt(m[2], 10) })
      }
    }

    // Format C: "EntityName -> OtherName (label)" — model uses captured entity names
    if (edges.length === 0 && nameToIdx.size > 0) {
      const resolveIdx = (name: string): number | undefined => {
        const key = name.toLowerCase().trim()
        if (nameToIdx.has(key)) return nameToIdx.get(key)
        // Partial / substring match
        for (const [k, v] of nameToIdx) {
          if (key.includes(k) || k.includes(key)) return v
        }
        return undefined
      }
      // Match lines like: `* BITD -> Airbus (Member)` or `- BITD -> Airbus`
      const edgeRxC = /^\s*[-*•]?\s*(.+?)\s*->\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/gm
      while ((m = edgeRxC.exec(raw)) !== null) {
        const si = resolveIdx(m[1])
        const ti = resolveIdx(m[2])
        if (si !== undefined && ti !== undefined && si !== ti) {
          edges.push({ sourceIdx: si, targetIdx: ti, label: m[3]?.trim() })
        }
      }
    }

    // Format D: `[37] (Nucléaire) -> [56] (ASN) : "label"` — bracket-index refs mixing KB indices and node positions
    // Build dual lookup: nodePos first (lower priority), KB idx second (higher priority)
    if (edges.length === 0) {
      const numToArrayIdx = new Map<number, number>()
      rawNodes.forEach((n, arrayIdx) => {
        const pos = n._nodePos as number
        if (!isNaN(pos)) numToArrayIdx.set(pos, arrayIdx)
      })
      rawNodes.forEach((n, arrayIdx) => {
        const kbIdx = n.idx as number | undefined
        if (kbIdx !== undefined && !isNaN(kbIdx)) numToArrayIdx.set(kbIdx, arrayIdx)
      })
      // Match: `[37] (Name) -> [56] (Name) : "label"` or `[37] (Name) -> [56] (Name)`
      const edgeRxD = /\[(\d+)\]\s*\([^)]+\)\s*->\s*\[(\d+)\]\s*\([^)]+\)(?:[^"\n]*"([^"]+)")?/g
      while ((m = edgeRxD.exec(raw)) !== null) {
        const si = numToArrayIdx.get(parseInt(m[1], 10))
        const ti = numToArrayIdx.get(parseInt(m[2], 10))
        if (si !== undefined && ti !== undefined && si !== ti) {
          edges.push({ sourceIdx: si, targetIdx: ti, label: m[3]?.trim() })
        }
      }
    }

    // Extract summary
    const summaryMatch = raw.match(/[Ss]ummary[^"]*"([^"]{5,})"/)
    const summary = summaryMatch?.[1] ?? ''

    return { summary, nodes: rawNodes, edges }
  }

  private parseSuggestion(
    raw: string,
    existingEntityPaths: Set<string | undefined>,
    allFiles: Array<{ path: string; title: string; type: string }>,
    catalogCount: number,
    internetMode = false
  ): AgentCanvasSuggestion {
    const fail = (msg: string): AgentCanvasSuggestion => {
      console.warn('[CanvasService.parseSuggestion]', msg)
      return { nodes: [], edges: [], summary: '', _debug: msg }
    }

    if (!raw?.trim()) return fail(`LLM returned empty response. catalog=${catalogCount} files`)

    type LLMNode = {
      kind?: string; type?: string
      idx?: number | string
      filePath?: string; path?: string; file?: string; title?: string
      text?: string; content?: string
      color?: string; x?: number; y?: number
    }
    type LLMEdge = {
      sourceIdx?: number; targetIdx?: number
      source?: number | string; target?: number | string
      label?: string
    }
    type ParsedShape = { summary?: string; nodes?: LLMNode[]; edges?: LLMEdge[] }

    // ── Strategy 1: standard JSON extraction ──────────────────────────────
    let parsed: ParsedShape | null = null
    const jsonStr = this.extractJson(raw)
    if (jsonStr) {
      try {
        parsed = JSON.parse(jsonStr) as ParsedShape
      } catch (err) {
        console.warn('[CanvasService] JSON.parse failed:', err instanceof Error ? err.message : err)
      }
    }

    // ── Strategy 2: numbered-list fallback (e.g. Gemini reasoning mode) ───
    if (!parsed || !parsed.nodes?.length) {
      const listed = this.parseNumberedListFormat(raw)
      if (listed) {
        console.log(`[CanvasService] using numbered-list fallback: ${listed.nodes.length} nodes`)
        parsed = {
          summary: listed.summary,
          nodes: listed.nodes as LLMNode[],
          edges: listed.edges
        }
      }
    }

    if (!parsed || !parsed.nodes?.length) {
      return fail(`No parseable nodes found. catalog=${catalogCount}. snippet: "${raw.slice(0, 120).replace(/\n/g, '↵')}"`)
    }

    // ── Resolve nodes ──────────────────────────────────────────────────────
    const pathLookup = new Map(allFiles.map((f) => [f.path, f]))
    const titleLookup = new Map(allFiles.map((f) => [f.title.toLowerCase().trim(), f] as const))

    const resolveFile = (n: LLMNode): { path: string; title: string; type: string } | null => {
      const rawIdx = n.idx
      const idxNum = typeof rawIdx === 'number' ? rawIdx
        : typeof rawIdx === 'string' ? parseInt(rawIdx, 10) : NaN
      if (!isNaN(idxNum) && idxNum >= 0 && idxNum < allFiles.length) return allFiles[idxNum]

      const candidatePath = n.filePath || n.path || n.file
      if (candidatePath) {
        const exact = pathLookup.get(candidatePath)
        if (exact) return exact
        const norm = candidatePath.replace(/\\/g, '/').toLowerCase()
        for (const [k, v] of pathLookup) {
          if (k.replace(/\\/g, '/').toLowerCase() === norm) return v
        }
        const fileName = norm.split('/').pop()
        if (fileName) {
          for (const [k, v] of pathLookup) {
            if (k.replace(/\\/g, '/').toLowerCase().split('/').pop() === fileName) return v
          }
        }
      }
      const candidateTitle = (n.title || '').toLowerCase().trim()
      if (candidateTitle) return titleLookup.get(candidateTitle) ?? null
      return null
    }

    const nodes: CanvasNode[] = []
    const indexToId = new Map<number, string>()
    const rawNodes = parsed.nodes ?? []
    let skipped = 0

    rawNodes.forEach((n, idx) => {
      const pos = { x: Number(n.x) || 0, y: Number(n.y) || 0 }
      const kind = String(n.kind || n.type || '').toLowerCase()
      const hasIdx = n.idx !== undefined && n.idx !== null
      const looksEntity = kind === 'entity' || hasIdx || !!(n.filePath || n.path || n.file)

      if (looksEntity) {
        const file = resolveFile(n)
        if (!file) {
          if (internetMode && (n.title || n.text)) {
            // Internet mode: unknown entity → sticky note so user can see it
            const noteText = String(n.title || n.text || '').slice(0, 200)
            const id = randomId('n')
            indexToId.set(idx, id)
            nodes.push({ id, kind: 'note', position: pos, data: { text: noteText, color: 'orange' } })
          } else {
            skipped++
            console.warn('[CanvasService] entity skipped:', { idx: n.idx, filePath: n.filePath, title: n.title })
          }
          return
        }
        if (existingEntityPaths.has(file.path)) return
        const id = randomId('n')
        indexToId.set(idx, id)
        nodes.push({ id, kind: 'entity', position: pos, data: { filePath: file.path, title: file.title, entityType: file.type } })
        return
      }

      const text = n.text || n.content
      if (text) {
        const validColors = ['teal', 'orange', 'purple', 'blue', 'pink', 'neutral'] as const
        const color = validColors.includes(n.color as typeof validColors[number]) ? (n.color as typeof validColors[number]) : 'neutral'
        const id = randomId('n')
        indexToId.set(idx, id)
        nodes.push({ id, kind: 'note', position: pos, data: { text: String(text).slice(0, 400), color } })
      }
    })

    if (nodes.length === 0) {
      return fail(`${rawNodes.length} node(s) proposed, all skipped (skipped=${skipped}). catalog=${catalogCount}. first: ${JSON.stringify(rawNodes[0]).slice(0, 80)}`)
    }

    // Build edges first — needed for hierarchical layout
    const edges: CanvasEdge[] = (parsed.edges ?? [])
      .map((e) => {
        const si = typeof e.sourceIdx === 'number' ? e.sourceIdx : Number(e.source)
        const ti = typeof e.targetIdx === 'number' ? e.targetIdx : Number(e.target)
        const source = Number.isFinite(si) ? indexToId.get(si) : undefined
        const target = Number.isFinite(ti) ? indexToId.get(ti) : undefined
        if (!source || !target || source === target) return null
        return { id: randomId('e'), source, target, label: e.label ? String(e.label).slice(0, 40) : undefined, kind: 'freeform' as const }
      })
      .filter((e): e is CanvasEdge => e !== null)

    // Auto-synthesize hub-and-spoke edges when model omitted them.
    // Without edges the layout degrades to a single vertical column — always worse than radial.
    if (edges.length === 0 && nodes.length >= 3) {
      const hub = nodes[0]  // first proposed node = most important per model ordering
      for (let i = 1; i < nodes.length; i++) {
        edges.push({ id: randomId('e'), source: hub.id, target: nodes[i].id, kind: 'freeform' as const })
      }
      console.log(`[CanvasService] auto-synthesized ${edges.length} edges from hub node[0]`)
    }

    // Layout: radial for hub-and-spoke, hierarchical otherwise
    if (nodes.every((n) => n.position.x === 0 && n.position.y === 0)) {
      const hubId = this.detectHub(edges)
      if (hubId) {
        this.applyRadialLayout(nodes, edges, hubId)
      } else {
        this.applyHierarchicalLayout(nodes, edges)
      }
    }

    return { nodes, edges, summary: String(parsed.summary ?? '').slice(0, 200) }
  }

  /**
   * Detect a hub node: one node that originates ≥60% of all edges.
   * Returns the hub node ID, or null if no clear hub.
   */
  private detectHub(edges: CanvasEdge[]): string | null {
    if (edges.length < 2) return null
    const outDegree = new Map<string, number>()
    for (const e of edges) {
      outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1)
    }
    let maxId = ''
    let maxCount = 0
    for (const [id, cnt] of outDegree) {
      if (cnt > maxCount) { maxCount = cnt; maxId = id }
    }
    return maxCount >= edges.length * 0.6 ? maxId : null
  }

  /**
   * Radial (hub-and-spoke) layout.
   * Hub placed at origin; all other nodes evenly distributed on a circle.
   */
  private applyRadialLayout(
    nodes: CanvasNode[],
    _edges: CanvasEdge[],
    hubId: string,
    radius = 350
  ): void {
    const hub = nodes.find((n) => n.id === hubId)
    if (!hub) return
    hub.position = { x: 0, y: 0 }
    const others = nodes.filter((n) => n.id !== hubId)
    if (others.length === 0) return
    const angleStep = (2 * Math.PI) / others.length
    // Start from top (−π/2) so first spoke points upward
    others.forEach((n, i) => {
      const angle = i * angleStep - Math.PI / 2
      n.position = {
        x: Math.round(radius * Math.cos(angle)),
        y: Math.round(radius * Math.sin(angle))
      }
    })
  }

  /**
   * Layered hierarchical layout (left → right).
   * Assigns BFS layers from root nodes (no incoming edges), then spaces
   * nodes evenly within each layer along the Y axis.
   */
  private applyHierarchicalLayout(
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    spacingX = 300,
    spacingY = 200
  ): void {
    const n = nodes.length
    if (n === 0) return

    const idToIdx = new Map(nodes.map((node, i) => [node.id, i]))
    const inDegree = new Array(n).fill(0)
    const children = new Map<number, number[]>()

    for (const e of edges) {
      const s = idToIdx.get(e.source)
      const t = idToIdx.get(e.target)
      if (s === undefined || t === undefined) continue
      inDegree[t]++
      if (!children.has(s)) children.set(s, [])
      children.get(s)!.push(t)
    }

    // BFS from root nodes (in-degree 0)
    const layers = new Array(n).fill(-1)
    const queue: number[] = []
    for (let i = 0; i < n; i++) {
      if (inDegree[i] === 0) { layers[i] = 0; queue.push(i) }
    }
    // No roots = cycle or disconnected — start from node 0
    if (queue.length === 0) { layers[0] = 0; queue.push(0) }

    let head = 0
    while (head < queue.length) {
      const curr = queue[head++]
      for (const child of (children.get(curr) ?? [])) {
        if (layers[child] < layers[curr] + 1) {
          layers[child] = layers[curr] + 1
          queue.push(child)
        }
      }
    }
    // Assign layer 0 to any still-disconnected nodes
    for (let i = 0; i < n; i++) { if (layers[i] === -1) layers[i] = 0 }

    // Group by layer
    const layerGroups = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const l = layers[i]
      if (!layerGroups.has(l)) layerGroups.set(l, [])
      layerGroups.get(l)!.push(i)
    }

    // Assign positions
    for (const [layer, group] of layerGroups) {
      group.forEach((idx, posInGroup) => {
        nodes[idx].position = {
          x: layer * spacingX,
          y: (posInGroup - (group.length - 1) / 2) * spacingY
        }
      })
    }
  }
}
