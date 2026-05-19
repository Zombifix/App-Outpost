import { useCallback, useEffect, useRef, useState } from 'react'
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

const FRIEND_DESTINATIONS_CACHE_TTL_MS = 60_000
const friendDestinationsCache = new Map<string, { data: Destination[]; fetchedAt: number }>()
const friendDestinationsInFlight = new Map<string, Promise<Destination[]>>()

function getFreshCachedFriendDestinations(friendUserId: string) {
  const cached = friendDestinationsCache.get(friendUserId)
  if (!cached) return null
  if (Date.now() - cached.fetchedAt > FRIEND_DESTINATIONS_CACHE_TTL_MS) return null
  return cached.data
}

async function loadFriendDestinations(friendUserId: string, force = false): Promise<Destination[]> {
  const cached = force ? null : getFreshCachedFriendDestinations(friendUserId)
  if (cached) return cached

  const existingRequest = force ? undefined : friendDestinationsInFlight.get(friendUserId)
  if (existingRequest) return existingRequest

  if (!supabase) return []

  const request = supabase
    .from('destinations')
    .select('id, user_id, name, country, lat, lng, tier, kind, intent, food, night, culture, nature, value, score, coup_de_coeur, summary, image, trip_name')
    .eq('user_id', friendUserId)
    .limit(200)
    .then(({ data, error: err }) => {
      if (err) throw err
      const destinations = (data as DbDestinationRow[]).map(rowToDestination)
      friendDestinationsCache.set(friendUserId, { data: destinations, fetchedAt: Date.now() })
      return destinations
    })
    .finally(() => {
      if (friendDestinationsInFlight.get(friendUserId) === request) {
        friendDestinationsInFlight.delete(friendUserId)
      }
    })

  friendDestinationsInFlight.set(friendUserId, request)
  return request
}

export function invalidateFriendDestinations(friendUserId?: string) {
  if (friendUserId) {
    friendDestinationsCache.delete(friendUserId)
    return
  }
  friendDestinationsCache.clear()
}

/**
 * Charge les destinations d'un ami (RLS autorise la lecture si amitié acceptée).
 * Renvoie [] si non configuré ou sans ami sélectionné.
 */
export function useFriendDestinations(friendUserId: string | null) {
  const [destinations, setDestinations] = useState<Destination[]>(() => friendUserId ? getFreshCachedFriendDestinations(friendUserId) ?? [] : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const requestId = ++requestIdRef.current
    if (!supabase || !friendUserId) {
      setDestinations([])
      setLoading(false)
      setError(null)
      return
    }
    const cached = options?.force ? null : getFreshCachedFriendDestinations(friendUserId)
    if (cached) {
      setDestinations(cached)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const nextDestinations = await loadFriendDestinations(friendUserId, options?.force)
      if (requestIdRef.current !== requestId) return
      setError(null)
      setDestinations(nextDestinations)
    } catch (err) {
      if (requestIdRef.current !== requestId) return
      setError(err instanceof Error ? err.message : 'Impossible de charger les destinations')
      setDestinations([])
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [friendUserId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { destinations, loading, error, refresh }
}
