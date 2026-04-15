/**
 * actionNormalize.ts
 * ------------------
 * Pure functions for normalising raw LLM action objects into canonical form.
 * No filesystem, DB, or Electron dependencies — fully unit-testable.
 */

import { TYPE_TO_DIR, KNOWN_DIRS, DIR_ALIASES } from '../../shared/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawAction {
  action?: string
  type?: string
  file?: string
  path?: string
  filename?: string
  filepath?: string
  content?: string
  section?: string
  operation?: string
  old_content?: string
}

export interface NormalizedAction {
  action: string
  file: string
  content: string
  section?: string
  operation?: string
  old_content?: string
}

// ---------------------------------------------------------------------------
// Action type normalisation
// ---------------------------------------------------------------------------

/**
 * Map every verb variant a LLM might emit (French or English) to either
 * 'create' or 'modify'. Unknown verbs are returned as-is (lowercased).
 */
export function normalizeActionType(action: string): string {
  const lower = action.toLowerCase().trim()
  if ([
    'create', 'créer', 'creer', 'new', 'add', 'create_file',
    'insert', 'write', 'generate', 'make',
  ].includes(lower)) return 'create'
  if ([
    'modify', 'modifier', 'update', 'edit', 'append', 'modify_file', 'change',
    'patch', 'amend', 'revise', 'upsert',
  ].includes(lower)) return 'modify'
  return lower
}

// ---------------------------------------------------------------------------
// Full action normalisation pipeline
// ---------------------------------------------------------------------------

/**
 * Normalise a raw array of LLM-emitted actions into canonical form:
 *  - Unify field name variants (file/path/filename/filepath → file)
 *  - Normalise action verb (créer → create, etc.)
 *  - Route files into their canonical KB directory based on entity type
 *    or directory alias (handles accents, wrong casing, English equivalents)
 *  - Sanitise the file path (strip Windows-illegal chars, ensure .md)
 *  - Guard Fiches/ writes (reserved for saveBrief pipeline)
 *  - Filter actions with missing file paths
 */
export function normalizeActions(rawActions: RawAction[]): NormalizedAction[] {
  return rawActions
    .map((a) => ({
      action:     normalizeActionType(a.action || a.type || 'create'),
      file:       a.file || a.path || a.filename || a.filepath || '',
      content:    a.content || '',
      section:    a.section,
      operation:  a.operation,
      old_content: a.old_content,
    }))
    .filter((a) => {
      if (!a.file) {
        console.warn('[normalizeActions] Skipping action with missing file path:', a)
        return false
      }
      return true
    })
    .map((a) => {
      // Sanitise: forward slashes, strip Windows-illegal chars, ensure .md
      a.file = a.file.replace(/\\/g, '/').replace(/[<>:"|?*]/g, '').trim()
      if (!a.file.endsWith('.md')) {
        a.file = `${a.file.replace(/\s+/g, '_')}.md`
      }

      // Detect entity type from the frontmatter block inside the content
      const typeMatch = a.content.match(
        /^\s*type:\s*['"]?(personne|entreprise|domaine|projet|journal|note|fiche)['"]?/im
      )
      const detectedType = typeMatch?.[1].toLowerCase()

      // Decompose the file path
      const segments = a.file.split('/').filter(Boolean)
      const filename  = segments.pop() || a.file
      const rawDir    = segments.join('/')
      const firstSeg  = segments[0]?.toLowerCase()
      const aliasedDir = firstSeg ? DIR_ALIASES[firstSeg] : undefined

      // Routing priority:
      //  1. Known entity type → force canonical directory
      //  2. Directory is a known alias → normalise it
      //  3. No directory → default to Journal/
      //  4. Unknown top-level dir → reroute to Journal/
      if (detectedType && detectedType !== 'fiche' && TYPE_TO_DIR[detectedType]) {
        a.file = `${TYPE_TO_DIR[detectedType]}/${filename}`
      } else if (aliasedDir) {
        const rest = segments.slice(1).join('/')
        a.file = rest ? `${aliasedDir}/${rest}/${filename}` : `${aliasedDir}/${filename}`
      } else if (!rawDir) {
        a.file = `Journal/${filename}`
      } else if (!KNOWN_DIRS.includes(segments[0])) {
        a.file = `Journal/${filename}`
      }

      // Final guard: Fiches/ is reserved for the saveBrief pipeline
      if (a.file.startsWith('Fiches/')) {
        const fallback = detectedType && TYPE_TO_DIR[detectedType]
          ? TYPE_TO_DIR[detectedType]
          : 'Journal'
        a.file = `${fallback}/${filename}`
        console.warn(`[normalizeActions] Re-routed Fiches/ write to ${a.file}`)
      }

      return a
    })
}
