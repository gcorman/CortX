import { useEffect, useMemo, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { GalaxyEngine, type EngineFilters } from './galaxyEngine'
import { useGalaxyStore } from '../../stores/galaxyStore'
import { useUIStore } from '../../stores/uiStore'
import { useIdleStore } from '../../stores/idleStore'
import { HoverCard } from './HoverCard'
import { FocusCard } from './FocusCard'
import { TimeScrubber } from './TimeScrubber'
import { FilterPanel } from './FilterPanel'
import { ClusterLegend } from './ClusterLegend'
import { Search, Sparkles, RotateCcw, X } from 'lucide-react'

export function GalaxyView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<GalaxyEngine | null>(null)
  const appRef = useRef<Application | null>(null)

  const {
    data,
    loading,
    error,
    filters,
    timeRange,
    hoveredNodeId,
    focusedNodeId,
    searchQuery,
    loadData,
    setHoveredNodeId,
    setFocusedNodeId,
    setSearchQuery
  } = useGalaxyStore()

  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const idleActiveNodeIds = useIdleStore((s) => s.activeNodeIds)

  const [mounted, setMounted] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // ── Mount Pixi app ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return

    const app = new Application()
    let engine: GalaxyEngine | null = null

    ;(async () => {
      try {
        await app.init({
          resizeTo: container,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          powerPreference: 'high-performance'
        })
      } catch (err) {
        console.error('[Galaxy] Pixi init failed:', err)
        return
      }
      if (cancelled) {
        try { app.destroy(true) } catch { /* ignore */ }
        return
      }
      container.appendChild(app.canvas)
      app.canvas.style.position = 'absolute'
      app.canvas.style.inset = '0'

      engine = new GalaxyEngine(app, {
        onHover: (id) => useGalaxyStore.getState().setHoveredNodeId(id),
        onClick: (id) => {
          const current = useGalaxyStore.getState().focusedNodeId
          useGalaxyStore.getState().setFocusedNodeId(current === id ? null : id)
        },
        onDoubleClick: (_id, filePath) => {
          useUIStore.getState().openFilePreview(filePath)
        }
      })
      engineRef.current = engine
      appRef.current = app
      setMounted(true)
    })()

    return () => {
      cancelled = true
      engineRef.current = null
      appRef.current = null
      if (engine) {
        engine.destroy()
      } else {
        try { app.destroy(true) } catch { /* ignore */ }
      }
    }
  }, [])

  // ── Mouse tracking for HoverCard ─────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMove = (e: MouseEvent): void => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    container.addEventListener('mousemove', onMove)
    return () => container.removeEventListener('mousemove', onMove)
  }, [mounted])

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    void loadData()
    const handler = (): void => { void loadData() }
    window.cortx.on('db:changed', handler)
    return () => window.cortx.off('db:changed', handler)
  }, [mounted, loadData])

  // ── Push data into engine ────────────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current || !data) return
    engineRef.current.loadData(data)
  }, [data])

  // ── Sync filters ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current) return
    const ef: EngineFilters = {
      types: {
        personne: filters.personne,
        entreprise: filters.entreprise,
        domaine: filters.domaine,
        projet: filters.projet,
        note: filters.note,
        journal: filters.journal
      },
      comets: filters.comets,
      constellations: filters.constellations,
      pulsations: filters.pulsations
    }
    engineRef.current.setFilters(ef)
  }, [filters])

  useEffect(() => {
    if (!engineRef.current) return
    engineRef.current.setTimeRange(timeRange)
  }, [timeRange])

  useEffect(() => {
    if (!engineRef.current) return
    engineRef.current.setSearchQuery(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (!engineRef.current) return
    engineRef.current.setFocusedNodeId(focusedNodeId)
  }, [focusedNodeId])

  useEffect(() => {
    if (!engineRef.current) return
    engineRef.current.setPulseNodes(idleActiveNodeIds)
  }, [idleActiveNodeIds])

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (searchQuery) setSearchQuery('')
        else if (focusedNodeId) setFocusedNodeId(null)
        else if (searchOpen) setSearchOpen(false)
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        engineRef.current?.resetCamera()
      } else if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchQuery, focusedNodeId, searchOpen, setSearchQuery, setFocusedNodeId])

  // ── Derived ─────────────────────────────────────────────────────────────
  const neighborMap = useMemo(() => {
    if (!data) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const e of data.edges) {
      m.set(e.source, (m.get(e.source) ?? 0) + 1)
      m.set(e.target, (m.get(e.target) ?? 0) + 1)
    }
    return m
  }, [data])

  const hoveredNode = useMemo(
    () => (hoveredNodeId && data ? data.nodes.find((n) => n.id === hoveredNodeId) ?? null : null),
    [hoveredNodeId, data]
  )
  const focusedNode = useMemo(
    () => (focusedNodeId && data ? data.nodes.find((n) => n.id === focusedNodeId) ?? null : null),
    [focusedNodeId, data]
  )

  const stats = useMemo(() => {
    if (!data) return null
    return {
      stars: data.nodes.length,
      edges: data.edges.length,
      clusters: data.clusters.length,
      comets: data.comets.length,
      constellations: data.constellations.length
    }
  }, [data])

  const isEmpty = !!data && data.nodes.length < 5

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
      {/* Cosmic gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, #0d1430 0%, #030610 55%, #000000 100%)'
        }}
      />

      {/* Pixi canvas mount */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm pointer-events-none">
          <Sparkles size={16} className="animate-pulse mr-2" />
          Galaxie en formation…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-auto">
          <div className="text-white/85 text-2xl font-light mb-3 tracking-wide">
            Votre galaxie attend ses premières étoiles
          </div>
          <div className="text-white/45 text-sm max-w-md leading-relaxed">
            Importez ou créez quelques fichiers Markdown — chaque entité deviendra une étoile, leurs liens des constellations.
          </div>
        </div>
      )}

      {/* Top-left: legend */}
      {data && !isEmpty && (
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/55 backdrop-blur-md border border-white/10">
            <Sparkles size={14} className="text-white/60" />
            <span className="text-xs text-white/85 font-medium tracking-wide">
              Galaxie
            </span>
          </div>
        </div>
      )}

      {/* Top-right controls (search + reset) — FilterPanel positions itself */}
      {data && !isEmpty && (
        <div className="absolute top-4 right-[5.5rem] z-30 flex items-center gap-2">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="p-2 rounded-md bg-black/55 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/75 transition-colors cursor-pointer"
            title="Rechercher (Ctrl+F)"
          >
            <Search size={14} />
          </button>
          <button
            onClick={() => engineRef.current?.resetCamera()}
            className="p-2 rounded-md bg-black/55 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/75 transition-colors cursor-pointer"
            title="Recentrer (R)"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      )}

      {/* Filter panel (positions itself top-right) */}
      {data && !isEmpty && <FilterPanel />}

      {/* Search bar */}
      {searchOpen && (
        <div className="absolute top-16 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-md bg-black/75 backdrop-blur-xl border border-white/15 shadow-2xl">
          <Search size={13} className="text-white/50" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une étoile…"
            className="bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none w-56"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-white/50 hover:text-white cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Hover card (suppressed when focused) */}
      {hoveredNode && !focusedNode && (
        <HoverCard
          node={hoveredNode}
          x={mousePos.x}
          y={mousePos.y}
          neighborCount={neighborMap.get(hoveredNode.id) ?? 0}
        />
      )}

      {/* Focus card */}
      {focusedNode && (
        <FocusCard
          node={focusedNode}
          neighborCount={neighborMap.get(focusedNode.id) ?? 0}
          onClose={() => setFocusedNodeId(null)}
          onOpen={() => openFilePreview(focusedNode.filePath)}
        />
      )}

      {/* Cluster legend */}
      {data && !isEmpty && <ClusterLegend />}

      {/* Time scrubber */}
      {data && !isEmpty && <TimeScrubber />}

      {/* Bottom-right stats */}
      {stats && !isEmpty && (
        <div className="absolute bottom-4 left-4 z-10 px-3 py-1.5 rounded-md bg-black/55 backdrop-blur-md border border-white/10 text-[10px] text-white/60 font-mono pointer-events-none">
          {stats.stars} ★ · {stats.edges} ↔ · {stats.clusters} ☼ · {stats.comets} ☄ · {stats.constellations} ✦
        </div>
      )}
    </div>
  )
}
