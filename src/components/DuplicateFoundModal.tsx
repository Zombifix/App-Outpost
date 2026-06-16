import { useEffect } from 'react'
import type { Destination } from '../types'
import { Icon } from './Icon'
import { t } from '../i18n'

interface DuplicateFoundModalProps {
  existing: Destination
  incoming: Destination
  onCancel: () => void
  onMerge: () => void
}

export default function DuplicateFoundModal({
  existing,
  incoming,
  onCancel,
  onMerge,
}: DuplicateFoundModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const sameName = existing.name.toLowerCase() === incoming.name.toLowerCase()
  const isRoadtrip = (existing.kind ?? 'place') === 'zone'

  return (
    <div className="duplicate-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="duplicate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <button className="duplicate-modal-close" aria-label={t('Close', 'Fermer')} onClick={onCancel}>
          <Icon name="x" />
        </button>

        <div
          className="duplicate-modal-hero"
          style={{ backgroundImage: existing.image ? `url(${existing.image})` : undefined }}
        >
          {existing.tier && (
            <span className={`tier-orb tier-${existing.tier.toLowerCase()}`}>{existing.tier}</span>
          )}
        </div>

        <div className="duplicate-modal-body">
          <p className="duplicate-modal-eyebrow">
            {isRoadtrip ? t('Roadtrip already saved', 'Roadtrip déjà enregistré') : t('Already in your list', 'Déjà dans ta liste')}
          </p>
          <h2 id="duplicate-modal-title">
            {t('You already have', 'Tu as déjà')} <strong>{existing.name}</strong>
          </h2>
          <p className="duplicate-modal-text">
            {sameName
              ? t('No need for a duplicate — you can update your existing entry (notes, photo, memory).', 'Pas besoin d\'un doublon — tu peux mettre à jour ta fiche existante (notes, photo, souvenir).')
              : t(`You already saved "${existing.name}" at the same location. Update that entry instead.`, `Tu avais enregistré « ${existing.name} » au même endroit. Met à jour cette fiche.`)}
          </p>

          <div className="duplicate-modal-actions">
            <button className="duplicate-modal-secondary" onClick={onCancel}>
              {t('Cancel', 'Annuler')}
            </button>
            <button className="duplicate-modal-primary" onClick={onMerge}>
              <Icon name="edit" />
              {t('Update', 'Mettre à jour')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
