import { Brain, Globe, Search, BookOpen, FilePlus, FileEdit, Loader2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useMemo, useRef } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useT } from '../../i18n'
import type { AgentPhase, PartialAction, WebFetchEvent } from '../../../shared/types'

/**
 * Extracts visible prose from the streaming JSON buffer so the user sees the
 * agent's narrative as it appears, without raw JSON noise.
 * Pulls the `response` and `summary` string fields. Returns '' before either is
 * opened. The trailing string may be mid-stream and unterminated.
 */
function extractVisibleText(buffer: string): string {
  if (!buffer) return ''
  // Prefer response, fall back to summary.
  for (const key of ['response', 'summary'] as const) {
    const re = new RegExp(`"${key}"\\s*:\\s*"`, 'g')
    const m = re.exec(buffer)
    if (!m) continue
    const start = m.index + m[0].length
    let out = ''
    let escape = false
    for (let i = start; i < buffer.length; i++) {
      const c = buffer[i]
      if (escape) {
        if (c === 'n') out += '\n'
        else if (c === 't') out += '  '
        else if (c === 'r') continue
        else out += c
        escape = false
        continue
      }
      if (c === '\\') { escape = true; continue }
      if (c === '"') return out
      out += c
    }
    return out
  }
  return ''
}

function phaseLabel(phase: AgentPhase | null, t: ReturnType<typeof useT>): string {
  switch (phase) {
    case 'retrieving':   return t.liveStream.phaseRetrieving
    case 'fetching-web': return t.liveStream.phaseFetchingWeb
    case 'thinking':     return t.liveStream.phaseThinking
    case 'writing':      return t.liveStream.phaseWriting
    case 'proposing':    return t.liveStream.phaseProposing
    case 'done':         return t.liveStream.phaseDone
    case 'error':        return t.liveStream.phaseError
    default:             return t.liveStream.phaseWorking
  }
}

function phaseIcon(phase: AgentPhase | null): React.JSX.Element {
  if (phase === 'error')       return <AlertTriangle size={12} className="text-red-400" />
  if (phase === 'done')        return <CheckCircle2 size={12} className="text-emerald-400" />
  if (phase === 'fetching-web') return <Globe size={12} className="text-cortx-accent animate-pulse" />
  if (phase === 'retrieving')  return <Sparkles size={12} className="text-cortx-accent animate-pulse" />
  return <Brain size={12} className="text-cortx-accent animate-pulse" />
}

export function LiveStreamBubble(): React.JSX.Element | null {
  const isProcessing = useChatStore((s) => s.isProcessing)
  const streamActive = useChatStore((s) => s.streamActive)
  const streamText = useChatStore((s) => s.streamText)
  const phase = useChatStore((s) => s.streamPhase)
  const webFetches = useChatStore((s) => s.streamWebFetches)
  const partialActions = useChatStore((s) => s.streamPartialActions)
  const t = useT()
  const scrollAnchor = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => extractVisibleText(streamText), [streamText])

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [visible, partialActions.length, webFetches.length])

  if (!isProcessing && !streamActive && !phase) return null

  const hasAnyContent =
    visible.length > 0 || webFetches.length > 0 || partialActions.some((a) => a)

  return (
    <div className="relative rounded-card border border-cortx-accent/20 bg-gradient-to-br from-cortx-surface via-cortx-surface to-cortx-accent/5 p-3 shadow-sm overflow-hidden">
      {/* Animated accent strip */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cortx-accent/60 to-transparent animate-pulse" />

      {/* Header pill */}
      <div className="flex items-center gap-2 mb-2">
        {phaseIcon(phase)}
        <span className="text-2xs uppercase tracking-wide text-cortx-text-secondary font-medium">
          {phaseLabel(phase, t)}
        </span>
        {streamActive && (
          <span className="flex gap-0.5 ml-auto">
            <span className="w-1 h-1 rounded-full bg-cortx-accent/70 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-cortx-accent/70 animate-bounce" style={{ animationDelay: '120ms' }} />
            <span className="w-1 h-1 rounded-full bg-cortx-accent/70 animate-bounce" style={{ animationDelay: '240ms' }} />
          </span>
        )}
      </div>

      {/* Web fetch cards */}
      {webFetches.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {webFetches.map((f) => (
            <WebFetchCard key={f.id} fetch={f} />
          ))}
        </div>
      )}

      {/* Partial action cards */}
      {partialActions.filter((a): a is PartialAction => !!a).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {partialActions.filter((a): a is PartialAction => !!a).map((a) => (
            <PartialActionCard key={a.index} action={a} />
          ))}
        </div>
      )}

      {/* Live markdown text */}
      {visible.length > 0 ? (
        <div className="text-sm text-cortx-text-primary/90 leading-relaxed prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {visible}
          </ReactMarkdown>
          <span className="inline-block w-1.5 h-3.5 bg-cortx-accent/70 animate-pulse ml-0.5 translate-y-0.5" aria-hidden />
        </div>
      ) : (
        !hasAnyContent && (
          <div className="flex items-center gap-2 text-xs text-cortx-text-secondary/80 italic">
            <Loader2 size={12} className="animate-spin" />
            {t.liveStream.waitingFirstToken}
          </div>
        )
      )}
      <div ref={scrollAnchor} />
    </div>
  )
}

