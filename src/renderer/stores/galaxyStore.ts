import { create } from 'zustand'
import type { GalaxyData, GalaxyNode } from '../../shared/types'

export interface GalaxyFilters {
  personne: boolean
  entreprise: boolean
  domaine: boolean
  projet: boolean
  note: boolean
  journal: boolean
  comets: boolean
  constellations: boolean
  pulsations: boolean
}

interface GalaxyState {
  data: GalaxyData | null
  loading: boolean
  error: string | null
  filters: GalaxyFilters
  /** Time range slider (ISO strings). null = full range */
  timeRange: { min: string; max: string } | null
  hoveredNodeId: string | null
  focusedNodeId: string | null
  searchQuery: string

  loadData: () => Promise<void>
  setFilter: (key: keyof GalaxyFilters, value: boolean) => void
  setTimeRange: (range: { min: string; max: string } | null) => void
  setHoveredNodeId: (id: string | null) => void
  setFocusedNodeId: (id: string | null) => void
  setSearchQuery: (q: string) => void
  renameCluster: (topMemberLabel: string, newLabel: string) => Promise<void>
}

const defaultFilters: GalaxyFilters = {
  personne: true,
  entreprise: true,
  domaine: true,
  projet: true,
  note: true,
  journal: true,
  comets: true,
  constellations: true,
  pulsations: true
}

export const useGalaxyStore = create<GalaxyState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  filters: { ...defaultFilters },
  timeRange: null,
  hoveredNodeId: null,
  focusedNodeId: null,
  searchQuery: '',

  loadData: async () => {
    set({ loading: true, error: null })
    try {
      const data = await window.cortx.galaxy.getData()
      set({
        data,
        loading: false,
        timeRange: get().timeRange ?? data.timeRange
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  setTimeRange: (range) => set({ timeRange: range }),

  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  renameCluster: async (topMemberLabel: string, newLabel: string) => {
    await window.cortx.galaxy.renameCluster(topMemberLabel, newLabel)
    await get().loadData()
  }
}))

export function nodeMatchesFilters(
  node: GalaxyNode,
  filters: GalaxyFilters
): boolean {
  return filters[node.type] !== false
}
