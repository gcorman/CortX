interface NodeTooltipProps {
  label: string
  type: string
  x: number
  y: number
}

export function NodeTooltip({ label, type, x, y }: NodeTooltipProps): React.JSX.Element {
  return (
    <div
      className="fixed z-50 bg-cortx-elevated border border-cortx-border rounded-card px-3 py-2 shadow-lg pointer-events-none"
      style={{ left: x + 12, top: y - 8 }}
    >
      <p className="text-xs font-medium text-cortx-text-primary">{label}</p>
      <p className="text-2xs text-cortx-text-secondary capitalize">{type}</p>
    </div>
  )
}
