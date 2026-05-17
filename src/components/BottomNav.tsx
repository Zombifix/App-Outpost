import { Icon } from './Icon'

type View = 'map' | 'tier-list' | 'explore' | 'friends'

interface BottomNavProps {
  activeView: View
  pendingFriendCount: number
  onViewChange: (view: View) => void
  onAddClick: () => void
}

export default function BottomNav({ activeView, pendingFriendCount, onViewChange, onAddClick }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Navigation mobile">
      <button
        className={`bottom-nav-item${activeView === 'map' ? ' is-active' : ''}`}
        onClick={() => onViewChange('map')}
        aria-label="Carte"
        aria-current={activeView === 'map' ? 'page' : undefined}
      >
        <Icon name="map" />
        <span>Carte</span>
      </button>
      <button
        className={`bottom-nav-item${activeView === 'tier-list' ? ' is-active' : ''}`}
        onClick={() => onViewChange('tier-list')}
        aria-label="Tier list"
        aria-current={activeView === 'tier-list' ? 'page' : undefined}
      >
        <Icon name="sliders" />
        <span>Tier list</span>
      </button>

      <button
        className="bottom-nav-add"
        onClick={onAddClick}
        aria-label="Ajouter une destination"
      >
        <span className="bottom-nav-add-icon"><Icon name="plus" /></span>
        <span>Ajouter</span>
      </button>

      <button
        className={`bottom-nav-item${activeView === 'friends' ? ' is-active' : ''}`}
        onClick={() => onViewChange('friends')}
        aria-label="Amis"
        aria-current={activeView === 'friends' ? 'page' : undefined}
      >
        <Icon name="users" />
        <span>Amis</span>
        {pendingFriendCount > 0 && (
          <span className="bottom-nav-badge" aria-label={`${pendingFriendCount} demandes en attente`}>
            {pendingFriendCount}
          </span>
        )}
      </button>
      <button
        className={`bottom-nav-item${activeView === 'explore' ? ' is-active' : ''}`}
        onClick={() => onViewChange('explore')}
        aria-label="Explorer"
        aria-current={activeView === 'explore' ? 'page' : undefined}
      >
        <Icon name="compass" />
        <span>Explorer</span>
      </button>
    </nav>
  )
}
