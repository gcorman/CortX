export const TYPE_COLORS: Record<string, number> = {
  personne: 0xff9d4d,
  entreprise: 0x5b8def,
  domaine: 0xa855f7,
  projet: 0x22d3ee,
  note: 0xfacc15,
  journal: 0xf472b6
}

export const FICHE_COLOR = 0xffffff
export const COMET_COLOR = 0x7dd3fc
export const BG_COLOR = 0x05060f
export const BG_DEEP = 0x000000

/**
 * Map a modified-at timestamp to a halo intensity (0..1).
 * Recent → 1, 90+ days old → ~0.15.
 */
export function recencyIntensity(modifiedAt: string): number {
  const t = Date.parse(modifiedAt)
  if (!Number.isFinite(t)) return 0.3
  const age = Date.now() - t
  const NINETY_DAYS = 90 * 86400_000
  const norm = Math.max(0, Math.min(1, 1 - age / NINETY_DAYS))
  return 0.15 + 0.85 * norm
}

/** Blend two hex colors at ratio (0 = a, 1 = b). */
export function blendHex(a: number, b: number, ratio: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const r = Math.round(ar + (br - ar) * ratio)
  const g = Math.round(ag + (bg - ag) * ratio)
  const bl = Math.round(ab + (bb - ab) * ratio)
  return (r << 16) | (g << 8) | bl
}

/** Convert a Pixi-style 0xRRGGBB into a CSS hex string. */
export function toHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

/** Parse '#rrggbb' or '#rgb' into 0xRRGGBB. */
export function parseHex(s: string): number {
  const v = s.replace('#', '')
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16)
    const g = parseInt(v[1] + v[1], 16)
    const b = parseInt(v[2] + v[2], 16)
    return (r << 16) | (g << 8) | b
  }
  return parseInt(v, 16)
}
