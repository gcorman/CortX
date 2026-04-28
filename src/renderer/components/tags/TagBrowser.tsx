import { useEffect, useState, useCallback, useMemo } from 'react'
import { Hash, FileText, Search, X, ChevronDown } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n'
import type { CortxFile } from '../../../../shared/types'

interface TagInfo {
  tag: string
  count: number
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  personne:   { bg: 'bg-blue-500/15',    text: 'text-blue-300' },
  entreprise: { bg: 'bg-violet-500/15',  text: 'text-violet-300' },
  domaine:    { bg: 'bg-amber-500/15',   text: 'text-amber-300' },
  projet:     { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  journal:    { bg: 'bg-rose-500/15',    text: 'text-rose-300' },
  note:       { bg: 'bg-slate-500/15',   text: 'text-slate-300' },
}

// 4-tier scale: size of pill grows with tag frequency relative to max
function tagTier(count: number, max: number): 1 | 2 | 3 | 4 {
  const r = count / max
  if (r > 0.75) return 4
  if (r > 0.5)  return 3
  if (r > 0.25) return 2
  return 1
}

const TIER_TEXT_CLASS = ['', 'text-[11px]', 'text-xs', 'text-sm', 'text-sm']
const TIER_PAD_CLASS  = ['', 'py-1 px-2.5', 'py-1.5 px-3', 'py-1.5 px-3.5 font-medium', 'py-2 px-4 font-semibold']
const TIER_HASH_SIZE  = [0, 10, 11, 13, 14]

const GLASS_BASE = {
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
} as const

export function TagBrowser(): React.JSX.Element {
  const [tags, setTags]           = useState<TagInfo[]>([])
  const [selectedTag, setSelected] = useState<string | null>(null)
  const [tagFiles, setTagFiles]   = useState<CortxFile[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const t = useT()

  const loadTags = useCallback(async () => {
    try { setTags(await window.cortx.db.getTags()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadTags()
    window.cortx.on('db:changed', loadTags)
    return () => window.cortx.off('db:changed', loadTags)
  }, [loadTags])

  async function selectTag(tag: string): Promise<void> {
    if (selectedTag === tag) { setSelected(null); setTagFiles([]); return }
    setSelected(tag)
    setLoading(true)
    try { setTagFiles(await window.cortx.db.getFilesByTag(tag)) }
    catch { setTagFiles([]) }
    finally { setLoading(false) }
  }

  const filteredTags = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? tags.filter((t) => t.tag.toLowerCase().includes(q)) : tags
  }, [tags, search])

  const maxCount = useMemo(() => Math.max(...tags.map((t) => t.count), 1), [tags])

  if (tags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ ...GLASS_BASE, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Hash size={28} className="text-cortx-text-secondary/40" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-cortx-text-secondary mb-1">{t.tags.noTags}</h3>
          <p className="text-xs text-cortx-text-secondary/50 max-w-[260px] leading-relaxed">{t.tags.noTagsHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* Stats strip */}
      <div className="flex-shrink-0 px-4 py-2.5 flex items-center gap-2.5 border-b border-white/[0.06]">
        <StatPill value={String(tags.length)} label={t.tags.uniqueTags} accent />
        {tags[0] && (
          <StatPill value={`#${tags[0].tag}`} label={`${t.tags.topTag} · ${tags[0].count} ${t.tags.filesWithTag}`} />
        )}
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-4 py-2.5">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-cortx-text-secondary/40 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.tags.filter}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-input text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent/40 transition-colors duration-200"
            style={{ ...GLASS_BASE, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cortx-text-secondary/40 hover:text-cortx-text-primary transition-colors cursor-pointer">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tag cloud */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filteredTags.length === 0 ? (
          <p className="text-xs text-cortx-text-secondary/40 text-center mt-8">—</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {filteredTags.map((tagInfo) => (
              <TagPill
                key={tagInfo.tag}
                tagInfo={tagInfo}
                tier={tagTier(tagInfo.count, maxCount)}
                isSelected={selectedTag === tagInfo.tag}
                onSelect={selectTag}
              />
            ))}
          </div>
        )}
      </div>

      {/* File panel for selected tag */}
      {selectedTag && (
        <div className="flex-shrink-0 border-t border-white/[0.08]" style={{ maxHeight: '280px' }}>
          <div
            className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]"
            style={{ ...GLASS_BASE, background: 'rgba(255,255,255,0.03)' }}
          >
            <div className="flex items-center gap-2">
              <Hash size={13} className="text-cortx-accent" />
              <span className="text-xs font-semibold text-cortx-text-primary">{selectedTag}</span>
              {!loading && (
                <span className="text-2xs px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/50">
                  {tagFiles.length} {t.tags.filesWithTag}
                </span>
              )}
            </div>
            <button
              onClick={() => { setSelected(null); setTagFiles([]) }}
              className="text-cortx-text-secondary/40 hover:text-cortx-text-primary transition-colors cursor-pointer rounded p-0.5"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-4 h-4 rounded-full border-2 border-cortx-accent/30 border-t-cortx-accent animate-spin" />
              </div>
            ) : tagFiles.length === 0 ? (
              <p className="text-xs text-cortx-text-secondary/40 text-center py-6">—</p>
            ) : (
              <div className="p-2 space-y-0.5">
                {tagFiles.map((file) => {
                  const c = TYPE_COLORS[file.type] ?? TYPE_COLORS.note
                  return (
                    <button
                      key={file.path}
                      onClick={() => openFilePreview(file.path)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-input text-left hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer"
                    >
                      <FileText size={13} className="flex-shrink-0 text-cortx-text-secondary/50" />
                      <span className="flex-1 text-xs text-cortx-text-primary truncate">{file.title}</span>
                      <span className={`text-2xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.bg} ${c.text}`}>
                        {file.type}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hint footer */}
      {!selectedTag && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-white/[0.06] text-center">
          <p className="text-2xs text-cortx-text-secondary/30">{t.tags.clickHint}</p>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatPill({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-input ${
        accent
          ? 'bg-cortx-accent/[0.12] border border-cortx-accent/25'
          : 'bg-white/[0.04] border border-white/[0.07]'
      }`}
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <span className={`text-xs font-bold ${accent ? 'text-cortx-accent' : 'text-cortx-text-primary'}`}>
        {value}
      </span>
      <span className="text-2xs text-cortx-text-secondary/50">{label}</span>
    </div>
  )
}

interface TagPillProps {
  tagInfo: TagInfo
  tier: 1 | 2 | 3 | 4
  isSelected: boolean
  onSelect: (tag: string) => void
}

function TagPill({ tagInfo, tier, isSelected, onSelect }: TagPillProps) {
  return (
    <button
      onClick={() => onSelect(tagInfo.tag)}
      className={`group flex items-center gap-1.5 rounded-full cursor-pointer transition-all duration-200 ${TIER_TEXT_CLASS[tier]} ${TIER_PAD_CLASS[tier]} ${
        isSelected
          ? 'bg-cortx-accent/20 border border-cortx-accent/50 text-cortx-accent shadow-[0_0_12px_rgba(var(--cortx-accent)/0.2)]'
          : tier >= 3
          ? 'bg-white/[0.07] border border-white/[0.09] text-white/85 hover:bg-white/[0.12] hover:border-white/[0.18] hover:-translate-y-px'
          : 'bg-white/[0.04] border border-white/[0.08] text-white/55 hover:bg-white/[0.10] hover:border-white/[0.16] hover:-translate-y-px'
      }`}
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <Hash size={TIER_HASH_SIZE[tier]} className="flex-shrink-0" />
      <span>{tagInfo.tag}</span>
      <span
        className="rounded-full px-1.5 font-medium leading-4"
        style={{
          fontSize: '10px',
          background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
          color: isSelected ? 'inherit' : 'rgba(255,255,255,0.45)',
        }}
      >
        {tagInfo.count}
      </span>
    </button>
  )
}
