import { useEffect, useState, useCallback } from 'react'
import { X, Pencil, Save, RotateCcw } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useUIStore } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'
import { useFileStore } from '../../stores/fileStore'
import type { FileContent } from '../../../shared/types'

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
  const addToast = useUIStore((s) => s.addToast)
  const reloadGraph = useGraphStore((s) => s.loadGraph)
  const reloadFiles = useFileStore((s) => s.loadFiles)

  const loadFile = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const result = await window.cortx.files.read(path)
      setContent(result)
      setDraft(result?.raw || '')
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
      addToast('Fichier enregistré', 'success')
      setIsEditing(false)
      // Reload everything that depends on this file
      await loadFile()
      reloadGraph()
      reloadFiles()
    } catch (err) {
      console.error('[FilePreview] save failed', err)
      addToast('Erreur lors de l\'enregistrement', 'error')
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

  const fileName = path.split('/').pop() || path

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
            <h3 className="text-sm font-semibold text-cortx-text-primary truncate">{fileName}</h3>
            <span className="text-2xs text-cortx-text-secondary font-mono truncate">{path}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isEditing && content && (
              <button
                onClick={handleEnterEdit}
                className="p-1.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-accent transition-colors cursor-pointer"
                title="Modifier ce fichier"
              >
                <Pencil size={14} />
              </button>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || draft === content?.raw}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-cortx-success/15 text-cortx-success hover:bg-cortx-success/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Enregistrer (Ctrl+S)"
                >
                  <Save size={12} />
                  {isSaving ? 'Sauvegarde...' : 'Enregistrer'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
                  title="Annuler (Échap)"
                >
                  <RotateCcw size={12} />
                  Annuler
                </button>
              </>
            )}
            <button
              onClick={onClose}
              disabled={isEditing && draft !== content?.raw}
              className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={isEditing && draft !== content?.raw ? 'Enregistre ou annule avant de fermer' : 'Fermer'}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-cortx-text-secondary text-sm">
              Chargement...
            </div>
          ) : content ? (
            isEditing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault()
                    void handleSave()
                  }
                }}
                spellCheck={false}
                className="w-full h-full min-h-[60vh] bg-cortx-bg text-cortx-text-primary text-sm font-mono p-4 resize-none focus:outline-none border-0"
                placeholder="Contenu Markdown..."
              />
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
                  </div>
                )}
                <MarkdownRenderer content={content.body} />
              </div>
            )
          ) : (
            <div className="text-center py-12 text-cortx-text-secondary text-sm">
              Impossible de charger le fichier.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
