import { create } from 'zustand'
import type { EntityType, AppLanguage } from '../../shared/types'

export type CenterView = 'graph' | 'tags' | 'files' | 'library' | 'canvas'
export type Theme = 'dark' | 'light'

interface UIState {
  activeCenterView: CenterView
  rightPanelVisible: boolean
  filePreviewPath: string | null
  settingsOpen: boolean
  theme: Theme
  language: AppLanguage
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>

  // File creation dialog
  createFileDialogOpen: boolean
  createFileType: EntityType | null
  createFileTitle: string

  // Title editing
  titleEditingPath: string | null

  // .md import modal (drag-drop or + button)
  mdImportModal: { filename: string; content: string; absolutePath: string } | null
  showMdImportModal: (file: { filename: string; content: string; absolutePath: string }) => void
  hideMdImportModal: () => void

  // Chat @mention → graph highlight bridge
  chatFocusedTitles: string[]
  setChatFocusedTitles: (titles: string[]) => void

  setActiveCenterView: (view: CenterView) => void
  toggleRightPanel: () => void
  openFilePreview: (path: string) => void
  closeFilePreview: () => void
  toggleSettings: () => void
  setTheme: (theme: Theme) => void
  setLanguage: (language: AppLanguage) => void
  addToast: (message: string, type: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void

  // File creation actions
  toggleCreateFileDialog: () => void
  setCreateFileType: (type: EntityType | null) => void
  setCreateFileTitle: (title: string) => void
  resetCreateFile: () => void

  // Title editing actions
  setTitleEditingPath: (path: string | null) => void
}

const savedTheme = ((): Theme => {
  try { return (localStorage.getItem('cortx-theme') as Theme) || 'dark' } catch { return 'dark' }
})()

const savedLanguage = ((): AppLanguage => {
  try { return (localStorage.getItem('cortx-language') as AppLanguage) || 'fr' } catch { return 'fr' }
})()

export const useUIStore = create<UIState>((set) => ({
  activeCenterView: 'graph',
  rightPanelVisible: true,
  filePreviewPath: null,
  settingsOpen: false,
  theme: savedTheme,
  language: savedLanguage,
  toasts: [],

  // File creation dialog
  createFileDialogOpen: false,
  createFileType: null,
  createFileTitle: '',

  // Title editing
  titleEditingPath: null,

  // .md import modal
  mdImportModal: null,
  showMdImportModal: (file) => set({ mdImportModal: file }),
  hideMdImportModal: () => set({ mdImportModal: null }),

  chatFocusedTitles: [],
  setChatFocusedTitles: (titles) => set({ chatFocusedTitles: titles }),

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
  setLanguage: (language) => {
    try { localStorage.setItem('cortx-language', language) } catch { /* ignore */ }
    set({ language })
  },
  addToast: (message, type) => {
    const id = Date.now().toString(36)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // File creation actions
  toggleCreateFileDialog: () => set((s) => ({ createFileDialogOpen: !s.createFileDialogOpen })),
  setCreateFileType: (type) => set({ createFileType: type }),
  setCreateFileTitle: (title) => set({ createFileTitle: title }),
  resetCreateFile: () => set({ createFileType: null, createFileTitle: '', createFileDialogOpen: false }),

  // Title editing actions
  setTitleEditingPath: (path) => set({ titleEditingPath: path })
}))
