import { FileText } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'

interface FileListProps {
  files: Array<{ path: string; title: string; type?: string }>
}

export function FileList({ files }: FileListProps): React.JSX.Element {
  const openFilePreview = useUIStore((s) => s.openFilePreview)

  return (
    <div className="p-2 space-y-0.5">
      {files.map((file) => (
        <button
          key={file.path}
          onClick={() => openFilePreview(file.path)}
          className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-card text-sm text-cortx-text-secondary hover:bg-cortx-elevated hover:text-cortx-text-primary transition-colors cursor-pointer group"
        >
          <FileText size={14} className="flex-shrink-0 text-cortx-text-secondary/50 group-hover:text-cortx-accent" />
          <span className="truncate">{file.title}</span>
          {file.type && (
            <span className="ml-auto text-2xs text-cortx-text-secondary/40 capitalize">{file.type}</span>
          )}
        </button>
      ))}
    </div>
  )
}
