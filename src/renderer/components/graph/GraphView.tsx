import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import { useGraphStore } from '../../stores/graphStore'
import { useUIStore } from '../../stores/uiStore'
import { Network, LayoutGrid } from 'lucide-react'

try { cytoscape.use(coseBilkent) } catch { /* already registered */ }

// Resolved from CSS variables at runtime so they follow the active theme
function getCssColor(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  // raw is "R G B" → convert to rgb()
  return raw ? `rgb(${raw})` : '#94A3B8'
}

const NODE_COLORS: Record<string, string> = {
  personne:   '#0D9488',
  entreprise: '#3B82F6',
  domaine:    '#8B5CF6',
  projet:     '#F97316',
  note:       '#94A3B8',
  journal:    '#64748B',
  fiche:      '#EC4899'
}

function buildCyStyle(): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'background-color': (ele: cytoscape.NodeSingular) =>
          NODE_COLORS[ele.data('type') as string] || '#94A3B8',
        color: '#F8FAFC',
        'font-size': '10px',
        'font-family': 'Inter, sans-serif',
        'text-valign': 'bottom',
        'text-margin-y': 6,
        width: 28,
        height: 28,
        'border-width': 2,
        'border-color': getCssColor('--cortx-surface'),
        'text-outline-width': 2,
        'text-outline-color': getCssColor('--cortx-bg'),
        'transition-property': 'opacity, border-width, border-color, width, height',
        'transition-duration': 200
      } as unknown as cytoscape.Css.Node
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': getCssColor('--cortx-border'),
        'target-arrow-color': getCssColor('--cortx-border'),
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '8px',
        color: getCssColor('--cortx-text-secondary'),
        'text-rotation': 'autorotate',
        'text-outline-width': 1,
        'text-outline-color': getCssColor('--cortx-bg'),
        'transition-property': 'opacity, line-color',
        'transition-duration': 200
      } as unknown as cytoscape.Css.Edge
    },
    // --- Selection highlight states ---
    {
      selector: 'node.dimmed',
      style: { opacity: 0.1 } as cytoscape.Css.Node
    },
    {
      selector: 'edge.dimmed',
      style: { opacity: 0.04 } as cytoscape.Css.Edge
    },
    {
      selector: 'node.highlighted',
      style: {
        opacity: 1,
        'border-color': '#14B8A6',
        'border-width': 3,
        width: 32,
        height: 32
      } as unknown as cytoscape.Css.Node
    },
    {
      selector: 'node.selected-node',
      style: {
        opacity: 1,
        'border-color': '#F97316',
        'border-width': 4,
        width: 36,
        height: 36
      } as unknown as cytoscape.Css.Node
    },
    {
      selector: 'edge.highlighted',
      style: {
        opacity: 1,
        'line-color': '#0D9488',
        'target-arrow-color': '#0D9488',
        width: 2.5
      } as unknown as cytoscape.Css.Edge
    }
  ]
}

