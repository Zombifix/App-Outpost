import { Component, type ReactNode, type ErrorInfo } from 'react'
import { t } from '../i18n'

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
          padding: 'var(--space-8) var(--space-6)',
          textAlign: 'center',
          gap: 'var(--space-4)',
          fontFamily: 'system-ui, sans-serif',
          background: 'var(--faint)',
          color: 'var(--text-strong)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>{t('Something went wrong', 'Oups, quelque chose s\'est cassé')}</h1>
        <p style={{ margin: 0, maxWidth: 420, opacity: 0.8 }}>
          {t('Reload the page to continue. Your data remains safely stored in your browser.', 'Recharge la page pour repartir. Tes données restent en sécurité dans ton navigateur.')}
        </p>
        {this.state.message && (
          <code style={{
            fontSize: 'var(--text-xs)',
            opacity: 0.55,
            background: 'var(--border-soft)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-xs)',
            maxWidth: 480,
            wordBreak: 'break-word',
          }}>
            {this.state.message}
          </code>
        )}
        <button
          onClick={this.reload}
          style={{
            marginTop: 'var(--space-2)',
            background: 'var(--purple)',
            color: '#fff',
            border: 'none',
            padding: 'var(--space-3) var(--space-6)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('Reload', 'Recharger')}
        </button>
      </div>
    )
  }
}
