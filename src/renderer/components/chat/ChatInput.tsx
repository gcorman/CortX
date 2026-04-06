import { useState, useRef, useEffect } from 'react'
import { SendHorizontal, Slash } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }, [value])

  const handleSubmit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex-shrink-0 border-t border-cortx-border p-3">
      <div className="relative bg-cortx-bg rounded-card border border-cortx-border focus-within:border-cortx-accent transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Tape une info, pose une question, ou /commande..."
          rows={1}
          className="w-full bg-transparent text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 px-3 py-2.5 pr-10 resize-none focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="absolute right-2 bottom-2 p-1.5 rounded-md text-cortx-text-secondary hover:text-cortx-accent hover:bg-cortx-accent/10 disabled:opacity-30 disabled:hover:text-cortx-text-secondary disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Envoyer (Ctrl+Enter)"
        >
          <SendHorizontal size={16} />
        </button>
      </div>
      <div className="flex items-center gap-3 mt-1.5 px-1">
        <span className="text-2xs text-cortx-text-secondary/40 flex items-center gap-1">
          <Slash size={9} />
          ask, brief, undo, status, digest
        </span>
        <span className="text-2xs text-cortx-text-secondary/40 ml-auto">Ctrl+Enter</span>
      </div>
    </div>
  )
}
