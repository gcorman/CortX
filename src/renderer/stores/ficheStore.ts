import { create } from 'zustand'
import type { Fiche } from '../../shared/types'

interface FicheState {
  fiches: Fiche[]
  isLoading: boolean
  loadFiches: () => Promise<void>
  deleteFiche: (path: string) => Promise<void>
}

export const useFicheStore = create<FicheState>((set, get) => ({
  fiches: [],
  isLoading: false,

  loadFiches: async () => {
    set({ isLoading: true })
    try {
      const fiches = await window.cortx.agent.listFiches()
      // Only set if changed to avoid pointless re-renders
      const current = get().fiches
      const same =
        current.length === fiches.length &&
        current.every((f, i) => f.path === fiches[i].path && f.subject === fiches[i].subject)
      if (!same) set({ fiches })
    } catch {
      // ignore
    }
    set({ isLoading: false })
  },

  deleteFiche: async (path: string) => {
    try {
      await window.cortx.agent.deleteFiche(path)
      set({ fiches: get().fiches.filter((f) => f.path !== path) })
    } catch {
      // ignore
    }
  }
}))
