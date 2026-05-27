import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Destination, MapVisibility } from '../types'
import { getDestinationImagesForDestinations } from '../services/imageSearch'
import {
  rowToDestination,
  type DbDestinationRow,
} from '../lib/destinationMapper'
import { withRecalculatedScore } from '../utils'
import { needsZoneGeometryRepair, repairZoneDestinationGeometry } from '../lib/zoneGeometry'

const FRIEND_DESTINATIONS_CACHE_TTL_MS = 60_000
const MAX_FRIEND_DESTINATIONS = 200
const AUTO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
const friendDestinationsCache = new Map<string, { data: Destination[]; fetchedAt: number }>()
const friendDestinationsInFlight = new Map<string, Promise<Destination[]>>()

interface MapAccessRow {
  allowed: boolean
  visibility: MapVisibility
  reason: 'private' | 'friends_only' | null
  is_owner: boolean
  is_friend: boolean
}

export interface FriendMapAccess {
  allowed: boolean
  visibility: MapVisibility
  deniedReason: 'private' | 'friends_only' | null
  isOwner: boolean
  isFriend: boolean
}

const DEFAULT_ACCESS: FriendMapAccess = {
  allowed: false,
  visibility: 'friends',
  deniedReason: null,
  isOwner: false,
  isFriend: false,
}

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

async function repairSuspiciousZones(destinations: Destination[]): Promise<Destination[]> {
  const candidates = destinations.filter(needsZoneGeometryRepair)
  if (!candidates.length) return destinations

  const repairedByName = new Map<string, Destination>()
  for (const destination of candidates) {
    const repaired = await repairZoneDestinationGeometry(destination)
    if (repaired) repairedByName.set(destination.name, repaired)
    await new Promise(resolve => window.setTimeout(resolve, 1200))
  }

  if (!repairedByName.size) return destinations
  return destinations.map(destination => repairedByName.get(destination.name) ?? destination)
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
      .rpc('get_public_destinations', { target_user_id: friendUserId })
  )
    .then(({ data, error: err }) => {
      if (err) throw err
      const destinations = (data as DbDestinationRow[]).map(rowToDestination).map(withRecalculatedScore)
      return hydrateCatalogImages(destinations)
    })
    .then(repairSuspiciousZones)
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

async function loadMapAccess(friendUserId: string): Promise<FriendMapAccess> {
  if (!supabase) return DEFAULT_ACCESS
  const { data, error } = await supabase.rpc('get_map_access_context', { target_user_id: friendUserId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] as MapAccessRow | undefined : undefined
  if (!row) return DEFAULT_ACCESS
  return {
    allowed: Boolean(row.allowed),
    visibility: row.visibility ?? 'friends',
    deniedReason: row.reason ?? null,
    isOwner: Boolean(row.is_owner),
    isFriend: Boolean(row.is_friend),
  }
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
  const [access, setAccess] = useState<FriendMapAccess>(DEFAULT_ACCESS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const requestId = ++requestIdRef.current
    if (!supabase || !friendUserId) {
      setDestinations([])
      setAccess(DEFAULT_ACCESS)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const nextAccess = await loadMapAccess(friendUserId)
      if (requestIdRef.current !== requestId) return
      setAccess(nextAccess)
      if (!nextAccess.allowed) {
        setError(null)
        setDestinations([])
        return
      }

      const cached = options?.force ? null : getFreshCachedFriendDestinations(friendUserId)
      if (cached) {
        setDestinations(cached)
        setError(null)
        return
      }

      const nextDestinations = await loadFriendDestinations(friendUserId, options?.force)
      if (requestIdRef.current !== requestId) return
      setError(null)
      setDestinations(nextDestinations)
    } catch (err) {
      if (requestIdRef.current !== requestId) return
      setError(err instanceof Error ? err.message : 'Impossible de charger les destinations')
      setAccess(DEFAULT_ACCESS)
      setDestinations([])
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [friendUserId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { destinations, access, loading, error, refresh }
}
