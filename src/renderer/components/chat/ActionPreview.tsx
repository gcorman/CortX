import { useState, useEffect, useRef } from 'react'
import { X, FilePlus, FileEdit } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useT } from '../../i18n'
import type { AgentAction } from '../../../shared/types'

interface ActionPreviewProps {
  action: AgentAction
  onClose: () => void
}

// --- Diff ---

type ChunkType = 'added' | 'removed' | 'unchanged'
interface DiffChunk { type: ChunkType; text: string }

function computeDiffChunks(
  beforeText: string,
  afterText: string
): { beforeChunks: DiffChunk[]; afterChunks: DiffChunk[] } {
  const a = beforeText.split('\n')
  const b = afterText.split('\n')
  const MAX = 600
  const aL = a.slice(0, MAX)
  const bL = b.slice(0, MAX)
  const m = aL.length, n = bL.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aL[i - 1] === bL[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  type Op = { type: 'added' | 'removed' | 'unchanged'; line: string }
  const ops: Op[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aL[i - 1] === bL[j - 1]) {
      ops.unshift({ type: 'unchanged', line: aL[i - 1] }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'added', line: bL[j - 1] }); j--
    } else {
      ops.unshift({ type: 'removed', line: aL[i - 1] }); i--
    }
  }

  function build(side: 'before' | 'after'): DiffChunk[] {
    const result: DiffChunk[] = []
    let cur: { type: ChunkType; lines: string[] } | null = null
    for (const op of ops) {
      let type: ChunkType | null = null
      if (op.type === 'unchanged') type = 'unchanged'
      else if (op.type === 'removed' && side === 'before') type = 'removed'
      else if (op.type === 'added' && side === 'after') type = 'added'
      else continue
      if (cur && cur.type === type) { cur.lines.push(op.line) }
      else { if (cur) result.push({ type: cur.type, text: cur.lines.join('\n') }); cur = { type, lines: [op.line] } }
    }
    if (cur) result.push({ type: cur.type, text: cur.lines.join('\n') })
    return result
  }

  return { beforeChunks: build('before'), afterChunks: build('after') }
}

// --- MD renderer (lightweight, no store deps) ---

function MdBlock({ text }: { text: string }): React.JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-cortx-text-primary mb-2 mt-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-cortx-text-primary mb-1.5 mt-3 pb-1 border-b border-cortx-border/50">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-cortx-text-primary mb-1 mt-2">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-cortx-text-primary/90 leading-relaxed mb-2">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-cortx-text-primary/90 leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-cortx-text-primary">{children}</strong>,
        a: ({ href, children }) => <a href={href} className="text-cortx-accent underline" target="_blank" rel="noopener noreferrer">{children}</a>,
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          return isBlock
            ? <pre className="bg-cortx-bg rounded p-2 overflow-x-auto border border-cortx-border my-2"><code className="text-xs font-mono text-cortx-text-primary">{children}</code></pre>
            : <code className="text-xs font-mono bg-cortx-bg px-1 py-0.5 rounded text-cortx-accent-light">{children}</code>
        },
        blockquote: ({ children }) => <blockquote className="border-l-2 border-cortx-accent pl-3 my-2 text-cortx-text-secondary italic">{children}</blockquote>,
        hr: () => <hr className="border-cortx-border my-3" />,
        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border border-cortx-border">{children}</table></div>,
        th: ({ children }) => <th className="bg-cortx-elevated px-2 py-1 text-left font-semibold text-cortx-text-primary border-b border-cortx-border">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 text-cortx-text-secondary border-b border-cortx-border">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function DiffPanel({
  chunks,
  scrollRef,
  onScroll,
}: {
  chunks: DiffChunk[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}): React.JSX.Element {
  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" onScroll={onScroll}>
      <div className="p-4 space-y-0">
        {chunks.map((chunk, idx) => {
          const bg =
            chunk.type === 'removed'
              ? 'bg-red-500/10 border-l-2 border-red-400/60 pl-3'
              : chunk.type === 'added'
              ? 'bg-green-500/10 border-l-2 border-green-400/60 pl-3'
              : ''
          return (
            <div key={idx} className={bg}>
              <MdBlock text={chunk.text || ' '} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Main component ---

export function ActionPreview({ action, onClose }: ActionPreviewProps): React.JSX.Element {
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const t = useT()

  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  useEffect(() => { loadPreview() }, [action])

  async function loadPreview(): Promise<void> {
    setIsLoading(true)
    try {
      const result = await window.cortx.agent.preview(action)
      setBefore(result.before)
      setAfter(result.after)
    } catch {
      setBefore(null)
      setAfter(action.content)
    }
    setIsLoading(false)
  }

  function syncFrom(source: HTMLDivElement, target: HTMLDivElement): void {
    if (syncing.current) return
    syncing.current = true
    const max = source.scrollHeight - source.clientHeight
    const ratio = max > 0 ? source.scrollTop / max : 0
    target.scrollTop = ratio * Math.max(0, target.scrollHeight - target.clientHeight)
    requestAnimationFrame(() => { syncing.current = false })
  }

  function onBeforeScroll(): void {
    if (beforeRef.current && afterRef.current) syncFrom(beforeRef.current, afterRef.current)
  }

  function onAfterScroll(): void {
    if (beforeRef.current && afterRef.current) syncFrom(afterRef.current, beforeRef.current)
  }

  const diff = before != null && after != null
    ? computeDiffChunks(before, after)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-cortx-surface border border-cortx-border rounded-panel w-full max-w-4xl mx-4 shadow-2xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-cortx-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {action.action === 'create' ? (
              <FilePlus size={16} className="text-cortx-success" />
            ) : (
              <FileEdit size={16} className="text-cortx-accent" />
            )}
            <span className="text-sm font-medium text-cortx-text-primary">
              {action.action === 'create' ? t.actionPreview.newFile : t.actionPreview.modification}
            </span>
            <span className="text-xs font-mono text-cortx-text-secondary bg-cortx-bg px-2 py-0.5 rounded">
              {action.file}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-cortx-text-secondary text-sm">
              {t.actionPreview.loading}
            </div>
          ) : action.action === 'create' ? (
            /* Create: single panel, rendered MD */
            <div className="h-full flex flex-col min-h-0">
              <div className="text-2xs uppercase text-cortx-success font-medium px-5 pt-4 pb-2 tracking-wider flex-shrink-0">
                {t.actionPreview.newContent}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
                <div className="bg-cortx-bg rounded-card p-4 border border-cortx-success/20">
                  <MdBlock text={after ?? ''} />
                </div>
              </div>
            </div>
          ) : (
            /* Modify: side-by-side diff with sync scroll */
            <div className="flex h-full min-h-0">
              {/* Before */}
              <div className="flex-1 border-r border-cortx-border flex flex-col min-h-0">
                <div className="text-2xs uppercase text-cortx-text-secondary font-medium px-4 pt-3 pb-2 tracking-wider flex-shrink-0">
                  {t.actionPreview.currentContent}
                </div>
                {diff ? (
                  <DiffPanel chunks={diff.beforeChunks} scrollRef={beforeRef} onScroll={onBeforeScroll} />
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 text-cortx-text-secondary text-sm italic">
                    {t.actionPreview.emptyFile}
                  </div>
                )}
              </div>

              {/* After */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-2xs uppercase text-cortx-success font-medium px-4 pt-3 pb-2 tracking-wider flex-shrink-0">
                  {t.actionPreview.afterEdit}
                </div>
                {diff ? (
                  <DiffPanel chunks={diff.afterChunks} scrollRef={afterRef} onScroll={onAfterScroll} />
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                    <MdBlock text={after ?? ''} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
