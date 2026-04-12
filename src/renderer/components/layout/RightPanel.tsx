import { ActivityFeed } from '../agent/ActivityFeed'
import { FichePanel } from '../agent/FichePanel'
import { InsightPanel } from '../agent/InsightPanel'
import { Activity, PanelRightClose } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n'

export function RightPanel(): React.JSX.Element {
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const t = useT()

  return (
    <div className="h-full flex flex-col bg-cortx-surface border-l border-cortx-border">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-cortx-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-cortx-cta" />
            <h2 className="text-sm font-semibold text-cortx-text-primary">{t.rightPanel.agentActivity}</h2>
          </div>
          <button
            onClick={toggleRightPanel}
            className="text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer p-1 rounded hover:bg-cortx-elevated"
            title={t.rightPanel.collapse}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {/* Idle insights — shown when idle mode is active or has new insights */}
      <InsightPanel />

      {/* Fiches archive — high-value long-form syntheses produced by the agent */}
      <FichePanel />

      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  )
}
