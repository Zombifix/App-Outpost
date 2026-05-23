import { useMemo, useState } from 'react'
import type { ActivityEvent, ActivityKind, Tier } from '../../types'
import { TIER_COLORS } from '../../data'
import { useActivityFeed } from '../../hooks/useActivityFeed'

interface ActivityStripProps {
  onFlyTo?: (lat: number, lng: number, name: string) => void
  onOpenProfile?: (userId: string) => void
  onSeeAll?: () => void
  /** "compact" = strip flottant sur la map; "full" = grande liste pour FriendsView */
  variant?: 'compact' | 'full'
}

type EnrichedEvent = ActivityEvent & {
  actorHandle?: string; actorDisplayName?: string;
  actorAvatarBg?: string; actorAvatarFg?: string;
}

/**
 * Strip d'activité — remplace l'ancien ActivityFeed orphelin.
 * Affiche les 9 types d'events avec mise en forme spécifique par kind.
 * Variante "compact" : carrousel bas de map; "full" : liste pour la vue Amis.
 */
export default function ActivityStrip({ onFlyTo, onOpenProfile, onSeeAll, variant = 'compact' }: ActivityStripProps) {
  const { events, loading } = useActivityFeed(variant === 'full' ? 60 : 12)
  const [collapsed, setCollapsed] = useState(false)
  const filteredEvents = useMemo(
    () => events.filter(e => e.kind !== 'friendship_accepted'),
    [events]
  )
  const grouped = useMemo(() => groupSameActorSameKindRecent(filteredEvents), [filteredEvents])

  if (variant === 'compact' && collapsed) {
    return (
      <button className="activity-strip-toggle" onClick={() => setCollapsed(false)}>
        Activité ▴
      </button>
    )
  }

  if (variant === 'compact' && events.length === 0 && !loading) return null

  if (variant === 'full') {
    return (
      <div className="activity-feed-full">
        {loading && <p className="friends-muted">Chargement…</p>}
        {!loading && events.length === 0 && (
          <p className="friends-muted">Aucune activité pour l'instant. Ajoute des amis pour voir leurs voyages ici.</p>
        )}
        {grouped.map(item => (
          <ActivityRow key={item.key} item={item} onFlyTo={onFlyTo} onOpenProfile={onOpenProfile} />
        ))}
      </div>
    )
  }

  return (
    <div className="activity-strip" aria-label="Activité récente">
      <button className="activity-strip-collapse" onClick={() => setCollapsed(true)} aria-label="Réduire">▾</button>
      <div className="activity-strip-scroll">
        {grouped.slice(0, 8).map(item => (
          <ActivityCard key={item.key} item={item} onFlyTo={onFlyTo} onOpenProfile={onOpenProfile} />
        ))}
        {onSeeAll && (
          <button className="activity-strip-see-all" onClick={onSeeAll}>
            Voir tout →
          </button>
        )}
      </div>
    </div>
  )
}

interface GroupedActivity {
  key: string
  primary: EnrichedEvent
  items: EnrichedEvent[]
  count: number
}

function groupSameActorSameKindRecent(events: EnrichedEvent[]): GroupedActivity[] {
  const out: GroupedActivity[] = []
  for (const ev of events) {
    const last = out[out.length - 1]
    if (
      last && last.primary.actor === ev.actor && last.primary.kind === ev.kind
      && Math.abs(new Date(last.primary.createdAt).getTime() - new Date(ev.createdAt).getTime()) < 24 * 3600 * 1000
    ) {
      last.count += 1
      last.items.push(ev)
    } else {
      out.push({ key: ev.id, primary: ev, items: [ev], count: 1 })
    }
  }
  return out
}

function extractDestination(ev: EnrichedEvent) {
  const lat = typeof ev.payload.lat === 'number' ? ev.payload.lat : undefined
  const lng = typeof ev.payload.lng === 'number' ? ev.payload.lng : undefined
  const name = typeof ev.payload.name === 'string'
    ? ev.payload.name
    : (typeof ev.payload.destination_name === 'string' ? ev.payload.destination_name : '')
  const tier = (typeof ev.payload.tier === 'string' ? ev.payload.tier : undefined) as Tier | undefined
  const image = typeof ev.payload.image === 'string' ? ev.payload.image : undefined
  return { lat, lng, name, tier, image }
}

function ActivityCard({ item, onFlyTo, onOpenProfile }: { item: GroupedActivity; onFlyTo?: ActivityStripProps['onFlyTo']; onOpenProfile?: ActivityStripProps['onOpenProfile'] }) {
  const ev = item.primary
  const { lat, lng, name, tier } = extractDestination(ev)

  const onClick = () => {
    if (lat !== undefined && lng !== undefined && name) onFlyTo?.(lat, lng, name)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div className="activity-card" role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKeyDown}>
      <div className="activity-card-head">
        <button
          type="button"
          className="friends-avatar activity-card-avatar"
          onClick={e => { e.stopPropagation(); if (ev.actor) onOpenProfile?.(ev.actor) }}
          style={{ background: ev.actorAvatarBg ?? '#ccc', color: ev.actorAvatarFg ?? '#fff' }}
          aria-label={`Profil de ${ev.actorDisplayName ?? ev.actorHandle ?? 'inconnu'}`}
        >
          {(ev.actorDisplayName ?? ev.actorHandle ?? '?').slice(0, 1).toUpperCase()}
        </button>
        <span className="activity-card-actor">{ev.actorDisplayName ?? ev.actorHandle ?? 'Anonyme'}</span>
        <span className="activity-card-time">{relativeTime(ev.createdAt)}</span>
      </div>
      <div className="activity-card-body">
        {renderActivityLabel(ev.kind, ev.payload, item.count)}
        {tier && <span className="tier-badge-compact" style={{ color: TIER_COLORS[tier].label, background: TIER_COLORS[tier].pin + '22' }}>{tier}</span>}
      </div>
    </div>
  )
}

