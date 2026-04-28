import { useEffect, useRef, useState, useCallback } from 'react'
import { FileText, Hash, LayoutGrid, Network, BookOpen, Settings, Moon, Sun, Zap, ZapOff, Globe, Square, Download } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useIdleStore } from '../../stores/idleStore'
import { useT } from '../../i18n'
import type { CenterView } from '../../stores/uiStore'

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  category: 'fichier' | 'vue' | 'action' | 'tag'
  onSelect: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  fichier: 'Fichiers',
  vue: 'Vue',
  action: 'Actions',
  tag: 'Tags'
}

export function CommandPalette(): React.JSX.Element | null {
  const {
    commandPaletteOpen, closeCommandPalette,
    openFilePreview, setActiveCenterView, toggleSettings,
    theme, setTheme, language, setLanguage, addToast
  } = useUIStore()
  const files = useFileStore((s) => s.files)
  const idleActive = useIdleStore((s) => s.isActive)
  const t = useT()

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [commandPaletteOpen])

  const buildItems = useCallback((): CommandItem[] => {
    const q = query.toLowerCase().trim()

    // --- Static actions ---
    const actions: CommandItem[] = [
      {
        id: 'action:graph', label: 'Graphe de connaissances', sublabel: 'Vue', icon: <Network size={14} />,
        category: 'vue', onSelect: () => { setActiveCenterView('graph'); closeCommandPalette() }
      },
      {
        id: 'action:tags', label: 'Navigateur de tags', sublabel: 'Vue', icon: <Hash size={14} />,
        category: 'vue', onSelect: () => { setActiveCenterView('tags'); closeCommandPalette() }
      },
      {
        id: 'action:files', label: 'Liste des fichiers', sublabel: 'Vue', icon: <LayoutGrid size={14} />,
        category: 'vue', onSelect: () => { setActiveCenterView('files' as CenterView); closeCommandPalette() }
      },
      {
        id: 'action:library', label: 'Bibliothèque', sublabel: 'Vue', icon: <BookOpen size={14} />,
        category: 'vue', onSelect: () => { setActiveCenterView('library'); closeCommandPalette() }
      },
      {
        id: 'action:settings', label: 'Paramètres', sublabel: t.settings.title, icon: <Settings size={14} />,
        category: 'action', onSelect: () => { toggleSettings(); closeCommandPalette() }
      },
      {
        id: 'action:theme',
        label: theme === 'dark' ? 'Thème clair' : 'Thème sombre',
        sublabel: 'Ctrl+/',
        icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        category: 'action',
        onSelect: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); closeCommandPalette() }
      },
      {
        id: 'action:lang',
        label: language === 'fr' ? 'Switch to English' : 'Passer en français',
        icon: <Globe size={14} />,
        category: 'action',
        onSelect: () => { setLanguage(language === 'fr' ? 'en' : 'fr'); closeCommandPalette() }
      },
      {
        id: 'action:idle',
        label: idleActive ? 'Arrêter l\'exploration autonome' : 'Démarrer l\'exploration autonome',
        icon: idleActive ? <ZapOff size={14} /> : <Zap size={14} />,
        category: 'action',
        onSelect: () => {
          if (idleActive) { window.cortx.idle.stop() } else { window.cortx.idle.start() }
          closeCommandPalette()
        }
      },
      {
        id: 'action:canvas', label: 'Canvas', sublabel: 'Vue', icon: <Square size={14} />,
        category: 'vue', onSelect: () => { setActiveCenterView('canvas'); closeCommandPalette() }
      },
      {
        id: 'action:export-html', label: 'Exporter en HTML', sublabel: 'Export',
        icon: <Download size={14} />, category: 'action',
        onSelect: () => {
          closeCommandPalette()
          window.cortx.files.export('html').then((r) => {
            if (r.success) addToast(`Exporté : ${r.path}`, 'success')
            else if (r.error) addToast(`Erreur export : ${r.error}`, 'error')
          })
        }
      },
      {
        id: 'action:export-json', label: 'Exporter en JSON', sublabel: 'Export',
        icon: <Download size={14} />, category: 'action',
        onSelect: () => {
          closeCommandPalette()
          window.cortx.files.export('json').then((r) => {
            if (r.success) addToast(`Exporté : ${r.path}`, 'success')
            else if (r.error) addToast(`Erreur export : ${r.error}`, 'error')
          })
        }
      }
    ]

    // --- Files ---
    const fileItems: CommandItem[] = files
      .filter((f) => !q || f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .slice(0, 8)
      .map((f) => ({
        id: `file:${f.path}`,
        label: f.title || f.path.split('/').pop()?.replace('.md', '') || f.path,
        sublabel: f.path,
        icon: <FileText size={14} />,
        category: 'fichier' as const,
        onSelect: () => { openFilePreview(f.path); closeCommandPalette() }
      }))

    // Filter actions by query
    const filteredActions = q
      ? actions.filter((a) => a.label.toLowerCase().includes(q) || (a.sublabel ?? '').toLowerCase().includes(q))
      : actions

    if (!q) {
      // No query: show actions first, then first 5 files
      return [...filteredActions, ...fileItems.slice(0, 5)]
    }

    return [...fileItems, ...filteredActions]
  }, [query, files, theme, language, idleActive, t, setActiveCenterView, openFilePreview, closeCommandPalette, toggleSettings, setTheme, setLanguage, addToast])

  const items = buildItems()

  // Scroll active item into view
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  // Keyboard navigation
  useEffect(() => {
    if (!commandPaletteOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { closeCommandPalette(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter') { e.preventDefault(); items[activeIdx]?.onSelect(); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, items, activeIdx, closeCommandPalette])

  if (!commandPaletteOpen) return null

  // Group items by category for display
  const grouped: Record<string, CommandItem[]> = {}
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={closeCommandPalette}
    >
      <div
        className="w-full max-w-xl mx-4 bg-cortx-surface/90 backdrop-blur-md border border-cortx-border/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cortx-border/40">
          <span className="text-cortx-text-secondary/60">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher fichiers, vues, actions…"
            className="flex-1 bg-transparent text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/50 outline-none"
          />
          <kbd className="text-2xs px-1.5 py-0.5 rounded bg-cortx-elevated border border-cortx-border text-cortx-text-secondary">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-cortx-text-secondary/60">Aucun résultat</div>
          )}
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <div className="px-4 py-1 text-2xs font-semibold uppercase tracking-wider text-cortx-text-secondary/50">
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              {catItems.map((item) => {
                const globalIdx = items.indexOf(item)
                return (
                  <button
                    key={item.id}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer ${
                      globalIdx === activeIdx ? 'bg-cortx-accent/15 text-cortx-text-primary' : 'text-cortx-text-secondary hover:bg-cortx-elevated/50'
                    }`}
                  >
                    <span className={globalIdx === activeIdx ? 'text-cortx-accent' : 'text-cortx-text-secondary/60'}>
                      {item.icon}
                    </span>
                    <span className="flex-1 text-xs truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-2xs text-cortx-text-secondary/40 truncate max-w-[120px]">{item.sublabel}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-cortx-border/40 flex gap-3 text-2xs text-cortx-text-secondary/40">
          <span><kbd className="font-mono">↑↓</kbd> naviguer</span>
          <span><kbd className="font-mono">↵</kbd> sélectionner</span>
          <span><kbd className="font-mono">Esc</kbd> fermer</span>
        </div>
      </div>
    </div>
  )
}
