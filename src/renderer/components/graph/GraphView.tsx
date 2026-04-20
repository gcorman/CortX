import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import fcose from 'cytoscape-fcose'
import { useGraphStore } from '../../stores/graphStore'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useIdleStore } from '../../stores/idleStore'
import { Network, LayoutGrid, Trash2, RefreshCw, FileText, ExternalLink, Plus } from 'lucide-react'
import { useT } from '../../i18n'

// Register extensions — fcose takes priority over cose-bilkent for all layouts
try { cytoscape.use(fcose as unknown as cytoscape.Ext) } catch { /* already registered */ }
try { cytoscape.use(coseBilkent) } catch { /* already registered */ }

// CSS variables store "R G B" (space-separated) for Tailwind opacity support.
// Cytoscape expects "rgb(R, G, B)" — convert accordingly.
function getCssColor(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return '#94A3B8'
  // Already a hex or full rgb() value — return as-is
  if (raw.startsWith('#') || raw.startsWith('rgb')) return raw
  // Space-separated "R G B" → "rgb(R, G, B)"
  const parts = raw.split(/\s+/)
  if (parts.length === 3) return `rgb(${parts.join(', ')})`
  return raw
}

const NODE_COLORS: Record<string, string> = {
  personne:   '#0D9488',
  entreprise: '#3B82F6',
  domaine:    '#8B5CF6',
  projet:     '#F97316',
  note:       '#94A3B8',
  journal:    '#64748B',
  fiche:      '#EC4899',
  document:   '#F59E0B'
}

function buildCyStyle(): cytoscape.StylesheetStyle[] {
  const bg = getCssColor('--cortx-bg')
  const border = getCssColor('--cortx-border')
  const textSec = getCssColor('--cortx-text-secondary')

  return [
    {
      selector: 'node',
      style: {
        // Shape: crisp circle with colored fill + subtle border
        shape: 'ellipse',
        width: 20,
        height: 20,
        'background-color': (ele: cytoscape.NodeSingular) =>
          NODE_COLORS[ele.data('type') as string] || '#94A3B8',
        'background-opacity': 0.9,
        'border-width': 1.5,
        'border-color': 'white',
        'border-opacity': 0.18,

        // Label below the node
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 4,
        'font-size': '9px',
        'font-family': 'Inter, system-ui, sans-serif',
        'font-weight': '500',
        color: '#F8FAFC',
        'text-outline-width': 0,
        'text-background-color': bg,
        'text-background-opacity': 0.72,
        'text-background-padding': '2px',
        'text-background-shape': 'round-rectangle',
        'text-max-width': '90px',
        'text-overflow-wrap': 'ellipsis',

        // Smooth transitions for highlight states
        'transition-property': 'opacity, width, height, border-width, border-color, border-opacity, background-opacity, text-opacity',
        'transition-duration': 180
      } as unknown as cytoscape.Css.Node
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': border,
        'target-arrow-color': border,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '7.5px',
        'font-family': 'Inter, system-ui, sans-serif',
        color: textSec,
        'text-rotation': 'autorotate',
        'text-background-color': bg,
        'text-background-opacity': 0.65,
        'text-background-padding': '1px',
        'text-background-shape': 'round-rectangle',
        'text-opacity': 0,
        opacity: 0.7,
        'transition-property': 'opacity, line-color, width, text-opacity',
        'transition-duration': 180
      } as unknown as cytoscape.Css.Edge
    },

    // --- Document nodes (library) — diamond shape to stand out ---
    {
      selector: 'node[type = "document"]',
      style: {
        shape: 'diamond',
        width: 22,
        height: 22,
      } as unknown as cytoscape.Css.Node
    },

    // --- Dimmed (non-selected neighborhood) ---
    {
      selector: 'node.dimmed',
      style: { opacity: 0.08 } as cytoscape.Css.Node
    },
    {
      selector: 'edge.dimmed',
      style: { opacity: 0.03 } as cytoscape.Css.Edge
    },

    // --- Neighbor highlight ---
    {
      selector: 'node.highlighted',
      style: {
        opacity: 1,
        width: 22,
        height: 22,
        'border-color': '#14B8A6',
        'border-opacity': 0.9,
        'border-width': 2,
        'background-opacity': 1
      } as unknown as cytoscape.Css.Node
    },

    // --- Selected node (origin of highlight) ---
    {
      selector: 'node.selected-node',
      style: {
        opacity: 1,
        width: 26,
        height: 26,
        'border-color': '#F97316',
        'border-opacity': 1,
        'border-width': 2.5,
        'background-opacity': 1
      } as unknown as cytoscape.Css.Node
    },

    // --- Highlighted edge ---
    {
      selector: 'edge.highlighted',
      style: {
        opacity: 1,
        'line-color': '#0D9488',
        'target-arrow-color': '#0D9488',
        width: 2,
        'text-opacity': 0.85
      } as unknown as cytoscape.Css.Edge
    },

    // --- Search match ---
    {
      selector: 'node.search-match',
      style: {
        opacity: 1,
        width: 24,
        height: 24,
        'border-color': '#F59E0B',
        'border-opacity': 1,
        'border-width': 2.5,
        'background-opacity': 1
      } as unknown as cytoscape.Css.Node
    },
    {
      selector: 'node.search-dim',
      style: { opacity: 0.1 } as cytoscape.Css.Node
    },
    {
      selector: 'edge.search-dim',
      style: { opacity: 0.04 } as cytoscape.Css.Edge
    },

    // --- Labels hidden when zoomed out ---
    {
      selector: 'node.labels-hidden',
      style: {
        'text-opacity': 0
      } as unknown as cytoscape.Css.Node
    },

    // ── Idle mode classes (slow transitions for a "meditative" feel) ──────────

    // Nodes being examined by the agent (teal glow)
    {
      selector: 'node.idle-examining',
      style: {
        opacity: 1,
        width: 26,
        height: 26,
        'border-color': '#14B8A6',
        'border-opacity': 0.85,
        'border-width': 3,
        'background-opacity': 1,
        'transition-property': 'opacity, width, height, border-width, border-color, border-opacity',
        'transition-duration': 600
      } as unknown as cytoscape.Css.Node
    },
    // Neighbors of examined nodes (softer teal)
    {
      selector: 'node.idle-attended',
      style: {
        opacity: 0.85,
        'border-color': '#14B8A6',
        'border-opacity': 0.35,
        'border-width': 2,
        'transition-property': 'opacity, border-width, border-color, border-opacity',
        'transition-duration': 500
      } as unknown as cytoscape.Css.Node
    },
    // Insight found! Nodes glow orange
    {
      selector: 'node.idle-insight',
      style: {
        opacity: 1,
        width: 32,
        height: 32,
        'border-color': '#F97316',
        'border-opacity': 1,
        'border-width': 3.5,
        'background-opacity': 1,
        'transition-property': 'opacity, width, height, border-width, border-color, border-opacity',
        'transition-duration': 300
      } as unknown as cytoscape.Css.Node
    },
    // Background nodes (dimmed subtly during idle)
    {
      selector: 'node.idle-bg',
      style: {
        opacity: 0.28,
        'transition-property': 'opacity',
        'transition-duration': 900
      } as unknown as cytoscape.Css.Node
    },
    // Recently explored trail — fades over 5s via JS timeout
    {
      selector: 'node.idle-recent',
      style: {
        opacity: 0.55,
        'border-color': '#14B8A6',
        'border-opacity': 0.25,
        'border-width': 1.5,
        'transition-property': 'opacity, border-color, border-opacity, border-width',
        'transition-duration': 1500
      } as unknown as cytoscape.Css.Node
    },
    // Edges being examined
    {
      selector: 'edge.idle-examining',
      style: {
        opacity: 1,
        'line-color': '#14B8A6',
        'target-arrow-color': '#14B8A6',
        width: 2,
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 500
      } as unknown as cytoscape.Css.Edge
    },
    // Insight edges
    {
      selector: 'edge.idle-insight',
      style: {
        opacity: 1,
        'line-color': '#F97316',
        'target-arrow-color': '#F97316',
        width: 2.5,
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 300
      } as unknown as cytoscape.Css.Edge
    },
    // Background edges
    {
      selector: 'edge.idle-bg',
      style: {
        opacity: 0.06,
        'transition-property': 'opacity',
        'transition-duration': 900
      } as unknown as cytoscape.Css.Edge
    },

    // ── Chat @mention live-focus classes ─────────────────────────────────────
    // These sit after idle-* so they take visual priority via CSS order.

    // Nodes not mentioned — fade out
    {
      selector: 'node.chat-dimmed',
      style: { opacity: 0.07, 'transition-property': 'opacity', 'transition-duration': 200 } as cytoscape.Css.Node
    },
    {
      selector: 'edge.chat-dimmed',
      style: { opacity: 0.03, 'transition-property': 'opacity', 'transition-duration': 200 } as cytoscape.Css.Edge
    },
    // Directly mentioned node — orange glow
    {
      selector: 'node.chat-focused',
      style: {
        opacity: 1,
        width: 28,
        height: 28,
        'border-color': '#F97316',
        'border-opacity': 1,
        'border-width': 3,
        'background-opacity': 1,
        'transition-property': 'opacity, width, height, border-width, border-color, border-opacity',
        'transition-duration': 220
      } as unknown as cytoscape.Css.Node
    },
    // Neighbors of mentioned nodes — teal accent
    {
      selector: 'node.chat-neighbor',
      style: {
        opacity: 0.9,
        'border-color': '#14B8A6',
        'border-opacity': 0.75,
        'border-width': 2,
        'transition-property': 'opacity, border-width, border-color, border-opacity',
        'transition-duration': 220
      } as unknown as cytoscape.Css.Node
    },
    // Edges connected to mentioned nodes
    {
      selector: 'edge.chat-neighbor',
      style: {
        opacity: 0.6,
        'line-color': '#14B8A6',
        'target-arrow-color': '#14B8A6',
        width: 1.5,
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 220
      } as unknown as cytoscape.Css.Edge
    }
  ]
}

