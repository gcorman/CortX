import { useUIStore } from '../../stores/uiStore'
import { useIdleStore } from '../../stores/idleStore'
import { GraphView } from '../graph/GraphView'
import { TagBrowser } from '../tags/TagBrowser'
import { FilePreview } from '../files/FilePreview'
import { LibraryPanel } from '../library/LibraryPanel'
import { CanvasView } from '../canvas/CanvasView'
import { Network, Hash, Search, X, Library, Brain, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../../i18n'

export function CenterPanel(): React.JSX.Element {
  const { activeCenterView, setActiveCenterView, filePreviewPath, closeFilePreview, toggleCreateFileDialog } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')
  const idleActive = useIdleStore((s) => s.isActive)
  const idlePhase = useIdleStore((s) => s.phase)
  const toggleIdle = useIdleStore((s) => s.toggle)
  const t = useT()

  const tabs = [
    { id: 'graph' as const, label: t.centerPanel.graph, icon: Network },
    { id: 'canvas' as const, label: t.centerPanel.canvas, icon: Sparkles },
    { id: 'tags' as const, label: t.centerPanel.tags, icon: Hash },
    { id: 'library' as const, label: t.centerPanel.library, icon: Library }
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

        {/* Idle toggle button — only shown in graph view */}
        {activeCenterView === 'graph' && (
          <button
            onClick={() => void toggleIdle()}
            title={idleActive ? t.centerPanel.disableIdle : t.centerPanel.enableIdle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs font-medium transition-all duration-200 cursor-pointer flex-shrink-0 ${
              idleActive
                ? 'bg-cortx-accent/20 text-cortx-accent border border-cortx-accent/40'
                : 'text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-cortx-elevated border border-transparent'
            }`}
          >
            <Brain
              size={13}
              className={idleActive && (idlePhase === 'thinking' || idlePhase === 'examining') ? 'animate-pulse' : ''}
            />
            {t.centerPanel.idle}
          </button>
        )}

        {/* Create new file button — only shown in graph view */}
        {activeCenterView === 'graph' && (
          <button
            onClick={() => toggleCreateFileDialog()}
            title={t.centerPanel.newFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs font-medium text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer flex-shrink-0"
          >
            <Plus size={14} />
            {t.centerPanel.newShort}
          </button>
        )}

        {/* Search — hidden in library + canvas view (they have their own UX) */}
        {activeCenterView !== 'library' && activeCenterView !== 'canvas' && (
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cortx-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.centerPanel.searchPlaceholder}
              className="w-full bg-cortx-surface border border-cortx-border rounded-input pl-9 pr-8 py-1.5 text-xs text-cortx-text-primary placeholder:text-cortx-text-secondary/50 focus:outline-none focus:border-cortx-accent transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cortx-text-secondary/50 hover:text-cortx-text-primary transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeCenterView === 'graph' && <GraphView searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />}
        {activeCenterView === 'canvas' && <CanvasView />}
        {activeCenterView === 'tags' && <TagBrowser />}
        {activeCenterView === 'library' && <LibraryPanel />}
      </div>

      {/* File Preview Overlay */}
      {filePreviewPath && (
        <FilePreview path={filePreviewPath} onClose={closeFilePreview} />
      )}
    </div>
  )
}
