import { useMemo, useState } from 'react'
import type { Destination, Tier } from '../types'
import { TIER_COLORS, TIER_ORDER } from '../data'
import { destinationCommunityKey } from '../utils/destinationIdentity'
import { getDestinationTier } from '../utils'
import {
  useCommunityLeaderboard,
  useCommunityTeaserCount,
  type CommunityLeaderboardRow,
} from '../hooks/useCommunityRatings'
import { SegmentedControl } from './SegmentedControl'
import { Icon } from './Icon'
import { t } from '../i18n'

type TopN = 10 | 20 | 50 | 0
type MinRatings = 3 | 5 | 10

const TIER_HEADLINE: Record<Tier, string> = {
  S: t('The crowd is unanimous', 'Le peuple est unanime'),
  A: t('Crowd favorites', 'Les chouchous du peuple'),
  B: t('Generally appreciated', 'Globalement appreciees'),
  C: t('The crowd is lukewarm', 'Le peuple est tiede'),
  D: t('The crowd says skip', 'Le peuple dit passe ton tour'),
}

const DEFAULT_COLLAPSED: Record<Tier, boolean> = { S: false, A: false, B: true, C: true, D: true }

function flagUrl(countryCode: string | null): string | undefined {
  if (!countryCode) return undefined
  return `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`
}

