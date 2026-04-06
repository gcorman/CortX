import { create } from 'zustand'
import type { CortxFile, FileContent } from '../../shared/types'

interface FileState {
  files: CortxFile[]
  selectedFile: FileContent | null
  isLoading: boolean

  loadFiles: () => Promise<void>
  readFile: (path: string) => Promise<void>
  clearSelection: () => void
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  selectedFile: null,
  isLoading: false,

  loadFiles: async () => {
    set({ isLoading: true })
    try {
      const files = await window.cortx.db.getFiles()
      set({ files, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  readFile: async (path: string) => {
    try {
      const content = await window.cortx.files.read(path)
      set({ selectedFile: content })
    } catch {
      // ignore
    }
  },

  clearSelection: () => set({ selectedFile: null })
}))
