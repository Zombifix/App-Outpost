import { useEffect, useMemo, useRef, useState } from 'react'
import type { Destination, Friend, Friendship, Intent, Tier } from '../types'

interface MyProfileInfo {
  displayName?: string | null
  avatarUrl?: string | null
  avatarBg?: string
  avatarFg?: string
}
import {
  FRIENDS,
  FRIEND_DESTINATIONS,
  TIER_COLORS,
  TIER_ORDER,
} from '../data'
import { FAKE_FRIENDS_MODE, getFakeFriendDestinations } from '../hooks/_fakeFriends'
import { useFriends } from '../hooks/useFriends'
import { useFriendDestinations } from '../hooks/useFriendDestinations'
import { destinationNameKey, destinationNameSet } from '../utils/destinationIdentity'
import { computeTravelerProfile, getDestinationScore, getDestinationTier } from '../utils'
import { Avatar } from './Avatar'
import { SegmentedControl } from './SegmentedControl'
import { t } from '../i18n'

interface TierListPageProps {
  destinations: Destination[]
  onSelect: (name: string) => void
  incomingCompareFriend?: Friendship | null
  incomingCompareFriendDestinations?: Destination[]
  myProfile?: MyProfileInfo | null
}

type TierListFilter =
  | 'all' | 'recent' | 'favorites' | 'friends' | 'solo'
  | 'versus' | 'friend-only' | 'mine-only'
  | 'shared' | 'disagreements'

const BASE_TIER_FILTERS: TierListFilter[] = ['all', 'recent', 'favorites', 'friends', 'solo']
const COMPARE_TIER_FILTERS: TierListFilter[] = ['versus', 'friend-only', 'mine-only']

const TIER_FILTER_LABEL: Record<TierListFilter, string> = {
  all: t('All', 'Toutes'),
  recent: t('Recent', 'Récents'),
  favorites: t('Favorites', 'Coups de cœur'),
  friends: t('With friends', 'Entre amis'),
  solo: t('Solo', 'Solo'),
  versus: t('Tier list versus', 'Tier list versus'),
  'friend-only': t('Their tier list', 'Sa tier list'),
  'mine-only': t('My tier list', 'Ma tier list'),
  shared: t('Both seen', 'Vus tous les deux'),
  disagreements: t('Disagreements', 'Avis opposés'),
}

const INTENT_LABEL: Record<Intent, string> = {
  tourisme: t('Tourism', 'Tourisme'),
  sorties: t('Nightlife', 'Sorties'),
  gastro: t('Food & Gastronomy', 'Gastronomie'),
  nature: t('Nature', 'Nature'),
  travail: t('Work', 'Travail'),
  'city-trip': t('City trip', 'City-trip'),
}

const INTENT_EMOJI: Record<Intent, string> = {
  tourisme: '🗺',
  sorties: '🌙',
  gastro: '🍽',
  nature: '🌿',
  travail: '💼',
  'city-trip': '🏙',
}

const COMPANION_LABEL: Record<NonNullable<Destination['companions']>, string> = {
  solo: 'Solo',
  couple: 'Couple',
  amis: t('Friends', 'Amis'),
  famille: t('Family', 'Famille'),
  travail: 'Work',
}

const COMPANION_EMOJI: Record<NonNullable<Destination['companions']>, string> = {
  solo: '🧭',
  couple: '💞',
  amis: '👥',
  famille: '🏡',
  travail: '💼',
}

const TIER_RANK: Record<Tier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }

const COUNTRY_CODE_MAP: Record<string, string> = {
  'Japon': 'jp', 'Portugal': 'pt', 'Espagne': 'es', 'France': 'fr',
  'Italie': 'it', 'Canada': 'ca', 'Brésil': 'br', 'Mexique': 'mx',
  'Indonésie': 'id', 'Indonesie': 'id', 'Thaïlande': 'th', 'Maroc': 'ma',
  'Islande': 'is', 'Afrique du Sud': 'za', 'Nouvelle-Zélande': 'nz',
  'Nouvelle-Zelande': 'nz', 'Émirats arabes unis': 'ae', 'Emirats arabes unis': 'ae',
  'Singapour': 'sg', 'Corée du Sud': 'kr', 'Coree du Sud': 'kr',
  'Taïwan': 'tw', 'Taiwan': 'tw', 'Vietnam': 'vn', 'Pologne': 'pl',
  'Allemagne': 'de', 'Belgique': 'be', 'Pays-Bas': 'nl', 'Irlande': 'ie',
  'Royaume-Uni': 'gb', 'Royaume-Uni (Écosse)': 'gb', 'Royaume-Uni (UK)': 'gb',
}

