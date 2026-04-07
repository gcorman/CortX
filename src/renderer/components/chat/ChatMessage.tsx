import { useState } from 'react'
import { User, Brain, FilePlus, FileEdit, Copy, Check, Eye, HelpCircle } from 'lucide-react'
import { ActionButtons } from './ActionButtons'
import { ActionPreview } from './ActionPreview'
import { WikiText } from '../../utils/wikilink'
import { useChatStore } from '../../stores/chatStore'
import type { ChatMessage as ChatMessageType, AgentAction } from '../../../shared/types'

interface ChatMessageProps {
  message: ChatMessageType
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  proposed: { bg: 'bg-cortx-cta/10', text: 'text-cortx-cta', label: 'en attente' },
  pending: { bg: 'bg-cortx-accent/10', text: 'text-cortx-accent', label: 'en cours...' },
  validated: { bg: 'bg-cortx-success/10', text: 'text-cortx-success', label: 'applique' },
  rejected: { bg: 'bg-cortx-error/10', text: 'text-cortx-error', label: 'refuse' },
  undone: { bg: 'bg-cortx-cta/10', text: 'text-cortx-cta', label: 'annule' }
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [previewAction, setPreviewAction] = useState<AgentAction | null>(null)
  const answerClarification = useChatStore((s) => s.answerClarification)

  function handleCopy(): void {
    const text = isUser
      ? message.content
      : message.agentResponse?.summary || message.agentResponse?.response || message.content
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (isUser) {
    return (
      <div className="group flex gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cortx-elevated flex items-center justify-center">
          <User size={13} className="text-cortx-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-cortx-text-primary leading-relaxed whitespace-pre-wrap">
            <WikiText text={message.content} />
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xs text-cortx-text-secondary/40">
              {new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary/40 hover:text-cortx-text-secondary transition-all cursor-pointer"
              title="Copier"
            >
              {copied ? <Check size={11} className="text-cortx-success" /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const response = message.agentResponse

  return (
    <div className="group flex gap-2.5">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cortx-accent/10 flex items-center justify-center">
        <Brain size={13} className="text-cortx-accent" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {/* Summary */}
        <p className="text-sm text-cortx-text-primary leading-relaxed whitespace-pre-wrap">
          <WikiText text={response?.summary || response?.response || message.content} />
        </p>

        {/* Clarification — agent is asking the user to choose */}
        {response?.clarification && (
          <div className="rounded-card border border-cortx-accent/30 bg-cortx-accent/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <HelpCircle size={14} className="text-cortx-accent flex-shrink-0 mt-0.5" />
              <p className="text-sm text-cortx-text-primary leading-snug">
                {response.clarification.question}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 pl-1">
              {response.clarification.options.map((opt, i) => {
                const answered = response.clarification!.answeredIndex
                const isChosen = answered === i
                const isDisabled = answered !== undefined
                return (
                  <button
                    key={i}
                    onClick={() => answerClarification(message.id, i)}
                    disabled={isDisabled}
                    className={`text-left text-xs px-3 py-2 rounded-card border transition-all ${
                      isChosen
                        ? 'border-cortx-accent bg-cortx-accent/15 text-cortx-accent font-medium'
                        : isDisabled
                          ? 'border-cortx-border bg-cortx-bg/30 text-cortx-text-secondary/40 cursor-not-allowed'
                          : 'border-cortx-border bg-cortx-bg/50 text-cortx-text-primary hover:border-cortx-accent hover:bg-cortx-accent/10 cursor-pointer'
                    }`}
                  >
                    {isChosen && <Check size={11} className="inline mr-1.5" />}
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions list — clickable for preview */}
        {response?.actions && response.actions.length > 0 && (
          <div className="space-y-1">
            {response.actions.map((action) => {
              const style = STATUS_STYLES[action.status] || STATUS_STYLES.proposed
              const canPreview = action.status === 'proposed'
              return (
                <button
                  key={action.id}
                  onClick={canPreview ? () => setPreviewAction(action) : undefined}
                  className={`flex items-center gap-2 w-full text-left text-xs text-cortx-text-secondary rounded px-2.5 py-1.5 transition-colors ${
                    canPreview
                      ? 'bg-cortx-bg/50 hover:bg-cortx-elevated cursor-pointer'
                      : 'bg-cortx-bg/30 cursor-default'
                  }`}
                >
                  {action.action === 'create' ? (
                    <FilePlus size={12} className="text-cortx-success flex-shrink-0" />
                  ) : (
                    <FileEdit size={12} className="text-cortx-accent flex-shrink-0" />
                  )}
                  <span className="truncate font-mono text-2xs">{action.file}</span>
                  {canPreview && (
                    <Eye size={11} className="text-cortx-text-secondary/40 flex-shrink-0 ml-auto mr-1" />
                  )}
                  <span className={`text-2xs px-1.5 py-0.5 rounded flex-shrink-0 ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Suggestions */}
        {response?.suggestions && response.suggestions.length > 0 && (
          <div className="space-y-1">
            {response.suggestions.map((suggestion, i) => (
              <div
                key={i}
                className="text-xs text-cortx-accent-light bg-cortx-accent/5 border border-cortx-accent/20 rounded px-2.5 py-1.5"
              >
                <WikiText text={suggestion} />
              </div>
            ))}
          </div>
        )}

        {/* Conflicts */}
        {response?.conflicts && response.conflicts.length > 0 && (
          <div className="space-y-1">
            {response.conflicts.map((conflict, i) => (
              <div
                key={i}
                className="text-xs text-cortx-warning bg-cortx-warning/5 border border-cortx-warning/20 rounded px-2.5 py-1.5"
              >
                <WikiText text={conflict} />
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {response?.actions && response.actions.length > 0 && (
          <ActionButtons
            messageId={message.id}
            actions={response.actions}
            commitHash={response.commitHash}
          />
        )}

        <div className="flex items-center gap-2">
          <span className="text-2xs text-cortx-text-secondary/40">
            {new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary/40 hover:text-cortx-text-secondary transition-all cursor-pointer"
            title="Copier"
          >
            {copied ? <Check size={11} className="text-cortx-success" /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {previewAction && (
        <ActionPreview action={previewAction} onClose={() => setPreviewAction(null)} />
      )}
    </div>
  )
}
