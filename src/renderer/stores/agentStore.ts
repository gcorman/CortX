import { create } from 'zustand'
import type { AgentAction, AgentResponse } from '../../shared/types'

interface AgentState {
  actions: AgentAction[]
  suggestions: string[]
  conflicts: string[]

  addActions: (response: AgentResponse) => void
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
