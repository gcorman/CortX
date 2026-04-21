import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  MarkerType,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Handle visibility: hidden by default, visible on selection or while connecting
const CANVAS_CSS = `
  .canvas-handle { opacity: 0 !important; transition: opacity 0.15s !important; }
  .react-flow__node.selected .canvas-handle { opacity: 1 !important; }
  .canvas-handle.connecting,
  .canvas-handle.react-flow__handle-valid { opacity: 1 !important; }
  .react-flow__node:hover .canvas-handle { opacity: 0.45 !important; }
`
import {
  Plus, FileText, StickyNote, Sparkles, Save, Check, Loader2
} from 'lucide-react'
import { useCanvasStore } from '../../stores/canvasStore'
import { useFileStore } from '../../stores/fileStore'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n'
import type { CanvasNode as CortxNode, CanvasEdge, StickyColor, CanvasLineStyle, CanvasArrow } from '../../../shared/types'
import { EntityTileNode } from './EntityTileNode'
import { StickyNoteNode } from './StickyNoteNode'
import { DeletableEdge } from './DeletableEdge'
import { CanvasSidebar } from './CanvasSidebar'
import { EntityPicker } from './EntityPicker'
import { AgentSuggestModal } from './AgentSuggestModal'

const nodeTypes = { entity: EntityTileNode, note: StickyNoteNode }
const edgeTypes = { default: DeletableEdge }

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function cortxToRFNode(n: CortxNode): Node {
  return {
    id: n.id,
    type: n.kind === 'entity' ? 'entity' : 'note',
    position: n.position,
    data: n.data as Record<string, unknown>
  }
}

function edgeMarker(arrow: CanvasArrow, side: 'end' | 'start') {
  const show = (arrow === 'both') || (side === 'end' && arrow === 'forward') || (side === 'start' && arrow === 'backward')
  return show ? { type: MarkerType.ArrowClosed, width: 10, height: 10, color: 'rgba(148,163,184,0.55)' } : undefined
}

function cortxToRFEdge(e: CanvasEdge): Edge {
  const ls = e.lineStyle ?? 'solid'
  const ar = e.arrow     ?? 'forward'
  const strokeDasharray = ls === 'dashed' ? '6 3' : ls === 'dotted' ? '2 2' : undefined
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    label: e.label,
    type: 'default',
    animated: e.kind === 'relation',
    data: { lineStyle: ls, arrow: ar },
    style: { stroke: 'rgba(148, 163, 184, 0.55)', strokeWidth: 1.5, strokeDasharray },
    markerEnd:   edgeMarker(ar, 'end'),
    markerStart: edgeMarker(ar, 'start'),
    labelStyle: { fill: '#CBD5E1', fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: 'rgba(15, 23, 42, 0.85)', fillOpacity: 1 },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 6
  }
}

function rfToCortxNode(n: Node, orig?: CortxNode): CortxNode {
  const kind = (n.type === 'entity' ? 'entity' : 'note') as CortxNode['kind']
  return {
    id: n.id,
    kind,
    position: n.position,
    data: { ...(orig?.data || {}), ...(n.data as object) } as CortxNode['data']
  }
}

function rfToCortxEdge(e: Edge, orig?: CanvasEdge): CanvasEdge {
  const d = e.data as { lineStyle?: CanvasLineStyle; arrow?: CanvasArrow } | undefined
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? orig?.sourceHandle,
    targetHandle: e.targetHandle ?? orig?.targetHandle,
    label: typeof e.label === 'string' ? e.label : orig?.label,
    kind: orig?.kind || 'freeform',
    lineStyle: d?.lineStyle ?? orig?.lineStyle,
    arrow:     d?.arrow     ?? orig?.arrow
  }
}

// ─── CanvasInner ──────────────────────────────────────────────────────────────

