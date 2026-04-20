import { create } from 'zustand'
import type {
  ChatMessage, AgentResponse, AgentAction,
  AgentPhase, StreamEvent, WebFetchEvent, PartialAction
} from '../../shared/types'

/** User-supplied overrides for a create action before execution. */
export interface ActionEdit {
  title?: string
  type?: string
}

const DIR_MAP: Record<string, string> = {
  personne: 'Reseau',
  entreprise: 'Entreprises',
  domaine: 'Domaines',
  projet: 'Projets',
  journal: 'Journal',
  note: 'Reseau',
  fiche: 'Fiches'
}

function applyEditToAction(action: AgentAction, edit: ActionEdit): AgentAction {
  let content = action.content
  let file = action.file

  if (edit.title) {
    // Update frontmatter title: field
    if (/^title:\s*.+$/m.test(content)) {
      content = content.replace(/^title:\s*.+$/m, `title: ${edit.title}`)
    }
    // Update H1 heading
    if (/^# .+$/m.test(content)) {
      content = content.replace(/^# .+$/m, `# ${edit.title}`)
    }
  }

  if (edit.type) {
    // Update frontmatter type: field
    if (/^type:\s*.+$/m.test(content)) {
      content = content.replace(/^type:\s*.+$/m, `type: ${edit.type}`)
    }
    // Reroute directory
    const newDir = DIR_MAP[edit.type]
    if (newDir) {
      file = file.replace(/^[^/]+\//, `${newDir}/`)
    }
  }

  return { ...action, content, file }
}
import { useAgentStore } from './agentStore'
import { useUIStore } from './uiStore'
import { useGraphStore } from './graphStore'
import { useFileStore } from './fileStore'
import { useFicheStore } from './ficheStore'
import { useIdleStore } from './idleStore'

interface ChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  streamProgress: number
  streamActive: boolean
  /** Live text accumulated from the LLM stream — reset on each new request. */
  streamText: string
  streamPhase: AgentPhase | null
  streamWebFetches: WebFetchEvent[]
  streamPartialActions: PartialAction[]
  /** Set of suggestion texts the user has dismissed — hides them from chat AND right panel */
  dismissedSuggestions: Set<string>
  sendMessage: (content: string) => Promise<void>
  /** Analyze a dropped/imported .md file and ask the agent how to integrate it. */
  importMarkdown: (filename: string, content: string) => Promise<void>
  acceptActions: (messageId: string, opts?: { actionIds?: string[]; edits?: Record<string, ActionEdit> }) => Promise<void>
  rejectActions: (messageId: string, actionIds?: string[]) => void
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
  set({
    streamProgress: 0,
    streamActive: true,
    streamText: '',
    streamPhase: 'retrieving',
    streamWebFetches: [],
    streamPartialActions: []
  })

  const handleStream = (payload: unknown) => {
    const data = payload as {
      requestId?: string
      delta?: string
      done?: boolean
      error?: string
      event?: StreamEvent
    }
    if (!data || data.requestId !== requestId) return

    if (data.event) {
      applyStreamEvent(data.event, streamMode, set)
      return
    }

    if (data.delta) {
      streamBuffer += data.delta
      const progress = computeStreamProgress(streamBuffer, streamMode)
      set((s) => ({
        streamProgress: Math.max(s.streamProgress, progress),
        streamActive: true
      }))
    }
    if (data.done) {
      set({ streamProgress: 1, streamActive: false, streamPhase: 'done' })
      streamResetTimer = setTimeout(() => {
        set({
          streamProgress: 0,
          streamText: '',
          streamPhase: null,
          streamWebFetches: [],
          streamPartialActions: []
        })
      }, 450)
    }
    if (data.error) {
      set({ streamActive: false, streamPhase: 'error' })
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
          set({
            streamProgress: 0,
            streamText: '',
            streamPhase: null,
            streamWebFetches: [],
            streamPartialActions: []
          })
        }, 450)
      }
    } else {
      set({
        streamActive: false,
        streamText: '',
        streamPhase: null,
        streamWebFetches: [],
        streamPartialActions: []
      })
    }
  }
}

