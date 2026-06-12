import type { Tier } from '../types'
import type { CommunityRating } from '../hooks/useCommunityRatings'
import { t } from '../i18n'

/**
 * Badge "note du peuple" : pill outline neutre, volontairement distincte
 * de l'orb de tier perso (pleine et colorée) pour qu'on ne confonde jamais
 * son propre avis avec celui de la communauté.
 */
export function CommunityBadge({
  rating,
  myTier,
  showCount = false,
}: {
  rating: CommunityRating
  myTier?: Tier
  showCount?: boolean
}) {
  const tagsPart = rating.topTags.length ? ` · ${rating.topTags.join(' ')}` : ''
  const mePart = myTier ? ` — ${t('you', 'toi')} : ${myTier}` : ''
  const tooltip = `${t('Community rating', 'Note du peuple')} : ${rating.tier} · ${rating.ratingCount} ${t('ratings', 'avis')}${tagsPart}${mePart}`
  return (
    <span className="community-badge" title={tooltip} aria-label={tooltip}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <circle cx="9" cy="7" r="3" /><circle cx="15" cy="7" r="3" />
        <path d="M3 21c0-3.31 2.69-6 6-6h6c3.31 0 6 2.69 6 6" />
      </svg>
      <b>{rating.tier}</b>
      {showCount && <span className="community-badge-count">{rating.ratingCount}</span>}
    </span>
  )
}
