import { Hash } from 'lucide-react'

interface TagCloudProps {
  tags: Array<{ tag: string; count: number }>
  onSelect: (tag: string) => void
  selectedTag: string | null
}

export function TagCloud({ tags, onSelect, selectedTag }: TagCloudProps): React.JSX.Element {
  const maxCount = Math.max(...tags.map((t) => t.count), 1)

  return (
    <div className="flex flex-wrap gap-2 p-4">
      {tags.map((t) => {
        const scale = 0.75 + (t.count / maxCount) * 0.5
        const isActive = selectedTag === t.tag
        return (
          <button
            key={t.tag}
            onClick={() => onSelect(t.tag)}
            className={`flex items-center gap-1 rounded-full transition-all cursor-pointer ${
              isActive
                ? 'bg-cortx-accent text-white'
                : 'bg-cortx-surface text-cortx-text-secondary hover:bg-cortx-elevated'
            }`}
            style={{
              fontSize: `${scale}rem`,
              padding: `${4 * scale}px ${10 * scale}px`
            }}
          >
            <Hash size={10 * scale} />
            {t.tag}
          </button>
        )
      })}
    </div>
  )
}
