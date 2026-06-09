import type { Destination } from '../types'
import { computeProfileStats, getVisitCount, type ContinentBucket } from '../utils'

export interface SuggestionHistoryState {
  recentShown: string[]
}

export interface SuggestionCandidate {
  label: string
  source: string
}

interface RecommendationInput {
  existingDestinations?: Destination[]
  historyState?: SuggestionHistoryState
  currentQuery?: string
  count?: number
}

interface AffinitySignals {
  dominantState: string | null
  dominantCountry: string | null
  dominantRegion: string | null
  dominantContinent: ContinentBucket | null
}

const MAX_HISTORY = 24
const HARD_BLOCK_SIZE = 8
const DEFAULT_COUNT = 4

const GLOBAL_POOL = [
  'Lisbonne',
  'Porto',
  'Madrid',
  'Barcelone',
  'Andalousie',
  'Rome',
  'Florence',
  'Sicile',
  'Athenes',
  'Crete',
  'Amsterdam',
  'Berlin',
  'Copenhague',
  'Prague',
  'Reykjavik',
  'Marrakech',
  'Le Cap',
  'Istanbul',
  'Dubai',
  'Tokyo',
  'Kyoto',
  'Seoul',
  'Taipei',
  'Bangkok',
  'Bali',
  'New York',
  'Chicago',
  'Montreal',
  'Vancouver',
  'Mexico',
  'Rio de Janeiro',
  'Buenos Aires',
  'Road trip Toscane',
  'Road trip Ouest americain',
  'Road trip Algarve',
  'Road trip Japon',
]

const COUNTRY_POOLS = buildNormalizedPools({
  France: ['Paris', 'Lyon', 'Bordeaux', 'Marseille', 'Nice', 'Provence', 'Bretagne', 'Alsace'],
  Espagne: ['Madrid', 'Barcelone', 'Seville', 'Valence', 'Andalousie', 'Majorque', 'Bilbao'],
  Portugal: ['Lisbonne', 'Porto', 'Algarve', 'Madere', 'Acores', 'Douro'],
  Italie: ['Rome', 'Florence', 'Venise', 'Naples', 'Sicile', 'Pouilles', 'Road trip Toscane'],
  Japon: ['Tokyo', 'Kyoto', 'Osaka', 'Okinawa', 'Hokkaido', 'Kanazawa'],
  'Etats-Unis': ['New York', 'Chicago', 'Nouvelle-Orleans', 'Californie', 'Floride', 'Road trip Ouest americain'],
  'Royaume-Uni': ['Londres', 'Edimbourg', 'Manchester', 'Dublin', 'Road trip Ecosse'],
  Grece: ['Athenes', 'Crete', 'Santorin', 'Naxos', 'Thessalonique'],
  Maroc: ['Marrakech', 'Essaouira', 'Fes', 'Casablanca', 'Atlas'],
})

const STATE_POOLS = buildNormalizedPools({
  Texas: ['Austin', 'Dallas', 'Houston', 'San Antonio', 'Road trip Texas'],
  California: ['Los Angeles', 'San Francisco', 'San Diego', 'Yosemite', 'Road trip Californie'],
  Californie: ['Los Angeles', 'San Francisco', 'San Diego', 'Yosemite', 'Road trip Californie'],
  Florida: ['Miami', 'Orlando', 'Key West', 'Tampa', 'Road trip Floride'],
  Floride: ['Miami', 'Orlando', 'Key West', 'Tampa', 'Road trip Floride'],
  'New York': ['New York', 'Hudson Valley', 'Buffalo', 'Hamptons', 'Road trip New York State'],
})

const REGION_POOLS = buildNormalizedPools({
  "Europe de l'Ouest": ['Amsterdam', 'Bruxelles', 'Zurich', 'Vienne', 'Prague', 'Alsace'],
  Mediterranee: ['Rome', 'Naples', 'Athenes', 'Sicile', 'Crete', 'Majorque'],
  'Europe du Nord': ['Copenhague', 'Stockholm', 'Oslo', 'Helsinki', 'Reykjavik'],
  'Iles britanniques': ['Londres', 'Edimbourg', 'Dublin', 'Cotswolds', 'Road trip Ecosse'],
  Balkans: ['Ljubljana', 'Dubrovnik', 'Kotor', 'Split', 'Belgrade'],
  "Europe de l'Est": ['Budapest', 'Prague', 'Cracovie', 'Bucarest', 'Tallinn'],
  'Amerique du Nord': ['Montreal', 'Quebec', 'Vancouver', 'Boston', 'Chicago'],
  'Amerique latine': ['Mexico', 'Oaxaca', 'Buenos Aires', 'Rio de Janeiro', 'Lima'],
  'Asie urbaine': ['Seoul', 'Taipei', 'Hong Kong', 'Singapour', 'Osaka'],
  'Asie nature': ['Bali', 'Chiang Mai', 'Hanoi', 'Sri Lanka', 'Lombok'],
  Maghreb: ['Marrakech', 'Essaouira', 'Tunis', 'Alger', 'Atlas'],
  'Moyen-Orient': ['Istanbul', 'Amman', 'Dubai', 'Doha', 'Abu Dhabi'],
  Ailleurs: GLOBAL_POOL,
})

