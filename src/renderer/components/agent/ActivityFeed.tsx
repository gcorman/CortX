import { useState } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useChatStore } from '../../stores/chatStore'
import { ActionCard } from './ActionCard'
import { SuggestionCard } from './SuggestionCard'
import { ConflictAlert } from './ConflictAlert'
import { ActionPreview } from '../chat/ActionPreview'
import { Activity } from 'lucide-react'
import { useT } from '../../i18n'
import type { AgentAction } from '../../../shared/types'

/** Find the chat message that owns a given action ID. */
function findMessageId(messages: ReturnType<typeof useChatStore.getState>['messages'], actionId: string): string | null {
  for (const msg of messages) {
    if (msg.agentResponse?.actions?.some((a) => a.id === actionId)) return msg.id
  }
  return null
}

export function ActivityFeed(): React.JSX.Element {
  const { actions, suggestions, conflicts } = useAgentStore()
  const messages = useChatStore((s) => s.messages)
  const acceptActions = useChatStore((s) => s.acceptActions)
  const rejectActions = useChatStore((s) => s.rejectActions)
  const dismissedSuggestions = useChatStore((s) => s.dismissedSuggestions)
  const t = useT()

  const [previewAction, setPreviewAction] = useState<AgentAction | null>(null)

  const visibleSuggestions = suggestions.filter((s) => !dismissedSuggestions.has(s))
  const hasContent = actions.length > 0 || visibleSuggestions.length > 0 || conflicts.length > 0

  function handleAccept(action: AgentAction): void {
    const msgId = findMessageId(messages, action.id)
    if (msgId) void acceptActions(msgId, { actionIds: [action.id] })
  }

  function handleReject(action: AgentAction): void {
    const msgId = findMessageId(messages, action.id)
    if (msgId) rejectActions(msgId, [action.id])
  }

  if (!hasContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-full bg-cortx-bg flex items-center justify-center mb-3">
          <Activity size={22} className="text-cortx-text-secondary/30" />
        </div>
        <p className="text-xs text-cortx-text-secondary/60">
          {t.activityFeed.empty}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Conflicts */}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-2xs font-semibold text-cortx-warning uppercase tracking-wider px-1">
              {t.activityFeed.conflicts}
            </h3>
            {conflicts.map((conflict, i) => (
              <ConflictAlert key={i} message={conflict} />
            ))}
          </div>
        )}

        {/* Suggestions */}
        {visibleSuggestions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-2xs font-semibold text-cortx-accent uppercase tracking-wider px-1">
              {t.activityFeed.suggestions}
            </h3>
            {visibleSuggestions.map((suggestion, i) => (
              <SuggestionCard key={i} suggestion={suggestion} />
            ))}
          </div>
        )}

        {/* Recent actions */}
        {actions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-2xs font-semibold text-cortx-text-secondary uppercase tracking-wider px-1">
              {t.activityFeed.recentActions}
            </h3>
            {actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onAccept={action.status === 'proposed' ? () => handleAccept(action) : undefined}
                onReject={action.status === 'proposed' ? () => handleReject(action) : undefined}
                onPreview={action.status === 'proposed' ? () => setPreviewAction(action) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview modal triggered from right panel */}
      {previewAction && (
        <ActionPreview action={previewAction} onClose={() => setPreviewAction(null)} />
      )}
    </>
  )
}
