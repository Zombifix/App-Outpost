import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Destination, Intent, Tier } from '../types'

interface DbDestinationRow {
  id: string
  user_id: string
  name: string
  country: string
  lat: number
  lng: number
  tier: string | null
  kind: string | null
  intent: string | null
  food: number
  night: number
  culture: number
  nature: number
  value: number
  score: number | null
  coup_de_coeur: boolean | null
  summary: string | null
  image: string | null
  trip_name: string | null
}

function rowToDestination(row: DbDestinationRow): Destination {
  return {
    name: row.name,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
    tier: (row.tier ?? undefined) as Tier | undefined,
    kind: (row.kind ?? 'place') as Destination['kind'],
    intent: (row.intent ?? 'tourisme') as Intent,
    food: row.food,
    night: row.night,
    culture: row.culture,
    nature: row.nature,
    value: row.value,
    score: row.score ?? undefined,
    coupDeCoeur: row.coup_de_coeur ?? undefined,
    summary: row.summary ?? undefined,
    image: row.image ?? undefined,
    tripName: row.trip_name ?? undefined,
  }
}

/**
 * Charge les destinations d'un ami (RLS autorise la lecture si amitié acceptée).
 * Renvoie [] si non configuré ou sans ami sélectionné.
 */
export function useFriendDestinations(friendUserId: string | null) {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase || !friendUserId) {
      setDestinations([])
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('destinations')
      .select('id, user_id, name, country, lat, lng, tier, kind, intent, food, night, culture, nature, value, score, coup_de_coeur, summary, image, trip_name')
      .eq('user_id', friendUserId)
      .limit(200)
    if (err) {
      setError(err.message)
      setDestinations([])
    } else {
      setError(null)
      setDestinations((data as DbDestinationRow[]).map(rowToDestination))
    }
    setLoading(false)
  }, [friendUserId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { destinations, loading, error, refresh }
}
