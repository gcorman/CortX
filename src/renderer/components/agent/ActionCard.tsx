import { useState } from 'react'
import { FilePlus, FileEdit, ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentAction } from '../../../shared/types'

interface ActionCardProps {
  action: AgentAction
}

export function ActionCard({ action }: ActionCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const isCreate = action.action === 'create'
  const Icon = isCreate ? FilePlus : FileEdit
  const iconColor = isCreate ? 'text-cortx-success' : 'text-cortx-accent'

  const statusColors: Record<string, string> = {
    proposed: 'bg-cortx-cta/10 text-cortx-cta',
    pending: 'bg-cortx-accent/10 text-cortx-accent',
    validated: 'bg-cortx-success/10 text-cortx-success',
    rejected: 'bg-cortx-error/10 text-cortx-error',
    undone: 'bg-cortx-cta/10 text-cortx-cta'
  }

  const statusLabels: Record<string, string> = {
    proposed: 'en attente',
    pending: 'en cours',
    validated: 'applique',
    rejected: 'refuse',
    undone: 'annule'
  }

  return (
    <div className="bg-cortx-bg rounded-card border border-cortx-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-cortx-elevated/50 transition-colors cursor-pointer"
      >
        <Icon size={13} className={`${iconColor} flex-shrink-0`} />
        <span className="text-xs text-cortx-text-primary truncate flex-1 font-mono">
          {action.file}
        </span>
        <span className={`text-2xs px-1.5 py-0.5 rounded ${statusColors[action.status]}`}>
          {statusLabels[action.status]}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-cortx-text-secondary flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-cortx-text-secondary flex-shrink-0" />
        )}
      </button>

      {expanded && action.content && (
        <div className="px-3 py-2 border-t border-cortx-border bg-cortx-bg">
          <pre className="text-2xs text-cortx-text-secondary font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
            {action.content.length > 500 ? action.content.slice(0, 500) + '...' : action.content}
          </pre>
        </div>
      )}
    </div>
  )
}
