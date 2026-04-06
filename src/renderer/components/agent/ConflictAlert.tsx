import { AlertTriangle } from 'lucide-react'

interface ConflictAlertProps {
  message: string
}

export function ConflictAlert({ message }: ConflictAlertProps): React.JSX.Element {
  return (
    <div className="bg-cortx-warning/5 border border-cortx-warning/20 rounded-card px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} className="text-cortx-warning flex-shrink-0 mt-0.5" />
        <p className="text-xs text-cortx-warning leading-relaxed">{message}</p>
      </div>
    </div>
  )
}
