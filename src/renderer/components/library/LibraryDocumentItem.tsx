import { FileText, Sheet, Presentation, File, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import type { LibraryDocument } from '../../../shared/types'

interface Props {
  doc: LibraryDocument
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onOpenOriginal: () => void
}

function MimeIcon({ mime }: { mime: string | null }) {
  if (!mime) return <File size={14} className="text-cortx-text-secondary flex-shrink-0" />
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text'))
    return <FileText size={14} className="text-blue-400 flex-shrink-0" />
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv'))
    return <Sheet size={14} className="text-green-400 flex-shrink-0" />
  if (mime.includes('presentation') || mime.includes('powerpoint'))
    return <Presentation size={14} className="text-orange-400 flex-shrink-0" />
  return <File size={14} className="text-cortx-text-secondary flex-shrink-0" />
}

function StatusBadge({ status }: { status: LibraryDocument['status'] }) {
  if (status === 'indexed') return null
  if (status === 'error')
    return <span className="text-[10px] text-red-400 px-1.5 py-0.5 bg-red-400/10 rounded">erreur</span>
  return (
    <span className="flex items-center gap-1 text-[10px] text-cortx-text-secondary">
      <Loader2 size={10} className="animate-spin" />
      {status === 'extracting' ? 'extraction…' : status === 'embedding' ? 'embeddings…' : 'en attente…'}
    </span>
  )
}

export function LibraryDocumentItem({ doc, isSelected, onSelect, onDelete, onOpenOriginal }: Props): React.JSX.Element {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-start gap-2 px-3 py-2 cursor-pointer rounded transition-colors ${
        isSelected ? 'bg-cortx-elevated' : 'hover:bg-cortx-surface'
      }`}
    >
      <MimeIcon mime={doc.mimeType} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-cortx-text-primary truncate">
            {doc.title || doc.filename}
          </span>
          <StatusBadge status={doc.status} />
        </div>
        {doc.author && (
          <p className="text-[10px] text-cortx-text-secondary truncate">{doc.author}</p>
        )}
        <p className="text-[10px] text-cortx-text-secondary/60 truncate">{doc.path}</p>
      </div>

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenOriginal() }}
          className="p-1 rounded hover:bg-cortx-border text-cortx-text-secondary hover:text-cortx-text-primary"
          title="Ouvrir l'original"
        >
          <ExternalLink size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded hover:bg-red-500/10 text-cortx-text-secondary hover:text-red-400"
          title="Supprimer"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
