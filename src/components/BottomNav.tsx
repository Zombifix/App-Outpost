import { Icon } from './Icon'
import { t } from '../i18n'

type View = 'map' | 'tier-list' | 'explore' | 'friends'

interface BottomNavProps {
  activeView: View
  pendingFriendCount: number
  onViewChange: (view: View) => void
  onAddClick: () => void
  onOpenFriends: () => void
}

export default function BottomNav({ activeView, pendingFriendCount, onViewChange, onAddClick, onOpenFriends }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label={t('Main navigation', 'Navigation principale')}>
      <button
        className={`bottom-nav-item${activeView === 'map' ? ' is-active' : ''}`}
        onClick={() => onViewChange('map')}
        aria-label={t('Map', 'Carte')}
        aria-current={activeView === 'map' ? 'page' : undefined}
      >
        <span className="bottom-nav-item-icon" aria-hidden="true"><Icon name="map" /></span>
        <span className="bottom-nav-item-label">{t('Map', 'Carte')}</span>
      </button>
      <button
        className={`bottom-nav-item${activeView === 'tier-list' ? ' is-active' : ''}`}
        onClick={() => onViewChange('tier-list')}
        aria-label="Tier list"
        aria-current={activeView === 'tier-list' ? 'page' : undefined}
      >
        <span className="bottom-nav-item-icon" aria-hidden="true"><Icon name="sliders" /></span>
        <span className="bottom-nav-item-label">Tier list</span>
      </button>

      <button
        className="bottom-nav-add"
        onClick={onAddClick}
        aria-label={t('Add a destination', 'Ajouter une destination')}
      >
        <span className="bottom-nav-add-icon"><Icon name="plus" /></span>
        <span className="bottom-nav-add-label">{t('Add', 'Ajouter')}</span>
      </button>

      <button
        className={`bottom-nav-item${activeView === 'friends' ? ' is-active' : ''}`}
        onClick={onOpenFriends}
        aria-label={t('Friends', 'Amis')}
        aria-current={activeView === 'friends' ? 'page' : undefined}
      >
        <span className="bottom-nav-item-icon" aria-hidden="true"><Icon name="users" /></span>
        <span className="bottom-nav-item-label">{t('Friends', 'Amis')}</span>
        {pendingFriendCount > 0 && (
          <span className="bottom-nav-badge" aria-label={`${pendingFriendCount} ${t('pending requests', 'demandes en attente')}`}>
            {pendingFriendCount}
          </span>
        )}
      </button>
      <button
        className={`bottom-nav-item${activeView === 'explore' ? ' is-active' : ''}`}
        onClick={() => onViewChange('explore')}
        aria-label={t('Explore', 'Explorer')}
        aria-current={activeView === 'explore' ? 'page' : undefined}
      >
        <span className="bottom-nav-item-icon" aria-hidden="true"><Icon name="compass" /></span>
        <span className="bottom-nav-item-label">{t('Explore', 'Explorer')}</span>
      </button>
    </nav>
  )
}