const CONTINENT_POOLS: Record<ContinentBucket, string[]> = {
  Europe: ['Lisbonne', 'Rome', 'Berlin', 'Amsterdam', 'Athenes', 'Copenhague'],
  Asie: ['Tokyo', 'Seoul', 'Taipei', 'Bangkok', 'Bali', 'Singapour'],
  Ameriques: ['New York', 'Montreal', 'Vancouver', 'Mexico', 'Rio de Janeiro', 'Chicago'],
  Afrique: ['Marrakech', 'Le Cap', 'Zanzibar', 'Dakar', 'Le Caire'],
  Oceanie: ['Sydney', 'Melbourne', 'Auckland', 'Tasmanie'],
  Autre: GLOBAL_POOL,
}

export function emptySuggestionHistoryState(): SuggestionHistoryState {
  return { recentShown: [] }
}

export function normalizeSuggestionLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pushShownSuggestions(
  historyState: SuggestionHistoryState,
  shown: string[],
): SuggestionHistoryState {
  const seen = new Set<string>()
  const recentShown: string[] = []
  for (const label of [...shown, ...historyState.recentShown]) {
    const normalized = normalizeSuggestionLabel(label)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    recentShown.push(label.trim())
    if (recentShown.length >= MAX_HISTORY) break
  }
  return { recentShown }
}

export function buildDestinationRecommendations({
  existingDestinations = [],
  historyState = emptySuggestionHistoryState(),
  currentQuery,
  count = DEFAULT_COUNT,
}: RecommendationInput): string[] {
  const excluded = new Set<string>()
  for (const destination of existingDestinations) {
    for (const alias of buildSuggestionAliases(destination.name)) excluded.add(alias)
  }
  for (const alias of buildSuggestionAliases(currentQuery ?? '')) excluded.add(alias)

  const hardBlocked = new Set(
    historyState.recentShown
      .slice(0, HARD_BLOCK_SIZE)
      .map(normalizeSuggestionLabel)
      .filter(Boolean),
  )
  const softPenalty = buildSoftPenaltyMap(historyState.recentShown)
  const affinities = inferAffinities(existingDestinations)
  const poolPlan = buildPoolPlan(existingDestinations.length, affinities)

  const selected: SuggestionCandidate[] = []
  const used = new Set<string>()

  for (const { labels, take, source } of poolPlan) {
    takeFromPool({ labels, take, source, excluded, hardBlocked, softPenalty, used, selected })
    if (selected.length >= count) break
  }

  if (selected.length < count) {
    const broadFallbackPools = [
      affinities.dominantState ? STATE_POOLS[normalizeSuggestionLabel(affinities.dominantState)] ?? [] : [],
      affinities.dominantCountry ? COUNTRY_POOLS[normalizeSuggestionLabel(affinities.dominantCountry)] ?? [] : [],
      affinities.dominantRegion ? REGION_POOLS[normalizeSuggestionLabel(affinities.dominantRegion)] ?? [] : [],
      affinities.dominantContinent ? CONTINENT_POOLS[affinities.dominantContinent] ?? [] : [],
      GLOBAL_POOL,
    ]
    for (const labels of broadFallbackPools) {
      takeFromPool({
        labels,
        take: count - selected.length,
        source: 'fallback',
        excluded,
        hardBlocked,
        softPenalty,
        used,
        selected,
      })
      if (selected.length >= count) break
    }
  }

  return selected.slice(0, count).map(candidate => candidate.label)
}

function buildNormalizedPools(definition: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(definition).map(([key, value]) => [normalizeSuggestionLabel(key), value]),
  )
}

