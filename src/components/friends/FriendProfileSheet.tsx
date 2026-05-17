import { useMemo, useState } from 'react'
import type { Destination, Friendship } from '../../types'
import { useFriends } from '../../hooks/useFriends'
import { useFriendDestinations } from '../../hooks/useFriendDestinations'
import FriendCompareView from './FriendCompareView'

type Tab = 'overview' | 'tierlist' | 'map' | 'trips'

interface FriendProfileSheetProps {
  friendUserId: string
  myDestinations: Destination[]
  onClose: () => void
  onFlyTo?: (lat: number, lng: number, name: string) => void
  onToggleMapOverlay?: (friendUserId: string, enabled: boolean) => void
}

/**
 * Sheet plein écran du profil d'un ami — clic sur un ami n'importe où dans l'app
 * mène ici. 4 onglets : Aperçu | Tier list | Carte | Roadtrips.
 *
 * Source unique de vérité pour "voir un ami". Remplace les anciens flows éparpillés.
 */
export default function FriendProfileSheet({
  friendUserId,
  myDestinations,
  onClose,
  onFlyTo,
  onToggleMapOverlay,
}: FriendProfileSheetProps) {
  const { accepted, removeFriendship } = useFriends()
  const friend = accepted.find(f => f.otherUser === friendUserId) ?? null
  const { destinations: theirDestinations, loading } = useFriendDestinations(friendUserId)
  const [tab, setTab] = useState<Tab>('overview')

  const commonCount = useMemo(() => {
    if (!theirDestinations.length) return 0
    const mine = new Set(myDestinations.map(d => d.name.toLowerCase()))
    return theirDestinations.filter(d => mine.has(d.name.toLowerCase())).length
  }, [myDestinations, theirDestinations])

  if (!friend) {
    return (
      <div className="account-overlay" onClick={onClose}>
        <aside className="friend-profile-sheet" onClick={e => e.stopPropagation()}>
          <button className="floating-close" onClick={onClose}>×</button>
          <p>Ami introuvable.</p>
        </aside>
      </div>
    )
  }

  return (
    <div className="account-overlay" onClick={onClose} role="dialog" aria-label={`Profil de ${friend.displayName}`}>
      <aside className="friend-profile-sheet" onClick={e => e.stopPropagation()}>
        <button className="floating-close" aria-label="Fermer" onClick={onClose}>×</button>

        <header className="friend-profile-header">
          <span className="friends-avatar friend-profile-avatar" style={{ background: friend.avatarBg, color: friend.avatarFg }}>
            {friend.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h2>{friend.displayName}</h2>
            <p>@{friend.handle} · {theirDestinations.length} destination{theirDestinations.length > 1 ? 's' : ''} · {commonCount} en commun</p>
          </div>
        </header>

        <nav className="friends-tabs friend-profile-tabs" role="tablist">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Aperçu</TabBtn>
          <TabBtn active={tab === 'tierlist'} onClick={() => setTab('tierlist')}>Tier list</TabBtn>
          <TabBtn active={tab === 'map'} onClick={() => setTab('map')}>Carte</TabBtn>
          <TabBtn active={tab === 'trips'} onClick={() => setTab('trips')}>Roadtrips</TabBtn>
        </nav>

        <div className="friend-profile-body">
          {loading && <p className="friends-muted">Chargement…</p>}

          {tab === 'overview' && !loading && (
            <Overview friend={friend} theirDestinations={theirDestinations} commonCount={commonCount}
              onCompare={() => setTab('tierlist')}
              onSeeMap={() => setTab('map')}
              onRemove={async () => {
                if (window.confirm(`Retirer ${friend.displayName} de tes amis ?`)) {
                  await removeFriendship(friend.otherUser)
                  onClose()
                }
              }}
            />
          )}

          {tab === 'tierlist' && (
            <FriendCompareView friend={friend} myDestinations={myDestinations} theirDestinations={theirDestinations} />
          )}

          {tab === 'map' && (
            <MapTab
              friend={friend}
              theirDestinations={theirDestinations}
              onFlyTo={onFlyTo}
              onToggleOverlay={onToggleMapOverlay}
              onClose={onClose}
            />
          )}

          {tab === 'trips' && (
            <TripsTab destinations={theirDestinations} onFlyTo={onFlyTo} onClose={onClose} />
          )}
        </div>
      </aside>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} className={`friends-tab${active ? ' is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function Overview({
  friend,
  theirDestinations,
  commonCount,
  onCompare,
  onSeeMap,
  onRemove,
}: {
  friend: Friendship
  theirDestinations: Destination[]
  commonCount: number
  onCompare: () => void
  onSeeMap: () => void
  onRemove: () => void
}) {
  const sTier = theirDestinations.filter(d => d.tier === 'S').length
  const aTier = theirDestinations.filter(d => d.tier === 'A').length
  const countries = new Set(theirDestinations.map(d => d.country)).size
  return (
    <div className="friend-profile-overview">
      <div className="friend-profile-stats">
        <Stat value={theirDestinations.length} label="destinations" />
        <Stat value={countries} label={`pays`} />
        <Stat value={sTier + aTier} label="top tiers" />
        <Stat value={commonCount} label="en commun" />
      </div>

      <div className="friend-profile-actions">
        <button className="add-submit" onClick={onCompare}>Comparer nos tier lists</button>
        <button className="add-submit" onClick={onSeeMap}>Voir sa carte</button>
        <button className="friends-action-secondary friends-action-btn" onClick={onRemove}>
          Retirer des amis
        </button>
      </div>

      <p className="friends-muted">
        Ami depuis {friend.acceptedAt ? new Date(friend.acceptedAt).toLocaleDateString('fr-FR') : 'récemment'}.
      </p>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="friend-profile-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function MapTab({
  friend,
  theirDestinations,
  onFlyTo,
  onToggleOverlay,
  onClose,
}: {
  friend: Friendship
  theirDestinations: Destination[]
  onFlyTo?: (lat: number, lng: number, name: string) => void
  onToggleOverlay?: (friendUserId: string, enabled: boolean) => void
  onClose: () => void
}) {
  return (
    <div className="friend-profile-map-tab">
      <p className="friends-muted">
        Active la surcouche pour afficher les pins de {friend.displayName} sur ta carte (couleur dédiée).
      </p>
      {onToggleOverlay && (
        <button
          className="add-submit"
          onClick={() => {
            onToggleOverlay(friend.otherUser, true)
            onClose()
          }}
        >
          Superposer sa carte à la mienne
        </button>
      )}
      <h4>Ses destinations</h4>
      <div className="friend-profile-dest-list">
        {theirDestinations.map(d => (
          <button
            key={d.name}
            className="friend-profile-dest-row"
            onClick={() => {
              if (!onFlyTo) return
              onFlyTo(d.lat, d.lng, d.name)
              onClose()
            }}
          >
            <span>{d.name}</span>
            <small>{d.country}{d.tier ? ` · ${d.tier}` : ''}</small>
          </button>
        ))}
        {theirDestinations.length === 0 && <p className="friends-muted">Aucune destination.</p>}
      </div>
    </div>
  )
}

function TripsTab({
  destinations,
  onFlyTo,
  onClose,
}: {
  destinations: Destination[]
  onFlyTo?: (lat: number, lng: number, name: string) => void
  onClose: () => void
}) {
  const trips = useMemo(() => {
    const groups = new Map<string, Destination[]>()
    for (const d of destinations) {
      if (!d.tripName) continue
      const arr = groups.get(d.tripName) ?? []
      arr.push(d)
      groups.set(d.tripName, arr)
    }
    return Array.from(groups.entries())
  }, [destinations])

  if (trips.length === 0) {
    return <p className="friends-muted">Aucun roadtrip pour l'instant.</p>
  }
  return (
    <div className="friend-profile-trips">
      {trips.map(([name, stops]) => (
        <section key={name} className="friend-profile-trip">
          <h4>{name}</h4>
          <div className="friend-profile-trip-stops">
            {stops.map(s => (
              <button
                key={s.name}
                className="friend-profile-dest-row"
                onClick={() => {
                  if (!onFlyTo) return
                  onFlyTo(s.lat, s.lng, s.name)
                  onClose()
                }}
              >
                <span>{s.name}</span>
                <small>{s.country}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
