import { X, Archive, MessageSquare, Zap, GitBranch, AlertTriangle, Minus, Layers } from 'lucide-react'
import type { IdleInsight } from '../../../shared/types'
import { useIdleStore } from '../../stores/idleStore'
import { useUIStore } from '../../stores/uiStore'
import { useChatStore } from '../../stores/chatStore'

const CATEGORY_LABELS: Record<IdleInsight['category'], string> = {
  hidden_connection: 'Connexion cachée',
  pattern: 'Pattern',
  contradiction: 'Contradiction',
  gap: 'Lacune',
  cluster: 'Cluster'
}

const CATEGORY_ICONS: Record<IdleInsight['category'], React.ComponentType<{ size: number; className?: string }>> = {
  hidden_connection: GitBranch,
  pattern: Layers,
  contradiction: AlertTriangle,
  gap: Minus,
  cluster: Zap
}

const CATEGORY_COLORS: Record<IdleInsight['category'], string> = {
  hidden_connection: 'text-teal-400 bg-teal-400/10',
  pattern: 'text-purple-400 bg-purple-400/10',
  contradiction: 'text-red-400 bg-red-400/10',
  gap: 'text-amber-400 bg-amber-400/10',
  cluster: 'text-blue-400 bg-blue-400/10'
}

interface InsightCardProps {
  insight: IdleInsight
}

export function InsightCard({ insight }: InsightCardProps): React.JSX.Element {
  const dismissInsight = useIdleStore((s) => s.dismissInsight)
  const saveInsightAsFiche = useIdleStore((s) => s.saveInsightAsFiche)
  const addToast = useUIStore((s) => s.addToast)
  const sendMessage = useChatStore((s) => s.sendMessage)

  const Icon = CATEGORY_ICONS[insight.category]
  const colorClass = CATEGORY_COLORS[insight.category]

  async function handleSave(): Promise<void> {
    try {
      await saveInsightAsFiche(insight.id)
      addToast('Insight sauvegardé en fiche', 'success')
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
    }
  }

  function handleExplore(): void {
    const entityList = insight.entityNames.join(' et ')
    const message = `Peux-tu développer cet insight concernant ${entityList} : "${insight.content}"`
    void sendMessage(message)
    void dismissInsight(insight.id)
  }

  const confidence = Math.round(insight.confidence * 100)
  const timeAgo = formatTimeAgo(insight.timestamp)

  return (
    <div className="bg-cortx-bg border border-cortx-border rounded-card p-3 space-y-2.5 group hover:border-cortx-accent/30 transition-colors">
      {/* Header: category + time + dismiss */}
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium ${colorClass}`}>
          <Icon size={9} />
          {CATEGORY_LABELS[insight.category]}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-2xs text-cortx-text-secondary/40">{confidence}%</span>
          <span className="text-2xs text-cortx-text-secondary/30">·</span>
          <span className="text-2xs text-cortx-text-secondary/40">{timeAgo}</span>
          <button
            onClick={() => void dismissInsight(insight.id)}
            className="ml-1 p-0.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary/40 hover:text-cortx-text-primary transition-colors cursor-pointer"
            title="Ignorer"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-xs text-cortx-text-primary/90 leading-relaxed">{insight.content}</p>

      {/* Entity pills */}
      {insight.entityNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.entityNames.map((name) => (
            <span
              key={name}
              className="text-2xs px-1.5 py-0.5 bg-cortx-elevated rounded text-cortx-text-secondary border border-cortx-border"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          onClick={handleExplore}
          className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-cortx-accent/10 text-cortx-accent hover:bg-cortx-accent/20 transition-colors cursor-pointer"
          title="Envoyer à l'agent pour développer"
        >
          <MessageSquare size={10} />
          Explorer
        </button>
        {insight.status === 'new' && (
          <button
            onClick={() => void handleSave()}
            className="flex items-center gap-1 text-2xs px-2 py-1 rounded bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
            title="Sauvegarder en fiche"
          >
            <Archive size={10} />
            Fiche
          </button>
        )}
        {insight.status === 'saved' && (
          <span className="text-2xs text-cortx-success/60 flex items-center gap-1">
            <Archive size={10} />
            Sauvegardé
          </span>
        )}
      </div>
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}
