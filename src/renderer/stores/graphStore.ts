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
      const current = get()

      // Compare nodes AND edges — a manual edit can add/remove wikilinks
      // without changing node count, so we must compare edges too.
      const nodesKey = data.nodes.map((n) => n.id).join(',')
      const prevNodesKey = current.nodes.map((n) => n.id).join(',')
      const edgesKey = data.edges.map((e) => `${e.source}->${e.target}`).sort().join(',')
      const prevEdgesKey = current.edges.map((e) => `${e.source}->${e.target}`).sort().join(',')

      if (nodesKey !== prevNodesKey || edgesKey !== prevEdgesKey) {
        set({ nodes: data.nodes, edges: data.edges, isLoading: false })
      } else {
        set({ isLoading: false })
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

// Listen for db:changed events pushed by the main process file-watcher.
// This fires whenever a .md file is saved outside of the agent (manual edit).
// fileStore is imported lazily to avoid circular dependencies at module init time.
let _fileStoreRef: (() => void) | null = null

export function registerDbChangedListener(onChanged: () => void): void {
  _fileStoreRef = onChanged
}

if (typeof window !== 'undefined' && window.cortx) {
  window.cortx.on('db:changed', () => {
    useGraphStore.getState().loadGraph()
    _fileStoreRef?.()
  })
}
