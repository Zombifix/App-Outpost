import { useEffect, useRef, useState } from 'react'
import type { DestinationFilters } from '../App'
import type { Destination } from '../types'
import { BrandLogo } from './BrandLogo'
import { useActivityFeed } from '../hooks/useActivityFeed'

type View = 'map' | 'tier-list' | 'explore' | 'friends'

interface NavProps {
  totalDestinations: number
  destinations: Destination[]
  activeView: View
  filters: DestinationFilters
  shareCopied: boolean
  publicId: string
  accountOpen: boolean
  pendingFriendCount: number
  onViewChange: (view: View) => void
  onAddClick: () => void
  onFiltersChange: (filters: DestinationFilters) => void
  onSearch: (name: string) => void
  onShare: () => void
  onAccountClick: () => void
  onOpenFriends: () => void
  onActivityFlyTo?: (lat: number, lng: number, name: string, actor?: { userId: string; handle: string; displayName: string }) => void
  viewingFriend?: { userId: string; handle: string; displayName: string } | null
  onBackToMyCarnet?: () => void
}

export default function Nav({
  totalDestinations,
  destinations,
  activeView,
  filters,
  shareCopied,
  publicId,
  accountOpen,
  pendingFriendCount,
  onViewChange,
  onAddClick,
  onFiltersChange,
  onSearch,
  onShare,
  onAccountClick,
  onOpenFriends,
  onActivityFlyTo,
  viewingFriend,
  onBackToMyCarnet,
}: NavProps) {
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

  return (
    <>
      <aside className="sidebar">
        <button className="brand" onClick={() => onViewChange('map')} aria-label="Accueil">
          <BrandLogo />
        </button>

        <button className="create-button" onClick={onAddClick}>
          <span className="create-icon"><Icon name="plus" /></span>
          <span>Destination</span>
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

        <CarnetStats destinations={destinations} onViewChange={onViewChange} />

        <SidebarActivity onSeeAll={onOpenFriends} onFlyTo={onActivityFlyTo} />

      </aside>

      <header className="topbar">
        <div className="topbar-title" aria-label="Titre de la page">
          {viewingFriend && activeView === 'map' && onBackToMyCarnet && (
            <button
              type="button"
              className="page-title-back"
              onClick={onBackToMyCarnet}
              aria-label="Retour à mon carnet"
            >
              <Icon name="arrow-left" />
              <span>Mon carnet</span>
            </button>
          )}
          <div className="topbar-title-text">
            <h1>
              {activeView === 'map' && (viewingFriend ? `${viewingFriend.handle} · carnet de voyage` : 'Mon carnet de voyages')}
              {activeView === 'explore' && 'Explorer · Suggestions IA'}
              {activeView === 'tier-list' && 'Tier list'}
            </h1>
            {activeView === 'map' && (
              <span className="topbar-title-sub">{totalDestinations} destination{totalDestinations > 1 ? 's' : ''} notée{totalDestinations > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
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
          <button onClick={onOpenFriends} aria-label="Amis">
            <Icon name="users" />
            Amis
            {pendingFriendCount > 0 && (
              <span className="top-action-badge" aria-label={`${pendingFriendCount} demandes en attente`}>
                {pendingFriendCount}
              </span>
            )}
          </button>
          <button className="share" onClick={onShare}>
            <Icon name="share" />
            {shareCopied ? 'Lien copie' : 'Partager'}
          </button>
          <button
            className={`user-badge${accountOpen ? ' is-active' : ''}`}
            onClick={onAccountClick}
            aria-label={accountOpen ? 'Fermer mon compte' : 'Mon compte'}
            aria-expanded={accountOpen}
          >
            {publicId ? publicId.slice(0, 1).toUpperCase() : <Icon name="user" />}
          </button>
        </div>
      </header>

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
    'arrow-left': <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
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

function SidebarActivity({ onSeeAll, onFlyTo }: { onSeeAll: () => void; onFlyTo?: (lat: number, lng: number, name: string, actor?: { userId: string; handle: string; displayName: string }) => void }) {
  const { events } = useActivityFeed(10)

  // Mémorise les IDs déjà vus pour ne marquer "is-new" que les arrivées live.
  const seenRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const [pulseId, setPulseId] = useState<string | null>(null)

  useEffect(() => {
    if (!initializedRef.current) {
      events.forEach(e => seenRef.current.add(e.id))
      initializedRef.current = true
      return
    }
    const fresh = events.find(e => !seenRef.current.has(e.id))
    if (fresh) {
      seenRef.current.add(fresh.id)
      setPulseId(fresh.id)
      const t = setTimeout(() => setPulseId(null), 2200)
      return () => clearTimeout(t)
    }
  }, [events])

  if (events.length === 0) return null
  // Pour le hero, on préfère une destination_added récente (riche en visuel : image + tier).
  // Si aucune, on retombe sur le premier event peu importe le kind.
  const heroIdx = events.findIndex(e => e.kind === 'destination_added')
  const hero = heroIdx >= 0 ? events[heroIdx] : events[0]
  const rest = events.filter(e => e.id !== hero.id).slice(0, 3)

  // Extrait les infos communes pour un event (clic, payload, etc.)
  const buildHandler = (ev: typeof events[number]) => {
    const name = (typeof ev.payload?.name === 'string' && ev.payload.name)
      || (typeof ev.payload?.destination_name === 'string' && ev.payload.destination_name)
      || ''
    const lat = typeof ev.payload?.lat === 'number' ? ev.payload.lat : undefined
    const lng = typeof ev.payload?.lng === 'number' ? ev.payload.lng : undefined
    const actorInfo = ev.actorHandle
      ? { userId: ev.actor, handle: ev.actorHandle, displayName: ev.actorDisplayName ?? ev.actorHandle }
      : undefined
    const canFly = lat !== undefined && lng !== undefined && name && onFlyTo
    return canFly
      ? () => onFlyTo!(lat as number, lng as number, name, actorInfo)
      : () => onSeeAll()
  }

  return (
    <section className="sidebar-activity" aria-label="Activité récente">
      <header className="sidebar-activity-head">
        <h4>
          <span className="sidebar-activity-live" aria-hidden="true" />
          Activité récente
        </h4>
        <button className="sidebar-activity-link" onClick={onSeeAll}>Tout voir</button>
      </header>
      <p className="sidebar-activity-sub">Dernières destinations ajoutées</p>

      {hero && (
        <HeroCard
          event={hero}
          onClick={buildHandler(hero)}
          isPulse={pulseId === hero.id}
        />
      )}

      <ul className="sidebar-activity-rows">
        {rest.map(ev => (
          <li key={ev.id} className={pulseId === ev.id ? 'is-new' : ''}>
            <RowCard event={ev} onClick={buildHandler(ev)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Hero (1ère carte, grand format avec image plein largeur) ──────────────────
function HeroCard({ event: ev, onClick, isPulse }: {
  event: ReturnType<typeof useActivityFeed>['events'][number]
  onClick: () => void
  isPulse: boolean
}) {
  const actor = ev.actorDisplayName ?? ev.actorHandle ?? 'Anonyme'
  const name = (typeof ev.payload?.name === 'string' && ev.payload.name)
    || (typeof ev.payload?.destination_name === 'string' && ev.payload.destination_name)
    || ''
  const country = extractCountry(name)
  const destShort = extractDestShort(name)
  const image = typeof ev.payload?.image === 'string' ? ev.payload.image : undefined
  const tier = typeof ev.payload?.tier === 'string' ? (ev.payload.tier as string) : undefined

  return (
    <button
      className={`sidebar-hero${isPulse ? ' is-new' : ''}`}
      onClick={onClick}
      title={name || actor}
      style={image ? { backgroundImage: `url(${image})` } : {
        background: `linear-gradient(135deg, ${ev.actorAvatarBg ?? '#c7d2fe'}, ${ev.actorAvatarBg ?? '#a5b4fc'})`,
      }}
    >
      <span className="sidebar-hero-shade" aria-hidden="true" />
      {tier && <span className={`sidebar-hero-tier tier-${tier.toLowerCase()}`}>{tier}</span>}
      <span className="sidebar-hero-body">
        <strong className="sidebar-hero-dest">{destShort || name}</strong>
        {country && <span className="sidebar-hero-country">{country}</span>}
      </span>
      <span className="sidebar-hero-footer">
        <span className="sidebar-hero-actor">
          <span
            className="sidebar-hero-avatar"
            style={{ background: ev.actorAvatarBg ?? '#c7d2fe', color: ev.actorAvatarFg ?? '#1e3a8a' }}
            aria-hidden="true"
          >
            {actor.slice(0, 1).toUpperCase()}
          </span>
          <span>{actor}</span>
        </span>
        <span className="sidebar-hero-time">{relTime(ev.createdAt)}</span>
      </span>
    </button>
  )
}

// ─── Row (cartes secondaires, format épuré : thumb + dest/pays + tier) ────────
// L'acteur et le temps n'apparaissent que sur la hero. Les rows restent
// minimalistes pour éviter la surcharge visuelle.
function RowCard({ event: ev, onClick }: {
  event: ReturnType<typeof useActivityFeed>['events'][number]
  onClick: () => void
}) {
  const actor = ev.actorDisplayName ?? ev.actorHandle ?? 'Anonyme'
  const name = (typeof ev.payload?.name === 'string' && ev.payload.name)
    || (typeof ev.payload?.destination_name === 'string' && ev.payload.destination_name)
    || ''
  const country = extractCountry(name)
  const destShort = extractDestShort(name)
  const image = typeof ev.payload?.image === 'string' ? ev.payload.image : undefined
  const tier = typeof ev.payload?.tier === 'string' ? (ev.payload.tier as string) : undefined

  return (
    <button className="sidebar-row" onClick={onClick} title={`${name || actor} · ${actor}`}>
      <span
        className="sidebar-row-thumb"
        style={image
          ? { backgroundImage: `url(${image})` }
          : { background: `linear-gradient(135deg, ${ev.actorAvatarBg ?? '#c7d2fe'}, ${ev.actorAvatarBg ?? '#a5b4fc'})` }}
        aria-hidden="true"
      />
      <span className="sidebar-row-body">
        <strong>{destShort || name || renderShortLabel(ev.kind, name)}</strong>
        {country && <span className="sidebar-row-country">{country}</span>}
      </span>
      {tier && <span className={`sidebar-row-tier tier-${tier.toLowerCase()}`}>{tier}</span>}
    </button>
  )
}

// ─── Carte stats "Mon carnet" ──────────────────────────────────────────────────
function CarnetStats({
  destinations,
  onViewChange,
}: {
  destinations: Destination[]
  onViewChange: (view: 'map' | 'tier-list' | 'explore' | 'friends') => void
}) {
  if (destinations.length === 0) return null
  const countries = new Set(destinations.map(d => d.country)).size
  const coeurs = destinations.filter(d => d.coupDeCoeur).length
  return (
    <div className="carnet-stats" onClick={() => onViewChange('map')} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onViewChange('map')}>
      {/* Watermark globe + pin */}
      <svg className="carnet-stats-watermark" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        {/* Globe */}
        <circle cx="28" cy="32" r="20" stroke="currentColor" strokeWidth="1.5"/>
        <ellipse cx="28" cy="32" rx="8.5" ry="20" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 32h40" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 23h36M10 41h36" stroke="currentColor" strokeWidth="1"/>
        {/* Pin */}
        <path d="M28 4c-4 0-7 3.1-7 7 0 5 7 13 7 13s7-8 7-13c0-3.9-3-7-7-7Z" fill="currentColor" opacity="0.9"/>
        <circle cx="28" cy="11" r="2.5" fill="white"/>
      </svg>

      {/* Hero */}
      <div className="carnet-stats-hero">
        <span className="carnet-stats-hero-num">{destinations.length}</span>
        <span className="carnet-stats-hero-label">destination{destinations.length > 1 ? 's' : ''}</span>
        <span className="carnet-stats-hero-sub">vos aventures vous attendent</span>
      </div>

      {/* Bottom row */}
      <div className="carnet-stats-bottom">
        <div className="carnet-stats-chip">
          <span className="carnet-stats-chip-icon carnet-stats-chip-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-5 2 2-5Z"/>
            </svg>
          </span>
          <div>
            <span className="carnet-stats-chip-num">{countries}</span>
            <span className="carnet-stats-chip-label">pays visités</span>
          </div>
        </div>
        <div className="carnet-stats-chip">
          <span className="carnet-stats-chip-icon carnet-stats-chip-red">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21.593c-.525-.444-7.5-6.37-7.5-10.593 0-3.866 3.134-7 7-7 .948 0 1.85.196 2.67.548C15.29 4.572 16.5 4 18 4c3.866 0 6 2.635 6 5.5 0 4.5-7.5 11-12 12.093Z" opacity=".15"/>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </span>
          <div>
            <span className="carnet-stats-chip-num">{coeurs}</span>
            <span className="carnet-stats-chip-label">coups de cœur</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// "Tokyo, Japon" → { dest: "Tokyo", country: "Japon" }
function extractDestShort(fullName: string): string {
  const i = fullName.indexOf(',')
  return i > 0 ? fullName.slice(0, i).trim() : fullName
}
function extractCountry(fullName: string): string {
  const i = fullName.indexOf(',')
  return i > 0 ? fullName.slice(i + 1).trim() : ''
}

function renderShortLabel(kind: string, name: string): string {
  switch (kind) {
    case 'destination_added': return name ? `+ ${name}` : 'nouvelle destination'
    case 'tier_changed': return name ? `déplace ${name}` : 'déplacement de tier'
    case 'coup_de_coeur_set': return name ? `❤ ${name}` : 'coup de cœur'
    case 'roadtrip_created': return name ? `roadtrip ${name}` : 'nouveau roadtrip'
    case 'roadtrip_stop_added': return name ? `étape ${name}` : 'nouvelle étape'
    case 'friendship_accepted': return 'nouvel ami'
    case 'mutual_destination': return name ? `partage ${name}` : 'destination partagée'
    case 'milestone': return name ? `cap : ${name}` : 'a atteint un cap'
    default: return kind
  }
}

function shortTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}j`
}

/** Variante "il y a 3 min" / "à l'instant" (sans double "il y a"). */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `il y a ${hr} h`
  const day = Math.floor(hr / 24)
  return `il y a ${day} j`
}
