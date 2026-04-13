import { Check, X, Undo2, Loader2 } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useT } from '../../i18n'
import type { AgentAction } from '../../../shared/types'

interface ActionButtonsProps {
  messageId: string
  actions: AgentAction[]
  commitHash?: string
  /** Number of proposed actions currently selected for acceptance. */
  selectedCount: number
  /** Total number of proposed actions in this message. */
  totalProposed: number
  onAcceptSelected: () => void
  onRejectAll: () => void
}

export function ActionButtons({
  messageId,
  actions,
  commitHash,
  selectedCount,
  totalProposed,
  onAcceptSelected,
  onRejectAll
}: ActionButtonsProps): React.JSX.Element {
  const { undoActions } = useChatStore()
  const t = useT()

  // Derive overall "phase" from action statuses
  const statuses = actions.map((a) => a.status)
  const hasPending   = statuses.some((s) => s === 'pending')
  const hasProposed  = statuses.some((s) => s === 'proposed')
  const allValidated = statuses.length > 0 && statuses.every((s) => s === 'validated')
  const allRejected  = statuses.every((s) => s === 'rejected' || s === 'undone')

  // Executing
  if (hasPending) {
    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-cortx-text-secondary">
        <Loader2 size={13} className="animate-spin text-cortx-accent" />
        {t.actionButtons.applying}
      </div>
    )
  }

  // All validated — show Undo
  if (allValidated && commitHash) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => undoActions(commitHash, messageId)}
          className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-cortx-cta/10 text-cortx-cta hover:bg-cortx-cta/20 transition-colors cursor-pointer"
        >
          <Undo2 size={11} />
          {t.actionButtons.cancel}
        </button>
      </div>
    )
  }

  // Proposed (some or all) — show accept/reject controls
  if (hasProposed) {
    const noneSelected = selectedCount === 0
    const allSelected  = selectedCount === totalProposed
    const partial      = !noneSelected && !allSelected

    return (
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Accept button — disabled when nothing selected */}
        <button
          onClick={onAcceptSelected}
          disabled={noneSelected}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-card border font-medium transition-all cursor-pointer ${
            noneSelected
              ? 'bg-cortx-success/5 text-cortx-success/40 border-cortx-success/10 cursor-not-allowed'
              : 'bg-cortx-success/10 text-cortx-success hover:bg-cortx-success/20 border-cortx-success/20'
          }`}
        >
          <Check size={13} />
          {partial
            ? t.actionButtons.acceptSelected(selectedCount, totalProposed)
            : t.actionButtons.acceptAll}
        </button>

        {/* Reject all button */}
        <button
          onClick={onRejectAll}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-card bg-cortx-error/10 text-cortx-error hover:bg-cortx-error/20 border border-cortx-error/20 transition-colors cursor-pointer font-medium"
        >
          <X size={13} />
          {t.actionButtons.rejectAll}
        </button>

        {/* Partial hint */}
        {partial && (
          <span className="text-2xs text-cortx-text-secondary/50 ml-1">
            {totalProposed - selectedCount} exclu{totalProposed - selectedCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    )
  }

  // Rejected / mixed done state — no buttons
  if (allRejected) return <></>

  // Partial validated+rejected (after partial accept) — show undo if hash available
  if (commitHash) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => undoActions(commitHash, messageId)}
          className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-cortx-cta/10 text-cortx-cta hover:bg-cortx-cta/20 transition-colors cursor-pointer"
        >
          <Undo2 size={11} />
          {t.actionButtons.cancel}
        </button>
      </div>
    )
  }

  return <></>
}
