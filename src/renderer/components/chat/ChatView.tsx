import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { useChatStore } from '../../stores/chatStore'
import { useUIStore } from '../../stores/uiStore'
import { Brain, Sparkles, FileText } from 'lucide-react'
import { useT } from '../../i18n'

export function ChatView(): React.JSX.Element {
  const { messages, isProcessing, sendMessage, importMarkdown, streamProgress } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [globalDragOver, setGlobalDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const t = useT()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Global drag & drop — listens on the whole ChatView container
  const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragCounterRef.current++
    setGlobalDragOver(true)
  }, [])

  const handleGlobalDragLeave = useCallback(() => {
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setGlobalDragOver(false)
    }
  }, [])

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
  }, [])

  const handleGlobalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setGlobalDragOver(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const file of droppedFiles) {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.md') && !name.endsWith('.txt')) continue
      try {
        const content = await file.text()
        await importMarkdown(file.name, content)
      } catch (err) {
        console.error('[ChatView] drop error:', err)
      }
    }
  }, [importMarkdown])

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {/* Global drag overlay */}
      {globalDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-cortx-accent/5 border-2 border-dashed border-cortx-accent/50 rounded-lg m-2" />
          <div className="relative flex flex-col items-center gap-3 bg-cortx-surface/95 border border-cortx-accent/40 rounded-xl px-8 py-6 shadow-2xl">
            <FileText size={32} className="text-cortx-accent" />
            <p className="text-sm font-medium text-cortx-text-primary">{t.chat.dropMd}</p>
            <p className="text-xs text-cortx-text-secondary">{t.chat.dropMdHint}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}

        {isProcessing && (
          streamProgress > 0 ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-xs text-cortx-text-secondary">{t.chat.writingResponse}</span>
              <ProgressRing progress={streamProgress} />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-cortx-text-secondary">{t.chat.agentAnalyzing}</span>
            </div>
          )
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onImportMarkdown={importMarkdown}
        disabled={isProcessing}
      />
    </div>
  )
}

function ProgressRing({ progress }: { progress: number }): React.JSX.Element {
  const size = 22
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, progress))
  const offset = circumference * (1 - clamped)
  const percent = Math.round(clamped * 100)

  return (
    <div className="relative w-[22px] h-[22px] flex items-center justify-center">
      <svg width={size} height={size} className="block">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="transparent"
          className="text-cortx-border/70"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          className="text-cortx-accent transition-[stroke-dashoffset] duration-200 ease-out"
        />
      </svg>
      <span className="absolute text-[9px] leading-none text-cortx-text-secondary font-mono">
        {percent}%
      </span>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  const t = useT()
  const language = useUIStore((s) => s.language)
  const examples = language === 'en'
    ? [
        'Lunch with Sophie Martin, she is leaving Thales for Dassault.',
        '/brief Sophie Martin',
        'Create a domain Industrial Cybersecurity'
      ]
    : [
        'Dejeuner avec Sophie Martin, elle quitte Thales pour Dassault.',
        '/brief Sophie Martin',
        'Cree un domaine Cybersecurite Industrielle'
      ]
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-full bg-cortx-accent/10 flex items-center justify-center mb-4">
        <Brain size={24} className="text-cortx-accent" />
      </div>
      <h3 className="text-sm font-semibold text-cortx-text-primary mb-2">{t.chat.welcome}</h3>
      <p className="text-xs text-cortx-text-secondary leading-relaxed max-w-[240px]">
        {t.chat.welcomeHint}
      </p>
      <div className="mt-4 space-y-1.5">
        {examples.map((example, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-2xs text-cortx-text-secondary/70 bg-cortx-bg/50 rounded px-2.5 py-1.5"
          >
            <Sparkles size={10} className="text-cortx-accent/50 flex-shrink-0" />
            <span className="truncate">{example}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
