import { describe, it, expect } from 'vitest'
import {
  normalizeHeading,
  modifySection,
  safeAppend,
  computeModifiedContent,
} from '../contentMerge'

// ---------------------------------------------------------------------------
// normalizeHeading
// ---------------------------------------------------------------------------

describe('normalizeHeading', () => {
  it('lowercases ASCII headings', () => {
    expect(normalizeHeading('Compétences')).toBe('competences')
  })

  it('strips diacritics', () => {
    expect(normalizeHeading('Réseau')).toBe('reseau')
    expect(normalizeHeading('Données')).toBe('donnees')
  })

  it('strips leading # markers', () => {
    expect(normalizeHeading('## Formation')).toBe('formation')
  })

  it('trims whitespace', () => {
    expect(normalizeHeading('  Skills  ')).toBe('skills')
  })

  it('two headings differing only in accent compare equal', () => {
    expect(normalizeHeading('Compétences')).toBe(normalizeHeading('Competences'))
    expect(normalizeHeading('réseau')).toBe(normalizeHeading('Reseau'))
  })
})

// ---------------------------------------------------------------------------
// modifySection
// ---------------------------------------------------------------------------

describe('modifySection', () => {
  const body = `# Alice

## Skills
- TypeScript

## Experience
Old job
`

  it('appends content under matching section', () => {
    const result = modifySection(body, 'Skills', '- Rust', 'append')
    expect(result).toContain('- TypeScript')
    expect(result).toContain('- Rust')
    // Rust comes after TypeScript
    expect(result.indexOf('- Rust')).toBeGreaterThan(result.indexOf('- TypeScript'))
  })

  it('replaces section content', () => {
    const result = modifySection(body, 'Skills', '- Go', 'replace')
    expect(result).not.toContain('- TypeScript')
    expect(result).toContain('- Go')
  })

  it('prepends content under matching section', () => {
    const result = modifySection(body, 'Skills', '- Go', 'prepend')
    expect(result.indexOf('- Go')).toBeLessThan(result.indexOf('- TypeScript'))
  })

  it('creates section when it does not exist', () => {
    const result = modifySection(body, 'Education', 'MIT', 'append')
    expect(result).toContain('## Education\nMIT')
  })

  it('matches section case-insensitively', () => {
    const result = modifySection(body, 'skills', '- Python', 'append')
    expect(result).toContain('- Python')
  })

  it('matches section accent-insensitively', () => {
    const bodyFr = `# Bob\n\n## Compétences\n- JS\n`
    const result = modifySection(bodyFr, 'Competences', '- TS', 'append')
    expect(result).toContain('- TS')
    expect(result).toContain('- JS')
  })
})

// ---------------------------------------------------------------------------
// safeAppend
// ---------------------------------------------------------------------------

