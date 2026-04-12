import { ChatView } from '../chat/ChatView'
import { Brain } from 'lucide-react'
import { useT } from '../../i18n'

export function LeftPanel(): React.JSX.Element {
  const t = useT()
  return (
    <div className="h-full flex flex-col bg-cortx-surface border-r border-cortx-border">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-cortx-border">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-cortx-accent" />
          <h2 className="text-sm font-semibold text-cortx-text-primary">{t.leftPanel.conversation}</h2>
        </div>
      </div>

      {/* Chat */}
      <ChatView />
    </div>
  )
}
