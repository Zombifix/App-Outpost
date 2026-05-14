import { useState, useEffect } from 'react'
import type { Destination, Friend, NewDestinationForm } from './types'
import { DESTINATIONS, FRIENDS, FEED } from './data'
import { calculateTier } from './utils'
import WorldMap from './components/WorldMap'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'
import AddPanel from './components/AddPanel'
import FriendsPanel from './components/FriendsPanel'
import ActivityFeed from './components/ActivityFeed'
import CompareView from './components/CompareView'

const STORAGE_KEY = 'outpost-destinations'

function loadDestinations(): Destination[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as Destination[]
  } catch { /* ignore */ }
  return DESTINATIONS
}

export default function App() {
  const [destinations, setDestinations] = useState<Destination[]>(loadDestinations)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [compareFriend, setCompareFriend] = useState<Friend | null>(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations)) } catch { /* ignore */ }
  }, [destinations])

  const handleAdd = (form: NewDestinationForm, coords: { lat: number; lng: number }) => {
    const tier = calculateTier(
      { food: form.food, night: form.night, culture: form.culture, nature: form.nature, value: form.value },
      form.intent,
    )
    const newDest: Destination = {
      name: form.name, country: '📍',
      lat: coords.lat, lng: coords.lng, tier,
      food: form.food, night: form.night, culture: form.culture,
      nature: form.nature, value: form.value, intent: form.intent,
    }
    setDestinations(prev => [...prev, newDest])
    setFlyTarget({ lat: coords.lat, lng: coords.lng, name: form.name })
  }

  const flyTo = (lat: number, lng: number, name: string) => setFlyTarget({ lat, lng, name })

  const flyToByName = (name: string) => {
    const dest = destinations.find(d => d.name === name)
    if (dest) flyTo(dest.lat, dest.lng, dest.name)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WorldMap
        destinations={destinations}
        flyTarget={flyTarget}
        onFlyTargetConsumed={() => setFlyTarget(null)}
      />
      <Nav totalDestinations={destinations.length} />
      <TierListPanel destinations={destinations} onFlyTo={flyToByName} />
      <AddPanel onAdd={handleAdd} />
      <FriendsPanel friends={FRIENDS} onCompare={f => setCompareFriend(f)} />
      <ActivityFeed feed={FEED} friends={FRIENDS} onFlyTo={flyTo} />

      {compareFriend && (
        <CompareView
          friend={compareFriend}
          myDestinations={destinations}
          onClose={() => setCompareFriend(null)}
        />
      )}
    </div>
  )
}
