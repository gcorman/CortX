import { memo, useEffect, useState } from 'react'
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, X } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { colorForType } from './nodeColors'

export interface EntityTileData extends Record<string, unknown> {
  filePath?: string
  title?: string
  entityType?: string
  tags?: string[]
}

const MIN_W = 200
const MIN_H = 90

function EntityTileNodeBase({ id, data, selected, width, height }: NodeProps): React.JSX.Element {
  const d = data as EntityTileData
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const markDirty       = useCanvasStore((s) => s.markDirty)
  const { deleteElements } = useReactFlow()
  const color = colorForType(d.entityType)
  const title = d.title      || 'Sans titre'
  const type  = d.entityType || 'note'
  const tags  = d.tags       || []

  const explicitW = width  && width  > 0 ? width  : undefined
  const explicitH = height && height > 0 ? height : undefined
  const displayH  = explicitH ?? MIN_H

  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!d.filePath || displayH < 160) { setPreview(null); return }
    window.cortx.files.read(d.filePath)
      .then((fc) => {
        // fc.body is already stripped of frontmatter; strip from fc.raw as fallback
        const raw = (fc.raw ?? '').replace(/^---[\s\S]*?---\s*\n?/, '')
        setPreview((fc.body || raw).trim().slice(0, 5000) || null)
      })
      .catch(() => setPreview(null))
  }, [d.filePath, displayH])

  return (
    <div
      style={{
        ...(explicitW ? { width: explicitW } : {}),
        ...(explicitH ? { height: explicitH } : {}),
        borderColor: selected ? `${color}66` : undefined,
        boxShadow: selected
          ? `0 0 0 1px ${color}44, 0 4px 16px -4px ${color}22`
          : '0 2px 8px -2px rgba(0,0,0,0.2)'
      }}
      className="relative w-[220px] min-h-[90px] rounded-2xl backdrop-blur-xl bg-cortx-surface/60 border border-cortx-border/30 transition-all duration-200 cursor-pointer hover:bg-cortx-surface/75"
      onDoubleClick={() => { if (d.filePath) openFilePreview(d.filePath) }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_W}
        minHeight={MIN_H}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: color, border: 'none' }}
        lineStyle={{ borderColor: color, borderWidth: 1 }}
        onResizeEnd={() => markDirty()}
      />

      <Handle type="source" position={Position.Left}   id="left"   className="canvas-handle !w-3 !h-3 !bg-cortx-accent/70 !border-cortx-border !rounded-full" />
      <Handle type="source" position={Position.Right}  id="right"  className="canvas-handle !w-3 !h-3 !bg-cortx-accent/70 !border-cortx-border !rounded-full" />
      <Handle type="source" position={Position.Top}    id="top"    className="canvas-handle !w-3 !h-3 !bg-cortx-accent/70 !border-cortx-border !rounded-full" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="canvas-handle !w-3 !h-3 !bg-cortx-accent/70 !border-cortx-border !rounded-full" />

      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}33` }} />

      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}28` }}
          >
            <FileText size={9} strokeWidth={2.2} />{type}
          </span>
          {selected && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); markDirty() }}
              className="p-1 rounded-full bg-red-500/10 hover:bg-red-500/35 text-red-400/70 hover:text-red-300 transition-colors cursor-pointer"
              title="Supprimer"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="text-sm font-semibold text-cortx-text-primary leading-snug mb-1.5 line-clamp-2">
          {title}
        </div>

        {preview && displayH >= 160 && (
          <div className="mt-2 mb-2 overflow-y-auto text-cortx-text-secondary" style={{ maxHeight: displayH - 110 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <p className="text-[12px] font-semibold text-cortx-text-primary mb-0.5">{children}</p>,
                h2: ({ children }) => <p className="text-[11px] font-semibold text-cortx-text-primary mb-0.5">{children}</p>,
                h3: ({ children }) => <p className="text-[11px] font-medium text-cortx-text-primary">{children}</p>,
                p:  ({ children }) => <p className="text-[11px] leading-relaxed mb-1 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="text-[11px] list-disc list-inside mb-1 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="text-[11px] list-decimal list-inside mb-1 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="break-words">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-cortx-text-primary">{children}</strong>,
                em: ({ children }) => <em className="italic opacity-75">{children}</em>,
                code: ({ children }) => <code className="px-1 rounded bg-cortx-bg/50 text-[10px] font-mono">{children}</code>,
                a: ({ children }) => <span className="text-cortx-accent">{children}</span>,
                blockquote: ({ children }) => <span className="border-l-2 border-cortx-border/40 pl-2 italic opacity-60">{children}</span>,
              }}
            >
              {preview}
            </ReactMarkdown>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, displayH >= 160 ? 8 : 3).map((tag) => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-cortx-bg/40 border border-cortx-border/20 text-cortx-text-secondary/70">
                #{tag}
              </span>
            ))}
            {tags.length > (displayH >= 160 ? 8 : 3) && (
              <span className="text-[9px] px-1 text-cortx-text-secondary/40">+{tags.length - (displayH >= 160 ? 8 : 3)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const EntityTileNode = memo(EntityTileNodeBase)