function getCountryFlag(destination: Destination): string | undefined {
  const code = destination.countryCode ?? COUNTRY_CODE_MAP[destination.country]
  if (!code) return undefined
  return `https://flagcdn.com/24x18/${code.toLowerCase()}.png`
}

function getAvgScore(destinations: Destination[]): number | null {
  const ranked = destinations.filter(d => d.kind !== 'stop')
  if (!ranked.length) return null
  return ranked.reduce((sum, d) => sum + getDestinationScore(d), 0) / ranked.length
}

const DEMO_FRIEND_DESTINATIONS: Record<string, Destination[]> = {
  AS: (FRIEND_DESTINATIONS.AS ?? []).map(destination => ({
    ...destination,
    tier: destination.name === 'Kyoto'
      ? 'A'
      : destination.name === 'Lisbonne'
        ? 'S'
        : destination.name === 'Barcelone'
          ? 'B'
          : destination.tier,
    coupDeCoeur: destination.name === 'Lisbonne' || destination.name === 'Bali',
    personalBudget: destination.personalBudget ?? {
      Kyoto: 520,
      Bali: 390,
      Lisbonne: 320,
      Barcelone: 540,
      Bangkok: 280,
      'Le Cap': 610,
      Vancouver: 760,
    }[destination.name],
    tripDays: destination.tripDays ?? {
      Kyoto: 7,
      Bali: 8,
      Lisbonne: 4,
      Barcelone: 3,
      Bangkok: 5,
      'Le Cap': 6,
      Vancouver: 5,
    }[destination.name],
    companions: destination.companions ?? (destination.name === 'Lisbonne' ? 'couple' : 'amis'),
  })),
  LM: (FRIEND_DESTINATIONS.LM ?? []).map(destination => ({
    ...destination,
    tier: destination.name === 'Bangkok'
      ? 'A'
      : destination.name === 'Dubai'
        ? 'D'
        : destination.tier,
    coupDeCoeur: destination.name === 'Le Cap' || destination.name === 'Mexico',
    personalBudget: destination.personalBudget ?? 420,
    tripDays: destination.tripDays ?? 5,
    companions: destination.companions ?? 'solo',
  })),
  JB: (FRIEND_DESTINATIONS.JB ?? []).map(destination => ({
    ...destination,
    tier: destination.name === 'Rio de Janeiro'
      ? 'A'
      : destination.name === 'New York'
        ? 'C'
        : destination.tier,
    coupDeCoeur: destination.name === 'Bangkok' || destination.name === 'Rio de Janeiro',
    personalBudget: destination.personalBudget ?? 680,
    tripDays: destination.tripDays ?? 6,
    companions: destination.companions ?? 'amis',
  })),
}

const TIER_DESCRIPTIONS: Record<Tier, string> = {
  S: t('Rare, defining experiences that stay with you.', 'Des expériences rares, marquantes, qui restent en mémoire.'),
  A: t('Really great experiences I truly loved.', "De très belles expériences, que j'ai vraiment adorées."),
  B: t('Pleasant experiences, nothing exceptional.', 'Des expériences agréables, sans être particulièrement marquantes.'),
  C: t('Mixed experiences — not bad, but not memorable.', 'Des expériences mitigées, pas mauvaises, mais pas mémorables.'),
  D: t('Disappointing experiences I would not repeat.', 'Des expériences décevantes, que je ne referais pas.'),
}

const TIER_LABEL: Record<Tier, string> = {
  S: t('Exceptional', 'Exceptionnel'),
  A: t('Great', 'Génial'),
  B: t('Decent', 'Correct'),
  C: t('Meh', 'Bof'),
  D: t('Avoid', 'À éviter'),
}

function filterDestinations(list: Destination[], filter: TierListFilter, compareList: Destination[] = []): Destination[] {
  const compareByName = new Map(compareList.map(destination => [destinationNameKey(destination), destination]))
  const currentYear = new Date().getFullYear()

  return list.filter(destination => {
    if (filter === 'recent') return Boolean(destination.tripYear && destination.tripYear >= currentYear - 2)
    if (filter === 'favorites') return Boolean(destination.coupDeCoeur)
    if (filter === 'friends') return destination.companions === 'amis'
    if (filter === 'solo') return destination.companions === 'solo'
    if (filter === 'shared') return compareByName.has(destinationNameKey(destination))
    if (filter === 'disagreements') {
      const theirs = compareByName.get(destinationNameKey(destination))
      return Boolean(theirs && getDestinationTier(theirs) !== getDestinationTier(destination))
    }
    return true
  }).sort((a, b) => {
    if (filter === 'recent') return (b.tripYear ?? 0) - (a.tripYear ?? 0)
    if (filter === 'favorites') return Number(Boolean(b.coupDeCoeur)) - Number(Boolean(a.coupDeCoeur))
    if (filter === 'disagreements') {
      const aTier = getDestinationTier(a)
      const bTier = getDestinationTier(b)
      const aCompare = compareByName.get(destinationNameKey(a))
      const bCompare = compareByName.get(destinationNameKey(b))
      const aCompareTier = aCompare ? getDestinationTier(aCompare) : aTier
      const bCompareTier = bCompare ? getDestinationTier(bCompare) : bTier
      return Math.abs(TIER_RANK[bTier] - TIER_RANK[bCompareTier]) - Math.abs(TIER_RANK[aTier] - TIER_RANK[aCompareTier])
    }
    return 0
  })
}

