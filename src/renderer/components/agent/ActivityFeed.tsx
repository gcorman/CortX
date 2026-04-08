import { useAgentStore } from '../../stores/agentStore'
import { useChatStore } from '../../stores/chatStore'
import { ActionCard } from './ActionCard'
import { SuggestionCard } from './SuggestionCard'
import { ConflictAlert } from './ConflictAlert'
import { Activity } from 'lucide-react'

export function ActivityFeed(): React.JSX.Element {
  const { actions, suggestions, conflicts } = useAgentStore()
  const dismissedSuggestions = useChatStore((s) => s.dismissedSuggestions)

  const visibleSuggestions = suggestions.filter((s) => !dismissedSuggestions.has(s))
  const hasContent = actions.length > 0 || visibleSuggestions.length > 0 || conflicts.length > 0

  if (!hasContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-full bg-cortx-bg flex items-center justify-center mb-3">
          <Activity size={22} className="text-cortx-text-secondary/30" />
        </div>
        <p className="text-xs text-cortx-text-secondary/60">
          Les actions de l'agent apparaitront ici.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-2xs font-semibold text-cortx-warning uppercase tracking-wider px-1">
            Conflits
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
            Suggestions
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
            Actions recentes
          </h3>
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  )
}
