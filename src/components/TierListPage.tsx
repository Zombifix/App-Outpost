import { useMemo, useRef, useState, useEffect } from 'react'
import type { Destination, Friend, Intent, Tier } from '../types'
import {
  FRIENDS,
  FRIEND_DESTINATIONS,
  TIER_COLORS,
  TIER_ORDER,
  COUNTRY_TO_CONTINENT,
} from '../data'

interface TierListPageProps {
  destinations: Destination[]
}

const INTENTS: Array<Intent | 'all'> = ['all', 'tourisme', 'sorties', 'gastro', 'nature', 'travail', 'city-trip']
const INTENT_LABEL: Record<Intent | 'all', string> = {
  all: 'Toutes',
  tourisme: 'Tourisme',
  sorties: 'Sorties',
  gastro: 'Gastronomie',
  nature: 'Nature',
  travail: 'Travail',
  'city-trip': 'City-trip',
}
const INTENT_EMOJI: Record<Intent | 'all', string> = {
  all: '',
  tourisme: '🗺',
  sorties: '🌙',
  gastro: '🍽',
  nature: '🌿',
  travail: '💼',
  'city-trip': '🏙',
}

const TIER_DESCRIPTIONS: Record<Tier, string> = {
  S: 'Des expériences inoubliables, qui restent dans la mémoire.',
  A: 'Des voyages marquants à plusieurs niveaux.',
  B: 'De très belles expériences avec quelques réserves.',
  C: 'De bonnes expériences, sans plus.',
  D: 'Potentiel à explorer ou intérêt limité.',
}

const TIER_LABEL: Record<Tier, string> = {
  S: 'Exceptionnel',
  A: 'Génial',
  B: 'Très bien',
  C: 'Correct',
  D: 'Découvrant',
}

function applyFilters(list: Destination[], intent: Intent | 'all'): Destination[] {
  return list.filter(d => {
    if (intent !== 'all' && d.intent !== intent) return false
    return true
  })
}

type SocialChipType = 'same' | 'diff' | 'unseen'
interface SocialChip { type: SocialChipType; label: string }

function getSocialChip(dest: Destination, friendDests: Destination[], friend: Friend | null): SocialChip | null {
  if (!friend) return null
  const match = friendDests.find(d => d.name.toLowerCase() === dest.name.toLowerCase())
  if (!match) return { type: 'unseen', label: 'Pas visité' }
  if (match.tier === dest.tier) return { type: 'same', label: 'Même tier' }
  return { type: 'diff', label: `${friend.name.split(' ')[0]}: ${match.tier}` }
}

function DestCard({ destination, friendDests, friend }: {
  destination: Destination
  friendDests: Destination[]
  friend: Friend | null
}) {
  const chip = getSocialChip(destination, friendDests, friend)
  const intentLabel = INTENT_LABEL[destination.intent]
  const intentEmoji = INTENT_EMOJI[destination.intent]

  return (
    <div
      className="dest-card"
      style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
    >
      <div className="dest-card-body">
        <span className="dest-card-name">{destination.name}</span>
        <div className="dest-card-chips">
          <span className="dest-chip dest-chip--intent">{intentEmoji} {intentLabel}</span>
          {chip && (
            <span className={`dest-chip dest-chip--${chip.type}`}>
              {chip.type === 'same' ? '👥' : chip.type === 'diff' ? '⭐' : '○'} {chip.label}
            </span>
          )}
        </div>
      </div>
    </div>
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
  const friendNames = useMemo(() => new Set(friendDests.map(d => d.name.toLowerCase())), [friendDests])

  const commonCount = myDests.filter(d => friendNames.has(d.name.toLowerCase())).length
  const gapCount = myDests.filter(d => {
    const match = friendDests.find(f => f.name.toLowerCase() === d.name.toLowerCase())
    return match && match.tier !== d.tier
  }).length
  const unseenCount = myDests.filter(d => !friendNames.has(d.name.toLowerCase())).length

  const sharedIntents = myDests
    .filter(d => friendNames.has(d.name.toLowerCase()))
    .map(d => d.intent)
  const intentCounts: Partial<Record<Intent, number>> = {}
  sharedIntents.forEach(i => { intentCounts[i] = (intentCounts[i] ?? 0) + 1 })
  const topIntent = (Object.entries(intentCounts) as [Intent, number][]).sort(([, a], [, b]) => b - a)[0]
  const alignPhrase = topIntent
    ? `Vous êtes très alignés sur les voyages ${INTENT_LABEL[topIntent[0]].toLowerCase()}.`
    : 'Vos goûts se rejoignent sur plusieurs destinations.'

  return (
    <div className="comparison-banner">
      <div
        className="comparison-banner-avatar"
        style={{ background: friend.bg, color: friend.color, borderColor: friend.color }}
      >
        {friend.initials}
      </div>
      <div className="comparison-banner-info">
        <strong>Comparaison avec {friend.name}</strong>
        <span>{alignPhrase}</span>
      </div>
      <div className="comparison-banner-stats">
        <div className="comparison-stat">
          <strong>{commonCount}</strong>
          <span>en commun</span>
        </div>
        <div className="comparison-stat">
          <strong>{gapCount}</strong>
          <span>gros écarts</span>
        </div>
        <div className="comparison-stat">
          <strong>{unseenCount}</strong>
          <span>pas vues par {friend.name.split(' ')[0]}</span>
        </div>
      </div>
      <button className="comparison-banner-close" onClick={onClose} aria-label="Fermer la comparaison">✕</button>
    </div>
  )
}

function TierRow({
  tier,
  destinations,
  friendDests,
  friend,
  collapsed,
  onToggle,
}: {
  tier: Tier
  destinations: Destination[]
  friendDests: Destination[]
  friend: Friend | null
  collapsed: boolean
  onToggle: () => void
}) {
  const colors = TIER_COLORS[tier]
  const dests = destinations.filter(d => d.tier === tier && d.kind !== 'stop')

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
          <span className="tier-row-count">{dests.length}</span>
          <svg
            className={`tier-row-chevron ${collapsed ? '' : 'is-open'}`}
            width="16" height="16" viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </header>
      {!collapsed && (
        <div className="tier-list-row-strip">
          {dests.map(d => (
            <DestCard key={d.name} destination={d} friendDests={friendDests} friend={friend} />
          ))}
          {dests.length === 0 && <span className="tier-list-empty">Aucune destination</span>}
        </div>
      )}
    </article>
  )
}

