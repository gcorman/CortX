import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, FileText, GitCommit, Settings } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'

export function StatusBar(): React.JSX.Element {
  const toggleSettings = useUIStore((s) => s.toggleSettings)
  const [fileCount, setFileCount] = useState(0)
  const [lastCommit, setLastCommit] = useState('Aucun commit')
  const [llmStatus, setLlmStatus] = useState<'configured' | 'unconfigured'>('unconfigured')

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

  return (
    <div className="flex-shrink-0 h-7 bg-cortx-surface border-t border-cortx-border px-4 flex items-center justify-between text-2xs text-cortx-text-secondary font-mono">
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
    </div>
  )
}
