import { useState } from 'react'
import type { DestinationFilters } from '../App'
import type { Destination } from '../types'
import { BrandLogo } from './BrandLogo'

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
          <BrandLogo />
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
