import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { SendHorizontal, Slash, AtSign, Plus, FileText, BookOpen, Globe, X, Loader2, Square } from 'lucide-react'
import { useFileStore } from '../../stores/fileStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n'

const SLASH_COMMANDS = [
  { cmd: 'ask',      args: '<question>',  fr: 'Question sur la base',    en: 'Ask about knowledge base' },
  { cmd: 'brief',    args: '<sujet>',     fr: 'Briefing structuré',       en: 'Structured briefing' },
  { cmd: 'synthese', args: '<sujet>',     fr: 'Synthèse approfondie',     en: 'In-depth synthesis' },
  { cmd: 'status',   args: '',            fr: 'Statut de la base',        en: 'Knowledge base status' },
  { cmd: 'digest',   args: '',            fr: 'Digest des activités',     en: 'Activity digest' },
  { cmd: 'wiki',     args: '<topic>',     fr: 'Article Wikipédia',        en: 'Wikipedia article' },
  { cmd: 'internet', args: '[url|query]', fr: 'Recherche web / URL',      en: 'Web search or URL fetch' },
]

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  disabled: boolean
}

export function ChatInput({ onSend, onStop, disabled }: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [webPreview, setWebPreview] = useState<string | null>(null)
  const [isFetchingPreview, setIsFetchingPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const files = useFileStore((s) => s.files)
  const setChatFocusedTitles = useUIStore((s) => s.setChatFocusedTitles)
  const showMdImportModal = useUIStore((s) => s.showMdImportModal)
  const t = useT()

  const language = useUIStore((s) => s.language)

  // --- @mention state ---
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const libraryDocs = useLibraryStore((s) => s.documents)

  // --- /slash command state ---
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashStart, setSlashStart] = useState(-1)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashDropdownRef = useRef<HTMLUListElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }, [value])

  // Titles to highlight in the graph: locked @[Title] mentions + current typing query
  const chatFocusedTitles = useMemo(() => {
    const locked = [...value.matchAll(/@\[([^\]|]+?)(?:\|[^\]]*)?\]/g)].map((m) => m[1])
    return mentionQuery !== null && mentionQuery.length > 0
      ? [...locked, mentionQuery]
      : locked
  }, [value, mentionQuery])

  useEffect(() => {
    setChatFocusedTitles(chatFocusedTitles)
  }, [chatFocusedTitles, setChatFocusedTitles])

  // Clear graph focus when this input is destroyed (e.g. chat panel hidden)
  useEffect(() => () => setChatFocusedTitles([]), [setChatFocusedTitles])

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

  const slashResults = slashQuery !== null
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(slashQuery.toLowerCase()))
    : []

  function detectSlash(text: string, cursor: number): { query: string; start: number } | null {
    const before = text.slice(0, cursor)
    const slashIdx = before.lastIndexOf('/')
    if (slashIdx === -1) return null
    if (slashIdx > 0 && !/[\s\n]/.test(before[slashIdx - 1])) return null
    const afterSlash = before.slice(slashIdx + 1)
    if (/[\s\n]/.test(afterSlash)) return null
    return { query: afterSlash, start: slashIdx }
  }

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

    const slash = detectSlash(newValue, cursor)
    if (slash) {
      setSlashQuery(slash.query)
      setSlashStart(slash.start)
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionStart(-1)
      return
    }
    setSlashQuery(null)
    setSlashStart(-1)

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

  function handleSlashSelect(cmd: typeof SLASH_COMMANDS[number]): void {
    if (slashStart === -1) return
    const before = value.slice(0, slashStart)
    const after = value.slice(slashStart + 1 + (slashQuery?.length ?? 0))
    const inserted = cmd.args ? `/${cmd.cmd} ` : `/${cmd.cmd} `
    const newValue = before + inserted + after
    setValue(newValue)
    setSlashQuery(null)
    setSlashStart(-1)
    setSlashIndex(0)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        const pos = before.length + inserted.length
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
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
    if (slashQuery !== null && slashResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => (i + 1) % slashResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        handleSlashSelect(slashResults[slashIndex])
        return
      }
      if (e.key === 'Escape') {
        setSlashQuery(null)
        setSlashStart(-1)
        return
      }
    }

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
  }, [slashQuery, slashResults, slashIndex, mentionQuery, mentionResults, mentionIndex, value]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(): void {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    setWebPreview(null)
    setMentionQuery(null)
    setMentionStart(-1)
    setSlashQuery(null)
    setSlashStart(-1)
    setChatFocusedTitles([])
  }

  const hasWebDirective = /\/wiki\s+\S|\/internet/i.test(value)

  async function handleWebPreview(): Promise<void> {
    if (isFetchingPreview || !value.trim()) return
    setIsFetchingPreview(true)
    setWebPreview(null)
    try {
      const result = await window.cortx.agent.previewWebContext(value)
      setWebPreview(result || '(aucun contenu récupéré)')
    } catch (err) {
      setWebPreview(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    }
    setIsFetchingPreview(false)
  }

  // --- Markdown import via button ---
  async function handleImportClick(): Promise<void> {
    if (disabled) return
    try {
      const result = await window.cortx.files.openMarkdownDialog()
      if (result) {
        showMdImportModal({
          filename: result.filename,
          content: result.content,
          absolutePath: result.path || ''
        })
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
    if (disabled) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    for (const file of droppedFiles) {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.md') && !name.endsWith('.txt')) continue
      try {
        const content = await file.text()
        const absolutePath = (file as File & { path?: string }).path || ''
        showMdImportModal({ filename: file.name, content, absolutePath })
      } catch (err) {
        console.error('[ChatInput] file read error:', err)
      }
    }
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null)
        setMentionStart(-1)
      }
      if (slashDropdownRef.current && !slashDropdownRef.current.contains(e.target as Node)) {
        setSlashQuery(null)
        setSlashStart(-1)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Scroll selected mention item into view
  useEffect(() => {
    const list = dropdownRef.current
    if (!list) return
    const item = list.children[mentionIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [mentionIndex])

  // Scroll selected slash item into view
  useEffect(() => {
    const list = slashDropdownRef.current
    if (!list) return
    const item = list.children[slashIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [slashIndex])

  const showDropdown = mentionQuery !== null && mentionResults.length > 0
  const showSlashDropdown = slashQuery !== null && slashResults.length > 0

  return (
    <div
      className={`flex-shrink-0 border-t transition-colors duration-150 p-3 ${
        isDragOver ? 'border-cortx-accent bg-cortx-accent/5' : 'border-cortx-border'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Web context preview panel */}
      {webPreview && (
        <div className="mb-2 rounded-card border border-cortx-border bg-cortx-surface text-xs overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-cortx-border bg-cortx-elevated/60">
            <Globe size={11} className="text-cortx-accent flex-shrink-0" />
            <span className="text-cortx-text-secondary font-medium flex-1">Aperçu sources web</span>
            <button type="button" onClick={() => setWebPreview(null)} className="text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer">
              <X size={11} />
            </button>
          </div>
          <pre className="px-3 py-2 text-2xs text-cortx-text-secondary/70 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed font-mono">
            {webPreview.slice(0, 1200)}{webPreview.length > 1200 ? '\n…(tronqué)' : ''}
          </pre>
        </div>
      )}

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
        {/* /slash command dropdown */}
        {showSlashDropdown && (
          <ul
            ref={slashDropdownRef}
            className="absolute bottom-full mb-1 left-0 right-0 bg-cortx-surface border border-cortx-border rounded-card shadow-xl z-50 max-h-52 overflow-y-auto"
          >
            {slashResults.map((cmd, i) => (
              <li key={cmd.cmd}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSlashSelect(cmd) }}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                    i === slashIndex
                      ? 'bg-cortx-accent/15 text-cortx-text-primary'
                      : 'hover:bg-cortx-elevated text-cortx-text-secondary'
                  }`}
                >
                  <Slash size={11} className="flex-shrink-0 text-cortx-accent" />
                  <span className="text-xs font-medium font-mono text-cortx-accent">{cmd.cmd}</span>
                  {cmd.args && (
                    <span className="text-2xs text-cortx-text-secondary/50 font-mono">{cmd.args}</span>
                  )}
                  <span className="text-2xs text-cortx-text-secondary/40 truncate ml-auto">
                    {language === 'fr' ? cmd.fr : cmd.en}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

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

            {disabled ? (
              <button
                type="button"
                onClick={onStop}
                className="flex-shrink-0 p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors cursor-pointer mb-0.5"
                title="Arrêter la génération"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                className="flex-shrink-0 p-1.5 rounded-md text-cortx-text-secondary hover:text-cortx-accent hover:bg-cortx-accent/10 disabled:opacity-30 disabled:hover:text-cortx-text-secondary disabled:hover:bg-transparent transition-colors cursor-pointer mb-0.5"
                title={t.chat.sendTooltip}
              >
                <SendHorizontal size={16} />
              </button>
            )}
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
        {hasWebDirective && (
          <button
            type="button"
            onClick={() => void handleWebPreview()}
            disabled={isFetchingPreview || disabled}
            className="flex items-center gap-1 text-2xs text-cortx-accent hover:text-cortx-accent/80 disabled:opacity-50 cursor-pointer transition-opacity"
          >
            {isFetchingPreview
              ? <Loader2 size={9} className="animate-spin" />
              : <Globe size={9} />}
            {isFetchingPreview ? 'Chargement…' : 'Aperçu web'}
          </button>
        )}
        <span className="text-2xs text-cortx-text-secondary/40 ml-auto">{t.chat.ctrlEnter}</span>
      </div>
    </div>
  )
}
