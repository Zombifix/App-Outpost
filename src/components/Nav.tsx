import { useState } from 'react'
import emailjs from '@emailjs/browser'
import type { Destination } from '../types'

type View = 'map' | 'tier-list' | 'explore'

interface Friend {
  name: string
  email: string
  invited?: boolean
}

interface NavProps {
  totalDestinations: number
  destinations: Destination[]
  activeView: View
  filterTop: boolean
  sortByScore: boolean
  shareCopied: boolean
  onViewChange: (view: View) => void
  onAddClick: () => void
  onFilterToggle: () => void
  onSortToggle: () => void
  onSearch: (name: string) => void
  onShare: () => void
  onAccountClick: () => void
}

const initialFriends: Friend[] = [
  { name: 'Lea Martin', email: 'lea@triptier.app' },
  { name: 'Alex Bernard', email: 'alex@triptier.app' },
]

export default function Nav({
  totalDestinations,
  destinations,
  activeView,
  filterTop,
  sortByScore,
  shareCopied,
  onViewChange,
  onAddClick,
  onFilterToggle,
  onSortToggle,
  onSearch,
  onShare,
  onAccountClick,
}: NavProps) {
  const [query, setQuery] = useState('')
  const [friendEmail, setFriendEmail] = useState('')
  const [friends, setFriends] = useState<Friend[]>(initialFriends)
  const [inviting, setInviting] = useState(false)

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

  const addFriend = async () => {
    const email = friendEmail.trim()
    if (!email || inviting) return
    if (friends.some(f => f.email === email)) {
      setFriendEmail('')
      return
    }

    setInviting(true)
    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        { to_email: email, from_name: 'TripTier' },
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
      )
    } catch {
      // invitation envoyée en best-effort, on ajoute quand même localement
    }

    setFriends(prev => [...prev, { name: email.split('@')[0] || 'Ami', email, invited: true }])
    setFriendEmail('')
    setInviting(false)
  }

  return (
    <>
      <aside className="sidebar">
        <button className="brand" onClick={() => onViewChange('map')} aria-label="Accueil TripTier">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <strong>TripTier</strong>
        </button>

        <button className="create-button" onClick={onAddClick}>
          <span className="create-icon"><Icon name="plus" /></span>
          <span>Ajouter une destination</span>
        </button>

        <nav className="side-menu" aria-label="Navigation principale">
          <button className={activeView === 'map' ? 'active' : ''} onClick={() => onViewChange('map')}>
            <Icon name="map" />
            Ma carte
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

        <section className="friends-drawer" aria-label="Mes amis">
          <p className="side-menu-label">
            <Icon name="users" /> Amis
          </p>
          <div className="friends-list">
            {friends.map(friend => (
              <button key={friend.email}>
                <span>{friend.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{friend.name}</strong>
                  <small>{friend.invited ? 'Invitation envoyée' : friend.email}</small>
                </span>
              </button>
            ))}
          </div>
          <label>
            Ajouter par email
            <div>
              <input
                value={friendEmail}
                onChange={event => setFriendEmail(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') addFriend() }}
                placeholder="ami@email.com"
              />
              <button onClick={addFriend} aria-label="Ajouter l'ami" disabled={inviting}>
                {inviting ? '…' : <Icon name="plus" />}
              </button>
            </div>
          </label>
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
          <button className="user-badge" onClick={onAccountClick}>S</button>
        </div>
      </header>

      <section className="page-title" aria-label="Titre de la page">
        <h1>
          {activeView === 'map' && 'Ma carte - Destinations de reve'}
          {activeView === 'tier-list' && 'Tier list - Vue ensemble'}
          {activeView === 'explore' && 'Explorer - Suggestions IA'}
        </h1>
        <p>
          {activeView === 'map' && `Modifiee le 18 mai 2024 - ${totalDestinations} destinations`}
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
  }

  return <svg {...common}>{paths[name] ?? paths.map}</svg>
}
