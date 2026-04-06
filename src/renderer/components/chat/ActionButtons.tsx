import { Check, X, Undo2, Loader2 } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import type { AgentAction } from '../../../shared/types'

interface ActionButtonsProps {
  messageId: string
  actions: AgentAction[]
  commitHash?: string
}

export function ActionButtons({ messageId, actions, commitHash }: ActionButtonsProps): React.JSX.Element {
  const { acceptActions, rejectActions, undoActions } = useChatStore()
  const status = actions[0]?.status

  // Proposed — show Accept / Reject
  if (status === 'proposed') {
    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => acceptActions(messageId)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-card bg-cortx-success/10 text-cortx-success hover:bg-cortx-success/20 border border-cortx-success/20 transition-colors cursor-pointer font-medium"
        >
          <Check size={13} />
          Accepter
        </button>
        <button
          onClick={() => rejectActions(messageId)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-card bg-cortx-error/10 text-cortx-error hover:bg-cortx-error/20 border border-cortx-error/20 transition-colors cursor-pointer font-medium"
        >
          <X size={13} />
          Refuser
        </button>
      </div>
    )
  }

  // Executing
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-cortx-text-secondary">
        <Loader2 size={13} className="animate-spin text-cortx-accent" />
        Application en cours...
      </div>
    )
  }

  // Validated — show Undo
  if (status === 'validated' && commitHash) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => undoActions(commitHash, messageId)}
          className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-cortx-cta/10 text-cortx-cta hover:bg-cortx-cta/20 transition-colors cursor-pointer"
        >
          <Undo2 size={11} />
          Annuler
        </button>
      </div>
    )
  }

  // Rejected / Undone — no buttons
  return <></>
}
