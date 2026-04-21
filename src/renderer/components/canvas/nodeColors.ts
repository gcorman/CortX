/** Entity type → accent color (kept aligned with GraphView NODE_COLORS) */
export const TYPE_COLORS: Record<string, string> = {
  personne:   '#0D9488',
  entreprise: '#3B82F6',
  domaine:    '#8B5CF6',
  projet:     '#F97316',
  note:       '#94A3B8',
  journal:    '#64748B',
  fiche:      '#EC4899',
  document:   '#F59E0B'
}

export function colorForType(type?: string): string {
  return TYPE_COLORS[type || ''] || '#94A3B8'
}

/** Sticky note palettes — dark mode */
export const STICKY_COLORS = {
  teal:    { bg: 'rgba(13, 148, 136, 0.22)',  border: 'rgba(20, 184, 166, 0.45)',  text: '#CCFBF1' },
  orange:  { bg: 'rgba(249, 115, 22, 0.22)',  border: 'rgba(251, 146, 60, 0.45)',  text: '#FFEDD5' },
  purple:  { bg: 'rgba(139, 92, 246, 0.22)',  border: 'rgba(167, 139, 250, 0.45)', text: '#EDE9FE' },
  blue:    { bg: 'rgba(59, 130, 246, 0.22)',  border: 'rgba(96, 165, 250, 0.45)',  text: '#DBEAFE' },
  pink:    { bg: 'rgba(236, 72, 153, 0.22)',  border: 'rgba(244, 114, 182, 0.45)', text: '#FCE7F3' },
  neutral: { bg: 'rgba(148, 163, 184, 0.18)', border: 'rgba(203, 213, 225, 0.35)', text: '#E2E8F0' }
} as const

/** Sticky note palettes — light mode (darker text, more opaque bg) */
export const STICKY_COLORS_LIGHT = {
  teal:    { bg: 'rgba(13, 148, 136, 0.10)',  border: 'rgba(13, 148, 136, 0.35)',  text: '#0F766E' },
  orange:  { bg: 'rgba(249, 115, 22, 0.10)',  border: 'rgba(249, 115, 22, 0.35)',  text: '#C2410C' },
  purple:  { bg: 'rgba(139, 92, 246, 0.10)',  border: 'rgba(139, 92, 246, 0.35)',  text: '#6D28D9' },
  blue:    { bg: 'rgba(59, 130, 246, 0.10)',  border: 'rgba(59, 130, 246, 0.35)',  text: '#1D4ED8' },
  pink:    { bg: 'rgba(236, 72, 153, 0.10)',  border: 'rgba(236, 72, 153, 0.35)',  text: '#9D174D' },
  neutral: { bg: 'rgba(100, 116, 139, 0.08)', border: 'rgba(100, 116, 139, 0.30)', text: '#334155' }
} as const

export type StickyColorKey = keyof typeof STICKY_COLORS
