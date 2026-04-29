import { useState } from 'react'
import { Edit2, Check, X as XIcon } from 'lucide-react'
import { useGalaxyStore } from '../../stores/galaxyStore'
import { toHex } from './colors'

export function ClusterLegend(): React.JSX.Element | null {
  const data = useGalaxyStore((s) => s.data)
  const renameCluster = useGalaxyStore((s) => s.renameCluster)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  if (!data || data.clusters.length === 0) return null

  const startEdit = (id: number, current: string): void => {
    setEditingId(id)
    setDraftLabel(current)
  }

  const submitEdit = async (topMember: string): Promise<void> => {
    await renameCluster(topMember, draftLabel.trim() === topMember ? '' : draftLabel)
    setEditingId(null)
  }

  const sorted = [...data.clusters].sort(
    (a, b) => b.memberIds.length - a.memberIds.length
  )

  return (
    <div className="absolute bottom-4 right-4 z-30 w-64 rounded-xl border border-white/10 bg-black/65 backdrop-blur-xl text-white shadow-2xl overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-white/60 hover:text-white cursor-pointer"
      >
        <span>Clusters · {data.clusters.length}</span>
        <span>{collapsed ? '+' : '–'}</span>
      </button>
      {!collapsed && (
        <div className="max-h-72 overflow-y-auto py-1">
          {sorted.slice(0, 12).map((c) => {
            const display = c.customLabel || c.label
            const editing = editingId === c.id
            return (
              <div
                key={c.id}
                className="px-3 py-1.5 flex items-center gap-2 hover:bg-white/5 group"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: toHex(parseInt(c.color.replace('#', ''), 16)),
                    boxShadow: `0 0 8px ${c.color}`
                  }}
                />
                {editing ? (
                  <>
                    <input
                      type="text"
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitEdit(c.label)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      className="flex-1 bg-white/10 rounded px-1.5 py-0.5 text-xs outline-none"
                    />
                    <button
                      onClick={() => void submitEdit(c.label)}
                      className="text-white/70 hover:text-white cursor-pointer"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-white/70 hover:text-white cursor-pointer"
                    >
                      <XIcon size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate leading-tight" title={display}>{display}</div>
                      <div className="text-[9px] text-white/35 leading-tight truncate">{c.typeLabel}</div>
                    </div>
                    <span className="text-[10px] text-white/40 flex-shrink-0">{c.memberIds.length}</span>
                    <button
                      onClick={() => startEdit(c.id, display)}
                      className="text-white/0 group-hover:text-white/60 hover:!text-white cursor-pointer transition-colors"
                      title="Renommer le cluster"
                    >
                      <Edit2 size={11} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
