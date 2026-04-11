import { useState } from 'react'
import { X, Users, Building2, Globe, Target, BookOpen, FileText } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import type { EntityType } from '../../../shared/types'

const ENTITY_TYPES: EntityType[] = ['personne', 'entreprise', 'domaine', 'projet', 'journal', 'note']

const TYPE_CONFIG: Record<EntityType, { icon: React.ReactNode; label: string }> = {
  personne: { icon: <Users size={18} />, label: 'Personne' },
  entreprise: { icon: <Building2 size={18} />, label: 'Entreprise' },
  domaine: { icon: <Globe size={18} />, label: 'Domaine' },
  projet: { icon: <Target size={18} />, label: 'Projet' },
  journal: { icon: <BookOpen size={18} />, label: 'Journal' },
  note: { icon: <FileText size={18} />, label: 'Note' }
}

function TypeButton({ type, onClick }: { type: EntityType; onClick: () => void }): React.JSX.Element {
  const config = TYPE_CONFIG[type]
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 border border-cortx-border rounded-lg hover:border-cortx-accent hover:bg-cortx-elevated transition-all cursor-pointer"
    >
      <div className="text-cortx-accent">{config.icon}</div>
      <span className="text-sm font-medium text-cortx-text-primary">{config.label}</span>
    </button>
  )
}

export function CreateFileDialog(): React.JSX.Element | null {
  const {
    createFileDialogOpen,
    createFileType,
    createFileTitle,
    setCreateFileType,
    setCreateFileTitle,
    resetCreateFile,
    openFilePreview,
    addToast
  } = useUIStore()
  const [isCreating, setIsCreating] = useState(false)

  if (!createFileDialogOpen) return null

  async function handleCreate(): Promise<void> {
    if (!createFileType || !createFileTitle.trim()) return

    setIsCreating(true)
    try {
      const result = await window.cortx.files.create(createFileType, createFileTitle)
      addToast(`Fiche créée : ${createFileTitle}`, 'success')
      openFilePreview(result.path)
      resetCreateFile() // already sets createFileDialogOpen: false
    } catch (err) {
      console.error('[CreateFileDialog] Error creating file:', err)
      addToast('Erreur lors de la création de la fiche', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  function handleCancel(): void {
    resetCreateFile() // already sets createFileDialogOpen: false — do NOT call toggleCreateFileDialog() after
  }

  function handleBackToTypeSelection(): void {
    setCreateFileType(null)
    setCreateFileTitle('')
  }

  // Step 1: Type selection
  if (!createFileType) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-cortx-bg/80 backdrop-blur-sm"
          onClick={handleCancel}
        />

        {/* Dialog */}
        <div className="relative bg-cortx-surface border border-cortx-border rounded-lg w-full max-w-md mx-4 shadow-2xl animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-cortx-border">
            <h2 className="text-lg font-semibold text-cortx-text-primary">Créer une nouvelle fiche</h2>
            <button
              onClick={handleCancel}
              className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-sm text-cortx-text-secondary">Quel type d'entité voulez-vous créer ?</p>
            <div className="grid grid-cols-2 gap-3">
              {ENTITY_TYPES.map((type) => (
                <TypeButton
                  key={type}
                  type={type}
                  onClick={() => setCreateFileType(type)}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cortx-border">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded text-sm text-cortx-text-secondary hover:bg-cortx-elevated transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Title input
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-cortx-bg/80 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="relative bg-cortx-surface border border-cortx-border rounded-lg w-full max-w-md mx-4 shadow-2xl animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cortx-border">
          <h2 className="text-lg font-semibold text-cortx-text-primary">
            Titre de la nouvelle {TYPE_CONFIG[createFileType].label.toLowerCase()}
          </h2>
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <input
            autoFocus
            type="text"
            value={createFileTitle}
            onChange={(e) => setCreateFileTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createFileTitle.trim() && !isCreating) {
                void handleCreate()
              }
              if (e.key === 'Escape') {
                handleCancel()
              }
            }}
            placeholder="Entrez un titre..."
            className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent focus:ring-1 focus:ring-cortx-accent"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cortx-border">
          <button
            onClick={handleBackToTypeSelection}
            disabled={isCreating}
            className="px-4 py-2 rounded text-sm text-cortx-text-secondary hover:bg-cortx-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Retour
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!createFileTitle.trim() || isCreating}
            className="px-4 py-2 rounded text-sm bg-cortx-accent/15 text-cortx-accent hover:bg-cortx-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
