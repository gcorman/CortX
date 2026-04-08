import { create } from 'zustand'

export type CenterView = 'graph' | 'tags' | 'files' | 'library'
export type Theme = 'dark' | 'light'

interface UIState {
  activeCenterView: CenterView
  rightPanelVisible: boolean
  filePreviewPath: string | null
  settingsOpen: boolean
  theme: Theme
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>

  setActiveCenterView: (view: CenterView) => void
  toggleRightPanel: () => void
  openFilePreview: (path: string) => void
  closeFilePreview: () => void
  toggleSettings: () => void
  setTheme: (theme: Theme) => void
  addToast: (message: string, type: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

const savedTheme = ((): Theme => {
  try { return (localStorage.getItem('cortx-theme') as Theme) || 'dark' } catch { return 'dark' }
})()

export const useUIStore = create<UIState>((set) => ({
  activeCenterView: 'graph',
  rightPanelVisible: true,
  filePreviewPath: null,
  settingsOpen: false,
  theme: savedTheme,
  toasts: [],

  setActiveCenterView: (view) => set({ activeCenterView: view }),
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  openFilePreview: (path) => set({ filePreviewPath: path }),
  closeFilePreview: () => set({ filePreviewPath: null }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setTheme: (theme) => {
    try { localStorage.setItem('cortx-theme', theme) } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
  addToast: (message, type) => {
    const id = Date.now().toString(36)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
