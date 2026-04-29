import { useMemo } from 'react'
import { useGalaxyStore } from '../../stores/galaxyStore'

function fmt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export function TimeScrubber(): React.JSX.Element | null {
  const data = useGalaxyStore((s) => s.data)
  const range = useGalaxyStore((s) => s.timeRange)
  const setRange = useGalaxyStore((s) => s.setTimeRange)

  const fullMin = data ? Date.parse(data.timeRange.min) : 0
  const fullMax = data ? Date.parse(data.timeRange.max) : 0

  const histogram = useMemo(() => {
    if (!data || fullMin >= fullMax) return [] as number[]
    const BUCKETS = 60
    const span = fullMax - fullMin
    const buckets = new Array<number>(BUCKETS).fill(0)
    for (const n of data.nodes) {
      const t = Date.parse(n.createdAt)
      if (!Number.isFinite(t)) continue
      const idx = Math.min(
        BUCKETS - 1,
        Math.max(0, Math.floor(((t - fullMin) / span) * BUCKETS))
      )
      buckets[idx]++
    }
    const max = Math.max(1, ...buckets)
    return buckets.map((b) => b / max)
  }, [data, fullMin, fullMax])

  if (!data || fullMin >= fullMax) return null

  const minMs = range ? Date.parse(range.min) : fullMin
  const maxMs = range ? Date.parse(range.max) : fullMax

  const onMaxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = Number(e.target.value)
    setRange({
      min: new Date(fullMin).toISOString(),
      max: new Date(v).toISOString()
    })
  }

  const onMinChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = Number(e.target.value)
    setRange({
      min: new Date(v).toISOString(),
      max: new Date(maxMs).toISOString()
    })
  }

  const reset = (): void => {
    setRange({
      min: new Date(fullMin).toISOString(),
      max: new Date(fullMax).toISOString()
    })
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(640px,90vw)] rounded-xl border border-white/10 bg-black/65 backdrop-blur-xl text-white shadow-2xl px-4 pt-2 pb-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/50 mb-1">
        <span>{fmt(new Date(minMs).toISOString())}</span>
        <button
          onClick={reset}
          className="hover:text-white cursor-pointer transition-colors"
        >
          plage complète
        </button>
        <span>{fmt(new Date(maxMs).toISOString())}</span>
      </div>
      <div className="relative h-8 mb-1 flex items-end gap-px">
        {histogram.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-white/30"
            style={{ height: `${Math.max(2, h * 100)}%` }}
          />
        ))}
      </div>
      <div className="relative">
        <input
          type="range"
          min={fullMin}
          max={fullMax}
          value={minMs}
          onChange={onMinChange}
          className="w-full accent-cortx-accent"
        />
        <input
          type="range"
          min={fullMin}
          max={fullMax}
          value={maxMs}
          onChange={onMaxChange}
          className="w-full accent-cortx-accent"
        />
      </div>
    </div>
  )
}
