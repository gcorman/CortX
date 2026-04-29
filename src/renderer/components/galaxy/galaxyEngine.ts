import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  FederatedPointerEvent,
  BlurFilter
} from 'pixi.js'
import { AdvancedBloomFilter } from 'pixi-filters'
import type {
  GalaxyData,
  GalaxyNode,
  GalaxyEdge,
  GalaxyCluster,
  GalaxyComet,
  GalaxyConstellation
} from '../../../shared/types'
import {
  TYPE_COLORS,
  COMET_COLOR,
  recencyIntensity,
  blendHex
} from './colors'
import { computeLayout, type Vec } from './layout'

export interface EngineEvents {
  onHover: (nodeId: string | null) => void
  onClick: (nodeId: string) => void
  onDoubleClick: (nodeId: string, filePath: string) => void
}

export interface EngineFilters {
  types: Record<string, boolean>
  comets: boolean
  constellations: boolean
  pulsations: boolean
}

interface StarSprite {
  node: GalaxyNode
  body: Sprite
  halo: Sprite
  pos: Vec
  baseSize: number
}

interface NebulaSprite {
  cluster: GalaxyCluster
  sprite: Sprite
  centroid: Vec
}

interface CometSprite {
  comet: GalaxyComet
  body: Sprite
  trail: Graphics
  label: Text
  /** Orbit anchor (averaged target pos) */
  anchor: Vec
  /** Phase offset for orbit motion */
  phase: number
  /** Recent positions for trail */
  history: Vec[]
}

interface ConstellationSprite {
  constellation: GalaxyConstellation
  graphic: Graphics
}

interface EdgeRecord {
  source: string
  target: string
  createdAtMs: number
}

const HALO_TEX_SIZE = 128
const STAR_TEX_SIZE = 32
const COMET_TEX_SIZE = 24
const NEBULA_TEX_SIZE = 256
const BG_DUST_COUNT = 1200

export class GalaxyEngine {
  private app: Application
  private world = new Container()
  private bgLayer = new Container()
  private nebulaLayer = new Container()
  private clusterLabelLayer = new Container()
  private edgeLayer = new Graphics()
  private constellationLayer = new Container()
  private cometTrailLayer = new Container()
  private starHaloLayer = new Container()
  private starBodyLayer = new Container()
  private cometBodyLayer = new Container()
  private starLabelLayer = new Container()
  private cometLabelLayer = new Container()

  private haloTex!: Texture
  private starTex!: Texture
  private cometTex!: Texture
  private nebulaTex!: Texture

  private stars = new Map<string, StarSprite>()
  private nebulae: NebulaSprite[] = []
  private comets: CometSprite[] = []
  private constellations: ConstellationSprite[] = []
  private edgesByEndpoint = new Map<string, string[]>()
  private edges: EdgeRecord[] = []

  private filters: EngineFilters = {
    types: {},
    comets: true,
    constellations: true,
    pulsations: true
  }
  private timeRangeMs: { min: number; max: number } | null = null
  private searchQuery = ''
  private focusedId: string | null = null
  private pulseNodeIds = new Set<string>()
  private events: EngineEvents

  // Camera state
  private targetScale = 1
  private currentScale = 1
  private targetPos = { x: 0, y: 0 }
  private currentPos = { x: 0, y: 0 }

  // Drag state
  private dragging = false
  private lastPointer = { x: 0, y: 0 }

  // Hover state
  private hoveredId: string | null = null

  // Click detection
  private downStart: { x: number; y: number; t: number } | null = null
  private lastClickTime = 0
  private lastClickId: string | null = null

  private elapsed = 0