export function CommunityLeaderboard({
  myDestinations,
  onSelectMine,
}: {
  myDestinations: Destination[]
  onSelectMine: (destination: Destination) => void
}) {
  const [search, setSearch] = useState('')
  const [topN, setTopN] = useState<TopN>(10)
  const [minRatings, setMinRatings] = useState<MinRatings>(3)
  const { rows, loading, hasMore, error, loadMore } = useCommunityLeaderboard(search)
  const [collapsed, setCollapsed] = useState<Record<Tier, boolean>>(DEFAULT_COLLAPSED)
  const isEmpty = !loading && rows.length === 0 && !search.trim()
  const teaserCount = useCommunityTeaserCount(isEmpty)

  const hasSearch = Boolean(search.trim())
  const visibleRows = useMemo(() => {
    const filtered = minRatings > 3 ? rows.filter(row => row.ratingCount >= minRatings) : rows
    if (hasSearch || topN === 0) return filtered
    return filtered.slice(0, topN)
  }, [rows, minRatings, topN, hasSearch])

  const mineByKey = useMemo(() => {
    const map = new Map<string, Destination>()
    for (const destination of myDestinations) {
      if (destination.kind === 'stop' || destination.kind === 'stage') continue
      map.set(destinationCommunityKey(destination), destination)
    }
    return map
  }, [myDestinations])

  const rowsByTier = useMemo(() => {
    const groups = new Map<Tier, CommunityLeaderboardRow[]>()
    for (const row of visibleRows) {
      const list = groups.get(row.tier) ?? []
      list.push(row)
      groups.set(row.tier, list)
    }
    return groups
  }, [visibleRows])

  return (
    <section className="community-leaderboard page-mode-fade" aria-label={t('Global ranking', 'Classement global')}>
      {!isEmpty && (
        <div className="community-leaderboard-filters">
          <input
            type="search"
            className="community-leaderboard-search"
            placeholder={t('Search a destination...', 'Rechercher une destination...')}
            value={search}
            onChange={event => setSearch(event.target.value)}
            aria-label={t('Search a destination', 'Rechercher une destination')}
          />
          <SegmentedControl
            className="tier-list-filters community-filter-topn"
            ariaLabel={t('Number of destinations shown', 'Nombre de destinations affichees')}
            role="radiogroup"
            size="sm"
            layout="scrollable"
            tone="tinted"
            value={String(topN)}
            options={[
              { value: '10', label: 'Top 10' },
              { value: '20', label: 'Top 20' },
              { value: '50', label: 'Top 50' },
              { value: '0', label: t('All', 'Toutes') },
            ]}
            onChange={value => setTopN(Number(value) as TopN)}
          />
          <label className="community-leaderboard-select-wrap">
            <span className="sr-only">{t('Minimum number of ratings', "Nombre minimum d'avis")}</span>
            <select
              className="community-leaderboard-select"
              value={String(minRatings)}
              onChange={event => setMinRatings(Number(event.target.value) as MinRatings)}
              aria-label={t('Minimum number of ratings', "Nombre minimum d'avis")}
            >
              <option value="3">{t('3+ ratings', '3+ avis')}</option>
              <option value="5">{t('5+ ratings', '5+ avis')}</option>
              <option value="10">{t('10+ ratings', '10+ avis')}</option>
            </select>
            <span className="community-leaderboard-select-icon" aria-hidden="true">
              <Icon name="chevron-down" />
            </span>
          </label>
        </div>
      )}

      {error && <p className="community-leaderboard-status">{error}</p>}

      {isEmpty && !error && (
        <div className="empty-friend-carnet-card community-leaderboard-empty" role="status">
          <h3>{t('The crowd has not spoken yet', 'Le peuple n a pas encore parle')}</h3>
          <p>
            {t(
              'The community rating appears as soon as 3 travelers rate the same destination.',
              'La note du peuple apparait des que 3 voyageurs ont note une meme destination.'
            )}
          </p>
          {teaserCount !== null && teaserCount > 0 && (
            <p className="community-leaderboard-teaser">
              {teaserCount}{' '}
              {t(
                teaserCount > 1 ? 'destinations are one rating away' : 'destination is one rating away',
                teaserCount > 1 ? 'destinations sont a un avis du seuil' : 'destination est a un avis du seuil'
              )}
            </p>
          )}
        </div>
      )}

      {!loading && rows.length === 0 && search.trim() && !error && (
        <p className="community-leaderboard-status">{t('No destination found', 'Aucune destination trouvee')}</p>
      )}
      {!loading && rows.length > 0 && visibleRows.length === 0 && (
        <p className="community-leaderboard-status">
          {t('No destination matches these filters', 'Aucune destination ne passe ces filtres')}
        </p>
      )}

      {TIER_ORDER.map(tier => {
        const tierRows = rowsByTier.get(tier)
        if (!tierRows?.length) return null
        const colors = TIER_COLORS[tier]
        const isCollapsed = topN === 0 && !hasSearch && collapsed[tier]
        return (
          <article key={tier} className={`tier-list-row tier-list-row-${tier.toLowerCase()}`}>
            <header onClick={() => setCollapsed(previous => ({ ...previous, [tier]: !previous[tier] }))}>
              <span className={`tier-orb tier-${tier.toLowerCase()}`} style={{ boxShadow: `0 6px 16px ${colors.pin}33` }}>
                {tier}
              </span>
              <div className="tier-row-label-group">
                <strong style={{ color: colors.label }}>{TIER_HEADLINE[tier]}</strong>
              </div>
              <div className="tier-row-right">
                <span className="tier-row-count">{tierRows.length}</span>
                <svg className={`tier-row-chevron ${isCollapsed ? '' : 'is-open'}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </header>

            {!isCollapsed && (
              <div className="tier-row-body">
                <div className="tier-list-row-strip">
                  {tierRows.map(row => {
                    const mine = mineByKey.get(row.key) ?? null
                    const myTier = mine ? getDestinationTier(mine) : null
                    const flag = flagUrl(row.countryCode)
                    const imageStyle = mine?.image
                      ? { backgroundImage: `url(${mine.image})` }
                      : undefined
                    const inner = (
                      <>
                        <div
                          className="dest-row-thumb community-row-thumb"
                          style={imageStyle}
                          aria-hidden="true"
                        >
                          {!mine?.image && (
                            <span className="dest-row-thumb-placeholder">
                              {row.displayName.trim().charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="dest-row-info">
                          <span className="dest-row-name">{row.displayName}</span>
                          <span className="dest-row-country">
                            {flag && <img src={flag} alt="" className="dest-row-flag" loading="lazy" />}
                            {row.displayCountry}
                          </span>
                        </div>
                        <div className="dest-row-signals community-row-meta">
                          {row.topTags.slice(0, 2).map(tag => (
                            <span key={tag} className="dest-row-signal community-row-tag">
                              <span className="dest-row-signal-label">{tag}</span>
                            </span>
                          ))}
                          {row.topTags.length > 2 && (
                            <span className="dest-row-signal community-row-tag" title={row.topTags.slice(2).join(' · ')}>
                              <span className="dest-row-signal-label">+{row.topTags.length - 2}</span>
                            </span>
                          )}
                        </div>
                        <div className="dest-row-scores community-row-scores">
                          {myTier && (
                            <span className="community-row-mine" title={t('Your rating', 'Ta note')}>
                              <span
                                className={`tier-orb tier-orb--mini tier-${myTier.toLowerCase()}`}
                                aria-label={`${t('Your rating', 'Ta note')} : ${myTier}`}
                              >
                                {myTier}
                              </span>
                              <span className="community-row-mine-label" aria-hidden="true">{t('you', 'toi')}</span>
                            </span>
                          )}
                          <span className="community-row-avg" title={t('Community rating', 'Note du peuple')}>
                            <b>{row.avgScore.toFixed(1)}</b>
                            <span>{row.ratingCount} {t('ratings', 'avis')}</span>
                          </span>
                        </div>
                      </>
                    )

                    return mine ? (
                      <article key={row.key} className="dest-row community-row community-row--visited">
                        <button
                          type="button"
                          className="dest-row-btn"
                          onClick={() => onSelectMine(mine)}
                          aria-label={`${t('See', 'Voir')} ${row.displayName}`}
                        >
                          {inner}
                        </button>
                      </article>
                    ) : (
                      <article key={row.key} className="dest-row community-row">
                        <div className="dest-row-btn community-row-static">{inner}</div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </article>
        )
      })}

      {loading && <p className="community-leaderboard-status">{t('Loading...', 'Chargement...')}</p>}

      {hasMore && !loading && topN === 0 && (
        <button type="button" className="community-leaderboard-more" onClick={loadMore}>
          {t('Load more', 'Charger plus')}
        </button>
      )}
    </section>
  )
}
