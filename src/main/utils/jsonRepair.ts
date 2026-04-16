/**
 * Resilient JSON extraction and repair helpers for LLM-produced output.
 *
 * LLMs (Claude, llama.cpp, Ollama, LM Studio…) regularly return JSON that's
 * almost-but-not-quite valid: prose wrappers, trailing commas, unescaped
 * control characters inside strings, or — worst case — truncated mid-object
 * when the response hits a token limit.
 *
 * These helpers stay pure and O(N): all single-pass string walks, no regex
 * backtracking. Safe to call on multi-MB responses without measurable latency.
 */

/**
 * Scan `text` and return the first balanced `{...}` slice, respecting string
 * literals and escapes. Returns null if no balanced object is found.
 * Preferred over a greedy `/\{[\s\S]*\}/` regex because it handles:
 *   - trailing prose after the JSON ("... and here are the actions.")
 *   - multiple `{...}` segments (picks the first complete one)
 *   - braces that appear inside string values
 */
export function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

/**
 * Close any unterminated string, array, or object. Used when the LLM output
 * was truncated mid-response — we append the minimum chars needed to make
 * the structure parseable. Won't recover semantic content from the cut-off
 * portion, but lets the fields that made it survive.
 */
export function closeUnclosedBraces(input: string): string {
  // Stack tracks the order of unclosed openers so we close them LIFO.
  // Without a stack we'd close `{[...` as `]}` which is syntactically wrong.
  const stack: Array<'{' | '['> = []
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') {
      if (stack.length > 0) stack.pop()
    }
  }

  let out = input.replace(/,\s*$/, '')
  if (inString) out += '"'
  while (stack.length > 0) {
    const opener = stack.pop()!
    out += opener === '{' ? '}' : ']'
  }
  return out
}

/** Escape bare \n \r \t inside JSON string literals (common LLM failure). */
export function escapeControlCharsInStrings(input: string): string {
  let out = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue }
      if (ch === '\\') { out += ch; escaped = true; continue }
      if (ch === '"') { inString = false; out += ch; continue }
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
      out += ch
      continue
    }
    if (ch === '"') inString = true
    out += ch
  }
  return out
}

/** Remove trailing commas before `}` or `]` (illegal in strict JSON). */
export function removeTrailingCommas(input: string): string {
  let out = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (inString) {
      out += ch
      if (escaped) { escaped = false }
      else if (ch === '\\') { escaped = true }
      else if (ch === '"') { inString = false }
      continue
    }

    if (ch === '"') { inString = true; out += ch; continue }

    if (ch === ',') {
      let j = i + 1
      while (j < input.length && /\s/.test(input[j])) j++
      const next = input[j]
      if (next === '}' || next === ']') continue
    }

    out += ch
  }

  return out
}

/** Strip BOM + apply control-char escape + trailing-comma cleanup. */
export function repairJson(input: string): string {
  let out = input.trim()
  if (out.charCodeAt(0) === 0xfeff) out = out.slice(1)
  out = escapeControlCharsInStrings(out)
  out = removeTrailingCommas(out)
  return out
}

/**
 * Coerce a value of unknown shape to a renderable string. LLMs sometimes
 * return arrays/objects in fields our UI types as `string`; this joins them
 * instead of blowing up at render time.
 */
export function toDisplayString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(toDisplayString).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

/** String[] coercion — same idea for fields typed as arrays of strings. */
export function toStringArray(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.map(toDisplayString).filter((s) => s.length > 0)
  const s = toDisplayString(value)
  return s ? [s] : []
}