export default function TierListPage({ destinations }: TierListPageProps) {
  const [friend, setFriend] = useState<Friend | null>(null)
  const [intent, setIntent] = useState<Intent | 'all'>('all')
  const [collapsed, setCollapsed] = useState<Record<Tier, boolean>>({ S: false, A: false, B: true, C: true, D: true })
  const [comparePicker, setComparePicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

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

  const friendDests = friend ? (FRIEND_DESTINATIONS[friend.initials] ?? []) : []
  const myFiltered = useMemo(() => applyFilters(destinations, intent), [destinations, intent])
  const friendFiltered = useMemo(() => applyFilters(friendDests, intent), [friendDests, intent])

  const paysCount = useMemo(() => new Set(destinations.map(d => d.country)).size, [destinations])
  const continentsCount = useMemo(
    () => new Set(destinations.map(d => COUNTRY_TO_CONTINENT[d.country]).filter(Boolean)).size,
    [destinations]
  )
  const topTier = destinations.find(d => d.tier === 'S')

  function toggleCollapse(tier: Tier) {
    setCollapsed(prev => ({ ...prev, [tier]: !prev[tier] }))
  }

  return (
    <main className="tier-list-page" aria-label="Tier list">
      <header className="tier-list-head">
        <div className="tier-list-title">
          <h2>Ton classement voyage</h2>
          <p>{myFiltered.length} destinations classées par ressenti global</p>
        </div>

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
          {topTier && (
            <div className="tier-stat tier-stat--top">
              <span style={{ color: TIER_COLORS.S.pin }}>★</span>
              <span>Top : <strong>{topTier.name}</strong></span>
            </div>
          )}
        </div>

        <div className="tier-list-actions" ref={pickerRef}>
          <button
            className={`tier-list-compare-btn ${friend ? 'is-active' : ''}`}
            onClick={() => setComparePicker(v => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="10.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1 13c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4M10.5 9c2.485 0 4.5 1.79 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {friend ? `${friend.name.split(' ')[0]} ✕` : 'Comparer'}
          </button>

          {comparePicker && (
            <div className="friend-picker">
              {friend && (
                <button className="friend-picker-clear" onClick={() => { setFriend(null); setComparePicker(false) }}>
                  Désactiver la comparaison
                </button>
              )}
              {FRIENDS.map(f => (
                <button
                  key={f.initials}
                  className={`friend-picker-item ${friend?.initials === f.initials ? 'is-active' : ''}`}
                  onClick={() => { setFriend(f); setComparePicker(false) }}
                  style={{ '--friend-color': f.color, '--friend-bg': f.bg } as React.CSSProperties}
                >
                  <span className="friend-picker-avatar">{f.initials}</span>
                  <span className="friend-picker-name">{f.name}</span>
                  <span className="friend-picker-count">{f.count} dest.</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="tier-list-filters" role="group" aria-label="Filtrer par type">
        {INTENTS.map(i => (
          <button
            key={i}
            className={`tier-filter-pill ${intent === i ? 'is-active' : ''}`}
            onClick={() => setIntent(i)}
          >
            {i !== 'all' && <span aria-hidden="true">{INTENT_EMOJI[i]}</span>}
            {INTENT_LABEL[i]}
          </button>
        ))}
      </div>

      {friend && (
        <ComparisonBanner
          friend={friend}
          myDests={myFiltered}
          friendDests={friendFiltered}
          onClose={() => setFriend(null)}
        />
      )}

      <section className="tier-list-rows" aria-label="Classement par tier">
        {TIER_ORDER.map(tier => (
          <TierRow
            key={tier}
            tier={tier}
            destinations={myFiltered}
            friendDests={friendFiltered}
            friend={friend}
            collapsed={collapsed[tier]}
            onToggle={() => toggleCollapse(tier)}
          />
        ))}
      </section>
    </main>
  )
}
