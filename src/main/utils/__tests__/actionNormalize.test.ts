import { describe, it, expect } from 'vitest'
import { normalizeActionType, normalizeActions } from '../actionNormalize'

// ---------------------------------------------------------------------------
// normalizeActionType
// ---------------------------------------------------------------------------

describe('normalizeActionType', () => {
  it('maps English create verbs', () => {
    for (const v of ['create', 'new', 'add', 'insert', 'write', 'generate', 'make']) {
      expect(normalizeActionType(v)).toBe('create')
    }
  })

  it('maps French create verbs', () => {
    expect(normalizeActionType('créer')).toBe('create')
    expect(normalizeActionType('creer')).toBe('create')
  })

  it('maps English modify verbs', () => {
    for (const v of ['modify', 'update', 'edit', 'patch', 'amend', 'revise', 'upsert', 'change']) {
      expect(normalizeActionType(v)).toBe('modify')
    }
  })

  it('maps French modify verbs', () => {
    expect(normalizeActionType('modifier')).toBe('modify')
  })

  it('is case-insensitive', () => {
    expect(normalizeActionType('CREATE')).toBe('create')
    expect(normalizeActionType('Modifier')).toBe('modify')
  })

  it('returns unknown verbs as-is (lowercased)', () => {
    expect(normalizeActionType('delete')).toBe('delete')
  })
})

// ---------------------------------------------------------------------------
// normalizeActions — file routing
// ---------------------------------------------------------------------------

describe('normalizeActions — entity type routing', () => {
  it('routes personne type to Reseau/', () => {
    const result = normalizeActions([{
      action: 'create',
      file: 'some-random/alice.md',
      content: 'type: personne\ntitle: Alice',
    }])
    expect(result[0].file).toBe('Reseau/alice.md')
  })

  it('routes note type to Journal/ (not Reseau/)', () => {
    const result = normalizeActions([{
      action: 'create',
      file: 'anywhere/note.md',
      content: 'type: note\ntitle: A note',
    }])
    expect(result[0].file).toBe('Journal/note.md')
  })

  it('routes entreprise type to Entreprises/', () => {
    const result = normalizeActions([{
      action: 'create',
      file: 'company.md',
      content: 'type: entreprise\ntitle: Acme',
    }])
    expect(result[0].file).toBe('Entreprises/company.md')
  })

  it('routes domaine type to Domaines/', () => {
    const result = normalizeActions([{
      action: 'create',
      file: 'topic.md',
      content: 'type: domaine',
    }])
    expect(result[0].file).toBe('Domaines/topic.md')
  })
})

describe('normalizeActions — directory alias normalisation', () => {
  it('normalises accented "réseau" → Reseau/', () => {
    const result = normalizeActions([{ action: 'create', file: 'réseau/alice.md', content: '' }])
    expect(result[0].file).toBe('Reseau/alice.md')
  })

  it('normalises English "network" → Reseau/', () => {
    const result = normalizeActions([{ action: 'create', file: 'network/alice.md', content: '' }])
    expect(result[0].file).toBe('Reseau/alice.md')
  })

  it('normalises "projects" → Projets/', () => {
    const result = normalizeActions([{ action: 'create', file: 'projects/my-project.md', content: '' }])
    expect(result[0].file).toBe('Projets/my-project.md')
  })

  it('normalises "companies" → Entreprises/', () => {
    const result = normalizeActions([{ action: 'create', file: 'companies/acme.md', content: '' }])
    expect(result[0].file).toBe('Entreprises/acme.md')
  })
})

describe('normalizeActions — default and fallback routing', () => {
  it('defaults to Journal/ when no directory is given', () => {
    const result = normalizeActions([{ action: 'create', file: 'random-note.md', content: '' }])
    expect(result[0].file).toBe('Journal/random-note.md')
  })

  it('re-routes unknown top-level dir to Journal/', () => {
    const result = normalizeActions([{ action: 'create', file: 'unknown-dir/file.md', content: '' }])
    expect(result[0].file).toBe('Journal/file.md')
  })

  it('guards Fiches/ write — re-routes to Journal when no type', () => {
    const result = normalizeActions([{ action: 'create', file: 'Fiches/insight.md', content: '' }])
    expect(result[0].file).toBe('Journal/insight.md')
  })

  it('guards Fiches/ write — re-routes to canonical dir when type is known', () => {
    const result = normalizeActions([{
      action: 'create',
      file: 'Fiches/alice.md',
      content: 'type: personne',
    }])
    expect(result[0].file).toBe('Reseau/alice.md')
  })
})

describe('normalizeActions — path sanitisation', () => {
  it('strips Windows-illegal characters', () => {
    const result = normalizeActions([{ action: 'create', file: 'Journal/fi<le>:na|me.md', content: '' }])
    expect(result[0].file).not.toMatch(/[<>:|]/)
  })

  it('adds .md extension when missing', () => {
    const result = normalizeActions([{ action: 'create', file: 'Journal/note', content: '' }])
    expect(result[0].file.endsWith('.md')).toBe(true)
  })

  it('replaces spaces with underscores in filename', () => {
    const result = normalizeActions([{ action: 'create', file: 'Journal/my note', content: '' }])
    expect(result[0].file).toBe('Journal/my_note.md')
  })

  it('filters out actions with missing file path', () => {
    const result = normalizeActions([
      { action: 'create', file: '', content: '' },
      { action: 'create', file: 'Journal/valid.md', content: '' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].file).toBe('Journal/valid.md')
  })
})

describe('normalizeActions — action verb normalisation', () => {
  it('normalises créer to create', () => {
    const result = normalizeActions([{ action: 'créer', file: 'Journal/f.md', content: '' }])
    expect(result[0].action).toBe('create')
  })

  it('normalises modifier to modify', () => {
    const result = normalizeActions([{ action: 'modifier', file: 'Journal/f.md', content: '' }])
    expect(result[0].action).toBe('modify')
  })

  it('falls back to type field when action is missing', () => {
    const result = normalizeActions([{ type: 'create', file: 'Journal/f.md', content: '' }])
    expect(result[0].action).toBe('create')
  })

  it('accepts path/filename/filepath as file field aliases', () => {
    const byPath     = normalizeActions([{ action: 'create', path: 'Journal/a.md', content: '' }])
    const byFilename = normalizeActions([{ action: 'create', filename: 'Journal/b.md', content: '' }])
    const byFilepath = normalizeActions([{ action: 'create', filepath: 'Journal/c.md', content: '' }])
    expect(byPath[0].file).toBe('Journal/a.md')
    expect(byFilename[0].file).toBe('Journal/b.md')
    expect(byFilepath[0].file).toBe('Journal/c.md')
  })
})
