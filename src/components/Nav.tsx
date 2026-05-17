import { useState } from 'react'
import type { DestinationFilters } from '../App'
import type { Destination } from '../types'

type View = 'map' | 'tier-list' | 'explore' | 'friends'

interface NavProps {
  totalDestinations: number
  destinations: Destination[]
  activeView: View
  filters: DestinationFilters
  sortByScore: boolean
  shareCopied: boolean
  publicId: string
  pendingFriendCount: number
  onViewChange: (view: View) => void
  onAddClick: () => void
  onFiltersChange: (filters: DestinationFilters) => void
  onSortToggle: () => void
  onSearch: (name: string) => void
  onShare: () => void
  onAccountClick: () => void
}

export default function Nav({
  totalDestinations,
  destinations,
  activeView,
  filters,
  sortByScore,
  shareCopied,
  publicId,
  pendingFriendCount,
  onViewChange,
  onAddClick,
  onFiltersChange,
  onSortToggle,
  onSearch,
  onShare,
  onAccountClick,
}: NavProps) {
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = [
    filters.topTiers,
    filters.under300,
    filters.recentOnly,
    filters.duration !== 'all',
    filters.ambiance,
  ].filter(Boolean).length

  const updateFilters = (patch: Partial<DestinationFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }

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

  return (
    <>
      <aside className="sidebar">
        <button className="brand" onClick={() => onViewChange('map')} aria-label="Accueil">
          <svg viewBox="-5 0 618.23 151.21" className="brand-logo" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <g>
              <g>
                <path fill="#0f1f38" d="M432.57,117.59c-17.73.77-33.19-6.6-42.74-20.75-17.27-25.59-7-61.08,21.77-72.58,16.23-6.5,34.03-4.16,47.87,6.14,13.04,9.7,20.26,26.14,18.77,43.25-2.11,24.22-20.78,42.86-45.67,43.94Z"/>
                <path fill="#f5f8fa" d="M458.9,68.18c.67,17.76-12.73,31.63-29.39,31.4-16.92-.23-29.35-14.75-28.39-31.89s12.68-28.47,28.5-28.72c15.88-.25,28.64,12.07,29.29,29.2Z"/>
              </g>
              <g>
                <path fill="#0e1e36" d="M547.92,104.61c-12.97,18.72-50.28,17.93-64.66-4.95l13.73-11.58c6.57,11.07,19.1,16.19,30.52,11.16,4.07-1.79,6.25-6.12,6.06-9.92-.21-4.1-2.98-7.57-7.2-9.13l-21.7-8.04c-9.55-3.54-16.47-11.11-17.65-20.33-1.3-10.22,2.62-20.15,11.68-25.56,16.59-9.9,38.84-6.26,50.95,9.69-3.53,4.44-8.07,7.43-12.85,11.38-5.75-8.1-14.92-11.92-24.12-9.12-4.38,1.33-6.9,4.85-6.92,8.91s2.53,7.53,6.79,9.1l22.47,8.27c7.84,2.89,14.07,8.97,16.29,15.76,2.81,8.62,1.54,17.26-3.38,24.36Z"/>
                <path fill="#0f1f37" d="M583.37,87.98c0,6.54,4.71,11.23,10.69,10.57l11.92-1.31-.02,17.22c-7.43,1.78-14.29,2.77-21.79,1.71-11.24-1.6-20.38-10.34-20.44-22.52l-.46-93.55,19.88-.11.22,22.81,24.85.18-10.44,16.6-14.47.14.05,48.25Z"/>
              </g>
              <g>
                <g>
                  <path fill="#0f1f37" d="M204.22,23.02l-.06,92.52-19.69-.12c-.19-4.03.58-6.95-.62-11.31-6.83,9.43-16.66,13.23-27.83,13.71-21.02.89-37.59-13.9-38.8-35.46l-.51-59.25c6.72-.66,13.18-.38,20.16-.2l.37,56.54c.08,11.49,9.04,19.23,19.83,20.05,13.99,1.06,26.79-8.37,26.91-23l.46-53.45c6.28-.61,11.87-.24,19.77-.03Z"/>
                  <path fill="#0f1f37" d="M240.55,88.18c-.01,5.39,3.19,9.05,7.9,10s9.63.06,14.68-1.37l.02,17.65c-6.71,1.45-12.55,2.45-19.23,2.08-12.44-.68-22.94-9.82-23-23.09l-.43-93.29,20.03-.11.09,22.86,25.6.13-11.34,16.65-14.22.12-.1,48.38Z"/>
                </g>
                <g>
                  <path fill="#0f1f37" d="M296.36,151.21l-19.79-.11V23.14s19.58-.23,19.58-.23l.56,12.28c17.84-21.52,50.64-17.93,66.59,3.32,13.04,17.38,13.41,41.66,1.49,59.77-14.73,22.37-48.72,26.84-68.37,6.15l-.05,46.77Z"/>
                  <path fill="#f5f8fa" d="M353.34,68.11c.69,17.83-12.07,31.52-28.74,31.47-16.98-.05-29.01-13.71-28.64-30.98.35-16.29,11.77-29.1,27.71-29.62s29,11.85,29.67,29.14Z"/>
                </g>
              </g>
            </g>
            <g>
              <path fill="#7087fc" d="M62.57,97.42c13.89-6.31,20.3-20.06,17.5-34.33-2.71-13.84-14.97-23.69-28.78-24.16-14.56-.5-27.02,9.17-30.49,22.43-3.83,14.64,2.92,29.34,16.98,35.85l-1.99,19.7c-15.12-3.95-26.77-15.6-31.89-28.27C-2.8,72.02-.67,55.39,8.75,41.36c12.67-18.87,35.19-26.29,56.99-19.41,20.09,6.34,34.6,25.89,34.44,48.03s-14.55,41.37-35.57,47.09l-2.03-19.65Z"/>
              <path fill="#7288fb" d="M50.37,81.74c-2.35-5.87-5.32-10.47-13.01-12.59,6.58-2.62,10.79-5.4,12.96-13.27,2.33,7.26,6.16,11.12,13.07,13.1-6.76,1.89-10.14,5.57-13.02,12.76Z"/>
            </g>
          </svg>
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
          <button className={activeView === 'friends' ? 'active' : ''} onClick={() => onViewChange('friends')}>
            <Icon name="users" />
            Amis
            {pendingFriendCount > 0 && (
              <span className="side-menu-badge" aria-label={`${pendingFriendCount} demandes en attente`}>
                {pendingFriendCount}
              </span>
            )}
          </button>
          <button className={activeView === 'explore' ? 'active' : ''} onClick={() => onViewChange('explore')}>
            <Icon name="compass" />
            Explorer
          </button>
        </nav>

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
          <div className="filter-menu-wrap">
            <button
              className={activeFilterCount ? 'active-action' : ''}
              onClick={() => setFiltersOpen(value => !value)}
              aria-expanded={filtersOpen}
            >
              <Icon name="sliders" />
              Filtres{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
            {filtersOpen && (
              <div className="filter-popover">
                <div className="filter-popover-head">
                  <strong>Filtres</strong>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onPointerDown={() => onFiltersChange({ topTiers: false, under300: false, recentOnly: false, duration: 'all', ambiance: false })}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="filter-chip-grid">
                  <button type="button" className={filters.topTiers ? 'is-active' : ''} onPointerDown={() => updateFilters({ topTiers: !filters.topTiers })}>
                    Top tiers
                  </button>
                  <button type="button" className={filters.under300 ? 'is-active' : ''} onPointerDown={() => updateFilters({ under300: !filters.under300 })}>
                    &lt; 300 €
                  </button>
                  <button type="button" className={filters.recentOnly ? 'is-active' : ''} onPointerDown={() => updateFilters({ recentOnly: !filters.recentOnly })}>
                    Récent
                  </button>
                  <button type="button" className={filters.ambiance ? 'is-active' : ''} onPointerDown={() => updateFilters({ ambiance: !filters.ambiance })}>
                    Ambiance
                  </button>
                </div>
                <div className="filter-duration">
                  <span>Durée</span>
                  <div>
                    <button type="button" className={filters.duration === 'all' ? 'is-active' : ''} onPointerDown={() => updateFilters({ duration: 'all' })}>Tout</button>
                    <button type="button" className={filters.duration === 'short' ? 'is-active' : ''} onPointerDown={() => updateFilters({ duration: 'short' })}>Court</button>
                    <button type="button" className={filters.duration === 'long' ? 'is-active' : ''} onPointerDown={() => updateFilters({ duration: 'long' })}>Long</button>
                  </div>
                </div>
              </div>
            )}
          </div>
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

      {activeView !== 'tier-list' && activeView !== 'friends' && (
        <section className="page-title" aria-label="Titre de la page">
          <h1>
            {activeView === 'map' && 'Mon carnet de voyages'}
            {activeView === 'explore' && 'Explorer - Suggestions IA'}
          </h1>
          <p>
            {activeView === 'map' && `${totalDestinations} destination${totalDestinations > 1 ? 's' : ''} notée${totalDestinations > 1 ? 's' : ''}`}
            {activeView === 'explore' && 'Placeholder IA, bientot connecte a ton classement'}
          </p>
        </section>
      )}
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
