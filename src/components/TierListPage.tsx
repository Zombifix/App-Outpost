import { useEffect, useMemo, useRef, useState } from 'react'
import type { Destination, Friend, Intent, Tier } from '../types'
import {
  COUNTRY_TO_CONTINENT,
  FRIENDS,
  FRIEND_DESTINATIONS,
  TIER_COLORS,
  TIER_ORDER,
} from '../data'
import { useFriends } from '../hooks/useFriends'
import { useFriendDestinations } from '../hooks/useFriendDestinations'
import { destinationNameKey, destinationNameSet } from '../utils/destinationIdentity'
import { getDestinationScore, getDestinationTier } from '../utils'
import { SegmentedControl } from './SegmentedControl'

interface TierListPageProps {
  destinations: Destination[]
  onSelect: (name: string) => void
}

type TierListFilter = 'all' | 'recent' | 'favorites' | 'friends' | 'solo' | 'top' | 'shared' | 'disagreements'

const BASE_TIER_FILTERS: TierListFilter[] = ['all', 'recent', 'favorites', 'friends', 'solo']
const COMPARE_TIER_FILTERS: TierListFilter[] = ['all', 'shared', 'disagreements', 'favorites']

const TIER_FILTER_LABEL: Record<TierListFilter, string> = {
  all: 'Toutes',
  recent: 'Recents',
  favorites: 'Coups de coeur',
  friends: 'Entre amis',
  solo: 'Solo',
  top: 'Top S/A',
  shared: 'Vues tous les deux',
  disagreements: 'Avis opposes',
}

const TIER_FILTER_ICON: Record<TierListFilter, string> = {
  all: '✦',
  recent: '🕒',
  favorites: '❤️',
  friends: '👥',
  solo: '🧭',
  top: '🏆',
  shared: '🤝',
  disagreements: '⚡',
}

const INTENT_LABEL: Record<Intent, string> = {
  tourisme: 'Tourisme',
  sorties: 'Sorties',
  gastro: 'Gastronomie',
  nature: 'Nature',
  travail: 'Travail',
  'city-trip': 'City-trip',
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
  amis: 'Amis',
  famille: 'Famille',
  travail: 'Travail',
}

const COMPANION_EMOJI: Record<NonNullable<Destination['companions']>, string> = {
  solo: '🧭',
  couple: '💞',
  amis: '👥',
  famille: '🏡',
  travail: '💼',
}

const TIER_RANK: Record<Tier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }

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
  S: 'Des expériences rares, marquantes, qui restent en mémoire.',
  A: 'De très belles expériences, que j\'ai vraiment adorées.',
  B: 'Des expériences agréables, sans être particulièrement marquantes.',
  C: 'Des expériences mitigées, pas mauvaises, mais pas mémorables.',
  D: 'Des expériences décevantes, que je ne referais pas.',
}

const TIER_LABEL: Record<Tier, string> = {
  S: 'Exceptionnel',
  A: 'Génial',
  B: 'Correct',
  C: 'Bof',
  D: 'À éviter',
}

