import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Destination } from '../types'
import { getDestinationImagesForDestinations } from '../services/imageSearch'
import {
  DESTINATION_SELECT_COLUMNS,
  rowToDestination,
  type DbDestinationRow,
} from '../lib/destinationMapper'
import { withRecalculatedScore } from '../utils'

const FRIEND_DESTINATIONS_CACHE_TTL_MS = 60_000
const MAX_FRIEND_DESTINATIONS = 200
const AUTO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
const friendDestinationsCache = new Map<string, { data: Destination[]; fetchedAt: number }>()
const friendDestinationsInFlight = new Map<string, Promise<Destination[]>>()

function needsCatalogImage(destination: Destination) {
  return !destination.destinationKey || !destination.image || destination.imageProvider === 'fallback'
}

async function hydrateCatalogImages(destinations: Destination[]): Promise<Destination[]> {
  const targets = destinations.filter(needsCatalogImage)
  if (!targets.length) return destinations
  const results = await getDestinationImagesForDestinations(targets, AUTO_IMAGE_FALLBACK)
  if (!results.length) return destinations
  return destinations.map(destination => {
    const result = results.find(item => item.name === destination.name)
    if (!result) return destination
    return {
      ...destination,
      destinationKey: result.imageResult.destinationKey,
      image: result.imageResult.image,
      imageProvider: result.imageResult.imageProvider,
      imageAuthor: result.imageResult.imageAuthor,
      imageSourceUrl: result.imageResult.imageSourceUrl,
      imageQuery: result.imageResult.imageQuery,
    }
  })
}

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

  // Promise.resolve(...) garantit qu'on obtient un Promise complet (et non un
  // PromiseLike retourné par le query builder Supabase), ce qui permet d'utiliser
  // `.finally` pour le cleanup du registre in-flight.
  const request = Promise.resolve(
    supabase
      .from('destinations')
      .select(DESTINATION_SELECT_COLUMNS)
      .eq('user_id', friendUserId)
      .limit(MAX_FRIEND_DESTINATIONS)
  )
    .then(({ data, error: err }) => {
      if (err) throw err
      const destinations = (data as DbDestinationRow[]).map(rowToDestination).map(withRecalculatedScore)
      return hydrateCatalogImages(destinations)
    })
    .then(destinations => {
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