export function GraphView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const layoutRanOnce = useRef(false)
  const selectedNodeRef = useRef<string | null>(null)

  const { nodes, edges, isLoading, loadGraph, filterTypes, toggleFilterType } = useGraphStore()
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  // Keep openFilePreview in a ref so the cy event handler is never stale
  const openFilePreviewRef = useRef(openFilePreview)
  useEffect(() => { openFilePreviewRef.current = openFilePreview }, [openFilePreview])

  // Poll
  useEffect(() => {
    loadGraph()
    const id = setInterval(loadGraph, 5000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Create cy instance once — event handlers live here
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildCyStyle(),
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3
    })

    function clearSelection(): void {
      cy.elements().removeClass('dimmed highlighted selected-node')
      selectedNodeRef.current = null
    }

    // Tap background → clear selection
    cy.on('tap', (e) => {
      if ((e.target as cytoscape.Core) === cy) clearSelection()
    })

    // Single tap on node → highlight neighbors, dim rest
    cy.on('tap', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular
      const nodeId = node.id() as string

      if (selectedNodeRef.current === nodeId) {
        // Second tap on same node → clear
        clearSelection()
        return
      }

      selectedNodeRef.current = nodeId

      // Dim everything first
      cy.elements().addClass('dimmed').removeClass('highlighted selected-node')

      // Highlight selected node
      node.removeClass('dimmed').addClass('selected-node')

      // Highlight direct neighbors + connecting edges
      const neighbors = node.neighborhood()
      neighbors.nodes().removeClass('dimmed').addClass('highlighted')
      neighbors.edges().removeClass('dimmed').addClass('highlighted')
      node.connectedEdges().removeClass('dimmed').addClass('highlighted')
    })

    // Double tap → open file preview
    cy.on('dbltap', 'node', (evt) => {
      const filePath = (evt.target as cytoscape.NodeSingular).data('filePath') as string
      if (filePath) openFilePreviewRef.current(filePath)
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update elements + re-run animated layout when data or filters change
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const filteredNodes = filterTypes.size > 0
      ? nodes.filter((n) => filterTypes.has(n.type))
      : nodes
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
    const filteredEdges = edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    )

    // Clear selection state on data change
    selectedNodeRef.current = null

    // Replace elements
    cy.elements().remove()

    if (filteredNodes.length === 0) return

    const elements: cytoscape.ElementDefinition[] = [
      ...filteredNodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          filePath: node.filePath
        }
      })),
      ...filteredEdges.map((edge, i) => ({
        data: {
          id: `e${i}`,
          source: edge.source,
          target: edge.target,
          label: (edge.label || 'lien').replace(/_/g, ' ')
        }
      }))
    ]

    cy.add(elements)

    // First run: randomize positions, no animation (elements have no coords yet)
    // Subsequent runs: keep current positions as start, animate the relayout
    const isFirst = !layoutRanOnce.current
    const layout = cy.layout({
      name: 'cose-bilkent',
      animate: !isFirst,
      animationDuration: 500,
      animationEasing: 'ease-out' as cytoscape.Css.TransitionTimingFunction,
      randomize: isFirst,
      nodeDimensionsIncludeLabels: true,
      idealEdgeLength: 130,
      nodeRepulsion: 8000,
      edgeElasticity: 0.45,
      gravity: 0.4,
      numIter: 2500,
      tile: true
    } as unknown as cytoscape.LayoutOptions)

    layout.run()
    layoutRanOnce.current = true

    // Fit to view after first layout (give layout time to finish)
    if (isFirst) {
      setTimeout(() => cy.fit(undefined, 40), 50)
    }
  }, [nodes, edges, filterTypes])

  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-cortx-text-secondary">
        <span className="text-sm">Chargement du graphe...</span>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-14 h-14 rounded-full bg-cortx-surface flex items-center justify-center mb-4">
          <Network size={28} className="text-cortx-text-secondary/40" />
        </div>
        <h3 className="text-sm font-medium text-cortx-text-secondary mb-1">Graphe vide</h3>
        <p className="text-xs text-cortx-text-secondary/60 max-w-[280px]">
          Commence par capturer des informations via la conversation. Les entités et leurs connexions apparaîtront ici.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Filter + legend bar */}
      <GraphFilterBar filterTypes={filterTypes} toggleFilterType={toggleFilterType} cyRef={cyRef} />

      {/* Hint when a node is selected */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
        <p className="text-2xs text-cortx-text-secondary/50 bg-cortx-surface/80 backdrop-blur-sm px-2 py-1 rounded-full border border-cortx-border/40">
          Clic = sélectionner · Double-clic = ouvrir
        </p>
      </div>
    </div>
  )
}

// --- Filter + legend bar ---

const LEGEND_ITEMS = [
  { type: 'personne',   label: 'Personne',    color: NODE_COLORS.personne },
  { type: 'entreprise', label: 'Entreprise',  color: NODE_COLORS.entreprise },
  { type: 'domaine',    label: 'Domaine',     color: NODE_COLORS.domaine },
  { type: 'projet',     label: 'Projet',      color: NODE_COLORS.projet },
  { type: 'note',       label: 'Note',        color: NODE_COLORS.note },
  { type: 'journal',    label: 'Journal',     color: NODE_COLORS.journal },
  { type: 'fiche',      label: 'Fiche',       color: NODE_COLORS.fiche }
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

  function resetFilters(): void {
    // Clear all active filters (show everything)
    filterTypes.forEach((t) => toggleFilterType(t))
  }

  function fitGraph(): void {
    cyRef.current?.fit(undefined, 40)
  }

  return (
    <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-cortx-surface/95 backdrop-blur-sm rounded-card px-3 py-2 border border-cortx-border shadow-lg flex-wrap">
      {/* Filter label */}
      <span className="text-2xs text-cortx-text-secondary/50 uppercase tracking-wider mr-1">
        Filtrer
      </span>

      {LEGEND_ITEMS.map((item) => {
        const isActive = allVisible || filterTypes.has(item.type)
        return (
          <button
            key={item.type}
            onClick={() => toggleFilterType(item.type)}
            title={isActive ? `Masquer ${item.label}` : `Afficher ${item.label}`}
            className={`flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-full border cursor-pointer transition-all ${
              isActive
                ? 'border-transparent text-cortx-text-primary opacity-100'
                : 'border-cortx-border text-cortx-text-secondary/40 opacity-40'
            }`}
            style={{ backgroundColor: isActive ? item.color + '22' : undefined }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: isActive ? item.color : undefined, opacity: isActive ? 1 : 0.3 }}
            />
            {item.label}
          </button>
        )
      })}

      <div className="ml-auto flex items-center gap-1">
        {/* Reset filters button — only shown when filters are active */}
        {filterTypes.size > 0 && (
          <button
            onClick={resetFilters}
            className="text-2xs px-2 py-0.5 rounded border border-cortx-accent/40 text-cortx-accent hover:bg-cortx-accent/10 cursor-pointer transition-colors"
          >
            Tout afficher
          </button>
        )}
        {/* Fit graph */}
        <button
          onClick={fitGraph}
          title="Recentrer le graphe"
          className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary/60 hover:text-cortx-text-primary cursor-pointer transition-colors"
        >
          <LayoutGrid size={12} />
        </button>
      </div>
    </div>
  )
}
