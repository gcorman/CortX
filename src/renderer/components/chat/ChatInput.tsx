import { useState, useRef, useEffect, useCallback } from 'react'
import { SendHorizontal, Slash, AtSign, Plus, FileText, BookOpen } from 'lucide-react'
import { useFileStore } from '../../stores/fileStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useT } from '../../i18n'

interface ChatInputProps {
  onSend: (message: string) => void
  onImportMarkdown?: (filename: string, content: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, onImportMarkdown, disabled }: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const files = useFileStore((s) => s.files)
  const t = useT()

  // --- @mention state ---
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const libraryDocs = useLibraryStore((s) => s.documents)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }, [value])

  // Unified mention targets: KB files + indexed library documents
  type MentionTarget =
    | { kind: 'file'; path: string; title: string }
    | { kind: 'library'; id: string; title: string; filename: string }

  const mentionResults: MentionTarget[] = mentionQuery !== null
    ? [
        ...files
          .filter((f) => {
            const q = mentionQuery.toLowerCase()
            return (
              f.title.toLowerCase().includes(q) ||
              f.path.split('/').pop()?.replace('.md', '').toLowerCase().includes(q)
            )
          })
          .slice(0, 5)
          .map((f): MentionTarget => ({ kind: 'file', path: f.path, title: f.title })),
        ...libraryDocs
          .filter((d) => d.status === 'indexed' && (() => {
            const q = mentionQuery.toLowerCase()
            return (
              (d.title ?? '').toLowerCase().includes(q) ||
              d.filename.toLowerCase().includes(q)
            )
          })())
          .slice(0, 4)
          .map((d): MentionTarget => ({
            kind: 'library',
            id: d.id,
            title: d.title ?? d.filename,
            filename: d.filename
          }))
      ]
    : []

  // Parse text to detect an active @query at current cursor position
  function detectMention(text: string, cursor: number): { query: string; start: number } | null {
    const before = text.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const afterAt = before.slice(atIdx + 1)
    if (/[\s\n]/.test(afterAt)) return null
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

  function handleSelect(target: MentionTarget): void {
    if (mentionStart === -1) return
    const before = value.slice(0, mentionStart)
    const after = value.slice(mentionStart + 1 + (mentionQuery?.length ?? 0))
    // Library docs use a distinct marker so chatStore can read from the library API
    const inserted = target.kind === 'library'
      ? `@[lib:${target.id}|${target.title}]`
      : `@[${target.title}]`
    const newValue = before + inserted + after
    setValue(newValue)
    setMentionQuery(null)
    setMentionStart(-1)
    setMentionIndex(0)
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

  // --- Markdown import via button ---
  async function handleImportClick(): Promise<void> {
    if (disabled) return
    try {
      const result = await window.cortx.files.openMarkdownDialog()
      if (result && onImportMarkdown) {
        onImportMarkdown(result.filename, result.content)
      }
    } catch (err) {
      console.error('[ChatInput] openMarkdownDialog error:', err)
    }
  }

  // --- Drag & drop on the chat input zone ---
  function handleDragOver(e: React.DragEvent): void {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files')
    if (!hasFiles) return
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent): void {
    // Only clear if leaving the actual drop zone, not child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation() // Prevent ChatView from also handling the same drop
    setIsDragOver(false)
    if (!onImportMarkdown || disabled) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const file of droppedFiles) {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.md') && !name.endsWith('.txt')) continue
      try {
        const content = await file.text()
        onImportMarkdown(file.name, content)
      } catch (err) {
        console.error('[ChatInput] file read error:', err)
      }
    }
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
    <div
      className={`flex-shrink-0 border-t transition-colors duration-150 p-3 ${
        isDragOver ? 'border-cortx-accent bg-cortx-accent/5' : 'border-cortx-border'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay hint */}
      {isDragOver && (
        <div className="absolute inset-x-3 -top-12 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-cortx-accent/15 border border-cortx-accent/40 rounded-card px-4 py-2">
            <FileText size={14} className="text-cortx-accent" />
            <span className="text-xs text-cortx-accent font-medium">{t.chat.dropToAnalyze}</span>
          </div>
        </div>
      )}

      <div className="relative">
        {/* @mention dropdown */}
        {showDropdown && (
          <ul
            ref={dropdownRef}
            className="absolute bottom-full mb-1 left-0 right-0 bg-cortx-surface border border-cortx-border rounded-card shadow-xl z-50 max-h-52 overflow-y-auto"
          >
            {mentionResults.map((target, i) => (
              <li key={target.kind === 'file' ? target.path : target.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(target) }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                    i === mentionIndex
                      ? 'bg-cortx-accent/15 text-cortx-text-primary'
                      : 'hover:bg-cortx-elevated text-cortx-text-secondary'
                  }`}
                >
                  {target.kind === 'library'
                    ? <BookOpen size={11} className="flex-shrink-0 text-amber-400" />
                    : <AtSign size={11} className="flex-shrink-0 text-cortx-accent" />
                  }
                  <span className="text-xs font-medium truncate">{target.title}</span>
                  {target.kind === 'library'
                    ? <span className="text-2xs text-amber-400/60 flex-shrink-0 ml-auto">{t.chat.readOnly}</span>
                    : <span className="text-2xs text-cortx-text-secondary/40 truncate ml-auto">{target.path}</span>
                  }
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={`bg-cortx-bg rounded-card border transition-colors ${isDragOver ? 'border-cortx-accent' : 'border-cortx-border focus-within:border-cortx-accent'}`}>
          <div className="flex items-end gap-1 px-2 pb-1 pt-1">
            {/* + button for .md import */}
            <button
              type="button"
              onClick={handleImportClick}
              disabled={disabled}
              title={t.chat.importMd}
              className="flex-shrink-0 p-1.5 rounded-md text-cortx-text-secondary hover:text-cortx-accent hover:bg-cortx-accent/10 disabled:opacity-30 disabled:hover:text-cortx-text-secondary disabled:hover:bg-transparent transition-colors cursor-pointer mb-0.5"
            >
              <Plus size={15} />
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={t.chat.placeholder}
              rows={1}
              className="flex-1 bg-transparent text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 py-2 resize-none focus:outline-none disabled:opacity-50"
            />

            <button
              onClick={handleSubmit}
              disabled={disabled || !value.trim()}
              className="flex-shrink-0 p-1.5 rounded-md text-cortx-text-secondary hover:text-cortx-accent hover:bg-cortx-accent/10 disabled:opacity-30 disabled:hover:text-cortx-text-secondary disabled:hover:bg-transparent transition-colors cursor-pointer mb-0.5"
              title={t.chat.sendTooltip}
            >
              <SendHorizontal size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-1.5 px-1">
        <span className="text-2xs text-cortx-text-secondary/40 flex items-center gap-1">
          <Slash size={9} />
          {t.chat.commands}
        </span>
        <span className="text-2xs text-cortx-text-secondary/40 flex items-center gap-1">
          <AtSign size={9} />
          {t.chat.citeFile}
        </span>
        <span className="text-2xs text-cortx-text-secondary/40 flex items-center gap-1">
          <Plus size={9} />
          {t.chat.importMdShort}
        </span>
        <span className="text-2xs text-cortx-text-secondary/40 ml-auto">{t.chat.ctrlEnter}</span>
      </div>
    </div>
  )
}
