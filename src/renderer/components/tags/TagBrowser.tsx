import { useEffect, useState, useCallback } from 'react'
import { Hash, FileText } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n'

interface TagInfo {
  tag: string
  count: number
}

interface TagFile {
  path: string
  title: string
  snippet?: string
}

export function TagBrowser(): React.JSX.Element {
  const [tags, setTags] = useState<TagInfo[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [tagFiles, setTagFiles] = useState<TagFile[]>([])
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const t = useT()

  const loadTags = useCallback(async () => {
    try {
      const result = await window.cortx.db.getTags()
      setTags(result)
    } catch {
      // ignore
    }
  }, [])

  // Reload tags on mount and whenever main process signals a KB change
  useEffect(() => {
    loadTags()
    window.cortx.on('db:changed', loadTags)
    return () => window.cortx.off('db:changed', loadTags)
  }, [loadTags])

  async function selectTag(tag: string): Promise<void> {
    setSelectedTag(tag)
    try {
      const files = await window.cortx.db.search(tag)
      setTagFiles(files.map((f) => ({ path: f.path, title: f.title, snippet: f.snippet })))
    } catch {
      setTagFiles([])
    }
  }

  if (tags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-14 h-14 rounded-full bg-cortx-surface flex items-center justify-center mb-4">
          <Hash size={28} className="text-cortx-text-secondary/40" />
        </div>
        <h3 className="text-sm font-medium text-cortx-text-secondary mb-1">{t.tags.noTags}</h3>
        <p className="text-xs text-cortx-text-secondary/60 max-w-[280px]">
          {t.tags.noTagsHint}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Tags grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button
              key={t.tag}
              onClick={() => selectTag(t.tag)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer transition-colors ${
                selectedTag === t.tag
                  ? 'bg-cortx-accent text-white'
                  : 'bg-cortx-surface text-cortx-text-secondary hover:bg-cortx-elevated hover:text-cortx-text-primary'
              }`}
            >
              <Hash size={11} />
              {t.tag}
              <span className="text-2xs opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* File list for selected tag */}
      {selectedTag && (
        <div className="w-64 border-l border-cortx-border overflow-y-auto">
          <div className="px-3 py-2 border-b border-cortx-border sticky top-0 bg-cortx-surface">
            <span className="text-xs font-medium text-cortx-text-secondary">
              #{selectedTag} ({tagFiles.length})
            </span>
          </div>
          <div className="p-2 space-y-0.5">
            {tagFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => openFilePreview(file.path)}
                className="flex flex-col gap-0.5 w-full text-left px-2 py-1.5 rounded hover:bg-cortx-elevated transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText size={12} className="flex-shrink-0 text-cortx-text-secondary" />
                  <span className="text-xs text-cortx-text-secondary truncate">{file.title}</span>
                </div>
                {file.snippet && (
                  <p className="text-2xs text-cortx-text-secondary/50 line-clamp-2 pl-5 leading-relaxed">
                    {file.snippet.replace(/\*\*/g, '')}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
