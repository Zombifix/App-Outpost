import { useState } from 'react'
import type { Destination, NewDestinationForm } from './types'
import { DESTINATIONS, FRIENDS, FEED } from './data'
import { calculateTier } from './utils'
import WorldMap from './components/WorldMap'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'
import AddPanel from './components/AddPanel'
import FriendsPanel from './components/FriendsPanel'
import ActivityFeed from './components/ActivityFeed'

export default function App() {
  const [destinations, setDestinations] = useState<Destination[]>(DESTINATIONS)
  const [flyTarget, setFlyTarget] = useState<string | null>(null)

  const handleAdd = (form: NewDestinationForm, coords: { lat: number; lng: number }) => {
    const tier = calculateTier(
      { food: form.food, night: form.night, culture: form.culture, nature: form.nature, value: form.value },
      form.intent,
    )
    const newDest: Destination = {
      name: form.name,
      country: '📍',
      lat: coords.lat,
      lng: coords.lng,
      tier,
      food: form.food,
      night: form.night,
      culture: form.culture,
      nature: form.nature,
      value: form.value,
      intent: form.intent,
    }
    setDestinations(prev => [...prev, newDest])
    setFlyTarget(form.name)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WorldMap
        destinations={destinations}
        flyTarget={flyTarget}
        onFlyTargetConsumed={() => setFlyTarget(null)}
      />
      <Nav />
      <TierListPanel destinations={destinations} onFlyTo={name => setFlyTarget(name)} />
      <AddPanel onAdd={handleAdd} />
      <FriendsPanel friends={FRIENDS} />
      <ActivityFeed feed={FEED} friends={FRIENDS} />
    </div>
  )
}
