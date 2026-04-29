import { X, FileText } from 'lucide-react'
import type { GalaxyNode } from '../../../shared/types'

interface Props {
  node: GalaxyNode
  neighborCount: number
  onClose: () => void
  onOpen: () => void
}

export function FocusCard({ node, neighborCount, onClose, onOpen }: Props): React.JSX.Element {
  const modified = new Date(node.modifiedAt)
  const modStr = isNaN(modified.getTime())
    ? '—'
    : modified.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div className="absolute top-4 left-4 z-30 w-72 rounded-xl border border-white/10 bg-black/70 backdrop-blur-xl text-white shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/5">
        <div className="text-[10px] uppercase tracking-widest text-white/50">Focus</div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white cursor-pointer"
          title="Quitter le focus (Esc)"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-4 py-3">
        <div className="text-base font-semibold leading-snug">{node.label}</div>
        <div className="mt-1 text-xs text-white/60 capitalize">{node.type}</div>
        <div className="mt-3 flex items-center justify-between text-xs text-white/50">
          <div>
            <span className="text-white/80 font-medium">{neighborCount}</span> connexion
            {neighborCount > 1 ? 's' : ''}
          </div>
          <div>maj {modStr}</div>
        </div>
        <button
          onClick={onOpen}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors cursor-pointer text-xs font-medium"
        >
          <FileText size={12} /> Ouvrir le fichier
        </button>
      </div>
    </div>
  )
}
