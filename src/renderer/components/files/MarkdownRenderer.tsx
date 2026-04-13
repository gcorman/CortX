import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { resolveWikilink, wikilinkLabel } from '../../utils/wikilink'
import { useT } from '../../i18n'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps): React.JSX.Element {
  const openFilePreview = useUIStore((s) => s.openFilePreview)
  const addToast = useUIStore((s) => s.addToast)
  const files = useFileStore((s) => s.files)
  const t = useT()

  // Transform wikilinks [[Name]] → [Label](cortx://link/Name). The label strips
  // underscores and `.md`, so the brackets are never shown to the user.
  const processedContent = content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, name: string) => `[${wikilinkLabel(name)}](cortx://link/${encodeURIComponent(name)})`
  )

  return (
    <div className="max-w-none text-sm text-cortx-text-primary/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-cortx-text-primary mb-3 mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-cortx-text-primary mb-3 mt-4 pb-2 border-b border-cortx-border/60">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-cortx-text-primary mb-1.5 mt-4">{children}</h3>
          ),
          p: ({ children }) => {
            // A paragraph whose only child is a <strong> element (e.g. **Titre de section**)
            // is rendered with heading-like styling so it stands out visually.
            const arr = React.Children.toArray(children).filter(
              (c) => !(typeof c === 'string' && c.trim() === '')
            )
            const isBoldTitle =
              arr.length === 1 &&
              React.isValidElement(arr[0]) &&
              (arr[0] as React.ReactElement).type === 'strong'
            if (isBoldTitle) {
              return (
                <p className="text-sm font-semibold text-cortx-text-primary mt-4 mb-1.5 pb-1 border-b border-cortx-border/40">
                  {(arr[0] as React.ReactElement).props.children as React.ReactNode}
                </p>
              )
            }
            return <p className="text-sm text-cortx-text-primary/90 leading-relaxed mb-3">{children}</p>
          },
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-cortx-text-primary/90 leading-relaxed">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-cortx-text-primary">{children}</strong>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith('cortx://link/')) {
              const name = decodeURIComponent(href.replace('cortx://link/', ''))
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const resolved = resolveWikilink(name, files)
                    if (resolved) {
                      openFilePreview(resolved)
                    } else {
                      addToast(t.filePreview.wikilinkNotFound(wikilinkLabel(name)), 'info')
                    }
                  }}
                  className="text-cortx-accent hover:text-cortx-accent-light underline decoration-cortx-accent/30 hover:decoration-cortx-accent cursor-pointer transition-colors"
                >
                  {children}
                </button>
              )
            }
            return (
              <a href={href} className="text-cortx-accent hover:text-cortx-accent-light underline" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return (
                <pre className="bg-cortx-bg rounded-card p-3 overflow-x-auto border border-cortx-border">
                  <code className="text-xs font-mono text-cortx-text-primary">{children}</code>
                </pre>
              )
            }
            return (
              <code className="text-xs font-mono bg-cortx-bg px-1.5 py-0.5 rounded text-cortx-accent-light">{children}</code>
            )
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border border-cortx-border">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-cortx-elevated px-3 py-1.5 text-left font-semibold text-cortx-text-primary border-b border-cortx-border">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 text-cortx-text-secondary border-b border-cortx-border">{children}</td>
          ),
          hr: () => <hr className="border-cortx-border my-4" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cortx-accent pl-3 my-3 text-cortx-text-secondary italic">{children}</blockquote>
          )
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
