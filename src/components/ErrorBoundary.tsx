import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string | null
}

/**
 * Last-resort boundary. Si un composant enfant crash, on évite l'écran blanc
 * et on propose un reload. Idéalement on remonte aussi vers un monitoring
 * (Sentry/Logflare) mais pas branché pour l'instant.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private reload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          textAlign: 'center',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
          background: '#f6f2e8',
          color: '#2a2a2a',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Oups, quelque chose s'est cassé</h1>
        <p style={{ margin: 0, maxWidth: 420, opacity: 0.8 }}>
          Recharge la page pour repartir. Tes données restent en sécurité dans ton navigateur.
        </p>
        {this.state.message && (
          <code style={{
            fontSize: 12,
            opacity: 0.55,
            background: 'rgba(0,0,0,0.05)',
            padding: '6px 10px',
            borderRadius: 6,
            maxWidth: 480,
            wordBreak: 'break-word',
          }}>
            {this.state.message}
          </code>
        )}
        <button
          onClick={this.reload}
          style={{
            marginTop: 8,
            background: '#1B5FE8',
            color: '#fff',
            border: 'none',
            padding: '10px 22px',
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Recharger
        </button>
      </div>
    )
  }
}
