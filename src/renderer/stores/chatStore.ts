import { create } from 'zustand'
import type { ChatMessage, AgentResponse } from '../../shared/types'
import { useAgentStore } from './agentStore'
import { useUIStore } from './uiStore'
import { useGraphStore } from './graphStore'
import { useFileStore } from './fileStore'
import { useFicheStore } from './ficheStore'

interface ChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  streamProgress: number
  streamActive: boolean
  /** Set of suggestion texts the user has dismissed — hides them from chat AND right panel */
  dismissedSuggestions: Set<string>
  sendMessage: (content: string) => Promise<void>
  acceptActions: (messageId: string) => Promise<void>
  rejectActions: (messageId: string) => void
  undoActions: (commitHash: string, messageId: string) => Promise<void>
  answerClarification: (messageId: string, optionIndex: number) => Promise<void>
  dismissSuggestion: (text: string) => void
  acceptSuggestion: (text: string) => Promise<void>
}

interface SlashRewrite {
  prompt: string
  ficheKind?: string // if set, the response is auto-archived as a fiche of this kind
  ficheSubject?: string
}

type StreamMode = 'default' | 'brief' | 'synthese' | 'digest'

let streamBuffer = ''
let streamResetTimer: ReturnType<typeof setTimeout> | undefined

function computeStreamProgress(buffer: string, mode: StreamMode): number {
  const len = buffer.length
  const lengthScore = len / (len + 500)

  if (mode !== 'brief') {
    return Math.min(0.95, lengthScore)
  }

  const sections: Array<string[]> = [
    ['identite', 'identité'],
    ['historique'],
    ['contexte'],
    ['points a creuser', 'points à creuser', 'points a explorer', 'points à explorer'],
    ['sources']
  ]

  const found = sections.reduce((count, variants) => {
    return count + (hasHeading(buffer, variants) ? 1 : 0)
  }, 0)

  const sectionScore = found / sections.length
  const progress = 0.1 + 0.7 * sectionScore + 0.2 * lengthScore
  return Math.min(0.95, progress)
}

function hasHeading(buffer: string, variants: string[]): boolean {
  return variants.some((variant) => {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:^|\\n|\\\\n|\\r\\n|\\\\r\\\\n)\\s*##\\s*${escaped}\\b`, 'i')
    return re.test(buffer)
  })
}

function startStreamSession(
  requestId: string,
  streamMode: StreamMode,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState
): () => void {
  streamBuffer = ''
  if (streamResetTimer) {
    clearTimeout(streamResetTimer)
    streamResetTimer = undefined
  }
  set({ streamProgress: 0, streamActive: true })

  const handleStream = (payload: unknown) => {
    const data = payload as { requestId?: string; delta?: string; done?: boolean; error?: string }
    if (!data || data.requestId !== requestId) return
    if (data.delta) {
      streamBuffer += data.delta
      const progress = computeStreamProgress(streamBuffer, streamMode)
      set((s) => ({
        streamProgress: Math.max(s.streamProgress, progress),
        streamActive: true
      }))
    }
    if (data.done) {
      set({ streamProgress: 1, streamActive: false })
      streamResetTimer = setTimeout(() => {
        set({ streamProgress: 0 })
      }, 450)
    }
    if (data.error) {
      set({ streamActive: false })
    }
  }

  window.cortx.on('agent:stream', handleStream)

  return () => {
    window.cortx.off('agent:stream', handleStream)
    const hadProgress = get().streamProgress > 0
    if (hadProgress) {
      set({ streamActive: false, streamProgress: 1 })
      if (!streamResetTimer) {
        streamResetTimer = setTimeout(() => {
          set({ streamProgress: 0 })
        }, 450)
      }
    } else {
      set({ streamActive: false })
    }
  }
}