function filterDestinations(list: Destination[], filter: TierListFilter, compareList: Destination[] = []): Destination[] {
  const compareByName = new Map(compareList.map(destination => [destinationNameKey(destination), destination]))
  const currentYear = new Date().getFullYear()

  return list.filter(destination => {
    if (filter === 'recent') return Boolean(destination.tripYear && destination.tripYear >= currentYear - 2)
    if (filter === 'favorites') return Boolean(destination.coupDeCoeur)
    if (filter === 'friends') return destination.companions === 'amis'
    if (filter === 'solo') return destination.companions === 'solo'
    if (filter === 'top') {
      const tier = getDestinationTier(destination)
      return tier === 'S' || tier === 'A'
    }
    if (filter === 'shared') return compareByName.has(destinationNameKey(destination))
    if (filter === 'disagreements') {
      const theirs = compareByName.get(destinationNameKey(destination))
      return Boolean(theirs && getDestinationTier(theirs) !== getDestinationTier(destination))
    }
    return true
  }).sort((a, b) => {
    if (filter === 'recent') return (b.tripYear ?? 0) - (a.tripYear ?? 0)
    if (filter === 'favorites') return Number(Boolean(b.coupDeCoeur)) - Number(Boolean(a.coupDeCoeur))
    if (filter === 'top') return getDestinationScore(b) - getDestinationScore(a)
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

function DestCard({
  destination,
  sharedNames,
  onSelect,
}: {
  destination: Destination
  sharedNames?: Set<string>
  onSelect?: (destination: Destination) => void
}) {
  const isShared = sharedNames?.has(destinationNameKey(destination))
  const isCoupDeCoeur = Boolean(destination.coupDeCoeur)
  const intentLabel = INTENT_LABEL[destination.intent]
  const intentEmoji = INTENT_EMOJI[destination.intent]

  return (
    <article
      className={`dest-card ${isCoupDeCoeur ? 'is-coup-de-coeur' : ''}`}
      style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
    >
      {isShared && <span className="dest-card-shared-badge">En commun</span>}
      <button
        type="button"
        className="dest-card-main"
        onClick={() => onSelect?.(destination)}
        aria-label={`Voir ${destination.name}`}
      >
        <div className="dest-card-body">
          <span className="dest-card-name">{destination.name}</span>
          <span className="dest-card-country">{destination.country}</span>
          <div className="dest-card-chips">
            <span className="dest-chip dest-chip--intent">{intentEmoji} {intentLabel}</span>
            {isCoupDeCoeur && <span className="dest-chip dest-chip--favorite">❤️ Coup de coeur</span>}
          </div>
        </div>
      </button>
    </article>
  )
}

function ComparisonBanner({
  friend,
  myDests,
  friendDests,
  onClose,
}: {
  friend: Friend
  myDests: Destination[]
  friendDests: Destination[]
  onClose: () => void
}) {
  const commonItems = myDests
    .map(my => {
      const theirs = friendDests.find(friendDestination => destinationNameKey(friendDestination) === destinationNameKey(my))
      return theirs ? { my, theirs } : null
    })
    .filter((item): item is { my: Destination; theirs: Destination } => item !== null)

  const commonCount = commonItems.length
  const sameCount = commonItems.filter(item => getDestinationTier(item.my) === getDestinationTier(item.theirs)).length
  const gapItems = commonItems.filter(item => getDestinationTier(item.my) !== getDestinationTier(item.theirs))
  const gapCount = gapItems.length
  const alignmentScore = commonCount ? Math.round((sameCount / commonCount) * 100) : 0
  const widestGap = gapItems
    .slice()
    .sort((a, b) => Math.abs(TIER_RANK[getDestinationTier(b.my)] - TIER_RANK[getDestinationTier(b.theirs)]) - Math.abs(TIER_RANK[getDestinationTier(a.my)] - TIER_RANK[getDestinationTier(a.theirs)]))[0]
  const friendFirstName = friend.name.split(' ')[0]
  const myBudget = getAverage(myDests.map(destination => destination.personalBudget))
  const friendBudget = getAverage(friendDests.map(destination => destination.personalBudget))
  const myDays = getAverage(myDests.map(destination => destination.tripDays))
  const friendDays = getAverage(friendDests.map(destination => destination.tripDays))
  const myIntent = getDominantIntent(myDests)
  const friendIntent = getDominantIntent(friendDests)
  const budgetLead = myBudget !== null && friendBudget !== null
    ? myBudget < friendBudget
      ? 'tu voyages plus leger'
      : myBudget > friendBudget
        ? `${friendFirstName} voyage plus leger`
        : 'budget similaire'
    : 'budget a completer'
  const verdict = alignmentScore >= 70
    ? 'Profils proches'
    : gapCount > sameCount
      ? 'Vrais partis pris'
      : 'Compatibles'

  return (
    <div className="comparison-banner">
      <div
        className="comparison-banner-avatar"
        style={{ background: friend.bg, color: friend.color, borderColor: friend.color }}
      >
        {friend.initials}
      </div>
      <div className="comparison-banner-info">
        <strong>Comparatif avec {friend.name}</strong>
        <span className="comparison-smart-summary">✨ {verdict} · {budgetLead}</span>
      </div>
      <div className="comparison-insights" aria-label="Comparatif de style">
        <ComparisonInsight icon="💸" label="Depenses" value={`${formatEuroAverage(myBudget).replace(' €', '')} / ${formatEuroAverage(friendBudget)}`} />
        <ComparisonInsight icon="⏱" label="Sejours" value={`${formatDayAverage(myDays)} vs ${formatDayAverage(friendDays)}`} />
        <ComparisonInsight icon="🧭" label="Styles" value={`${myIntent} vs ${friendIntent}`} />
        <ComparisonInsight icon="🤝" label="Accord" value={`${alignmentScore}% · ${commonCount} communs`} />
        {widestGap && (
          <ComparisonInsight icon="⚡" label="Ecart" value={`${widestGap.my.name} · ${getDestinationTier(widestGap.my)}/${getDestinationTier(widestGap.theirs)}`} />
        )}
      </div>
      <button className="comparison-banner-close" onClick={onClose} aria-label="Fermer la comparaison">×</button>
    </div>
  )
}

function ComparisonInsight({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="comparison-insight">
      <span className="comparison-insight-label"><span aria-hidden="true">{icon}</span>{label}</span>
      <strong>{value}</strong>
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
        <button className="tier-destination-preview-close" onClick={onClose} aria-label="Fermer l'apercu">×</button>
        <div className="tier-preview-heading">
          <span className={`tier-orb tier-${tier.toLowerCase()}`}>{tier}</span>
          {destination.coupDeCoeur && <span className="tier-preview-favorite">♥ Coup de coeur</span>}
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
            <span>✨ Marquant</span>
            <strong>{destination.standout}</strong>
          </div>
        )}
        <button className="tier-preview-map-button" onClick={() => onOpenMap(destination.name)}>
          Voir sur la carte
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
  onToggle,
  onSelectMine,
  onSelectFriend,
}: {
  tier: Tier
  myDests: Destination[]
  friendDests: Destination[]
  friend: Friend | null
  sharedNames: Set<string>
  collapsed: boolean
  onToggle: () => void
  onSelectMine: (destination: Destination) => void
  onSelectFriend: (destination: Destination) => void
}) {
  const colors = TIER_COLORS[tier]
  const mine = myDests.filter(destination => getDestinationTier(destination) === tier && destination.kind !== 'stop')
  const theirs = friendDests.filter(destination => getDestinationTier(destination) === tier && destination.kind !== 'stop')

  const count = friend
    ? `${mine.length} · ${theirs.length}`
    : String(mine.length)

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
        <div className={`tier-row-body ${friend ? 'compare' : ''}`}>
          <div className="tier-row-col tier-row-col-me">
            {friend && (
              <p className="tier-row-col-label tier-row-col-label-me">
                <span className="tier-row-owner-avatar">Moi</span>
                <strong>Mon classement</strong>
              </p>
            )}
            <div className="tier-list-row-strip">
              {mine.map(destination => (
                <DestCard
                  key={destination.name}
                  destination={destination}
                  sharedNames={friend ? sharedNames : undefined}
                  onSelect={onSelectMine}
                />
              ))}
              {mine.length === 0 && <span className="tier-list-empty">Aucune destination</span>}
            </div>
          </div>

          {friend && (
            <>
              <div className="tier-row-divider" />
              <div className="tier-row-col tier-row-col-friend">
                <p className="tier-row-col-label tier-row-col-label-friend" style={{ '--friend-color': friend.color, '--friend-bg': friend.bg } as React.CSSProperties}>
                  <span className="tier-row-owner-avatar">{friend.initials}</span>
                  <strong>{friend.name.split(' ')[0]}</strong>
                </p>
                <div className="tier-list-row-strip">
                  {theirs.map(destination => (
                    <DestCard
                      key={destination.name}
                      destination={destination}
                      sharedNames={sharedNames}
                      onSelect={onSelectFriend}
                    />
                  ))}
                  {theirs.length === 0 && <span className="tier-list-empty">Aucune destination</span>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  )
}

export default function TierListPage({
  destinations,
  onSelect,
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
      ? realFriendDests
      : DEMO_FRIEND_DESTINATIONS[friend.initials] ?? FRIEND_DESTINATIONS[friend.initials] ?? []
    : []
  const compareDenied = Boolean(friend && friendUserId && !realFriendAccess.allowed && realFriendAccess.deniedReason)
  const visibleFilters = friend ? COMPARE_TIER_FILTERS : BASE_TIER_FILTERS
  const myFiltered = useMemo(() => filterDestinations(destinations, filter, friendDests), [destinations, filter, friendDests])
  const friendFiltered = useMemo(() => filterDestinations(friendDests, filter, destinations), [friendDests, filter, destinations])

  useEffect(() => {
    if (!visibleFilters.includes(filter)) setFilter('all')
  }, [filter, visibleFilters])

  const sharedNames = useMemo(() => {
    if (!friend) return new Set<string>()
    const myNames = destinationNameSet(myFiltered)
    return new Set(friendFiltered.filter(destination => myNames.has(destinationNameKey(destination))).map(destinationNameKey))
  }, [friend, myFiltered, friendFiltered])

  const paysCount = useMemo(() => new Set(destinations.map(destination => destination.country)).size, [destinations])
  const continentsCount = useMemo(
    () => new Set(destinations.map(destination => COUNTRY_TO_CONTINENT[destination.country]).filter(Boolean)).size,
    [destinations]
  )
  const topTiers = destinations.filter(destination => getDestinationTier(destination) === 'S')

  function toggleCollapse(tier: Tier) {
    setCollapsed(prev => ({ ...prev, [tier]: !prev[tier] }))
  }

  return (
    <main className="tier-list-page" aria-label="Tier list">
      <header className="tier-list-head">
        <div className="tier-list-stats">
          <div className="tier-stat">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5C4.96 1.5 2.5 3.96 2.5 7c0 4.5 5.5 7.5 5.5 7.5s5.5-3 5.5-7.5c0-3.04-2.46-5.5-5.5-5.5zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor" opacity=".6" />
            </svg>
            <strong>{destinations.length}</strong>
            <span>destinations</span>
          </div>
          <div className="tier-stat">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" opacity=".6" />
              <path d="M2.5 8h11M8 2.5c-1.5 2-2.5 3.5-2.5 5.5s1 3.5 2.5 5.5M8 2.5c1.5 2 2.5 3.5 2.5 5.5s-1 3.5-2.5 5.5" stroke="currentColor" strokeWidth="1.3" opacity=".6" />
            </svg>
            <strong>{paysCount}</strong>
            <span>pays</span>
          </div>
          <div className="tier-stat">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 11l2.5-7 3 4 2-3 3 6H2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity=".6" />
            </svg>
            <strong>{continentsCount}</strong>
            <span>continents</span>
          </div>
          {topTiers.length > 0 && (
            <div className="tier-stat tier-stat--top">
              <span style={{ color: TIER_COLORS.S.pin }}>★</span>
              <span>Top : <strong>{topTiers.map(d => d.name).join(', ')}</strong></span>
            </div>
          )}
        </div>
      </header>

      <div className="tier-list-filter-row">
        <SegmentedControl
          className="tier-list-filters"
          ariaLabel="Filtrer la tier list"
          role="radiogroup"
          size="sm"
          layout="scrollable"
          tone="tinted"
          value={filter}
          options={visibleFilters.map(filterItem => ({
            value: filterItem,
            label: TIER_FILTER_LABEL[filterItem],
            icon: <span>{TIER_FILTER_ICON[filterItem]}</span>,
            accentColor: filterItem === 'favorites' ? '#E14F70' : filterItem === 'disagreements' ? '#F28C28' : '#1B5FE8',
          }))}
          onChange={setFilter}
        />

        <div className="tier-list-actions" ref={pickerRef}>
          <button
            className={`tier-list-compare-btn ${friend ? 'is-active' : ''}`}
            onClick={() => setComparePicker(value => !value)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="10.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1 13c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4M10.5 9c2.485 0 4.5 1.79 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {friend ? `${friend.name.split(' ')[0]} ×` : 'Comparer'}
          </button>

          {comparePicker && (
            <div className="friend-picker">
              {friend && (
                <button className="friend-picker-clear" onClick={() => { setFriend(null); setFriendUserId(null); setComparePicker(false) }}>
                  Desactiver la comparaison
                </button>
              )}
              {realFriends.length === 0 && (
                <p className="friends-muted" style={{ padding: '8px 12px' }}>
                  Amis demo locaux pour tester la comparaison.
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
                }
                return (
                  <button
                    key={realFriend.otherUser}
                    className={`friend-picker-item ${friendUserId === realFriend.otherUser ? 'is-active' : ''}`}
                    onClick={() => { setFriend(friendShape); setFriendUserId(realFriend.otherUser); setComparePicker(false) }}
                    style={{ '--friend-color': realFriend.avatarFg, '--friend-bg': realFriend.avatarBg } as React.CSSProperties}
                  >
                    <span className="friend-picker-avatar">{initials}</span>
                    <span className="friend-picker-name">{realFriend.displayName}</span>
                    <span className="friend-picker-count">@{realFriend.handle}</span>
                  </button>
                )
              })}
              {realFriends.length === 0 && FRIENDS.map(demoFriend => (
                <button
                  key={demoFriend.initials}
                  className={`friend-picker-item ${friend?.name === demoFriend.name ? 'is-active' : ''}`}
                  onClick={() => { setFriend(demoFriend); setFriendUserId(null); setComparePicker(false) }}
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

      {friend && (
        <ComparisonBanner
          friend={friend}
          myDests={destinations}
          friendDests={friendDests}
          onClose={() => { setFriend(null); setFriendUserId(null) }}
        />
      )}

      {compareDenied && (
        <section className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>{realFriendAccess.deniedReason === 'friends_only'
              ? 'Cette carte est visible uniquement par ses amis.'
              : 'Cette carte est privée.'}</h3>
            <p>La comparaison ne peut pas s'afficher tant que cette carte n'est pas visible pour toi.</p>
            <button
              type="button"
              className="friends-action-btn friends-action-secondary"
              onClick={() => { setFriend(null); setFriendUserId(null) }}
            >
              Fermer la comparaison
            </button>
          </div>
        </section>
      )}

      <section className="tier-list-rows" aria-label="Classement par tier">
        {TIER_ORDER.map(tier => (
          <TierRow
            key={tier}
            tier={tier}
            myDests={myFiltered}
            friendDests={compareDenied ? [] : friendFiltered}
            friend={compareDenied ? null : friend}
            sharedNames={sharedNames}
            collapsed={collapsed[tier]}
            onToggle={() => toggleCollapse(tier)}
            onSelectMine={destination => setPreview({ destination, ownerLabel: 'Moi', ownerColor: '#1B5FE8' })}
            onSelectFriend={destination => setPreview({ destination, ownerLabel: friend?.name.split(' ')[0] ?? 'Ami', ownerColor: friend?.color })}
          />
        ))}
      </section>
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

function getAverage(values: Array<number | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function formatEuroAverage(value: number | null) {
  if (value === null) return 'n/r'
  return `${Math.round(value)} €`
}

function formatDayAverage(value: number | null) {
  if (value === null) return 'n/r'
  const rounded = Math.round(value * 10) / 10
  return `${String(rounded).replace('.', ',')} j`
}

function getDominantIntent(destinations: Destination[]) {
  const counts = new Map<Intent, number>()
  for (const destination of destinations) {
    counts.set(destination.intent, (counts.get(destination.intent) ?? 0) + 1)
  }
  const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
  return dominant ? INTENT_LABEL[dominant] : 'n/r'
}

function getPreviewStats(destination: Destination) {
  const stats: Array<{ icon: string; label: string; value: string }> = []
  if (destination.personalBudget) stats.push({ icon: '💸', label: 'Depense', value: `${Math.round(destination.personalBudget)} €` })
  if (destination.tripDays) stats.push({ icon: '⏱', label: 'Duree', value: `${destination.tripDays} j` })
  if (destination.tripYear) stats.push({ icon: '🗓', label: 'Voyage', value: String(destination.tripYear) })
  if (destination.companions) stats.push({ icon: COMPANION_EMOJI[destination.companions], label: 'Avec', value: COMPANION_LABEL[destination.companions] })
  stats.push({ icon: INTENT_EMOJI[destination.intent], label: 'Style', value: INTENT_LABEL[destination.intent] })
  stats.push({ icon: '⭐', label: 'Score', value: getDestinationScore(destination).toFixed(1).replace('.', ',') })
  if (destination.value !== undefined) stats.push({ icon: '💶', label: 'Valeur', value: `${destination.value.toFixed(1).replace('.', ',')}/5` })
  return stats
}

