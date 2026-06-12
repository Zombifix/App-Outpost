import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Destination, Tier } from '../types'
import { destinationCommunityKey } from '../utils/destinationIdentity'
import { FAKE_FRIENDS_MODE, getFakeCommunityRatings, getFakeCommunityLeaderboard } from './_fakeFriends'

export interface CommunityRating {
  key: string
  avgScore: number
  tier: Tier
  ratingCount: number
  topTags: string[]
}

export interface CommunityLeaderboardRow extends CommunityRating {
  displayName: string
  displayCountry: string
  countryCode: string | null
}

interface CommunityRatingRow {
  key: string
  avg_score: number
  tier: string
  rating_count: number
  top_tags: string[] | null
}

interface CommunityLeaderboardDbRow extends CommunityRatingRow {
  display_name: string
  display_country: string
  country_code: string | null
}

const RATINGS_CACHE_TTL_MS = 5 * 60_000
const RATINGS_BATCH_SIZE = 200
export const LEADERBOARD_PAGE_SIZE = 100

// Cache module : `null` = clé interrogée mais sans note communautaire (< 3 votants).
const ratingsCache = new Map<string, { rating: CommunityRating | null; fetchedAt: number }>()
let ratingsInFlight: Promise<void> | null = null

function rowToRating(row: CommunityRatingRow): CommunityRating {
  return {
    key: row.key,
    avgScore: Number(row.avg_score),
    tier: (row.tier as Tier) ?? 'B',
    ratingCount: row.rating_count,
    topTags: row.top_tags ?? [],
  }
}

async function fetchRatings(keys: string[]): Promise<void> {
  if (!supabase || keys.length === 0) return
  for (let i = 0; i < keys.length; i += RATINGS_BATCH_SIZE) {
    const chunk = keys.slice(i, i + RATINGS_BATCH_SIZE)
    const { data, error } = await supabase.rpc('get_community_ratings', { keys: chunk })
    if (error) throw error
    const found = new Map<string, CommunityRating>(
      ((data ?? []) as CommunityRatingRow[]).map(row => [row.key, rowToRating(row)])
    )
    const fetchedAt = Date.now()
    for (const key of chunk) {
      ratingsCache.set(key, { rating: found.get(key) ?? null, fetchedAt })
    }
  }
}

/**
 * Notes communautaires pour les destinations passées (badges 👥).
 * Renvoie une Map clé → note ; une destination absente de la Map n'a pas
 * (encore) de note du peuple (< 3 votants).
 */
export function useCommunityRatings(destinations: Destination[]): {
  ratings: Map<string, CommunityRating>
  loading: boolean
} {
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(false)

  // Signature stable : les appelants recalculent souvent leur tableau de
  // destinations à chaque render — on ne veut relancer l'effet que si les
  // CLÉS changent réellement.
  const keysSignature = useMemo(() => {
    const unique = new Set<string>()
    for (const destination of destinations) {
      if (destination.kind === 'stop' || destination.kind === 'stage') continue
      unique.add(destinationCommunityKey(destination))
    }
    return [...unique].sort().join('\n')
  }, [destinations])
  const keys = useMemo(
    () => keysSignature ? keysSignature.split('\n') : [],
    [keysSignature]
  )

  useEffect(() => {
    if (FAKE_FRIENDS_MODE) return
    const now = Date.now()
    const missing = keys.filter(key => {
      const cached = ratingsCache.get(key)
      return !cached || now - cached.fetchedAt > RATINGS_CACHE_TTL_MS
    })
    if (missing.length === 0) return

    let cancelled = false
    setLoading(true)
    // Sérialise derrière la requête en cours pour éviter les doubles fetchs
    // quand plusieurs composants montent en même temps.
    const run = (ratingsInFlight ?? Promise.resolve())
      .then(() => {
        const stillMissing = missing.filter(key => {
          const cached = ratingsCache.get(key)
          return !cached || Date.now() - cached.fetchedAt > RATINGS_CACHE_TTL_MS
        })
        return fetchRatings(stillMissing)
      })
      .catch(() => { /* silencieux : le badge est un bonus, pas un bloquant */ })
      .then(() => {
        if (!cancelled) {
          setVersion(value => value + 1)
          setLoading(false)
        }
      })
    ratingsInFlight = run
    return () => { cancelled = true }
  }, [keys])

  const ratings = useMemo(() => {
    const map = new Map<string, CommunityRating>()
    if (FAKE_FRIENDS_MODE) {
      for (const rating of getFakeCommunityRatings()) {
        if (keys.includes(rating.key)) map.set(rating.key, rating)
      }
      return map
    }
    for (const key of keys) {
      const cached = ratingsCache.get(key)
      if (cached?.rating) map.set(key, cached.rating)
    }
    return map
    // `version` force la relecture du cache après un fetch.
  }, [keys, version])

  return { ratings, loading }
}

/**
 * Classement global paginé avec recherche (onglet "Classement global").
 */
export function useCommunityLeaderboard(search: string): {
  rows: CommunityLeaderboardRow[]
  loading: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void
} {
  const [rows, setRows] = useState<CommunityLeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const requestIdRef = useRef(0)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  useEffect(() => {
    setRows([])
    setOffset(0)
  }, [debouncedSearch])

  useEffect(() => {
    const requestId = ++requestIdRef.current

    if (FAKE_FRIENDS_MODE) {
      const all = getFakeCommunityLeaderboard(debouncedSearch)
      setRows(all.slice(0, offset + LEADERBOARD_PAGE_SIZE))
      setHasMore(all.length > offset + LEADERBOARD_PAGE_SIZE)
      setLoading(false)
      setError(null)
      return
    }

    if (!supabase) {
      setRows([])
      setHasMore(false)
      return
    }

    setLoading(true)
    void Promise.resolve(
      supabase.rpc('get_community_leaderboard', {
        search: debouncedSearch || null,
        max_rows: LEADERBOARD_PAGE_SIZE,
        offset_rows: offset,
      })
    )
      .then(({ data, error: err }) => {
        if (requestIdRef.current !== requestId) return
        if (err) throw err
        const page = ((data ?? []) as CommunityLeaderboardDbRow[]).map(row => ({
          ...rowToRating(row),
          displayName: row.display_name,
          displayCountry: row.display_country,
          countryCode: row.country_code,
        }))
        setRows(prev => offset === 0 ? page : [...prev, ...page])
        setHasMore(page.length === LEADERBOARD_PAGE_SIZE)
        setError(null)
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Impossible de charger le classement')
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false)
      })
  }, [debouncedSearch, offset])

  return {
    rows,
    loading,
    hasMore,
    error,
    loadMore: () => setOffset(value => value + LEADERBOARD_PAGE_SIZE),
  }
}

/** Nombre de destinations à un avis du seuil — alimente l'empty state. */
export function useCommunityTeaserCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (FAKE_FRIENDS_MODE) {
      setCount(4)
      return
    }
    if (!supabase) return
    let cancelled = false
    void Promise.resolve(supabase.rpc('get_community_teaser_count'))
      .then(({ data, error }) => {
        if (cancelled || error) return
        setCount(typeof data === 'number' ? data : null)
      })
    return () => { cancelled = true }
  }, [enabled])

  return count
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