function DestRow({
  myDest,
  friendDest,
  friendName,
  isShared,
  isCompareMode,
  onSelect,
}: {
  myDest: Destination
  friendDest?: Destination | null
  friendName?: string
  isShared?: boolean
  isCompareMode?: boolean
  onSelect?: (destination: Destination) => void
}) {
  const isCoupDeCoeur = Boolean(myDest.coupDeCoeur)
  const myScore = getDestinationScore(myDest)
  const friendScore = friendDest ? getDestinationScore(friendDest) : null
  const flagUrl = getCountryFlag(myDest)
  const tier = getDestinationTier(myDest)
  const colors = TIER_COLORS[tier]
  const intentEmoji = INTENT_EMOJI[myDest.intent]
  const intentLabel = INTENT_LABEL[myDest.intent]

  return (
    <article className={`dest-row${isCoupDeCoeur ? ' is-coup-de-coeur' : ''}`}>
      <button
        type="button"
        className="dest-row-btn"
        onClick={() => onSelect?.(myDest)}
        aria-label={`Voir ${myDest.name}`}
      >
        <div
          className="dest-row-thumb"
          style={myDest.image ? { backgroundImage: `url(${myDest.image})` } as React.CSSProperties : undefined}
          aria-hidden="true"
        >
          {!myDest.image && <span className="dest-row-thumb-placeholder">{myDest.name[0]}</span>}
        </div>
        <div className="dest-row-info">
          <span className="dest-row-name">{myDest.name}</span>
          <span className="dest-row-country">
            {flagUrl && <img src={flagUrl} alt="" className="dest-row-flag" loading="lazy" />}
            {myDest.country}
          </span>
        </div>
        <div className="dest-row-signals" aria-label={intentLabel}>
          <span className="dest-row-signal dest-row-signal--intent" title={intentLabel} aria-hidden="true">
            {intentEmoji}
          </span>
          {isCoupDeCoeur && (
            <span className="dest-row-signal dest-row-signal--heart" aria-label="Coup de cœur">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
              </svg>
            </span>
          )}
          {isCompareMode && myDest.companions && (
            <span className="dest-row-chip" aria-hidden="true">
              {COMPANION_EMOJI[myDest.companions]} {COMPANION_LABEL[myDest.companions]}
            </span>
          )}
          {isCompareMode && myDest.tripDays && (
            <span className="dest-row-chip" aria-hidden="true">
              {myDest.tripDays}j
            </span>
          )}
          {isShared && (
            <span className="dest-row-signal dest-row-signal--shared" aria-label="Destination en commun">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="9" cy="7" r="3" /><circle cx="15" cy="7" r="3" />
                <path d="M3 21c0-3.31 2.69-6 6-6h6c3.31 0 6 2.69 6 6" />
              </svg>
            </span>
          )}
        </div>
        <div className={`dest-row-scores${friendDest !== undefined ? ' dest-row-scores--versus' : ''}`}>
          {friendDest !== undefined ? (
            <>
              <span className="dest-score-stacked-me" style={{ color: colors.pin } as React.CSSProperties}>
                {myScore.toFixed(1)}
              </span>
              <span className="dest-score-stacked-friend">
                {friendScore !== null ? friendScore.toFixed(1) : '–'}
              </span>
            </>
          ) : (
            <span className="dest-score-pill dest-score-pill--solo" style={{ borderColor: `${colors.pin}44` } as React.CSSProperties}>
              {myScore.toFixed(1)}
            </span>
          )}
        </div>
      </button>
    </article>
  )
}

