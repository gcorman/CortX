import { create } from 'zustand'
import type {
  CanvasConfig,
  CanvasSummary,
  CanvasNode,
  CanvasEdge,
  CanvasViewport,
  AgentCanvasSuggestion
} from '../../shared/types'

interface CanvasState {
  canvases: CanvasSummary[]
  active: CanvasConfig | null
  isLoading: boolean
  isSaving: boolean
  isDirty: boolean
  agentBusy: boolean

  loadList: () => Promise<void>
  loadCanvas: (id: string) => Promise<void>
  createCanvas: (name: string) => Promise<string | null>
  deleteCanvas: (id: string) => Promise<void>
  renameCanvas: (id: string, newName: string) => Promise<void>
  saveActive: () => Promise<void>

  setNodes: (nodes: CanvasNode[]) => void
  setEdges: (edges: CanvasEdge[]) => void
  setViewport: (viewport: CanvasViewport) => void
  addNode: (node: CanvasNode) => void
  addNodes: (nodes: CanvasNode[]) => void
  updateNode: (id: string, patch: Partial<CanvasNode>) => void
  removeNode: (id: string) => void
  addEdge: (edge: CanvasEdge) => void
  addEdges: (edges: CanvasEdge[]) => void
  removeEdge: (id: string) => void

  markDirty: () => void
  agentSuggest: (prompt: string) => Promise<AgentCanvasSuggestion | null>
  closeActive: () => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvases: [],
  active: null,
  isLoading: false,
  isSaving: false,
  isDirty: false,
  agentBusy: false,

  loadList: async () => {
    try {
      const list = await window.cortx.canvas.list()
      set({ canvases: list })
    } catch {
      set({ canvases: [] })
    }
  },

  loadCanvas: async (id) => {
    set({ isLoading: true })
    try {
      const cfg = await window.cortx.canvas.load(id)
      set({ active: cfg, isLoading: false, isDirty: false })
    } catch {
      set({ active: null, isLoading: false })
    }
  },

  createCanvas: async (name) => {
    try {
      const cfg = await window.cortx.canvas.create(name)
      await get().loadList()
      set({ active: cfg, isDirty: false })
      return cfg.id
    } catch {
      return null
    }
  },

  deleteCanvas: async (id) => {
    await window.cortx.canvas.delete(id)
    const { active } = get()
    if (active?.id === id) set({ active: null })
    await get().loadList()
  },

  renameCanvas: async (id, newName) => {
    await window.cortx.canvas.rename(id, newName)
    const { active } = get()
    if (active?.id === id) {
      set({ active: { ...active, name: newName } })
    }
    await get().loadList()
  },

  saveActive: async () => {
    const { active } = get()
    if (!active) return
    set({ isSaving: true })
    try {
      await window.cortx.canvas.save(active)
      set({ isSaving: false, isDirty: false })
      await get().loadList()
    } catch {
      set({ isSaving: false })
    }
  },

  setNodes: (nodes) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, nodes }, isDirty: true })
  },

  setEdges: (edges) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, edges }, isDirty: true })
  },

  setViewport: (viewport) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, viewport }, isDirty: true })
  },

  addNode: (node) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, nodes: [...active.nodes, node] }, isDirty: true })
  },

  addNodes: (nodes) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, nodes: [...active.nodes, ...nodes] }, isDirty: true })
  },

  updateNode: (id, patch) => {
    const { active } = get()
    if (!active) return
    const nodes = active.nodes.map((n) => (n.id === id ? { ...n, ...patch, data: { ...n.data, ...(patch.data || {}) } } : n))
    set({ active: { ...active, nodes }, isDirty: true })
  },

  removeNode: (id) => {
    const { active } = get()
    if (!active) return
    const nodes = active.nodes.filter((n) => n.id !== id)
    const edges = active.edges.filter((e) => e.source !== id && e.target !== id)
    set({ active: { ...active, nodes, edges }, isDirty: true })
  },

  addEdge: (edge) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, edges: [...active.edges, edge] }, isDirty: true })
  },

  addEdges: (edges) => {
    const { active } = get()
    if (!active) return
    set({ active: { ...active, edges: [...active.edges, ...edges] }, isDirty: true })
  },

  removeEdge: (id) => {
    const { active } = get()
    if (!active) return
    const edges = active.edges.filter((e) => e.id !== id)
    set({ active: { ...active, edges }, isDirty: true })
  },

  agentSuggest: async (prompt) => {
    const { active } = get()
    if (!active) return null
    set({ agentBusy: true })
    try {
      const result = await window.cortx.canvas.agentSuggest(active.id, prompt)
      set({ agentBusy: false })
      return result
    } catch {
      set({ agentBusy: false })
      return null
    }
  },

  markDirty: () => set({ isDirty: true }),

  closeActive: () => set({ active: null, isDirty: false })
}))
