import { useState } from 'react'
import { X, Users, Building2, Globe, Target, BookOpen, FileText } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useT } from '../../i18n'
import type { EntityType } from '../../../shared/types'

const ENTITY_TYPES: EntityType[] = ['personne', 'entreprise', 'domaine', 'projet', 'journal', 'note']

function TypeButton({ type, label, onClick }: { type: EntityType; label: string; onClick: () => void }): React.JSX.Element {
  const ICONS: Record<EntityType, React.ReactNode> = {
    personne: <Users size={18} />,
    entreprise: <Building2 size={18} />,
    domaine: <Globe size={18} />,
    projet: <Target size={18} />,
    journal: <BookOpen size={18} />,
    note: <FileText size={18} />
  }
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 border border-cortx-border rounded-lg hover:border-cortx-accent hover:bg-cortx-elevated transition-all cursor-pointer"
    >
      <div className="text-cortx-accent">{ICONS[type]}</div>
      <span className="text-sm font-medium text-cortx-text-primary">{label}</span>
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
  const t = useT()
  const [isCreating, setIsCreating] = useState(false)

  if (!createFileDialogOpen) return null

  const TYPE_LABELS: Record<EntityType, string> = {
    personne: t.createFile.personne,
    entreprise: t.createFile.entreprise,
    domaine: t.createFile.domaine,
    projet: t.createFile.projet,
    journal: t.createFile.journal,
    note: t.createFile.note
  }

  async function handleCreate(): Promise<void> {
    if (!createFileType || !createFileTitle.trim()) return

    setIsCreating(true)
    try {
      const result = await window.cortx.files.create(createFileType, createFileTitle)
      addToast(t.createFile.created(createFileTitle), 'success')
      openFilePreview(result.path)
      resetCreateFile()
    } catch (err) {
      console.error('[CreateFileDialog] Error creating file:', err)
      addToast(t.createFile.createError, 'error')
    } finally {
      setIsCreating(false)
    }
  }

  function handleCancel(): void {
    resetCreateFile()
  }

  function handleBackToTypeSelection(): void {
    setCreateFileType(null)
    setCreateFileTitle('')
  }

  // Step 1: Type selection
  if (!createFileType) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-cortx-bg/80 backdrop-blur-sm"
          onClick={handleCancel}
        />
        <div className="relative bg-cortx-surface/90 backdrop-blur-xl border border-cortx-border/50 rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-cortx-border">
            <h2 className="text-lg font-semibold text-cortx-text-primary">{t.createFile.title}</h2>
            <button
              onClick={handleCancel}
              className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-sm text-cortx-text-secondary">{t.createFile.selectType}</p>
            <div className="grid grid-cols-2 gap-3">
              {ENTITY_TYPES.map((type) => (
                <TypeButton
                  key={type}
                  type={type}
                  label={TYPE_LABELS[type]}
                  onClick={() => setCreateFileType(type)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cortx-border">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded text-sm text-cortx-text-secondary hover:bg-cortx-elevated transition-colors"
            >
              {t.createFile.cancel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Title input
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-cortx-bg/80 backdrop-blur-sm"
        onClick={handleCancel}
      />
      <div className="relative bg-cortx-surface/90 backdrop-blur-xl border border-cortx-border/50 rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-in fade-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cortx-border">
          <h2 className="text-lg font-semibold text-cortx-text-primary">
            {t.createFile.titleLabel(TYPE_LABELS[createFileType].toLowerCase())}
          </h2>
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
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
            placeholder={t.createFile.titlePlaceholder}
            className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent focus:ring-1 focus:ring-cortx-accent"
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cortx-border">
          <button
            onClick={handleBackToTypeSelection}
            disabled={isCreating}
            className="px-4 py-2 rounded text-sm text-cortx-text-secondary hover:bg-cortx-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t.createFile.back}
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!createFileTitle.trim() || isCreating}
            className="px-4 py-2 rounded text-sm bg-cortx-accent/15 text-cortx-accent hover:bg-cortx-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? t.createFile.creating : t.createFile.create}
          </button>
        </div>
      </div>
    </div>
  )
}
