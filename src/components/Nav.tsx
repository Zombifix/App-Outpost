import { useState } from 'react'
import type { Destination } from '../types'

type View = 'map' | 'tier-list' | 'explore'

interface Friend {
  name: string
  handle: string
  pending?: boolean
}

interface NavProps {
  totalDestinations: number
  destinations: Destination[]
  activeView: View
  filterTop: boolean
  sortByScore: boolean
  shareCopied: boolean
  publicId: string
  onViewChange: (view: View) => void
  onAddClick: () => void
  onFilterToggle: () => void
  onSortToggle: () => void
  onSearch: (name: string) => void
  onShare: () => void
  onAccountClick: () => void
}

const initialFriends: Friend[] = [
  { name: 'Léa Martin', handle: 'lea-m' },
  { name: 'Alex Bernard', handle: 'alex-b' },
]

export default function Nav({
  totalDestinations,
  destinations,
  activeView,
  filterTop,
  sortByScore,
  shareCopied,
  publicId,
  onViewChange,
  onAddClick,
  onFilterToggle,
  onSortToggle,
  onSearch,
  onShare,
  onAccountClick,
}: NavProps) {
  const [query, setQuery] = useState('')
  const [friendHandle, setFriendHandle] = useState('')
  const [friends, setFriends] = useState<Friend[]>(initialFriends)
  const [networkOpen, setNetworkOpen] = useState(true)

  const submitSearch = () => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return
    const match = destinations.find(destination =>
      destination.name.toLowerCase().includes(normalized) ||
      destination.country.toLowerCase().includes(normalized),
    )
    if (match) {
      onViewChange('map')
      onSearch(match.name)
    }
  }

  const followUser = () => {
    const raw = friendHandle.trim().replace(/^@/, '').toLowerCase()
    const handle = raw.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (!handle) return
    if (friends.some(f => f.handle === handle)) {
      setFriendHandle('')
      return
    }
    setFriends(prev => [...prev, { name: handle, handle, pending: true }])
    setFriendHandle('')
  }

  const unfollow = (handle: string) => {
    setFriends(prev => prev.filter(f => f.handle !== handle))
  }

  return (
    <>
      <aside className="sidebar">
        <button className="brand" onClick={() => onViewChange('map')} aria-label="Accueil Outpost">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <strong>Outpost</strong>
        </button>

        <button className="create-button" onClick={onAddClick}>
          <span className="create-icon"><Icon name="plus" /></span>
          <span>Ajouter une destination</span>
        </button>

        <nav className="side-menu" aria-label="Navigation principale">
          <button className={activeView === 'map' ? 'active' : ''} onClick={() => onViewChange('map')}>
            <Icon name="map" />
            Mon carnet
          </button>
          <button className={activeView === 'tier-list' ? 'active' : ''} onClick={() => onViewChange('tier-list')}>
            <Icon name="sliders" />
            Tier list
          </button>
          <button className={activeView === 'explore' ? 'active' : ''} onClick={() => onViewChange('explore')}>
            <Icon name="compass" />
            Explorer
          </button>
        </nav>

        <section className={`network-drawer${networkOpen ? ' is-open' : ''}`} aria-label="Mon réseau">
          <button
            className="network-header"
            onClick={() => setNetworkOpen(value => !value)}
            aria-expanded={networkOpen}
          >
            <span className="network-title">
              <Icon name="users" />
              Réseau
              <em>{friends.length}</em>
            </span>
            <Icon name={networkOpen ? 'chevron-down' : 'chevron-up'} />
          </button>

          {networkOpen && (
            <>
              <p className="network-hint">Suis d'autres voyageurs pour voir leur carte et comparer vos classements.</p>

              <div className="network-list">
                {friends.length === 0 ? (
                  <p className="network-empty">Personne pour l'instant. Ajoute un pseudo ci-dessous.</p>
                ) : (
                  friends.map(friend => (
                    <div className="network-row" key={friend.handle}>
                      <span className="network-avatar">{friend.name.slice(0, 1).toUpperCase()}</span>
                      <span className="network-meta">
                        <strong>{friend.name}</strong>
                        <small>@{friend.handle}{friend.pending ? ' · invité' : ''}</small>
                      </span>
                      <button
                        className="network-action"
                        title="Voir sa carte"
                        aria-label={`Voir la carte de ${friend.name}`}
                      >
                        <Icon name="map" />
                      </button>
                      <button
                        className="network-action"
                        title="Comparer nos cartes"
                        aria-label={`Comparer avec ${friend.name}`}
                      >
                        <Icon name="versus" />
                      </button>
                      <button
                        className="network-remove"
                        onClick={() => unfollow(friend.handle)}
                        title="Ne plus suivre"
                        aria-label={`Ne plus suivre ${friend.name}`}
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="network-add">
                <span className="network-add-prefix">@</span>
                <input
                  value={friendHandle}
                  onChange={event => setFriendHandle(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') followUser() }}
                  placeholder="pseudo-a-suivre"
                  aria-label="Pseudo à suivre"
                />
                <button onClick={followUser} disabled={!friendHandle.trim()}>
                  Suivre
                </button>
              </div>
            </>
          )}
        </section>
      </aside>

      <header className="topbar">
        <label className="search-box">
          <Icon name="search" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') submitSearch()
            }}
            placeholder="Rechercher une destination, une activite..."
          />
        </label>
        <div className="top-actions">
          <button className={filterTop ? 'active-action' : ''} onClick={onFilterToggle}>
            <Icon name="sliders" />
            {filterTop ? 'Top tiers' : 'Filtres'}
          </button>
          <button className={sortByScore ? 'active-action' : ''} onClick={onSortToggle}>
            <Icon name="sort" />
            {sortByScore ? 'Score' : 'Trier'}
            <Icon name="chevron" />
          </button>
          <button className="share" onClick={onShare}>
            <Icon name="share" />
            {shareCopied ? 'Lien copie' : 'Partager'}
          </button>
          <button className="user-badge" onClick={onAccountClick} aria-label="Mon compte">
            {publicId ? publicId.slice(0, 1).toUpperCase() : <Icon name="user" />}
          </button>
        </div>
      </header>

      <section className="page-title" aria-label="Titre de la page">
        <h1>
          {activeView === 'map' && 'Mon carnet de voyages'}
          {activeView === 'tier-list' && 'Tier list - Vue ensemble'}
          {activeView === 'explore' && 'Explorer - Suggestions IA'}
        </h1>
        <p>
          {activeView === 'map' && `${totalDestinations} destination${totalDestinations > 1 ? 's' : ''} notée${totalDestinations > 1 ? 's' : ''}`}
          {activeView === 'tier-list' && 'Classement complet et comparaison avec tes amis'}
          {activeView === 'explore' && 'Placeholder IA, bientot connecte a ton classement'}
        </p>
      </section>
    </>
  )
}

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const paths: Record<string, JSX.Element> = {
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15" /><path d="M15 6v15" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    sliders: <><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></>,
    sort: <><path d="M7 4v16" /><path d="m3 8 4-4 4 4" /><path d="M17 20V4" /><path d="m13 16 4 4 4-4" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    'chevron-up': <path d="m6 15 6-6 6 6" />,
    versus: <><path d="M5 4 8 14 11 4" /><path d="m18 4-5 16" /><path d="M14 11h6" /></>,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  }

  return <svg {...common}>{paths[name] ?? paths.map}</svg>
}
