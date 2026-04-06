import { create } from 'zustand'
import type { ChatMessage, AgentResponse } from '../../shared/types'
import { useAgentStore } from './agentStore'
import { useUIStore } from './uiStore'
import { useGraphStore } from './graphStore'
import { useFileStore } from './fileStore'

interface ChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  sendMessage: (content: string) => Promise<void>
  acceptActions: (messageId: string) => Promise<void>
  rejectActions: (messageId: string) => void
  undoActions: (commitHash: string, messageId: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,

  sendMessage: async (content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + 'u',
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    set((s) => ({ messages: [...s.messages, userMessage], isProcessing: true }))

    try {
      const response: AgentResponse = await window.cortx.agent.process(content)

      const agentMessage: ChatMessage = {
        id: Date.now().toString(36) + 'a',
        role: 'agent',
        content: response.summary || response.response || '',
        timestamp: new Date().toISOString(),
        agentResponse: response
      }

      set((s) => ({ messages: [...s.messages, agentMessage], isProcessing: false }))

      // Update agent store with proposals
      if (response.actions.length > 0) {
        useAgentStore.getState().addActions(response)
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Date.now().toString(36) + 'e',
        role: 'agent',
        content: `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        timestamp: new Date().toISOString()
      }
      set((s) => ({ messages: [...s.messages, errorMessage], isProcessing: false }))
      useUIStore.getState().addToast('Erreur lors du traitement', 'error')
    }
  },

  acceptActions: async (messageId: string) => {
    const msg = get().messages.find((m) => m.id === messageId)
    if (!msg?.agentResponse?.actions?.length) return

    const actions = msg.agentResponse.actions
    const summary = msg.agentResponse.summary || 'CortX: actions validees'

    // Mark as pending (executing)
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.agentResponse) return m
        return {
          ...m,
          agentResponse: {
            ...m.agentResponse,
            actions: m.agentResponse.actions.map((a) => ({ ...a, status: 'pending' as const }))
          }
        }
      })
    }))

    try {
      const commitHash = await window.cortx.agent.execute(actions, summary)

      // Mark as validated
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId || !m.agentResponse) return m
          return {
            ...m,
            agentResponse: {
              ...m.agentResponse,
              commitHash,
              actions: m.agentResponse.actions.map((a) => ({ ...a, status: 'validated' as const }))
            }
          }
        })
      }))

      useAgentStore.getState().validateActions(commitHash)
      useUIStore.getState().addToast(`${actions.length} action(s) appliquee(s)`, 'success')
      useGraphStore.getState().loadGraph()
      useFileStore.getState().loadFiles()
    } catch (error) {
      // Revert to proposed on failure
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId || !m.agentResponse) return m
          return {
            ...m,
            agentResponse: {
              ...m.agentResponse,
              actions: m.agentResponse.actions.map((a) => ({ ...a, status: 'proposed' as const }))
            }
          }
        })
      }))
      useUIStore.getState().addToast('Erreur lors de l\'execution', 'error')
    }
  },

  rejectActions: (messageId: string) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.agentResponse) return m
        return {
          ...m,
          agentResponse: {
            ...m.agentResponse,
            actions: m.agentResponse.actions.map((a) => ({ ...a, status: 'rejected' as const }))
          }
        }
      })
    }))
    useUIStore.getState().addToast('Actions refusees', 'info')
  },

  undoActions: async (commitHash: string, messageId: string) => {
    try {
      await window.cortx.agent.undo(commitHash)
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId || !m.agentResponse) return m
          return {
            ...m,
            agentResponse: {
              ...m.agentResponse,
              actions: m.agentResponse.actions.map((a) => ({ ...a, status: 'undone' as const }))
            }
          }
        })
      }))
      useUIStore.getState().addToast('Actions annulees', 'info')
      useGraphStore.getState().loadGraph()
      useFileStore.getState().loadFiles()
    } catch {
      useUIStore.getState().addToast('Erreur lors de l\'annulation', 'error')
    }
  }
}))
