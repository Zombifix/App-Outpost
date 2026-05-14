import { useEffect, useMemo, useState } from 'react'
import type { Destination } from './types'
import { DESTINATIONS } from './data'
import WorldMap from './components/WorldMap'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'

const STORAGE_KEY = 'triptier-destinations-v2'

function loadDestinations(): Destination[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as Destination[]
  } catch {
    /* ignore */
  }
  return DESTINATIONS
}

export default function App() {
  const [destinations, setDestinations] = useState<Destination[]>(loadDestinations)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>('Kyoto')
  const [favoriteNames, setFavoriteNames] = useState<Set<string>>(() => new Set(['Kyoto']))
  const [filterTop, setFilterTop] = useState(false)
  const [sortByScore, setSortByScore] = useState(false)
  const [manageMode, setManageMode] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
    } catch {
      /* ignore */
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

  const toggleFavorite = (name: string) => {
    setFavoriteNames(previous => {
      const next = new Set(previous)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const createFreshList = () => {
    setDestinations(DESTINATIONS)
    setSelectedName('Kyoto')
    setFilterTop(false)
    setSortByScore(false)
    setManageMode(true)
  }

  return (
    <div className="travel-app">
      <WorldMap
        destinations={visibleDestinations}
        flyTarget={flyTarget}
        selectedName={selected?.name}
        onSelect={selectByName}
        onFlyTargetConsumed={() => setFlyTarget(null)}
      />
      <Nav
        totalDestinations={visibleDestinations.length}
        filterTop={filterTop}
        sortByScore={sortByScore}
        onCreate={createFreshList}
        onFilterToggle={() => setFilterTop(value => !value)}
        onSortToggle={() => setSortByScore(value => !value)}
        onSearch={selectByName}
        destinations={destinations}
      />
      {selected && (
        <DestinationCard
          destination={selected}
          favorite={favoriteNames.has(selected.name)}
          onClose={() => setSelectedName(null)}
          onFocus={focusSelected}
          onFavorite={() => toggleFavorite(selected.name)}
        />
      )}
      <TierListPanel
        destinations={visibleDestinations}
        manageMode={manageMode}
        onManageToggle={() => setManageMode(value => !value)}
        onFlyTo={selectByName}
      />
    </div>
  )
}

interface DestinationCardProps {
  destination: Destination
  favorite: boolean
  onClose: () => void
  onFocus: () => void
  onFavorite: () => void
}

function DestinationCard({ destination, favorite, onClose, onFocus, onFavorite }: DestinationCardProps) {
  const criteria = [
    ['Gastronomie', destination.food, 'utensils'],
    ['Sorties & Vie nocturne', destination.night, 'martini'],
    ['Culture & Histoire', destination.culture, 'temple'],
    ['Nature & Paysages', destination.nature, 'mountain'],
    ['Accessibilite', Math.max(1, Math.round((destination.value + destination.nature) / 2)), 'plane'],
    ['Rapport qualite/prix', destination.value, 'coins'],
  ] as const

  return (
    <aside className="destination-card" aria-label={`Detail de ${destination.name}`}>
      <button className="floating-close" aria-label="Fermer le detail" onClick={onClose}>
        <Icon name="x" />
      </button>
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      />
      <div className="destination-title-row">
        <span className={`tier-orb tier-${destination.tier.toLowerCase()}`}>{destination.tier}</span>
        <div>
          <h2>{destination.name}, {destination.country}</h2>
          <div className="rating-line">
            <span className="star">*</span>
            <strong>{(destination.score ?? 4).toFixed(1).replace('.', ',')}</strong>
            <span />
            <span>{destination.notes ?? 12} notes</span>
          </div>
        </div>
        <button
          className={`heart-button ${favorite ? 'is-favorite' : ''}`}
          aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={onFavorite}
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
  }

  return <svg {...common}>{paths[name] ?? paths.map}</svg>
}
