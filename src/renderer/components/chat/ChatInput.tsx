import { useState, useRef, useEffect, useCallback } from 'react'
import { SendHorizontal, Slash, AtSign } from 'lucide-react'
import { useFileStore } from '../../stores/fileStore'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const files = useFileStore((s) => s.files)

  // --- @mention state ---
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)
  const dropdownRef = useRef<HTMLUListElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }, [value])

  // Filter files matching the current @query
  const mentionResults = mentionQuery !== null
    ? files
        .filter((f) => {
          const q = mentionQuery.toLowerCase()
          return (
            f.title.toLowerCase().includes(q) ||
            f.path.split('/').pop()?.replace('.md', '').toLowerCase().includes(q)
          )
        })
        .slice(0, 8)
    : []

  // Parse text to detect an active @query at current cursor position
  function detectMention(text: string, cursor: number): { query: string; start: number } | null {
    const before = text.slice(0, cursor)
    // Find the last @ that isn't inside a @[...] already-completed mention
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const afterAt = before.slice(atIdx + 1)
    // If there's a space/newline after the @ it's not an active query
    if (/[\s\n]/.test(afterAt)) return null
    // If the @ is inside a completed @[...] mention, ignore
    if (afterAt.startsWith('[')) return null
    return { query: afterAt, start: atIdx }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const newValue = e.target.value
    setValue(newValue)
    const cursor = e.target.selectionStart ?? newValue.length
    const mention = detectMention(newValue, cursor)
    if (mention) {
      setMentionQuery(mention.query)
      setMentionStart(mention.start)
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionStart(-1)
    }
  }

  function handleSelect(file: { path: string; title: string }): void {
    if (mentionStart === -1) return
    // Replace "@query" with "@[Title]" — brackets make parsing unambiguous
    const before = value.slice(0, mentionStart)
    const after = value.slice(mentionStart + 1 + (mentionQuery?.length ?? 0))
    const inserted = `@[${file.title}]`
    const newValue = before + inserted + after
    setValue(newValue)
    setMentionQuery(null)
    setMentionStart(-1)
    setMentionIndex(0)
    // Restore focus
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        const pos = before.length + inserted.length
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        handleSelect(mentionResults[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        setMentionStart(-1)
        return
      }
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [mentionQuery, mentionResults, mentionIndex, value]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(): void {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    setMentionQuery(null)
    setMentionStart(-1)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null)
        setMentionStart(-1)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    const list = dropdownRef.current
    if (!list) return
    const item = list.children[mentionIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [mentionIndex])

  const showDropdown = mentionQuery !== null && mentionResults.length > 0

  return (
    <div className="flex-shrink-0 border-t border-cortx-border p-3">
      <div className="relative">
        {/* @mention dropdown — rendered above the input */}
        {showDropdown && (
          <ul
            ref={dropdownRef}
            className="absolute bottom-full mb-1 left-0 right-0 bg-cortx-surface border border-cortx-border rounded-card shadow-xl z-50 max-h-52 overflow-y-auto"
          >
            {mentionResults.map((f, i) => (
              <li key={f.path}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(f) }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                    i === mentionIndex
                      ? 'bg-cortx-accent/15 text-cortx-text-primary'
                      : 'hover:bg-cortx-elevated text-cortx-text-secondary'
                  }`}
                >
                  <AtSign size={11} className="flex-shrink-0 text-cortx-accent" />
                  <span className="text-xs font-medium truncate">{f.title}</span>
                  <span className="text-2xs text-cortx-text-secondary/40 truncate ml-auto">{f.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="bg-cortx-bg rounded-card border border-cortx-border focus-within:border-cortx-accent transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Tape une info, pose une question, ou /commande... (@fichier pour citer)"
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
      </div>

      <div className="flex items-center gap-3 mt-1.5 px-1">
        <span className="text-2xs text-cortx-text-secondary/40 flex items-center gap-1">
          <Slash size={9} />
          ask, brief, undo, status, digest
        </span>
        <span className="text-2xs text-cortx-text-secondary/40 flex items-center gap-1">
          <AtSign size={9} />
          citer un fichier
        </span>
        <span className="text-2xs text-cortx-text-secondary/40 ml-auto">Ctrl+Enter</span>
      </div>
    </div>
  )
}
