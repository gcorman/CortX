import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, FileText, GitCommit, Settings, Brain, Lock } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useChatStore } from '../../stores/chatStore'
import { useIdleStore } from '../../stores/idleStore'
import { useT } from '../../i18n'

export function StatusBar(): React.JSX.Element {
  const toggleSettings = useUIStore((s) => s.toggleSettings)
  const streamProgress = useChatStore((s) => s.streamProgress)
  const streamActive = useChatStore((s) => s.streamActive)
  const t = useT()
  const [fileCount, setFileCount] = useState(0)
  const [lastCommit, setLastCommit] = useState('')
  const [llmStatus, setLlmStatus] = useState<'configured' | 'unconfigured'>('unconfigured')
  const [privacyMode, setPrivacyMode] = useState<'local' | 'remote'>('remote')

  const refresh = useCallback(async () => {
    try {
      const files = await window.cortx.db.getFiles()
      setFileCount(files.length)
    } catch {
      setFileCount(0)
    }

    try {
      const log = await window.cortx.git.log(1)
      if (log.length > 0) {
        const msg = log[0].message.length > 40
          ? log[0].message.slice(0, 40) + '...'
          : log[0].message
        setLastCommit(msg)
      } else {
        setLastCommit(t.statusBar.noCommit)
      }
    } catch {
      setLastCommit(t.statusBar.noCommit)
    }

    try {
      const config = await window.cortx.app.getConfig()
      const { provider, apiKey, baseUrl } = config.llm
      if (provider === 'anthropic' && apiKey === '***') {
        setLlmStatus('configured')
      } else if (provider === 'google-ai' && apiKey === '***') {
        setLlmStatus('configured')
      } else if (provider === 'openai-compatible' && baseUrl) {
        setLlmStatus('configured')
      } else {
        setLlmStatus('unconfigured')
      }

      // Privacy mode: local only when openai-compatible with localhost URL
      if (provider === 'openai-compatible') {
        const url = baseUrl || 'http://localhost:11434/v1'
        setPrivacyMode(/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url) ? 'local' : 'remote')
      } else {
        setPrivacyMode('remote')
      }
    } catch {
      setLlmStatus('unconfigured')
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  // Also refresh when settings close
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  useEffect(() => {
    if (!settingsOpen) {
      refresh()
    }
  }, [settingsOpen, refresh])

  const idleActive = useIdleStore((s) => s.isActive)
  const idlePhase = useIdleStore((s) => s.phase)

  const showProgress = streamActive || streamProgress > 0
  const clamped = Math.max(0, Math.min(1, streamProgress))
  const progress = showProgress ? clamped : 0

  return (
    <div className="relative flex-shrink-0 h-7 bg-cortx-surface border-t border-cortx-border px-4 flex items-center justify-between text-2xs text-cortx-text-secondary font-mono">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* LLM Status */}
        <div className="flex items-center gap-1.5">
          {llmStatus === 'configured' ? (
            <>
              <Wifi size={11} className="text-cortx-success" />
              <span className="text-cortx-success">{t.statusBar.llmConnected}</span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-cortx-text-secondary" />
              <span>{t.statusBar.llmNotConfigured}</span>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-cortx-border" />

        {/* Privacy mode */}
        <div
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium ${
            privacyMode === 'local'
              ? 'text-cortx-success'
              : 'text-amber-400'
          }`}
          title={privacyMode === 'local' ? t.statusBar.privacyLocal : t.statusBar.privacyRemote}
        >
          {privacyMode === 'local' ? <Lock size={10} /> : <Wifi size={10} />}
          <span>{privacyMode === 'local' ? t.statusBar.privacyLocal : t.statusBar.privacyRemote}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-cortx-border" />

        {/* File count */}
        <div className="flex items-center gap-1.5">
          <FileText size={11} />
          <span>{fileCount} {fileCount !== 1 ? t.statusBar.files : t.statusBar.file}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-cortx-border" />

        {/* Last commit */}
        <div className="flex items-center gap-1.5">
          <GitCommit size={11} />
          <span className="truncate max-w-[200px]">{lastCommit}</span>
        </div>

        {/* Idle indicator */}
        {idleActive && (
          <>
            <div className="w-px h-3 bg-cortx-border" />
            <div className="flex items-center gap-1.5 text-cortx-accent">
              <span
                className={`w-1.5 h-1.5 rounded-full bg-cortx-accent ${
                  idlePhase === 'thinking' || idlePhase === 'insight' ? 'animate-pulse' : ''
                }`}
              />
              <Brain size={10} />
              <span>
                {idlePhase === 'selecting' && t.statusBar.idleSelecting}
                {idlePhase === 'examining' && t.statusBar.idleExamining}
                {idlePhase === 'thinking' && t.statusBar.idleThinking}
                {idlePhase === 'insight' && t.statusBar.idleInsight}
                {idlePhase === 'resting' && t.statusBar.idleResting}
                {idlePhase === 'stopped' && t.statusBar.idle}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSettings}
          className="flex items-center gap-1.5 hover:text-cortx-text-primary transition-colors cursor-pointer p-0.5 rounded hover:bg-cortx-elevated"
        >
          <Settings size={11} />
          <span>{t.statusBar.settings}</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-0.5 bg-cortx-border/60 overflow-hidden">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-full bg-gradient-to-r from-cortx-cta/40 via-cortx-cta to-cortx-accent transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
          style={{
            width: `${Math.round(progress * 100)}%`,
            opacity: showProgress ? 1 : 0
          }}
        />
      </div>
    </div>
  )
}
