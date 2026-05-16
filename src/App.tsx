import { useEffect, useMemo, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from './types'
import { DESTINATIONS } from './data'
import { resolveDestinationImage } from './services/imageSearch'
import WorldMap from './components/WorldMap'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'
import TierListPage from './components/TierListPage'
import AddDestinationWizard from './components/AddDestinationWizard'

const STORAGE_KEY = 'outpost-destinations-v2'
const LEGACY_STORAGE_KEY = 'triptier-destinations-v2'
const PUBLIC_ID_KEY = 'outpost-public-id'
const AUTO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
type View = 'map' | 'tier-list' | 'explore'

const VALID_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D']
const VALID_INTENTS: Intent[] = ['city-trip', 'tourisme', 'sorties', 'gastro', 'nature', 'travail']
const VALID_KINDS: NonNullable<Destination['kind']>[] = ['place', 'zone', 'stop', 'stage']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeStops(value: unknown): RoadTripStop[] | undefined {
  if (!Array.isArray(value)) return undefined
  const stops = value
    .filter(isRecord)
    .map(stop => ({
      name: typeof stop.name === 'string' ? stop.name.trim() : '',
      lat: finiteNumber(stop.lat, NaN),
      lng: finiteNumber(stop.lng, NaN),
      type: stop.type === 'passage' ? 'passage' as const : stop.type === 'stage' ? 'stage' as const : undefined,
    }))
    .filter(stop => stop.name && Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
  return stops.length ? stops : undefined
}

function normalizeDestination(value: unknown): Destination | null {
  if (!isRecord(value)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const lat = finiteNumber(value.lat, NaN)
  const lng = finiteNumber(value.lng, NaN)
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const country = typeof value.country === 'string' && value.country.trim()
    ? value.country.trim()
    : 'Inconnu'
  const tier = VALID_TIERS.includes(value.tier as Tier) ? value.tier as Tier : undefined
  const kind = VALID_KINDS.includes(value.kind as NonNullable<Destination['kind']>)
    ? value.kind as Destination['kind']
    : 'place'
  const intent = VALID_INTENTS.includes(value.intent as Intent) ? value.intent as Intent : 'tourisme'
  const extent = Array.isArray(value.extent) && value.extent.length === 4
    ? value.extent.map(coord => finiteNumber(coord, NaN)) as [number, number, number, number]
    : undefined

  return {
    ...(value as Destination),
    name,
    country,
    lat,
    lng,
    tier,
    kind,
    intent,
    food: finiteNumber(value.food, 3),
    night: finiteNumber(value.night, 3),
    culture: finiteNumber(value.culture, 3),
    nature: finiteNumber(value.nature, 3),
    value: finiteNumber(value.value, 3),
    score: value.score === undefined ? undefined : finiteNumber(value.score, 3),
    notes: value.notes === undefined ? undefined : finiteNumber(value.notes, 1),
    stops: normalizeStops(value.stops),
    extent: extent?.every(Number.isFinite) ? extent : undefined,
    geojson: isRecord(value.geojson) ? value.geojson : undefined,
    state: typeof value.state === 'string' ? value.state : undefined,
    osmValue: typeof value.osmValue === 'string' ? value.osmValue : undefined,
    image: typeof value.image === 'string' ? value.image : undefined,
    imageProvider: ['pexels', 'wikipedia', 'wikimedia', 'fallback'].includes(value.imageProvider as string)
      ? value.imageProvider as Destination['imageProvider']
      : undefined,
    imageAuthor: typeof value.imageAuthor === 'string' ? value.imageAuthor : undefined,
    imageSourceUrl: typeof value.imageSourceUrl === 'string' ? value.imageSourceUrl : undefined,
    imageQuery: typeof value.imageQuery === 'string' ? value.imageQuery : undefined,
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    tripName: typeof value.tripName === 'string' ? value.tripName : undefined,
    coupDeCoeur: typeof value.coupDeCoeur === 'boolean' ? value.coupDeCoeur : undefined,
  }
}

function normalizeDestinations(value: unknown): Destination[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map(normalizeDestination).filter((item): item is Destination => item !== null)
  return normalized.length ? normalized : null
}

function loadDestinations(): Destination[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (saved) {
      const normalized = normalizeDestinations(JSON.parse(saved))
      if (normalized) return normalized
    }
  } catch {
    /* ignore */
  }
  return DESTINATIONS
}

function loadPublicId(): string {
  try {
    return localStorage.getItem(PUBLIC_ID_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function App() {
  const [destinations, setDestinations] = useState<Destination[]>(loadDestinations)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>('Kyoto')
  const [filterTop, setFilterTop] = useState(false)
  const [sortByScore, setSortByScore] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [tierListCollapsed, setTierListCollapsed] = useState(false)
  const [addingDestination, setAddingDestination] = useState(false)
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null)
  const [activeView, setActiveView] = useState<View>('map')
  const [accountOpen, setAccountOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [publicId, setPublicId] = useState<string>(loadPublicId)

  useEffect(() => {
    try {
      if (publicId) localStorage.setItem(PUBLIC_ID_KEY, publicId)
      else localStorage.removeItem(PUBLIC_ID_KEY)
    } catch {
      /* ignore */
    }
  }, [publicId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
    } catch {
      /* ignore */
    }
  }, [destinations])

  useEffect(() => {
    const refreshTargets = destinations.filter(destination =>
      destination.imageProvider === 'wikimedia' || destination.imageProvider === 'fallback',
    )
    if (!refreshTargets.length) return

    let cancelled = false
    Promise.all(refreshTargets.map(async destination => {
      const imageResult = await resolveDestinationImage({
        name: destination.name,
        country: destination.country,
        kind: destination.kind,
        stops: destination.stops,
        fallbackImage: destination.image ?? AUTO_IMAGE_FALLBACK,
      })

      if (imageResult.imageProvider === 'fallback' || imageResult.imageProvider === 'wikimedia') return null
      return { name: destination.name, imageResult }
    })).then(results => {
      if (cancelled) return
      const upgrades = results.filter((result): result is NonNullable<typeof result> => result !== null)
      if (!upgrades.length) return
      setDestinations(previous => previous.map(destination => {
        const upgrade = upgrades.find(item => item.name === destination.name)
        return upgrade
          ? {
              ...destination,
              image: upgrade.imageResult.image,
              imageProvider: upgrade.imageResult.imageProvider,
              imageAuthor: upgrade.imageResult.imageAuthor,
              imageSourceUrl: upgrade.imageResult.imageSourceUrl,
              imageQuery: upgrade.imageResult.imageQuery,
            }
          : destination
      }))
    }).catch(() => {
      /* keep the current stored images */
    })

    return () => {
      cancelled = true
    }
  }, [destinations])

  const visibleDestinations = useMemo(() => {
    const filtered = filterTop
      ? destinations.filter(destination => destination.tier === 'S' || destination.tier === 'A')
      : destinations

    return [...filtered].sort((a, b) => {
      if (sortByScore) return (b.score ?? 0) - (a.score ?? 0)
      return a.name.localeCompare(b.name)
    })
  }, [destinations, filterTop, sortByScore])

  const selected = useMemo(
    () => destinations.find(destination => destination.name === selectedName) ?? null,
    [destinations, selectedName],
  )

  const selectByName = (name: string) => {
    const destination = destinations.find(item => item.name === name)
    if (!destination) return
    setSelectedName(destination.name)
    setFlyTarget({ lat: destination.lat, lng: destination.lng, name: destination.name })
  }

  const focusSelected = () => {
    if (!selected) return
    setFlyTarget({ lat: selected.lat, lng: selected.lng, name: selected.name })
  }

  const coupDeCoeurCount = useMemo(
    () => destinations.filter(d => d.coupDeCoeur).length,
    [destinations],
  )

  const toggleCoupDeCoeur = (name: string) => {
    setDestinations(previous => previous.map(d => {
      if (d.name !== name) return d
      if (d.coupDeCoeur) return { ...d, coupDeCoeur: false }
      if (previous.filter(x => x.coupDeCoeur).length >= 2) return d
      return { ...d, coupDeCoeur: true }
    }))
  }

  const removeDestination = (name: string) => {
    setDestinations(previous => previous.filter(item => item.name !== name))
    if (selectedName === name) setSelectedName(null)
  }

  const updateDestination = (updated: Destination) => {
    setDestinations(previous => previous.map(item => item.name === updated.name ? updated : item))
    setEditingDestination(null)
  }

  const addDestination = (destination: Destination) => {
    setDestinations(previous => {
      const exists = previous.some(item => item.name.toLowerCase() === destination.name.toLowerCase())
      return exists ? previous : [...previous, destination]
    })
    setSelectedName(destination.name)
    setFlyTarget({ lat: destination.lat, lng: destination.lng, name: destination.name })
    setAddingDestination(false)
    setActiveView('map')
  }

  const shareTierList = async () => {
    const slug = publicId.trim() || 'invite'
    const url = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(slug)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Lien de partage', url)
    }
    setShareCopied(true)
    window.setTimeout(() => setShareCopied(false), 1800)
  }

  const appClass = [
    'travel-app',
    tierListCollapsed ? 'tier-collapsed' : '',
    !(activeView === 'map' && selected) ? 'no-card' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={appClass}>
      {activeView === 'map' && (
        <WorldMap
          destinations={visibleDestinations}
          flyTarget={flyTarget}
          selectedName={selected?.name}
          onSelect={selectByName}
          onFlyTargetConsumed={() => setFlyTarget(null)}
        />
      )}
      {activeView === 'tier-list' && (
        <TierListPage destinations={destinations} />
      )}
      {activeView === 'explore' && (
        <ExploreView
          destinations={destinations}
          onSelect={name => {
            setActiveView('map')
            selectByName(name)
          }}
        />
      )}
      <Nav
        totalDestinations={visibleDestinations.length}
        activeView={activeView}
        filterTop={filterTop}
        sortByScore={sortByScore}
        shareCopied={shareCopied}
        publicId={publicId}
        onViewChange={setActiveView}
        onAddClick={() => setAddingDestination(true)}
        onFilterToggle={() => setFilterTop(value => !value)}
        onSortToggle={() => setSortByScore(value => !value)}
        onSearch={selectByName}
        destinations={destinations}
        onShare={shareTierList}
        onAccountClick={() => setAccountOpen(true)}
      />
      {activeView === 'map' && selected && (
        <DestinationCard
          destination={selected}
          coupDeCoeur={selected.coupDeCoeur ?? false}
          coupDeCoeurCount={coupDeCoeurCount}
          onClose={() => setSelectedName(null)}
          onFocus={focusSelected}
          onCoupDeCoeur={() => toggleCoupDeCoeur(selected.name)}
          onEdit={dest => setEditingDestination(dest)}
          onDelete={name => removeDestination(name)}
        />
      )}
      {activeView === 'map' && (
        <TierListPanel
          destinations={visibleDestinations}
          manageMode={manageMode}
          collapsed={tierListCollapsed}
          coupDeCoeurCount={coupDeCoeurCount}
          onManageToggle={() => setManageMode(value => !value)}
          onCollapseToggle={() => setTierListCollapsed(value => !value)}
          onCoupDeCoeurToggle={toggleCoupDeCoeur}
          onFlyTo={selectByName}
          onDelete={removeDestination}
        />
      )}
      {addingDestination && (
        <AddDestinationWizard
          onClose={() => setAddingDestination(false)}
          onAdd={addDestination}
        />
      )}
      {editingDestination && (
        <AddDestinationWizard
          onClose={() => setEditingDestination(null)}
          onAdd={addDestination}
          initialDestination={editingDestination}
          onUpdate={updateDestination}
        />
      )}
      {accountOpen && (
        <AccountPanel
          publicId={publicId}
          onPublicIdChange={setPublicId}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </div>
  )
}

function ExploreView({ destinations, onSelect }: { destinations: Destination[]; onSelect: (name: string) => void }) {
  const topTiers = destinations.filter(destination => destination.tier === 'S' || destination.tier === 'A')
  const suggestionSeeds = [
    {
      name: 'Seoul',
      reason: 'Tu notes haut les villes culture, food et energie nocturne.',
      image: 'https://images.unsplash.com/photo-1538485399081-7c8ed6f92825?auto=format&fit=crop&w=900&q=85',
    },
    {
      name: 'Porto',
      reason: 'Proche de Lisbonne dans ton classement, plus doux et tres bon rapport qualite/prix.',
      image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=900&q=85',
    },
    {
      name: 'Osaka',
      reason: 'Si Kyoto est S tier, Osaka peut completer la carte cote gastronomie.',
      image: 'https://images.unsplash.com/photo-1590253230532-a67f6bc61c9e?auto=format&fit=crop&w=900&q=85',
    },
  ]

  return (
    <main className="explore-page" aria-label="Explorer des suggestions">
      <section className="ai-panel">
        <span className="ai-chip">IA bientot connectee</span>
        <h2>Suggestions basees sur ton classement</h2>
        <p>
          Pour le moment, ce module est un placeholder. Il simulera ensuite des recommandations en regardant tes tiers,
          tes notes par critere et les destinations que tes amis ajoutent.
        </p>
        <div className="ai-context">
          <strong>{topTiers.length}</strong>
          <span>destinations fortes detectees dans ta tier list</span>
        </div>
      </section>

      <section className="suggestion-grid">
        {suggestionSeeds.map(suggestion => (
          <article className="suggestion-card" key={suggestion.name}>
            <div style={{ backgroundImage: `url(${suggestion.image})` }} />
            <h3>{suggestion.name}</h3>
            <p>{suggestion.reason}</p>
            <button onClick={() => onSelect('Kyoto')}>Voir un exemple sur la carte</button>
          </article>
        ))}
      </section>
    </main>
  )
}

interface AccountPanelProps {
  publicId: string
  onPublicIdChange: (value: string) => void
  onClose: () => void
}

function AccountPanel({ publicId, onPublicIdChange, onClose }: AccountPanelProps) {
  const [draftId, setDraftId] = useState(publicId)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const save = () => {
    const normalized = draftId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    onPublicIdChange(normalized)
    onClose()
  }

  const shareLink = draftId.trim()
    ? `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(draftId.trim())}`
    : ''

  return (
    <div className="account-overlay" role="dialog" aria-label="Compte" onClick={onClose}>
      <aside className="account-panel" onClick={event => event.stopPropagation()}>
        <button className="floating-close" aria-label="Fermer le compte" onClick={onClose}>
          <Icon name="x" />
        </button>
        <div className="account-avatar">{draftId ? draftId.slice(0, 1).toUpperCase() : '·'}</div>
        <h2>Mon compte</h2>
        <p className="account-hint">
          Tes destinations sont sauvegardées sur cet appareil. Crée un compte pour les retrouver partout
          et garder un lien de partage stable.
        </p>
        <label>
          Identifiant public
          <input
            value={draftId}
            onChange={event => setDraftId(event.target.value)}
            placeholder="ton-pseudo"
          />
        </label>
        {shareLink && (
          <label>
            Ton lien de partage
            <input readOnly value={shareLink} />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="toi@email.com"
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>
        <p className="account-soon">La synchronisation cloud arrive bientôt.</p>
        <button className="add-submit" onClick={save}>Enregistrer</button>
      </aside>
    </div>
  )
}


interface DestinationCardProps {
  destination: Destination
  coupDeCoeur: boolean
  coupDeCoeurCount: number
  onClose: () => void
  onFocus: () => void
  onCoupDeCoeur: () => void
  onEdit: (destination: Destination) => void
  onDelete: (name: string) => void
}

function DestinationCard({ destination, coupDeCoeur, coupDeCoeurCount, onClose, onFocus, onCoupDeCoeur, onEdit, onDelete }: DestinationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const criteria = [
    ['Gastronomie', destination.food, 'utensils'],
    ['Sorties & Vie nocturne', destination.night, 'martini'],
    ['Culture & Histoire', destination.culture, 'temple'],
    ['Nature & Paysages', destination.nature, 'mountain'],
    ['Rapport qualite/prix', destination.value, 'coins'],
  ] as const

  const coupDeCoeurDisabled = !coupDeCoeur && coupDeCoeurCount >= 2

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }

  return (
    <aside className="destination-card" aria-label={`Detail de ${destination.name}`}>
      <button className="floating-close" aria-label="Fermer le detail" onClick={onClose}>
        <Icon name="x" />
      </button>
      <div className="floating-kebab-wrap">
        <button
          className={`card-kebab${menuOpen ? ' is-open' : ''}`}
          aria-label="Options"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(v => !v); setConfirmDelete(false) }}
        >
          <Icon name="more-vertical" />
        </button>
        {menuOpen && !confirmDelete && (
          <div className="card-kebab-menu">
            <button onClick={() => { closeMenu(); onEdit(destination) }}>
              <Icon name="edit" />
              Modifier
            </button>
            <button className="danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" />
              Supprimer
            </button>
          </div>
        )}
        {menuOpen && confirmDelete && (
          <div className="card-kebab-menu card-delete-confirm">
            <p>Supprimer <strong>{destination.name}</strong> ?</p>
            <div className="confirm-actions">
              <button onClick={closeMenu}>Annuler</button>
              <button className="danger" onClick={() => onDelete(destination.name)}>Confirmer</button>
            </div>
          </div>
        )}
      </div>
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      />
      <div className="destination-title-row">
        {destination.tier && <span className={`tier-orb tier-${destination.tier.toLowerCase()}`}>{destination.tier}</span>}
        <div>
          <h2>{destination.name}, {destination.country}</h2>
          {destination.intent && (
            <span className="intent-pill">{destination.intent}</span>
          )}
        </div>
        <button
          className={`coup-de-coeur-button${coupDeCoeur ? ' is-active' : ''}`}
          aria-label={coupDeCoeur ? 'Retirer le coup de cœur' : coupDeCoeurDisabled ? 'Limite atteinte (2/2)' : `Coup de cœur · ${coupDeCoeurCount}/2 utilisé`}
          title={coupDeCoeur ? 'Coup de cœur · retirer' : coupDeCoeurDisabled ? '2 coups de cœur déjà utilisés' : `Coup de cœur · ${coupDeCoeurCount}/2 utilisé`}
          disabled={coupDeCoeurDisabled}
          onClick={onCoupDeCoeur}
        >
          <Icon name="heart" />
        </button>
      </div>
      <p>{destination.summary}</p>
      <h3>Notes par critere</h3>
      <div className="criteria-list">
        {criteria.map(([label, value, icon]) => (
          <div className="criterion" key={label}>
            <Icon name={icon} />
            <span>{label}</span>
            <strong>{Number(value).toFixed(1).replace('.', ',')}</strong>
          </div>
        ))}
      </div>
      <button className="map-button" onClick={onFocus}>
        <Icon name="map" />
        Voir sur la carte
      </button>
    </aside>
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
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7l1.1 1.1L12 21l7.7-7.6 1.1-1.1a5.4 5.4 0 0 0 0-7.7Z" />,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15" /><path d="M15 6v15" /></>,
    utensils: <><path d="M4 3v7" /><path d="M8 3v7" /><path d="M4 7h4" /><path d="M6 10v11" /><path d="M18 3c-2.4 2.1-3.3 4.8-2.6 8H18v10" /></>,
    martini: <><path d="M8 3h8l-4 7Z" /><path d="M12 10v8" /><path d="M8 21h8" /></>,
    temple: <><path d="M3 21h18" /><path d="M4 10h16" /><path d="m12 3 8 5H4Z" /><path d="M6 10v11" /><path d="M10 10v11" /><path d="M14 10v11" /><path d="M18 10v11" /></>,
    mountain: <><path d="m3 20 7-13 4 7 2-3 5 9Z" /><path d="m10 7 2 4 2-3" /></>,
    plane: <><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" /></>,
    coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
    'more-vertical': <><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
  }

  return <svg {...common}>{paths[name] ?? paths.map}</svg>
}
