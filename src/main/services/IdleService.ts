import { randomUUID } from 'crypto'
import * as fs from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import type { DatabaseService } from './DatabaseService'
import type { FileService } from './FileService'
import type { LLMService } from './LLMService'
import type { IdleInsight, IdleAttempt, IdleExplorationEvent, IdleConfig, Entity, Relation } from '../../shared/types'
import { webService } from './WebService'

type Phase = 'stopped' | 'selecting' | 'examining' | 'thinking' | 'insight' | 'resting'

interface ExplorationTarget {
  entityIds: number[]
  entityNames: string[]
  edgeKeys: string[]
  strategy: 'peripheral' | 'bridge' | 'cluster' | 'recent' | 'random' | 'llm'
}

interface DraftInsight {
  content: string
  confidence: number
  category: IdleInsight['category']
  entityNames: string[]
  entityIds: string[]
  edgeKeys: string[]
}

const SYNTHESIS_EVERY = 3
const DRAFT_MIN_CONF = 0.28
const FINAL_MIN_CONF = 0.60
const DRAFT_POOL_MAX = 6
const AUTO_DISMISS_HOURS = 24
const DEDUP_ENTITY_OVERLAP_THRESHOLD = 0.7
const LLM_TARGET_BATCH = 5    // how many targets LLM picks per selection pass
const WEB_ENRICH_COOLDOWN_MS = 20_000  // min ms between DuckDuckGo calls

/** Extract the partial value of "content" from a streaming JSON fragment. */
function extractPartialContent(raw: string): string | null {
  // Match: "content": "captured text (may be incomplete)
  const match = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/s)
  if (!match) return null
  // Unescape basic JSON sequences so the text is readable
  return match[1]
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim()
}

export class IdleService {
  private phase: Phase = 'stopped'
  private timer: ReturnType<typeof setTimeout> | null = null
  private insights: IdleInsight[] = []
  private draftInsights: DraftInsight[] = []
  private exploredPairs = new Set<string>()
  private paused = false
  private cycleCount = 0
  private mainWindow: BrowserWindow | null = null
  private config: IdleConfig = {
    intervalSeconds: 8,
    confidenceThreshold: FINAL_MIN_CONF
  }
  // Prefetch cache: context gathered during LLM call, consumed next cycle
  private prefetchedTarget: ExplorationTarget | null = null
  private prefetchedContext: string | null = null
  // LLM-selected target queue: filled by selectTargetsWithLLM(), drained cycle by cycle
  private llmTargetQueue: ExplorationTarget[] = []
  private isSelectingTargets = false
  // Web enrichment throttle
  private lastWebSearchAt = 0

  constructor(
    private dbService: DatabaseService,
    private fileService: FileService,
    private llmService: LLMService,
    private basePath: string
  ) {}

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  async start(): Promise<void> {
    if (this.phase !== 'stopped') return
    this.loadInsights()
    this.paused = false
    this.phase = 'selecting'
    this.scheduleNext(0)
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.phase = 'stopped'
    this.prefetchedTarget = null
    this.prefetchedContext = null
    this.llmTargetQueue = []
    this.isSelectingTargets = false
    this.emit({ phase: 'resting', activeNodeIds: [], activeEdgeKeys: [] })
  }

  pause(): void { this.paused = true }
  resume(): void { this.paused = false }

  getInsights(): IdleInsight[] { return [...this.insights] }

  dismissInsight(id: string): void {
    const insight = this.insights.find((i) => i.id === id)
    if (insight) { insight.status = 'dismissed'; this.persistInsights() }
  }

  buildInsightFicheContent(id: string): { subject: string; body: string } {
    const insight = this.insights.find((i) => i.id === id)
    if (!insight) throw new Error('Insight non trouvé')

    const subject = `Insight : ${insight.entityNames.join(' × ')}`
    const today = new Date().toLocaleDateString('fr-FR')
    const confPct = Math.round(insight.confidence * 100)

    const CATEGORY_LABELS: Record<string, string> = {
      opportunity: 'Opportunité',
      development: 'À développer',
      hidden_connection: 'Connexion cachée',
      pattern: 'Pattern',
      contradiction: 'Contradiction',
      gap: 'Lacune',
      cluster: 'Cluster'
    }
    const catLabel = CATEGORY_LABELS[insight.category] ?? insight.category

    const wikilinkLines = insight.entityNames
      .map((name) => `- [[${name}]]`)
      .join('\n')

    const body = `**Catégorie** : ${catLabel} — **Confiance** : ${confPct}%

${insight.content}

## Entités concernées

${wikilinkLines}

---
*Généré par l'agent en mode Idle le ${today}*`

    return { subject, body }
  }

  markInsightSaved(id: string): void {
    const insight = this.insights.find((i) => i.id === id)
    if (insight) {
      insight.status = 'saved'
      this.persistInsights()
    }
  }

  getConfig(): IdleConfig { return { ...this.config } }

