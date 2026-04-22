import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Loader2, Check, RotateCcw, Globe } from 'lucide-react'
import type { AgentCanvasSuggestion, CanvasNode } from '../../../shared/types'
import { useCanvasStore } from '../../stores/canvasStore'
import { colorForType, STICKY_COLORS } from './nodeColors'
import { useT } from '../../i18n'

interface Props {
  onClose: () => void
  onApplied?: (nodes: CanvasNode[], edges: import('../../../shared/types').CanvasEdge[]) => void
}

export function AgentSuggestModal({ onClose, onApplied }: Props): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [useInternet, setUseInternet] = useState(false)
  const [suggestion, setSuggestion] = useState<AgentCanvasSuggestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const agentBusy    = useCanvasStore((s) => s.agentBusy)
  const agentSuggest = useCanvasStore((s) => s.agentSuggest)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const t = useT()

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const runSuggest = async (): Promise<void> => {
    if (!prompt.trim()) return
    setError(null)
    setSuggestion(null)
    const result = await agentSuggest(prompt.trim(), useInternet)
    if (!result || (result.nodes.length === 0 && result.edges.length === 0)) {
      setError(result?._debug ? `${t.canvas.agentError}\n\nDEBUG: ${result._debug}` : t.canvas.agentError)
      return
    }
    setSuggestion(result)
  }

  const applySuggestion = (): void => {
    if (!suggestion) return
    onApplied?.(suggestion.nodes, suggestion.edges)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-cortx-surface/85 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(13,148,136,0.35), rgba(139,92,246,0.35))',
                boxShadow: '0 0 16px rgba(13,148,136,0.4)'
              }}
            >
              <Sparkles size={14} className="text-white" />
            </div>
            <h3 className="text-sm font-semibold text-cortx-text-primary">{t.canvas.agentTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-cortx-text-secondary hover:text-cortx-text-primary p-1.5 rounded hover:bg-white/5 cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-cortx-text-secondary mb-2 block">{t.canvas.agentPromptLabel}</label>
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void runSuggest()
              }}
              placeholder={t.canvas.agentPromptPlaceholder}
              rows={3}
              className="w-full bg-cortx-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/50 outline-none focus:border-cortx-accent/50 transition-colors resize-none"
            />
          </div>

          {/* Internet toggle */}
          <button
            onClick={() => setUseInternet((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer border ${
              useInternet
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                : 'border-white/10 bg-white/5 text-cortx-text-secondary hover:text-cortx-text-primary'
            }`}
          >
            <Globe size={12} className={useInternet ? 'text-blue-400' : ''} />
            {t.canvas.agentUseInternet ?? 'Recherche internet'}
            <span className={`ml-1 w-7 h-4 rounded-full transition-colors flex items-center px-0.5 ${useInternet ? 'bg-blue-500' : 'bg-white/20'}`}>
              <span className={`w-3 h-3 rounded-full bg-white transition-transform ${useInternet ? 'translate-x-3' : 'translate-x-0'}`} />
            </span>
          </button>

          {/* Run button */}
          {!suggestion && (
            <button
              onClick={() => void runSuggest()}
              disabled={agentBusy || !prompt.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: agentBusy || !prompt.trim()
                  ? 'rgba(71, 85, 105, 0.3)'
                  : 'linear-gradient(135deg, rgba(13,148,136,0.8), rgba(20,184,166,0.9))',
                color: '#fff',
                boxShadow: agentBusy || !prompt.trim() ? 'none' : '0 8px 24px -8px rgba(13,148,136,0.5)'
              }}
            >
              {agentBusy ? (
                <><Loader2 size={14} className="animate-spin" /> {t.canvas.agentThinking}</>
              ) : (
                <><Sparkles size={14} /> {t.canvas.agentRun}</>
              )}
            </button>
          )}

          {error && (
            <div className="text-xs text-cortx-error bg-cortx-error/10 border border-cortx-error/30 rounded-lg px-3 py-2 whitespace-pre-wrap font-mono leading-relaxed">
              {error}
            </div>
          )}

          {/* Suggestion preview */}
          {suggestion && (
            <SuggestionPreview suggestion={suggestion} />
          )}
        </div>

        {/* Footer */}
        {suggestion && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 bg-cortx-bg/40">
            <button
              onClick={() => { setSuggestion(null); setError(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-white/5 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} /> {t.canvas.agentRetry}
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
            >
              {t.canvas.agentCancel}
            </button>
            <button
              onClick={applySuggestion}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white cursor-pointer transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(13,148,136,0.9), rgba(20,184,166,1))',
                boxShadow: '0 6px 18px -6px rgba(13,148,136,0.6)'
              }}
            >
              <Check size={12} /> {t.canvas.agentApply} ({suggestion.nodes.length})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SuggestionPreview({ suggestion }: { suggestion: AgentCanvasSuggestion }): React.JSX.Element {
  const t = useT()
  return (
    <div className="space-y-3">
      {suggestion.summary && (
        <p className="text-xs text-cortx-text-secondary italic">« {suggestion.summary} »</p>
      )}
      <div className="text-xs font-medium text-cortx-text-primary/80">
        {t.canvas.agentPreview}
      </div>
      <ul className="space-y-1.5 max-h-64 overflow-y-auto">
        {suggestion.nodes.map((n) => <SuggestionRow key={n.id} node={n} />)}
      </ul>
      {suggestion.edges.length > 0 && (
        <div className="text-[10px] text-cortx-text-secondary">
          + {suggestion.edges.length} {t.canvas.agentLinks}
        </div>
      )}
    </div>
  )
}

function SuggestionRow({ node }: { node: CanvasNode }): React.JSX.Element {
  if (node.kind === 'entity') {
    const color = colorForType(node.data.entityType)
    return (
      <li className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5">
        <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs text-cortx-text-primary truncate flex-1">{node.data.title}</span>
        <span
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}33` }}
        >
          {node.data.entityType}
        </span>
      </li>
    )
  }
  const palette = STICKY_COLORS[node.data.color || 'neutral']
  return (
    <li
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg border"
      style={{ backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }}
    >
      <span className="text-[9px] uppercase tracking-wider opacity-70 flex-shrink-0">note</span>
      <span className="text-xs truncate flex-1">{node.data.text}</span>
    </li>
  )
}

