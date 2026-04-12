export type { Language, T } from './translations'
export { translations } from './translations'

import { useUIStore } from '../stores/uiStore'
import { translations } from './translations'

export function useT() {
  const language = useUIStore((s) => s.language)
  return translations[language]
}
