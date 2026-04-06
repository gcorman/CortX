import { useState, useEffect } from 'react'
import { X, FilePlus, FileEdit, ArrowRight } from 'lucide-react'
import type { AgentAction } from '../../../shared/types'

interface ActionPreviewProps {
  action: AgentAction
  onClose: () => void
}

export function ActionPreview({ action, onClose }: ActionPreviewProps): React.JSX.Element {
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadPreview()
  }, [action])

  async function loadPreview(): Promise<void> {
    setIsLoading(true)
    try {
      const result = await window.cortx.agent.preview(action)
      setBefore(result.before)
      setAfter(result.after)
    } catch {
      setBefore(null)
      setAfter(action.content)
    }
    setIsLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-cortx-surface border border-cortx-border rounded-panel w-full max-w-4xl mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-cortx-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {action.action === 'create' ? (
              <FilePlus size={16} className="text-cortx-success" />
            ) : (
              <FileEdit size={16} className="text-cortx-accent" />
            )}
            <span className="text-sm font-medium text-cortx-text-primary">
              {action.action === 'create' ? 'Nouveau fichier' : 'Modification'}
            </span>
            <span className="text-xs font-mono text-cortx-text-secondary bg-cortx-bg px-2 py-0.5 rounded">
              {action.file}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-cortx-text-secondary text-sm">
              Chargement de l'apercu...
            </div>
          ) : action.action === 'create' ? (
            /* Create: show new content only */
            <div className="h-full overflow-y-auto p-4">
              <div className="text-2xs uppercase text-cortx-success font-medium mb-2 tracking-wider">
                Nouveau contenu
              </div>
              <pre className="text-xs text-cortx-text-primary font-mono whitespace-pre-wrap bg-cortx-bg rounded-card p-4 border border-cortx-success/20">
                {after}
              </pre>
            </div>
          ) : (
            /* Modify: show before/after side by side */
            <div className="flex h-full min-h-0">
              {/* Before */}
              <div className="flex-1 overflow-y-auto p-4 border-r border-cortx-border">
                <div className="text-2xs uppercase text-cortx-text-secondary font-medium mb-2 tracking-wider">
                  Contenu actuel
                </div>
                <pre className="text-xs text-cortx-text-secondary font-mono whitespace-pre-wrap bg-cortx-bg rounded-card p-4 border border-cortx-border">
                  {before || '(fichier vide)'}
                </pre>
              </div>

              {/* Arrow */}
              <div className="flex items-center px-1 flex-shrink-0">
                <ArrowRight size={14} className="text-cortx-text-secondary/30" />
              </div>

              {/* After */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="text-2xs uppercase text-cortx-success font-medium mb-2 tracking-wider">
                  Apres modification
                </div>
                <pre className="text-xs text-cortx-text-primary font-mono whitespace-pre-wrap bg-cortx-bg rounded-card p-4 border border-cortx-success/20">
                  {after}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
