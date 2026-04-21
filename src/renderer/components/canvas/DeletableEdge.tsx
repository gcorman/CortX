import { memo } from 'react'
import {
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  MarkerType,
  type EdgeProps
} from '@xyflow/react'
import { X } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvasStore'
import type { CanvasLineStyle, CanvasArrow } from '../../../shared/types'

function edgeMarker(arrow: CanvasArrow, side: 'end' | 'start') {
  const show = arrow === 'both' || (side === 'end' && arrow === 'forward') || (side === 'start' && arrow === 'backward')
  return show ? { type: MarkerType.ArrowClosed, width: 10, height: 10 } : undefined
}

const LINE_STYLES: CanvasLineStyle[] = ['solid', 'dashed', 'dotted']
const ARROWS: { val: CanvasArrow; label: string }[] = [
  { val: 'forward',  label: '→' },
  { val: 'backward', label: '←' },
  { val: 'both',     label: '↔' },
  { val: 'none',     label: '—' },
]

function DeletableEdgeBase({
  id,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  selected,
  label,
  markerEnd,
  markerStart,
  data
}: EdgeProps): React.JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition
  })
  const { deleteElements, setEdges } = useReactFlow()
  const markDirty = useCanvasStore((s) => s.markDirty)

  const d      = data as { lineStyle?: CanvasLineStyle; arrow?: CanvasArrow } | undefined
  const ls     = d?.lineStyle ?? 'solid'
  const ar     = d?.arrow     ?? 'forward'

  const strokeDasharray = ls === 'dashed' ? '6 3' : ls === 'dotted' ? '2 2' : undefined
  const strokeColor     = selected ? 'rgba(20, 184, 166, 0.85)' : 'rgba(148, 163, 184, 0.45)'

  const setLineStyle = (next: CanvasLineStyle): void => {
    const da = next === 'dashed' ? '6 3' : next === 'dotted' ? '2 2' : undefined
    setEdges((edges) => edges.map((e) => e.id !== id ? e : {
      ...e,
      data: { ...(e.data ?? {}), lineStyle: next },
      style: { ...(e.style ?? {}), strokeDasharray: da }
    }))
    markDirty()
  }

  const setArrow = (next: CanvasArrow): void => {
    setEdges((edges) => edges.map((e) => e.id !== id ? e : {
      ...e,
      data: { ...(e.data ?? {}), arrow: next },
      markerEnd:   edgeMarker(next, 'end')   as string | undefined,
      markerStart: edgeMarker(next, 'start') as string | undefined
    }))
    markDirty()
  }

  return (
    <>
      {/* Wide invisible hit area */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{ stroke: strokeColor, strokeWidth: selected ? 2 : 1.5, strokeDasharray, transition: 'stroke 0.15s' }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all'
          }}
          className="nopan"
        >
          {selected ? (
            <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-cortx-bg/95 backdrop-blur-sm border border-cortx-border/70 shadow-lg">
              {/* Line style */}
              {LINE_STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setLineStyle(s)}
                  className={`px-1 py-0.5 rounded cursor-pointer transition-colors ${
                    ls === s
                      ? 'bg-cortx-accent/20 text-cortx-accent'
                      : 'text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-white/5'
                  }`}
                  title={s}
                >
                  <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                    <line x1="0" y1="4" x2="16" y2="4"
                      stroke="currentColor" strokeWidth="1.5"
                      strokeDasharray={s === 'dashed' ? '4 2' : s === 'dotted' ? '1.5 2' : undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              ))}

              <div className="w-px h-3 bg-cortx-border/40 mx-0.5" />

              {/* Arrow direction */}
              {ARROWS.map(({ val, label: lbl }) => (
                <button
                  key={val}
                  onClick={() => setArrow(val)}
                  className={`px-1 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                    ar === val
                      ? 'bg-cortx-accent/20 text-cortx-accent'
                      : 'text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-white/5'
                  }`}
                  title={val}
                >
                  {lbl}
                </button>
              ))}

              <div className="w-px h-3 bg-cortx-border/40 mx-0.5" />

              {/* Delete */}
              <button
                onClick={() => { void deleteElements({ edges: [{ id }] }); markDirty() }}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-500/30 text-cortx-text-secondary hover:text-red-400 cursor-pointer transition-colors"
                title="Supprimer le lien"
              >
                <X size={9} />
              </button>
            </div>
          ) : label ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cortx-bg/90 backdrop-blur-sm border border-cortx-border/50 text-cortx-text-secondary pointer-events-none">
              {label as string}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const DeletableEdge = memo(DeletableEdgeBase)
