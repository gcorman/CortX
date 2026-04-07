import React from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-cortx-bg text-cortx-text-primary">
          <AlertTriangle size={32} className="text-cortx-error" />
          <h2 className="text-base font-semibold">Erreur de rendu</h2>
          <pre className="text-xs text-cortx-text-secondary bg-cortx-surface rounded-card p-4 max-w-xl overflow-auto max-h-48 w-full">
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack?.split('\n').slice(0, 8).join('\n')}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-card bg-cortx-accent text-white text-sm cursor-pointer hover:bg-cortx-accent-light transition-colors"
          >
            <RefreshCcw size={14} />
            Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
