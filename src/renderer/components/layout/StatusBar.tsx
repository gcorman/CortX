import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, FileText, GitCommit, Settings } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useChatStore } from '../../stores/chatStore'

export function StatusBar(): React.JSX.Element {
  const toggleSettings = useUIStore((s) => s.toggleSettings)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const [fileCount, setFileCount] = useState(0)
  const [lastCommit, setLastCommit] = useState('Aucun commit')
  const [llmStatus, setLlmStatus] = useState<'configured' | 'unconfigured'>('unconfigured')
  const [progress, setProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(false)

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
        setLastCommit('Aucun commit')
      }
    } catch {
      setLastCommit('Aucun commit')
    }

    try {
      const config = await window.cortx.app.getConfig()
      if (config.llm.provider === 'anthropic' && config.llm.apiKey === '***') {
        setLlmStatus('configured')
      } else if (config.llm.provider === 'openai-compatible' && config.llm.baseUrl) {
        setLlmStatus('configured')
      } else {
        setLlmStatus('unconfigured')
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

  useEffect(() => {
    if (isProcessing) {
      setShowProgress(true)
      setProgress((p) => (p > 0 ? p : 0.05))
      const interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 0.92) return p
          const delta = p < 0.6 ? 0.03 : p < 0.8 ? 0.015 : 0.007
          return Math.min(0.92, p + delta)
        })
      }, 120)
      return () => clearInterval(interval)
    }

    if (!showProgress) return
    setProgress(1)
    const timeout = setTimeout(() => {
      setShowProgress(false)
      setProgress(0)
    }, 450)
    return () => clearTimeout(timeout)
  }, [isProcessing, showProgress])

  return (
    <div className="relative flex-shrink-0 h-7 bg-cortx-surface border-t border-cortx-border px-4 flex items-center justify-between text-2xs text-cortx-text-secondary font-mono">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* LLM Status */}
        <div className="flex items-center gap-1.5">
          {llmStatus === 'configured' ? (
            <>
              <Wifi size={11} className="text-cortx-success" />
              <span className="text-cortx-success">LLM connecte</span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-cortx-text-secondary" />
              <span>LLM non configure</span>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-cortx-border" />

        {/* File count */}
        <div className="flex items-center gap-1.5">
          <FileText size={11} />
          <span>{fileCount} fichier{fileCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Separator */}
        <div className="w-px h-3 bg-cortx-border" />

        {/* Last commit */}
        <div className="flex items-center gap-1.5">
          <GitCommit size={11} />
          <span className="truncate max-w-[200px]">{lastCommit}</span>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSettings}
          className="flex items-center gap-1.5 hover:text-cortx-text-primary transition-colors cursor-pointer p-0.5 rounded hover:bg-cortx-elevated"
        >
          <Settings size={11} />
          <span>Settings</span>
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