function WebFetchCard({ fetch }: { fetch: WebFetchEvent }): React.JSX.Element {
  const Icon = fetch.kind === 'search' ? Search : fetch.kind === 'wikipedia' ? BookOpen : Globe
  const t = useT()

  const statusColor =
    fetch.status === 'done' ? 'border-emerald-500/30 bg-emerald-500/5'
      : fetch.status === 'error' ? 'border-red-500/30 bg-red-500/5'
        : 'border-cortx-accent/30 bg-cortx-accent/5'

  const statusIcon =
    fetch.status === 'done' ? <CheckCircle2 size={11} className="text-emerald-400" />
      : fetch.status === 'error' ? <AlertTriangle size={11} className="text-red-400" />
        : <Loader2 size={11} className="text-cortx-accent animate-spin" />

  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${statusColor}`}>
      <Icon size={12} className="text-cortx-text-secondary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-cortx-text-primary truncate">
            {fetch.label}
          </span>
          {fetch.url && (
            <a
              href={fetch.url}
              target="_blank"
              rel="noreferrer"
              className="text-2xs text-cortx-accent/70 hover:text-cortx-accent truncate max-w-[120px]"
              title={fetch.url}
            >
              {fetch.url.replace(/^https?:\/\//, '').slice(0, 32)}
            </a>
          )}
        </div>
        {fetch.status === 'done' && (
          <div className="text-2xs text-cortx-text-secondary/70 flex gap-2">
            {fetch.resultCount !== undefined && <span>{fetch.resultCount} {t.liveStream.results}</span>}
            {fetch.chars !== undefined && <span>{(fetch.chars / 1000).toFixed(1)}k chars</span>}
          </div>
        )}
        {fetch.status === 'error' && fetch.errorMessage && (
          <div className="text-2xs text-red-400/80 truncate">{fetch.errorMessage}</div>
        )}
      </div>
      {statusIcon}
    </div>
  )
}

function PartialActionCard({ action }: { action: PartialAction }): React.JSX.Element {
  const Icon = action.action === 'modify' ? FileEdit : FilePlus
  const t = useT()
  const preview = (action.content ?? '').slice(0, 220)
  const title = action.file || t.liveStream.pendingFile

  return (
    <div className={`rounded-md border px-2.5 py-2 transition-colors ${
      action.complete
        ? 'border-cortx-accent/40 bg-cortx-accent/5'
        : 'border-cortx-accent/20 bg-cortx-surface/50'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} className="text-cortx-accent flex-shrink-0" />
        <span className="text-xs font-mono text-cortx-text-primary truncate flex-1">
          {title}
        </span>
        {action.complete
          ? <CheckCircle2 size={11} className="text-emerald-400" />
          : <Loader2 size={11} className="text-cortx-accent animate-spin" />}
      </div>
      {preview.length > 0 && (
        <pre className="text-2xs text-cortx-text-secondary/80 font-mono whitespace-pre-wrap break-words max-h-24 overflow-hidden leading-snug bg-cortx-bg/40 rounded px-2 py-1">
          {preview}
          {!action.complete && preview.length >= 20 && (
            <span className="inline-block w-1 h-2.5 bg-cortx-accent/60 animate-pulse ml-0.5 translate-y-0.5" aria-hidden />
          )}
        </pre>
      )}
    </div>
  )
}