// Initial layout: fcose with high quality — better than cose-bilkent for first render
function makeInitialLayout(): cytoscape.LayoutOptions {
  return {
    name: 'fcose',
    animate: true,
    animationDuration: 400,
    animationEasing: 'ease-out-cubic',
    randomize: true,
    quality: 'proof',
    fit: true,
    padding: 48,
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 120,
    nodeRepulsion: 8000,
    edgeElasticity: 0.45,
    gravity: 0.25,
    numIter: 2500,
    tilingPaddingVertical: 10,
    tilingPaddingHorizontal: 10
  } as unknown as cytoscape.LayoutOptions
}

// Live physics during drag: fcose supports fixedNodeConstraint
function makeLiveLayout(fixedId: string, fixedPos: { x: number; y: number }): cytoscape.LayoutOptions {
  return {
    name: 'fcose',
    animate: 'during',
    animationDuration: 80,
    animationEasing: 'linear',
    randomize: false,
    fit: false,
    quality: 'draft',
    numIter: 60,
    idealEdgeLength: 110,
    nodeRepulsion: 4500,
    edgeElasticity: 0.4,
    gravity: 0.2,
    fixedNodeConstraint: [{ nodeId: fixedId, position: fixedPos }]
  } as unknown as cytoscape.LayoutOptions
}

// ── Canvas overlay drawing utilities ─────────────────────────────────────────

type Pt = { x: number; y: number }

function bezierPt(p0: Pt, cp: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t
  return { x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x, y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y }
}

function controlPoint(p0: Pt, p1: Pt): Pt {
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  const dist = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2)
  return { x: mx, y: my - Math.max(30, Math.min(dist * 0.28, 90)) }
}