function ActivityRow({ item, onFlyTo, onOpenProfile }: { item: GroupedActivity; onFlyTo?: ActivityStripProps['onFlyTo']; onOpenProfile?: ActivityStripProps['onOpenProfile'] }) {
  const ev = item.primary
  const { lat, lng, name, tier } = extractDestination(ev)
  const [expanded, setExpanded] = useState(false)

  const expandable = item.count > 1
  const subItems = expandable
    ? item.items
        .map(child => ({ child, dest: extractDestination(child) }))
        .filter(x => x.dest.name)
    : []
  const canExpand = subItems.length > 0

  return (
    <div className={`activity-row${expanded ? ' is-expanded' : ''}`}>
      <div className="activity-row-main">
        <button
          className="friends-avatar activity-row-avatar"
          onClick={() => onOpenProfile?.(ev.actor)}
          style={{ background: ev.actorAvatarBg ?? '#ccc', color: ev.actorAvatarFg ?? '#fff' }}
        >
          {(ev.actorDisplayName ?? ev.actorHandle ?? '?').slice(0, 1).toUpperCase()}
        </button>
        <div className="activity-row-body">
          <p>
            <strong>{ev.actorDisplayName ?? ev.actorHandle ?? 'Anonyme'}</strong>{' '}
            {renderActivityLabel(ev.kind, ev.payload, item.count)}
            {tier && !expandable && <span className="tier-badge-compact" style={{ marginLeft: 6, color: TIER_COLORS[tier].label, background: TIER_COLORS[tier].pin + '22' }}>{tier}</span>}
          </p>
          <small>{relativeTime(ev.createdAt)}</small>
        </div>
        {canExpand ? (
          <button
            className="activity-row-expand"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Réduire' : 'Voir le détail'}
          >
            <span className="activity-row-expand-label">{expanded ? 'Réduire' : 'Détail'}</span>
            <span className={`activity-row-chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">▾</span>
          </button>
        ) : (
          lat !== undefined && lng !== undefined && name && (
            <button className="friends-action-btn friends-action-secondary" onClick={() => onFlyTo?.(lat, lng, name)}>
              Voir sur la carte
            </button>
          )
        )}
      </div>
      {expanded && canExpand && (
        <ul className="activity-sub-list">
          {subItems.map(({ child, dest }) => (
            <li key={child.id} className="activity-sub-row">
              <span
                className="activity-sub-thumb"
                style={dest.image
                  ? { backgroundImage: `url(${dest.image})` }
                  : dest.tier
                    ? { background: TIER_COLORS[dest.tier].pin, color: TIER_COLORS[dest.tier].label }
                    : { background: '#e5e7eb', color: '#6b7280' }}
                aria-hidden="true"
              >
                {!dest.image && (dest.name?.slice(0, 1).toUpperCase() ?? '?')}
              </span>
              <span className="activity-sub-name">{dest.name}</span>
              {dest.tier && (
                <span
                  className="tier-badge-compact activity-sub-badge"
                  style={{ color: TIER_COLORS[dest.tier].label, background: TIER_COLORS[dest.tier].pin + '22' }}
                >
                  {dest.tier}
                </span>
              )}
              {dest.lat !== undefined && dest.lng !== undefined && (
                <button
                  className="friends-action-btn friends-action-secondary activity-sub-cta"
                  onClick={() => onFlyTo?.(dest.lat!, dest.lng!, dest.name)}
                >
                  Voir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function renderActivityLabel(kind: ActivityKind, payload: Record<string, unknown>, count: number) {
  const name = (typeof payload.name === 'string' ? payload.name : '') || (typeof payload.destination_name === 'string' ? payload.destination_name : '')
  const fromTier = typeof payload.from === 'string' ? payload.from : null
  const toTier = typeof payload.to === 'string' ? payload.to : null
  switch (kind) {
    case 'destination_added':
      return count > 1 ? <>a ajouté <strong>{count} destinations</strong></> : <>a ajouté <strong>{name}</strong></>
    case 'tier_changed':
      return <>a déplacé <strong>{name}</strong>{fromTier && toTier ? ` de ${fromTier} en ${toTier}` : ''}</>
    case 'coup_de_coeur_set':
      return <>a marqué <strong>{name}</strong> comme coup de cœur</>
    case 'roadtrip_created':
      return <>a créé un nouveau roadtrip <strong>{name}</strong></>
    case 'roadtrip_stop_added':
      return <>a ajouté une étape à <strong>{name}</strong></>
    case 'friendship_accepted':
      return 'a un nouvel ami'
    case 'reaction_received':
      return <>a reçu une réaction sur <strong>{name}</strong></>
    case 'mutual_destination':
      return <>partage <strong>{name}</strong> avec toi</>
    case 'milestone':
      return <>a atteint un cap : <strong>{name}</strong></>
    default:
      return kind
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `il y a ${hr} h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `il y a ${day} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}
