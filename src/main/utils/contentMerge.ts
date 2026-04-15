/**
 * contentMerge.ts
 * ---------------
 * Pure functions for merging LLM-proposed content into existing Markdown files.
 * No filesystem, DB, or Electron dependencies — fully unit-testable.
 */

import matter from 'gray-matter'

// ---------------------------------------------------------------------------
// Heading normalisation
// ---------------------------------------------------------------------------

/** Strip diacritics, heading markers, and lowercase — used for section lookup. */
export function normalizeHeading(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^#+\s*/, '')
    .toLowerCase()
    .trim()
}

// ---------------------------------------------------------------------------
// Section-level operations
// ---------------------------------------------------------------------------

/**
 * Locate a named section in `body` and apply `operation` to its content.
 * Comparison is accent- and case-insensitive.
 * If the section does not exist, it is appended at the end as `## <sectionName>`.
 */
export function modifySection(
  body: string,
  sectionName: string,
  content: string,
  operation: string
): string {
  const lines = body.split('\n')
  const normalizedTarget = normalizeHeading(sectionName)
  let sectionStart = -1
  let sectionLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (match && normalizeHeading(match[2]) === normalizedTarget) {
      sectionStart = i
      sectionLevel = match[1].length
      break
    }
  }

  const sectionClean = sectionName.replace(/^#+\s*/, '')
  if (sectionStart === -1) return body + `\n\n## ${sectionClean}\n${content}`

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= sectionLevel) {
      sectionEnd = i
      break
    }
  }

  if (operation === 'prepend') lines.splice(sectionStart + 1, 0, content)
  else if (operation === 'replace') lines.splice(sectionStart + 1, sectionEnd - sectionStart - 1, content)
  else lines.splice(sectionEnd, 0, content) // append (default)

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Safe append
// ---------------------------------------------------------------------------

/**
 * Append `newContent` into `existingBody` without overwriting anything.
 *
 * Rules:
 * - Strips frontmatter from `newContent` if present.
 * - Deduplicates lines already present in the body.
 * - If `newContent` has headings matching existing sections (accent/case-insensitive),
 *   appends the deduped lines under those sections.
 * - Otherwise appends deduped content at the end.
 * - Suppresses top-level H1 that is an exact duplicate of an existing H1.
 */
export function safeAppend(existingBody: string, newContent: string): string {
  let clean = newContent
  if (clean.trimStart().startsWith('---')) {
    try { clean = matter(clean).content } catch { /* keep as-is */ }
  }
  clean = clean.trim()
  if (!clean) return existingBody

  const existingLineSet = new Set(
    existingBody.split('\n').map((l) => l.trim()).filter(Boolean)
  )

  const lines = clean.split('\n')
  const sections: Array<{ heading: string | null; level: number; lines: string[] }> = []
  let current: { heading: string | null; level: number; lines: string[] } = { heading: null, level: 0, lines: [] }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (headingMatch) {
      if (current.lines.length || current.heading) sections.push(current)
      current = { heading: headingMatch[2].trim(), level: headingMatch[1].length, lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.length || current.heading) sections.push(current)

  let result = existingBody

  for (const sec of sections) {
    // Suppress duplicate H1
    if (sec.heading && sec.level === 1) {
      const existingH1 = result.split('\n').some(line => {
        const m = line.match(/^#\s+(.+)$/)
        return m && normalizeHeading(m[1]) === normalizeHeading(sec.heading!)
      })
      if (existingH1 && sec.lines.every((l) => !l.trim() || existingLineSet.has(l.trim()))) {
        continue
      }
    }

    // Dedupe lines
    const dedupedLines: string[] = []
    for (const ln of sec.lines) {
      const t = ln.trim()
      if (!t) {
        dedupedLines.push(ln)
      } else if (!existingLineSet.has(t)) {
        dedupedLines.push(ln)
        existingLineSet.add(t)
      }
    }
    const addition = dedupedLines.join('\n').trim()
    if (!addition && !sec.heading) continue

    if (sec.heading) {
      const normalizedTarget = normalizeHeading(sec.heading)
      const hasSection = result.split('\n').some(line => {
        const m = line.match(/^(#{1,6})\s+(.+)$/)
        return m && normalizeHeading(m[2]) === normalizedTarget
      })
      if (hasSection) {
        if (addition) result = modifySection(result, sec.heading, addition, 'append')
      } else {
        result = result.trimEnd() + `\n\n## ${sec.heading}\n${addition}`.trimEnd()
        existingLineSet.add(`## ${sec.heading}`.trim())
      }
    } else if (addition) {
      result = result.trimEnd() + '\n\n' + addition
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface MergeAction {
  content: string
  section?: string
  operation?: string
  oldContent?: string
  old_content?: string
}

/**
 * Compute the merged file content without writing to disk.
 * Called by AgentPipeline.preview() and AgentPipeline.execute().
 */
export function computeModifiedContent(existingRaw: string, action: MergeAction): string {
  if (!existingRaw) return action.content

  const hasFrontmatter = existingRaw.trimStart().startsWith('---')
  const oldContent = action.oldContent || action.old_content
  const operation = action.operation?.toLowerCase()

  const parsed = matter(existingRaw)
  let body = parsed.content
  const data = parsed.data as Record<string, unknown>

  // --- Frontmatter modifications ---
  if (action.section?.startsWith('frontmatter.')) {
    const field = action.section.replace('frontmatter.', '')
    if (operation === 'add_item') {
      const current = (data[field] as string[]) || []
      const newItem = action.content.replace(/^"|"$/g, '')
      if (!current.includes(newItem)) current.push(newItem)
      data[field] = current
    } else {
      data[field] = action.content
    }
    data.modified = new Date().toISOString().split('T')[0]
    return hasFrontmatter ? matter.stringify(body, data) : body
  }

  // --- Body modifications ---

  if (operation === 'replace_line' && oldContent) {
    body = body.replace(oldContent, action.content)
  } else if (operation === 'replace') {
    if (action.section && action.section !== 'root') {
      body = modifySection(body, action.section, action.content, 'replace')
    } else {
      body = action.content
    }
  } else if (operation === 'prepend') {
    if (action.section && action.section !== 'root') {
      body = modifySection(body, action.section, action.content, 'prepend')
    } else {
      body = action.content + '\n' + body
    }
  } else if (action.section && action.section !== 'root') {
    body = modifySection(body, action.section, action.content, operation || 'append')
  } else {
    body = safeAppend(body, action.content)
  }

  if (hasFrontmatter) {
    data.modified = new Date().toISOString().split('T')[0]
    return matter.stringify(body, data)
  }
  return body.trimStart()
}
