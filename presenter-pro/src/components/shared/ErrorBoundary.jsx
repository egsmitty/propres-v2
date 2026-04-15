import React from 'react'
import { AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-3 p-6"
          style={{ background: 'var(--bg-app)' }}
        >
          <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {this.props.label || 'Something went wrong'}
          </p>
          <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)', maxWidth: 280 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 px-3 py-1.5 rounded text-xs font-medium"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