function buildSuggestionAliases(value: string): string[] {
  const normalized = normalizeSuggestionLabel(value)
  if (!normalized) return []

  const aliases = new Set<string>([normalized])
  const simplified = normalized
    .replace(/^(prefecture|province|region|etat|state|county|departement|district)\s+d(?:e|u|es)?\s*/g, '')
    .replace(/^(ile|iles|archipel)\s+d(?:e|u|es)?\s*/g, '')
    .trim()
  if (simplified) aliases.add(simplified)

  return [...aliases]
}

function buildSoftPenaltyMap(history: string[]): Map<string, number> {
  const penalty = new Map<string, number>()
  history.slice(0, MAX_HISTORY).forEach((label, index) => {
    const normalized = normalizeSuggestionLabel(label)
    if (!normalized) return
    penalty.set(normalized, (penalty.get(normalized) ?? 0) + (MAX_HISTORY - index))
  })
  return penalty
}

function inferAffinities(destinations: Destination[]): AffinitySignals {
  if (destinations.length === 0) {
    return {
      dominantState: null,
      dominantCountry: null,
      dominantRegion: null,
      dominantContinent: null,
    }
  }

  const stats = computeProfileStats(destinations)
  const stateCounts = new Map<string, number>()
  const regionCounts = new Map<string, number>()
  let totalRegionWeight = 0
  let totalStateWeight = 0

  for (const destination of destinations) {
    const weight = getVisitCount(destination)
    if (isUnitedStatesCountry(destination.country) && destination.state) {
      const key = normalizeSuggestionLabel(destination.state)
      stateCounts.set(key, (stateCounts.get(key) ?? 0) + weight)
      totalStateWeight += weight
    }
    for (const region of regionTagsForCountry(destination.country)) {
      const key = normalizeSuggestionLabel(region)
      regionCounts.set(key, (regionCounts.get(key) ?? 0) + weight)
      totalRegionWeight += weight
    }
  }

  const topState = getTopMapEntry(stateCounts)
  const topRegion = getTopMapEntry(regionCounts)
  const dominantCountry = stats.mainCountry && stats.mainCountryRepeat >= 2 && stats.mainCountryRatio >= 0.34
    ? stats.mainCountry
    : null
  const dominantState = dominantCountry && isUnitedStatesCountry(dominantCountry) && topState && totalStateWeight > 0
    && topState.count >= 2 && topState.count / totalStateWeight >= 0.45
    ? topState.label
    : null
  const dominantRegion = topRegion && totalRegionWeight > 0 && topRegion.count >= 2 && topRegion.count / totalRegionWeight >= 0.3
    ? topRegion.label
    : null
  const dominantContinent = stats.mainContinent && stats.mainContinentRatio >= 0.45
    ? stats.mainContinent
    : null

  return {
    dominantState,
    dominantCountry,
    dominantRegion,
    dominantContinent,
  }
}

function buildPoolPlan(destinationCount: number, affinities: AffinitySignals): Array<{ labels: string[]; take: number; source: string }> {
  if (destinationCount < 3) {
    return [
      { labels: GLOBAL_POOL, take: DEFAULT_COUNT, source: 'global' },
    ]
  }

  const primaryPool = affinities.dominantState
    ? STATE_POOLS[normalizeSuggestionLabel(affinities.dominantState)] ?? []
    : affinities.dominantCountry
      ? COUNTRY_POOLS[normalizeSuggestionLabel(affinities.dominantCountry)] ?? []
      : affinities.dominantRegion
        ? REGION_POOLS[normalizeSuggestionLabel(affinities.dominantRegion)] ?? []
        : affinities.dominantContinent
          ? CONTINENT_POOLS[affinities.dominantContinent] ?? []
          : GLOBAL_POOL

  const adjacentPool = affinities.dominantState
    ? COUNTRY_POOLS[normalizeSuggestionLabel(affinities.dominantCountry ?? '')] ?? []
    : affinities.dominantCountry
      ? REGION_POOLS[normalizeSuggestionLabel(affinities.dominantRegion ?? '')] ?? CONTINENT_POOLS[affinities.dominantContinent ?? 'Autre'] ?? []
      : affinities.dominantRegion
        ? CONTINENT_POOLS[affinities.dominantContinent ?? 'Autre'] ?? []
        : GLOBAL_POOL

  const explorePool = affinities.dominantContinent
    ? CONTINENT_POOLS[affinities.dominantContinent] ?? GLOBAL_POOL
    : GLOBAL_POOL

  return [
    { labels: primaryPool, take: 2, source: 'primary' },
    { labels: adjacentPool, take: 1, source: 'adjacent' },
    { labels: explorePool, take: 1, source: 'explore' },
    { labels: GLOBAL_POOL, take: DEFAULT_COUNT, source: 'global' },
  ]
}

