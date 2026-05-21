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

interface WikipediaSummary {
  title?: string
  content_urls?: {
    desktop?: {
      page?: string
    }
  }
  originalimage?: {
    source?: string
    width?: number
    height?: number
  }
  thumbnail?: {
    source?: string
    width?: number
    height?: number
  }
}

const CACHE_KEY = 'outpost-destination-image-cache-v5'
const CACHE_LIMIT = 180

/**
 * Fetch avec retry exponentiel sur erreurs réseau et 5xx.
 * 429 (rate limit) déclenche aussi un retry.
 * Les 4xx (sauf 429) sont retournés tels quels — pas la peine de retry.
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2
  const baseDelay = opts.baseDelayMs ?? 300
  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, init)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response
      }
      // 5xx ou 429 → retry
      lastError = new Error(`http_${response.status}`)
    } catch (err) {
      lastError = err
    }
    if (attempt < retries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100
      await new Promise(r => setTimeout(r, delay))
    }
  }
  // Plus de retry : on rejette comme une erreur normale pour que le caller catch.
  throw lastError instanceof Error ? lastError : new Error('fetch_failed')
}
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
const SEARCH_ALIASES: Record<string, string> = {
  algerie: 'Algeria',
  algérie: 'Algeria',
  allemagne: 'Germany',
  angleterre: 'England',
  bresil: 'Brazil',
  brésil: 'Brazil',
  chine: 'China',
  coree: 'Korea',
  'coree du sud': 'South Korea',
  'corée du sud': 'South Korea',
  espagne: 'Spain',
  'etats-unis': 'United States',
  'états-unis': 'United States',
  "etats-unis d'amerique": 'United States',
  "états-unis d'amérique": 'United States',
  grece: 'Greece',
  grèce: 'Greece',
  irlande: 'Ireland',
  italie: 'Italy',
  japon: 'Japan',
  maroc: 'Morocco',
  mexique: 'Mexico',
  portugal: 'Portugal',
  thailande: 'Thailand',
  thaïlande: 'Thailand',
  'cote-d-azur': 'French Riviera',
  'cote d azur': 'French Riviera',
}

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

function normalizedWords(value: string): string[] {
  return normalizeKey(value).split('-').filter(word => word.length >= 3)
}

function searchName(value: string): string {
  const normalized = value.trim()
  const key = normalized.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return SEARCH_ALIASES[key] ?? SEARCH_ALIASES[normalized.toLowerCase()] ?? normalized
}

function destinationTitleMatches(title: string | undefined, input: ResolveDestinationImageInput): boolean {
  const titleWords = new Set(normalizedWords(title ?? ''))
  const nameWords = normalizedWords(searchName(input.name))
  return nameWords.some(word => titleWords.has(word))
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
  const name = searchName(input.name)
  const country = searchName(input.country)
  const nameCountry = normalizeKey(name) === normalizeKey(country)
    ? name
    : [name, country].filter(Boolean).join(' ')
  const isZone = input.kind === 'zone'
  const queries = isZone
    ? [
        `${nameCountry} landscape scenic`,
        `${nameCountry} travel landscape`,
        `${name} nature landscape`,
      ]
    : [
        `${nameCountry} travel landmark`,
        `${nameCountry} city view`,
        `${nameCountry} architecture landscape`,
      ]

  const validStops = input.stops?.filter(stop => stop.name.trim()).slice(0, 3) ?? []
  if (isZone && validStops.length >= 1) {
    const stopQueries = validStops.flatMap(stop => [
      `${stop.name} landscape scenic`,
      `${stop.name} ${country} travel`,
    ])
    queries.splice(1, 0, ...stopQueries)
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

  const response = await fetchWithRetry(url, { headers: { Authorization: key } })
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

const BLOCKED_IMAGE_PATTERNS = [
  'flag', 'coat_of_arms', 'seal', 'map', 'location',
  'states', 'regions', 'provinces', 'districts', 'subdivisions',
  'administrative', 'political', 'locator', 'outline', 'blank',
]

function imageNameIsBlocked(imageName: string): boolean {
  const lower = imageName.toLowerCase()
  return BLOCKED_IMAGE_PATTERNS.some(word => lower.includes(word))
}

function pageImageIsUsable(page: WikipediaPage): boolean {
  const width = page.thumbnail?.width ?? 0
  const height = page.thumbnail?.height ?? 1
  const imageName = `${page.pageimage ?? ''} ${page.thumbnail?.source ?? ''}`
  return Boolean(page.thumbnail?.source)
    && width >= height * 0.62
    && !imageNameIsBlocked(imageName)
}

function summaryImageIsUsable(summary: WikipediaSummary): boolean {
  const image = summary.originalimage ?? summary.thumbnail
  const width = image?.width ?? 0
  const height = image?.height ?? 1
  const imageName = image?.source ?? ''
  return Boolean(image?.source)
    && width >= height * 0.62
    && !imageNameIsBlocked(imageName)
}

async function searchWikipediaSummaryImage(name: string): Promise<DestinationImageResult | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}?redirect=true`
  const response = await fetchWithRetry(url)
  if (!response.ok) return null

  const summary = await response.json() as WikipediaSummary
  if (!summaryImageIsUsable(summary)) return null

  const image = summary.originalimage?.source ?? summary.thumbnail?.source
  if (!image) return null

  return {
    image,
    imageProvider: 'wikipedia',
    imageSourceUrl: summary.content_urls?.desktop?.page,
    imageQuery: name,
  }
}

async function searchWikiExactImage(
  host: string,
  provider: NonNullable<Destination['imageProvider']>,
  name: string,
): Promise<DestinationImageResult | null> {
  const url = new URL(`https://${host}/w/api.php`)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('titles', name)
  url.searchParams.set('redirects', '1')
  url.searchParams.set('prop', 'pageimages|info')
  url.searchParams.set('inprop', 'url')
  url.searchParams.set('pithumbsize', '1200')

  const response = await fetchWithRetry(url)
  if (!response.ok) return null

  const data = await response.json() as { query?: { pages?: Record<string, WikipediaPage> } }
  const page = Object.values(data.query?.pages ?? {}).find(pageImageIsUsable)
  if (!page?.thumbnail?.source) return null

  return {
    image: page.thumbnail.source,
    imageProvider: provider,
    imageSourceUrl: page.fullurl,
    imageQuery: name,
  }
}

async function searchWikipediaExactImage(name: string): Promise<DestinationImageResult | null> {
  return searchWikiExactImage('en.wikipedia.org', 'wikipedia', name)
}

async function searchWikivoyageExactImage(name: string): Promise<DestinationImageResult | null> {
  return searchWikiExactImage('en.wikivoyage.org', 'wikivoyage', name)
}

async function searchWikipediaSearchImage(query: string, input: ResolveDestinationImageInput): Promise<DestinationImageResult | null> {
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

  const response = await fetchWithRetry(url)
  if (!response.ok) return null

  const data = await response.json() as { query?: { pages?: Record<string, WikipediaPage> } }
  const page = Object.values(data.query?.pages ?? {})
    .filter(pageImageIsUsable)
    .filter(page => destinationTitleMatches(page.title, input))
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
  const isZone = input.kind === 'zone'
  const validStops = input.stops?.filter(stop => stop.name.trim()) ?? []

  // For road trips, prioritise stop cities (e.g. "Cologne") over the zone name
  // (e.g. "Allemagne") which usually resolves to a political map on Wikipedia.
  const names = isZone && validStops.length > 0
    ? Array.from(new Set(validStops.slice(0, 3).map(stop => searchName(stop.name))))
    : Array.from(new Set([
        searchName(input.name),
        [searchName(input.name), searchName(input.country)].filter(Boolean).join(' '),
      ].filter(Boolean)))

  for (const name of names) {
    try {
      const wikivoyage = await searchWikivoyageExactImage(name)
      if (wikivoyage) return wikivoyage
    } catch {
      /* try Wikipedia */
    }

    try {
      const summary = await searchWikipediaSummaryImage(name)
      if (summary) return summary
    } catch {
      /* try action API */
    }

    try {
      const exact = await searchWikipediaExactImage(name)
      if (exact) return exact
    } catch {
      /* try search */
    }
  }

  for (const query of buildQueries(input)) {
    try {
      const searched = await searchWikipediaSearchImage(query, input)
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

async function searchWikimedia(query: string, input: ResolveDestinationImageInput): Promise<DestinationImageResult | null> {
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

  const response = await fetchWithRetry(url)
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
        && destinationTitleMatches(item.title, input)
    })
    .sort((a, b) => scoreWikimediaPage(b) - scoreWikimediaPage(a))[0]

  const info = page?.imageinfo?.[0]
  const image = info?.thumburl ?? info?.url
  if (!page || !info || !image) return null

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
  if (cached?.image && cached.imageProvider !== 'fallback' && cached.imageProvider !== 'wikimedia') return cached

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
      const wikimedia = await searchWikimedia(query, input)
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
