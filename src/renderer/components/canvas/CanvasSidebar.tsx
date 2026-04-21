import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, Layers, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvasStore'
import { useT } from '../../i18n'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
}

export function CanvasSidebar({ collapsed, onToggleCollapse }: Props): React.JSX.Element {
  const canvases = useCanvasStore((s) => s.canvases)
  const active = useCanvasStore((s) => s.active)
  const loadCanvas = useCanvasStore((s) => s.loadCanvas)
  const createCanvas = useCanvasStore((s) => s.createCanvas)
  const deleteCanvas = useCanvasStore((s) => s.deleteCanvas)
  const renameCanvas = useCanvasStore((s) => s.renameCanvas)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const t = useT()

  useEffect(() => { void useCanvasStore.getState().loadList() }, [])

  const handleCreate = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    await createCanvas(name)
    setCreating(false)
    setNewName('')
  }

  const startRename = (id: string, currentName: string): void => {
    setEditingId(id)
    setEditDraft(currentName)
  }

  const commitRename = async (): Promise<void> => {
    if (!editingId || !editDraft.trim()) { setEditingId(null); return }
    await renameCanvas(editingId, editDraft.trim())
    setEditingId(null)
  }

  if (collapsed) {
    return (
      <div className="flex-shrink-0 w-10 border-r border-white/5 bg-cortx-bg/40 backdrop-blur-xl flex flex-col items-center py-3">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-white/5 text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer transition-colors"
          title={t.canvas.expandSidebar}
        >
          <ChevronRight size={14} />
        </button>
        <div className="mt-4 flex flex-col gap-1">
          {canvases.slice(0, 6).map((c) => (
            <button
              key={c.id}
              onClick={() => void loadCanvas(c.id)}
              title={c.name}
              className={`w-6 h-6 rounded-md border cursor-pointer transition-all ${
                active?.id === c.id
                  ? 'border-cortx-accent bg-cortx-accent/20'
                  : 'border-white/10 bg-white/5 hover:border-cortx-accent/50'
              }`}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-64 border-r border-white/5 bg-cortx-bg/40 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-cortx-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-cortx-text-primary">
            {t.canvas.sidebarTitle}
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-white/5 text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer transition-colors"
          title={t.canvas.collapseSidebar}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* New canvas */}
      <div className="px-3 py-3 border-b border-white/5">
        {creating ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder={t.canvas.newPlaceholder}
              className="flex-1 bg-cortx-bg/60 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-cortx-text-primary placeholder:text-cortx-text-secondary/50 outline-none focus:border-cortx-accent/50"
            />
            <button
              onClick={() => void handleCreate()}
              className="p-1.5 rounded bg-cortx-accent/30 hover:bg-cortx-accent/50 text-cortx-accent-light cursor-pointer"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => { setCreating(false); setNewName('') }}
              className="p-1.5 rounded hover:bg-white/5 text-cortx-text-secondary cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/15 hover:border-cortx-accent/50 hover:bg-cortx-accent/5 text-xs text-cortx-text-secondary hover:text-cortx-accent-light transition-all cursor-pointer"
          >
            <Plus size={12} /> {t.canvas.newCanvas}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {canvases.length === 0 && (
          <div className="text-center py-8 text-xs text-cortx-text-secondary/60 italic px-4">
            {t.canvas.emptyList}
          </div>
        )}
        {canvases.map((c) => {
          const isActive = active?.id === c.id
          const isEditing = editingId === c.id
          const isConfirm = confirmDelete === c.id
          return (
            <div
              key={c.id}
              className={`group relative rounded-xl border transition-all ${
                isActive
                  ? 'bg-cortx-accent/10 border-cortx-accent/40 shadow-[0_0_20px_-8px_rgba(13,148,136,0.5)]'
                  : 'bg-white/5 border-white/5 hover:border-white/15'
              }`}
            >
              {isEditing ? (
                <div className="flex items-center gap-1 p-2">
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="flex-1 min-w-0 bg-cortx-bg/60 border border-white/10 rounded px-2 py-1 text-xs text-cortx-text-primary outline-none focus:border-cortx-accent/50"
                  />
                  <button
                    onClick={() => void commitRename()}
                    className="p-1 rounded hover:bg-white/10 text-cortx-accent-light cursor-pointer"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 rounded hover:bg-white/10 text-cortx-text-secondary cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => void loadCanvas(c.id)}
                  className="w-full text-left px-3 py-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-semibold truncate ${isActive ? 'text-cortx-accent-light' : 'text-cortx-text-primary'}`}>
                      {c.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-cortx-text-secondary/80">
                    <span>{c.nodeCount} {t.canvas.tilesShort}</span>
                    <span className="opacity-40">·</span>
                    <span>{c.edgeCount} {t.canvas.edgesShort}</span>
                  </div>
                </button>
              )}

              {!isEditing && (
                <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(c.id, c.name) }}
                    className="p-1 rounded hover:bg-white/10 text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer"
                    title={t.canvas.rename}
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(isConfirm ? null : c.id) }}
                    className={`p-1 rounded cursor-pointer ${
                      isConfirm
                        ? 'bg-cortx-error/30 text-cortx-error'
                        : 'hover:bg-white/10 text-cortx-text-secondary hover:text-cortx-error'
                    }`}
                    title={t.canvas.delete}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}

              {isConfirm && (
                <div className="absolute inset-0 bg-cortx-bg/90 backdrop-blur-sm rounded-xl flex items-center justify-center gap-2 px-3">
                  <span className="text-[10px] text-cortx-text-primary">{t.canvas.confirmDelete}</span>
                  <button
                    onClick={() => { void deleteCanvas(c.id); setConfirmDelete(null) }}
                    className="text-[10px] px-2 py-0.5 rounded bg-cortx-error/30 text-cortx-error hover:bg-cortx-error/50 cursor-pointer"
                  >
                    {t.canvas.yes}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-[10px] px-2 py-0.5 rounded hover:bg-white/5 text-cortx-text-secondary cursor-pointer"
                  >
                    {t.canvas.no}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
