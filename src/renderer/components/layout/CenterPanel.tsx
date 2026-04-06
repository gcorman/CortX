import { useUIStore } from '../../stores/uiStore'
import { GraphView } from '../graph/GraphView'
import { TagBrowser } from '../tags/TagBrowser'
import { FilePreview } from '../files/FilePreview'
import { Network, Hash, Search } from 'lucide-react'
import { useState } from 'react'

export function CenterPanel(): React.JSX.Element {
  const { activeCenterView, setActiveCenterView, filePreviewPath, closeFilePreview } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')

  const tabs = [
    { id: 'graph' as const, label: 'Graphe', icon: Network },
    { id: 'tags' as const, label: 'Tags', icon: Hash }
  ]

  return (
    <div className="h-full flex flex-col bg-cortx-bg relative">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-cortx-border flex items-center gap-3">
        {/* View tabs */}
        <div className="flex items-center bg-cortx-surface rounded-input p-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeCenterView === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCenterView(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-cortx-elevated text-cortx-text-primary'
                    : 'text-cortx-text-secondary hover:text-cortx-text-primary'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cortx-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans la base..."
            className="w-full bg-cortx-surface border border-cortx-border rounded-input pl-9 pr-3 py-1.5 text-xs text-cortx-text-primary placeholder:text-cortx-text-secondary/50 focus:outline-none focus:border-cortx-accent transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeCenterView === 'graph' && <GraphView />}
        {activeCenterView === 'tags' && <TagBrowser />}
      </div>

      {/* File Preview Overlay */}
      {filePreviewPath && (
        <FilePreview path={filePreviewPath} onClose={closeFilePreview} />
      )}
    </div>
  )
}
