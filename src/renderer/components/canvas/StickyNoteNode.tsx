import { memo, useState, useRef, useEffect } from 'react'
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Palette, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../../stores/canvasStore'
import { STICKY_COLORS, STICKY_COLORS_LIGHT, type StickyColorKey } from './nodeColors'
import { useUIStore } from '../../stores/uiStore'

export interface StickyNoteData extends Record<string, unknown> {
  text?: string
  color?: StickyColorKey
}

const MIN_W = 80
const MIN_H = 60

/** Truncate raw text to fit the content area, appending "…" if cut. */
function truncateForTile(text: string, tileW: number, tileH: number): { display: string; truncated: boolean } {
  const contentW = Math.max(1, tileW - 50)  // ~10px left + ~40px right (buttons)
  const contentH = Math.max(1, tileH - 35)  // top bar + padding
  const charsPerLine = Math.floor(contentW / 6.5)
  const maxLines = Math.floor(contentH / 18)
  if (charsPerLine <= 0 || maxLines <= 0) return { display: '', truncated: text.length > 0 }
  const maxChars = charsPerLine * maxLines
  if (text.length <= maxChars) return { display: text, truncated: false }
  return { display: text.slice(0, maxChars - 1), truncated: true }
}

function StickyNoteNodeBase({ id, data, selected, width, height }: NodeProps): React.JSX.Element {
  const d      = data as StickyNoteData
  const color  = (d.color as StickyColorKey) || 'neutral'
  const theme  = useUIStore((s) => s.theme)
  const palette = theme === 'light' ? STICKY_COLORS_LIGHT[color] : STICKY_COLORS[color]

  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState(d.text || '')
  const [showPicker, setShowPicker] = useState(false)

  const markDirty = useCanvasStore((s) => s.markDirty)
  const { updateNodeData, deleteElements } = useReactFlow()
  const taRef = useRef<HTMLTextAreaElement>(null)

  const explicitW = width  && width  > 0 ? width  : undefined
  const explicitH = height && height > 0 ? height : undefined
  const tileW = explicitW ?? 200
  const tileH = explicitH ?? 110

  const { display: displayText, truncated } = truncateForTile(d.text || '', tileW, tileH)

  useEffect(() => { setDraft(d.text || '') }, [d.text])

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.select()
    }
  }, [editing])

  const commit = (): void => {
    setEditing(false)
    if (draft !== d.text) {
      updateNodeData(id, { text: draft })
      markDirty()
    }
  }

  return (
    <div
      style={{
        ...(explicitW ? { width:  explicitW } : {}),
        ...(explicitH ? { height: explicitH } : {}),
        backgroundColor: palette.bg,
        borderColor: selected
          ? palette.border.replace(/[\d.]+\)$/, '0.9)')
          : palette.border,
        boxShadow: selected
          ? `0 0 0 1px ${palette.border}, 0 15px 50px -10px rgba(0,0,0,0.5)`
          : '0 10px 40px -15px rgba(0,0,0,0.5)',
        color: palette.text
      }}
      className="relative w-[200px] min-h-[90px] rounded-2xl backdrop-blur-xl border transition-all duration-200"
    >
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_W}
        minHeight={MIN_H}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: palette.border, border: 'none' }}
        lineStyle={{ borderColor: palette.border, borderWidth: 1 }}
        onResizeEnd={() => markDirty()}
      />

      {/* Handles */}
      <Handle type="source" position={Position.Left}   id="left"   className="canvas-handle !w-3 !h-3 !bg-white/50 !border-white/20 !rounded-full" />
      <Handle type="source" position={Position.Right}  id="right"  className="canvas-handle !w-3 !h-3 !bg-white/50 !border-white/20 !rounded-full" />
      <Handle type="source" position={Position.Top}    id="top"    className="canvas-handle !w-3 !h-3 !bg-white/50 !border-white/20 !rounded-full" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle !w-3 !h-3 !bg-white/50 !border-white/20 !rounded-full" />

      {/* Action bar (top-right) */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setShowPicker((p) => !p) }}
          className="p-1 rounded-full bg-white/10 hover:bg-white/25 transition-all cursor-pointer"
          title="Couleur"
        >
          <Palette size={10} />
        </button>
        {selected && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); markDirty() }}
            className="p-1 rounded-full bg-red-500/20 hover:bg-red-500/50 text-red-300 hover:text-red-100 transition-colors cursor-pointer"
            title="Supprimer"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Color picker */}
      {showPicker && (
        <div className="absolute top-8 right-1.5 z-20 flex gap-1 p-1.5 rounded-lg bg-cortx-bg/90 backdrop-blur-md border border-white/10 shadow-xl">
          {(Object.keys(STICKY_COLORS) as StickyColorKey[]).map((c) => (
            <button
              key={c}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                updateNodeData(id, { color: c })
                setShowPicker(false)
                markDirty()
              }}
              className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform cursor-pointer"
              style={{ backgroundColor: STICKY_COLORS[c].bg.replace(/[\d.]+\)$/, '0.9)') }}
              title={c}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div
        className="px-2.5 pt-2 pb-1.5 pr-9 overflow-hidden"
        style={{ minHeight: MIN_H - 12 }}
        onDoubleClick={() => setEditing(true)}
      >
        {editing ? (
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setDraft(d.text || ''); setEditing(false) }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commit()
            }}
            className="w-full bg-transparent outline-none resize-none text-xs leading-relaxed placeholder:opacity-50"
            style={{ color: palette.text, minHeight: 60 }}
            placeholder="Écris une note…"
          />
        ) : d.text ? (
          <div className="text-xs leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <p className="font-bold mb-0.5" style={{ fontSize: '1.1em' }}>{children}</p>,
                h2: ({ children }) => <p className="font-semibold mb-0.5" style={{ fontSize: '1.05em' }}>{children}</p>,
                h3: ({ children }) => <p className="font-semibold mb-0.5">{children}</p>,
                p:  ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                em: ({ children }) => <em className="italic opacity-85">{children}</em>,
                code: ({ children }) => <code className="font-mono opacity-80">{children}</code>,
              }}
            >
              {displayText}
            </ReactMarkdown>
            {truncated && <span className="opacity-50 text-[10px]">…</span>}
          </div>
        ) : (
          <span className="text-xs opacity-50 italic select-none">Double-clic pour éditer</span>
        )}
      </div>
    </div>
  )
}

export const StickyNoteNode = memo(StickyNoteNodeBase)
