import type { CortxAPI } from '../../shared/types'

declare global {
  interface Window {
    cortx: CortxAPI
  }
}
