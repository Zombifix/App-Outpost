import { useEffect } from 'react'
import { t } from '../../i18n'

interface FriendToastProps {
  message: string
  onDismiss: () => void
  /** Durée avant auto-dismiss en ms. 0 = manuel uniquement. */
  duration?: number
}

/**
 * Toast minimal bas-droit pour les événements sociaux : nouvelle amitié,
 * demande acceptée, etc. Auto-dismiss après `duration` ms.
 */
export default function FriendToast({ message, onDismiss, duration = 4500 }: FriendToastProps) {
  useEffect(() => {
    if (duration <= 0) return
    const t = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(t)
  }, [duration, onDismiss])

  return (
    <div className="friend-toast" role="status" aria-live="polite">
      <span className="friend-toast-icon">👥</span>
      <span className="friend-toast-msg">{message}</span>
      <button className="friend-toast-close" onClick={onDismiss} aria-label={t('Close', 'Fermer')}>×</button>
    </div>
  )
}
