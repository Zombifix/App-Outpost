import type { Destination, RoadTripStop } from '../types'

export interface DestinationImageResult {
  image: string
  imageProvider: NonNullable<Destination['imageProvider']>
  imageAuthor?: string
  imageSourceUrl?: string
  imageQuery: string
}

interface ResolveDestinationImageInput {
  name: string
  country: string
  kind?: Destination['kind']
  stops?: RoadTripStop[]
  fallbackImage: string
}

interface PexelsPhoto {
  id: number
  url: string
  width: number
  height: number
  photographer: string
  photographer_url: string
  alt?: string
  src: {
    large2x?: string
    large?: string
    landscape?: string
    original?: string
  }
}

interface WikimediaPage {
  title?: string
  imageinfo?: Array<{
    thumburl?: string
    url?: string
    width?: number
    height?: number
    mime?: string
    extmetadata?: {
      Artist?: { value?: string }
      Credit?: { value?: string }
      LicenseShortName?: { value?: string }
    }
    descriptionshorturl?: string
    descriptionurl?: string
  }>
}

interface WikipediaPage {
  title?: string
  fullurl?: string
  thumbnail?: {
    source?: string
    width?: number
    height?: number
  }
  pageimage?: string
}

const CACHE_KEY = 'outpost-destination-image-cache-v2'
const CACHE_LIMIT = 180
const MIN_LANDSCAPE_RATIO = 1.15
const TRAVEL_KEYWORDS = [
  'landscape',
  'cityscape',
  'coast',
  'mountain',
  'old town',
  'road',
  'skyline',
  'architecture',
  'nature',
  'beach',
  'desert',
  'forest',
  'cliff',
]
const GENERIC_KEYWORDS = [
  'airport',
  'airplane',
  'plane',
  'passport',
  'luggage',
  'suitcase',
  'ticket',
  'map',
  'person',
  'people',
  'woman',
  'man',
  'portrait',
]

function getPexelsKey(): string {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  return meta.env?.VITE_PEXELS_API_KEY?.trim() ?? ''
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function stripHtml(value?: string): string | undefined {
  if (!value) return undefined
  const node = document.createElement('div')
  node.innerHTML = value
  return node.textContent?.replace(/\s+/g, ' ').trim() || undefined
}

function readCache(): Record<string, DestinationImageResult> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(key: string, result: DestinationImageResult) {
  try {
    const cache = readCache()
    const next = { [key]: result, ...cache }
    const trimmed = Object.fromEntries(Object.entries(next).slice(0, CACHE_LIMIT))
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed))
  } catch {
    /* cache is optional */
  }
}

function buildQueries(input: ResolveDestinationImageInput): string[] {
  const nameCountry = [input.name, input.country].filter(Boolean).join(' ')
  const isZone = input.kind === 'zone'
  const queries = isZone
    ? [
        `${nameCountry} landscape road trip`,
        `${nameCountry} scenic nature`,
        `${nameCountry} travel landscape`,
      ]
    : [
        `${nameCountry} travel landmark`,
        `${nameCountry} city view`,
        `${nameCountry} architecture landscape`,
      ]

  const validStops = input.stops?.filter(stop => stop.name.trim()).slice(0, 2) ?? []
  if (isZone && validStops.length >= 2) {
    queries.splice(1, 0, `${validStops.map(stop => stop.name).join(' ')} road trip`)
  } else if (isZone && validStops.length === 1) {
    queries.splice(1, 0, `${validStops[0].name} ${input.country} road trip`)
  }

  return Array.from(new Set(queries.map(query => query.replace(/\s+/g, ' ').trim())))
}

function textScore(text: string): number {
  const normalized = text.toLowerCase()
  const positive = TRAVEL_KEYWORDS.reduce((score, word) => score + (normalized.includes(word) ? 2 : 0), 0)
  const negative = GENERIC_KEYWORDS.reduce((score, word) => score + (normalized.includes(word) ? 3 : 0), 0)
  return positive - negative
}

function scorePexelsPhoto(photo: PexelsPhoto): number {
  const ratio = photo.width / Math.max(photo.height, 1)
  const landscapeScore = ratio >= MIN_LANDSCAPE_RATIO ? 8 : -12
  const resolutionScore = Math.min(photo.width / 400, 6)
  return landscapeScore + resolutionScore + textScore(`${photo.alt ?? ''} ${photo.url}`)
}

async function searchPexels(query: string): Promise<DestinationImageResult | null> {
  const key = getPexelsKey()
  if (!key) return null

  const url = new URL('https://api.pexels.com/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', 'landscape')
  url.searchParams.set('per_page', '12')
  url.searchParams.set('locale', 'en-US')

  const response = await fetch(url, { headers: { Authorization: key } })
  if (!response.ok) return null

  const data = await response.json() as { photos?: PexelsPhoto[] }
  const photo = (data.photos ?? [])
    .filter(item => item.width > item.height)
    .sort((a, b) => scorePexelsPhoto(b) - scorePexelsPhoto(a))[0]

  const image = photo?.src.large2x ?? photo?.src.large ?? photo?.src.landscape
  if (!photo || !image) return null

  return {
    image,
    imageProvider: 'pexels',
    imageAuthor: photo.photographer,
    imageSourceUrl: photo.url,
    imageQuery: query,
  }
}

function pageImageIsUsable(page: WikipediaPage): boolean {
  const width = page.thumbnail?.width ?? 0
  const height = page.thumbnail?.height ?? 1
  const imageName = `${page.pageimage ?? ''} ${page.thumbnail?.source ?? ''}`.toLowerCase()
  const blockedImage = ['flag', 'coat_of_arms', 'seal', 'map', 'location'].some(word => imageName.includes(word))
  return Boolean(page.thumbnail?.source)
    && width >= height * 1.05
    && !blockedImage
}

