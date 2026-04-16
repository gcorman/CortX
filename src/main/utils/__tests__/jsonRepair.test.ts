import { describe, it, expect } from 'vitest'
import {
  extractBalancedJson,
  closeUnclosedBraces,
  escapeControlCharsInStrings,
  removeTrailingCommas,
  repairJson,
  toDisplayString,
  toStringArray
} from '../jsonRepair'

describe('extractBalancedJson', () => {
  it('returns the JSON slice when the whole input is valid JSON', () => {
    const json = '{"a":1,"b":[1,2]}'
    expect(extractBalancedJson(json)).toBe(json)
  })

  it('strips leading prose', () => {
    const input = 'Here is the response:\n{"actions":[]}'
    expect(extractBalancedJson(input)).toBe('{"actions":[]}')
  })

  it('strips trailing prose', () => {
    const input = '{"actions":[]}\n\nLet me know if you need more!'
    expect(extractBalancedJson(input)).toBe('{"actions":[]}')
  })

  it('handles braces inside string values', () => {
    const input = 'prefix {"content":"a {brace} inside","x":1} suffix'
    expect(extractBalancedJson(input)).toBe('{"content":"a {brace} inside","x":1}')
  })

  it('handles escaped quotes inside strings', () => {
    const input = '{"msg":"He said \\"hi\\"","n":2}'
    expect(extractBalancedJson(input)).toBe(input)
  })

  it('returns null when no { is found', () => {
    expect(extractBalancedJson('just prose')).toBeNull()
  })

  it('returns null for truncated output with no closing brace', () => {
    expect(extractBalancedJson('{"a":1,"b":')).toBeNull()
  })

  it('picks the first complete object when multiple follow', () => {
    const input = '{"a":1}{"b":2}'
    expect(extractBalancedJson(input)).toBe('{"a":1}')
  })
})

describe('closeUnclosedBraces', () => {
  it('closes a single unclosed object', () => {
    expect(closeUnclosedBraces('{"a":1')).toBe('{"a":1}')
  })

  it('closes nested structures', () => {
    expect(closeUnclosedBraces('{"a":[1,2,{"b":3')).toBe('{"a":[1,2,{"b":3}]}')
  })

  it('terminates an open string and then closes the object', () => {
    const input = '{"content":"unterminated string'
    const closed = closeUnclosedBraces(input)
    expect(() => JSON.parse(closed)).not.toThrow()
  })

  it('drops a trailing comma before closing', () => {
    expect(closeUnclosedBraces('{"a":1,')).toBe('{"a":1}')
  })

  it('is a no-op on balanced input', () => {
    expect(closeUnclosedBraces('{"a":1}')).toBe('{"a":1}')
  })

  it('produces JSON-parseable output for a realistic truncated LLM response', () => {
    const truncated = '{"input_type":"information","actions":[{"action":"create","file":"Projets/Truc.md","content":"# Truc\\n\\nSome para'
    const closed = closeUnclosedBraces(truncated)
    const parsed = JSON.parse(closed)
    expect(parsed.input_type).toBe('information')
    expect(parsed.actions).toHaveLength(1)
    expect(parsed.actions[0].action).toBe('create')
  })
})

describe('escapeControlCharsInStrings', () => {
  it('escapes raw newlines inside string literals', () => {
    const input = '{"content":"line1\nline2"}'
    const escaped = escapeControlCharsInStrings(input)
    expect(() => JSON.parse(escaped)).not.toThrow()
    expect(JSON.parse(escaped).content).toBe('line1\nline2')
  })

  it('leaves newlines outside of strings alone', () => {
    const input = '{\n  "a": 1\n}'
    const escaped = escapeControlCharsInStrings(input)
    expect(() => JSON.parse(escaped)).not.toThrow()
  })

  it('respects escaped quotes when tracking string boundaries', () => {
    const input = '{"a":"he said \\"hi\\"","b":"next\nline"}'
    const escaped = escapeControlCharsInStrings(input)
    expect(() => JSON.parse(escaped)).not.toThrow()
  })
})

describe('removeTrailingCommas', () => {
  it('strips trailing comma before }', () => {
    expect(removeTrailingCommas('{"a":1,}')).toBe('{"a":1}')
  })

  it('strips trailing comma before ]', () => {
    expect(removeTrailingCommas('[1,2,3,]')).toBe('[1,2,3]')
  })

  it('leaves legitimate commas untouched', () => {
    expect(removeTrailingCommas('{"a":1,"b":2}')).toBe('{"a":1,"b":2}')
  })
})

describe('repairJson (integration)', () => {
  it('fixes a realistic LLM response with unescaped newlines and trailing comma', () => {
    const broken = '{"content":"# Titre\n\nCorps","extra":"ok",}'
    const repaired = repairJson(broken)
    expect(() => JSON.parse(repaired)).not.toThrow()
  })

  it('strips BOM', () => {
    const input = '\uFEFF{"a":1}'
    expect(JSON.parse(repairJson(input)).a).toBe(1)
  })
})

describe('toDisplayString', () => {
  it('passes strings through', () => {
    expect(toDisplayString('hello')).toBe('hello')
  })
  it('joins arrays with newlines', () => {
    expect(toDisplayString(['a', 'b', 'c'])).toBe('a\nb\nc')
  })
  it('returns empty string for null/undefined', () => {
    expect(toDisplayString(null)).toBe('')
    expect(toDisplayString(undefined)).toBe('')
  })
  it('stringifies objects', () => {
    expect(toDisplayString({ k: 'v' })).toBe('{"k":"v"}')
  })
  it('flattens nested arrays', () => {
    expect(toDisplayString(['a', ['b', 'c']])).toBe('a\nb\nc')
  })
  it('coerces numbers and booleans', () => {
    expect(toDisplayString(42)).toBe('42')
    expect(toDisplayString(true)).toBe('true')
  })
})

describe('toStringArray', () => {
  it('keeps a clean string array', () => {
    expect(toStringArray(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('returns empty array for null/undefined', () => {
    expect(toStringArray(null)).toEqual([])
    expect(toStringArray(undefined)).toEqual([])
  })
  it('wraps a single string', () => {
    expect(toStringArray('solo')).toEqual(['solo'])
  })
  it('filters out empty strings', () => {
    expect(toStringArray(['a', '', 'b', null])).toEqual(['a', 'b'])
  })
  it('flattens object entries via JSON.stringify', () => {
    expect(toStringArray([{ k: 1 }])).toEqual(['{"k":1}'])
  })
})
