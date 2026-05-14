import { useEffect, useMemo, useState } from 'react'
import type { Destination } from './types'
import { DESTINATIONS } from './data'
import WorldMap from './components/WorldMap'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'

const STORAGE_KEY = 'outpost-destinations'

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
  const [selectedName, setSelectedName] = useState('Kyoto')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
    } catch {
      /* ignore */
    }
  }, [destinations])

  const selected = useMemo(
    () => destinations.find(destination => destination.name === selectedName) ?? destinations[0],
    [destinations, selectedName],
  )

  const selectByName = (name: string) => {
    const destination = destinations.find(item => item.name === name)
    if (!destination) return
    setSelectedName(destination.name)
    setFlyTarget({ lat: destination.lat, lng: destination.lng, name: destination.name })
  }

  return (
    <div className="travel-app">
      <WorldMap
        destinations={destinations}
        flyTarget={flyTarget}
        selectedName={selected?.name}
        onSelect={selectByName}
        onFlyTargetConsumed={() => setFlyTarget(null)}
      />
      <Nav totalDestinations={destinations.length} />
      {selected && <DestinationCard destination={selected} />}
      <TierListPanel destinations={destinations} onFlyTo={selectByName} />
    </div>
  )
}

function DestinationCard({ destination }: { destination: Destination }) {
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
      <button className="floating-close" aria-label="Fermer le detail">
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
            <span className="star">★</span>
            <strong>{(destination.score ?? 4).toFixed(1).replace('.', ',')}</strong>
            <span />
            <span>{destination.notes ?? 12} notes</span>
          </div>
        </div>
        <button className="heart-button" aria-label="Ajouter aux favoris">
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
      <button className="map-button">
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
