import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import fcose from 'cytoscape-fcose'
import { useGraphStore } from '../../stores/graphStore'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { Network, LayoutGrid, Trash2, RefreshCw, FileText, ExternalLink } from 'lucide-react'

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
        'transition-property': 'opacity, width, height, border-width, border-color, border-opacity, background-opacity',
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
        opacity: 0.7,
        'transition-property': 'opacity, line-color, width',
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
        width: 2
      } as unknown as cytoscape.Css.Edge
    }
  ]
}

// Initial layout: fcose with high quality — better than cose-bilkent for first render
function makeInitialLayout(): cytoscape.LayoutOptions {
  return {
    name: 'fcose',
    animate: false,
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

export function GraphView(): React.JSX.Element {
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

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId: string; filePath: string; label: string; isLibDoc: boolean
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isRewriting, setIsRewriting] = useState(false)
  const [rewriteUndo, setRewriteUndo] = useState<{ commitHash: string } | null>(null)

  const { nodes, edges, isLoading, loadGraph, filterTypes, toggleFilterType } = useGraphStore()
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const setActiveCenterView = useUIStore((s) => s.setActiveCenterView)
  const addToast = useUIStore((s) => s.addToast)
  const theme = useUIStore((s) => s.theme)
  const loadFiles = useFileStore((s) => s.loadFiles)
  const { selectDocument, deleteDocument } = useLibraryStore()
  const openFilePreviewRef = useRef(openFilePreview)
  useEffect(() => { openFilePreviewRef.current = openFilePreview }, [openFilePreview])

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { setContextMenu(null); setConfirmDelete(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [contextMenu])

  async function handleRewrite(): Promise<void> {
    if (!contextMenu) return
    setIsRewriting(true)
    try {
      const commitHash = await window.cortx.agent.rewriteFile(contextMenu.filePath)
      setContextMenu(null)
      setRewriteUndo({ commitHash })
      await loadGraph()
      setTimeout(() => setRewriteUndo(null), 8000)
    } catch (err) {
      console.error(err)
      addToast('Erreur lors de la rédaction', 'error')
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
        addToast('Document supprimé de la bibliothèque', 'info')
      } else {
        await window.cortx.agent.deleteFile(contextMenu.filePath)
        await loadFiles()
        addToast('Fichier supprimé', 'info')
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
    const id = setInterval(loadGraph, 5000)
    return () => clearInterval(id)
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
      cy.elements().removeClass('dimmed highlighted selected-node')
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

    cy.on('cxttap', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular
      const nodeId = node.id() as string
      const fp = node.data('filePath') as string
      const label = node.data('label') as string
      const isLibDoc = nodeId.startsWith('lib:')
      // Library doc nodes: always show menu even without a filePath
      if (!fp && !isLibDoc) return
      const pos = evt.renderedPosition
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
        }
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    cyRef.current = cy
    return () => {
      ro.disconnect()
      stopLive()
      cy.destroy()
      cyRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

    // Save existing node positions so incremental updates don't reset them
    const savedPositions = new Map<string, { x: number; y: number }>()
    cy.nodes().forEach((node) => {
      savedPositions.set(node.id() as string, { ...node.position() })
    })

    selectedNodeRef.current = null
    cy.elements().remove()
    if (filteredNodes.length === 0) return

    cy.add([
      ...filteredNodes.map((n) => ({
        data: { id: n.id, label: n.label, type: n.type, filePath: n.filePath }
      })),
      ...filteredEdges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          label: (e.label || 'lien').replace(/_/g, ' ')
        }
      }))
    ])

    // Restore saved positions; place brand-new nodes with random jitter near
    // the origin so force-directed physics can spread them naturally.
    const centerX = savedPositions.size > 0
      ? Array.from(savedPositions.values()).reduce((s, p) => s + p.x, 0) / savedPositions.size
      : 0
    const centerY = savedPositions.size > 0
      ? Array.from(savedPositions.values()).reduce((s, p) => s + p.y, 0) / savedPositions.size
      : 0
    cy.nodes().forEach((node) => {
      const saved = savedPositions.get(node.id() as string)
      if (saved) {
        node.position(saved)
      } else {
        node.position({
          x: centerX + (Math.random() - 0.5) * 120,
          y: centerY + (Math.random() - 0.5) * 120
        })
      }
    })

    const isFirst = !layoutRanOnce.current
    const layout = cy.layout(
      isFirst
        ? makeInitialLayout()
        : ({ ...makeSettleLayout(), animationDuration: 500 } as unknown as cytoscape.LayoutOptions)
    )
    layout.run()
    layoutRanOnce.current = true
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

  // Always render the container div so the Cytoscape setup effect can attach
  // to it on the very first mount — even before data loads.
  // Loading / empty states are overlaid on top rather than replacing the container.
  return (
    <div className="flex-1 relative w-full h-full">
      {/* Cytoscape canvas — always present so the setup effect can attach */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Loading overlay */}
      {isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-cortx-text-secondary">Chargement du graphe...</span>
        </div>
      )}

      {/* Empty state overlay */}
      {!isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-cortx-surface flex items-center justify-center mb-4">
            <Network size={28} className="text-cortx-text-secondary/40" />
          </div>
          <h3 className="text-sm font-medium text-cortx-text-secondary mb-1">Graphe vide</h3>
          <p className="text-xs text-cortx-text-secondary/60 max-w-[280px]">
            Commence par capturer des informations via la conversation.
          </p>
        </div>
      )}

      {nodes.length > 0 && (
        <GraphFilterBar filterTypes={filterTypes} toggleFilterType={toggleFilterType} cyRef={cyRef} />
      )}
      {nodes.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none select-none">
          <p className="text-2xs text-cortx-text-secondary/40 bg-cortx-surface/70 backdrop-blur-sm px-2.5 py-1 rounded-full border border-cortx-border/30">
            Clic = sélectionner · Double-clic = ouvrir · Clic droit = menu · Glisser = déplacer
          </p>
        </div>
      )}

      {/* Undo bar after rewrite */}
      {rewriteUndo && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-cortx-surface border border-cortx-border rounded-card px-3 py-2 shadow-lg">
          <span className="text-xs text-cortx-text-primary">Rédaction réorganisée</span>
          <button
            onClick={async () => {
              try {
                await window.cortx.agent.undo(rewriteUndo.commitHash)
                setRewriteUndo(null)
                await loadGraph()
                addToast('Annulé', 'info')
              } catch {
                addToast("Erreur lors de l'annulation", 'error')
              }
            }}
            className="text-xs text-cortx-accent hover:text-cortx-accent-light cursor-pointer transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => setRewriteUndo(null)}
            className="text-xs text-cortx-text-secondary/50 hover:text-cortx-text-primary cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="absolute inset-0 z-10"
            onClick={() => { setContextMenu(null); setConfirmDelete(false) }}
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
                  Ouvrir le fichier original
                </button>
                <button
                  onClick={handleOpenTranscription}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
                >
                  <FileText size={13} />
                  Voir la transcription Markdown
                </button>
                <div className="border-t border-cortx-border mt-1" />
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Supprimer de la bibliothèque
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-xs text-red-400">Supprimer définitivement ?</p>
                    <div className="flex gap-1.5">
                      <button onClick={handleDelete} className="flex-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded px-2 py-1 transition-colors cursor-pointer">
                        Supprimer
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs bg-cortx-elevated hover:bg-cortx-border text-cortx-text-secondary rounded px-2 py-1 transition-colors cursor-pointer">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Knowledge-base entity actions ── */
              <>
                <button
                  onClick={handleRewrite}
                  disabled={isRewriting}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isRewriting ? 'animate-spin' : ''} />
                  {isRewriting ? 'Réorganisation...' : 'Reprendre la rédaction'}
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Supprimer
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-xs text-red-400">Supprimer définitivement ?</p>
                    <div className="flex gap-1.5">
                      <button onClick={handleDelete} className="flex-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded px-2 py-1 transition-colors cursor-pointer">
                        Supprimer
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs bg-cortx-elevated hover:bg-cortx-border text-cortx-text-secondary rounded px-2 py-1 transition-colors cursor-pointer">
                        Annuler
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