  constructor(app: Application, events: EngineEvents) {
    this.app = app
    this.events = events

    // Background layer is fixed (no camera transform) — pure cosmic backdrop
    this.app.stage.addChild(this.bgLayer)

    // Layer order in world: nebulae → cluster labels → edges → constellations
    //   → comet trails → halos → bodies → comets → star labels → comet labels
    this.world.addChild(this.nebulaLayer)
    this.world.addChild(this.clusterLabelLayer)
    this.world.addChild(this.edgeLayer)
    this.world.addChild(this.constellationLayer)
    this.world.addChild(this.cometTrailLayer)
    this.world.addChild(this.starHaloLayer)
    this.world.addChild(this.starBodyLayer)
    this.world.addChild(this.cometBodyLayer)
    this.world.addChild(this.starLabelLayer)
    this.world.addChild(this.cometLabelLayer)
    this.app.stage.addChild(this.world)

    // Bloom only on stars + halos (gives the glow without bloating edges)
    const bloom = new AdvancedBloomFilter({
      threshold: 0.35,
      bloomScale: 1.1,
      brightness: 1,
      blur: 6,
      quality: 4
    })
    this.starBodyLayer.filters = [bloom]
    this.starHaloLayer.filters = [new BlurFilter({ strength: 1 })]

    this.nebulaLayer.filters = [new BlurFilter({ strength: 6 })]

    // Build textures
    this.buildTextures()

    // Pointer events on the stage
    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = this.app.screen
    this.app.stage.on('pointerdown', this.onPointerDown)
    this.app.stage.on('pointermove', this.onPointerMove)
    this.app.stage.on('pointerup', this.onPointerUp)
    this.app.stage.on('pointerupoutside', this.onPointerUp)
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false })

    // Background dust
    this.drawBgDust()

    this.app.ticker.add(this.tick)
  }

  destroy(): void {
    this.app.canvas.removeEventListener('wheel', this.onWheel)
    this.app.ticker.remove(this.tick)
    this.app.stage.removeAllListeners()
    this.app.destroy(true, { children: true, texture: true })
  }

  // ── Texture generation ─────────────────────────────────────────────────

  private buildTextures(): void {
    // Halo: radial soft glow
    {
      const g = new Graphics()
      const cx = HALO_TEX_SIZE / 2
      const cy = HALO_TEX_SIZE / 2
      const maxR = HALO_TEX_SIZE / 2
      const STEPS = 32
      for (let i = STEPS - 1; i >= 0; i--) {
        const t = i / STEPS
        const r = maxR * (0.2 + 0.8 * t)
        const alpha = (1 - t) * 0.55
        g.circle(cx, cy, r).fill({ color: 0xffffff, alpha })
      }
      this.haloTex = this.app.renderer.generateTexture({
        target: g,
        resolution: 2
      })
      g.destroy()
    }

    // Star body: bright crisp circle with rim
    {
      const g = new Graphics()
      const cx = STAR_TEX_SIZE / 2
      const cy = STAR_TEX_SIZE / 2
      g.circle(cx, cy, STAR_TEX_SIZE / 2 - 1).fill({ color: 0xffffff, alpha: 1 })
      this.starTex = this.app.renderer.generateTexture({
        target: g,
        resolution: 2
      })
      g.destroy()
    }

    // Comet body: small bright tear-drop shape (we just use a circle, trail is the visual cue)
    {
      const g = new Graphics()
      const cx = COMET_TEX_SIZE / 2
      const cy = COMET_TEX_SIZE / 2
      g.circle(cx, cy, COMET_TEX_SIZE / 2 - 2).fill({ color: 0xffffff, alpha: 1 })
      this.cometTex = this.app.renderer.generateTexture({
        target: g,
        resolution: 2
      })
      g.destroy()
    }

    // Nebula: very soft radial gradient
    {
      const g = new Graphics()
      const cx = NEBULA_TEX_SIZE / 2
      const cy = NEBULA_TEX_SIZE / 2
      const maxR = NEBULA_TEX_SIZE / 2
      const STEPS = 24
      for (let i = STEPS - 1; i >= 0; i--) {
        const t = i / STEPS
        const r = maxR * (0.1 + 0.9 * t)
        const alpha = Math.pow(1 - t, 2.2) * 0.7
        g.circle(cx, cy, r).fill({ color: 0xffffff, alpha })
      }
      this.nebulaTex = this.app.renderer.generateTexture({
        target: g,
        resolution: 2
      })
      g.destroy()
    }
  }

  private drawBgDust(): void {
    const g = new Graphics()
    const W = 4000
    const H = 4000
    for (let i = 0; i < BG_DUST_COUNT; i++) {
      const x = (Math.random() - 0.5) * W
      const y = (Math.random() - 0.5) * H
      const r = Math.random() * 0.9 + 0.1
      const alpha = 0.15 + Math.random() * 0.5
      g.circle(x, y, r).fill({ color: 0xffffff, alpha })
    }
    this.bgLayer.addChild(g)
  }

  // ── Data ingestion ─────────────────────────────────────────────────────

  loadData(data: GalaxyData): void {
    this.clearScene()

    // Run layout
    const { positions, centroids } = computeLayout(
      data.nodes,
      data.edges,
      data.clusters
    )

    // Edges
    this.edges = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      createdAtMs: Date.parse(e.createdAt) || Date.now()
    }))
    this.edgesByEndpoint.clear()
    for (const e of this.edges) {
      let sa = this.edgesByEndpoint.get(e.source)
      if (!sa) {
        sa = []
        this.edgesByEndpoint.set(e.source, sa)
      }
      sa.push(e.target)
      let ta = this.edgesByEndpoint.get(e.target)
      if (!ta) {
        ta = []
        this.edgesByEndpoint.set(e.target, ta)
      }
      ta.push(e.source)
    }

    // Nebulae (one sprite per cluster, scaled to cluster size)
    for (const c of data.clusters) {
      const centroid = centroids.get(c.id)
      if (!centroid) continue
      const sprite = new Sprite(this.nebulaTex)
      sprite.anchor.set(0.5)
      sprite.x = centroid.x
      sprite.y = centroid.y
      const targetDiameter = (centroid.radius + 60) * 2 * 1.6
      sprite.scale.set(targetDiameter / NEBULA_TEX_SIZE)
      const colorHex = parseInt(c.color.replace('#', ''), 16)
      sprite.tint = blendHex(colorHex, 0x202848, 0.55)
      sprite.alpha = 0.25 + 0.35 * c.activity
      this.nebulaLayer.addChild(sprite)
      this.nebulae.push({ cluster: c, sprite, centroid })
    }

    // Cluster labels — two lines: small dim typeLabel above, bright member name below.
    // Rendered at 4× font size then scaled ×0.25 → crisp at up to 4× camera zoom.
    for (const c of data.clusters) {
      const centroid = centroids.get(c.id)
      if (!centroid) continue
      const colorHex = parseInt(c.color.replace('#', ''), 16)
      const displayName = (c.customLabel ?? c.label).toUpperCase()

      // Type category — small, dim, coloured
      const typeLbl = new Text({
        text: c.typeLabel.toUpperCase(),
        style: new TextStyle({ fontSize: 36, fontWeight: 'bold', letterSpacing: 4, fill: colorHex })
      })
      typeLbl.scale.set(0.25)   // renders at 36px, displays as 9px → crisp
      typeLbl.anchor.set(0.5, 1)
      typeLbl.x = centroid.x
      typeLbl.y = centroid.y - centroid.radius * 0.5 - 2
      typeLbl.alpha = 0.45
      this.clusterLabelLayer.addChild(typeLbl)

      // Member name — larger, brighter
      const nameLbl = new Text({
        text: displayName,
        style: new TextStyle({ fontSize: 52, fontWeight: 'bold', letterSpacing: 2, fill: 0xffffff })
      })
      nameLbl.scale.set(0.25)   // renders at 52px, displays as 13px → crisp
      nameLbl.anchor.set(0.5, 0)
      nameLbl.x = centroid.x
      nameLbl.y = centroid.y - centroid.radius * 0.5 + 1
      nameLbl.alpha = 0.75
      this.clusterLabelLayer.addChild(nameLbl)
    }

    // Stars
    for (const node of data.nodes) {
      const p = positions.get(node.id)
      if (!p) continue
      const color = TYPE_COLORS[node.type] ?? 0xc0c0c0
      const intensity = recencyIntensity(node.modifiedAt)
      // sqrt scale: degree 0→5px, 1→8px, 4→12px, 9→16px, 25→23px — 4× range
      const baseSize = 5 + Math.sqrt(node.degree) * 3.6

      const halo = new Sprite(this.haloTex)
      halo.anchor.set(0.5)
      halo.tint = color
      halo.alpha = 0.22 + 0.55 * intensity
      const haloDiameter = baseSize * 7
      halo.scale.set(haloDiameter / HALO_TEX_SIZE)
      halo.x = p.x
      halo.y = p.y

      const body = new Sprite(this.starTex)
      body.anchor.set(0.5)
      body.tint = color
      body.alpha = 1
      body.scale.set((baseSize * 2) / STAR_TEX_SIZE)
      body.x = p.x
      body.y = p.y
      body.eventMode = 'static'
      body.cursor = 'pointer'
      ;(body as Sprite & { __nodeId?: string }).__nodeId = node.id
      body.on('pointerover', () => this.handleHover(node.id))
      body.on('pointerout', () => this.handleHover(null))

      this.starHaloLayer.addChild(halo)
      this.starBodyLayer.addChild(body)

      this.stars.set(node.id, {
        node,
        body,
        halo,
        pos: { x: p.x, y: p.y },
        baseSize
      })
    }

    // Star name labels — show for all nodes (zoom-gated in tick).
    // Large font + small scale = crisp at zoom (no pixelation until 4× camera zoom).
    const starLabelStyle = new TextStyle({
      fontSize: 40,   // renders at 40px, displayed as 10px via scale 0.25
      fill: 0xffffff,
      fontWeight: 'normal'
    })
    for (const node of data.nodes) {
      const p = positions.get(node.id)
      if (!p) continue
      const raw = node.label
      const short = raw.length > 20 ? raw.slice(0, 18) + '…' : raw
      const lbl = new Text({ text: short, style: starLabelStyle })
      lbl.scale.set(0.25)
      lbl.anchor.set(0.5, 0)
      const star = this.stars.get(node.id)
      const offset = star ? star.baseSize + 2 : 7
      lbl.x = p.x
      lbl.y = p.y + offset
      lbl.alpha = node.degree >= 2 ? 0.75 : 0.45
      this.starLabelLayer.addChild(lbl)
    }

    // Edges drawn each frame in the edgeLayer (cheap with one Graphics)

    // Comets — anchor = average of target stars
    for (const c of data.comets) {
      const targetPositions = c.targetEntityIds
        .map((id) => positions.get(id))
        .filter((v): v is Vec => !!v)
      if (targetPositions.length === 0) continue
      const ax = targetPositions.reduce((s, p) => s + p.x, 0) / targetPositions.length
      const ay = targetPositions.reduce((s, p) => s + p.y, 0) / targetPositions.length

      const body = new Sprite(this.cometTex)
      body.anchor.set(0.5)
      body.tint = COMET_COLOR
      body.alpha = 0.95
      body.x = ax
      body.y = ay

      const trail = new Graphics()
      this.cometTrailLayer.addChild(trail)
      this.cometBodyLayer.addChild(body)

      // Comet label — doc title rendered crisp via large-font/small-scale trick
      const rawLabel = c.label
      const shortLabel = rawLabel.length > 14 ? rawLabel.slice(0, 12) + '…' : rawLabel
      const cometLabel = new Text({
        text: shortLabel,
        style: new TextStyle({ fontSize: 36, fill: COMET_COLOR, fontWeight: 'normal' })
      })
      cometLabel.scale.set(0.25)
      cometLabel.anchor.set(0.5, 0)
      cometLabel.alpha = 0.8
      this.cometLabelLayer.addChild(cometLabel)

      this.comets.push({
        comet: c,
        body,
        trail,
        label: cometLabel,
        anchor: { x: ax, y: ay },
        phase: Math.random() * Math.PI * 2,
        history: []
      })
    }

    // Constellations
    for (const con of data.constellations) {
      const pts = con.entityIds
        .map((id) => positions.get(id))
        .filter((v): v is Vec => !!v)
      if (pts.length < 2) continue
      const g = new Graphics()
      this.constellationLayer.addChild(g)
      this.constellations.push({ constellation: con, graphic: g })
    }

    // Initial camera
    this.fitToView()
  }

  private clearScene(): void {
    for (const s of this.stars.values()) {
      s.body.destroy()
      s.halo.destroy()
    }
    this.stars.clear()
    for (const n of this.nebulae) n.sprite.destroy()
    this.nebulae = []
    for (const c of this.comets) {
      c.body.destroy()
      c.trail.destroy()
      c.label.destroy()
    }
    this.comets = []
    for (const c of this.constellations) c.graphic.destroy()
    this.constellations = []
    this.edges = []
    this.edgesByEndpoint.clear()
    this.edgeLayer.clear()
    this.clusterLabelLayer.removeChildren()
    this.starLabelLayer.removeChildren()
    this.cometLabelLayer.removeChildren()
  }

  // ── State setters ──────────────────────────────────────────────────────

  setFilters(filters: EngineFilters): void {
    this.filters = filters
    this.applyVisibility()
  }

  setTimeRange(range: { min: string; max: string } | null): void {
    if (!range) {
      this.timeRangeMs = null
    } else {
      this.timeRangeMs = {
        min: Date.parse(range.min),
        max: Date.parse(range.max)
      }
    }
    this.applyVisibility()
  }

  setSearchQuery(q: string): void {
    this.searchQuery = q.trim().toLowerCase()
    this.applyVisibility()
  }

  setFocusedNodeId(id: string | null): void {
    this.focusedId = id
    if (id) this.zoomToNode(id)
    this.applyVisibility()
  }

  setPulseNodes(ids: string[]): void {
    this.pulseNodeIds = new Set(ids)
  }

  resetCamera(): void {
    this.fitToView()
  }

  // ── Visibility logic ────────────────────────────────────────────────────

  private applyVisibility(): void {
    const focusedNeighbors = new Set<string>()
    if (this.focusedId) {
      focusedNeighbors.add(this.focusedId)
      const adj = this.edgesByEndpoint.get(this.focusedId)
      if (adj) for (const id of adj) focusedNeighbors.add(id)
    }

    for (const star of this.stars.values()) {
      const passType = this.filters.types[star.node.type] !== false
      const passTime = this.passesTimeRange(star.node.createdAt)
      const passSearch =
        !this.searchQuery ||
        star.node.label.toLowerCase().includes(this.searchQuery)
      const visible = passType && passTime
      star.body.visible = visible
      star.halo.visible = visible

      if (this.focusedId) {
        const isNeighbor = focusedNeighbors.has(star.node.id)
        star.body.alpha = isNeighbor ? 1 : 0.18
        star.halo.alpha = isNeighbor
          ? 0.22 + 0.65 * recencyIntensity(star.node.modifiedAt)
          : 0.05
      } else if (this.searchQuery) {
        const dim = !passSearch
        star.body.alpha = dim ? 0.2 : 1
        star.halo.alpha = dim ? 0.05 : 0.22 + 0.55 * recencyIntensity(star.node.modifiedAt)
      } else {
        star.body.alpha = 1
        star.halo.alpha = 0.22 + 0.55 * recencyIntensity(star.node.modifiedAt)
      }
    }

    for (const com of this.comets) {
      com.body.visible = this.filters.comets
      com.trail.visible = this.filters.comets
    }
    for (const con of this.constellations) {
      con.graphic.visible = this.filters.constellations
    }
  }

  private passesTimeRange(iso: string): boolean {
    if (!this.timeRangeMs) return true
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) return true
    return t >= this.timeRangeMs.min && t <= this.timeRangeMs.max
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  private fitToView(): void {
    if (this.stars.size === 0) {
      this.targetScale = 1
      this.targetPos = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 }
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const s of this.stars.values()) {
      if (s.pos.x < minX) minX = s.pos.x
      if (s.pos.y < minY) minY = s.pos.y
      if (s.pos.x > maxX) maxX = s.pos.x
      if (s.pos.y > maxY) maxY = s.pos.y
    }
    const w = maxX - minX
    const h = maxY - minY
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const margin = 200
    const sx = this.app.screen.width / (w + margin)
    const sy = this.app.screen.height / (h + margin)
    this.targetScale = Math.min(sx, sy, 2.0)
    this.targetPos = {
      x: this.app.screen.width / 2 - cx * this.targetScale,
      y: this.app.screen.height / 2 - cy * this.targetScale
    }
  }

  private zoomToNode(id: string): void {
    const star = this.stars.get(id)
    if (!star) return
    this.targetScale = 2.2
    this.targetPos = {
      x: this.app.screen.width / 2 - star.pos.x * this.targetScale,
      y: this.app.screen.height / 2 - star.pos.y * this.targetScale
    }
  }

  // ── Pointer ────────────────────────────────────────────────────────────

  private onPointerDown = (e: FederatedPointerEvent): void => {
    this.dragging = true
    this.lastPointer = { x: e.global.x, y: e.global.y }
    this.downStart = { x: e.global.x, y: e.global.y, t: performance.now() }
  }

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.dragging) return
    const dx = e.global.x - this.lastPointer.x
    const dy = e.global.y - this.lastPointer.y
    this.targetPos.x += dx
    this.targetPos.y += dy
    this.currentPos.x += dx
    this.currentPos.y += dy
    this.lastPointer = { x: e.global.x, y: e.global.y }
  }

  private onPointerUp = (e: FederatedPointerEvent): void => {
    this.dragging = false
    if (!this.downStart) return
    const dx = e.global.x - this.downStart.x
    const dy = e.global.y - this.downStart.y
    const moved = Math.hypot(dx, dy)
    const dt = performance.now() - this.downStart.t
    this.downStart = null
    if (moved < 5 && dt < 350) {
      // Click — find node under pointer
      const target = e.target as Sprite & { __nodeId?: string }
      const nodeId = target?.__nodeId
      if (nodeId) {
        const now = performance.now()
        const isDouble =
          this.lastClickId === nodeId && now - this.lastClickTime < 350
        this.lastClickTime = now
        this.lastClickId = nodeId
        if (isDouble) {
          const star = this.stars.get(nodeId)
          if (star) this.events.onDoubleClick(nodeId, star.node.filePath)
        } else {
          this.events.onClick(nodeId)
        }
      }
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(8, this.targetScale * delta))
    // Zoom toward cursor
    const rect = this.app.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    // World point under cursor
    const wx = (mx - this.targetPos.x) / this.targetScale
    const wy = (my - this.targetPos.y) / this.targetScale
    this.targetScale = newScale
    this.targetPos = {
      x: mx - wx * newScale,
      y: my - wy * newScale
    }
  }

  private handleHover(id: string | null): void {
    if (id === this.hoveredId) return
    this.hoveredId = id
    this.events.onHover(id)
  }

  // ── Render loop ────────────────────────────────────────────────────────

  private tick = (): void => {
    const dt = this.app.ticker.deltaMS
    this.elapsed += dt

    // Smooth camera
    const k = 0.18
    this.currentScale += (this.targetScale - this.currentScale) * k
    this.currentPos.x += (this.targetPos.x - this.currentPos.x) * k
    this.currentPos.y += (this.targetPos.y - this.currentPos.y) * k
    this.world.scale.set(this.currentScale)
    this.world.x = this.currentPos.x
    this.world.y = this.currentPos.y

    // Star name labels: fade in when zoomed in.
    // World-space 9px font becomes readable at screen scale ≥ 1.0.
    // Default fit-to-view is ~0.5–0.7, so threshold at 0.75 → fully opaque at 1.1.
    const labelAlpha = Math.max(0, Math.min(1, (this.currentScale - 0.75) / 0.35))
    this.starLabelLayer.alpha = labelAlpha
    this.starLabelLayer.visible = labelAlpha > 0.01

    // Edges
    this.edgeLayer.clear()
    const focusedNeighbors = new Set<string>()
    if (this.focusedId) {
      focusedNeighbors.add(this.focusedId)
      const adj = this.edgesByEndpoint.get(this.focusedId)
      if (adj) for (const id of adj) focusedNeighbors.add(id)
    }

    for (const e of this.edges) {
      if (!this.passesTimeRangeMs(e.createdAtMs)) continue
      const a = this.stars.get(e.source)
      const b = this.stars.get(e.target)
      if (!a || !b || !a.body.visible || !b.body.visible) continue
      const focused =
        this.focusedId &&
        (focusedNeighbors.has(e.source) && focusedNeighbors.has(e.target))
      const alpha = this.focusedId
        ? focused
          ? 0.55
          : 0.04
        : 0.18
      const color = focused ? 0xffffff : 0x6b7280
      this.edgeLayer
        .moveTo(a.pos.x, a.pos.y)
        .lineTo(b.pos.x, b.pos.y)
        .stroke({ color, alpha, width: focused ? 1.4 : 0.8 })
    }

    // Constellations
    for (const c of this.constellations) {
      c.graphic.clear()
      if (!c.graphic.visible) continue
      const pts = c.constellation.entityIds
        .map((id) => this.stars.get(id))
        .filter((s): s is StarSprite => !!s && s.body.visible)
        .map((s) => s.pos)
      if (pts.length < 2) continue
      // Connect sequentially in stable order to form a constellation trace
      for (let i = 0; i < pts.length - 1; i++) {
        c.graphic
          .moveTo(pts[i].x, pts[i].y)
          .lineTo(pts[i + 1].x, pts[i + 1].y)
      }
      c.graphic.stroke({ color: 0xffffff, alpha: 0.18, width: 0.6 })
    }

    // Star pulsation + idle pulse
    const time = this.elapsed / 1000
    for (const star of this.stars.values()) {
      if (!star.body.visible) continue
      const baseScale = (star.baseSize * 2) / STAR_TEX_SIZE
      const pulse = 1 + 0.06 * Math.sin(time * 1.2 + star.pos.x * 0.01)
      star.body.scale.set(baseScale * pulse)

      if (this.filters.pulsations && this.pulseNodeIds.has(star.node.id)) {
        const haloDiameter = star.baseSize * 7
        const expand = 1 + 0.4 * (0.5 + 0.5 * Math.sin(time * 3))
        star.halo.scale.set((haloDiameter * expand) / HALO_TEX_SIZE)
        star.halo.tint = 0xffffff
      } else {
        const haloDiameter = star.baseSize * 7
        star.halo.scale.set(haloDiameter / HALO_TEX_SIZE)
        star.halo.tint = TYPE_COLORS[star.node.type] ?? 0xc0c0c0
      }
    }

    // Comets — orbit anchor and trail
    for (const com of this.comets) {
      com.phase += 0.009
      const r = 48
      const x = com.anchor.x + Math.cos(com.phase) * r
      const y = com.anchor.y + Math.sin(com.phase) * r
      com.body.x = x
      com.body.y = y
      com.label.x = x
      com.label.y = y + 7
      com.label.visible = com.body.visible
      com.history.push({ x, y })
      if (com.history.length > 22) com.history.shift()
      com.trail.clear()
      if (!com.trail.visible) continue
      for (let i = 1; i < com.history.length; i++) {
        const a = com.history[i - 1]
        const b = com.history[i]
        const t = i / com.history.length
        com.trail
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({
            color: COMET_COLOR,
            alpha: 0.45 * t,
            width: 0.8 + 1.4 * t
          })
      }
    }
  }

  private passesTimeRangeMs(t: number): boolean {
    if (!this.timeRangeMs) return true
    return t >= this.timeRangeMs.min && t <= this.timeRangeMs.max
  }
}
