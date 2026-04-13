import { useState } from 'react'
import { FilePlus, FileEdit, ChevronDown, ChevronRight, Check, X, Eye } from 'lucide-react'
import { useT } from '../../i18n'
import type { AgentAction } from '../../../shared/types'

interface ActionCardProps {
  action: AgentAction
  onAccept?: () => void
  onReject?: () => void
  onPreview?: () => void
}

export function ActionCard({ action, onAccept, onReject, onPreview }: ActionCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const t = useT()

  const isCreate = action.action === 'create'
  const Icon = isCreate ? FilePlus : FileEdit
  const iconColor = isCreate ? 'text-cortx-success' : 'text-cortx-accent'

  const isProposed = action.status === 'proposed'

  const statusColors: Record<string, string> = {
    proposed:  'bg-cortx-cta/10 text-cortx-cta',
    pending:   'bg-cortx-accent/10 text-cortx-accent',
    validated: 'bg-cortx-success/10 text-cortx-success',
    rejected:  'bg-cortx-error/10 text-cortx-error',
    undone:    'bg-cortx-cta/10 text-cortx-cta'
  }

  const statusLabels: Record<string, string> = {
    proposed:  t.actionCard.pending,
    pending:   t.actionCard.inProgress,
    validated: t.actionCard.applied,
    rejected:  t.actionCard.rejected,
    undone:    t.actionCard.cancelled
  }

  return (
    <div className={`rounded-card border overflow-hidden transition-colors ${
      isProposed ? 'border-cortx-accent/20 bg-cortx-bg' : 'border-cortx-border bg-cortx-bg'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-cortx-elevated/50 -mx-1 px-1 rounded transition-colors cursor-pointer"
        >
          <Icon size={13} className={`${iconColor} flex-shrink-0`} />
          <span className="text-xs text-cortx-text-primary truncate flex-1 font-mono">
            {action.file}
          </span>
          <span className={`text-2xs px-1.5 py-0.5 rounded flex-shrink-0 ${statusColors[action.status]}`}>
            {statusLabels[action.status]}
          </span>
          {expanded
            ? <ChevronDown size={12} className="text-cortx-text-secondary flex-shrink-0" />
            : <ChevronRight size={12} className="text-cortx-text-secondary flex-shrink-0" />
          }
        </button>

        {/* Action buttons — only for proposed */}
        {isProposed && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {onPreview && (
              <button
                onClick={onPreview}
                className="p-1 rounded text-cortx-text-secondary/50 hover:text-cortx-accent hover:bg-cortx-accent/10 transition-colors cursor-pointer"
                title={t.actionCard.preview}
              >
                <Eye size={12} />
              </button>
            )}
            {onAccept && (
              <button
                onClick={onAccept}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-2xs bg-cortx-success/10 text-cortx-success hover:bg-cortx-success/20 border border-cortx-success/20 transition-colors cursor-pointer font-medium"
                title={t.actionCard.accept}
              >
                <Check size={11} />
                {t.actionCard.accept}
              </button>
            )}
            {onReject && (
              <button
                onClick={onReject}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-2xs bg-cortx-error/10 text-cortx-error hover:bg-cortx-error/20 border border-cortx-error/20 transition-colors cursor-pointer font-medium"
                title={t.actionCard.reject}
              >
                <X size={11} />
                {t.actionCard.reject}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && action.content && (
        <div className="px-3 py-2 border-t border-cortx-border bg-cortx-bg">
          <pre className="text-2xs text-cortx-text-secondary font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
            {action.content.length > 500 ? action.content.slice(0, 500) + '…' : action.content}
          </pre>
        </div>
      )}
    </div>
  )
}
