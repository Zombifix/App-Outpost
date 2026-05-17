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

/**
 * Strip d'activité — remplace l'ancien ActivityFeed orphelin.
 * Affiche les 9 types d'events avec mise en forme spécifique par kind.
 * Variante "compact" : carrousel bas de map; "full" : liste pour la vue Amis.
 */
export default function ActivityStrip({ onFlyTo, onOpenProfile, onSeeAll, variant = 'compact' }: ActivityStripProps) {
  const { events, loading } = useActivityFeed(variant === 'full' ? 60 : 12)
  const [collapsed, setCollapsed] = useState(false)

  if (variant === 'compact' && collapsed) {
    return (
      <button className="activity-strip-toggle" onClick={() => setCollapsed(false)}>
        Activité ▴
      </button>
    )
  }

  if (variant === 'compact' && events.length === 0 && !loading) return null

  const grouped = useMemo(() => groupSameActorSameKindRecent(events), [events])

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
  primary: ActivityEvent & {
    actorHandle?: string; actorDisplayName?: string;
    actorAvatarBg?: string; actorAvatarFg?: string;
  }
  count: number
}

function groupSameActorSameKindRecent(events: GroupedActivity['primary'][]): GroupedActivity[] {
  // Si même acteur + même kind dans une fenêtre < 24h, on groupe.
  const out: GroupedActivity[] = []
  for (const ev of events) {
    const last = out[out.length - 1]
    if (
      last && last.primary.actor === ev.actor && last.primary.kind === ev.kind
      && Math.abs(new Date(last.primary.createdAt).getTime() - new Date(ev.createdAt).getTime()) < 24 * 3600 * 1000
    ) {
      last.count += 1
    } else {
      out.push({ key: ev.id, primary: ev, count: 1 })
    }
  }
  return out
}

function ActivityCard({ item, onFlyTo, onOpenProfile }: { item: GroupedActivity; onFlyTo?: ActivityStripProps['onFlyTo']; onOpenProfile?: ActivityStripProps['onOpenProfile'] }) {
  const ev = item.primary
  const lat = typeof ev.payload.lat === 'number' ? ev.payload.lat : undefined
  const lng = typeof ev.payload.lng === 'number' ? ev.payload.lng : undefined
  const name = typeof ev.payload.name === 'string' ? ev.payload.name : (typeof ev.payload.destination_name === 'string' ? ev.payload.destination_name : '')
  const tier = (typeof ev.payload.tier === 'string' ? ev.payload.tier : undefined) as Tier | undefined

  const onClick = () => {
    if (lat !== undefined && lng !== undefined && name) onFlyTo?.(lat, lng, name)
  }

  return (
    <button className="activity-card" onClick={onClick}>
      <div className="activity-card-head">
        <button
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
    </button>
  )
}

function ActivityRow({ item, onFlyTo, onOpenProfile }: { item: GroupedActivity; onFlyTo?: ActivityStripProps['onFlyTo']; onOpenProfile?: ActivityStripProps['onOpenProfile'] }) {
  const ev = item.primary
  const lat = typeof ev.payload.lat === 'number' ? ev.payload.lat : undefined
  const lng = typeof ev.payload.lng === 'number' ? ev.payload.lng : undefined
  const name = typeof ev.payload.name === 'string' ? ev.payload.name : (typeof ev.payload.destination_name === 'string' ? ev.payload.destination_name : '')
  const tier = (typeof ev.payload.tier === 'string' ? ev.payload.tier : undefined) as Tier | undefined

  return (
    <div className="activity-row">
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
          {tier && <span className="tier-badge-compact" style={{ marginLeft: 6, color: TIER_COLORS[tier].label, background: TIER_COLORS[tier].pin + '22' }}>{tier}</span>}
        </p>
        <small>{relativeTime(ev.createdAt)}</small>
      </div>
      {lat !== undefined && lng !== undefined && name && (
        <button className="friends-action-btn friends-action-secondary" onClick={() => onFlyTo?.(lat, lng, name)}>
          Voir sur la carte
        </button>
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
      return count > 1 ? `a ajouté ${count} destinations` : <>a ajouté <strong>{name}</strong></>
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
