import { create } from 'zustand'
import type { GraphData, GraphNode, GraphEdge } from '../../shared/types'

interface GraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  filterTypes: Set<string>
  isLoading: boolean

  loadGraph: () => Promise<void>
  setSelectedNode: (id: string | null) => void
  toggleFilterType: (type: string) => void
  clearGraph: () => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  filterTypes: new Set(),
  isLoading: false,

  loadGraph: async () => {
    if (get().nodes.length === 0) set({ isLoading: true })
    try {
      const data: GraphData = await window.cortx.db.getGraphData()
      console.log('[GraphStore] Loaded graph data:', data.nodes.length, 'nodes,', data.edges.length, 'edges')
      // Only update if data actually changed (avoid unnecessary re-renders)
      const current = get()
      if (
        data.nodes.length !== current.nodes.length ||
        data.edges.length !== current.edges.length ||
        JSON.stringify(data.nodes.map((n) => n.id)) !== JSON.stringify(current.nodes.map((n) => n.id))
      ) {
        set({ nodes: data.nodes, edges: data.edges, isLoading: false })
      }
    } catch (err) {
      console.error('[GraphStore] Failed to load graph:', err)
      set({ isLoading: false })
    }
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  clearGraph: () => set({ nodes: [], edges: [], selectedNodeId: null }),

  toggleFilterType: (type) =>
    set((s) => {
      const next = new Set(s.filterTypes)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return { filterTypes: next }
    })
}))