function rewriteSlashCommand(input: string): SlashRewrite {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return { prompt: input }

  const match = trimmed.match(/^\/(\w+)\s*(.*)$/s)
  if (!match) return { prompt: input }
  const cmd = match[1].toLowerCase()
  const rest = match[2].trim()

  switch (cmd) {
    case 'ask':
      return {
        prompt: `[INSTRUCTION: Type d'input = QUESTION. Reponds UNIQUEMENT en JSON avec input_type="question", actions=[], et le champ "response" contenant la reponse complete et detaillee basee sur les fichiers du contexte ci-dessus. NE DIS JAMAIS "je vais chercher" ou "je consulte" — donne directement la reponse maintenant. Cite les sources via le champ "sources".]\n\nQuestion: ${rest}`
      }
    case 'brief':
      return {
        prompt: `[INSTRUCTION: Prepare un briefing structure et detaille sur le sujet ci-dessous, base sur les fichiers du contexte. input_type="question", actions=[], reponse complete et longue dans "response" en Markdown avec sections claires (## Identite, ## Historique, ## Contexte, ## Points a creuser, ## Sources). Utilise des wikilinks [[Nom]] vers les entites mentionnees. Donne directement le briefing, ne dis pas que tu vas le preparer.]\n\nSujet du briefing: ${rest}`,
        ficheKind: 'brief',
        ficheSubject: rest || 'Sans sujet'
      }
    case 'synthese':
    case 'synthèse':
      return {
        prompt: `[INSTRUCTION: Redige une synthese approfondie sur le sujet ci-dessous, basee sur les fichiers du contexte. input_type="question", actions=[], reponse complete en Markdown structure dans "response". Utilise des wikilinks [[Nom]].]\n\nSujet: ${rest}`,
        ficheKind: 'synthese',
        ficheSubject: rest || 'Sans sujet'
      }
    case 'status':
      return {
        prompt: `[INSTRUCTION: input_type="question". Donne dans "response" un resume de l'etat actuel de la base de connaissances : nombre de fichiers, entites principales, derniers ajouts, tags les plus utilises.]`
      }
    case 'digest':
      return {
        prompt: `[INSTRUCTION: input_type="question". Genere dans "response" un digest des activites recentes de la base : ajouts, modifications, connexions notables.]`,
        ficheKind: 'digest',
        ficheSubject: `Digest du ${new Date().toISOString().split('T')[0]}`
      }
    default:
      return { prompt: input }
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  streamProgress: 0,
  streamActive: false,
  dismissedSuggestions: new Set<string>(),

  sendMessage: async (content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + 'u',
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    set((s) => ({ messages: [...s.messages, userMessage], isProcessing: true }))

    // Resolve @[Title] mentions → inject file content as explicit context block
    const mentionMatches = [...content.matchAll(/@\[([^\]]+)\]/g)]
    let mentionContext = ''
    if (mentionMatches.length > 0) {
      const files = useFileStore.getState().files
      for (const m of mentionMatches) {
        const title = m[1]
        const file = files.find(
          (f) => f.title === title ||
            f.path.split('/').pop()?.replace('.md', '') === title
        )
        if (file) {
          try {
            const fc = await window.cortx.files.read(file.path)
            if (fc) {
              mentionContext += `\n--- @${title} (${file.path}) ---\n${fc.raw}\n---\n`
            }
          } catch {
            // ignore unreadable files
          }
        }
      }
    }

    // Strip @[...] markers from the visible text before passing to the LLM
    // (they are already injected as explicit context above)
    const strippedContent = content.replace(/@\[([^\]]+)\]/g, '@$1')

    // Intercept slash commands BEFORE injecting mention context.
    // Otherwise the prepended context hides the leading "/" and breaks /brief, /synthese, etc.
    const rewrite = rewriteSlashCommand(strippedContent)

    const finalPrompt = mentionContext
      ? `[FICHIERS CITES PAR L'UTILISATEUR — traite-les comme contexte prioritaire]\n${mentionContext}\n${rewrite.prompt}`
      : rewrite.prompt

    const requestId = Date.now().toString(36) + 'r'
    const streamMode: StreamMode =
      rewrite.ficheKind === 'brief'
        ? 'brief'
        : rewrite.ficheKind === 'synthese'
          ? 'synthese'
          : rewrite.ficheKind === 'digest'
            ? 'digest'
            : 'default'

    const stopStream = startStreamSession(requestId, streamMode, set, get)

    try {
      const response: AgentResponse = await window.cortx.agent.processStream(finalPrompt, requestId)

      // For long-form commands (brief, synthese, digest), the full response is
      // archived as a fiche — show only a short confirmation in the chat to
      // avoid rendering a huge raw-markdown block inline.
      const chatContent = rewrite.ficheKind
        ? (response.summary || `Fiche « ${rewrite.ficheSubject} » générée — consulte le panneau Fiches.`)
        : (response.summary || response.response || '')

      const agentMessage: ChatMessage = {
        id: Date.now().toString(36) + 'a',
        role: 'agent',
        content: chatContent,
        timestamp: new Date().toISOString(),
        agentResponse: { ...response, response: rewrite.ficheKind ? undefined : response.response }
      }

      set((s) => ({ messages: [...s.messages, agentMessage], isProcessing: false }))

      // Update agent store with proposals
      if (response.actions.length > 0) {
        useAgentStore.getState().addActions(response)
      }

      // If this was a long-form command (/brief, /synthese, /digest), archive
      // the agent's full response as a fiche in the side panel.
      if (rewrite.ficheKind && rewrite.ficheSubject) {
        const body = response.response || response.summary || ''
        if (body.trim().length > 0) {
          try {
            await window.cortx.agent.saveBrief(rewrite.ficheSubject, body, rewrite.ficheKind)
            useFicheStore.getState().loadFiches()
            useUIStore.getState().addToast('Fiche archivée', 'success')
          } catch (err) {
            console.error('[chatStore] saveBrief failed', err)
          }
        }
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
    } finally {
      stopStream()
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

  answerClarification: async (messageId: string, optionIndex: number) => {
    const state = get()
    const msg = state.messages.find((m) => m.id === messageId)
    const clar = msg?.agentResponse?.clarification
    if (!clar || clar.answeredIndex !== undefined) return
    const choice = clar.options[optionIndex]
    if (!choice) return

    // Mark the clarification as answered so the buttons disable immediately
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.agentResponse?.clarification) return m
        return {
          ...m,
          agentResponse: {
            ...m.agentResponse,
            clarification: { ...m.agentResponse.clarification, answeredIndex: optionIndex }
          }
        }
      })
    }))

    // Find the original user message that triggered the clarification — it's
    // the most recent user message before this one. We resend it together with
    // the chosen answer so the agent has the context it needs.
    const idx = state.messages.findIndex((m) => m.id === messageId)
    let originalInput = ''
    for (let i = idx - 1; i >= 0; i--) {
      if (state.messages[i].role === 'user') {
        originalInput = state.messages[i].content
        break
      }
    }

    // Display a clean user message (just the chosen option) but send the
    // contextualized version to the agent so it can finish the original task.
    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + 'u',
      role: 'user',
      content: choice,
      timestamp: new Date().toISOString()
    }
    set((s) => ({ messages: [...s.messages, userMessage], isProcessing: true }))

    const followup = `[REPONSE A TA QUESTION « ${clar.question} »] ${choice}\n\n[Demande initiale: ${originalInput}]`

    const requestId = Date.now().toString(36) + 'r'
    const stopStream = startStreamSession(requestId, 'default', set, get)

    try {
      const response: AgentResponse = await window.cortx.agent.processStream(followup, requestId)
      const agentMessage: ChatMessage = {
        id: Date.now().toString(36) + 'a',
        role: 'agent',
        content: response.summary || response.response || '',
        timestamp: new Date().toISOString(),
        agentResponse: response
      }
      set((s) => ({ messages: [...s.messages, agentMessage], isProcessing: false }))
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
    } finally {
      stopStream()
    }
  },

  dismissSuggestion: (text: string) => {
    set((s) => {
      const next = new Set(s.dismissedSuggestions)
      next.add(text)
      return { dismissedSuggestions: next }
    })
  },

  acceptSuggestion: async (text: string) => {
    // Mark dismissed everywhere immediately
    set((s) => {
      const next = new Set(s.dismissedSuggestions)
      next.add(text)
      return { dismissedSuggestions: next }
    })

    // Clean user-facing message; the actual order sent to the agent is more explicit
    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + 'u',
      role: 'user',
      content: `Applique cette suggestion : ${text}`,
      timestamp: new Date().toISOString()
    }
    set((s) => ({ messages: [...s.messages, userMessage], isProcessing: true }))

    const order = [
      "[ORDRE EXPLICITE DE L'UTILISATEUR]",
      'Execute IMMEDIATEMENT cette suggestion en creant ou modifiant les fichiers necessaires.',
      'Tu DOIS retourner des actions concretes (create / modify), pas une nouvelle question, pas une nouvelle suggestion.',
      'Si plusieurs interpretations sont possibles, choisis la plus pertinente et explique brievement ton choix dans "summary".',
      '',
      `Suggestion a appliquer : ${text}`
    ].join('\n')

    const requestId = Date.now().toString(36) + 'r'
    const stopStream = startStreamSession(requestId, 'default', set, get)

    try {
      const response: AgentResponse = await window.cortx.agent.processStream(order, requestId)
      const agentMessage: ChatMessage = {
        id: Date.now().toString(36) + 'a',
        role: 'agent',
        content: response.summary || response.response || '',
        timestamp: new Date().toISOString(),
        agentResponse: response
      }
      set((s) => ({ messages: [...s.messages, agentMessage], isProcessing: false }))
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
    } finally {
      stopStream()
    }
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
