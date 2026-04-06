import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUIStore } from '../../stores/uiStore'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps): React.JSX.Element {
  const openFilePreview = useUIStore((s) => s.openFilePreview)

  // Transform wikilinks [[Name]] to clickable elements
  const processedContent = content.replace(
    /\[\[([^\]]+)\]\]/g,
    '[$1](cortx://link/$1)'
  )

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-cortx-text-primary mb-3 mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-cortx-text-primary mb-2 mt-5 pb-1 border-b border-cortx-border">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-cortx-text-primary mb-1.5 mt-4">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-cortx-text-primary/90 leading-relaxed mb-3">{children}</p>
          ),
          li: ({ children }) => (
            <li className="text-sm text-cortx-text-primary/90 leading-relaxed">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-cortx-text-primary">{children}</strong>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith('cortx://link/')) {
              const name = href.replace('cortx://link/', '')
              return (
                <button
                  onClick={() => {
                    // Try to find the file — simplified lookup
                    openFilePreview(name)
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