async function searchWikipediaExactImage(name: string): Promise<DestinationImageResult | null> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('titles', name)
  url.searchParams.set('redirects', '1')
  url.searchParams.set('prop', 'pageimages|info')
  url.searchParams.set('inprop', 'url')
  url.searchParams.set('pithumbsize', '1200')

  const response = await fetch(url)
  if (!response.ok) return null

  const data = await response.json() as { query?: { pages?: Record<string, WikipediaPage> } }
  const page = Object.values(data.query?.pages ?? {}).find(pageImageIsUsable)
  if (!page?.thumbnail?.source) return null

  return {
    image: page.thumbnail.source,
    imageProvider: 'wikipedia',
    imageSourceUrl: page.fullurl,
    imageQuery: name,
  }
}

async function searchWikipediaSearchImage(query: string): Promise<DestinationImageResult | null> {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrlimit', '5')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('prop', 'pageimages|info')
  url.searchParams.set('inprop', 'url')
  url.searchParams.set('pithumbsize', '1200')

  const response = await fetch(url)
  if (!response.ok) return null

  const data = await response.json() as { query?: { pages?: Record<string, WikipediaPage> } }
  const page = Object.values(data.query?.pages ?? {})
    .filter(pageImageIsUsable)
    .sort((a, b) => textScore(`${b.title ?? ''} ${b.pageimage ?? ''}`) - textScore(`${a.title ?? ''} ${a.pageimage ?? ''}`))[0]

  if (!page?.thumbnail?.source) return null

  return {
    image: page.thumbnail.source,
    imageProvider: 'wikipedia',
    imageSourceUrl: page.fullurl,
    imageQuery: query,
  }
}

async function searchWikipediaImage(input: ResolveDestinationImageInput): Promise<DestinationImageResult | null> {
  const names = [
    input.name,
    [input.name, input.country].filter(Boolean).join(' '),
  ].filter(Boolean)

  for (const name of Array.from(new Set(names))) {
    try {
      const exact = await searchWikipediaExactImage(name)
      if (exact) return exact
    } catch {
      /* try search */
    }
  }

  for (const query of buildQueries(input)) {
    try {
      const searched = await searchWikipediaSearchImage(query)
      if (searched) return searched
    } catch {
      /* try next query */
    }
  }

  return null
}

function scoreWikimediaPage(page: WikimediaPage): number {
  const info = page.imageinfo?.[0]
  const width = info?.width ?? 0
  const height = info?.height ?? 1
  const ratio = width / height
  const landscapeScore = ratio >= MIN_LANDSCAPE_RATIO ? 8 : -12
  const titleScore = textScore(page.title ?? '')
  const resolutionScore = Math.min(width / 350, 5)
  return landscapeScore + titleScore + resolutionScore
}

async function searchWikimedia(query: string): Promise<DestinationImageResult | null> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', '12')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata')
  url.searchParams.set('iiurlwidth', '1200')

  const response = await fetch(url)
  if (!response.ok) return null

  const data = await response.json() as { query?: { pages?: Record<string, WikimediaPage> } }
  const page = Object.values(data.query?.pages ?? {})
    .filter(item => {
      const info = item.imageinfo?.[0]
      const mime = info?.mime ?? ''
      const isPhotoFormat = ['image/jpeg', 'image/png', 'image/webp'].includes(mime)
      return Boolean(info?.thumburl || info?.url)
        && isPhotoFormat
        && (info?.width ?? 0) > (info?.height ?? 0)
    })
    .sort((a, b) => scoreWikimediaPage(b) - scoreWikimediaPage(a))[0]

  const info = page?.imageinfo?.[0]
  const image = info?.thumburl ?? info?.url
  if (!page || !image) return null

  return {
    image,
    imageProvider: 'wikimedia',
    imageAuthor: stripHtml(info.extmetadata?.Artist?.value) ?? stripHtml(info.extmetadata?.Credit?.value),
    imageSourceUrl: info.descriptionurl ?? info.descriptionshorturl,
    imageQuery: query,
  }
}

export async function resolveDestinationImage(input: ResolveDestinationImageInput): Promise<DestinationImageResult> {
  const cacheKey = normalizeKey([
    input.kind ?? 'place',
    input.name,
    input.country,
    input.stops?.map(stop => stop.name).join(',') ?? '',
  ].join('|'))
  const cached = readCache()[cacheKey]
  if (cached?.image) return cached

  for (const query of buildQueries(input)) {
    try {
      const pexels = await searchPexels(query)
      if (pexels) {
        writeCache(cacheKey, pexels)
        return pexels
      }
    } catch {
      /* try the next query */
    }
  }

  try {
    const wikipedia = await searchWikipediaImage(input)
    if (wikipedia) {
      writeCache(cacheKey, wikipedia)
      return wikipedia
    }
  } catch {
    /* try Commons */
  }

  for (const query of buildQueries(input)) {
    try {
      const wikimedia = await searchWikimedia(query)
      if (wikimedia) {
        writeCache(cacheKey, wikimedia)
        return wikimedia
      }
    } catch {
      /* try the next query */
    }
  }

  const fallback = {
    image: input.fallbackImage,
    imageProvider: 'fallback',
    imageQuery: buildQueries(input)[0] ?? input.name,
  } satisfies DestinationImageResult
  writeCache(cacheKey, fallback)
  return fallback
}
