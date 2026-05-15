import { useMemo, useState } from 'react'
import type { Destination, Friend, Intent, Tier } from '../types'
import {
  FRIENDS,
  FRIEND_DESTINATIONS,
  TIER_COLORS,
  TIER_ORDER,
  COUNTRY_TO_CONTINENT,
  CONTINENTS,
  type Continent,
} from '../data'
import WorldMap from './WorldMap'

interface TierListPageProps {
  destinations: Destination[]
}

const INTENTS: Array<Intent | 'all'> = ['all', 'tourisme', 'sorties', 'gastro', 'nature', 'travail', 'city-trip']
const INTENT_LABEL: Record<Intent | 'all', string> = {
  all: 'Tous',
  tourisme: 'Tourisme',
  sorties: 'Sorties',
  gastro: 'Gastronomie',
  nature: 'Nature',
  travail: 'Travail',
  'city-trip': 'City-trip',
}

const tierLabels: Record<Tier, string> = {
  S: 'Exceptionnel',
  A: 'Genial',
  B: 'Tres bien',
  C: 'Correct',
  D: 'Decouvrant',
}

function applyFilters(list: Destination[], intent: Intent | 'all', zone: Continent | 'all'): Destination[] {
  return list.filter(d => {
    if (intent !== 'all' && d.intent !== intent) return false
    if (zone !== 'all') {
      const c = COUNTRY_TO_CONTINENT[d.country]
      if (c !== zone) return false
    }
    return true
  })
}

function MiniCard({ destination, owner }: { destination: Destination; owner: 'me' | 'friend' }) {
  return (
    <div
      className={`tier-list-mini ${owner === 'friend' ? 'tier-list-mini--friend' : ''}`}
      style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
    >
      <span>{destination.name}</span>
      <small>* {(destination.score ?? 3).toFixed(1).replace('.', ',')}</small>
    </div>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const { pin, label } = TIER_COLORS[tier]
  return (
    <span className="tier-list-badge" style={{ color: label, background: pin + '18', borderColor: pin + '44' }}>
      {tier}
    </span>
  )
}

export default function TierListPage({ destinations }: TierListPageProps) {
  const [friend, setFriend] = useState<Friend | null>(null)
  const [intent, setIntent] = useState<Intent | 'all'>('all')
  const [zone, setZone] = useState<Continent | 'all'>('all')

  const friendDests = friend ? (FRIEND_DESTINATIONS[friend.initials] ?? []) : []

  const myFiltered = useMemo(() => applyFilters(destinations, intent, zone), [destinations, intent, zone])
  const friendFiltered = useMemo(() => applyFilters(friendDests, intent, zone), [friendDests, intent, zone])

  const sharedNames = useMemo(() => {
    if (!friend) return new Set<string>()
    const mineLc = new Set(myFiltered.map(d => d.name.toLowerCase()))
    return new Set(friendFiltered.filter(d => mineLc.has(d.name.toLowerCase())).map(d => d.name.toLowerCase()))
  }, [friend, myFiltered, friendFiltered])

  const commonList = useMemo(() => {
    if (!friend) return []
    return friendFiltered
      .filter(d => sharedNames.has(d.name.toLowerCase()))
      .map(d => ({
        theirs: d,
        mine: myFiltered.find(m => m.name.toLowerCase() === d.name.toLowerCase())!,
      }))
  }, [friend, friendFiltered, myFiltered, sharedNames])

  return (
    <main className="tier-list-page" aria-label="Tier list">
      <header className="tier-list-head">
        <div>
          <h2>Ma tier list</h2>
          <p>{myFiltered.length} destinations{friend ? ` · comparaison avec ${friend.name}` : ''}</p>
        </div>
        <div className="tier-list-friends">
          {FRIENDS.map(f => {
            const active = friend?.initials === f.initials
            return (
              <button
                key={f.initials}
                className={`tier-list-friend ${active ? 'is-active' : ''}`}
                onClick={() => setFriend(active ? null : f)}
                style={{ '--friend-color': f.color, '--friend-bg': f.bg } as React.CSSProperties}
                aria-pressed={active}
              >
                <span className="tier-list-friend-avatar">{f.initials}</span>
                <span>{f.name}</span>
                <small>{f.count}</small>
              </button>
            )
          })}
        </div>
      </header>

      <div className="tier-list-filters">
        <label>
          Intent
          <select value={intent} onChange={e => setIntent(e.target.value as Intent | 'all')}>
            {INTENTS.map(i => (
              <option key={i} value={i}>{INTENT_LABEL[i]}</option>
            ))}
          </select>
        </label>
        <label>
          Zone
          <select value={zone} onChange={e => setZone(e.target.value as Continent | 'all')}>
            <option value="all">Toutes</option>
            {CONTINENTS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <div className="tier-list-map">
        <WorldMap
          destinations={myFiltered}
          flyTarget={null}
          onSelect={() => { /* read-only here */ }}
          onFlyTargetConsumed={() => { /* noop */ }}
          friendDestinations={friend ? friendFiltered : undefined}
          friendInitials={friend?.initials}
          sharedNames={sharedNames}
        />
        {friend && (
          <div className="tier-list-legend">
            <span><i className="legend-me" /> Moi</span>
            <span><i className="legend-friend" /> {friend.name}</span>
            <span><i className="legend-shared">2</i> En commun</span>
          </div>
        )}
      </div>

      {friend && commonList.length > 0 && (
        <section className="tier-list-common">
          <div className="tier-list-common-head">
            En commun · {commonList.length}
          </div>
          <div className="tier-list-common-items">
            {commonList.map(({ mine, theirs }) => (
              <div className="tier-list-common-item" key={mine.name}>
                <span className="dest-name">{mine.name}</span>
                <span className="dest-country">{mine.country}</span>
                <TierBadge tier={mine.tier!} />
                <span className="vs">vs</span>
                <TierBadge tier={theirs.tier!} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`tier-list-rows ${friend ? 'compare' : ''}`} aria-label="Classement par tier">
        {TIER_ORDER.map(tier => {
          const colors = TIER_COLORS[tier]
          const mine = myFiltered.filter(d => d.tier === tier && d.kind !== 'stop')
          const theirs = friendFiltered.filter(d => d.tier === tier && d.kind !== 'stop')
          return (
            <article className={`tier-list-row tier-list-row-${tier.toLowerCase()}`} key={tier}>
              <header>
                <span className={`tier-orb tier-${tier.toLowerCase()}`}>{tier}</span>
                <strong style={{ color: colors.label }}>{tierLabels[tier]}</strong>
                <small>{friend ? `${mine.length} · ${theirs.length}` : mine.length}</small>
              </header>
              <div className="tier-list-row-body">
                <div className="tier-list-row-cell">
                  {friend && <p className="tier-list-row-label">Moi</p>}
                  <div className="tier-list-row-strip">
                    {mine.map(d => <MiniCard key={d.name} destination={d} owner="me" />)}
                    {mine.length === 0 && <span className="tier-list-empty">Aucune destination</span>}
                  </div>
                </div>
                {friend && (
                  <>
                    <div className="tier-list-row-divider" />
                    <div className="tier-list-row-cell">
                      <p className="tier-list-row-label">{friend.name}</p>
                      <div className="tier-list-row-strip">
                        {theirs.map(d => <MiniCard key={d.name} destination={d} owner="friend" />)}
                        {theirs.length === 0 && <span className="tier-list-empty">Aucune destination</span>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