  setConfig(partial: Partial<IdleConfig>): void {
    if (partial.intervalSeconds !== undefined) this.config.intervalSeconds = partial.intervalSeconds
    if (partial.confidenceThreshold !== undefined) this.config.confidenceThreshold = partial.confidenceThreshold
  }

  // ── Core loop ─────────────────────────────────────────────────────────────

  private scheduleNext(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.runCycle() }, delayMs)
  }

  private async runCycle(): Promise<void> {
    if (this.phase === 'stopped') return
    if (this.paused) { this.scheduleNext(5000); return }

    const entities = this.dbService.getEntities()
    const relations = this.dbService.getRelations()

    if (entities.length < 2) {
      this.scheduleNext(this.config.intervalSeconds * 1000)
      return
    }

    // Refill LLM target queue asynchronously when it runs low (non-blocking)
    if (this.llmTargetQueue.length <= 1 && !this.isSelectingTargets) {
      this.isSelectingTargets = true
      void this.selectTargetsWithLLM(entities, relations).finally(() => {
        this.isSelectingTargets = false
      })
    }

    // Use prefetched target if available, otherwise pick fresh
    let target: ExplorationTarget | null = null
    let context: string | null = null

    if (this.prefetchedTarget && this.prefetchedContext) {
      target = this.prefetchedTarget
      context = this.prefetchedContext
      this.prefetchedTarget = null
      this.prefetchedContext = null
      // Validate prefetched target still has valid entities
      const validIds = new Set(entities.map((e) => e.id))
      if (!target.entityIds.every((id) => validIds.has(id))) {
        target = null
        context = null
      }
    }

    if (!target) {
      // Drain LLM queue first, fall back to heuristics
      target = this.dequeueTarget(entities) ?? this.pickTarget(entities, relations)
      if (!target) {
        this.exploredPairs.clear()
        this.scheduleNext(this.config.intervalSeconds * 1000)
        return
      }
    }

    const nodeIds = target.entityIds.map((id) => String(id))

    // ── Phase: selecting ───────────────────────────────────────────────────
    this.phase = 'selecting'
    this.emit({
      phase: 'selecting',
      activeNodeIds: nodeIds,
      activeEdgeKeys: target.edgeKeys,
      currentThought: this.makeSelectingThought(target),
      draftCount: this.draftInsights.length
    })
    await this.sleep(250)
    if (this.phase === 'stopped' || this.paused) return

    // ── Phase: examining ───────────────────────────────────────────────────
    this.phase = 'examining'
    this.emit({
      phase: 'examining',
      activeNodeIds: nodeIds,
      activeEdgeKeys: target.edgeKeys,
      currentThought: this.makeExaminingThought(target),
      draftCount: this.draftInsights.length
    })

    // Gather context now if not prefetched
    let webEnriched = false
    if (!context) {
      const gathered = await this.gatherContext(target, entities, relations)
      context = gathered.context
      webEnriched = gathered.webEnriched
    }

    await this.sleep(700)
    if (this.phase === 'stopped' || this.paused) return

    // ── Phase: thinking ────────────────────────────────────────────────────
    this.phase = 'thinking'
    this.emit({
      phase: 'thinking',
      activeNodeIds: nodeIds,
      activeEdgeKeys: target.edgeKeys,
      currentThought: this.makeThinkingThought(target) + (webEnriched ? ' 🌐' : ''),
      draftCount: this.draftInsights.length
    })

    // Track this cycle's outcome for the activity log
    let cycleAttempt: IdleAttempt = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      entityNames: target.entityNames.slice(0, 3),
      strategy: target.strategy,
      result: 'none',
      webEnriched
    }

    try {
      // Prefetch next target context in parallel with LLM call
      const nextTarget = this.pickTarget(entities, relations)
      const prefetchPromise = nextTarget
        ? this.gatherContext(nextTarget, entities, relations).then((gathered) => {
            if (this.phase !== 'stopped') {
              this.prefetchedTarget = nextTarget
              this.prefetchedContext = gathered.context
            }
          }).catch(() => { /* non-fatal */ })
        : Promise.resolve()

      const [result] = await Promise.all([
        this.evaluateInsight(context, (thought) => {
          // Live-stream partial insight text into the thought bubble
          this.emit({
            phase: 'thinking',
            activeNodeIds: nodeIds,
            activeEdgeKeys: target.edgeKeys,
            currentThought: thought,
            draftCount: this.draftInsights.length
          })
        }),
        prefetchPromise
      ])

      if (this.phase === 'stopped' || this.paused) return

      if (result) {
        const conf = result.confidence

        if (conf >= FINAL_MIN_CONF && !this.isInsightDuplicate(result.content, target.entityNames)) {
          const insight = this.buildInsight(result, target, nodeIds)
          this.insights.unshift(insight)
          if (this.insights.length > 50) this.insights = this.insights.slice(0, 50)
          this.persistInsights()

          cycleAttempt = { ...cycleAttempt, result: 'insight', category: result.category, snippet: result.content.slice(0, 70), fullContent: result.content }

          this.phase = 'insight'
          this.emit({
            phase: 'insight',
            activeNodeIds: nodeIds,
            activeEdgeKeys: target.edgeKeys,
            currentThought: result.content.slice(0, 100) + (result.content.length > 100 ? '…' : ''),
            draftCount: this.draftInsights.length,
            insight
          })
          await this.sleep(5000)
        } else if (conf >= DRAFT_MIN_CONF && !this.isInsightDuplicate(result.content, target.entityNames)) {
          this.draftInsights.push({
            content: result.content,
            confidence: result.confidence,
            category: result.category,
            entityNames: target.entityNames,
            entityIds: nodeIds,
            edgeKeys: target.edgeKeys
          })
          if (this.draftInsights.length > DRAFT_POOL_MAX) {
            this.draftInsights.sort((a, b) => b.confidence - a.confidence)
            this.draftInsights = this.draftInsights.slice(0, DRAFT_POOL_MAX - 1)
          }
          cycleAttempt = { ...cycleAttempt, result: 'draft', category: result.category, snippet: result.content.slice(0, 70), fullContent: result.content }
        } else if (result.content) {
          // Below draft threshold but LLM did produce text — keep it for the activity log
          cycleAttempt = { ...cycleAttempt, fullContent: result.content }
        }
      }

      // ── Synthesis pass every N cycles ─────────────────────────────────
      this.cycleCount++
      if (this.cycleCount % SYNTHESIS_EVERY === 0 && this.draftInsights.length >= 2) {
        if (this.phase === 'stopped') return
        await this.runSynthesis(nodeIds)
      }

    } catch (err) {
      console.error('[IdleService] LLM error:', err)
    }

    if (this.phase !== 'stopped') {
      this.phase = 'resting'
      this.emit({
        phase: 'resting',
        activeNodeIds: [],
        activeEdgeKeys: [],
        draftCount: this.draftInsights.length,
        lastAttempt: cycleAttempt
      })
      await this.sleep(150)
      if (this.phase !== 'stopped') {
        this.scheduleNext(this.config.intervalSeconds * 1000)
      }
    }
  }

  // ── Synthesis pass ─────────────────────────────────────────────────────────

  private async runSynthesis(lastNodeIds: string[]): Promise<void> {
    if (this.draftInsights.length < 2) { this.draftInsights = []; return }

    const systemPrompt = `Tu es un analyste expert en bases de connaissances personnelles.
Tu reçois des intuitions provisoires collectées sur le graphe de connaissances d'un utilisateur.
Tu dois identifier AU MAXIMUM 1 insight vraiment remarquable et le réécrire de façon précise et percutante.
Sois EXTRÊMEMENT sélectif. Réponds en JSON strict, rien d'autre.`

    const draftList = this.draftInsights
      .sort((a, b) => b.confidence - a.confidence)
      .map((d, i) => `${i + 1}. [${d.category}] "${d.content}" — entités: ${d.entityNames.join(', ')} (confiance brute: ${Math.round(d.confidence * 100)}%)`)
      .join('\n')

    const userMsg = `Voici ${this.draftInsights.length} intuitions provisoires collectées en explorant la base de connaissances :

${draftList}

## MISSION DE SYNTHÈSE
Sélectionne 0 ou 1 insight (jamais plus) qui mérite vraiment d'être mis en avant.

Priorité absolue aux insights qui :
1. Révèlent une **opportunité concrète** non encore exploitée
2. Pointent vers quelque chose d'**actionnable** directement
3. Sont **surprenants** — que l'utilisateur ne saurait pas sans cette analyse

Écarte systématiquement :
- Les insights purement structurels ("il manque un lien", "connexion attendue")
- Les insights génériques ou évidents
- Tout ce qui a une confiance brute < 0.75

Réécris et affine l'insight sélectionné pour le rendre plus précis et percutant.

Si aucun ne mérite : {"promoted": []}
Sinon (max 1) : {"promoted": [{"category": "opportunity|development|pattern|contradiction|hidden_connection|gap|cluster", "content": "...", "confidence": 0.0, "entityNames": ["..."], "entityIds": ["..."]}]}`

    try {
      const raw = await this.llmService.sendMessage(
        [{ role: 'user', content: userMsg }],
        systemPrompt
      )

      if (this.phase === 'stopped') { this.draftInsights = []; return }

      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { this.draftInsights = []; return }

      const parsed = JSON.parse(jsonMatch[0]) as {
        promoted?: Array<{
          category?: string
          content?: string
          confidence?: number
          entityNames?: string[]
          entityIds?: string[]
        }>
      }

      const promoted = (parsed.promoted ?? []).slice(0, 1) // max 1
      for (const p of promoted) {
        if (!p.content || !p.confidence || p.confidence < 0.75) continue
        if (this.isInsightDuplicate(p.content, p.entityNames ?? [])) continue

        const validCats: IdleInsight['category'][] = ['hidden_connection', 'pattern', 'contradiction', 'gap', 'cluster', 'opportunity', 'development']
        const category = validCats.includes(p.category as IdleInsight['category'])
          ? (p.category as IdleInsight['category'])
          : 'opportunity'

        const entityNames = p.entityNames ?? []
        const entityIds = p.entityIds ?? lastNodeIds

        const insight = this.buildInsight(
          { content: p.content, confidence: p.confidence, category },
          { entityIds: [], entityNames, edgeKeys: [], strategy: 'random' },
          entityIds
        )
        this.insights.unshift(insight)
        this.mainWindow?.webContents.send('idle:insight', insight)
        this.mainWindow?.webContents.send('idle:exploration', {
          phase: 'insight',
          activeNodeIds: entityIds,
          activeEdgeKeys: [],
          currentThought: p.content.slice(0, 100) + (p.content.length > 100 ? '…' : ''),
          draftCount: 0,
          insight
        } satisfies IdleExplorationEvent)
      }

      if (this.insights.length > 50) this.insights = this.insights.slice(0, 50)
      this.persistInsights()
    } catch (err) {
      console.error('[IdleService] Synthesis error:', err)
    }

    this.draftInsights = []
  }

  // ── Deduplication ─────────────────────────────────────────────────────────

  private isInsightDuplicate(content: string, entityNames: string[]): boolean {
    const newEntitySet = new Set(entityNames.map((n) => n.toLowerCase()))

    for (const existing of this.insights) {
      if (existing.status === 'dismissed') continue

      // Entity overlap check
      const existingSet = new Set(existing.entityNames.map((n) => n.toLowerCase()))
      const intersection = [...newEntitySet].filter((n) => existingSet.has(n)).length
      const union = new Set([...newEntitySet, ...existingSet]).size
      const entityOverlap = union > 0 ? intersection / union : 0

      if (entityOverlap >= DEDUP_ENTITY_OVERLAP_THRESHOLD) {
        // Check rough text similarity (word overlap)
        const newWords = new Set(content.toLowerCase().split(/\W+/).filter((w) => w.length > 4))
        const existWords = new Set(existing.content.toLowerCase().split(/\W+/).filter((w) => w.length > 4))
        const wordIntersection = [...newWords].filter((w) => existWords.has(w)).length
        const wordUnion = new Set([...newWords, ...existWords]).size
        if (wordUnion > 0 && wordIntersection / wordUnion > 0.5) return true
      }
    }
    return false
  }

  // ── Thought generation ────────────────────────────────────────────────────

  private makeSelectingThought(target: ExplorationTarget): string {
    if (target.strategy === 'llm') return `↗ Cible choisie : ${target.entityNames.slice(0, 2).join(' × ')}`
    if (target.strategy === 'bridge') return `Pont potentiel : ${target.entityNames.join(' ↔ ')}`
    if (target.strategy === 'cluster') return `Cluster : ${target.entityNames.slice(0, 2).join(' + ')}…`
    if (target.strategy === 'peripheral') return `Nœud isolé : ${target.entityNames[0]}`
    if (target.strategy === 'recent') return `Récent : ${target.entityNames.slice(0, 2).join(' × ')}`
    return `Scan : ${target.entityNames.slice(0, 2).join(' × ')}`
  }

  private makeExaminingThought(target: ExplorationTarget): string {
    const names = target.entityNames.slice(0, 2).map((n) => `"${n}"`).join(' et ')
    if (target.strategy === 'llm') return `Analyse ciblée de ${names}`
    if (target.strategy === 'bridge') return `Connexion non documentée entre ${names} ?`
    if (target.strategy === 'cluster') return `Pattern autour de ${names} ?`
    if (target.strategy === 'recent') return `Analyse de ${names} (récemment modifié)`
    return `Examen de ${names}`
  }

  private makeThinkingThought(target: ExplorationTarget): string {
    const names = target.entityNames.slice(0, 2).join(' et ')
    if (target.strategy === 'llm') return `Insight potentiel entre ${names}…`
    if (target.strategy === 'bridge') return `Opportunité entre ${names} ?`
    if (target.strategy === 'cluster') return `Que révèle le contenu de ${names} ?`
    if (target.strategy === 'peripheral') return `Aspect sous-développé autour de "${target.entityNames[0]}" ?`
    if (target.strategy === 'recent') return `Nouveauté exploitable dans ${names} ?`
    return `Analyse de fond en cours…`
  }

  // ── Target picking ─────────────────────────────────────────────────────────

  private pickTarget(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    const rand = Math.random()
    if (rand < 0.25) return this.pickRecentActivity(entities, relations)
    if (rand < 0.65) return this.pickCrossDomainBridge(entities, relations)
    if (rand < 1.00) return this.pickDenseCluster(entities, relations)
    return this.pickRandomPair(entities, relations)
  }

  /** Pick pairs from recently modified files — fresh context = more relevant insights */
  private pickRecentActivity(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    const files = this.dbService.getFiles() // already sorted by modified_at DESC
    const recentPaths = new Set(files.slice(0, 15).map((f) => f.path))

    const recentEntities = entities.filter((e) => e.filePath && recentPaths.has(e.filePath))
    if (recentEntities.length < 2) return this.pickCrossDomainBridge(entities, relations)

    for (let i = 0; i < 15; i++) {
      const a = recentEntities[Math.floor(Math.random() * recentEntities.length)]
      const b = recentEntities[Math.floor(Math.random() * recentEntities.length)]
      if (a.id === b.id) continue
      const key = [a.id, b.id].sort().join('-')
      if (this.exploredPairs.has(key)) continue
      this.exploredPairs.add(key)
      return { entityIds: [a.id, b.id], entityNames: [a.name, b.name], edgeKeys: this.getEdgeKeys(relations, [a.id, b.id]), strategy: 'recent' }
    }
    return this.pickCrossDomainBridge(entities, relations)
  }

  private pickCrossDomainBridge(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    const directLinks = new Set<string>()
    for (const r of relations) {
      directLinks.add(`${r.sourceEntityId}-${r.targetEntityId}`)
      directLinks.add(`${r.targetEntityId}-${r.sourceEntityId}`)
    }
    for (let i = 0; i < 20; i++) {
      const a = entities[Math.floor(Math.random() * entities.length)]
      const b = entities[Math.floor(Math.random() * entities.length)]
      if (a.id === b.id || a.type === b.type) continue
      if (directLinks.has(`${a.id}-${b.id}`)) continue
      const key = [a.id, b.id].sort().join('-')
      if (this.exploredPairs.has(key)) continue
      this.exploredPairs.add(key)
      return { entityIds: [a.id, b.id], entityNames: [a.name, b.name], edgeKeys: [], strategy: 'bridge' }
    }
    return this.pickRandomPair(entities, relations)
  }

  private pickDenseCluster(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    const connectionCount = new Map<number, number>()
    const neighbors = new Map<number, number[]>()
    for (const e of entities) { connectionCount.set(e.id, 0); neighbors.set(e.id, []) }
    for (const r of relations) {
      connectionCount.set(r.sourceEntityId, (connectionCount.get(r.sourceEntityId) ?? 0) + 1)
      connectionCount.set(r.targetEntityId, (connectionCount.get(r.targetEntityId) ?? 0) + 1)
      neighbors.get(r.sourceEntityId)?.push(r.targetEntityId)
      neighbors.get(r.targetEntityId)?.push(r.sourceEntityId)
    }
    let center: Entity | null = null; let maxConn = 0
    for (const e of entities) {
      const c = connectionCount.get(e.id) ?? 0
      if (c > maxConn) { maxConn = c; center = e }
    }
    if (!center || maxConn === 0) return this.pickRandomPair(entities, relations)
    const neighborIds = (neighbors.get(center.id) ?? []).slice(0, 3)
    const cluster = [center.id, ...neighborIds].slice(0, 4)
    const clusterKey = [...cluster].sort().join('-')
    if (this.exploredPairs.has(clusterKey)) return this.pickRandomPair(entities, relations)
    this.exploredPairs.add(clusterKey)
    const clusterEntities = cluster.map((id) => entities.find((e) => e.id === id)!).filter(Boolean)
    return { entityIds: cluster, entityNames: clusterEntities.map((e) => e.name), edgeKeys: this.getEdgeKeys(relations, cluster), strategy: 'cluster' }
  }

  private pickRandomPair(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    for (let i = 0; i < 20; i++) {
      const a = entities[Math.floor(Math.random() * entities.length)]
      const b = entities[Math.floor(Math.random() * entities.length)]
      if (a.id === b.id) continue
      const key = [a.id, b.id].sort().join('-')
      if (this.exploredPairs.has(key)) continue
      this.exploredPairs.add(key)
      return { entityIds: [a.id, b.id], entityNames: [a.name, b.name], edgeKeys: this.getEdgeKeys(relations, [a.id, b.id]), strategy: 'random' }
    }
    return null
  }

  private getEdgeKeys(relations: Relation[], entityIds: number[]): string[] {
    const ids = new Set(entityIds)
    return relations
      .filter((r) => ids.has(r.sourceEntityId) && ids.has(r.targetEntityId))
      .map((r) => `${r.sourceEntityId}->${r.targetEntityId}`)
  }

  /** Pop the next LLM-selected target if it still refers to valid entity IDs. */
  private dequeueTarget(entities: Entity[]): ExplorationTarget | null {
    const validIds = new Set(entities.map((e) => e.id))
    while (this.llmTargetQueue.length > 0) {
      const t = this.llmTargetQueue.shift()!
      if (t.entityIds.every((id) => validIds.has(id))) return t
    }
    return null
  }

  /**
   * Ask the LLM to survey the whole graph and return the N most promising
   * entity pairs to explore next. Runs asynchronously — fills llmTargetQueue.
   */
  private async selectTargetsWithLLM(entities: Entity[], relations: Relation[]): Promise<void> {
    if (entities.length < 2) return

    const summary = this.buildGraphSummary(entities, relations)

    const existingInsightNames = this.insights
      .filter((i) => i.status !== 'dismissed')
      .slice(0, 10)
      .map((i) => `- ${i.entityNames.join(' × ')} : "${i.content.slice(0, 60)}…"`)
      .join('\n')

    const alreadyExplored = [...this.exploredPairs].slice(-30).join(', ')

    const systemPrompt = `Tu es un analyste stratégique qui aide un utilisateur à explorer sa base de connaissances personnelle.
Tu reçois le graphe complet (entités, relations, insights déjà trouvés).
Ta mission : identifier les ${LLM_TARGET_BATCH} binômes ou groupes d'entités les PLUS PROMETTEURS à analyser en profondeur.
Réponds UNIQUEMENT en JSON valide.`

    const userMsg = `${summary}

## INSIGHTS DÉJÀ TROUVÉS (éviter la redondance)
${existingInsightNames || '(aucun pour l\'instant)'}

## PAIRES DÉJÀ EXPLORÉES (IDs, à éviter)
${alreadyExplored || '(aucune)'}

## MISSION
Sélectionne exactement ${LLM_TARGET_BATCH} binômes ou groupes d'entités à explorer en priorité.

Critères de sélection — par ordre de priorité :
1. **Pont inattendu** : deux entités de types différents, sans relation directe, qui pourraient révéler une opportunité cachée
2. **Tension latente** : entités qui semblent en contradiction ou compétition dans le graphe
3. **Cluster sous-exploité** : groupe d'entités fortement connectées dont les liens n'ont pas encore été creusés
4. **Entité pivot orpheline** : entité très connectée mais dont les voisins ne se connaissent pas entre eux
5. **Paire cross-domaine** : entités de domaines très différents — les connexions les plus surprenantes viennent souvent de là

Fournis un court motif pour chaque sélection (1 phrase).

## FORMAT JSON STRICT
{
  "targets": [
    { "entityIds": [1, 2], "reason": "..." },
    { "entityIds": [3, 4, 5], "reason": "..." }
  ]
}`

    try {
      const raw = await this.llmService.sendMessage(
        [{ role: 'user', content: userMsg }],
        systemPrompt
      )
      if (this.phase === 'stopped') return

      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return

      const parsed = JSON.parse(jsonMatch[0]) as {
        targets?: Array<{ entityIds?: number[]; reason?: string }>
      }

      const entityMap = new Map(entities.map((e) => [e.id, e]))
      const newTargets: ExplorationTarget[] = []

      for (const t of parsed.targets ?? []) {
        if (!t.entityIds || t.entityIds.length < 2) continue
        const ids = t.entityIds.filter((id) => entityMap.has(id))
        if (ids.length < 2) continue

        const key = [...ids].sort().join('-')
        if (this.exploredPairs.has(key)) continue
        this.exploredPairs.add(key)

        newTargets.push({
          entityIds: ids,
          entityNames: ids.map((id) => entityMap.get(id)!.name),
          edgeKeys: this.getEdgeKeys(relations, ids),
          strategy: 'llm'
        })
      }

      // Prepend to queue (fresh LLM picks take priority over stale ones)
      this.llmTargetQueue = [...newTargets, ...this.llmTargetQueue].slice(0, LLM_TARGET_BATCH * 2)
      console.log(`[IdleService] LLM selected ${newTargets.length} targets`)
    } catch (err) {
      console.error('[IdleService] Target selection error:', err)
    }
  }

  /** Build a compact, token-efficient summary of the graph for the LLM. */
  private buildGraphSummary(entities: Entity[], relations: Relation[]): string {
    const lines: string[] = []

    // Entity list — capped at 60 to stay within token budget
    const cappedEntities = entities.slice(0, 60)
    lines.push('## ENTITÉS (id | nom | type)')
    for (const e of cappedEntities) {
      lines.push(`${e.id} | ${e.name} | ${e.type}`)
    }
    if (entities.length > 60) lines.push(`… et ${entities.length - 60} autres`)

    // Relations — capped at 120
    const cappedRelations = relations.slice(0, 120)
    lines.push('\n## RELATIONS (source → [type] → cible)')
    const entityById = new Map(entities.map((e) => [e.id, e.name]))
    for (const r of cappedRelations) {
      const src = entityById.get(r.sourceEntityId) ?? `#${r.sourceEntityId}`
      const tgt = entityById.get(r.targetEntityId) ?? `#${r.targetEntityId}`
      lines.push(`${src} → [${r.relationType}] → ${tgt}`)
    }
    if (relations.length > 120) lines.push(`… et ${relations.length - 120} autres`)

    // Structural stats
    const typeCounts = new Map<string, number>()
    for (const e of entities) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
    lines.push(`\n## STATISTIQUES\n${entities.length} entités (${[...typeCounts.entries()].map(([t, c]) => `${c} ${t}`).join(', ')}), ${relations.length} relations`)

    return lines.join('\n')
  }

  // ── Context gathering ──────────────────────────────────────────────────────

  private async gatherContext(
    target: ExplorationTarget,
    entities: Entity[],
    relations: Relation[]
  ): Promise<{ context: string; webEnriched: boolean }> {
    const lines: string[] = ['## ENTITÉS EXAMINÉES (contenu intégral)']

    const examIds = new Set(target.entityIds)
    for (let i = 0; i < target.entityIds.length; i++) {
      const entity = entities.find((e) => e.id === target.entityIds[i])
      lines.push(`\n### ${target.entityNames[i]} (type: ${entity?.type ?? 'inconnu'})`)
      if (entity?.filePath) {
        try {
          const content = await this.fileService.readFile(entity.filePath)
          if (content) {
            const words = content.body.split(/\s+/)
            lines.push(words.slice(0, 500).join(' ') + (words.length > 500 ? '…' : ''))
          }
        } catch { lines.push('(Fichier non lisible)') }
      } else {
        lines.push('(Pas de fichier associé)')
      }
    }

    const neighborIds = new Set<number>()
    for (const r of relations) {
      if (examIds.has(r.sourceEntityId) && !examIds.has(r.targetEntityId)) neighborIds.add(r.targetEntityId)
      if (examIds.has(r.targetEntityId) && !examIds.has(r.sourceEntityId)) neighborIds.add(r.sourceEntityId)
    }
    if (neighborIds.size > 0) {
      lines.push('\n## ENTITÉS VOISINES (contexte élargi)')
      let neighborCount = 0
      for (const nid of neighborIds) {
        if (neighborCount >= 3) break
        const ne = entities.find((e) => e.id === nid)
        if (!ne) continue
        lines.push(`- **${ne.name}** (${ne.type})`)
        if (ne.filePath) {
          try {
            const content = await this.fileService.readFile(ne.filePath)
            if (content) {
              const excerpt = content.body.split(/\s+/).slice(0, 80).join(' ')
              lines.push(`  ${excerpt}…`)
            }
          } catch { /* skip */ }
        }
        neighborCount++
      }
    }

    const relevant = relations.filter((r) => examIds.has(r.sourceEntityId) && examIds.has(r.targetEntityId))
    if (relevant.length > 0) {
      lines.push('\n## RELATIONS DOCUMENTÉES')
      for (const r of relevant) {
        const src = entities.find((e) => e.id === r.sourceEntityId)
        const tgt = entities.find((e) => e.id === r.targetEntityId)
        lines.push(`- ${src?.name} → [${r.relationType}] → ${tgt?.name}`)
      }
    } else {
      lines.push('\n## RELATIONS DOCUMENTÉES\n(Aucune relation directe entre ces entités)')
    }

    const typeCount = new Map<string, number>()
    for (const e of entities) typeCount.set(e.type, (typeCount.get(e.type) ?? 0) + 1)
    lines.push(`\n## BASE DE CONNAISSANCES\n${entities.length} entités (${[...typeCount.entries()].map(([t, c]) => `${c} ${t}`).join(', ')}), ${relations.length} relations.`)
    lines.push(`Stratégie d'exploration : ${target.strategy} | Brouillons accumulés : ${this.draftInsights.length}`)

    // ── Web enrichment — every cycle (cooldown-throttled) ────────────────────
    let webEnriched = false
    const now = Date.now()
    if (now - this.lastWebSearchAt >= WEB_ENRICH_COOLDOWN_MS) {
      try {
        // Build a meaningful query: entity names + their types as context
        const queryParts = target.entityNames
          .filter((n) => n.length > 2)
          .slice(0, 2)
        const query = queryParts.join(' ')

        // Race against 10s timeout
        const results = await Promise.race([
          webService.search(query, 4, 'fr'),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000))
        ])

        this.lastWebSearchAt = Date.now()

        if (results.length > 0) {
          lines.push('\n## CONTEXTE WEB RÉCENT (DuckDuckGo)')
          lines.push(`*Recherche : "${query}"*\n`)
          for (const r of results) {
            lines.push(`**${r.title}**`)
            if (r.snippet) lines.push(r.snippet)
            lines.push('')
          }
          webEnriched = true
        }
      } catch {
        // Web search failed or timed out — continue without enrichment
        this.lastWebSearchAt = Date.now() // still advance cooldown to avoid hammering
      }
    }

    return { context: lines.join('\n'), webEnriched }
  }

  // ── LLM evaluation ────────────────────────────────────────────────────────

  private async evaluateInsight(
    context: string,
    onThoughtUpdate?: (thought: string) => void
  ): Promise<{ content: string; confidence: number; category: IdleInsight['category'] } | null> {
    const systemPrompt = `Tu es un analyste stratégique qui explore une base de connaissances personnelle.
Ton rôle est de TROUVER des connexions, tensions et opportunités — même spéculatives.
Tu dois TOUJOURS produire une observation si le contenu le permet.
Réponds UNIQUEMENT en JSON valide, rien d'autre.`

    const userMessage = `${context}

## MISSION
Analyse ces entités et produis UNE observation utile pour l'utilisateur.

**A) ANALYSE DE FOND — priorité haute**
- Opportunité business, stratégique ou intellectuelle non encore exploitée ?
- Sujet sous-représenté qui mériterait d'être approfondi ?
- Convergence entre sujets pointant vers la même direction ?
- Risque, tension ou contradiction dans les idées documentées ?
- Angle d'action concret suggéré implicitement par le contenu ?
- Si contexte web présent : info récente qui change la donne pour ces entités ?

**B) ANALYSE STRUCTURELLE — si rien de mieux**
- Lien indirect non documenté entre ces entités ?
- Connexion attendue qui manque ?
- Pattern dans la façon dont ces entités sont reliées ?

## RÈGLES
- Sois concret et actionnable (1-3 phrases max)
- Pas de conseils génériques ou évidents
- {"found": false} uniquement si vraiment AUCUNE piste n'existe (cas rare)

## GUIDE DE CONFIANCE
- 0.60-1.0 : observation bien fondée, directement utile
- 0.40-0.60 : piste intéressante, plausible
- 0.28-0.40 : spéculatif mais vaut la peine de noter
- < 0.28 : trop incertain → {"found": false}

## CATÉGORIES
- opportunity : opportunité business, stratégique ou intellectuelle
- development : aspect sous-développé à approfondir
- pattern : convergence ou tendance répétée
- contradiction : tension ou incohérence dans les idées
- hidden_connection : lien indirect non documenté
- gap : connexion attendue mais absente
- cluster : regroupement thématique révélateur

## FORMAT JSON STRICT (rien d'autre)
{"found": false}
OU
{"found": true, "category": "opportunity|development|pattern|contradiction|hidden_connection|gap|cluster", "content": "...", "confidence": 0.0}`

    // Stream the response — extract "content" value progressively for live thought updates
    let accumulated = ''
    let lastEmittedLength = 0

    const onDelta = onThoughtUpdate
      ? (delta: string) => {
          accumulated += delta
          // Try to extract the content field value from partial JSON
          const partial = extractPartialContent(accumulated)
          if (partial && partial.length > lastEmittedLength + 12) {
            lastEmittedLength = partial.length
            onThoughtUpdate(partial)
          }
        }
      : undefined

    const raw = await this.llmService.sendMessage(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      onDelta
    )
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    try {
      const parsed = JSON.parse(jsonMatch[0]) as { found: boolean; category?: string; content?: string; confidence?: number }
      if (!parsed.found || !parsed.content || parsed.confidence === undefined) return null
      const validCats: IdleInsight['category'][] = ['hidden_connection', 'pattern', 'contradiction', 'gap', 'cluster', 'opportunity', 'development']
      const category = validCats.includes(parsed.category as IdleInsight['category'])
        ? (parsed.category as IdleInsight['category'])
        : 'hidden_connection'
      return { content: parsed.content, confidence: Math.min(1, Math.max(0, parsed.confidence)), category }
    } catch { return null }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildInsight(
    result: { content: string; confidence: number; category: IdleInsight['category'] },
    target: { entityNames: string[]; edgeKeys: string[] },
    nodeIds: string[]
  ): IdleInsight {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      entityIds: nodeIds,
      entityNames: target.entityNames,
      edgeKeys: target.edgeKeys,
      content: result.content,
      confidence: result.confidence,
      category: result.category,
      status: 'new'
    }
  }

  private emit(event: IdleExplorationEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('idle:exploration', event)
    if (event.insight) this.mainWindow.webContents.send('idle:insight', event.insight)
  }

  private get insightsPath(): string { return join(this.basePath, '_System', 'idle_insights.json') }

  private loadInsights(): void {
    try {
      if (fs.existsSync(this.insightsPath)) {
        const loaded = JSON.parse(fs.readFileSync(this.insightsPath, 'utf-8')) as IdleInsight[]
        const cutoff = Date.now() - AUTO_DISMISS_HOURS * 60 * 60 * 1000
        this.insights = loaded.map((i) => {
          if (i.status === 'new' && new Date(i.timestamp).getTime() < cutoff) {
            return { ...i, status: 'dismissed' as const }
          }
          return i
        })
        this.persistInsights()
      }
    } catch { this.insights = [] }
  }

  private persistInsights(): void {
    try {
      fs.mkdirSync(join(this.basePath, '_System'), { recursive: true })
      fs.writeFileSync(this.insightsPath, JSON.stringify(this.insights.slice(0, 50), null, 2), 'utf-8')
    } catch (err) { console.error('[IdleService] persist error:', err) }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
