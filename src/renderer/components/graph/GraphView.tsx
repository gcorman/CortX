import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import { useGraphStore } from '../../stores/graphStore'
import { useUIStore } from '../../stores/uiStore'
import { Network } from 'lucide-react'

// Register layout extension once
try {
  cytoscape.use(coseBilkent)
} catch {
  // Already registered
}

const NODE_COLORS: Record<string, string> = {
  personne: '#0D9488',
  entreprise: '#3B82F6',
  domaine: '#8B5CF6',
  projet: '#F97316',
  note: '#94A3B8',
  journal: '#64748B'
}

export function GraphView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const { nodes, edges, isLoading, loadGraph, filterTypes } = useGraphStore()
  const openFilePreview = useUIStore((s) => s.openFilePreview)

  // Load graph on mount + poll
  useEffect(() => {
    loadGraph()
    const interval = setInterval(loadGraph, 5000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build/rebuild cytoscape when data changes
  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy()
      cyRef.current = null
    }

    // Filter nodes
    const filteredNodes = filterTypes.size > 0
      ? nodes.filter((n) => filterTypes.has(n.type))
      : nodes

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
    const filteredEdges = edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    )

    console.log('[GraphView] Rendering', filteredNodes.length, 'nodes,', filteredEdges.length, 'edges')

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
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
            label: edge.label
          }
        }))
      ],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': (ele: cytoscape.NodeSingular) =>
              NODE_COLORS[ele.data('type')] || '#94A3B8',
            color: '#F8FAFC',
            'font-size': '10px',
            'font-family': 'Inter, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 28,
            height: 28,
            'border-width': 2,
            'border-color': '#1E293B',
            'text-outline-width': 2,
            'text-outline-color': '#0F172A'
          } as unknown as cytoscape.Css.Node
        },
        {
          selector: 'node:active, node:selected',
          style: {
            'border-color': '#14B8A6',
            'border-width': 3
          } as cytoscape.Css.Node
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': '8px',
            color: '#64748B',
            'text-rotation': 'autorotate',
            'text-outline-width': 1,
            'text-outline-color': '#0F172A'
          } as unknown as cytoscape.Css.Edge
        }
      ],
      layout: {
        name: 'cose-bilkent',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 120,
        nodeRepulsion: 6000,
        gravity: 0.3
      } as unknown as cytoscape.LayoutOptions,
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3
    })

    // Click handler
    cy.on('tap', 'node', (evt) => {
      const filePath = evt.target.data('filePath')
      if (filePath) {
        openFilePreview(filePath)
      }
    })

    cyRef.current = cy

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy()
        cyRef.current = null
      }
    }
  }, [nodes, edges, filterTypes, openFilePreview])

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
          Commence par capturer des informations via la conversation. Les entites et leurs connexions apparaitront ici.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <GraphLegend />
    </div>
  )
}

function GraphLegend(): React.JSX.Element {
  const items = [
    { type: 'personne', label: 'Personne', color: NODE_COLORS.personne },
    { type: 'entreprise', label: 'Entreprise', color: NODE_COLORS.entreprise },
    { type: 'domaine', label: 'Domaine', color: NODE_COLORS.domaine },
    { type: 'projet', label: 'Projet', color: NODE_COLORS.projet },
    { type: 'note', label: 'Note', color: NODE_COLORS.note },
    { type: 'journal', label: 'Journal', color: NODE_COLORS.journal }
  ]

  const { filterTypes, toggleFilterType } = useGraphStore()

  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-cortx-surface/90 backdrop-blur-sm rounded-card px-3 py-2 border border-cortx-border">
      {items.map((item) => {
        const isActive = filterTypes.size === 0 || filterTypes.has(item.type)
        return (
          <button
            key={item.type}
            onClick={() => toggleFilterType(item.type)}
            className={`flex items-center gap-1.5 text-2xs cursor-pointer transition-opacity ${
              isActive ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-cortx-text-secondary">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
