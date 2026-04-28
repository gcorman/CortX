import { useEffect, useState, useCallback } from 'react'
import { BookOpen, RefreshCw, Pencil, Trash2, FileText, RotateCcw, Zap, FilePlus, Plus } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import type { TimelineEntry } from '../../../shared/types'

function formatDay(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function dayKey(ts: string): string {
  return ts.slice(0, 10)
}

function groupByDay(entries: TimelineEntry[]): Array<{ day: string; label: string; items: TimelineEntry[] }> {
  const map = new Map<string, TimelineEntry[]>()
  for (const e of entries) {
    const k = dayKey(e.timestamp)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(e)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({ day, label: formatDay(items[0].timestamp), items }))
}

type EntryMeta = {
  icon: React.ReactNode
  bg: string
  text: string
  badge: string
  badgeBg: string
}

function getEntryMeta(entry: TimelineEntry): EntryMeta {
  const t = entry.inputType

  if (t === 'journal' || entry.kind === 'journal') return {
    icon: <BookOpen size={11} />,
    bg: 'bg-cortx-accent/15',
    text: 'text-cortx-accent',
    badge: 'Journal',
    badgeBg: 'bg-cortx-accent/10 text-cortx-accent'
  }
  if (t === 'manual_edit') return {
    icon: <Pencil size={11} />,
    bg: 'bg-sky-500/15',
    text: 'text-sky-400',
    badge: 'Édition',
    badgeBg: 'bg-sky-500/10 text-sky-400'
  }
  if (t === 'brief') return {
    icon: <FileText size={11} />,
    bg: 'bg-violet-500/15',
    text: 'text-violet-400',
    badge: 'Fiche',
    badgeBg: 'bg-violet-500/10 text-violet-400'
  }
  if (t === 'rewrite') return {
    icon: <RotateCcw size={11} />,
    bg: 'bg-teal-500/15',
    text: 'text-teal-400',
    badge: 'Réécriture',
    badgeBg: 'bg-teal-500/10 text-teal-400'
  }
  if (t === 'delete_file' || t === 'delete_fiche') return {
    icon: <Trash2 size={11} />,
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    badge: 'Suppression',
    badgeBg: 'bg-rose-500/10 text-rose-400'
  }
  // execute — distinguish create-only vs mixed vs modify-only
  if (t === 'execute' || !t) {
    const verbs = entry.actionVerbs ?? []
    const allCreate = verbs.length > 0 && verbs.every((v) => v === 'create')
    const allModify = verbs.length > 0 && verbs.every((v) => v === 'modify')
    if (allCreate) return {
      icon: <FilePlus size={11} />,
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-400',
      badge: 'Création',
      badgeBg: 'bg-emerald-500/10 text-emerald-400'
    }
    if (allModify) return {
      icon: <Pencil size={11} />,
      bg: 'bg-amber-500/15',
      text: 'text-amber-400',
      badge: 'Modification',
      badgeBg: 'bg-amber-500/10 text-amber-400'
    }
    return {
      icon: <Zap size={11} />,
      bg: 'bg-cortx-cta/15',
      text: 'text-cortx-cta',
      badge: 'Agent',
      badgeBg: 'bg-cortx-cta/10 text-cortx-cta'
    }
  }
  return {
    icon: <Plus size={11} />,
    bg: 'bg-cortx-cta/15',
    text: 'text-cortx-cta',
    badge: 'Action',
    badgeBg: 'bg-cortx-cta/10 text-cortx-cta'
  }
}

export function TimelineView(): React.JSX.Element {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const openFilePreview = useUIStore((s) => s.openFilePreview)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.cortx.db.getTimeline(100)
      setEntries(data)
    } catch {
      setEntries([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const handler = (): void => { void load() }
    window.cortx.on('db:changed', handler)
    return () => window.cortx.off('db:changed', handler)
  }, [load])

  const groups = groupByDay(entries)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-cortx-border flex-shrink-0">
        <span className="text-xs text-cortx-text-secondary">{entries.length} événement(s)</span>
        <button
          onClick={() => void load()}
          className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
          title="Rafraîchir"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center h-32 text-cortx-text-secondary text-xs">
            Chargement…
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-cortx-text-secondary/60 text-xs gap-2">
            <span>Aucune activité enregistrée.</span>
            <span>Les actions agent et les entrées Journal apparaîtront ici.</span>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.day} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold text-cortx-text-secondary/70 capitalize">{group.label}</span>
              <div className="flex-1 h-px bg-cortx-border/50" />
            </div>

            <div className="space-y-1 pl-2 border-l border-cortx-border/40">
              {group.items.map((entry) => (
                <TimelineItem key={entry.id} entry={entry} onOpenFile={openFilePreview} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelineItem({
  entry,
  onOpenFile
}: {
  entry: TimelineEntry
  onOpenFile: (path: string) => void
}): React.JSX.Element {
  const meta = getEntryMeta(entry)
  const isClickable = entry.kind === 'journal' && !!entry.filePath

  return (
    <button
      onClick={() => { if (isClickable && entry.filePath) onOpenFile(entry.filePath) }}
      disabled={!isClickable}
      className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors group ${
        isClickable ? 'hover:bg-cortx-elevated cursor-pointer' : 'cursor-default'
      }`}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 p-1.5 rounded-md ${meta.bg} ${meta.text}`}>
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-full ${meta.badgeBg}`}>
            {meta.badge}
          </span>
          {entry.actionCount !== undefined && entry.actionCount > 1 && (
            <span className="text-2xs text-cortx-text-secondary/50">
              {entry.actionCount} fichiers
            </span>
          )}
        </div>
        <p className={`text-xs font-medium truncate ${
          isClickable
            ? `${meta.text} group-hover:opacity-80 transition-opacity`
            : 'text-cortx-text-primary/90'
        }`}>
          {entry.title}
        </p>
      </div>

      {/* Time */}
      <span className="text-2xs text-cortx-text-secondary/40 flex-shrink-0 mt-1">
        {formatTime(entry.timestamp)}
      </span>
    </button>
  )
}
