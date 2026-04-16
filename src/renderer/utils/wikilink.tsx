import React from 'react'
import type { CortxFile } from '../../shared/types'
import { useFileStore } from '../stores/fileStore'
import { useUIStore } from '../stores/uiStore'

/**
 * Resolve a wikilink name (e.g. "Sophie Martin" or "Sophie_Martin") to an
 * actual file path from the indexed file list. Matches by title, then by
 * normalized basename. Returns null if no match is found.
 */
export function resolveWikilink(name: string, files: CortxFile[]): string | null {
  const raw = name.trim()
  if (!raw) return null

  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/\.md$/, '')
      .replace(/[\s_\-]+/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const target = normalize(raw)

  // 1. Exact title match
  for (const f of files) {
    if (f.title && normalize(f.title) === target) return f.path
  }
  // 2. Basename match
  for (const f of files) {
    const basename = (f.path.split(/[\\/]/).pop() || '').replace(/\.md$/, '')
    if (normalize(basename) === target) return f.path
  }
  // 3. Basename "contains" (useful when the link uses a partial name)
  for (const f of files) {
    const basename = (f.path.split(/[\\/]/).pop() || '').replace(/\.md$/, '')
    if (normalize(basename).includes(target)) return f.path
  }
  return null
}

/**
 * Display label for a wikilink — strip extension, replace underscores with spaces.
 */
export function wikilinkLabel(name: string): string {
  return name.replace(/\.md$/, '').replace(/_/g, ' ').trim()
}

/**
 * Coerce arbitrary LLM-produced values to a renderable string.
 * The agent sometimes returns arrays or objects in fields typed as strings
 * (e.g. `summary: ["line1", "line2"]`) — we join them instead of crashing.
 */
function toDisplayString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(toDisplayString).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }
  return String(value)
}

/**
 * Inline renderer: takes a plain text string, splits it on wikilink syntax,
 * and returns a React fragment where each `[[Name]]` becomes a clickable
 * button that opens the corresponding file in the preview pane.
 *
 * Brackets are never shown to the user.
 *
 * Accepts `unknown` at runtime — LLM outputs drift (arrays, objects) and we
 * must not crash the whole chat over a typing mismatch.
 */
export function WikiText({ text }: { text: unknown }): React.JSX.Element {
  const files = useFileStore((s) => s.files)
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const addToast = useUIStore((s) => s.addToast)

  const safeText = toDisplayString(text)
  if (!safeText) return <></>

  const parts = safeText.split(/(\[\[[^\]]+\]\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[\[([^\]]+)\]\]$/)
        if (!match) return <React.Fragment key={i}>{part}</React.Fragment>

        const name = match[1]
        const label = wikilinkLabel(name)

        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const resolved = resolveWikilink(name, files)
              if (resolved) {
                openFilePreview(resolved)
              } else {
                addToast(`Fichier "${label}" introuvable`, 'info')
              }
            }}
            className="text-cortx-accent hover:text-cortx-accent-light underline decoration-cortx-accent/30 hover:decoration-cortx-accent cursor-pointer transition-colors inline"
          >
            {label}
          </button>
        )
      })}
    </>
  )
}
