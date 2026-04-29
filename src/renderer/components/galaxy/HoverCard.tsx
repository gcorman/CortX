import type { GalaxyNode } from '../../../shared/types'

interface Props {
  node: GalaxyNode | null
  x: number
  y: number
  neighborCount: number
}

export function HoverCard({ node, x, y, neighborCount }: Props): React.JSX.Element | null {
  if (!node) return null
  const modified = new Date(node.modifiedAt)
  const modStr = isNaN(modified.getTime())
    ? '—'
    : modified.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div
      className="pointer-events-none fixed z-50 px-3 py-2 rounded-lg border border-white/10 bg-black/80 backdrop-blur-md text-white text-xs shadow-2xl"
      style={{
        left: Math.min(x + 14, window.innerWidth - 240),
        top: Math.min(y + 14, window.innerHeight - 100),
        maxWidth: 240
      }}
    >
      <div className="font-semibold text-sm leading-tight">{node.label}</div>
      <div className="mt-1 text-white/60 capitalize">{node.type}</div>
      <div className="mt-1 text-white/50">
        {neighborCount} {neighborCount > 1 ? 'liens' : 'lien'} · maj {modStr}
      </div>
    </div>
  )
}
