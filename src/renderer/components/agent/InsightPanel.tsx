import { Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useIdleStore } from '../../stores/idleStore'
import { InsightCard } from './InsightCard'

export function InsightPanel(): React.JSX.Element | null {
  const insights = useIdleStore((s) => s.insights)
  const isActive = useIdleStore((s) => s.isActive)
  const phase = useIdleStore((s) => s.phase)
  const draftCount = useIdleStore((s) => s.draftCount)
  const [collapsed, setCollapsed] = useState(false)

  const newInsights = insights.filter((i) => i.status === 'new')

  // Don't render if not active and no new insights
  if (!isActive && newInsights.length === 0) return null

  return (
    <div className="border-t border-cortx-border flex-shrink-0">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-cortx-elevated/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Brain
            size={13}
            className={`${isActive ? 'text-cortx-accent' : 'text-cortx-text-secondary'} ${
              isActive && (phase === 'thinking' || phase === 'examining') ? 'animate-pulse' : ''
            }`}
          />
          <span className="text-xs font-medium text-cortx-text-primary">Insights</span>
          {newInsights.length > 0 && (
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-cortx-accent/20 text-cortx-accent font-medium">
              {newInsights.length}
            </span>
          )}
          {isActive && phase !== 'stopped' && (
            <span className="text-2xs text-cortx-text-secondary/50 italic">
              {PHASE_LABELS[phase]}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={13} className="text-cortx-text-secondary" /> : <ChevronUp size={13} className="text-cortx-text-secondary" />}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 max-h-72 overflow-y-auto">
          {newInsights.length === 0 ? (
            <div className="text-center py-4">
              {isActive ? (
                <div className="space-y-1 text-center">
                  <p className="text-2xs text-cortx-text-secondary/40 italic">
                    L'agent accumule des intuitions en silence…
                  </p>
                  {draftCount > 0 && (
                    <p className="text-2xs text-cortx-accent/60 font-medium">
                      {draftCount} brouillon{draftCount > 1 ? 's' : ''} en cours de synthèse
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-2xs text-cortx-text-secondary/40 italic">
                  Activez le mode Idle pour lancer l'exploration du graphe.
                </p>
              )}
            </div>
          ) : (
            newInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

const PHASE_LABELS: Record<string, string> = {
  selecting: 'Sélection...',
  examining: 'Examen...',
  thinking: 'Analyse...',
  insight: 'Insight trouvé !',
  resting: 'En pause...'
}
