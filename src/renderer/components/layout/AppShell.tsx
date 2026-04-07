import { useState, useCallback, useRef, useEffect } from 'react'
import { LeftPanel } from './LeftPanel'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'
import { StatusBar } from './StatusBar'
import { Toast } from '../common/Toast'
import { SettingsDialog } from '../settings/SettingsDialog'
import { PanelRightOpen } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'

export function AppShell(): React.JSX.Element {
  const { rightPanelVisible, toggleRightPanel } = useUIStore()
  const loadFiles = useFileStore((s) => s.loadFiles)

  // Keep the file list loaded so wikilink resolution works everywhere.
  // Refresh periodically to catch files created by the agent.
  useEffect(() => {
    loadFiles()
    const id = setInterval(loadFiles, 5000)
    return () => clearInterval(id)
  }, [loadFiles])

  // Panel widths in pixels
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(340)
  const [rightWidth, setRightWidth] = useState(300)

  return (
    <div className="flex flex-col h-screen bg-cortx-bg overflow-hidden">
      {/* Main content */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <div style={{ width: leftWidth, minWidth: 240, maxWidth: 500 }} className="flex-shrink-0 h-full">
          <LeftPanel />
        </div>

        {/* Left resize handle */}
        <ResizeHandle onResize={(dx) => setLeftWidth((w) => Math.max(240, Math.min(500, w + dx)))} />

        {/* Center Panel */}
        <div className="flex-1 min-w-[300px] h-full">
          <CenterPanel />
        </div>

        {/* Right resize handle + panel */}
        {rightPanelVisible && (
          <>
            <ResizeHandle onResize={(dx) => setRightWidth((w) => Math.max(240, Math.min(450, w - dx)))} />
            <div style={{ width: rightWidth, minWidth: 240, maxWidth: 450 }} className="flex-shrink-0 h-full">
              <RightPanel />
            </div>
          </>
        )}

        {/* Collapsed right panel toggle */}
        {!rightPanelVisible && (
          <button
            onClick={toggleRightPanel}
            className="flex-shrink-0 w-8 h-full flex items-center justify-center bg-cortx-surface border-l border-cortx-border hover:bg-cortx-elevated transition-colors cursor-pointer"
            title="Ouvrir le panneau agent"
          >
            <PanelRightOpen size={14} className="text-cortx-text-secondary" />
          </button>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Toast Notifications */}
      <Toast />

      {/* Settings Dialog */}
      <SettingsDialog />
    </div>
  )
}

// --- Resize Handle Component ---

function ResizeHandle({ onResize }: { onResize: (deltaX: number) => void }): React.JSX.Element {
  const isDragging = useRef(false)
  const lastX = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent): void => {
      if (!isDragging.current) return
      const dx = ev.clientX - lastX.current
      lastX.current = ev.clientX
      onResize(dx)
    }

    const handleMouseUp = (): void => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      className="flex-shrink-0 w-[5px] cursor-col-resize relative group"
    >
      {/* Visible line */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-cortx-border group-hover:bg-cortx-accent transition-colors" />
      {/* Wider hit area */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}