describe('safeAppend', () => {
  it('appends new lines to body', () => {
    const result = safeAppend('Existing line\n', 'New line')
    expect(result).toContain('Existing line')
    expect(result).toContain('New line')
  })

  it('deduplicates lines already present', () => {
    const existing = 'Line A\nLine B\n'
    const result = safeAppend(existing, 'Line A\nLine C')
    const count = (result.match(/Line A/g) || []).length
    expect(count).toBe(1)
    expect(result).toContain('Line C')
  })

  it('appends new content under a matching section (case-insensitive)', () => {
    const existing = '# Doc\n\n## Skills\n- JS\n'
    const result = safeAppend(existing, '## skills\n- Python')
    expect(result).toContain('- JS')
    expect(result).toContain('- Python')
    // No duplicate heading
    expect((result.match(/## [Ss]kills/gi) || []).length).toBe(1)
  })

  it('appends new content under a matching section (accent-insensitive)', () => {
    const existing = '# Doc\n\n## Compétences\n- JS\n'
    const result = safeAppend(existing, '## Competences\n- Python')
    expect(result).toContain('- Python')
    // Still only one section heading
    const headingCount = (result.match(/## Comp/gi) || []).length
    expect(headingCount).toBe(1)
  })

  it('creates a new section when heading is not found', () => {
    const existing = '# Doc\n\n## Skills\n- JS\n'
    const result = safeAppend(existing, '## Education\nMIT')
    expect(result).toContain('## Education\nMIT')
    expect(result).toContain('## Skills')
  })

  it('suppresses duplicate top-level H1 when all lines are already present', () => {
    const existing = '# Alice\n\nSome content\n'
    const result = safeAppend(existing, '# Alice\n\nSome content')
    const h1Count = (result.match(/^# Alice/gm) || []).length
    expect(h1Count).toBe(1)
  })

  it('strips incoming frontmatter before appending', () => {
    const existing = 'Body text\n'
    const incoming = '---\ntitle: Test\n---\nNew paragraph'
    const result = safeAppend(existing, incoming)
    expect(result).toContain('New paragraph')
    expect(result).not.toContain('title: Test')
  })

  it('returns existing body unchanged when new content is empty', () => {
    const existing = 'Hello world\n'
    expect(safeAppend(existing, '')).toBe(existing)
    expect(safeAppend(existing, '   ')).toBe(existing)
  })
})

// ---------------------------------------------------------------------------
// computeModifiedContent
// ---------------------------------------------------------------------------

describe('computeModifiedContent', () => {
  it('returns new content when existing is empty', () => {
    expect(computeModifiedContent('', { content: 'Hello' })).toBe('Hello')
  })

  it('operation replace (no section) replaces entire body', () => {
    const existing = '# Old\n\nOld body\n'
    const result = computeModifiedContent(existing, { content: 'New body', operation: 'replace' })
    expect(result).not.toContain('Old body')
    expect(result).toContain('New body')
  })

  it('operation replace with section replaces section content', () => {
    const existing = '# Doc\n\n## Skills\n- JS\n\n## Other\nStuff\n'
    const result = computeModifiedContent(existing, {
      content: '- Rust',
      section: 'Skills',
      operation: 'replace',
    })
    expect(result).not.toContain('- JS')
    expect(result).toContain('- Rust')
    expect(result).toContain('## Other')
  })

  it('operation replace_line replaces specific old line', () => {
    const existing = '# Doc\n\nOld line here\nAnother line\n'
    const result = computeModifiedContent(existing, {
      content: 'New line here',
      operation: 'replace_line',
      old_content: 'Old line here',
    })
    expect(result).not.toContain('Old line here')
    expect(result).toContain('New line here')
    expect(result).toContain('Another line')
  })

  it('operation prepend (no section) prepends to body', () => {
    const existing = '# Doc\n\nLast line\n'
    const result = computeModifiedContent(existing, { content: 'First line', operation: 'prepend' })
    expect(result.indexOf('First line')).toBeLessThan(result.indexOf('Last line'))
  })

  it('section append adds content under the named section', () => {
    const existing = '# Doc\n\n## Notes\nExisting note\n'
    const result = computeModifiedContent(existing, { content: 'New note', section: 'Notes' })
    expect(result).toContain('Existing note')
    expect(result).toContain('New note')
  })

  it('no section no operation → safe append (dedupes)', () => {
    const existing = '# Doc\n\nLine A\n'
    const result = computeModifiedContent(existing, { content: 'Line A\nLine B' })
    const count = (result.match(/Line A/g) || []).length
    expect(count).toBe(1)
    expect(result).toContain('Line B')
  })

  it('updates frontmatter field', () => {
    const existing = '---\ntitle: Alice\nstatus: actif\n---\n\n# Alice\n'
    const result = computeModifiedContent(existing, {
      content: 'archivé',
      section: 'frontmatter.status',
    })
    expect(result).toContain('archivé')
    expect(result).not.toContain('actif')
  })

  it('adds item to frontmatter array field', () => {
    const existing = '---\ntitle: Alice\ntags:\n  - dev\n---\n\n# Alice\n'
    const result = computeModifiedContent(existing, {
      content: 'design',
      section: 'frontmatter.tags',
      operation: 'add_item',
    })
    expect(result).toContain('dev')
    expect(result).toContain('design')
  })

  it('does not add duplicate to frontmatter array', () => {
    const existing = '---\ntitle: Alice\ntags:\n  - dev\n---\n\n# Alice\n'
    const result = computeModifiedContent(existing, {
      content: 'dev',
      section: 'frontmatter.tags',
      operation: 'add_item',
    })
    const count = (result.match(/dev/g) || []).length
    expect(count).toBe(1)
  })
})