function takeFromPool({
  labels,
  take,
  source,
  excluded,
  hardBlocked,
  softPenalty,
  used,
  selected,
}: {
  labels: string[]
  take: number
  source: string
  excluded: Set<string>
  hardBlocked: Set<string>
  softPenalty: Map<string, number>
  used: Set<string>
  selected: SuggestionCandidate[]
}) {
  if (take <= 0 || labels.length === 0) return

  const ranked = dedupeLabels(labels)
    .filter(label => {
      const normalized = normalizeSuggestionLabel(label)
      if (!normalized) return false
      if (excluded.has(normalized)) return false
      if (hardBlocked.has(normalized)) return false
      if (used.has(normalized)) return false
      return true
    })
    .map(label => ({
      label,
      normalized: normalizeSuggestionLabel(label),
      penalty: softPenalty.get(normalizeSuggestionLabel(label)) ?? 0,
      random: Math.random(),
    }))
    .sort((a, b) => {
      if (a.penalty !== b.penalty) return a.penalty - b.penalty
      return a.random - b.random
    })

  for (const candidate of ranked) {
    selected.push({ label: candidate.label, source })
    used.add(candidate.normalized)
    if (selected.length >= DEFAULT_COUNT || take <= 1) break
    take -= 1
  }
}

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const label of labels) {
    const normalized = normalizeSuggestionLabel(label)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(label)
  }
  return deduped
}

function getTopMapEntry(source: Map<string, number>): { label: string; count: number } | null {
  let winner: { label: string; count: number } | null = null
  for (const [label, count] of source.entries()) {
    if (!winner || count > winner.count) winner = { label, count }
  }
  return winner
}

function isUnitedStatesCountry(country: string) {
  const normalized = normalizeSuggestionLabel(country)
  return normalized === 'etats-unis'
    || normalized === 'etats unis'
    || normalized === 'etats-unis d amerique'
    || normalized === 'etats unis d amerique'
    || normalized === 'united states'
    || normalized === 'usa'
}

function regionTagsForCountry(country: string): string[] {
  if (['royaume-uni', 'angleterre', 'ecosse', 'irlande'].includes(normalizeSuggestionLabel(country))) return ['Iles britanniques']
  if (['danemark', 'suede', 'norvege', 'finlande', 'islande', 'estonie', 'lettonie', 'lituanie'].includes(normalizeSuggestionLabel(country))) return ['Europe du Nord']
  if (['espagne', 'portugal', 'italie', 'grece', 'malte', 'chypre', 'monaco'].includes(normalizeSuggestionLabel(country))) return ['Mediterranee']
  if (['croatie', 'slovenie', 'bosnie-herzegovine', 'montenegro', 'serbie', 'albanie', 'bulgarie', 'roumanie', 'kosovo', 'macedoine du nord'].includes(normalizeSuggestionLabel(country))) return ['Balkans']
  if (['pologne', 'ukraine', 'moldavie', 'hongrie', 'slovaquie', 'russie', 'bielorussie'].includes(normalizeSuggestionLabel(country))) return ["Europe de l'Est"]
  if (['france', 'allemagne', 'pays-bas', 'belgique', 'luxembourg', 'suisse', 'autriche', 'republique tcheque', 'tchequie'].includes(normalizeSuggestionLabel(country))) return ["Europe de l'Ouest"]
  if (isUnitedStatesCountry(country) || ['canada'].includes(normalizeSuggestionLabel(country))) return ['Amerique du Nord']
  if (['mexique', 'bresil', 'argentine', 'chili', 'colombie', 'perou'].includes(normalizeSuggestionLabel(country))) return ['Amerique latine']
  if (['japon', 'chine', 'coree du sud', 'taiwan', 'hong kong', 'singapour'].includes(normalizeSuggestionLabel(country))) return ['Asie urbaine']
  if (['indonesie', 'thailande', 'vietnam', 'nepal', 'sri lanka'].includes(normalizeSuggestionLabel(country))) return ['Asie nature']
  if (['maroc', 'algerie', 'tunisie'].includes(normalizeSuggestionLabel(country))) return ['Maghreb']
  if (['emirats arabes unis', 'qatar', 'israel', 'jordanie', 'turquie'].includes(normalizeSuggestionLabel(country))) return ['Moyen-Orient']
  return ['Ailleurs']
}
