import { useEffect, useRef, useState } from 'react'
import { Upload, Search, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { useLibraryStore } from '../../stores/libraryStore'
import { LibraryDocumentItem } from './LibraryDocumentItem'
import { LibraryPreview } from './LibraryPreview'

export function LibraryPanel(): React.JSX.Element {
  const {
    documents,
    selectedDocId,
    searchQuery,
    searchResults,
    isLoading,
    isSearching,
    status,
    ingestQueue,
    loadDocuments,
    loadStatus,
    selectDocument,
    deleteDocument,
    openOriginal,
    openImportDialog,
    setSearchQuery,
    runSearch,
    reindexAll,
  } = useLibraryStore()

  const [isDragOver, setIsDragOver] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadDocuments()
    loadStatus()
  }, [loadDocuments, loadStatus])

  // Debounced search
  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => runSearch(q), 400)
  }

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map(f => (f as File & { path: string }).path)
      .filter(Boolean)
    if (paths.length > 0) {
      await window.cortx.library.ingestMany(paths)
      loadDocuments()
    }
  }

  // Determine what list to show
  const showSearchResults = searchQuery.trim().length > 0
  const groupedDocs = groupByFolder(documents)

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-cortx-border space-y-2">
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cortx-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Rechercher dans la bibliothèque…"
            className="w-full bg-cortx-surface border border-cortx-border rounded-input pl-8 pr-3 py-1.5 text-xs text-cortx-text-primary placeholder:text-cortx-text-secondary/50 focus:outline-none focus:border-cortx-accent transition-colors"
          />
          {isSearching && (
            <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-cortx-text-secondary" />
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={openImportDialog}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-cortx-accent/10 hover:bg-cortx-accent/20 text-cortx-accent text-xs font-medium transition-colors"
          >
            <Upload size={12} />
            Importer
          </button>
          <button
            onClick={reindexAll}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-cortx-surface text-cortx-text-secondary hover:text-cortx-text-primary transition-colors disabled:opacity-40"
            title="Réindexer tous les documents"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>

          {/* Sidecar status indicator */}
          {status && !status.sidecarReady && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400 ml-auto" title="Le sidecar Python n'est pas disponible. Seuls les .md/.txt peuvent être importés.">
              <AlertCircle size={11} />
              Mode dégradé
            </div>
          )}

          <span className="ml-auto text-[10px] text-cortx-text-secondary">
            {documents.length} doc{documents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: document list */}
        <div
          className={`w-64 flex-shrink-0 border-r border-cortx-border overflow-y-auto flex flex-col relative transition-colors ${isDragOver ? 'bg-cortx-accent/5 border-cortx-accent' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay hint */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="bg-cortx-elevated/90 border border-cortx-accent rounded-lg px-4 py-3 text-center">
                <Upload size={20} className="mx-auto mb-1 text-cortx-accent" />
                <p className="text-xs text-cortx-accent font-medium">Déposer pour importer</p>
              </div>
            </div>
          )}

          {/* Ingestion queue (active imports) */}
          {ingestQueue.length > 0 && (
            <div className="px-3 py-2 border-b border-cortx-border space-y-1">
              <p className="text-[10px] text-cortx-text-secondary uppercase tracking-wide font-medium">En cours</p>
              {ingestQueue.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-cortx-text-secondary">
                  <Loader2 size={10} className="animate-spin flex-shrink-0" />
                  <span className="truncate">{item.filename}</span>
                  <span className="flex-shrink-0">{stageLabel(item.stage)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Search results mode */}
          {showSearchResults ? (
            <div className="flex-1 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="text-xs text-cortx-text-secondary px-3 py-4">Aucun résultat</p>
              ) : (
                searchResults.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => selectDocument(r.documentId)}
                    className={`px-3 py-2 cursor-pointer hover:bg-cortx-surface transition-colors ${selectedDocId === r.documentId ? 'bg-cortx-elevated' : ''}`}
                  >
                    <p className="text-xs font-medium text-cortx-text-primary truncate">{r.documentTitle || r.documentPath}</p>
                    {r.heading && <p className="text-[10px] text-cortx-text-secondary truncate">{r.heading}</p>}
                    <p className="text-[10px] text-cortx-text-secondary/70 line-clamp-2 mt-0.5">{r.text}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Normal doc list grouped by folder */
            <div className="flex-1 overflow-y-auto py-1">
              {isLoading && documents.length === 0 && (
                <div className="flex items-center justify-center py-8 text-cortx-text-secondary">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  <span className="text-xs">Chargement…</span>
                </div>
              )}
              {!isLoading && documents.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <Upload size={24} className="mx-auto mb-2 text-cortx-text-secondary/40" />
                  <p className="text-xs text-cortx-text-secondary">Aucun document</p>
                  <p className="text-[10px] text-cortx-text-secondary/60 mt-1">Glissez des fichiers ici ou cliquez sur Importer</p>
                </div>
              )}
              {Object.entries(groupedDocs).map(([folder, docs]) => (
                <div key={folder}>
                  {folder !== '_root' && (
                    <p className="px-3 pt-3 pb-1 text-[10px] text-cortx-text-secondary/60 uppercase tracking-wide font-medium">
                      {folder}
                    </p>
                  )}
                  {docs.map(doc => (
                    <LibraryDocumentItem
                      key={doc.id}
                      doc={doc}
                      isSelected={doc.id === selectedDocId}
                      onSelect={() => selectDocument(doc.id)}
                      onDelete={() => deleteDocument(doc.id)}
                      onOpenOriginal={() => openOriginal(doc.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: preview */}
        <div className="flex-1 min-w-0 flex flex-col">
          <LibraryPreview />
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByFolder(docs: ReturnType<typeof useLibraryStore.getState>['documents']): Record<string, typeof docs> {
  const result: Record<string, typeof docs> = {}
  for (const doc of docs) {
    const parts = doc.path.replace(/\\/g, '/').split('/')
    const folder = parts.length > 1 ? parts[0] : '_root'
    if (!result[folder]) result[folder] = []
    result[folder].push(doc)
  }
  return result
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    copying: 'copie…',
    extracting: 'extraction…',
    chunking: 'découpage…',
    embedding: 'embeddings…',
    linking: 'liens…',
    done: 'terminé',
    error: 'erreur',
  }
  return labels[stage] ?? stage
}