function ComparisonBanner({
  friend,
  myProfile,
  myDests,
  friendDests,
  friendOnlyCount,
  myProfileTitle,
  friendTitle,
  onClose,
}: {
  friend: Friend
  myProfile?: MyProfileInfo | null
  myDests: Destination[]
  friendDests: Destination[]
  friendOnlyCount: number
  myProfileTitle?: string | null
  friendTitle?: string | null
  onClose: () => void
}) {
  const myMap = new Map(myDests.map(d => [destinationNameKey(d), d]))
  const sharedCount = friendDests.filter(d => myMap.has(destinationNameKey(d))).length
  const myAvg = getAvgScore(myDests)
  const friendAvg = getAvgScore(friendDests)
  const friendFirstName = friend.name.split(' ')[0]
  const myName = myProfile?.displayName?.split(' ')[0] ?? t('Me', 'Moi')
  const myInitials = myProfile?.displayName?.trim().slice(0, 2).toUpperCase() ?? 'M'

  return (
    <div className="compare-banner">
      <div className="compare-banner-player compare-banner-player--me">
        <Avatar
          avatarUrl={myProfile?.avatarUrl}
          initials={myInitials}
          bg={myProfile?.avatarBg ?? '#1B5FE8'}
          fg={myProfile?.avatarFg ?? '#ffffff'}
          className="compare-banner-avatar"
          ariaHidden={true}
        />
        <div className="compare-banner-identity">
          <span className="compare-banner-name">{myName}</span>
          {myProfileTitle && (
            <span className="compare-banner-title" title={myProfileTitle}>{myProfileTitle}</span>
          )}
          {myAvg !== null && (
            <span className="compare-banner-score">{myAvg.toFixed(1)}</span>
          )}
        </div>
      </div>

      <div className="compare-banner-center">
        <span className="compare-banner-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="9" cy="7" r="3" /><circle cx="15" cy="7" r="3" />
            <path d="M3 21c0-3.31 2.69-6 6-6h6c3.31 0 6 2.69 6 6" />
          </svg>
          {sharedCount} {t('en commun', 'shared')}
        </span>
        {friendOnlyCount > 0 && (
          <span className="compare-banner-stat">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {friendOnlyCount} {t('only for', 'uniques à')} {friendFirstName}
          </span>
        )}
      </div>

      <div className="compare-banner-player compare-banner-player--friend">
        <div className="compare-banner-identity compare-banner-identity--right">
          <span className="compare-banner-name">{friendFirstName}</span>
          {friendTitle && (
            <span className="compare-banner-title" title={friendTitle}>{friendTitle}</span>
          )}
          {friendAvg !== null && (
            <span className="compare-banner-score">{friendAvg.toFixed(1)}</span>
          )}
        </div>
        <Avatar
          avatarUrl={friend.avatarUrl}
          initials={friend.initials}
          bg={friend.bg}
          fg={friend.color}
          className="compare-banner-avatar"
          ariaHidden={true}
        />
      </div>

      <button className="compare-banner-close" onClick={onClose} aria-label={t('Fermer la comparaison', 'Close comparison')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function DestinationPreview({
  destination,
  ownerLabel,
  ownerColor,
  onClose,
  onOpenMap,
}: {
  destination: Destination
  ownerLabel: string
  ownerColor?: string
  onClose: () => void
  onOpenMap: (name: string) => void
}) {
  const stats = getPreviewStats(destination)
  const tier = getDestinationTier(destination)

  return (
    <aside className="tier-destination-preview" aria-label={`Apercu de ${destination.name}`}>
      <div
        className="tier-destination-preview-image"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      >
        <span className="tier-preview-owner" style={ownerColor ? { '--owner-color': ownerColor } as React.CSSProperties : undefined}>
          {ownerLabel}
        </span>
      </div>
      <div className="tier-destination-preview-body">
        <button className="tier-destination-preview-close" onClick={onClose} aria-label="Close preview">×</button>
        <div className="tier-preview-heading">
          <span className={`tier-orb tier-${tier.toLowerCase()}`}>{tier}</span>
          {destination.coupDeCoeur && <span className="tier-preview-favorite">♥ Favorite</span>}
        </div>
        <h3>{destination.name}, {destination.country}</h3>
        {destination.summary && <p>{destination.summary}</p>}
        <dl className="tier-preview-stats">
          {stats.map(item => (
            <div key={item.label}>
              <dt><span aria-hidden="true">{item.icon}</span>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {destination.standout && (
          <div className="tier-preview-note">
            <span>✨ Highlight</span>
            <strong>{destination.standout}</strong>
          </div>
        )}
        <button className="tier-preview-map-button" onClick={() => onOpenMap(destination.name)}>
          See on map
        </button>
      </div>
    </aside>
  )
}

function TierRow({
  tier,
  myDests,
  friendDests,
  friend,
  sharedNames,
  collapsed,
  isCompareMode,
  onToggle,
  onSelectMine,
}: {
  tier: Tier
  myDests: Destination[]
  friendDests: Destination[]
  friend: Friend | null
  sharedNames: Set<string>
  collapsed: boolean
  isCompareMode?: boolean
  onToggle: () => void
  onSelectMine: (destination: Destination) => void
}) {
  const colors = TIER_COLORS[tier]
  const mine = myDests
    .filter(destination => getDestinationTier(destination) === tier && destination.kind !== 'stop')
    .sort((a, b) => getDestinationScore(b) - getDestinationScore(a) || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  const friendLookup = new Map(
    friendDests
      .filter(destination => destination.kind !== 'stop')
      .map(destination => [destinationNameKey(destination), destination])
  )
  const count = String(mine.length)

  return (
    <article className={`tier-list-row tier-list-row-${tier.toLowerCase()}`}>
      <header onClick={onToggle}>
        <span
          className={`tier-orb tier-${tier.toLowerCase()}`}
          style={{ boxShadow: `0 6px 16px ${colors.pin}33` }}
        >
          {tier}
        </span>
        <div className="tier-row-label-group">
          <strong style={{ color: colors.label }}>{TIER_LABEL[tier]}</strong>
          <span className="tier-row-description">{TIER_DESCRIPTIONS[tier]}</span>
        </div>
        <div className="tier-row-right">
          <span className="tier-row-count">{count}</span>
          <svg
            className={`tier-row-chevron ${collapsed ? '' : 'is-open'}`}
            width="16" height="16" viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </header>

      {!collapsed && (
        <div className="tier-row-body">
          <div className="tier-list-row-strip">
            {(() => {
              const rows = mine.map(d => ({
                my: d,
                their: friend ? (friendLookup.get(destinationNameKey(d)) ?? null) : null,
                isShared: sharedNames.has(destinationNameKey(d)),
              }))
              if (rows.length === 0) return <span className="tier-list-empty">{t('No destinations', 'Aucune destination')}</span>
              return rows.map(({ my, their, isShared: shared }) => (
                <DestRow
                  key={destinationNameKey(my)}
                  myDest={my}
                  friendDest={friend ? their : undefined}
                  friendName={friend?.name.split(' ')[0]}
                  isShared={shared}
                  isCompareMode={isCompareMode}
                  onSelect={onSelectMine}
                />
              ))
            })()}
          </div>
        </div>
      )}
    </article>
  )
}

export default function TierListPage({
  destinations,
  onSelect,
  incomingCompareFriend = null,
  incomingCompareFriendDestinations = [],
  myProfile,
}: TierListPageProps) {
  const [friend, setFriend] = useState<Friend | null>(null)
  const [friendUserId, setFriendUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState<TierListFilter>('all')
  const [collapsed, setCollapsed] = useState<Record<Tier, boolean>>({ S: false, A: false, B: true, C: true, D: true })
  const [comparePicker, setComparePicker] = useState(false)
  const [preview, setPreview] = useState<{ destination: Destination; ownerLabel: string; ownerColor?: string } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const { accepted: realFriends } = useFriends()
  const {
    destinations: realFriendDests,
    access: realFriendAccess,
  } = useFriendDestinations(friendUserId)

  useEffect(() => {
    if (!incomingCompareFriend) return
    setFriend({
      initials: incomingCompareFriend.displayName.slice(0, 2).toUpperCase(),
      name: incomingCompareFriend.displayName,
      color: incomingCompareFriend.avatarFg,
      bg: incomingCompareFriend.avatarBg,
      count: 0,
      avatarUrl: incomingCompareFriend.avatarUrl,
    })
    setFriendUserId(incomingCompareFriend.otherUser)
    setFilter('versus')
  }, [incomingCompareFriend?.otherUser])

  useEffect(() => {
    if (!comparePicker) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setComparePicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [comparePicker])

  const friendDests = friend
    ? friendUserId
      ? (FAKE_FRIENDS_MODE
          ? getFakeFriendDestinations(friendUserId)
          : incomingCompareFriend && incomingCompareFriend.otherUser === friendUserId
            ? incomingCompareFriendDestinations
            : realFriendDests)
      : DEMO_FRIEND_DESTINATIONS[friend.initials] ?? FRIEND_DESTINATIONS[friend.initials] ?? []
    : []
  const compareDenied = Boolean(friend && friendUserId && !realFriendAccess.allowed && realFriendAccess.deniedReason)
  const visibleFilters = friend ? COMPARE_TIER_FILTERS : BASE_TIER_FILTERS
  const myFiltered = useMemo(() => filterDestinations(destinations, filter, friendDests), [destinations, filter, friendDests])
  const friendFiltered = useMemo(() => filterDestinations(friendDests, filter, destinations), [friendDests, filter, destinations])

  useEffect(() => {
    if (!visibleFilters.includes(filter)) {
      setFilter(friend ? 'versus' : 'all')
    }
  }, [filter, visibleFilters, friend])

  const sharedNames = useMemo(() => {
    if (!friend) return new Set<string>()
    const myNames = destinationNameSet(myFiltered)
    return new Set(friendFiltered.filter(destination => myNames.has(destinationNameKey(destination))).map(destinationNameKey))
  }, [friend, myFiltered, friendFiltered])

  const myTripCount = useMemo(() => destinations.filter(d => d.kind !== 'stop').length, [destinations])
  const friendFirstName = friend?.name.split(' ')[0] ?? t('Friend', 'Ami')
  const myAverage = useMemo(() => getAvgScore(destinations), [destinations])
  const myFavoriteCount = useMemo(() => destinations.filter(d => d.coupDeCoeur && d.kind !== 'stop').length, [destinations])
  const friendOnlyCount = useMemo(() => {
    if (!friend) return 0
    const myNames = destinationNameSet(destinations)
    return friendDests.filter(destination => !myNames.has(destinationNameKey(destination))).length
  }, [destinations, friend, friendDests])
  const tierSummaryCounts = useMemo(
    () => TIER_ORDER.map(tier => ({
      tier,
      count: destinations.filter(d => d.kind !== 'stop' && getDestinationTier(d) === tier).length,
    })).filter(item => item.count > 0),
    [destinations]
  )
  const myTiers = useMemo(
    () => TIER_ORDER.filter(tier => myFiltered.some(d => getDestinationTier(d) === tier && d.kind !== 'stop')),
    [myFiltered]
  )
  const friendTiers = useMemo(
    () => TIER_ORDER.filter(tier => friendFiltered.some(d => getDestinationTier(d) === tier && d.kind !== 'stop')),
    [friendFiltered]
  )

  const myProfileTitle = useMemo(
    () => destinations.length >= 3 ? computeTravelerProfile(destinations).title : null,
    [destinations]
  )
  const friendTitle = useMemo(
    () => friend && friendDests.length >= 3 ? computeTravelerProfile(friendDests).title : null,
    [friend, friendDests]
  )

  function toggleCollapse(tier: Tier) {
    setCollapsed(prev => ({ ...prev, [tier]: !prev[tier] }))
  }

  function clearComparison() {
    setFriend(null)
    setFriendUserId(null)
    setComparePicker(false)
  }

  function selectFriend(friendShape: Friend, userId: string | null) {
    setFriend(friendShape)
    setFriendUserId(userId)
    setComparePicker(false)
    setFilter('versus')
  }

  const myInitials = myProfile?.displayName?.trim().slice(0, 2).toUpperCase() ?? 'M'

  return (
    <main className={`tier-list-page${friend && !compareDenied ? ' is-comparing' : ' is-solo'}`} aria-label="Tier list">
      <section className="tier-list-hero" aria-label={t('Ranking summary', 'Résumé du classement')}>
        <div className="tier-list-hero-head">
          <div className="tier-list-title">
            <span className="tier-list-eyebrow">Outpost</span>
            <h1>{t('My rankings', 'Mon classement')}</h1>
          </div>

          <div className="tier-list-hero-actions">
            <span className="tier-list-hero-count" aria-label={`${myTripCount} destinations`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 17 9 11l4 4 7-8" />
                <path d="M15 7h5v5" />
              </svg>
              {myTripCount}
              <span className="tier-list-hero-count-label">destinations</span>
            </span>

            <div className="tier-list-actions" ref={pickerRef}>
              <button
                className={`tier-list-compare-btn${friend ? ' has-selection' : ''}`}
                type="button"
                onClick={() => setComparePicker(value => !value)}
                aria-expanded={comparePicker}
                style={friend ? { '--friend-bg': friend.bg, '--friend-color': friend.color } as React.CSSProperties : undefined}
              >
                {friend ? (
                  <>
                    <Avatar
                      avatarUrl={friend.avatarUrl}
                      initials={friend.initials}
                      bg={friend.bg}
                      fg={friend.color}
                      className="tier-list-compare-chip-avatar"
                      ariaHidden={true}
                    />
                    <span className="tier-list-compare-chip-label">{friend.name.split(' ')[0]}</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="10.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M1 13c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4M10.5 9c2.485 0 4.5 1.79 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <span className="tier-list-compare-chip-label">{t('Compare', 'Comparer')}</span>
                  </>
                )}
                <svg className="tier-list-compare-chip-caret" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {comparePicker && (
                <div className="friend-picker">
                  <button className="friend-picker-clear" type="button" onClick={clearComparison}>
                    {t('No one', 'Personne')}
                  </button>
                  {realFriends.length === 0 && (
                    <p className="friends-muted" style={{ padding: '8px 12px' }}>
                      Local demo friends for testing comparison.
                    </p>
                  )}
                  {realFriends.map(realFriend => {
                    const initials = realFriend.displayName.slice(0, 2).toUpperCase()
                    const friendShape: Friend = {
                      initials,
                      name: realFriend.displayName,
                      color: realFriend.avatarFg,
                      bg: realFriend.avatarBg,
                      count: 0,
                      avatarUrl: realFriend.avatarUrl,
                    }
                    return (
                      <button
                        key={realFriend.otherUser}
                        className={`friend-picker-item ${friendUserId === realFriend.otherUser ? 'is-active' : ''}`}
                        onClick={() => selectFriend(friendShape, realFriend.otherUser)}
                        style={{ '--friend-color': realFriend.avatarFg, '--friend-bg': realFriend.avatarBg } as React.CSSProperties}
                      >
                        <Avatar
                          avatarUrl={realFriend.avatarUrl}
                          initials={initials}
                          bg={realFriend.avatarBg}
                          fg={realFriend.avatarFg}
                          className="friend-picker-avatar"
                        />
                        <span className="friend-picker-name">{realFriend.displayName}</span>
                        <span className="friend-picker-count">@{realFriend.handle}</span>
                      </button>
                    )
                  })}
                  {realFriends.length === 0 && FRIENDS.map(demoFriend => (
                    <button
                      key={demoFriend.initials}
                      className={`friend-picker-item ${friend?.name === demoFriend.name ? 'is-active' : ''}`}
                      onClick={() => selectFriend(demoFriend, null)}
                      style={{ '--friend-color': demoFriend.color, '--friend-bg': demoFriend.bg } as React.CSSProperties}
                    >
                      <span className="friend-picker-avatar">{demoFriend.initials}</span>
                      <span className="friend-picker-name">{demoFriend.name}</span>
                      <span className="friend-picker-count">{demoFriend.count} destinations</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {friend && !compareDenied ? (
          <ComparisonBanner
            friend={friend}
            myProfile={myProfile}
            myDests={destinations}
            friendDests={friendDests}
            friendOnlyCount={friendOnlyCount}
            myProfileTitle={myProfileTitle}
            friendTitle={friendTitle}
            onClose={clearComparison}
          />
        ) : (
          <div className="tier-list-solo-summary">
            <div className="tier-list-solo-player">
              <Avatar
                avatarUrl={myProfile?.avatarUrl}
                initials={myInitials}
                bg={myProfile?.avatarBg ?? '#1B5FE8'}
                fg={myProfile?.avatarFg ?? '#ffffff'}
                className="tier-list-solo-avatar"
                ariaHidden={true}
              />
              <div className="tier-list-solo-identity">
                <span>{myProfile?.displayName?.split(' ')[0] ?? t('Me', 'Moi')}</span>
                {myProfileTitle && <span className="tier-list-solo-title">{myProfileTitle}</span>}
                <strong>{myAverage !== null ? myAverage.toFixed(1) : '—'}</strong>
              </div>
            </div>
            <div className="tier-list-solo-meta">
              <span>{myFavoriteCount} {t('favorites', 'favoris')}</span>
              <span>{tierSummaryCounts.length} tiers</span>
            </div>
            <div className="tier-list-hero-tier-chips" aria-label={t('Summary by tier', 'Résumé par tier')}>
              {tierSummaryCounts.map(({ tier, count }) => (
                <span key={tier} className={`tier-list-hero-tier-chip tier-list-hero-tier-chip--${tier.toLowerCase()}`}>
                  <b>{tier}</b>{count}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="tier-list-filter-row">
        <SegmentedControl
          className="tier-list-filters"
          ariaLabel={t('Filter tier list', 'Filtrer la tier list')}
          role="radiogroup"
          size="sm"
          layout="scrollable"
          tone="tinted"
          value={filter}
          options={visibleFilters.map(filterItem => ({
            value: filterItem,
            label: TIER_FILTER_LABEL[filterItem],
            accentColor: filterItem === 'favorites' ? '#E14F70' : '#1B5FE8',
          }))}
          onChange={setFilter}
        />
      </div>

      {compareDenied && (
        <section className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>{realFriendAccess.deniedReason === 'friends_only'
              ? 'This map is visible to friends only.'
              : 'This map is private.'}</h3>
            <p>The comparison cannot be shown while this map is not visible to you.</p>
            <button
              type="button"
              className="friends-action-btn friends-action-secondary"
              onClick={() => { setFriend(null); setFriendUserId(null) }}
            >
              Close comparison
            </button>
          </div>
        </section>
      )}

      {/* Solo mode or comparison denied */}
      {(!friend || compareDenied) && (
        <section className="tier-list-rows" aria-label={t('Rankings by tier', 'Classement par tier')}>
          {TIER_ORDER.map(tier => (
            <TierRow
              key={tier}
              tier={tier}
              myDests={myFiltered}
              friendDests={[]}
              friend={null}
              sharedNames={sharedNames}
              collapsed={collapsed[tier]}
              onToggle={() => toggleCollapse(tier)}
              onSelectMine={destination => setPreview({ destination, ownerLabel: t('Me', 'Moi'), ownerColor: '#1B5FE8' })}
            />
          ))}
        </section>
      )}

      {/* Compare mode — versus: my list with friend scores side by side */}
      {friend && !compareDenied && filter === 'versus' && (
        <section
          className="tier-list-rows tier-list-rows--compare"
          style={{ '--friend-bg': friend.bg, '--friend-color': friend.color } as React.CSSProperties}
          aria-label={`${t('My rankings', 'Mon classement')} ${t('with', 'avec')} ${friendFirstName}`}
        >
          {myTiers.length === 0 ? (
            <p className="tier-list-empty">{t('No destinations', 'Aucune destination')}</p>
          ) : myTiers.map(tier => (
            <TierRow
              key={`versus-${tier}`}
              tier={tier}
              myDests={myFiltered}
              friendDests={friendFiltered}
              friend={friend}
              sharedNames={sharedNames}
              collapsed={collapsed[tier]}
              isCompareMode={true}
              onToggle={() => toggleCollapse(tier)}
              onSelectMine={destination => setPreview({ destination, ownerLabel: t('Me', 'Moi'), ownerColor: '#1B5FE8' })}
            />
          ))}
        </section>
      )}

      {/* Compare mode — friend-only: friend's tier list in solo mode */}
      {friend && !compareDenied && filter === 'friend-only' && (
        <section
          className="tier-list-rows tier-list-rows--friend-only"
          aria-label={`Tier list de ${friendFirstName}`}
        >
          {friendTiers.length === 0 ? (
            <p className="tier-list-empty">{t('No destinations', 'Aucune destination')}</p>
          ) : friendTiers.map(tier => (
            <TierRow
              key={`friend-${tier}`}
              tier={tier}
              myDests={friendFiltered}
              friendDests={[]}
              friend={null}
              sharedNames={new Set()}
              collapsed={collapsed[tier]}
              onToggle={() => toggleCollapse(tier)}
              onSelectMine={destination => setPreview({ destination, ownerLabel: friendFirstName, ownerColor: friend.bg })}
            />
          ))}
        </section>
      )}

      {/* Compare mode — mine-only: my list in solo mode */}
      {friend && !compareDenied && filter === 'mine-only' && (
        <section
          className="tier-list-rows tier-list-rows--mine-only"
          aria-label={t('My rankings', 'Mon classement')}
        >
          {myTiers.length === 0 ? (
            <p className="tier-list-empty">{t('No destinations', 'Aucune destination')}</p>
          ) : myTiers.map(tier => (
            <TierRow
              key={`mine-${tier}`}
              tier={tier}
              myDests={myFiltered}
              friendDests={[]}
              friend={null}
              sharedNames={sharedNames}
              collapsed={collapsed[tier]}
              onToggle={() => toggleCollapse(tier)}
              onSelectMine={destination => setPreview({ destination, ownerLabel: t('Me', 'Moi'), ownerColor: '#1B5FE8' })}
            />
          ))}
        </section>
      )}

      {preview && (
        <DestinationPreview
          destination={preview.destination}
          ownerLabel={preview.ownerLabel}
          ownerColor={preview.ownerColor}
          onClose={() => setPreview(null)}
          onOpenMap={onSelect}
        />
      )}
    </main>
  )
}


function getPreviewStats(destination: Destination) {
  const stats: Array<{ icon: string; label: string; value: string }> = []
  if (destination.personalBudget) stats.push({ icon: '💸', label: 'Spent', value: `${Math.round(destination.personalBudget)} €` })
  if (destination.tripDays) stats.push({ icon: '⏱', label: 'Duration', value: `${destination.tripDays}d` })
  if (destination.tripYear) stats.push({ icon: '🗓', label: 'Year', value: String(destination.tripYear) })
  if (destination.companions) stats.push({ icon: COMPANION_EMOJI[destination.companions], label: 'With', value: COMPANION_LABEL[destination.companions] })
  stats.push({ icon: INTENT_EMOJI[destination.intent], label: 'Style', value: INTENT_LABEL[destination.intent] })
  stats.push({ icon: '⭐', label: 'Score', value: getDestinationScore(destination).toFixed(1) })
  if (destination.value !== undefined) stats.push({ icon: '💶', label: 'Value', value: `${destination.value.toFixed(1)}/5` })
  return stats
}
