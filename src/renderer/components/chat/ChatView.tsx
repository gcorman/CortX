import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { useChatStore } from '../../stores/chatStore'
import { Brain, Sparkles } from 'lucide-react'

export function ChatView(): React.JSX.Element {
  const { messages, isProcessing, sendMessage, streamProgress } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex-1 flex flex-col min-h-0">
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
              <span className="text-xs text-cortx-text-secondary">Rédaction de la réponse</span>
              <ProgressRing progress={streamProgress} />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-cortx-text-secondary">L'agent analyse...</span>
            </div>
          )
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isProcessing} />
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
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-full bg-cortx-accent/10 flex items-center justify-center mb-4">
        <Brain size={24} className="text-cortx-accent" />
      </div>
      <h3 className="text-sm font-semibold text-cortx-text-primary mb-2">Bienvenue dans CortX</h3>
      <p className="text-xs text-cortx-text-secondary leading-relaxed max-w-[240px]">
        Tape une info, pose une question, ou utilise une commande pour commencer.
      </p>
      <div className="mt-4 space-y-1.5">
        {[
          'Dejeuner avec Sophie Martin, elle quitte Thales pour Dassault.',
          '/brief Sophie Martin',
          'Cree un domaine Cybersecurite Industrielle'
        ].map((example, i) => (
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
