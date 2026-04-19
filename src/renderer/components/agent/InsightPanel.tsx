import { ChevronDown, ChevronUp, Eye, X } from 'lucide-react'
import { useState } from 'react'
import { useIdleStore } from '../../stores/idleStore'
import { InsightCard } from './InsightCard'
import { useT } from '../../i18n'
import type { IdleAttempt } from '../../../shared/types'

const DRAFT_POOL_MAX = 6
const VISIBLE_MAX = 5

// ── Brain ring with progress ────────────────────────────────────────────────

function BrainRing({ isActive, phase, draftCount }: { isActive: boolean; phase: string; draftCount: number }): React.JSX.Element {
  const isThinking = isActive && (phase === 'thinking' || phase === 'examining')
  const isInsight = isActive && phase === 'insight'
  const progress = isActive ? Math.min(1, draftCount / DRAFT_POOL_MAX) : 0
  const circumference = 2 * Math.PI * 9
  const strokeDash = circumference * progress
  const color = isInsight ? '#F97316' : '#0D9488'

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22 }}>
      <svg width="22" height="22" viewBox="0 0 22 22" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="2"
          className="text-cortx-border" strokeOpacity="0.4" />
        {progress > 0 && (
          <circle cx="11" cy="11" r="9" fill="none" stroke={color} strokeWidth="2"
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        )}
      </svg>
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke={isActive ? color : 'currentColor'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={`relative z-10 ${isActive ? '' : 'text-cortx-text-secondary'} ${isThinking ? 'animate-pulse' : ''}`}
      >
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
        <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
        <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
        <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
        <path d="M6 18a4 4 0 0 1-1.967-.516"/>
        <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
      </svg>
    </div>
  )
}

// ── Activity log ────────────────────────────────────────────────────────────

const RESULT_DOT: Record<IdleAttempt['result'], string> = {
  none:    'bg-cortx-border',
  draft:   'bg-cortx-accent',
  insight: 'bg-cortx-cta',
}

const RESULT_LABEL: Record<IdleAttempt['result'], string> = {
  none:    '—',
  draft:   'brouillon',
  insight: 'insight ✦',
}

const STRATEGY_LABEL: Record<string, string> = {
  llm:      '↗',
  bridge:   '⇌',
  cluster:  '◉',
  recent:   '⟳',
  peripheral: '○',
  random:   '~',
}

function AttemptRow({ attempt }: { attempt: IdleAttempt }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const dotClass = RESULT_DOT[attempt.result]
  const label = RESULT_LABEL[attempt.result]
  const stratIcon = STRATEGY_LABEL[attempt.strategy] ?? '·'
  const names = attempt.entityNames.slice(0, 2).join(' × ')
  const hasContent = Boolean(attempt.fullContent)

  return (
    <div className="border-b border-cortx-border/30 last:border-0">
      <div className="flex items-start gap-2 py-1">
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs text-cortx-text-secondary/40 font-mono">{stratIcon}</span>
            <span className="text-2xs text-cortx-text-primary/70 truncate">{names}</span>
            {attempt.webEnriched && (
              <span className="text-2xs text-blue-400/60 flex-shrink-0">🌐</span>
            )}
            <span className={`text-2xs ml-auto flex-shrink-0 ${
              attempt.result === 'insight' ? 'text-cortx-cta/80' :
              attempt.result === 'draft'   ? 'text-cortx-accent/70' :
              'text-cortx-text-secondary/30'
            }`}>{label}</span>
            {hasContent && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className={`flex-shrink-0 transition-colors cursor-pointer ${
                  expanded
                    ? 'text-cortx-accent'
                    : 'text-cortx-text-secondary/60 hover:text-cortx-accent'
                }`}
                title="Voir le contenu généré"
              >
                {expanded ? <X size={11} /> : <Eye size={11} />}
              </button>
            )}
          </div>
          {!expanded && attempt.snippet && (
            <p className="text-2xs text-cortx-text-secondary/50 leading-snug mt-0.5 truncate">
              {attempt.snippet}{attempt.snippet.length >= 70 ? '…' : ''}
            </p>
          )}
        </div>
      </div>
      {expanded && attempt.fullContent && (
        <div className="ml-3.5 mb-1.5 px-2 py-1.5 rounded-md bg-cortx-bg/80 border border-cortx-border/40">
          <p className="text-2xs text-cortx-text-secondary/70 leading-relaxed whitespace-pre-wrap">
            {attempt.fullContent}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function InsightPanel(): React.JSX.Element | null {
  const insights  = useIdleStore((s) => s.insights)
  const isActive  = useIdleStore((s) => s.isActive)
  const phase     = useIdleStore((s) => s.phase)
  const draftCount = useIdleStore((s) => s.draftCount)
  const attempts  = useIdleStore((s) => s.attempts)
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const t = useT()

  const newInsights = insights.filter((i) => i.status === 'new')
  const visibleInsights = showAll ? newInsights : newInsights.slice(0, VISIBLE_MAX)
  const hiddenCount = newInsights.length - VISIBLE_MAX

  if (!isActive && newInsights.length === 0) return null

  return (
    <div className="border-t border-cortx-border flex-shrink-0">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-cortx-elevated/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <BrainRing isActive={isActive} phase={phase} draftCount={draftCount} />
          <span className="text-xs font-medium text-cortx-text-primary">{t.insightPanel.title}</span>
          {newInsights.length > 0 && (
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-cortx-accent/20 text-cortx-accent font-medium">
              {newInsights.length}
            </span>
          )}
          {isActive && phase !== 'stopped' && (
            <span className="text-2xs text-cortx-text-secondary/50 italic">
              {phase === 'selecting'  && t.insightPanel.selecting}
              {phase === 'examining'  && t.insightPanel.examining}
              {phase === 'thinking'   && t.insightPanel.analyzing}
              {phase === 'insight'    && t.insightPanel.insightFound}
              {phase === 'resting'    && t.insightPanel.resting}
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronDown size={13} className="text-cortx-text-secondary" />
          : <ChevronUp   size={13} className="text-cortx-text-secondary" />}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 max-h-80 overflow-y-auto">

          {/* ── Activity log (always shown when active) ─────────────── */}
          {isActive && attempts.length > 0 && (
            <div className="bg-cortx-bg/60 rounded-card px-2 pt-1.5 pb-0.5 border border-cortx-border/40">
              <p className="text-2xs text-cortx-text-secondary/40 uppercase tracking-wider mb-1 font-mono">
                activité
              </p>
              {attempts.map((a) => (
                <AttemptRow key={a.id} attempt={a} />
              ))}
              {draftCount > 0 && (
                <p className="text-2xs text-cortx-accent/50 mt-1.5 pb-0.5">
                  {draftCount} brouillon{draftCount > 1 ? 's' : ''} en mémoire — synthèse en cours…
                </p>
              )}
            </div>
          )}

          {/* ── Insights list ────────────────────────────────────────── */}
          {newInsights.length === 0 ? (
            <div className="text-center py-3">
              {isActive ? (
                <p className="text-2xs text-cortx-text-secondary/40 italic">
                  {t.insightPanel.accumulating}
                </p>
              ) : (
                <p className="text-2xs text-cortx-text-secondary/40 italic">
                  {t.insightPanel.activateIdle}
                </p>
              )}
            </div>
          ) : (
            <>
              {visibleInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
              {hiddenCount > 0 && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-2xs text-cortx-text-secondary/50 hover:text-cortx-accent py-1 transition-colors cursor-pointer"
                >
                  + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
