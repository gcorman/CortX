import { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { FileContent } from '../../../shared/types'

interface FilePreviewProps {
  path: string
  onClose: () => void
}

export function FilePreview({ path, onClose }: FilePreviewProps): React.JSX.Element {
  const [content, setContent] = useState<FileContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadFile()
  }, [path])

  async function loadFile(): Promise<void> {
    setIsLoading(true)
    try {
      const result = await window.cortx.files.read(path)
      setContent(result)
    } catch {
      setContent(null)
    }
    setIsLoading(false)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fileName = path.split('/').pop() || path

  return (
    <div className="absolute inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-cortx-bg/80 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl bg-cortx-surface border-l border-cortx-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cortx-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-cortx-text-primary truncate">{fileName}</h3>
            <span className="text-2xs text-cortx-text-secondary font-mono truncate">{path}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-cortx-text-secondary text-sm">
              Chargement...
            </div>
          ) : content ? (
            <>
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
            </>
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
