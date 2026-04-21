import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useFileStore } from '../../stores/fileStore'
import { colorForType } from './nodeColors'
import { useT } from '../../i18n'

interface EntityPickerProps {
  onSelect: (file: { path: string; title: string; type: string; tags: string[] }) => void
  onClose: () => void
  excludePaths?: Set<string>
}

export function EntityPicker({ onSelect, onClose, excludePaths }: EntityPickerProps): React.JSX.Element {
  const files = useFileStore((s) => s.files)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useT()

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    return files
      .filter((f) => !excludePaths?.has(f.path))
      .filter((f) => {
        if (!q) return true
        return f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
      })
      .slice(0, 60)
  }, [query, files, excludePaths])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-cortx-surface/85 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Search */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <Search size={16} className="text-cortx-text-secondary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.canvas.pickerPlaceholder}
            className="flex-1 bg-transparent text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/50 outline-none"
          />
          <button
            onClick={onClose}
            className="text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer p-1 rounded hover:bg-white/5"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="text-center py-8 text-sm text-cortx-text-secondary">
              {t.canvas.pickerEmpty}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {results.map((f) => {
                const color = colorForType(f.type)
                return (
                  <li key={f.path}>
                    <button
                      onClick={() => { onSelect(f); onClose() }}
                      className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <span
                        className="w-1 h-6 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-cortx-text-primary truncate group-hover:text-cortx-accent-light transition-colors">
                          {f.title}
                        </span>
                        <span className="block text-[10px] text-cortx-text-secondary/70 truncate">
                          {f.path}
                        </span>
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: `${color}22`,
                          color: color,
                          border: `1px solid ${color}33`
                        }}
                      >
                        {f.type}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/5 text-[10px] text-cortx-text-secondary/60 flex justify-between">
          <span>{results.length} {t.canvas.pickerResults}</span>
          <span>Esc {t.canvas.pickerClose}</span>
        </div>
      </div>
    </div>
  )
}
