import { create } from 'zustand'
import type { LibraryDocument, LibraryChunkResult, LibraryIngestProgress } from '../../shared/types'

interface LibraryState {
  documents: LibraryDocument[]
  selectedDocId: string | null
  preview: { markdown: string; pageCount: number | null } | null
  searchQuery: string
  searchResults: LibraryChunkResult[]
  isLoading: boolean
  isSearching: boolean
  status: { sidecarReady: boolean; queueLength: number } | null
  ingestQueue: LibraryIngestProgress[]

  // Actions
  loadDocuments: () => Promise<void>
  selectDocument: (id: string | null) => Promise<void>
  ingest: (paths: string[]) => Promise<void>
  openImportDialog: () => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  openOriginal: (id: string) => void
  setSearchQuery: (q: string) => void
  runSearch: (q: string) => Promise<void>
  loadStatus: () => Promise<void>
  reindexAll: () => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  documents: [],
  selectedDocId: null,
  preview: null,
  searchQuery: '',
  searchResults: [],
  isLoading: false,
  isSearching: false,
  status: null,
  ingestQueue: [],

  loadDocuments: async () => {
    set({ isLoading: true })
    try {
      const docs = await window.cortx.library.list()
      set({ documents: docs })
    } finally {
      set({ isLoading: false })
    }
  },

  selectDocument: async (id) => {
    set({ selectedDocId: id, preview: null })
    if (!id) return
    try {
      const preview = await window.cortx.library.getPreview(id)
      set({ preview })
    } catch {
      set({ preview: { markdown: '_Erreur lors de la prévisualisation._', pageCount: null } })
    }
  },

  ingest: async (paths) => {
    if (paths.length === 0) return
    // Add to queue display immediately
    const initialQueue: LibraryIngestProgress[] = paths.map(p => ({
      documentId: '',
      filename: p.split(/[\\/]/).pop() ?? p,
      stage: 'copying' as const,
    }))
    set(s => ({ ingestQueue: [...s.ingestQueue, ...initialQueue] }))
    try {
      await window.cortx.library.ingestMany(paths)
    } finally {
      await get().loadDocuments()
      // Clear queue entries for these files
      set(s => ({
        ingestQueue: s.ingestQueue.filter(
          q => !paths.some(p => (p.split(/[\\/]/).pop() ?? p) === q.filename)
        )
      }))
    }
  },

  openImportDialog: async () => {
    const paths = await window.cortx.library.openImportDialog()
    if (paths.length > 0) {
      await get().loadDocuments()
    }
  },

  deleteDocument: async (id) => {
    await window.cortx.library.delete(id)
    set(s => ({
      documents: s.documents.filter(d => d.id !== id),
      selectedDocId: s.selectedDocId === id ? null : s.selectedDocId,
      preview: s.selectedDocId === id ? null : s.preview,
    }))
  },

  openOriginal: (id) => {
    window.cortx.library.openOriginal(id).catch(console.error)
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q })
    if (!q.trim()) set({ searchResults: [] })
  },

  runSearch: async (q) => {
    if (!q.trim()) {
      set({ searchResults: [] })
      return
    }
    set({ isSearching: true })
    try {
      const results = await window.cortx.library.search(q, 'hybrid', 10)
      set({ searchResults: results })
    } finally {
      set({ isSearching: false })
    }
  },

  loadStatus: async () => {
    const status = await window.cortx.library.getStatus()
    set({ status })
  },

  reindexAll: async () => {
    set({ isLoading: true })
    try {
      await window.cortx.library.reindexAll()
      await get().loadDocuments()
    } finally {
      set({ isLoading: false })
    }
  },
}))

// Listen to ingestion progress events from the main process
if (typeof window !== 'undefined' && window.cortx) {
  window.cortx.on('library:progress', (p: unknown) => {
    const progress = p as LibraryIngestProgress
    useLibraryStore.setState(s => {
      const queue = s.ingestQueue.map(q =>
        q.filename === progress.filename ? { ...q, ...progress } : q
      )
      return { ingestQueue: queue }
    })
    // When a document finishes, reload list
    if (progress.stage === 'done' || progress.stage === 'error') {
      useLibraryStore.getState().loadDocuments()
    }
  })
}
