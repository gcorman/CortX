import { ExternalLink, X, BookOpen } from 'lucide-react'
import { useLibraryStore } from '../../stores/libraryStore'
import { MarkdownRenderer } from '../files/MarkdownRenderer'
import { useT } from '../../i18n'

export function LibraryPreview(): React.JSX.Element {
  const { documents, selectedDocId, preview, selectDocument, openOriginal } = useLibraryStore()
  const doc = documents.find(d => d.id === selectedDocId)
  const t = useT()

  if (!doc || !selectedDocId) {
    return (
      <div className="flex-1 flex items-center justify-center text-cortx-text-secondary">
        <div className="text-center">
          <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">{t.library.selectDocument}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-cortx-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-cortx-text-primary truncate">
            {doc.title || doc.filename}
          </p>
          {doc.author && (
            <p className="text-[11px] text-cortx-text-secondary truncate">{doc.author}</p>
          )}
          {doc.pageCount && (
            <p className="text-[10px] text-cortx-text-secondary/60">{doc.pageCount} page{doc.pageCount > 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          onClick={() => openOriginal(selectedDocId)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-cortx-surface hover:bg-cortx-elevated text-xs text-cortx-text-secondary hover:text-cortx-text-primary transition-colors"
          title={t.library.openWith}
        >
          <ExternalLink size={12} />
          {t.library.open}
        </button>
        <button
          onClick={() => selectDocument(null)}
          className="p-1.5 rounded hover:bg-cortx-surface text-cortx-text-secondary"
        >
          <X size={14} />
        </button>
      </div>

      {/* Extracted Markdown */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!preview ? (
          <p className="text-xs text-cortx-text-secondary italic animate-pulse">{t.library.loading}</p>
        ) : (
          <MarkdownRenderer content={preview.markdown} />
        )}
      </div>
    </div>
  )
}
