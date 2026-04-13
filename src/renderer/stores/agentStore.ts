import { create } from 'zustand'
import type { AgentAction, AgentResponse } from '../../shared/types'

interface AgentState {
  actions: AgentAction[]
  suggestions: string[]
  conflicts: string[]

  addActions: (response: AgentResponse) => void
  /** Bulk-update specific action statuses by ID (used for per-action accept/reject sync from chatStore). */
  updateStatuses: (updates: Array<{ id: string; status: AgentAction['status'] }>, commitHash?: string) => void
  /** Legacy: mark all proposed/pending as validated. */
  validateActions: (commitHash: string) => void
  clearActions: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  actions: [],
  suggestions: [],
  conflicts: [],

  addActions: (response) =>
    set((s) => ({
      actions: [...response.actions, ...s.actions],
      suggestions: [...response.suggestions, ...s.suggestions],
      conflicts: [...response.conflicts, ...s.conflicts]
    })),

  updateStatuses: (updates) => {
    const map = new Map(updates.map((u) => [u.id, u.status]))
    set((s) => ({
      actions: s.actions.map((a) =>
        map.has(a.id) ? { ...a, status: map.get(a.id)! } : a
      )
    }))
  },

  validateActions: (_commitHash: string) =>
    set((s) => ({
      actions: s.actions.map((a) =>
        a.status === 'proposed' || a.status === 'pending'
          ? { ...a, status: 'validated' as const }
          : a
      )
    })),

  clearActions: () => set({ actions: [], suggestions: [], conflicts: [] })
}))
