import { create } from 'zustand'
import type { IdleInsight, IdleAttempt, IdleExplorationEvent } from '../../shared/types'
import { useFicheStore } from './ficheStore'
import { useGraphStore } from './graphStore'

const MAX_ATTEMPTS = 6

interface IdleState {
  isActive: boolean
  phase: 'stopped' | 'selecting' | 'examining' | 'thinking' | 'insight' | 'resting'
  activeNodeIds: string[]
  activeEdgeKeys: string[]
  currentThought: string
  draftCount: number
  insights: IdleInsight[]
  attempts: IdleAttempt[]   // recent cycle results, newest first

  toggle: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  loadInsights: () => Promise<void>
  dismissInsight: (id: string) => Promise<void>
  saveInsightAsFiche: (id: string) => Promise<string>
  _setExploration: (event: IdleExplorationEvent) => void
  _addInsight: (insight: IdleInsight) => void
  _applyBodyClass: (isActive: boolean, phase: string) => void
}

export const useIdleStore = create<IdleState>((set, get) => ({
  isActive: false,
  phase: 'stopped',
  activeNodeIds: [],
  activeEdgeKeys: [],
  currentThought: '',
  draftCount: 0,
  insights: [],
  attempts: [],

  toggle: async () => {
    if (get().isActive) {
      await get().stop()
    } else {
      await get().start()
    }
  },

  start: async () => {
    await window.cortx.idle.start()
    set({ isActive: true, phase: 'selecting', attempts: [] })
    get()._applyBodyClass(true, 'selecting')
    await get().loadInsights()
  },

  stop: async () => {
    await window.cortx.idle.stop()
    set({ isActive: false, phase: 'stopped', activeNodeIds: [], activeEdgeKeys: [], attempts: [] })
    get()._applyBodyClass(false, 'stopped')
  },

  loadInsights: async () => {
    const insights = await window.cortx.idle.getInsights()
    set({ insights })
  },

  dismissInsight: async (id: string) => {
    await window.cortx.idle.dismissInsight(id)
    set((state) => ({
      insights: state.insights.map((i) =>
        i.id === id ? { ...i, status: 'dismissed' as const } : i
      )
    }))
  },

  saveInsightAsFiche: async (id: string) => {
    const path = await window.cortx.idle.saveInsightAsFiche(id)
    set((state) => ({
      insights: state.insights.map((i) =>
        i.id === id ? { ...i, status: 'saved' as const } : i
      )
    }))
    void useFicheStore.getState().loadFiches()
    void useGraphStore.getState().loadGraph()
    return path
  },

  _setExploration: (event: IdleExplorationEvent) => {
    const updates: Partial<IdleState> = {
      phase: event.phase,
      activeNodeIds: event.activeNodeIds,
      activeEdgeKeys: event.activeEdgeKeys,
      currentThought: event.currentThought ?? '',
      draftCount: event.draftCount ?? 0
    }
    if (event.lastAttempt) {
      updates.attempts = [event.lastAttempt, ...get().attempts].slice(0, MAX_ATTEMPTS)
    }
    set(updates)
    get()._applyBodyClass(get().isActive, event.phase)
  },

  _addInsight: (insight: IdleInsight) => {
    set((state) => ({
      insights: [insight, ...state.insights].slice(0, 100)
    }))
  },

  _applyBodyClass: (isActive: boolean, phase: string) => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('idle-active', isActive)
    document.body.classList.toggle('idle-insight-active', isActive && phase === 'insight')
  }
}))

// Subscribe to IPC events from the main process (module-level, like libraryStore)
if (typeof window !== 'undefined' && window.cortx) {
  window.cortx.on('idle:exploration', (...args) => {
    const event = args[0] as IdleExplorationEvent
    useIdleStore.getState()._setExploration(event)
  })

  window.cortx.on('idle:insight', (...args) => {
    const insight = args[0] as IdleInsight
    useIdleStore.getState()._addInsight(insight)
  })

  // Pause/resume idle service when window loses/gains focus
  document.addEventListener('visibilitychange', () => {
    const { isActive } = useIdleStore.getState()
    if (!isActive) return
    if (document.hidden) {
      void window.cortx.idle.pause()
    } else {
      void window.cortx.idle.resume()
    }
  })
}