function CanvasInner(): React.JSX.Element {
  const active        = useCanvasStore((s) => s.active)
  const setStoreNodes = useCanvasStore((s) => s.setNodes)
  const setStoreEdges = useCanvasStore((s) => s.setEdges)
  const setViewport   = useCanvasStore((s) => s.setViewport)
  const saveActive    = useCanvasStore((s) => s.saveActive)
  const isDirty       = useCanvasStore((s) => s.isDirty)
  const isSaving      = useCanvasStore((s) => s.isSaving)
  const markDirty     = useCanvasStore((s) => s.markDirty)

  const rfInstance = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  // RF owns its own node/edge state — no controlled-nodes fights
  const [rfNodes, setRFNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRFEdges, onEdgesChange] = useEdgesState([])

  // Keep refs to the latest RF state so sync callbacks are always fresh
  const rfNodesRef = useRef(rfNodes)
  const rfEdgesRef = useRef(rfEdges)
  rfNodesRef.current = rfNodes
  rfEdgesRef.current = rfEdges

  // Keep a ref to active's node/edge maps for O(1) data lookup
  const activeOriginalsRef = useRef<{
    nodes: Map<string, CortxNode>
    edges: Map<string, CanvasEdge>
  }>({ nodes: new Map(), edges: new Map() })

  const theme = useUIStore((s) => s.theme)
  const files = useFileStore((s) => s.files)
  const t = useT()

  const [ctrlHeld, setCtrlHeld] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent): void => { if (e.ctrlKey || e.metaKey) setCtrlHeld(true) }
    const up   = (e: KeyboardEvent): void => { if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const [showEntityPicker, setShowEntityPicker] = useState(false)
  const [showAgentModal,   setShowAgentModal]   = useState(false)
  const [justSaved,        setJustSaved]        = useState(false)
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevId      = useRef<string | null>(null)

  // ── When active canvas switches: load RF state from store ─────────────────
  useEffect(() => {
    if (!active) {
      setRFNodes([])
      setRFEdges([])
      prevId.current = null
      return
    }
    if (active.id === prevId.current) return  // same canvas, don't reset
    prevId.current = active.id

    const nodes = active.nodes.map(cortxToRFNode)
    const edges = active.edges.map(cortxToRFEdge)
    setRFNodes(nodes)
    setRFEdges(edges)

    activeOriginalsRef.current = {
      nodes: new Map(active.nodes.map((n) => [n.id, n])),
      edges: new Map(active.edges.map((e) => [e.id, e]))
    }

    // Restore viewport
    if (active.viewport) {
      setTimeout(() => rfInstance.setViewport(active.viewport!, { duration: 0 }), 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  // ── Sync RF → store (debounced, only after user drags / deletes) ──────────
  const syncToStore = useCallback(() => {
    const origs = activeOriginalsRef.current
    const nodes = rfNodesRef.current.map((n) => rfToCortxNode(n, origs.nodes.get(n.id)))
    const edges = rfEdgesRef.current.map((e) => rfToCortxEdge(e, origs.edges.get(e.id)))
    setStoreNodes(nodes)
    setStoreEdges(edges)
  }, [setStoreNodes, setStoreEdges])

  const scheduleSyncAndSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      syncToStore()
      void saveActive().then(() => {
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 1500)
      })
    }, 1200)
  }, [syncToStore, saveActive])

  // Trigger autosave when dirty flag changes
  useEffect(() => {
    if (!isDirty) return
    scheduleSyncAndSave()
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [isDirty, scheduleSyncAndSave])

  // ── RF event handlers ─────────────────────────────────────────────────────
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    // Only mark dirty for structural changes (drag, delete) — not for selection/dims
    const isStructural = changes.some(
      (c) => c.type === 'position' || c.type === 'remove' || c.type === 'add'
    )
    if (isStructural) markDirty()
  }, [onNodesChange, markDirty])

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    onEdgesChange(changes)
    const isStructural = changes.some((c) => c.type === 'remove' || c.type === 'add')
    if (isStructural) markDirty()
  }, [onEdgesChange, markDirty])

  const onConnect = useCallback((connection: Connection) => {
    const newEdge: Edge = {
      id: randomId('e'),
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle
    }
    setRFEdges((prev) => rfAddEdge(newEdge, prev))
    markDirty()
  }, [setRFEdges, markDirty])

  const onMoveEnd = useCallback(() => {
    setViewport(rfInstance.getViewport())
  }, [rfInstance, setViewport])

  // ── Node position helper ──────────────────────────────────────────────────
  const nextSpawnPos = useCallback((w: number, h: number): { x: number; y: number } => {
    const vp = rfInstance.getViewport()
    const wrapper = wrapperRef.current
    const paneW = wrapper ? wrapper.getBoundingClientRect().width  : 800
    const paneH = wrapper ? wrapper.getBoundingClientRect().height : 600
    const cx = (paneW / 2 - vp.x) / vp.zoom
    const cy = (paneH / 2 - vp.y) / vp.zoom
    const count = rfNodesRef.current.length
    const spacingX = w + 40
    const spacingY = h + 40
    const col = count % 3
    const row = Math.floor(count / 3)
    return {
      x: cx - spacingX + col * spacingX,
      y: cy - h / 2 + row * spacingY
    }
  }, [rfInstance])

  // ── Add entity tile ───────────────────────────────────────────────────────
  const addEntity = useCallback((file: { path: string; title: string; type: string; tags: string[] }) => {
    if (!active) return
    const w = 220, h = 110
    const position = nextSpawnPos(w, h)
    const id = randomId('n')
    const cortxNode: CortxNode = { id, kind: 'entity', position, data: { filePath: file.path, title: file.title, entityType: file.type, tags: file.tags } }
    activeOriginalsRef.current.nodes.set(id, cortxNode)
    setRFNodes((prev) => [...prev, cortxToRFNode(cortxNode)])
    markDirty()
    setTimeout(() => rfInstance.setCenter(position.x + w / 2, position.y + h / 2, { zoom: Math.max(rfInstance.getViewport().zoom, 0.75), duration: 300 }), 50)
  }, [active, nextSpawnPos, setRFNodes, markDirty, rfInstance])

  // ── Add sticky note ───────────────────────────────────────────────────────
  const addSticky = useCallback((color: StickyColor = 'neutral') => {
    if (!active) return
    const w = 200, h = 130
    const position = nextSpawnPos(w, h)
    const id = randomId('n')
    const cortxNode: CortxNode = { id, kind: 'note', position, data: { text: '', color } }
    activeOriginalsRef.current.nodes.set(id, cortxNode)
    setRFNodes((prev) => [...prev, cortxToRFNode(cortxNode)])
    markDirty()
    setTimeout(() => rfInstance.setCenter(position.x + w / 2, position.y + h / 2, { zoom: Math.max(rfInstance.getViewport().zoom, 0.75), duration: 300 }), 50)
  }, [active, nextSpawnPos, setRFNodes, markDirty, rfInstance])

  // ── Apply agent suggestion ────────────────────────────────────────────────
  const applyAgentSuggestion = useCallback((nodes: CortxNode[], edges: CanvasEdge[]) => {
    nodes.forEach((n) => activeOriginalsRef.current.nodes.set(n.id, n))
    edges.forEach((e) => activeOriginalsRef.current.edges.set(e.id, e))
    setRFNodes((prev) => [...prev, ...nodes.map(cortxToRFNode)])
    setRFEdges((prev) => [...prev, ...edges.map(cortxToRFEdge)])
    markDirty()
    const ids = nodes.map((n) => n.id)
    setTimeout(() => {
      rfInstance.fitView({ nodes: ids.map((id) => ({ id })), duration: 500, padding: 0.2 })
    }, 80)
  }, [setRFNodes, setRFEdges, markDirty, rfInstance])

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_evt, node) => {
    if (node.type === 'entity') {
      const fp = (node.data as { filePath?: string }).filePath
      if (fp) import('../../stores/uiStore').then((m) => m.useUIStore.getState().openFilePreview(fp))
    }
  }, [])

  const excludePaths = new Set(
    rfNodes.filter((n) => n.type === 'entity' && (n.data as { filePath?: string }).filePath)
           .map((n) => (n.data as { filePath: string }).filePath)
  )

  if (!active) return <EmptyState />

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <style>{CANVAS_CSS}</style>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveEnd={onMoveEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={false}
        defaultViewport={active.viewport ?? { x: 0, y: 0, zoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Control"
        selectionOnDrag={ctrlHeld}
        panOnScroll
        panOnDrag={ctrlHeld ? [1, 2] : [0, 1, 2]}
        zoomOnScroll={false}
        zoomOnPinch
        minZoom={0.2}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1}
          color={theme === 'light' ? 'rgba(100, 116, 139, 0.3)' : 'rgba(148, 163, 184, 0.15)'}
        />
        <Controls
          className="!bg-cortx-surface/70 !backdrop-blur-xl !border !border-white/10 !rounded-xl !shadow-2xl [&>button]:!bg-transparent [&>button]:!border-white/5 [&>button]:!text-cortx-text-secondary hover:[&>button]:!text-cortx-text-primary"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-cortx-surface/70 !backdrop-blur-xl !border !border-white/10 !rounded-xl overflow-hidden"
          maskColor="rgba(15, 23, 42, 0.7)"
          nodeStrokeColor="rgba(148,163,184,0.4)"
          nodeColor={(n) => {
            if (n.type === 'entity') {
              const t = (n.data as { entityType?: string }).entityType
              return t === 'personne' ? '#0D9488' : t === 'entreprise' ? '#3B82F6' : t === 'domaine' ? '#8B5CF6' : t === 'projet' ? '#F97316' : '#94A3B8'
            }
            return 'rgba(148, 163, 184, 0.5)'
          }}
          pannable zoomable
        />
      </ReactFlow>

      {/* Floating toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 p-1 bg-cortx-surface/70 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl">
        <ToolbarButton onClick={() => setShowEntityPicker(true)} icon={<FileText size={13} />}>
          {t.canvas.addEntity}
        </ToolbarButton>
        <ToolbarButton onClick={() => addSticky('teal')} icon={<StickyNote size={13} />}>
          {t.canvas.addNote}
        </ToolbarButton>
        <div className="w-px h-5 bg-white/10 mx-0.5" />
        <ToolbarButton onClick={() => setShowAgentModal(true)} icon={<Sparkles size={13} />} accent>
          {t.canvas.agentButton}
        </ToolbarButton>
        <div className="w-px h-5 bg-white/10 mx-0.5" />
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-cortx-text-secondary">
          {isSaving  ? <><Loader2 size={12} className="animate-spin text-cortx-accent" /> {t.canvas.saving}</> :
           justSaved ? <><Check size={12} className="text-cortx-success" /> {t.canvas.saved}</> :
           isDirty   ? <><span className="w-2 h-2 rounded-full bg-cortx-warning animate-pulse" /> {t.canvas.unsaved}</> :
                       <><Save size={12} /> {t.canvas.upToDate}</>}
        </div>
      </div>

      {/* Canvas title pill */}
      <div className="absolute top-4 left-4 z-10 px-4 py-2 bg-cortx-surface/70 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl">
        <div className="text-[10px] uppercase tracking-wider text-cortx-text-secondary/70 mb-0.5">{t.canvas.currentCanvas}</div>
        <div className="text-sm font-semibold text-cortx-text-primary">{active.name}</div>
      </div>

      {/* Empty hint */}
      {rfNodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="text-center pointer-events-auto">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.2), rgba(139,92,246,0.15))', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px -15px rgba(13,148,136,0.4)' }}>
              <Plus size={28} className="text-cortx-accent-light" />
            </div>
            <h3 className="text-base font-semibold text-cortx-text-primary mb-1">{t.canvas.emptyCanvasTitle}</h3>
            <p className="text-xs text-cortx-text-secondary max-w-xs">{t.canvas.emptyCanvasHint}</p>
          </div>
        </div>
      )}

      {showEntityPicker && (
        <EntityPicker
          onClose={() => setShowEntityPicker(false)}
          onSelect={(f) => { addEntity({ path: f.path, title: f.title, type: f.type, tags: f.tags ?? [] }) }}
          excludePaths={excludePaths}
        />
      )}
      {showAgentModal && (
        <AgentSuggestModal
          onClose={() => setShowAgentModal(false)}
          onApplied={(nodes, edges) => applyAgentSuggestion(nodes, edges)}
        />
      )}

      <FilesPreloader files={files} />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ToolbarButton({ onClick, icon, children, accent }: {
  onClick: () => void; icon: React.ReactNode; children: React.ReactNode; accent?: boolean
}): React.JSX.Element {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-150 cursor-pointer ${accent ? 'text-white shadow-[0_4px_14px_-4px_rgba(13,148,136,0.5)]' : 'text-cortx-text-primary hover:bg-white/5'}`}
      style={accent ? { background: 'linear-gradient(135deg, rgba(13,148,136,0.85), rgba(139,92,246,0.7))' } : undefined}
    >
      {icon}{children}
    </button>
  )
}

function FilesPreloader({ files }: { files: unknown[] }): null {
  const loadFiles = useFileStore((s) => s.loadFiles)
  useEffect(() => { if (files.length === 0) void loadFiles() }, [files.length, loadFiles])
  return null
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState(): React.JSX.Element {
  const createCanvas = useCanvasStore((s) => s.createCanvas)
  const canvases     = useCanvasStore((s) => s.canvases)
  const loadCanvas   = useCanvasStore((s) => s.loadCanvas)
  const t = useT()

  const handleQuickCreate = async (): Promise<void> => {
    const id = await createCanvas(t.canvas.defaultName)
    if (id) void loadCanvas(id)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(13,148,136,0.08) 0%, transparent 60%), radial-gradient(circle at 30% 70%, rgba(139,92,246,0.06) 0%, transparent 50%)' }} />
      <div className="relative text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5"
          style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.25), rgba(139,92,246,0.2))', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 60px -15px rgba(13,148,136,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <Sparkles size={34} className="text-cortx-accent-light" />
        </div>
        <h2 className="text-xl font-bold text-cortx-text-primary mb-2">{t.canvas.emptyTitle}</h2>
        <p className="text-sm text-cortx-text-secondary mb-6 leading-relaxed">{t.canvas.emptyDescription}</p>
        {canvases.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-cortx-text-secondary/60 mb-2">{t.canvas.yourCanvases}</div>
            {canvases.slice(0, 4).map((c) => (
              <button key={c.id} onClick={() => void loadCanvas(c.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cortx-accent/40 rounded-xl cursor-pointer transition-all group">
                <span className="text-sm text-cortx-text-primary group-hover:text-cortx-accent-light transition-colors">{c.name}</span>
                <span className="text-[10px] text-cortx-text-secondary">{c.nodeCount} {t.canvas.tilesShort}</span>
              </button>
            ))}
            <button onClick={() => void handleQuickCreate()}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-cortx-accent-light hover:bg-cortx-accent/10 border border-dashed border-cortx-accent/40 rounded-xl cursor-pointer transition-colors mt-3">
              <Plus size={14} /> {t.canvas.newCanvas}
            </button>
          </div>
        ) : (
          <button onClick={() => void handleQuickCreate()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white cursor-pointer transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.9), rgba(20,184,166,1))', boxShadow: '0 12px 30px -8px rgba(13,148,136,0.6)' }}>
            <Plus size={14} /> {t.canvas.createFirst}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── CanvasView ───────────────────────────────────────────────────────────────

export function CanvasView(): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const loadFiles = useFileStore((s) => s.loadFiles)
  const files     = useFileStore((s) => s.files)
  useEffect(() => { if (files.length === 0) void loadFiles() }, [files.length, loadFiles])

  return (
    <div className="h-full w-full flex relative bg-cortx-bg overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 20% 30%, rgba(13,148,136,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(139,92,246,0.05) 0%, transparent 50%)' }} />
      <CanvasSidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((c) => !c)} />
      <div className="flex-1 min-w-0 relative">
        <ReactFlowProvider>
          <CanvasInner />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
