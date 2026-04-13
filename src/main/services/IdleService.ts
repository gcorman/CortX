import { randomUUID } from 'crypto'
import * as fs from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import type { DatabaseService } from './DatabaseService'
import type { FileService } from './FileService'
import type { LLMService } from './LLMService'
import type { IdleInsight, IdleExplorationEvent, IdleConfig, Entity, Relation } from '../../shared/types'

type Phase = 'stopped' | 'selecting' | 'examining' | 'thinking' | 'insight' | 'resting'

interface ExplorationTarget {
  entityIds: number[]
  entityNames: string[]
  edgeKeys: string[]
  strategy: 'peripheral' | 'bridge' | 'cluster' | 'random'
}

interface DraftInsight {
  content: string
  confidence: number
  category: IdleInsight['category']
  entityNames: string[]
  entityIds: string[]
  edgeKeys: string[]
}

const SYNTHESIS_EVERY = 4    // run synthesis pass every N completed cycles
const DRAFT_MIN_CONF = 0.42  // min confidence to add to draft pool
const FINAL_MIN_CONF = 0.82  // min confidence to promote immediately (rare)

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
    intervalSeconds: 45,
    confidenceThreshold: 0.82
  }

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
    this.emit({ phase: 'resting', activeNodeIds: [], activeEdgeKeys: [] })
  }

  pause(): void { this.paused = true }
  resume(): void { this.paused = false }

  getInsights(): IdleInsight[] { return [...this.insights] }

  dismissInsight(id: string): void {
    const insight = this.insights.find((i) => i.id === id)
    if (insight) { insight.status = 'dismissed'; this.persistInsights() }
  }

  /**
   * Build the subject + body for an insight fiche.
   * The actual write, git commit and reindex are delegated to AgentPipeline.saveBrief
   * via the IPC handler so the fiche lands in Fiches/ and appears in FichePanel.
   */
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

    // Build wikilinks for all entity names (they exist in the KB)
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

  /** Mark an insight as saved without touching the file system. */
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

    const target = this.pickTarget(entities, relations)
    if (!target) {
      this.exploredPairs.clear()
      this.scheduleNext(this.config.intervalSeconds * 1000)
      return
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
    await this.sleep(600)
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
    await this.sleep(2000)
    if (this.phase === 'stopped' || this.paused) return

    // ── Phase: thinking ────────────────────────────────────────────────────
    this.phase = 'thinking'
    this.emit({
      phase: 'thinking',
      activeNodeIds: nodeIds,
      activeEdgeKeys: target.edgeKeys,
      currentThought: this.makeThinkingThought(target),
      draftCount: this.draftInsights.length
    })

    try {
      const context = await this.gatherContext(target, entities, relations)
      if (this.phase === 'stopped' || this.paused) return

      const result = await this.evaluateInsight(context)
      if (this.phase === 'stopped' || this.paused) return

      if (result) {
        const conf = result.confidence

        if (conf >= FINAL_MIN_CONF) {
          // Promote immediately — exceptionally strong insight
          const insight = this.buildInsight(result, target, nodeIds)
          this.insights.unshift(insight)
          if (this.insights.length > 50) this.insights = this.insights.slice(0, 50)
          this.persistInsights()

          this.phase = 'insight'
          this.emit({
            phase: 'insight',
            activeNodeIds: nodeIds,
            activeEdgeKeys: target.edgeKeys,
            currentThought: result.content.slice(0, 80) + (result.content.length > 80 ? '…' : ''),
            draftCount: this.draftInsights.length,
            insight
          })
          await this.sleep(6000)
        } else if (conf >= DRAFT_MIN_CONF) {
          // Add to draft pool — will be synthesized later
          this.draftInsights.push({
            content: result.content,
            confidence: result.confidence,
            category: result.category,
            entityNames: target.entityNames,
            entityIds: nodeIds,
            edgeKeys: target.edgeKeys
          })
          // Keep draft pool bounded
          if (this.draftInsights.length > 12) {
            // Remove lowest-confidence draft
            this.draftInsights.sort((a, b) => b.confidence - a.confidence)
            this.draftInsights = this.draftInsights.slice(0, 10)
          }
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
      this.emit({ phase: 'resting', activeNodeIds: [], activeEdgeKeys: [], draftCount: this.draftInsights.length })
      await this.sleep(800)
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
Tu dois identifier les 1-2 vraiment remarquables et les réécrire en insights affinés et précis.
Sois EXTRÊMEMENT sélectif. Réponds en JSON strict, rien d'autre.`

    const draftList = this.draftInsights
      .sort((a, b) => b.confidence - a.confidence)
      .map((d, i) => `${i + 1}. [${d.category}] "${d.content}" — entités: ${d.entityNames.join(', ')} (confiance brute: ${Math.round(d.confidence * 100)}%)`)
      .join('\n')

    const userMsg = `Voici ${this.draftInsights.length} intuitions provisoires collectées en explorant la base de connaissances :

${draftList}

## MISSION DE SYNTHÈSE
Sélectionne 0, 1 ou 2 insights qui méritent vraiment d'être mis en avant.

Priorité absolue aux insights qui :
1. Révèlent une **opportunité concrète** non encore exploitée
2. Pointent vers quelque chose d'**actionnable** (approfondissement, connexion à créer, risque à surveiller)
3. Sont **surprenants** — que l'utilisateur ne saurait pas sans cette analyse

Écarte systématiquement les insights purement structurels ("il manque un lien") au profit des insights de fond.
Réécris et affine les insights sélectionnés pour les rendre plus précis et percutants.

Si aucun ne mérite vraiment : {"promoted": []}
Sinon : {"promoted": [{"category": "opportunity|development|pattern|contradiction|hidden_connection|gap|cluster", "content": "...", "confidence": 0.0, "entityNames": ["..."], "entityIds": ["..."]}]}`

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

      const promoted = parsed.promoted ?? []
      for (const p of promoted) {
        if (!p.content || !p.confidence || p.confidence < 0.6) continue

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
          currentThought: p.content.slice(0, 80) + (p.content.length > 80 ? '…' : ''),
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

  // ── Thought generation ────────────────────────────────────────────────────

  private makeSelectingThought(target: ExplorationTarget): string {
    if (target.strategy === 'bridge') return `Pont potentiel : ${target.entityNames.join(' ↔ ')}`
    if (target.strategy === 'cluster') return `Cluster : ${target.entityNames.slice(0, 2).join(' + ')}…`
    if (target.strategy === 'peripheral') return `Nœud isolé : ${target.entityNames[0]}`
    return `Scan : ${target.entityNames.slice(0, 2).join(' × ')}`
  }

  private makeExaminingThought(target: ExplorationTarget): string {
    const names = target.entityNames.slice(0, 2).map((n) => `"${n}"`).join(' et ')
    if (target.strategy === 'bridge') return `Connexion non documentée entre ${names} ?`
    if (target.strategy === 'cluster') return `Pattern autour de ${names} ?`
    return `Examen de ${names}`
  }

  private makeThinkingThought(target: ExplorationTarget): string {
    const names = target.entityNames.slice(0, 2).join(' et ')
    if (target.strategy === 'bridge') return `Opportunité entre ${names} ?`
    if (target.strategy === 'cluster') return `Que révèle le contenu de ${names} ?`
    if (target.strategy === 'peripheral') return `Aspect sous-développé autour de "${target.entityNames[0]}" ?`
    return `Analyse de fond en cours…`
  }

  // ── Target picking ─────────────────────────────────────────────────────────

  private pickTarget(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    const rand = Math.random()
    if (rand < 0.35) return this.pickPeripheral(entities, relations)
    if (rand < 0.65) return this.pickCrossDomainBridge(entities, relations)
    if (rand < 0.85) return this.pickDenseCluster(entities, relations)
    return this.pickRandomPair(entities, relations)
  }

  private pickPeripheral(entities: Entity[], relations: Relation[]): ExplorationTarget | null {
    const connectionCount = new Map<number, number>()
    for (const e of entities) connectionCount.set(e.id, 0)
    for (const r of relations) {
      connectionCount.set(r.sourceEntityId, (connectionCount.get(r.sourceEntityId) ?? 0) + 1)
      connectionCount.set(r.targetEntityId, (connectionCount.get(r.targetEntityId) ?? 0) + 1)
    }
    const peripheral = entities.filter((e) => (connectionCount.get(e.id) ?? 0) <= 2)
    if (peripheral.length < 2) return this.pickRandomPair(entities, relations)

    for (let i = 0; i < 10; i++) {
      const a = peripheral[Math.floor(Math.random() * peripheral.length)]
      const b = peripheral[Math.floor(Math.random() * peripheral.length)]
      if (a.id === b.id) continue
      const key = [a.id, b.id].sort().join('-')
      if (this.exploredPairs.has(key)) continue
      this.exploredPairs.add(key)
      return { entityIds: [a.id, b.id], entityNames: [a.name, b.name], edgeKeys: this.getEdgeKeys(relations, [a.id, b.id]), strategy: 'peripheral' }
    }
    return null
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

  // ── Context gathering ──────────────────────────────────────────────────────

  private async gatherContext(target: ExplorationTarget, entities: Entity[], relations: Relation[]): Promise<string> {
    const lines: string[] = ['## ENTITÉS EXAMINÉES (contenu intégral)']

    // Read examined entities — up to 500 words each for richer content analysis
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

    // Add brief excerpts of direct neighbors for extra context
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

    // Relations between examined entities
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

    // Global KB summary
    const typeCount = new Map<string, number>()
    for (const e of entities) typeCount.set(e.type, (typeCount.get(e.type) ?? 0) + 1)
    lines.push(`\n## BASE DE CONNAISSANCES\n${entities.length} entités (${[...typeCount.entries()].map(([t, c]) => `${c} ${t}`).join(', ')}), ${relations.length} relations.`)
    lines.push(`Stratégie d'exploration : ${target.strategy} | Brouillons accumulés : ${this.draftInsights.length}`)

    return lines.join('\n')
  }

  // ── LLM evaluation ────────────────────────────────────────────────────────

  private async evaluateInsight(
    context: string
  ): Promise<{ content: string; confidence: number; category: IdleInsight['category'] } | null> {
    const systemPrompt = `Tu es un analyste stratégique et intellectuel qui explore une base de connaissances personnelle.
Tu analyses à la fois la STRUCTURE du graphe ET le CONTENU des notes pour dégager des insights à valeur ajoutée.
Réponds UNIQUEMENT en JSON valide, rien d'autre.`

    const userMessage = `${context}

## MISSION
Analyse ces entités sous deux angles complémentaires et cherche UNE observation remarquable :

**A) ANALYSE DE FOND — priorité haute**
Lis le contenu des notes et demande-toi :
- Y a-t-il une opportunité business, stratégique ou intellectuelle que l'utilisateur n'a pas encore explorée ?
- Un sujet ou domaine sous-représenté qui mériterait d'être approfondi ?
- Une convergence entre des sujets qui semblent pointer vers la même direction ?
- Un risque, une tension ou une contradiction dans les idées ou plans documentés ?
- Un angle d'action concret que le contenu suggère implicitement ?

**B) ANALYSE STRUCTURELLE — priorité secondaire**
- Un lien indirect non documenté entre ces entités ?
- Une connexion attendue qui manque ?
- Un pattern dans la façon dont ces entités sont reliées ?

## RÈGLES ABSOLUES
- Prioritise toujours l'analyse de fond sur l'analyse structurelle
- Ne signale JAMAIS l'évident, le déjà documenté, ou le trivial
- Si rien de vraiment intéressant : {"found": false} — c'est la réponse normale la plupart du temps
- Sois concret, précis, actionnable (1-3 phrases max)
- Ne génère PAS de conseils génériques ("il faudrait mieux documenter…")

## GUIDE DE CONFIANCE
- 0.85-1.0 : insight solide, supporté par le contenu, directement actionnable
- 0.65-0.85 : inférence plausible, bien fondée
- 0.45-0.65 : piste intéressante mais spéculative
- < 0.45 : trop incertain, ne pas signaler

## CATÉGORIES
- opportunity : opportunité business, stratégique ou intellectuelle détectée dans le contenu
- development : aspect sous-développé qui mériterait d'être approfondi
- pattern : convergence ou tendance répétée dans les contenus
- contradiction : tension ou incohérence dans les idées documentées
- hidden_connection : lien indirect non documenté entre deux entités
- gap : connexion structurelle attendue mais absente
- cluster : regroupement thématique révélateur

## FORMAT JSON STRICT (rien d'autre)
{"found": false}
OU
{"found": true, "category": "opportunity|development|pattern|contradiction|hidden_connection|gap|cluster", "content": "...", "confidence": 0.0}`

    const raw = await this.llmService.sendMessage(
      [{ role: 'user', content: userMessage }],
      systemPrompt
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
        this.insights = JSON.parse(fs.readFileSync(this.insightsPath, 'utf-8')) as IdleInsight[]
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
