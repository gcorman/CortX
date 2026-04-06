import { ZoomIn, ZoomOut, Maximize } from 'lucide-react'

interface GraphControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

export function GraphControls({ onZoomIn, onZoomOut, onFit }: GraphControlsProps): React.JSX.Element {
  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1 bg-cortx-surface/90 backdrop-blur-sm rounded-card border border-cortx-border p-1">
      <button
        onClick={onZoomIn}
        className="p-1.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
        title="Zoom +"
      >
        <ZoomIn size={14} />
      </button>
      <button
        onClick={onZoomOut}
        className="p-1.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
        title="Zoom -"
      >
        <ZoomOut size={14} />
      </button>
      <div className="w-full h-px bg-cortx-border" />
      <button
        onClick={onFit}
        className="p-1.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
        title="Tout afficher"
      >
        <Maximize size={14} />
      </button>
    </div>
  )
}
