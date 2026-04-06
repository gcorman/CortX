import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { useChatStore } from '../../stores/chatStore'
import { Brain, Sparkles } from 'lucide-react'

export function ChatView(): React.JSX.Element {
  const { messages, isProcessing, sendMessage } = useChatStore()
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
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cortx-accent animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-cortx-text-secondary">L'agent analyse...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isProcessing} />
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
