import { useState, useEffect } from 'react'
import {
  User, Brain, FilePlus, FileEdit, Copy, Check, Eye, HelpCircle, Lightbulb, X,
  Pencil, ChevronDown, ChevronUp
} from 'lucide-react'
import { ActionButtons } from './ActionButtons'
import { ActionPreview } from './ActionPreview'
import { MarkdownRenderer } from '../files/MarkdownRenderer'
import { WikiText } from '../../utils/wikilink'
import { useChatStore } from '../../stores/chatStore'
import type { ActionEdit } from '../../stores/chatStore'
import { useT } from '../../i18n'
import type { ChatMessage as ChatMessageType, AgentAction } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Helpers — extract display info from action content
// ---------------------------------------------------------------------------

function extractTitle(content: string, file: string): string {
  const fm = content.match(/^title:\s*(.+)$/m)
  if (fm) return fm[1].trim().replace(/^['"]|['"]$/g, '')
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  return file.split('/').pop()?.replace('.md', '') || file
}

function extractType(content: string): string {
  const m = content.match(/^type:\s*(.+)$/m)
  return m ? m[1].trim() : ''
}

const ENTITY_TYPES = [
  { value: 'personne',   label: 'Personne',   cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  { value: 'entreprise', label: 'Entreprise', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  { value: 'domaine',    label: 'Domaine',    cls: 'bg-teal-500/15 text-teal-400 border-teal-500/25' },
  { value: 'projet',     label: 'Projet',     cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  { value: 'note',       label: 'Note',       cls: 'bg-cortx-text-secondary/10 text-cortx-text-secondary border-cortx-border' },
  { value: 'journal',    label: 'Journal',    cls: 'bg-green-500/15 text-green-400 border-green-500/25' },
] as const

function typeClass(type: string): string {
  return ENTITY_TYPES.find((t) => t.value === type)?.cls
    ?? 'bg-cortx-elevated text-cortx-text-secondary border-cortx-border'
}

// ---------------------------------------------------------------------------
// InlineEditRow — expands under a create-action row
// ---------------------------------------------------------------------------

interface InlineEditRowProps {
  actionId: string
  edit: { title: string; type: string }
  onChange: (id: string, edit: { title: string; type: string }) => void
  onDone: () => void
}

function InlineEditRow({ actionId, edit, onChange, onDone }: InlineEditRowProps): React.JSX.Element {
  const t = useT()
  return (
    <div className="ml-5 mt-1 mb-1 p-2.5 rounded-card bg-cortx-elevated border border-cortx-accent/20 space-y-2 animate-in slide-in-from-top-1 duration-150">
      {/* Title */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-cortx-text-secondary w-10 flex-shrink-0">{t.actionButtons.editTitle}</span>
        <input
          autoFocus
          value={edit.title}
          onChange={(e) => onChange(actionId, { ...edit, title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onDone() }}
          className="flex-1 text-xs bg-cortx-bg border border-cortx-border rounded px-2 py-1 text-cortx-text-primary focus:outline-none focus:border-cortx-accent transition-colors"
          placeholder="Titre..."
        />
      </div>
      {/* Type pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-2xs text-cortx-text-secondary w-10 flex-shrink-0">{t.actionButtons.editType}</span>
        {ENTITY_TYPES.map((et) => (
          <button
            key={et.value}
            type="button"
            onClick={() => { onChange(actionId, { ...edit, type: et.value }); }}
            className={`text-2xs px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
              edit.type === et.value
                ? et.cls + ' ring-1 ring-current/40'
                : 'bg-transparent text-cortx-text-secondary/50 border-cortx-border hover:border-cortx-text-secondary/40'
            }`}
          >
            {et.label}
          </button>
        ))}
      </div>
      {/* Done hint */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="text-2xs text-cortx-accent hover:text-cortx-accent-light transition-colors cursor-pointer"
        >
          <Check size={11} className="inline mr-1" />
          Valider les modifications
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [previewAction, setPreviewAction] = useState<AgentAction | null>(null)
  const answerClarification = useChatStore((s) => s.answerClarification)
  const dismissSuggestion = useChatStore((s) => s.dismissSuggestion)
  const acceptSuggestion = useChatStore((s) => s.acceptSuggestion)
  const dismissedSuggestions = useChatStore((s) => s.dismissedSuggestions)
  const t = useT()

  const response = message.agentResponse
  const actions = response?.actions ?? []
  const proposedActions = actions.filter((a) => a.status === 'proposed')

  // ── Selection state (only relevant while actions are proposed) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(proposedActions.map((a) => a.id))
  )

  // ── Inline edit state (per-action title/type overrides) ──
  const [editedValues, setEditedValues] = useState<Record<string, { title: string; type: string }>>(() => {
    const vals: Record<string, { title: string; type: string }> = {}
    actions.forEach((a) => {
      if (a.action === 'create') {
        vals[a.id] = { title: extractTitle(a.content, a.file), type: extractType(a.content) }
      }
    })
    return vals
  })

  // ── Which row is being edited ──
  const [editingId, setEditingId] = useState<string | null>(null)

  // Re-sync selectedIds when new proposed actions arrive (e.g. streaming)
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      proposedActions.forEach((a) => { if (!next.has(a.id)) next.add(a.id) })
      return next
    })
  }, [actions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    proposed: { bg: 'bg-cortx-cta/10',     text: 'text-cortx-cta',     label: t.chat.pending },
    pending:  { bg: 'bg-cortx-accent/10',   text: 'text-cortx-accent',  label: t.chat.inProgress },
    validated:{ bg: 'bg-cortx-success/10',  text: 'text-cortx-success', label: t.chat.applied },
    rejected: { bg: 'bg-cortx-error/10',    text: 'text-cortx-error',   label: t.chat.rejected },
    undone:   { bg: 'bg-cortx-cta/10',      text: 'text-cortx-cta',     label: t.chat.cancelled }
  }

  function handleCopy(): void {
    const text = isUser
      ? message.content
      : response?.summary || response?.response || message.content
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateEdit(id: string, edit: { title: string; type: string }): void {
    setEditedValues((prev) => ({ ...prev, [id]: edit }))
  }

  // Build the edits map — only for values that differ from original content
  function buildEditsMap(): Record<string, ActionEdit> {
    const result: Record<string, ActionEdit> = {}
    actions.forEach((a) => {
      if (a.action !== 'create') return
      const edited = editedValues[a.id]
      if (!edited) return
      const origTitle = extractTitle(a.content, a.file)
      const origType  = extractType(a.content)
      const edit: ActionEdit = {}
      if (edited.title !== origTitle) edit.title = edited.title
      if (edited.type  !== origType)  edit.type  = edited.type
      if (Object.keys(edit).length > 0) result[a.id] = edit
    })
    return result
  }

  // ── User message ──────────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="group flex gap-2.5">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cortx-elevated flex items-center justify-center">
          <User size={13} className="text-cortx-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-cortx-text-primary leading-relaxed whitespace-pre-wrap">
            <WikiText text={message.content} />
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xs text-cortx-text-secondary/40">
              {new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary/40 hover:text-cortx-text-secondary transition-all cursor-pointer"
              title={t.chat.copy}
            >
              {copied ? <Check size={11} className="text-cortx-success" /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Agent message ─────────────────────────────────────────────────────────
  const hasProposed = proposedActions.length > 0
  const selectedProposedCount = proposedActions.filter((a) => selectedIds.has(a.id)).length

  return (
    <div className="group flex gap-2.5">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cortx-accent/10 flex items-center justify-center">
        <Brain size={13} className="text-cortx-accent" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">

        {/* Summary / response body — render markdown when long-form content present */}
        {(() => {
          const body = response?.response?.trim()
          const summary = response?.summary?.trim()
          // Use markdown rendering for the long-form `response` field (bullets, bold,
          // headings). Keep the shorter `summary` as a plain paragraph above it.
          const hasRichBody = !!body && (
            body.includes('\n') || /[*_#`>-]/.test(body) || body.length > 140
          )
          if (hasRichBody) {
            return (
              <div className="space-y-2">
                {summary && summary !== body && (
                  <p className="text-sm text-cortx-text-primary leading-relaxed whitespace-pre-wrap">
                    <WikiText text={summary} />
                  </p>
                )}
                <MarkdownRenderer content={body!} />
              </div>
            )
          }
          return (
            <p className="text-sm text-cortx-text-primary leading-relaxed whitespace-pre-wrap">
              <WikiText text={summary || body || message.content} />
            </p>
          )
        })()}

        {/* Clarification */}
        {response?.clarification && (
          <div className="rounded-card border border-cortx-accent/30 bg-cortx-accent/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <HelpCircle size={14} className="text-cortx-accent flex-shrink-0 mt-0.5" />
              <p className="text-sm text-cortx-text-primary leading-snug">{response.clarification.question}</p>
            </div>
            <div className="flex flex-col gap-1.5 pl-1">
              {response.clarification.options.map((opt, i) => {
                const answered = response.clarification!.answeredIndex
                const isChosen = answered === i
                const isDisabled = answered !== undefined
                return (
                  <button
                    key={i}
                    onClick={() => answerClarification(message.id, i)}
                    disabled={isDisabled}
                    className={`text-left text-xs px-3 py-2 rounded-card border transition-all ${
                      isChosen
                        ? 'border-cortx-accent bg-cortx-accent/15 text-cortx-accent font-medium'
                        : isDisabled
                          ? 'border-cortx-border bg-cortx-bg/30 text-cortx-text-secondary/40 cursor-not-allowed'
                          : 'border-cortx-border bg-cortx-bg/50 text-cortx-text-primary hover:border-cortx-accent hover:bg-cortx-accent/10 cursor-pointer'
                    }`}
                  >
                    {isChosen && <Check size={11} className="inline mr-1.5" />}
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Action list ──────────────────────────────────────────────────── */}
        {actions.length > 0 && (
          <div className="space-y-0.5">
            {actions.map((action) => {
              const style = STATUS_STYLES[action.status] || STATUS_STYLES.proposed
              const isProposed = action.status === 'proposed'
              const isCreate = action.action === 'create'
              const isSelected = selectedIds.has(action.id)
              const isEditing = editingId === action.id
              const edit = editedValues[action.id]

              // Display title: use edited value for create, file path for modify
              const displayTitle = isCreate && edit
                ? edit.title || action.file
                : action.file

              return (
                <div key={action.id} className="group/row">
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-1.5 w-full text-xs rounded px-2 py-1.5 transition-colors ${
                      isProposed
                        ? isSelected
                          ? 'bg-cortx-bg/60 hover:bg-cortx-elevated'
                          : 'bg-cortx-bg/30 opacity-50 hover:opacity-70'
                        : 'bg-cortx-bg/30'
                    }`}
                  >
                    {/* Checkbox — only for proposed */}
                    {isProposed && (
                      <button
                        type="button"
                        onClick={() => toggleSelect(action.id)}
                        className={`flex-shrink-0 w-3.5 h-3.5 rounded border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cortx-accent border-cortx-accent'
                            : 'bg-transparent border-cortx-border hover:border-cortx-accent/60'
                        }`}
                        title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                      >
                        {isSelected && <Check size={9} className="text-white" />}
                      </button>
                    )}

                    {/* Icon */}
                    {isCreate
                      ? <FilePlus size={12} className="text-cortx-success flex-shrink-0" />
                      : <FileEdit size={12} className="text-cortx-accent flex-shrink-0" />
                    }

                    {/* Title / path */}
                    <span className={`flex-1 truncate min-w-0 ${isCreate ? 'text-cortx-text-primary' : 'text-cortx-text-secondary font-mono text-2xs'}`}>
                      {displayTitle}
                    </span>

                    {/* Type badge (create only) */}
                    {isCreate && edit?.type && (
                      <span className={`text-2xs px-1.5 py-0.5 rounded-full border flex-shrink-0 ${typeClass(edit.type)}`}>
                        {ENTITY_TYPES.find((t) => t.value === edit.type)?.label ?? edit.type}
                      </span>
                    )}

                    {/* Inline edit toggle (create + proposed only) */}
                    {isCreate && isProposed && (
                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : action.id)}
                        className={`flex-shrink-0 p-0.5 rounded transition-all cursor-pointer ${
                          isEditing
                            ? 'text-cortx-accent bg-cortx-accent/15'
                            : 'text-cortx-text-secondary/40 hover:text-cortx-accent opacity-0 group-hover/row:opacity-100'
                        }`}
                        title={t.actionButtons.editTitle}
                      >
                        {isEditing ? <ChevronUp size={11} /> : <Pencil size={11} />}
                      </button>
                    )}

                    {/* Preview eye */}
                    {isProposed && (
                      <button
                        type="button"
                        onClick={() => setPreviewAction(action)}
                        className="flex-shrink-0 p-0.5 rounded text-cortx-text-secondary/40 hover:text-cortx-accent opacity-0 group-hover/row:opacity-100 transition-all cursor-pointer"
                        title="Aperçu"
                      >
                        <Eye size={11} />
                      </button>
                    )}

                    {/* Status badge */}
                    <span className={`text-2xs px-1.5 py-0.5 rounded flex-shrink-0 ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>

                  {/* Inline edit panel */}
                  {isCreate && isEditing && edit && (
                    <InlineEditRow
                      actionId={action.id}
                      edit={edit}
                      onChange={updateEdit}
                      onDone={() => setEditingId(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Suggestions */}
        {response?.suggestions && response.suggestions.length > 0 && (
          <div className="space-y-1">
            {response.suggestions
              .filter((s) => !dismissedSuggestions.has(s))
              .map((suggestion, i) => (
                <div
                  key={i}
                  className="group/sugg flex items-start gap-2 text-xs text-cortx-accent-light bg-cortx-accent/5 border border-cortx-accent/20 rounded px-2.5 py-1.5"
                >
                  <Lightbulb size={12} className="text-cortx-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0"><WikiText text={suggestion} /></div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => void acceptSuggestion(suggestion)}
                      className="px-1.5 py-0.5 rounded text-2xs bg-cortx-accent/15 hover:bg-cortx-accent/25 text-cortx-accent transition-colors cursor-pointer"
                      title={t.chat.applyTooltip}
                    >
                      {t.chat.accept}
                    </button>
                    <button
                      onClick={() => dismissSuggestion(suggestion)}
                      className="p-0.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary/60 hover:text-cortx-text-primary transition-colors cursor-pointer"
                      title={t.chat.ignoreSuggestion}
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Conflicts */}
        {response?.conflicts && response.conflicts.length > 0 && (
          <div className="space-y-1">
            {response.conflicts.map((conflict, i) => (
              <div
                key={i}
                className="text-xs text-cortx-warning bg-cortx-warning/5 border border-cortx-warning/20 rounded px-2.5 py-1.5"
              >
                <WikiText text={conflict} />
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {actions.length > 0 && (
          <ActionButtons
            messageId={message.id}
            actions={actions}
            commitHash={response?.commitHash}
            selectedCount={selectedProposedCount}
            totalProposed={proposedActions.length}
            onAcceptSelected={() => {
              const ids = [...selectedIds].filter((id) =>
                proposedActions.some((a) => a.id === id)
              )
              void useChatStore.getState().acceptActions(message.id, {
                actionIds: ids,
                edits: buildEditsMap()
              })
            }}
            onRejectAll={() => {
              useChatStore.getState().rejectActions(message.id)
            }}
          />
        )}

        <div className="flex items-center gap-2">
          <span className="text-2xs text-cortx-text-secondary/40">
            {new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-cortx-elevated text-cortx-text-secondary/40 hover:text-cortx-text-secondary transition-all cursor-pointer"
            title={t.chat.copy}
          >
            {copied ? <Check size={11} className="text-cortx-success" /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {previewAction && (
        <ActionPreview action={previewAction} onClose={() => setPreviewAction(null)} />
      )}
    </div>
  )
}
