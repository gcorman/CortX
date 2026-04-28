import { useEffect, useState, useCallback } from 'react'
import { BookOpen, Zap, RefreshCw } from 'lucide-react'
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
            {/* Day header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold text-cortx-text-secondary/70 capitalize">{group.label}</span>
              <div className="flex-1 h-px bg-cortx-border/50" />
            </div>

            {/* Entries */}
            <div className="space-y-1.5 pl-2 border-l border-cortx-border/40">
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
  const isJournal = entry.kind === 'journal'

  return (
    <button
      onClick={() => { if (isJournal && entry.filePath) onOpenFile(entry.filePath) }}
      disabled={!isJournal || !entry.filePath}
      className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors group ${
        isJournal && entry.filePath
          ? 'hover:bg-cortx-elevated cursor-pointer'
          : 'cursor-default'
      }`}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 p-1 rounded-md ${
        isJournal
          ? 'bg-cortx-accent/15 text-cortx-accent'
          : 'bg-cortx-cta/15 text-cortx-cta'
      }`}>
        {isJournal
          ? <BookOpen size={11} />
          : <Zap size={11} />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${
          isJournal && entry.filePath
            ? 'text-cortx-text-primary group-hover:text-cortx-accent transition-colors'
            : 'text-cortx-text-primary/80'
        }`}>
          {entry.title}
        </p>
        {!isJournal && entry.body.length > entry.title.length && (
          <p className="text-2xs text-cortx-text-secondary/60 truncate mt-0.5">
            {entry.body.substring(0, 120)}
          </p>
        )}
      </div>

      {/* Time */}
      <span className="text-2xs text-cortx-text-secondary/40 flex-shrink-0 mt-0.5">
        {formatTime(entry.timestamp)}
      </span>
    </button>
  )
}
