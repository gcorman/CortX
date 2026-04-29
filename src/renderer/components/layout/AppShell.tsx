import { useState, useCallback, useRef, useEffect } from 'react'
import { LeftPanel } from './LeftPanel'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'
import { StatusBar } from './StatusBar'
import { Toast } from '../common/Toast'
import { UpdateBanner } from '../common/UpdateBanner'
import { SettingsDialog } from '../settings/SettingsDialog'
import { CreateFileDialog } from '../dialogs/CreateFileDialog'
import { CommandPalette } from '../common/CommandPalette'
import { PanelRightOpen } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useChatStore, setNextTelegramChatId } from '../../stores/chatStore'
import { registerDbChangedListener } from '../../stores/graphStore'
import { useT } from '../../i18n'

export function AppShell(): React.JSX.Element {
  const { rightPanelVisible, toggleRightPanel, theme, setTheme, addToast, openCommandPalette } = useUIStore()
  const t = useT()
  const loadFiles = useFileStore((s) => s.loadFiles)

  // Apply theme attribute to <html> on mount and whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Keep the file list loaded so wikilink resolution works everywhere.
  // Event-driven: refresh on kb:changed, with 30s fallback for external edits.
  useEffect(() => {
    loadFiles()
    window.cortx.on('db:changed', loadFiles)
    const id = setInterval(loadFiles, 30000)
    return () => {
      window.cortx.off('db:changed', loadFiles)
      clearInterval(id)
    }
  }, [loadFiles])

  // Register file-store reload callback so graphStore can trigger it
  // when the main process signals a manual .md change (db:changed event).
  useEffect(() => {
    registerDbChangedListener(loadFiles)
  }, [loadFiles])

  // ── Telegram relay listeners ──────────────────────────────────────────────
  // useCallback gives stable refs across StrictMode double-invocations so the
  // preload dedup guard (cortx.on) blocks re-registration if cleanup hasn't fired.
  const handleTelegramIncoming = useCallback((payload: unknown): void => {
    const { chatId, text } = payload as { chatId: number; text: string }
    setNextTelegramChatId(chatId)
    void useChatStore.getState().sendMessage(text)
  }, [])

  const handleTelegramAccept = useCallback((payload: unknown): void => {
    const { chatMessageId } = payload as { chatMessageId: string }
    void useChatStore.getState().acceptActions(chatMessageId)
  }, [])

  const handleTelegramReject = useCallback((payload: unknown): void => {
    const { chatMessageId } = payload as { chatMessageId: string }
    useChatStore.getState().rejectActions(chatMessageId)
  }, [])

  useEffect(() => {
    window.cortx.on('telegram:incoming', handleTelegramIncoming)
    window.cortx.on('telegram:triggerAccept', handleTelegramAccept)
    window.cortx.on('telegram:triggerReject', handleTelegramReject)

    return () => {
      window.cortx.off('telegram:incoming', handleTelegramIncoming)
      window.cortx.off('telegram:triggerAccept', handleTelegramAccept)
      window.cortx.off('telegram:triggerReject', handleTelegramReject)
    }
  }, [handleTelegramIncoming, handleTelegramAccept, handleTelegramReject])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const inInput = ['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName ?? '')
        || (e.target as HTMLElement)?.isContentEditable

      // Ctrl+K → command palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openCommandPalette()
        return
      }

      // Ctrl+/ → toggle theme
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setTheme(theme === 'dark' ? 'light' : 'dark')
        return
      }

      // Ctrl+Z → undo last agent commit (not in text inputs)
      if (!inInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const lastCommit = useChatStore.getState().lastExecutedCommit
        if (lastCommit) {
          e.preventDefault()
          window.cortx.agent.undo(lastCommit)
            .then(() => {
              useChatStore.setState({ lastExecutedCommit: null })
              addToast('Dernière action annulée', 'info')
            })
            .catch((err: unknown) => addToast(`Undo échoué : ${err}`, 'error'))
        }
        return
      }

    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [theme, setTheme, addToast, openCommandPalette])

  // Panel widths in pixels
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(340)
  const [rightWidth, setRightWidth] = useState(300)

  return (
    <div className="flex flex-col h-screen bg-cortx-bg overflow-hidden">
      {/* Update notification banner */}
      <UpdateBanner />

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
            title={t.appShell.openAgentPanel}
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

      {/* Create File Dialog */}
      <CreateFileDialog />

      {/* Command Palette */}
      <CommandPalette />
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
