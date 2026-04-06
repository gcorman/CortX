import { useUIStore } from '../../stores/uiStore'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export function Toast(): React.JSX.Element {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return <></>

  const iconMap = {
    success: <CheckCircle size={14} className="text-cortx-success" />,
    error: <AlertCircle size={14} className="text-cortx-error" />,
    info: <Info size={14} className="text-cortx-accent" />
  }

  return (
    <div className="fixed bottom-10 right-4 flex flex-col gap-2 z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-2 bg-cortx-elevated border border-cortx-border rounded-card px-3 py-2 shadow-lg animate-in slide-in-from-right"
        >
          {iconMap[toast.type]}
          <span className="text-xs text-cortx-text-primary">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-cortx-text-secondary hover:text-cortx-text-primary ml-2 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
