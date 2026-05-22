import type { Destination, DestinationImageSource, RoadTripStop } from '../types'
import { supabase } from '../lib/supabase'
import { buildDestinationKey } from '../utils/destinationKey'

export interface DestinationImageResult {
  destinationKey: string
  image: string
  imageProvider: DestinationImageSource
  imageAuthor?: string
  imageSourceUrl?: string
  imageQuery: string
  providerImageId?: string
  photographerUrl?: string
  alt?: string
  width?: number
  height?: number
  score?: number
  status?: 'active' | 'resolving' | 'failed' | 'disabled'
  isManualOverride?: boolean
  lastValidatedAt?: string
}

export interface ResolveDestinationImageInput {
  destinationKey?: string
  name: string
  country: string
  state?: string
  kind?: Destination['kind']
  lat?: number
  lng?: number
  osmValue?: string
  osmId?: number
  osmType?: Destination['osmType']
  countryCode?: string
  stops?: RoadTripStop[]
  fallbackImage: string
}

interface DestinationImageFunctionResponse {
  destinationKey?: string
  imageUrl?: string
  imageSource?: DestinationImageSource
  providerImageId?: string
  photographerName?: string
  photographerUrl?: string
  sourceUrl?: string
  alt?: string
  width?: number
  height?: number
  score?: number
  status?: DestinationImageResult['status']
  isManualOverride?: boolean
  lastValidatedAt?: string
  imageQuery?: string
}

const CACHE_KEY = 'outpost-destination-image-catalog-v2'
const CACHE_TTL_MS = 5 * 60_000
const CACHE_LIMIT = 240
const memoryCache = new Map<string, { value: DestinationImageResult; cachedAt: number }>()

function readLocalCache(): Record<string, { value: DestinationImageResult; cachedAt: number }> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getCached(destinationKey: string): DestinationImageResult | null {
  const now = Date.now()
  const memory = memoryCache.get(destinationKey)
  if (memory && now - memory.cachedAt <= CACHE_TTL_MS) return memory.value

  const local = readLocalCache()[destinationKey]
  if (local && now - local.cachedAt <= CACHE_TTL_MS) {
    memoryCache.set(destinationKey, local)
    return local.value
  }
  return null
}

function writeCache(destinationKey: string, value: DestinationImageResult) {
  const entry = { value, cachedAt: Date.now() }
  memoryCache.set(destinationKey, entry)
  try {
    const cache = readLocalCache()
    const next = { [destinationKey]: entry, ...cache }
    const trimmed = Object.fromEntries(Object.entries(next).slice(0, CACHE_LIMIT))
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed))
  } catch {
    /* optional cache */
  }
}

function fallbackResult(input: ResolveDestinationImageInput, destinationKey: string): DestinationImageResult {
  return {
    destinationKey,
    image: input.fallbackImage,
    imageProvider: 'fallback',
    imageQuery: [input.name, input.country].filter(Boolean).join(' '),
    status: 'failed',
  }
}

function toImageResult(
  payload: DestinationImageFunctionResponse,
  input: ResolveDestinationImageInput,
  destinationKey: string,
): DestinationImageResult | null {
  if (!payload.imageUrl || !payload.imageSource) return null
  return {
    destinationKey: payload.destinationKey ?? destinationKey,
    image: payload.imageUrl,
    imageProvider: payload.imageSource,
    imageAuthor: payload.photographerName,
    imageSourceUrl: payload.sourceUrl,
    imageQuery: payload.imageQuery ?? [input.name, input.country].filter(Boolean).join(' '),
    providerImageId: payload.providerImageId,
    photographerUrl: payload.photographerUrl,
    alt: payload.alt,
    width: payload.width,
    height: payload.height,
    score: payload.score,
    status: payload.status,
    isManualOverride: payload.isManualOverride,
    lastValidatedAt: payload.lastValidatedAt,
  }
}

export async function getDestinationImage(input: ResolveDestinationImageInput): Promise<DestinationImageResult> {
  const destinationKey = input.destinationKey ?? buildDestinationKey(input)
  const cached = getCached(destinationKey)
  if (cached) return cached

  if (!supabase) {
    const fallback = fallbackResult(input, destinationKey)
    writeCache(destinationKey, fallback)
    return fallback
  }

  try {
    const { data, error } = await supabase.functions.invoke<DestinationImageFunctionResponse>(
      'resolve-destination-image',
      { body: { ...input, destinationKey } },
    )
    if (error) throw error
    const result = data ? toImageResult(data, input, destinationKey) : null
    if (result) {
      writeCache(result.destinationKey, result)
      return result
    }
  } catch (err) {
    console.warn('[imageSearch] destination image function failed', err)
  }

  const fallback = fallbackResult(input, destinationKey)
  writeCache(destinationKey, fallback)
  return fallback
}

export async function getDestinationImagesForDestinations(
  destinations: Destination[],
  fallbackImage: string,
): Promise<Array<{ name: string; imageResult: DestinationImageResult }>> {
  const seen = new Set<string>()
  const targets = destinations.filter(destination => {
    const key = destination.destinationKey ?? buildDestinationKey(destination)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const results = await Promise.all(targets.map(async destination => {
    const imageResult = await getDestinationImage({
      destinationKey: destination.destinationKey,
      name: destination.name,
      country: destination.country,
      state: destination.state,
      kind: destination.kind,
      lat: destination.lat,
      lng: destination.lng,
      osmValue: destination.osmValue,
      osmId: destination.osmId,
      osmType: destination.osmType,
      countryCode: destination.countryCode,
      stops: destination.stops,
      fallbackImage: destination.image ?? fallbackImage,
    })
    return { name: destination.name, imageResult }
  }))

  return results
}

export const resolveDestinationImage = getDestinationImage