function drawIdleOverlay(
  canvas: HTMLCanvasElement,
  positions: Pt[],
  phase: string,
  t: number
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (positions.length < 1 || phase === 'stopped') return

  // ── Resting phase: very subtle ambient shimmer on all nodes ──────────────
  if (phase === 'resting') {
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]
      // Each node pulses with a slight offset so they don't all sync
      const offset = (i * 137) % 4000
      const pulse = (Math.sin(((t + offset) / 3000) * Math.PI * 2) + 1) / 2
      const alpha = 0.04 + pulse * 0.06
      const radius = (8 + pulse * 4) * dpr
      ctx.beginPath()
      ctx.arc(pos.x * dpr, pos.y * dpr, radius, 0, Math.PI * 2)
      ctx.fillStyle = '#14B8A6'
      ctx.globalAlpha = alpha
      ctx.fill()
      ctx.globalAlpha = 1
    }
    return
  }

  // ── Selecting phase: expanding ripple rings from each active node ──────────
  if (phase === 'selecting') {
    for (const pos of positions) {
      for (let ring = 0; ring < 3; ring++) {
        const ringOffset = ring * 700
        const progress = ((t + ringOffset) % 2100) / 2100
        const radius = (12 + progress * 30) * dpr
        const alpha = (1 - progress) * 0.6
        ctx.beginPath()
        ctx.arc(pos.x * dpr, pos.y * dpr, radius, 0, Math.PI * 2)
        ctx.strokeStyle = '#14B8A6'
        ctx.globalAlpha = alpha
        ctx.lineWidth = 1.5 * dpr
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    return
  }

  const isInsight = phase === 'insight'
  const isThinking = phase === 'thinking'
  const arcColor = isInsight ? '#F97316' : '#14B8A6'

  // Draw arcs between all pairs of active nodes
  const pairs: [Pt, Pt][] = []
  if (positions.length >= 2) {
    for (let i = 0; i < positions.length - 1; i++) {
      pairs.push([positions[i], positions[i + 1]])
    }
  }

  for (const [p0, p1] of pairs) {
    const cp = controlPoint(p0, p1)
    const steps = 60

    if (phase === 'examining') {
      // Progressive arc drawing (0→1 over 2s)
      const progress = Math.min(1, t / 1800)
      const endStep = Math.floor(steps * progress)
      if (endStep < 1) continue

      ctx.beginPath()
      ctx.moveTo(p0.x * dpr, p0.y * dpr)
      for (let s = 1; s <= endStep; s++) {
        const pt = bezierPt(p0, cp, p1, s / steps)
        ctx.lineTo(pt.x * dpr, pt.y * dpr)
      }
      ctx.strokeStyle = arcColor
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.5 * dpr
      ctx.setLineDash([])
      ctx.stroke()

      // Glowing tip at the arc front
      if (endStep < steps) {
        const tipT = endStep / steps
        const tip = bezierPt(p0, cp, p1, tipT)
        const grad = ctx.createRadialGradient(tip.x * dpr, tip.y * dpr, 0, tip.x * dpr, tip.y * dpr, 6 * dpr)
        grad.addColorStop(0, arcColor)
        grad.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.9
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(tip.x * dpr, tip.y * dpr, 6 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      // Full arc (thinking or insight)
      ctx.beginPath()
      ctx.moveTo(p0.x * dpr, p0.y * dpr)
      for (let s = 1; s <= steps; s++) {
        const pt = bezierPt(p0, cp, p1, s / steps)
        ctx.lineTo(pt.x * dpr, pt.y * dpr)
      }

      if (isInsight) {
        // Glowing thick arc
        ctx.strokeStyle = arcColor
        ctx.globalAlpha = 0.85
        ctx.lineWidth = 2.5 * dpr
        ctx.shadowColor = arcColor
        ctx.shadowBlur = 12 * dpr
        ctx.setLineDash([])
        ctx.stroke()
        ctx.shadowBlur = 0
      } else {
        // Dashed pulsing arc (thinking)
        const dashLen = 6 * dpr
        ctx.setLineDash([dashLen, dashLen * 1.5])
        ctx.lineDashOffset = -((t / 25) % (dashLen * 2.5))
        ctx.strokeStyle = arcColor
        ctx.globalAlpha = 0.35
        ctx.lineWidth = 1.5 * dpr
        ctx.stroke()
        ctx.setLineDash([])

        // Traveling glowing dot
        const dotT = (t % 2400) / 2400
        const dotPos = bezierPt(p0, cp, p1, dotT)
        const grad = ctx.createRadialGradient(dotPos.x * dpr, dotPos.y * dpr, 0, dotPos.x * dpr, dotPos.y * dpr, 8 * dpr)
        grad.addColorStop(0, arcColor)
        grad.addColorStop(0.4, arcColor + '88')
        grad.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.9
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(dotPos.x * dpr, dotPos.y * dpr, 8 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  // Pulsing rings on active nodes
  for (const pos of positions) {
    const pulseT = (t % 2000) / 2000
    const radius = isInsight
      ? (14 + 6 * Math.sin(t / 200)) * dpr
      : (10 + 4 * Math.sin(pulseT * Math.PI * 2)) * dpr

    const grad = ctx.createRadialGradient(pos.x * dpr, pos.y * dpr, 0, pos.x * dpr, pos.y * dpr, radius)
    grad.addColorStop(0, arcColor + '00')
    grad.addColorStop(0.5, arcColor + (isInsight ? '55' : '33'))
    grad.addColorStop(1, 'transparent')

    ctx.globalAlpha = isInsight ? 0.8 : 0.5
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(pos.x * dpr, pos.y * dpr, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Insight: sparkle particles
  if (isInsight && positions.length > 0) {
    const seed = Math.floor(t / 80)
    const center = positions[0]
    for (let i = 0; i < 6; i++) {
      const angle = ((seed + i) * 137.5 * Math.PI) / 180
      const r = (20 + ((seed * i * 17) % 25))
      const sx = center.x + Math.cos(angle) * r
      const sy = center.y + Math.sin(angle) * r
      const alpha = 0.3 + 0.4 * Math.abs(Math.sin((t / 300) + i))
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#F97316'
      ctx.beginPath()
      ctx.arc(sx * dpr, sy * dpr, 2 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
}

// Settle after drag release
function makeSettleLayout(): cytoscape.LayoutOptions {
  return {
    name: 'fcose',
    animate: true,
    animationDuration: 350,
    animationEasing: 'ease-out',
    randomize: false,
    fit: false,
    quality: 'proof',
    numIter: 800,
    idealEdgeLength: 110,
    nodeRepulsion: 6000,
    edgeElasticity: 0.4,
    gravity: 0.3
  } as unknown as cytoscape.LayoutOptions
}

export function GraphView({ searchQuery = '' }: { searchQuery?: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const layoutRanOnce = useRef(false)
  const containerReadyRef = useRef(false)  // true once the container has real dimensions
  const selectedNodeRef = useRef<string | null>(null)
  const liveLayoutRef = useRef<cytoscape.Layouts | null>(null)
  const rafRef = useRef<number | null>(null)
  const draggedNodeRef = useRef<cytoscape.NodeSingular | null>(null)
  // Snapshot of last data so we can replay it once the container is ready
  const pendingDataRef = useRef<{ nodes: typeof nodes; edges: typeof edges; filterTypes: Set<string> } | null>(null)
  // Debounce timer for re-fitting the viewport after a window/panel resize
  const resizeFitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId: string; filePath: string; label: string; isLibDoc: boolean
  } | null>(null)
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRewrite, setConfirmRewrite] = useState(false)
  const [isRewriting, setIsRewriting] = useState(false)
  const [rewriteUndo, setRewriteUndo] = useState<{ commitHash: string } | null>(null)
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; label: string; type: string; degree: number
  } | null>(null)

  const t = useT()
  const { nodes, edges, isLoading, loadGraph, filterTypes, toggleFilterType } = useGraphStore()
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const setActiveCenterView = useUIStore((s) => s.setActiveCenterView)
  const addToast = useUIStore((s) => s.addToast)
  const theme = useUIStore((s) => s.theme)
  const chatFocusedTitles = useUIStore((s) => s.chatFocusedTitles)
  const loadFiles = useFileStore((s) => s.loadFiles)
  const { selectDocument, deleteDocument } = useLibraryStore()
  const openFilePreviewRef = useRef(openFilePreview)
  useEffect(() => { openFilePreviewRef.current = openFilePreview }, [openFilePreview])

  const toggleCreateFileDialog = useUIStore((s) => s.toggleCreateFileDialog)
  const toggleCreateFileDialogRef = useRef(toggleCreateFileDialog)
  useEffect(() => { toggleCreateFileDialogRef.current = toggleCreateFileDialog }, [toggleCreateFileDialog])

  const idlePhase = useIdleStore((s) => s.phase)
  const idleNodeIds = useIdleStore((s) => s.activeNodeIds)
  const idleEdgeKeys = useIdleStore((s) => s.activeEdgeKeys)
  const idleThought = useIdleStore((s) => s.currentThought)
  const idleDraftCount = useIdleStore((s) => s.draftCount)

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number | null>(null)
  const animStartRef = useRef<number>(0)
  const searchQueryRef = useRef(searchQuery)
  useEffect(() => { searchQueryRef.current = searchQuery }, [searchQuery])
  // Refs so rAF callback always reads latest values without stale closures
  const idlePhaseRef = useRef(idlePhase)
  const idleNodeIdsRef = useRef(idleNodeIds)
  const idleActiveRef = useIdleStore((s) => s.isActive)
  // Trail: track previous active node IDs for lingering highlight
  const trailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActiveNodeIdsRef = useRef<string[]>([])

  const [thoughtBubblePos, setThoughtBubblePos] = useState<Pt | null>(null)
  const [thinkingElapsed, setThinkingElapsed] = useState(0)
  const thinkingStartRef = useRef<number | null>(null)

  // Keep refs in sync with state
  useEffect(() => {
    idlePhaseRef.current = idlePhase
    idleNodeIdsRef.current = idleNodeIds
    animStartRef.current = performance.now()
  }, [idlePhase, idleNodeIds])

  // Close context menus on Escape
  useEffect(() => {
    if (!contextMenu && !canvasContextMenu) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setConfirmDelete(false)
        setConfirmRewrite(false)
        setCanvasContextMenu(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [contextMenu, canvasContextMenu])

  async function handleRewrite(): Promise<void> {
    if (!contextMenu) return
    setConfirmRewrite(false)
    setIsRewriting(true)
    try {
      const commitHash = await window.cortx.agent.rewriteFile(contextMenu.filePath)
      setContextMenu(null)
      setRewriteUndo({ commitHash })
      await loadGraph()
      setTimeout(() => setRewriteUndo(null), 30000)
    } catch (err) {
      console.error(err)
      addToast(t.filePreview.rewriteError, 'error')
    } finally {
      setIsRewriting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!contextMenu) return
    try {
      if (contextMenu.isLibDoc) {
        const docId = contextMenu.nodeId.replace('lib:', '')
        await deleteDocument(docId)
        addToast(t.graph.libDocDeleted, 'info')
      } else {
        await window.cortx.agent.deleteFile(contextMenu.filePath)
        await loadFiles()
        addToast(t.filePreview.deleted, 'info')
      }
      setContextMenu(null)
      setConfirmDelete(false)
      await loadGraph()
    } catch (err) {
      console.error(err)
      addToast('Erreur lors de la suppression', 'error')
    }
  }

  async function handleOpenOriginal(): Promise<void> {
    if (!contextMenu) return
    const docId = contextMenu.nodeId.replace('lib:', '')
    try {
      await window.cortx.library.openOriginal(docId)
    } catch {
      addToast('Impossible d\'ouvrir le fichier original', 'error')
    }
    setContextMenu(null)
  }

  async function handleOpenTranscription(): Promise<void> {
    if (!contextMenu) return
    const docId = contextMenu.nodeId.replace('lib:', '')
    setContextMenu(null)
    // Switch to library view and select the document to show its preview
    setActiveCenterView('library')
    await selectDocument(docId)
  }

  // Rebuild Cytoscape style when theme changes (colors come from CSS variables)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.style(buildCyStyle())
  }, [theme])

  useEffect(() => {
    loadGraph()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Create cy instance once — event handlers wired here
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildCyStyle(),
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      minZoom: 0.15,
      maxZoom: 5,
      wheelSensitivity: 0.25
    })

    function stopLive(): void {
      if (liveLayoutRef.current) {
        liveLayoutRef.current.stop()
        liveLayoutRef.current = null
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    function clearSelection(): void {
      cy.elements().removeClass('dimmed highlighted selected-node idle-examining idle-attended idle-bg idle-insight chat-focused chat-neighbor chat-dimmed')
      selectedNodeRef.current = null
    }

    cy.on('tap', (e) => {
      if ((e.target as unknown) === cy) clearSelection()
    })

    cy.on('tap', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular
      const id = node.id() as string
      if (selectedNodeRef.current === id) { clearSelection(); return }
      selectedNodeRef.current = id
      cy.elements().addClass('dimmed').removeClass('highlighted selected-node')
      node.removeClass('dimmed').addClass('selected-node')
      const nb = node.neighborhood()
      nb.nodes().removeClass('dimmed').addClass('highlighted')
      nb.edges().removeClass('dimmed').addClass('highlighted')
      node.connectedEdges().removeClass('dimmed').addClass('highlighted')
    })

    cy.on('dbltap', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular
      const nodeId = node.id() as string
      // Library document nodes: open original file
      if (nodeId.startsWith('lib:')) {
        const docId = nodeId.replace('lib:', '')
        window.cortx.library.openOriginal(docId).catch(() => {})
        return
      }
      const fp = node.data('filePath') as string
      if (fp) openFilePreviewRef.current(fp)
    })

    // Right-click on empty canvas → show mini context menu
    cy.on('cxttap', (evt) => {
      if ((evt.target as unknown) === cy) {
        const pos = evt.renderedPosition
        setCanvasContextMenu({ x: pos.x, y: pos.y })
        setContextMenu(null)
      }
    })

    cy.on('cxttap', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular
      const nodeId = node.id() as string
      const fp = node.data('filePath') as string
      const label = node.data('label') as string
      const isLibDoc = nodeId.startsWith('lib:')
      // Library doc nodes: always show menu even without a filePath
      if (!fp && !isLibDoc) return
      const pos = evt.renderedPosition
      setCanvasContextMenu(null)
      setContextMenu({ x: pos.x, y: pos.y, nodeId, filePath: fp, label, isLibDoc })
      setConfirmDelete(false)
    })

    // ── Live physics drag ──────────────────────────────────────────────────

    cy.on('grab', 'node', (evt) => {
      stopLive()
      draggedNodeRef.current = evt.target as cytoscape.NodeSingular
    })

    cy.on('drag', 'node', () => {
      const node = draggedNodeRef.current
      if (!node) return
      if (rafRef.current !== null) return // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!draggedNodeRef.current) return
        stopLive()
        const pos = draggedNodeRef.current.position()
        liveLayoutRef.current = cy.layout(
          makeLiveLayout(draggedNodeRef.current.id() as string, { x: pos.x, y: pos.y })
        )
        liveLayoutRef.current.run()
      })
    })

    cy.on('dragfree', 'node', () => {
      stopLive()
      draggedNodeRef.current = null
      // Let physics settle smoothly after release
      const settle = cy.layout(makeSettleLayout())
      settle.run()
    })

    // ── Zoom-based LOD: hide labels below threshold ──────────────────────────
    let zoomLodTimer: ReturnType<typeof setTimeout> | null = null
    cy.on('zoom', () => {
      if (zoomLodTimer) clearTimeout(zoomLodTimer)
      zoomLodTimer = setTimeout(() => {
        zoomLodTimer = null
        const z = cy.zoom()
        cy.batch(() => {
          if (z < 0.6) cy.nodes().addClass('labels-hidden')
          else cy.nodes().removeClass('labels-hidden')
        })
      }, 50)
    })

    // ── Hover tooltip ─────────────────────────────────────────────────────────
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular
      const pos = node.renderedPosition()
      setTooltip({
        x: pos.x,
        y: pos.y,
        label: node.data('label') as string,
        type: node.data('type') as string,
        degree: node.degree(false)
      })
    })

    cy.on('mouseout', 'node', () => {
      setTooltip(null)
    })

    // Also clear tooltip on any canvas interaction
    cy.on('tap grab', () => {
      setTooltip(null)
    })

    // ResizeObserver: detect when the container gets real dimensions and
    // replay any data that arrived before the container was visible.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 10 && height > 10) {
        cy.resize() // tell Cytoscape the container changed size
        if (!containerReadyRef.current) {
          containerReadyRef.current = true
          // If data arrived before the container was ready, apply it now
          const pending = pendingDataRef.current
          if (pending) {
            pendingDataRef.current = null
            applyData(cy, pending.nodes, pending.edges, pending.filterTypes)
          }
        } else {
          // Container resized after initial layout — debounce a viewport re-fit
          // so nodes don't get clipped or pushed out of frame on window resize.
          if (resizeFitTimerRef.current) clearTimeout(resizeFitTimerRef.current)
          resizeFitTimerRef.current = setTimeout(() => {
            resizeFitTimerRef.current = null
            if (cyRef.current) cyRef.current.fit(undefined, 48)
          }, 150)
        }
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    cyRef.current = cy
    return () => {
      ro.disconnect()
      if (resizeFitTimerRef.current) clearTimeout(resizeFitTimerRef.current)
      if (zoomLodTimer) clearTimeout(zoomLodTimer)
      stopLive()
      cy.destroy()
      cyRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function applySearchClasses(cy: cytoscape.Core, q: string): void {
    cy.elements().removeClass('search-match search-dim')
    const query = q.trim().toLowerCase()
    if (!query) return
    const matchingNodes = cy.nodes().filter((n) =>
      (n.data('label') as string).toLowerCase().includes(query)
    )
    if (matchingNodes.length === 0) return
    cy.nodes().addClass('search-dim')
    cy.edges().addClass('search-dim')
    matchingNodes.removeClass('search-dim').addClass('search-match')
  }

  // Extracted so it can be called both from the data effect and from the ResizeObserver
  function applyData(
    cy: cytoscape.Core,
    dataNodes: typeof nodes,
    dataEdges: typeof edges,
    dataFilterTypes: Set<string>
  ): void {
    const filteredNodes = dataFilterTypes.size > 0
      ? dataNodes.filter((n) => dataFilterTypes.has(n.type))
      : dataNodes
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
    const filteredEdges = dataEdges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    )

    const edgeElements = filteredEdges.map((e, i) => ({
      data: {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        label: (e.label || 'lien').replace(/_/g, ' ')
      }
    }))

    const isFirst = !layoutRanOnce.current

    if (isFirst) {
      // ── First load: full setup with initial layout ────────────────────────
      selectedNodeRef.current = null
      cy.elements().remove()
      if (filteredNodes.length === 0) return

      cy.add([
        ...filteredNodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, filePath: n.filePath } })),
        ...edgeElements
      ])
      layoutRanOnce.current = true
      const layout = cy.layout(makeInitialLayout())
      layout.one('layoutstop', () => requestAnimationFrame(() => cy.fit(undefined, 48)))
      layout.run()
    } else {
      // ── Incremental diff: preserve node positions ─────────────────────────
      const existingNodeIds = new Set<string>()
      cy.nodes().forEach((n) => existingNodeIds.add(n.id() as string))

      // Save positions of nodes that will survive the update
      const savedPositions = new Map<string, { x: number; y: number }>()
      cy.nodes().forEach((node) => {
        if (filteredNodeIds.has(node.id() as string)) {
          savedPositions.set(node.id() as string, { ...node.position() })
        }
      })

      const posArr = Array.from(savedPositions.values())
      const centerX = posArr.length > 0 ? posArr.reduce((s, p) => s + p.x, 0) / posArr.length : 0
      const centerY = posArr.length > 0 ? posArr.reduce((s, p) => s + p.y, 0) / posArr.length : 0

      const nodesToAdd = filteredNodes.filter((n) => !existingNodeIds.has(n.id))
      const nodesToRemove = cy.nodes().filter((n) => !filteredNodeIds.has(n.id() as string))

      // Clear selection if selected node is being removed
      if (selectedNodeRef.current && !filteredNodeIds.has(selectedNodeRef.current)) {
        selectedNodeRef.current = null
        cy.elements().removeClass('dimmed highlighted selected-node')
      }

      // Remove stale nodes (their edges are removed automatically)
      if (nodesToRemove.length > 0) nodesToRemove.remove()

      // Rebuild all edges (no positions to preserve)
      cy.edges().remove()
      if (edgeElements.length > 0) cy.add(edgeElements)

      // Add new nodes, placed near the graph center
      if (nodesToAdd.length > 0) {
        cy.add(nodesToAdd.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, filePath: n.filePath } })))
      }

      // Restore positions for surviving nodes; jitter new ones
      cy.nodes().forEach((node) => {
        const saved = savedPositions.get(node.id() as string)
        if (saved) {
          node.position(saved)
        } else {
          node.position({ x: centerX + (Math.random() - 0.5) * 120, y: centerY + (Math.random() - 0.5) * 120 })
        }
      })

      // Run settle layout only when topology actually changed
      if (nodesToAdd.length > 0 || nodesToRemove.length > 0) {
        cy.layout({ ...makeSettleLayout(), animationDuration: 500 } as unknown as cytoscape.LayoutOptions).run()
      }
    }

    // ── Size nodes by degree (hubs larger, leaves smaller) ───────────────────
    let maxDeg = 1
    cy.nodes().forEach((n) => { const d = n.degree(false); if (d > maxDeg) maxDeg = d })
    cy.nodes().forEach((node) => {
      const size = 14 + Math.round((node.degree(false) / maxDeg) * 18) // 14 → 32 px
      node.style({ width: size, height: size })
    })

    // ── Apply LOD class based on current zoom level ───────────────────────────
    if (cy.zoom() < 0.6) cy.nodes().addClass('labels-hidden')

    applySearchClasses(cy, searchQueryRef.current)
  }

  // Sync elements + relayout when data / filters change
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    if (!containerReadyRef.current) {
      // Container has no size yet — store data and wait for ResizeObserver
      pendingDataRef.current = { nodes, edges, filterTypes }
      return
    }

    applyData(cy, nodes, edges, filterTypes)
  }, [nodes, edges, filterTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live graph focus driven by @mentions typed in the chat input
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.elements().removeClass('chat-focused chat-neighbor chat-dimmed')

    // Yield to idle mode — don't fight its visuals
    if (idlePhase !== 'stopped' && idlePhase !== 'resting') return
    if (chatFocusedTitles.length === 0) return

    const matched = cy.nodes().filter((n) => {
      const label = (n.data('label') as string).toLowerCase()
      return chatFocusedTitles.some((t) => {
        const tl = t.toLowerCase()
        return tl.length > 0 && (label.includes(tl) || tl.includes(label))
      })
    })
    if (matched.length === 0) return

    // Dim everything, then light up matched nodes + their direct neighbors
    cy.elements().addClass('chat-dimmed')
    matched.removeClass('chat-dimmed').addClass('chat-focused')
    const neighborNodes = matched.neighborhood().nodes()
    const neighborEdges = matched.connectedEdges().union(matched.neighborhood().edges())
    neighborNodes.removeClass('chat-dimmed').addClass('chat-neighbor')
    neighborEdges.removeClass('chat-dimmed').addClass('chat-neighbor')

    // Animate viewport to frame all relevant nodes
    if (!document.hidden) {
      const eles = matched.union(neighborNodes)
      cy.stop(true, true)
      cy.animate({
        fit: { eles, padding: 80 },
        duration: 450,
        easing: 'ease-in-out-cubic'
      } as Parameters<typeof cy.animate>[0])
    }
  }, [chatFocusedTitles, idlePhase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync idle mode visual classes on the Cytoscape graph
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    // ── Trail: move previous active nodes to idle-recent before clearing ──────
    if (prevActiveNodeIdsRef.current.length > 0 && idleNodeIds.length > 0) {
      const newActiveSet = new Set(idleNodeIds)
      for (const prevId of prevActiveNodeIdsRef.current) {
        if (!newActiveSet.has(prevId)) {
          const node = cy.getElementById(prevId)
          if (node.length > 0) {
            node.removeClass('idle-examining idle-insight idle-bg').addClass('idle-recent')
          }
        }
      }
      // Auto-remove trail after 5s
      if (trailTimerRef.current) clearTimeout(trailTimerRef.current)
      trailTimerRef.current = setTimeout(() => {
        if (cyRef.current) cyRef.current.nodes().removeClass('idle-recent')
      }, 5000)
    }

    // Clear all idle + chat classes
    cy.elements().removeClass('idle-examining idle-attended idle-bg idle-insight chat-focused chat-neighbor chat-dimmed')

    if (idlePhase === 'stopped' || idlePhase === 'resting' || idleNodeIds.length === 0) {
      prevActiveNodeIdsRef.current = []
      return
    }

    prevActiveNodeIdsRef.current = [...idleNodeIds]
    const activeSet = new Set(idleNodeIds)
    const isInsight = idlePhase === 'insight'
    const nodeClass = isInsight ? 'idle-insight' : 'idle-examining'
    const edgeClass = isInsight ? 'idle-insight' : 'idle-examining'

    // Dim all nodes/edges first
    cy.nodes().addClass('idle-bg')
    cy.edges().addClass('idle-bg')

    // Highlight active nodes
    for (const nodeId of idleNodeIds) {
      const node = cy.getElementById(nodeId)
      if (node.length > 0) {
        node.removeClass('idle-bg idle-recent').addClass(nodeClass)
        if (!isInsight) {
          node.neighborhood().nodes().forEach((nb) => {
            if (!activeSet.has(nb.id() as string)) {
              nb.removeClass('idle-bg').addClass('idle-attended')
            }
          })
        }
      }
    }

    // Highlight active edges
    for (const edgeKey of idleEdgeKeys) {
      const [src, tgt] = edgeKey.split('->')
      cy.edges().forEach((edge) => {
        if (
          (edge.source().id() === src && edge.target().id() === tgt) ||
          (edge.source().id() === tgt && edge.target().id() === src)
        ) {
          edge.removeClass('idle-bg').addClass(edgeClass)
        }
      })
    }

    // ── Camera: pan toward active nodes (skip if window hidden to avoid queuing) ──
    if (
      idleNodeIds.length > 0 &&
      !document.hidden &&
      (idlePhase === 'examining' || idlePhase === 'thinking' || idlePhase === 'insight')
    ) {
      const activeNodes = cy.nodes().filter((n) => idleNodeIds.includes(n.id() as string))
      if (activeNodes.length > 0) {
        cy.stop(true, true) // cancel any queued animations first
        cy.animate({
          fit: { eles: activeNodes, padding: isInsight ? 80 : 120 },
          duration: isInsight ? 500 : 700,
          easing: 'ease-in-out-cubic'
        } as Parameters<typeof cy.animate>[0])
      }
    }

    // ── Insight flash ─────────────────────────────────────────────────────────
    if (isInsight) {
      const flash = document.createElement('div')
      flash.className = 'idle-insight-flash'
      document.body.appendChild(flash)
      setTimeout(() => flash.remove(), 1400)
    }
  }, [idlePhase, idleNodeIds, idleEdgeKeys])

  // When window regains focus: cancel any Cytoscape animations that queued up while hidden
  useEffect(() => {
    function onVisible(): void {
      if (!document.hidden && cyRef.current) {
        cyRef.current.stop(true, true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Apply search highlight when query changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    applySearchClasses(cy, searchQuery)
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize overlay canvas to match container
  useEffect(() => {
    const canvas = overlayCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ro = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Canvas animation loop for idle overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return

    let active = true

    function frame(): void {
      if (!active) return
      const cv = overlayCanvasRef.current
      const cy = cyRef.current
      if (!cv || !cy) { if (active) animFrameRef.current = requestAnimationFrame(frame); return }

      const phase = idlePhaseRef.current
      const nodeIds = idleNodeIdsRef.current
      const t = performance.now() - animStartRef.current

      // Get rendered positions: active nodes for most phases, ALL nodes for resting
      const positions: Pt[] = []
      if (phase === 'resting' || phase === 'selecting') {
        // During resting/selecting, collect all node positions for ambient animation
        cy.nodes().forEach((node) => {
          positions.push(node.renderedPosition() as Pt)
        })
      } else {
        for (const id of nodeIds) {
          const node = cy.getElementById(id)
          if (node.length > 0) positions.push(node.renderedPosition() as Pt)
        }
      }

      drawIdleOverlay(cv, positions, phase, t)

      // Keep animating for all non-stopped phases (including resting for ambient)
      if (phase !== 'stopped') {
        animFrameRef.current = requestAnimationFrame(frame)
      } else {
        const ctx = cv.getContext('2d')
        ctx?.clearRect(0, 0, cv.width, cv.height)
      }
    }

    if (idlePhase !== 'stopped') {
      animFrameRef.current = requestAnimationFrame(frame)
    } else {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }

    return () => {
      active = false
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
    }
  }, [idlePhase, idleNodeIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update thought bubble position when active nodes change
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || idleNodeIds.length === 0 || idlePhase === 'stopped' || idlePhase === 'resting') {
      setThoughtBubblePos(null)
      return
    }
    // Use top-1 or top-2 nodes, pick the highest on screen (smallest y)
    const positions: Pt[] = []
    for (const id of idleNodeIds.slice(0, 2)) {
      const node = cy.getElementById(id)
      if (node.length > 0) positions.push(node.renderedPosition() as Pt)
    }
    if (positions.length === 0) { setThoughtBubblePos(null); return }
    const x = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const y = Math.min(...positions.map((p) => p.y))
    setThoughtBubblePos({ x, y })
  }, [idlePhase, idleNodeIds])

  // Elapsed-time ticker for the thinking phase
  useEffect(() => {
    if (idlePhase === 'thinking') {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now()
        setThinkingElapsed(0)
      }
      const timer = setInterval(() => {
        setThinkingElapsed(Math.floor((Date.now() - (thinkingStartRef.current ?? Date.now())) / 1000))
      }, 1000)
      return () => clearInterval(timer)
    } else {
      thinkingStartRef.current = null
      setThinkingElapsed(0)
    }
  }, [idlePhase])

  // Always render the container div so the Cytoscape setup effect can attach
  // to it on the very first mount — even before data loads.
  // Loading / empty states are overlaid on top rather than replacing the container.
  const showThoughtBubble = idleActiveRef && thoughtBubblePos && idlePhase !== 'stopped' && idlePhase !== 'resting' && idlePhase !== 'selecting'
  const isInsightPhase = idlePhase === 'insight'

  return (
    <div className="flex-1 relative w-full h-full">
      {/* Cytoscape canvas — always present so the setup effect can attach */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Idle canvas overlay — animated arcs drawn on top of Cytoscape */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 5 }}
      />

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 52, zIndex: 25 }}
        >
          <div className="bg-cortx-surface/96 backdrop-blur-md border border-cortx-border rounded-xl px-3 py-2 shadow-2xl max-w-[200px]">
            <p className="text-xs font-semibold text-cortx-text-primary truncate leading-tight">{tooltip.label}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="text-2xs px-1.5 py-0.5 rounded-full text-white font-medium"
                style={{ backgroundColor: NODE_COLORS[tooltip.type] || '#94A3B8' }}
              >
                {tooltip.type}
              </span>
              <span className="text-2xs text-cortx-text-secondary">
                {tooltip.degree} lien{tooltip.degree !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Idle thought bubble — floats near active nodes */}
      {showThoughtBubble && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: thoughtBubblePos!.x,
            top: thoughtBubblePos!.y,
            transform: 'translate(-50%, calc(-100% - 22px))',
            zIndex: 10,
            transition: 'left 0.8s ease, top 0.8s ease, opacity 0.4s ease'
          }}
        >
          <div
            className={`relative backdrop-blur-md rounded-xl px-3 py-2 text-center shadow-xl border transition-all duration-500 max-w-[240px] ${
              isInsightPhase
                ? 'bg-orange-950/80 border-orange-400/50 shadow-orange-500/20'
                : 'bg-cortx-surface/85 border-cortx-accent/35 shadow-cortx-accent/10'
            }`}
          >
            {/* Phase label + elapsed time for thinking */}
            <div className={`text-2xs font-mono uppercase tracking-widest mb-1 flex items-center justify-center gap-1.5 ${isInsightPhase ? 'text-orange-400/70' : 'text-cortx-accent/60'}`}>
              {idlePhase === 'examining' && <span>⬡ examen</span>}
              {idlePhase === 'thinking' && <span>◌ analyse</span>}
              {idlePhase === 'insight' && <span>✦ insight</span>}
              {idlePhase === 'thinking' && thinkingElapsed > 0 && (
                <span className="opacity-50">{thinkingElapsed}s</span>
              )}
            </div>
            {/* Thought content — always shows tail of streamed text */}
            {(() => {
              const TAIL = 110
              const hasOverflow = idleThought.length > TAIL
              const tail = hasOverflow ? idleThought.slice(-TAIL) : idleThought
              return (
                <p className={`text-xs leading-snug font-medium text-left ${isInsightPhase ? 'text-orange-100' : 'text-cortx-text-primary/90'}`}>
                  {tail ? (
                    <>
                      {hasOverflow && <span className="opacity-30">… </span>}
                      {tail}
                      {idlePhase === 'thinking' && (
                        <span className="inline-block w-[2px] h-[0.85em] bg-current align-middle ml-0.5 animate-pulse" />
                      )}
                    </>
                  ) : (
                    idlePhase === 'thinking'
                      ? <span className="opacity-40">…</span>
                      : '…'
                  )}
                </p>
              )
            })()}
            {/* Draft count badge */}
            {idleDraftCount > 0 && !isInsightPhase && (
              <div className="mt-1.5 text-2xs text-cortx-text-secondary/50">
                {t.graph.draftsInMemory(idleDraftCount)}
              </div>
            )}
            {/* Arrow pointing down */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 -bottom-[7px] w-3 h-3 rotate-45 border-r border-b ${
                isInsightPhase ? 'bg-orange-950/80 border-orange-400/50' : 'bg-cortx-surface/85 border-cortx-accent/35'
              }`}
            />
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-cortx-accent/30 border-t-cortx-accent animate-spin" />
            <span className="text-xs text-cortx-text-secondary">{t.graph.loading}</span>
          </div>
        </div>
      )}

      {/* Empty state overlay */}
      {!isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-cortx-surface flex items-center justify-center mb-4">
            <Network size={28} className="text-cortx-text-secondary/40" />
          </div>
          <h3 className="text-sm font-medium text-cortx-text-secondary mb-1">{t.graph.empty}</h3>
          <p className="text-xs text-cortx-text-secondary/60 max-w-[280px]">
            {t.graph.emptyHint}
          </p>
        </div>
      )}

      {nodes.length > 0 && (
        <GraphFilterBar filterTypes={filterTypes} toggleFilterType={toggleFilterType} cyRef={cyRef} />
      )}
      {nodes.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none select-none">
          <p className="text-2xs text-cortx-text-secondary/40 bg-cortx-surface/70 backdrop-blur-sm px-2.5 py-1 rounded-full border border-cortx-border/30">
            {t.graph.hint}
          </p>
        </div>
      )}

      {/* Undo bar after rewrite */}
      {rewriteUndo && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-cortx-surface border border-cortx-border rounded-card px-3 py-2 shadow-lg">
          <span className="text-xs text-cortx-text-primary">{t.filePreview.rewritten}</span>
          <button
            onClick={async () => {
              try {
                await window.cortx.agent.undo(rewriteUndo.commitHash)
                setRewriteUndo(null)
                await loadGraph()
                addToast(t.filePreview.undone, 'info')
              } catch {
                addToast(t.filePreview.undoError, 'error')
              }
            }}
            className="text-xs text-cortx-accent hover:text-cortx-accent-light cursor-pointer transition-colors"
          >
            {t.filePreview.cancel}
          </button>
          <button
            onClick={() => setRewriteUndo(null)}
            className="text-xs text-cortx-text-secondary/50 hover:text-cortx-text-primary cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Canvas context menu (right-click in void) */}
      {canvasContextMenu && (
        <>
          <div
            className="absolute inset-0 z-10"
            onClick={() => setCanvasContextMenu(null)}
          />
          <div
            className="absolute z-20 bg-cortx-surface border border-cortx-border rounded-card shadow-xl py-1 min-w-[180px]"
            style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
          >
            <button
              onClick={() => {
                setCanvasContextMenu(null)
                toggleCreateFileDialogRef.current()
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
            >
              <Plus size={13} className="text-cortx-accent" />
              {t.graph.createFile}
            </button>
          </div>
        </>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="absolute inset-0 z-10"
            onClick={() => { setContextMenu(null); setConfirmDelete(false); setConfirmRewrite(false) }}
          />
          <div
            className="absolute z-20 bg-cortx-surface border border-cortx-border rounded-card shadow-xl py-1 min-w-[210px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="px-3 py-1.5 text-2xs text-cortx-text-secondary/60 border-b border-cortx-border truncate flex items-center gap-1.5">
              {contextMenu.isLibDoc && <FileText size={10} className="text-amber-400 flex-shrink-0" />}
              {contextMenu.label}
            </div>

            {contextMenu.isLibDoc ? (
              /* ── Library document actions ── */
              <>
                <button
                  onClick={handleOpenOriginal}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
                >
                  <ExternalLink size={13} />
                  {t.graph.openOriginal}
                </button>
                <button
                  onClick={handleOpenTranscription}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
                >
                  <FileText size={13} />
                  {t.graph.viewTranscription}
                </button>
                <div className="border-t border-cortx-border mt-1" />
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    {t.graph.deleteFromLibrary}
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-xs text-red-400">{t.graph.deleteForever}</p>
                    <div className="flex gap-1.5">
                      <button onClick={handleDelete} className="flex-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded px-2 py-1 transition-colors cursor-pointer">
                        {t.graph.delete}
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs bg-cortx-elevated hover:bg-cortx-border text-cortx-text-secondary rounded px-2 py-1 transition-colors cursor-pointer">
                        {t.filePreview.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Knowledge-base entity actions ── */
              <>
                {!confirmRewrite ? (
                  <button
                    onClick={() => setConfirmRewrite(true)}
                    disabled={isRewriting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isRewriting ? 'animate-spin' : ''} />
                    {isRewriting ? t.graph.rewriting : t.graph.rewrite}
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-xs text-cortx-text-secondary">{t.graph.rewrite}?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleRewrite()}
                        className="flex-1 text-xs text-cortx-accent hover:text-cortx-accent-light font-medium cursor-pointer transition-colors"
                      >
                        {t.filePreview.yes}
                      </button>
                      <button
                        onClick={() => setConfirmRewrite(false)}
                        className="flex-1 text-xs text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer transition-colors"
                      >
                        {t.filePreview.no}
                      </button>
                    </div>
                  </div>
                )}
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    {t.graph.delete}
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-xs text-red-400">{t.graph.deleteForever}</p>
                    <div className="flex gap-1.5">
                      <button onClick={handleDelete} className="flex-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded px-2 py-1 transition-colors cursor-pointer">
                        {t.graph.delete}
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs bg-cortx-elevated hover:bg-cortx-border text-cortx-text-secondary rounded px-2 py-1 transition-colors cursor-pointer">
                        {t.filePreview.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Filter bar ──────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { type: 'personne',   label: 'Personne',   color: NODE_COLORS.personne },
  { type: 'entreprise', label: 'Entreprise', color: NODE_COLORS.entreprise },
  { type: 'domaine',    label: 'Domaine',    color: NODE_COLORS.domaine },
  { type: 'projet',     label: 'Projet',     color: NODE_COLORS.projet },
  { type: 'note',       label: 'Note',       color: NODE_COLORS.note },
  { type: 'journal',    label: 'Journal',    color: NODE_COLORS.journal },
  { type: 'fiche',      label: 'Fiche',      color: NODE_COLORS.fiche },
  { type: 'document',   label: 'Document',   color: NODE_COLORS.document }
]

function GraphFilterBar({
  filterTypes,
  toggleFilterType,
  cyRef
}: {
  filterTypes: Set<string>
  toggleFilterType: (t: string) => void
  cyRef: React.RefObject<cytoscape.Core | null>
}): React.JSX.Element {
  const allVisible = filterTypes.size === 0

  return (
    <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-cortx-surface/95 backdrop-blur-sm rounded-card px-3 py-2 border border-cortx-border shadow-lg flex-wrap">
      <span className="text-2xs text-cortx-text-secondary/50 uppercase tracking-wider mr-1 flex-shrink-0">
        Filtrer
      </span>
      {LEGEND_ITEMS.map((item) => {
        const active = allVisible || filterTypes.has(item.type)
        return (
          <button
            key={item.type}
            onClick={() => toggleFilterType(item.type)}
            className={`flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-full border cursor-pointer transition-all duration-150 ${
              active
                ? 'border-transparent text-cortx-text-primary'
                : 'border-cortx-border text-cortx-text-secondary/40 opacity-35'
            }`}
            style={{ backgroundColor: active ? item.color + '20' : undefined }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: active ? item.color : '#64748B' }} />
            {item.label}
          </button>
        )
      })}
      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
        {filterTypes.size > 0 && (
          <button
            onClick={() => filterTypes.forEach((t) => toggleFilterType(t))}
            className="text-2xs px-2 py-0.5 rounded border border-cortx-accent/40 text-cortx-accent hover:bg-cortx-accent/10 cursor-pointer transition-colors"
          >
            Tout afficher
          </button>
        )}
        <button
          onClick={() => cyRef.current?.fit(undefined, 40)}
          title="Recentrer"
          className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary/50 hover:text-cortx-text-primary cursor-pointer transition-colors"
        >
          <LayoutGrid size={12} />
        </button>
      </div>
    </div>
  )
}