function applyStreamEvent(
  ev: StreamEvent,
  streamMode: StreamMode,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
): void {
  switch (ev.kind) {
    case 'phase':
      set({ streamPhase: ev.phase })
      break
    case 'delta': {
      streamBuffer += ev.text
      const progress = computeStreamProgress(streamBuffer, streamMode)
      set((s) => ({
        streamText: s.streamText + ev.text,
        streamProgress: Math.max(s.streamProgress, progress),
        streamActive: true
      }))
      break
    }
    case 'web-fetch':
      set((s) => {
        const next = s.streamWebFetches.filter((f) => f.id !== ev.fetch.id)
        next.push(ev.fetch)
        return { streamWebFetches: next }
      })
      break
    case 'partial-action':
      set((s) => {
        const next = [...s.streamPartialActions]
        next[ev.action.index] = ev.action
        return { streamPartialActions: next }
      })
      break
    case 'done':
      set({ streamPhase: 'done' })
      break
    case 'error':
      set({ streamPhase: 'error', streamActive: false })
      break
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
  streamText: '',
  streamPhase: null,
  streamWebFetches: [],
  streamPartialActions: [],
  dismissedSuggestions: new Set<string>(),

  sendMessage: async (content: string) => {
    // Stop idle mode when user interacts — agent focuses on the conversation
    const idleState = useIdleStore.getState()
    if (idleState.isActive) {
      void idleState.stop()
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + 'u',
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    set((s) => ({ messages: [...s.messages, userMessage], isProcessing: true }))

    // Resolve @[Title] (KB files) and @[lib:id|Title] (library docs) mentions
    // → inject their content as explicit context blocks for the agent
    const mentionMatches = [...content.matchAll(/@\[([^\]]+)\]/g)]
    let mentionContext = ''
    if (mentionMatches.length > 0) {
      const files = useFileStore.getState().files
      for (const m of mentionMatches) {
        const raw = m[1]

        // Library document: @[lib:UUID|Title]
        const libMatch = raw.match(/^lib:([^|]+)\|(.+)$/)
        if (libMatch) {
          const [, docId, docTitle] = libMatch
          try {
            const preview = await window.cortx.library.getPreview(docId)
            if (preview) {
              mentionContext += `\n--- @${docTitle} [document bibliothèque — LECTURE SEULE, NE PAS MODIFIER] ---\n${preview.markdown}\n---\n`
            }
          } catch {
            // ignore
          }
          continue
        }

        // KB file: @[Title]
        const file = files.find(
          (f) => f.title === raw ||
            f.path.split('/').pop()?.replace('.md', '') === raw
        )
        if (file) {
          try {
            const fc = await window.cortx.files.read(file.path)
            if (fc) {
              mentionContext += `\n--- @${raw} (${file.path}) ---\n${fc.raw}\n---\n`

              // Follow [[wikilinks]] one hop deep so the agent has the linked content
              // without requiring the user to explicitly @mention each linked file.
              const wikiRefs = [...new Set(
                [...fc.raw.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1])
              )].slice(0, 6)

              if (wikiRefs.length > 0) {
                const linkedParts: string[] = []
                await Promise.all(wikiRefs.map(async (ref) => {
                  // 1. Try KB file
                  const linkedFile = files.find(
                    (f) => f.path !== file.path && (
                      f.title === ref ||
                      f.path.split('/').pop()?.replace('.md', '') === ref
                    )
                  )
                  if (linkedFile) {
                    try {
                      const linked = await window.cortx.files.read(linkedFile.path)
                      if (linked) {
                        linkedParts.push(`\n--- [[${ref}]] (${linkedFile.path}) [lié via @${raw}] ---\n${linked.raw}\n---`)
                      }
                    } catch { /* ignore */ }
                    return
                  }
                  // 2. Try library via getLinkedContext:
                  //    chunk 0 (headers) + scoped semantic search within the doc
                  try {
                    const srcLine = fc.raw.split('\n').find((l) => l.includes(`[[${ref}]]`)) ?? ''
                    const surrounding = srcLine.replace(`[[${ref}]]`, '').replace(/[^\w\s]/g, ' ').trim()
                    const libChunks = await window.cortx.library.getLinkedContext(ref, surrounding, 8)
                    if (libChunks.length > 0) {
                      const docTitle = libChunks[0].documentTitle ?? ref
                      const chunkText = libChunks
                        .map((c) => (c.heading ? `**${c.heading}**\n${c.text}` : c.text))
                        .join('\n\n')
                      linkedParts.push(`\n--- [[${ref}]] [${docTitle} — bibliothèque] ---\n${chunkText}\n---`)
                    }
                  } catch { /* ignore */ }
                }))
                mentionContext += linkedParts.join('\n')
              }
            }
          } catch {
            // ignore unreadable files
          }
        }
      }
    }

    // Strip @[lib:id|Title] and @[Title] markers from visible text
    const strippedContent = content
      .replace(/@\[lib:[^|]+\|([^\]]+)\]/g, '@$1')
      .replace(/@\[([^\]]+)\]/g, '@$1')

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

  /**
   * Import a .md file: show it in chat as a user message, then have the agent
   * analyze it and propose how to integrate it into the knowledge base.
   */
  importMarkdown: async (filename: string, content: string) => {
    if (get().isProcessing) {
      useUIStore.getState().addToast("L'agent est occupé, réessaie dans un instant", 'info')
      return
    }

    // Show only the filename in chat — full content goes to the agent only
    const wordCount = content.split(/\s+/).length
    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + 'u',
      role: 'user',
      content: `📄 Importer **${filename}** (${wordCount} mots) dans la base de connaissance`,
      timestamp: new Date().toISOString()
    }
    set((s) => ({ messages: [...s.messages, userMessage], isProcessing: true }))

    // Full content sent to agent only — never shown raw in the chat
    const agentPrompt = `[IMPORT FICHIER MARKDOWN]

L'utilisateur importe le fichier "${filename}" (${wordCount} mots) pour l'intégrer dans la base de connaissance.

Voici son contenu COMPLET :

\`\`\`markdown
${content}
\`\`\`

[INSTRUCTION CRITIQUE]
Analyse ce fichier en détail et propose des actions concrètes :
1. De quoi parle-t-il ? (personne, entreprise, projet, domaine, note, journal ?)
2. Quelles entités sont mentionnées ? (noms, organisations, projets…)
3. Crée ou met à jour les fichiers appropriés dans les bons dossiers (Reseau/, Entreprises/, Projets/, Domaines/, Journal/) avec frontmatter YAML + corps Markdown structuré.
4. Reprend fidèlement les informations — n'invente RIEN.
5. Utilise des wikilinks [[Nom]] pour relier les entités entre elles.
input_type="information"`

    const requestId = Date.now().toString(36) + 'r'
    const stopStream = startStreamSession(requestId, 'default', set, get)

    try {
      const result = await window.cortx.agent.processStream(agentPrompt, requestId) as AgentResponse
      const agentMessage: ChatMessage = {
        id: Date.now().toString(36) + 'a',
        role: 'agent',
        content: result.summary || result.response || `Analyse de "${filename}" terminée.`,
        timestamp: new Date().toISOString(),
        agentResponse: result
      }
      set((s) => ({ messages: [...s.messages, agentMessage], isProcessing: false }))

      // Register proposed actions in agent store so right panel shows them
      if (result.actions.length > 0) {
        useAgentStore.getState().addActions(result)
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: Date.now().toString(36) + 'e',
        role: 'agent',
        content: `❌ Erreur lors de l'analyse de "${filename}" : ${(err as Error).message}`,
        timestamp: new Date().toISOString()
      }
      set((s) => ({ messages: [...s.messages, errorMessage], isProcessing: false }))
    } finally {
      stopStream()
    }
  },

  acceptActions: async (messageId: string, opts) => {
    const { actionIds, edits = {} } = opts ?? {}
    const msg = get().messages.find((m) => m.id === messageId)
    if (!msg?.agentResponse?.actions?.length) return

    const allActions = msg.agentResponse.actions
    const acceptSet = new Set(actionIds ?? allActions.map((a) => a.id))
    // Only accept actions that are still proposed
    const toAccept = allActions.filter((a) => acceptSet.has(a.id) && a.status === 'proposed')
    const toReject = allActions.filter((a) => !acceptSet.has(a.id) && a.status === 'proposed')

    if (toAccept.length === 0) return

    const summary = msg.agentResponse.summary || 'CortX: actions validées'
    const actionsToExecute = toAccept.map((a) => (edits[a.id] ? applyEditToAction(a, edits[a.id]) : a))

    // Mark accepted as pending, non-accepted proposed as rejected
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.agentResponse) return m
        return {
          ...m,
          agentResponse: {
            ...m.agentResponse,
            actions: m.agentResponse.actions.map((a) => {
              if (acceptSet.has(a.id) && a.status === 'proposed') return { ...a, status: 'pending' as const }
              if (!acceptSet.has(a.id) && a.status === 'proposed') return { ...a, status: 'rejected' as const }
              return a
            })
          }
        }
      })
    }))

    // Immediately sync rejected to agent store
    if (toReject.length > 0) {
      useAgentStore.getState().updateStatuses(toReject.map((a) => ({ id: a.id, status: 'rejected' as const })))
    }

    try {
      const commitHash = await window.cortx.agent.execute(actionsToExecute, summary)

      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId || !m.agentResponse) return m
          return {
            ...m,
            agentResponse: {
              ...m.agentResponse,
              commitHash,
              actions: m.agentResponse.actions.map((a) =>
                acceptSet.has(a.id) && a.status === 'pending' ? { ...a, status: 'validated' as const } : a
              )
            }
          }
        })
      }))

      useAgentStore.getState().updateStatuses(
        toAccept.map((a) => ({ id: a.id, status: 'validated' as const })),
        commitHash
      )
      useUIStore.getState().addToast(`${toAccept.length} action(s) appliquée(s)`, 'success')
      useGraphStore.getState().loadGraph()
      useFileStore.getState().loadFiles()
    } catch (error) {
      // Revert accepted-pending back to proposed
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId || !m.agentResponse) return m
          return {
            ...m,
            agentResponse: {
              ...m.agentResponse,
              actions: m.agentResponse.actions.map((a) =>
                acceptSet.has(a.id) && a.status === 'pending' ? { ...a, status: 'proposed' as const } : a
              )
            }
          }
        })
      }))
      useAgentStore.getState().updateStatuses(toAccept.map((a) => ({ id: a.id, status: 'proposed' as const })))
      useUIStore.getState().addToast("Erreur lors de l'exécution", 'error')
    }
  },

  rejectActions: (messageId: string, actionIds?: string[]) => {
    const msg = get().messages.find((m) => m.id === messageId)
    if (!msg?.agentResponse) return

    const rejectSet = new Set(actionIds ?? msg.agentResponse.actions.map((a) => a.id))

    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId || !m.agentResponse) return m
        return {
          ...m,
          agentResponse: {
            ...m.agentResponse,
            actions: m.agentResponse.actions.map((a) =>
              rejectSet.has(a.id) && a.status === 'proposed' ? { ...a, status: 'rejected' as const } : a
            )
          }
        }
      })
    }))

    useAgentStore.getState().updateStatuses(
      [...rejectSet].map((id) => ({ id, status: 'rejected' as const }))
    )
    useUIStore.getState().addToast('Actions refusées', 'info')
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
