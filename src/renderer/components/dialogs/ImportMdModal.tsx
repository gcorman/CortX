import { useState } from 'react'
import { X, BookOpen, Brain, FileText, ChevronRight, Loader2 } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useChatStore } from '../../stores/chatStore'
import { useT } from '../../i18n'
import { NODE_COLORS } from '../graph/GraphView'

type Option = 'library' | 'agent' | 'raw'

export function ImportMdModal(): React.JSX.Element | null {
  const mdImportModal = useUIStore((s) => s.mdImportModal)
  const hideMdImportModal = useUIStore((s) => s.hideMdImportModal)
  const addToast = useUIStore((s) => s.addToast)
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const importMarkdown = useChatStore((s) => s.importMarkdown)
  const t = useT()

  const [loading, setLoading] = useState<Option | null>(null)

  if (!mdImportModal) return null

  const { filename, content, absolutePath } = mdImportModal
  const hasPath = Boolean(absolutePath)

  async function handleLibrary(): Promise<void> {
    if (!hasPath) { addToast(t.importMdModal.noPath, 'error'); return }
    setLoading('library')
    try {
      await window.cortx.library.ingestMany([absolutePath])
      addToast(`${filename} → bibliothèque`, 'success')
      hideMdImportModal()
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(null)
    }
  }

  async function handleAgent(): Promise<void> {
    hideMdImportModal()
    await importMarkdown(filename, content)
  }

  async function handleRaw(): Promise<void> {
    setLoading('raw')
    try {
      const result = await window.cortx.agent.importRawMarkdown(filename, content)
      addToast(`${filename} importé dans la base`, 'success')
      hideMdImportModal()
      openFilePreview(result.path)
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(null)
    }
  }

  const options: Array<{
    key: Option
    icon: React.ReactNode
    color: string
    title: string
    desc: string
    disabled?: boolean
    action: () => void
  }> = [
    {
      key: 'library',
      icon: <BookOpen size={20} />,
      color: NODE_COLORS.document,
      title: t.importMdModal.libraryTitle,
      desc: t.importMdModal.libraryDesc,
      disabled: !hasPath,
      action: handleLibrary
    },
    {
      key: 'agent',
      icon: <Brain size={20} />,
      color: NODE_COLORS.domaine,
      title: t.importMdModal.agentTitle,
      desc: t.importMdModal.agentDesc,
      action: handleAgent
    },
    {
      key: 'raw',
      icon: <FileText size={20} />,
      color: NODE_COLORS.note,
      title: t.importMdModal.rawTitle,
      desc: t.importMdModal.rawDesc,
      action: handleRaw
    }
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) hideMdImportModal() }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={hideMdImportModal} />

      <div className="relative w-full max-w-md bg-cortx-surface border border-cortx-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-cortx-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cortx-elevated flex items-center justify-center flex-shrink-0">
              <FileText size={16} className="text-cortx-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-cortx-text-primary">{t.importMdModal.title}</h2>
              <p className="text-xs text-cortx-text-secondary truncate max-w-[260px]" title={filename}>
                {filename}
              </p>
            </div>
          </div>
          <button
            onClick={hideMdImportModal}
            className="p-1.5 rounded-lg hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors flex-shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Subtitle */}
        <p className="px-5 pt-4 pb-2 text-xs text-cortx-text-secondary">
          {t.importMdModal.subtitle}
        </p>

        {/* Options */}
        <div className="px-4 pb-4 space-y-2">
          {options.map((opt) => {
            const isLoading = loading === opt.key
            const isDisabled = opt.disabled || loading !== null

            return (
              <button
                key={opt.key}
                onClick={opt.action}
                disabled={isDisabled}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-150 text-left cursor-pointer group
                  ${isDisabled
                    ? 'border-cortx-border opacity-40 cursor-not-allowed'
                    : 'border-cortx-border hover:border-cortx-accent/40 hover:bg-cortx-elevated'
                  }`}
              >
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                  style={{ backgroundColor: opt.color + '22', color: opt.color }}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : opt.icon}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cortx-text-primary leading-tight">{opt.title}</p>
                  <p className="text-xs text-cortx-text-secondary mt-0.5 leading-snug">
                    {opt.disabled ? t.importMdModal.noPath : opt.desc}
                  </p>
                </div>

                {/* Arrow */}
                {!isLoading && (
                  <ChevronRight
                    size={14}
                    className="text-cortx-text-secondary/40 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Cancel */}
        <div className="px-4 pb-4">
          <button
            onClick={hideMdImportModal}
            disabled={loading !== null}
            className="w-full py-2 text-xs text-cortx-text-secondary hover:text-cortx-text-primary transition-colors disabled:opacity-40 cursor-pointer"
          >
            {t.importMdModal.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
