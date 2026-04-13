import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Pencil, Save, RotateCcw, Trash2, RefreshCw, Lock, Network } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useUIStore } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'
import { useFileStore } from '../../stores/fileStore'
import { useT } from '../../i18n'
import type { FileContent, CortxFile } from '../../../shared/types'

type TitleSource = 'frontmatter' | 'h1' | 'filename'

function computeEffectiveTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string
): { title: string; source: TitleSource } {
  if (frontmatter.title) return { title: String(frontmatter.title), source: 'frontmatter' }
  const h1 = body.match(/^#\s+(.+)$/m)
  if (h1) return { title: h1[1].trim(), source: 'h1' }
  return { title: filePath.split('/').pop()?.replace('.md', '') || filePath, source: 'filename' }
}

/** Parse frontmatter title + body from a raw markdown string (draft). */
function parseDraftForTitle(raw: string): { fmTitle?: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (match) {
    const titleMatch = match[1].match(/^title:\s*(.+)$/m)
    return {
      fmTitle: titleMatch ? titleMatch[1].trim().replace(/^['"]|['"]$/g, '') : undefined,
      body: match[2]
    }
  }
  return { body: raw }
}

interface FilePreviewProps {
  path: string
  onClose: () => void
}

export function FilePreview({ path, onClose }: FilePreviewProps): React.JSX.Element {
  const [content, setContent] = useState<FileContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isRewriting, setIsRewriting] = useState(false)
  const [rewriteUndo, setRewriteUndo] = useState<{ commitHash: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // --- Title editing ---
  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  // --- [[ wikilink autocomplete ---
  const [wikilinkQuery, setWikilinkQuery] = useState<string | null>(null)
  const [wikilinkStart, setWikilinkStart] = useState(-1)
  const [wikilinkIndex, setWikilinkIndex] = useState(0)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const wikilinkDropRef = useRef<HTMLUListElement>(null)

  const addToast = useUIStore((s) => s.addToast)
  const reloadGraph = useGraphStore((s) => s.loadGraph)
  const reloadFiles = useFileStore((s) => s.loadFiles)
  const allFiles = useFileStore((s) => s.files)
  const t = useT()

  const wikilinkResults: CortxFile[] = wikilinkQuery !== null
    ? allFiles
        .filter((f) => {
          const q = wikilinkQuery.toLowerCase()
          const name = f.path.split('/').pop()?.replace('.md', '') ?? ''
          return f.title.toLowerCase().includes(q) || name.toLowerCase().includes(q)
        })
        .slice(0, 8)
    : []

  function detectWikilink(text: string, cursor: number): { query: string; start: number } | null {
    const before = text.slice(0, cursor)
    const idx = before.lastIndexOf('[[')
    if (idx === -1) return null
    const afterOpen = before.slice(idx + 2)
    // Cancel if there's already a closing bracket or a newline
    if (afterOpen.includes(']') || afterOpen.includes('\n')) return null
    return { query: afterOpen, start: idx }
  }

  function handleWikilinkSelect(file: CortxFile): void {
    if (wikilinkStart === -1) return
    const before = draft.slice(0, wikilinkStart)
    const after = draft.slice(wikilinkStart + 2 + (wikilinkQuery?.length ?? 0))
    const inserted = `[[${file.title}]]`
    setDraft(before + inserted + after)
    setWikilinkQuery(null)
    setWikilinkStart(-1)
    setWikilinkIndex(0)
    setTimeout(() => {
      const ta = editorRef.current
      if (ta) {
        const pos = before.length + inserted.length
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  // Scroll selected wikilink item into view
  useEffect(() => {
    const list = wikilinkDropRef.current
    if (!list) return
    const item = list.children[wikilinkIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [wikilinkIndex])

  const loadFile = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const result = await window.cortx.files.read(path)
      setContent(result)
      setDraft(result?.raw || '')
      // Initialize edited title with the current filename
      const fileName = path.split('/').pop()?.replace('.md', '') ?? path
      setEditedTitle(fileName)
    } catch {
      setContent(null)
    }
    setIsLoading(false)
  }, [path])

  useEffect(() => {
    loadFile()
    setIsEditing(false)
  }, [loadFile])

  // Close on Escape (only when not editing — Escape in edit mode cancels edit)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false)
          setDraft(content?.raw || '')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, isEditing, content])

  async function handleSave(): Promise<void> {
    if (isSaving) return
    setIsSaving(true)
    try {
      await window.cortx.agent.saveManualEdit(path, draft)
      addToast(t.filePreview.saved, 'success')
      setIsEditing(false)
      // Reload everything that depends on this file
      await loadFile()
      reloadGraph()
      reloadFiles()
    } catch (err) {
      console.error('[FilePreview] save failed', err)
      addToast(t.filePreview.saveError, 'error')
    }
    setIsSaving(false)
  }

  function handleCancel(): void {
    setDraft(content?.raw || '')
    setIsEditing(false)
  }

  function handleEnterEdit(): void {
    setDraft(content?.raw || '')
    setIsEditing(true)
  }

  async function handleRewrite(): Promise<void> {
    if (isRewriting) return
    setIsRewriting(true)
    try {
      const commitHash = await window.cortx.agent.rewriteFile(path)
      setRewriteUndo({ commitHash })
      await loadFile()
      reloadGraph()
      setTimeout(() => setRewriteUndo(null), 8000)
    } catch (err) {
      console.error('[FilePreview] rewrite failed', err)
      addToast(t.filePreview.rewriteError, 'error')
    } finally {
      setIsRewriting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await window.cortx.agent.deleteFile(path)
      addToast(t.filePreview.deleted, 'info')
      await Promise.all([reloadGraph(), reloadFiles()])
      onClose()
    } catch (err) {
      console.error('[FilePreview] delete failed', err)
      addToast(t.filePreview.deleteError, 'error')
      setConfirmDelete(false)
    }
  }

  async function handleSaveTitle(): Promise<void> {
    const fileName = path.split('/').pop()?.replace('.md', '') || path
    if (editedTitle.trim() === fileName || !editedTitle.trim()) {
      setIsTitleEditing(false)
      setEditedTitle(fileName)
      return
    }

    setIsSavingTitle(true)
    try {
      const result = await window.cortx.files.updateTitle(path, editedTitle)
      addToast(t.filePreview.titleUpdatedWithLinks(result.updatedLinks), 'success')
      await loadFile()
      setIsTitleEditing(false)
      reloadGraph()
      reloadFiles()
    } catch (err) {
      console.error('[FilePreview] title update failed', err)
      addToast(t.filePreview.titleError, 'error')
      const fileName = path.split('/').pop()?.replace('.md', '') || path
      setEditedTitle(fileName)
      setIsTitleEditing(false)
    }
    setIsSavingTitle(false)
  }

  const fileName = path.split('/').pop() || path
  // Detect if this is a library file (no valid KB entity type)
  const isLibraryFile =
    !content?.frontmatter?.type ||
    !['personne', 'entreprise', 'domaine', 'projet', 'journal', 'note', 'fiche'].includes(
      String(content?.frontmatter?.type)
    )

  return (
    <div className="absolute inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-cortx-bg/80 backdrop-blur-sm"
        onClick={() => {
          if (!isEditing) onClose()
        }}
      />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl bg-cortx-surface border-l border-cortx-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cortx-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isTitleEditing && !isLibraryFile ? (
              <input
                autoFocus
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleSaveTitle()
                  }
                  if (e.key === 'Escape') {
                    setIsTitleEditing(false)
                    const fileName = path.split('/').pop()?.replace('.md', '') || path
                    setEditedTitle(fileName)
                  }
                }}
                onBlur={() => void handleSaveTitle()}
                className="flex-1 text-sm font-semibold bg-cortx-bg border border-cortx-accent rounded px-2 py-1 text-cortx-text-primary focus:outline-none"
                disabled={isSavingTitle}
              />
            ) : (
              <>
                <h3
                  className={`text-sm font-semibold truncate ${
                    !isLibraryFile
                      ? 'text-cortx-text-primary cursor-pointer hover:text-cortx-accent transition-colors'
                      : 'text-cortx-text-primary'
                  }`}
                  onClick={() => !isLibraryFile && setIsTitleEditing(true)}
                >
                  {fileName}
                </h3>
                {isLibraryFile && (
                  <Lock size={14} className="flex-shrink-0 text-cortx-text-secondary/50" title={t.filePreview.libraryReadOnly} />
                )}
              </>
            )}
            <span className="text-2xs text-cortx-text-secondary font-mono truncate">{path}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isEditing && content && (
              <>
                <button
                  onClick={handleRewrite}
                  disabled={isRewriting}
                  className="p-1.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-accent transition-colors cursor-pointer disabled:opacity-40"
                  title={t.filePreview.rewrite}
                >
                  <RefreshCw size={14} className={isRewriting ? 'animate-spin' : ''} />
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-cortx-text-secondary hover:text-red-400 transition-colors cursor-pointer"
                    title={t.filePreview.delete}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded px-2 py-0.5">
                    <span className="text-2xs text-red-400">{t.filePreview.deleteConfirm}</span>
                    <button
                      onClick={() => void handleDelete()}
                      className="text-2xs text-red-400 hover:text-red-300 font-medium cursor-pointer transition-colors"
                    >
                      {t.filePreview.yes}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-2xs text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer transition-colors"
                    >
                      {t.filePreview.no}
                    </button>
                  </div>
                )}
                <button
                  onClick={handleEnterEdit}
                  className="p-1.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-accent transition-colors cursor-pointer"
                  title={t.filePreview.edit}
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || draft === content?.raw}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-cortx-success/15 text-cortx-success hover:bg-cortx-success/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title={t.filePreview.saveShortcut}
                >
                  <Save size={12} />
                  {isSaving ? t.filePreview.saving : t.filePreview.save}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
                  title={t.filePreview.cancelShortcut}
                >
                  <RotateCcw size={12} />
                  {t.filePreview.cancel}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              disabled={isEditing && draft !== content?.raw}
              className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={isEditing && draft !== content?.raw ? t.filePreview.unsavedWarning : t.filePreview.close}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Rewrite undo bar */}
        {rewriteUndo && (
          <div className="flex items-center justify-between px-4 py-2 bg-cortx-accent/10 border-b border-cortx-accent/20 flex-shrink-0">
            <span className="text-xs text-cortx-text-primary">{t.filePreview.rewritten}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    await window.cortx.agent.undo(rewriteUndo.commitHash)
                    setRewriteUndo(null)
                    await loadFile()
                    reloadGraph()
                    addToast(t.filePreview.undone, 'info')
                  } catch {
                    addToast(t.filePreview.undoError, 'error')
                  }
                }}
                className="text-xs text-cortx-accent hover:text-cortx-accent-light cursor-pointer transition-colors"
              >
                {t.filePreview.cancel}
              </button>
              <button
                onClick={() => setRewriteUndo(null)}
                className="text-xs text-cortx-text-secondary/50 hover:text-cortx-text-primary cursor-pointer"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-cortx-text-secondary text-sm">
              {t.filePreview.loading}
            </div>
          ) : content ? (
            isEditing ? (
              <div className="relative flex flex-col h-full min-h-[60vh]">
                {/* Graph title info bar */}
                {(() => {
                  const { fmTitle, body } = parseDraftForTitle(draft)
                  const fm = fmTitle ? { title: fmTitle } : {}
                  const { title: gTitle, source: gSource } = computeEffectiveTitle(fm, body, path)
                  const sourceLabel = gSource === 'frontmatter'
                    ? t.filePreview.graphTitleFromFrontmatter
                    : gSource === 'h1'
                      ? t.filePreview.graphTitleFromH1
                      : t.filePreview.graphTitleFromFilename
                  return (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-cortx-border bg-cortx-elevated/50 flex-shrink-0">
                      <Network size={11} className="text-cortx-accent flex-shrink-0" />
                      <span className="text-2xs text-cortx-text-secondary">{t.filePreview.graphTitleLabel} :</span>
                      <span className="text-2xs font-medium text-cortx-text-primary truncate">{gTitle}</span>
                      <span className="text-2xs text-cortx-text-secondary/50 flex-shrink-0">({sourceLabel})</span>
                    </div>
                  )
                })()}
                {/* [[ wikilink autocomplete dropdown */}
                {wikilinkQuery !== null && wikilinkResults.length > 0 && (
                  <ul
                    ref={wikilinkDropRef}
                    className="absolute top-2 left-2 right-2 z-50 bg-cortx-surface border border-cortx-border rounded-card shadow-xl max-h-48 overflow-y-auto"
                  >
                    {wikilinkResults.map((f, i) => (
                      <li key={f.path}>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleWikilinkSelect(f) }}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                            i === wikilinkIndex
                              ? 'bg-cortx-accent/15 text-cortx-text-primary'
                              : 'hover:bg-cortx-elevated text-cortx-text-secondary'
                          }`}
                        >
                          <span className="text-xs text-cortx-accent font-mono flex-shrink-0">[[</span>
                          <span className="text-xs font-medium truncate">{f.title}</span>
                          <span className="text-2xs text-cortx-text-secondary/40 truncate ml-auto">{f.path}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  ref={editorRef}
                  value={draft}
                  onChange={(e) => {
                    const val = e.target.value
                    setDraft(val)
                    const cursor = e.target.selectionStart ?? val.length
                    const wl = detectWikilink(val, cursor)
                    if (wl) {
                      setWikilinkQuery(wl.query)
                      setWikilinkStart(wl.start)
                      setWikilinkIndex(0)
                    } else {
                      setWikilinkQuery(null)
                      setWikilinkStart(-1)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (wikilinkQuery !== null && wikilinkResults.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setWikilinkIndex((i) => (i + 1) % wikilinkResults.length); return }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setWikilinkIndex((i) => (i - 1 + wikilinkResults.length) % wikilinkResults.length); return }
                      if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); handleWikilinkSelect(wikilinkResults[wikilinkIndex]); return }
                      if (e.key === 'Escape') { setWikilinkQuery(null); setWikilinkStart(-1); return }
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                      e.preventDefault()
                      void handleSave()
                    }
                  }}
                  spellCheck={false}
                  className="flex-1 bg-cortx-bg text-cortx-text-primary text-sm font-mono p-4 resize-none focus:outline-none border-0 min-h-[60vh]"
                  placeholder={t.filePreview.placeholder}
                />
              </div>
            ) : (
              <div className="p-6">
                {/* Frontmatter badges */}
                {content.frontmatter && (
                  <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-cortx-border">
                    {content.frontmatter.type && (
                      <span className="text-2xs px-2 py-0.5 rounded-full bg-cortx-accent/10 text-cortx-accent capitalize">
                        {String(content.frontmatter.type)}
                      </span>
                    )}
                    {content.frontmatter.status && (
                      <span className="text-2xs px-2 py-0.5 rounded-full bg-cortx-elevated text-cortx-text-secondary">
                        {String(content.frontmatter.status)}
                      </span>
                    )}
                    {Array.isArray(content.frontmatter.tags) &&
                      (content.frontmatter.tags as string[]).map((tag) => (
                        <span key={tag} className="text-2xs px-2 py-0.5 rounded-full bg-cortx-surface text-cortx-text-secondary">
                          #{tag}
                        </span>
                      ))}
                    {/* Graph title indicator */}
                    {!isLibraryFile && (() => {
                      const { title: gTitle, source: gSource } = computeEffectiveTitle(content.frontmatter, content.body, path)
                      const sourceLabel = gSource === 'frontmatter'
                        ? t.filePreview.graphTitleFromFrontmatter
                        : gSource === 'h1'
                          ? t.filePreview.graphTitleFromH1
                          : t.filePreview.graphTitleFromFilename
                      return (
                        <span
                          className="flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-cortx-accent/5 border border-cortx-accent/20 text-cortx-accent/80"
                          title={`${t.filePreview.graphTitleLabel} (${sourceLabel})`}
                        >
                          <Network size={9} />
                          {gTitle}
                        </span>
                      )
                    })()}
                  </div>
                )}
                <MarkdownRenderer
                  content={content.body}
                  graphTitleSource={(() => {
                    const { source } = computeEffectiveTitle(content.frontmatter, content.body, path)
                    return source
                  })()}
                />
              </div>
            )
          ) : (
            <div className="text-center py-12 text-cortx-text-secondary text-sm">
              {t.filePreview.loadError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
