import { useState } from 'react'
import { Filter } from 'lucide-react'
import { useGalaxyStore, type GalaxyFilters } from '../../stores/galaxyStore'
import { TYPE_COLORS, toHex } from './colors'

const TYPE_LABELS: Record<string, string> = {
  personne: 'Personnes',
  entreprise: 'Entreprises',
  domaine: 'Domaines',
  projet: 'Projets',
  note: 'Notes',
  journal: 'Journal'
}

export function FilterPanel(): React.JSX.Element {
  const filters = useGalaxyStore((s) => s.filters)
  const setFilter = useGalaxyStore((s) => s.setFilter)
  const [open, setOpen] = useState(false)

  const types: Array<keyof GalaxyFilters> = [
    'personne',
    'entreprise',
    'domaine',
    'projet',
    'note',
    'journal'
  ]

  return (
    <div className="absolute top-4 right-4 z-30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 bg-black/60 backdrop-blur-md text-white text-xs hover:bg-black/80 transition-colors cursor-pointer"
      >
        <Filter size={12} /> Filtres
      </button>
      {open && (
        <div className="mt-2 w-56 rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl text-white text-xs shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-white/50">
            Types d'entités
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {types.map((t) => {
              const color = toHex(TYPE_COLORS[t] ?? 0x999999)
              return (
                <label
                  key={t}
                  className="flex items-center gap-2 cursor-pointer hover:text-white text-white/80"
                >
                  <input
                    type="checkbox"
                    checked={filters[t]}
                    onChange={(e) => setFilter(t, e.target.checked)}
                    className="accent-cortx-accent"
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  {TYPE_LABELS[t]}
                </label>
              )
            })}
          </div>
          <div className="px-3 py-2 border-t border-white/5 text-[10px] uppercase tracking-widest text-white/50">
            Couches
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer hover:text-white text-white/80">
              <input
                type="checkbox"
                checked={filters.comets}
                onChange={(e) => setFilter('comets', e.target.checked)}
                className="accent-cortx-accent"
              />
              Comètes (Bibliothèque)
            </label>
            <label className="flex items-center gap-2 cursor-pointer hover:text-white text-white/80">
              <input
                type="checkbox"
                checked={filters.constellations}
                onChange={(e) => setFilter('constellations', e.target.checked)}
                className="accent-cortx-accent"
              />
              Constellations (Fiches)
            </label>
            <label className="flex items-center gap-2 cursor-pointer hover:text-white text-white/80">
              <input
                type="checkbox"
                checked={filters.pulsations}
                onChange={(e) => setFilter('pulsations', e.target.checked)}
                className="accent-cortx-accent"
              />
              Pulsation Idle
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
