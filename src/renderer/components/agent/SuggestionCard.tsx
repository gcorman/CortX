import { Lightbulb, Check, X } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'

interface SuggestionCardProps {
  suggestion: string
}

export function SuggestionCard({ suggestion }: SuggestionCardProps): React.JSX.Element {
  const acceptSuggestion = useChatStore((s) => s.acceptSuggestion)
  const dismissSuggestion = useChatStore((s) => s.dismissSuggestion)

  return (
    <div className="bg-cortx-accent/5 border border-cortx-accent/20 rounded-card px-3 py-2">
      <div className="flex items-start gap-2">
        <Lightbulb size={13} className="text-cortx-accent flex-shrink-0 mt-0.5" />
        <p className="text-xs text-cortx-accent-light leading-relaxed flex-1">{suggestion}</p>
      </div>
      <div className="flex items-center gap-2 mt-2 ml-5">
        <button
          onClick={() => void acceptSuggestion(suggestion)}
          className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-cortx-accent/10 text-cortx-accent hover:bg-cortx-accent/20 transition-colors cursor-pointer"
        >
          <Check size={10} />
          Accepter
        </button>
        <button
          onClick={() => dismissSuggestion(suggestion)}
          className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
        >
          <X size={10} />
          Ignorer
        </button>
      </div>
    </div>
  )
}
