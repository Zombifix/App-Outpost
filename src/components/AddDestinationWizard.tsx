import { useEffect, useMemo, useRef, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from '../types'
import { TIER_COLORS } from '../data'
import { getDestinationImage } from '../services/imageSearch'
import { findDestinationAtLocation, findDuplicate } from '../utils/duplicates'
import { calculateScore, scoreToTier } from '../utils'
import { geoCentroid } from '../lib/geoCentroid'
import { resolveZoneGeojson } from '../lib/zoneGeometry'

interface WizardProps {
  onClose: () => void
  onAdd: (destination: Destination, options?: SaveOptions) => void
  initialDestination?: Destination
  onUpdate?: (destination: Destination, options?: SaveOptions) => void
  existingDestinations?: Destination[]
  coupDeCoeurDestinations?: Destination[]
  onDuplicateFound?: (existing: Destination, incomingName: string) => void
}

export interface SaveOptions {
  replaceCoupDeCoeurName?: string
}

type DestKind = 'place' | 'zone' | 'stop' | 'stage'
type WizardStep = 'search' | 'type' | 'questions' | 'profile' | 'context' | 'stops' | 'result'

interface PhotonResult {
  name: string
  country: string
  countryCode?: string
  state?: string
  osmValue?: string
  osmId?: number
  osmType?: Destination['osmType']
  lat: number
  lng: number
  extent?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

interface SuggestionItem {
  result: PhotonResult
  alreadyAdded: boolean
  displayCountry?: string
  flag?: string
  zoneTypeLabel?: string
}

const ADMIN_ZONE_OSM_VALUES = new Set(['country', 'state', 'region', 'province', 'county', 'department', 'district'])
const ZONE_OSM_VALUES = new Set([...ADMIN_ZONE_OSM_VALUES, 'island', 'archipelago'])
const PLACE_OSM_VALUES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'locality'])
// Cas particulier : certaines « villes » sont taguées en OSM comme entités
// administratives (Tokyo = province car la ville a été dissoute en 1943 ;
// Berlin/Hamburg = state ; Singapour/Monaco = country). On les autorise en
// mode "place" quand le filtre strict ne retourne rien.
const PLACE_ADMIN_FALLBACK_VALUES = new Set(['province', 'state', 'region', 'district', 'county', 'country'])

interface WizardState {
  name: string
  country: string
  countryCode?: string
  state?: string
  osmValue?: string
  osmId?: number
  osmType?: Destination['osmType']
  lat: number
  lng: number
  extent?: [number, number, number, number]
  geojson?: GeoJSON.Geometry
  kind: DestKind
  tripName: string
  food: number | null
  night: number | null
  culture: number | null
  nature: number | null
  value: number | null
  ease: number | null
  memorability: number | null
  vibeBoost: number | null
  retourBonus: number
  intent: Intent
  tripYear: number | null
  tripDays: number | null
  companions: Destination['companions'] | null
  personalBudget: number | null
  tripTypes: string[]
  standout: string
  standoutTags: string[]
  coupDeCoeur: boolean
  livedThere: boolean
  replaceCoupDeCoeurName: string
}

// calculateScore et scoreToTier importés de ../utils — source unique.

function computeScore(state: WizardState): number {
  return calculateScore({
    food: state.food,
    night: state.night,
    culture: state.culture,
    nature: state.nature,
    value: state.value,
    ease: state.ease,
    memorability: state.memorability,
  }, state.intent, {
    vibeBoost: state.vibeBoost,
    retourBonus: state.retourBonus,
  })
}

interface StopAutocompleteProps {
  index: number
  stop: RoadTripStop
  onChange: (next: RoadTripStop) => void
  onRemove: () => void
  country?: string
  state?: string
  centerLat?: number
  centerLng?: number
  isDragging?: boolean
  isDragTarget?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
}

function StopAutocomplete({
  index, stop, onChange, onRemove, country, state, centerLat, centerLng,
  isDragging, isDragTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: StopAutocompleteProps) {
  const [query, setQuery] = useState(stop.name)
  const [results, setResults] = useState<PhotonResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return }
    if (query === stop.name && Number.isFinite(stop.lat)) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchPhoton(query, {
          country, state, lat: centerLat, lng: centerLng, kindFilter: 'place',
        })
        setResults(r)
      } catch {
        setResults([])
      }
    }, 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, stop.name, stop.lat, country, state, centerLat, centerLng])

  const pick = (r: PhotonResult) => {
    onChange({ name: r.name, lat: r.lat, lng: r.lng, type: 'stage' })
    setQuery(r.name)
    setResults([])
    setOpen(false)
  }

  const rowClass = [
    'wizard-stop-row',
    isDragging ? 'is-dragging' : '',
    isDragTarget ? 'is-drag-target' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={rowClass}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="wizard-stop-field">
        <span
          className="wizard-stop-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label="Glisser pour réordonner"
          title="Glisser pour réordonner"
        >⋮⋮</span>
        <input
          className="wizard-input wizard-stop-input"
          placeholder={`Étape ${index + 1}`}
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
            onChange({ name: e.target.value, lat: NaN, lng: NaN, type: 'stage' })
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setOpen(false), 160)
          }}
        />
        <button
          className="wizard-stop-remove"
          aria-label="Supprimer"
          onClick={onRemove}
        >×</button>
      </div>
      {open && results.length > 0 && (
        <ul
          className="wizard-suggestions wizard-stop-suggestions"
          onMouseDown={() => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current) }}
        >
          {results.map((r, i) => (
            <li key={i}>
              <button onClick={() => pick(r)}>
                <span className="sug-name">{r.name}</span>
                {r.country && <span className="sug-country">{r.country}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function normalizeCountry(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function getFlagEmoji(countryCode?: string): string | undefined {
  if (!countryCode) return undefined
  const normalized = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return undefined
  return String.fromCodePoint(...normalized.split('').map(char => 127397 + char.charCodeAt(0)))
}

function isPhotonDuplicate(result: PhotonResult, existingDestinations?: Destination[]): boolean {
  if (!existingDestinations?.length) return false
  return Boolean(findDuplicate(
    { name: result.name, lat: result.lat, lng: result.lng, kind: 'place' },
    existingDestinations,
  ))
}

function getZoneTypeLabel(result: PhotonResult): string | undefined {
  switch (result.osmValue) {
    case 'island': return 'Île'
    case 'archipelago': return 'Archipel'
    case 'country': return 'Pays'
    case 'state':
    case 'region':
    case 'province':
    case 'county':
    case 'department':
    case 'district':
      return 'Région'
    default:
      return undefined
  }
}

function hasZoneGeometryCandidate(result: PhotonResult) {
  const type = result.osmType?.toLowerCase()
  return type === 'relation' || type === 'r' || type === 'way' || type === 'w'
}

function sortSuggestions(results: PhotonResult[], query: string, kind: DestKind): PhotonResult[] {
  const normalizedQuery = normalizeCountry(query)
  return [...results].sort((a, b) => {
    const exactA = normalizeCountry(a.name) === normalizedQuery ? 1 : 0
    const exactB = normalizeCountry(b.name) === normalizedQuery ? 1 : 0
    if (exactA !== exactB) return exactB - exactA

    if (kind === 'zone') {
      const polygonA = hasZoneGeometryCandidate(a) ? 1 : 0
      const polygonB = hasZoneGeometryCandidate(b) ? 1 : 0
      if (polygonA !== polygonB) return polygonB - polygonA
    }

    const countryA = a.country ? 1 : 0
    const countryB = b.country ? 1 : 0
    if (countryA !== countryB) return countryB - countryA

    return 0
  })
}

function mergePhotonResults(...groups: PhotonResult[][]): PhotonResult[] {
  const seen = new Set<string>()
  const merged: PhotonResult[] = []
  for (const group of groups) {
    for (const item of group) {
      const key = `${normalizeCountry(item.name)}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
  }
  return merged
}

// Dédoublonne par (nom + état + pays) normalisé : Photon renvoie souvent
// la même ville plusieurs fois (city/town/locality) avec des coords légèrement
// différentes. On garde le premier résultat de chaque groupe (Photon trie par
// pertinence). Sans état, on tombe sur (nom + pays) pour fusionner les variantes
// d'un même chef-lieu.
function dedupePhotonResults(results: PhotonResult[]): PhotonResult[] {
  const seen = new Set<string>()
  const out: PhotonResult[] = []
  for (const r of results) {
    const key = `${normalizeCountry(r.name)}|${normalizeCountry(r.country)}|${normalizeCountry(r.state ?? '')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

async function searchPhoton(
  q: string,
  opts: {
    country?: string
    state?: string
    lat?: number
    lng?: number
    kindFilter?: 'place' | 'zone'
  } = {},
): Promise<PhotonResult[]> {
  const fetchResults = async (withBias: boolean): Promise<PhotonResult[]> => {
    const params = [`q=${encodeURIComponent(q)}`, 'limit=15', 'lang=fr']
    if (withBias && Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
      params.push(`lat=${opts.lat}`, `lon=${opts.lng}`, 'location_bias_scale=0.3')
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params.join('&')}`)
    const data = await res.json()
    return (data.features ?? []).map((f: Record<string, unknown>) => {
      const props = f.properties as Record<string, unknown>
      const geom = f.geometry as { coordinates: [number, number] }
      return {
        name: (props.name as string) ?? '',
        country: (props.country as string) ?? '',
        countryCode: (props.countrycode as string) ?? undefined,
        state: (props.state as string) ?? undefined,
        osmValue: (props.osm_value as string) ?? undefined,
        osmId: Number.isFinite(Number(props.osm_id)) ? Number(props.osm_id) : undefined,
        osmType: typeof props.osm_type === 'string' ? props.osm_type as Destination['osmType'] : undefined,
        lat: geom.coordinates[1],
        lng: geom.coordinates[0],
        extent: props.extent as [number, number, number, number] | undefined,
      }
    })
  }

  const shouldBlendNationalAndLocal = opts.kindFilter === 'place'
    && Boolean(opts.country)
    && Number.isFinite(opts.lat)
    && Number.isFinite(opts.lng)
  let all = shouldBlendNationalAndLocal
    ? mergePhotonResults(await fetchResults(false), await fetchResults(true))
    : await fetchResults(Number.isFinite(opts.lat) && Number.isFinite(opts.lng))

  if (opts.kindFilter === 'place') {
    const strict = all.filter(r => r.osmValue && PLACE_OSM_VALUES.has(r.osmValue))
    // Fallback Tokyo/Berlin/Singapour : si aucun résultat strict, on accepte
    // les entités administratives (Tokyo → province, etc.).
    all = strict.length > 0
      ? strict
      : all.filter(r => r.osmValue && PLACE_ADMIN_FALLBACK_VALUES.has(r.osmValue))
  } else if (opts.kindFilter === 'zone') {
    all = all.filter(r => r.osmValue && ZONE_OSM_VALUES.has(r.osmValue))
  }

  const ordered = opts.kindFilter === 'zone' ? sortSuggestions(all, q, 'zone') : all
  if (opts.state) {
    // Filtre strict : si la zone est un état/région, on n'accepte QUE des résultats
    // dans cet état (peu importe le résultat — on retourne vide si rien ne match).
    const target = normalizeCountry(opts.state)
    return dedupePhotonResults(ordered.filter(r => r.state && normalizeCountry(r.state) === target)).slice(0, 6)
  }
  if (opts.country) {
    // Filtre strict aussi pour les pays : on n'accepte que des villes du pays.
    const target = normalizeCountry(opts.country)
    return dedupePhotonResults(ordered.filter(r => normalizeCountry(r.country) === target)).slice(0, 6)
  }
  return dedupePhotonResults(ordered).slice(0, 6)
}

const QUESTIONS = [
  {
    key: 'food' as const,
    question: '🍽️ Niveau food, tu t\'es régalé(e) ?',
    answers: [
      { label: '🤤 Incroyable, j\'ai pris 3 kilos de bonheur', value: 5 },
      { label: '😋 Vraiment pas mal, on a fait de bonnes découvertes', value: 4 },
      { label: '😐 Bof, c\'était juste pour se nourrir', value: 2 },
      { label: '🤷‍♂️ Pas vraiment testé / J\'ai fait mes propres repas', value: null },
    ],
  },
  {
    key: 'night' as const,
    question: '🌙 L\'ambiance le soir, ça donnait quoi ?',
    answers: [
      { label: '🔥 Énorme, ça ne s\'arrête jamais', value: 5 },
      { label: '🍻 Animé juste ce qu\'il faut (bars, restos sympas)', value: 4 },
      { label: '🌙 Très calme, c\'est plutôt mort le soir', value: 2 },
      { label: '🛌 Pas mon délire pour ce séjour / J\'étais au lit tôt', value: null },
    ],
  },
  {
    key: 'culture' as const,
    question: '🗺️ Niveau visites et activités, tu avais de quoi faire ?',
    answers: [
      { label: '🎢 Trop de trucs à voir, il faudrait revenir !', value: 5 },
      { label: '👍 Pile-poil ce qu\'il fallait pour la durée du séjour', value: 4 },
      { label: '🚶‍♀️ On a vite fait le tour, faut chercher un peu pour s\'occuper', value: 2 },
      { label: '🥱 Franchement, il n\'y a pas grand-chose à faire', value: 1 },
    ],
  },
  {
    key: 'nature' as const,
    question: '📸 Visuellement, on en prend plein les yeux ?',
    answers: [
      { label: '😍 Magnifique, une vraie carte postale', value: 5 },
      { label: '📷 Très sympa, pas mal de jolis coins', value: 4 },
      { label: '🏢 Sans plus, ça manque un peu de charme', value: 2 },
      { label: '🏗️ Clairement pas ouf, on ne vient pas pour la beauté du lieu', value: 1 },
    ],
  },
  {
    key: 'value' as const,
    question: '💸 Niveau budget sur place, ça disait quoi ?',
    answers: [
      { label: '👑 Un vrai bon plan, j\'ai vécu comme un roi / une reine', value: 5 },
      { label: '⚖️ Correct, les prix m\'ont semblé honnêtes', value: 4 },
      { label: '💸 Mitigé : pas mal de pièges à touristes / Assez cher', value: 2 },
      { label: '🚨 Hors de prix / Un braquage à chaque coin de rue', value: 1 },
    ],
  },
  {
    key: 'ease' as const,
    question: '🧩 Côté orga (transports, déplacements), c\'était fluide ?',
    answers: [
      { label: '🛝 Hyper facile, tout glisse tout seul', value: 5 },
      { label: '👌 Ça va, on prend vite le pli', value: 4 },
      { label: '🗺️ Un peu galère par moments, faut s\'accrocher', value: 2 },
      { label: '🚧 L\'enfer : rien n\'est pensé pour, on a perdu un temps fou', value: 1 },
    ],
  },
  {
    key: 'memorability' as const,
    question: '✨ Avec le recul, la destination t\'a marqué(e) ?',
    answers: [
      { label: '🤯 Une énorme claque, j\'y pense encore tous les jours', value: 5 },
      { label: '❤️ Une super expérience, j\'en garde d\'excellents souvenirs', value: 4 },
      { label: '🤷‍♀️ Sympa sur le coup, mais ça ne restera pas gravé à vie', value: 2 },
      { label: '🗑️ Franchement oubliable / Déjà hâte de passer à autre chose', value: 1 },
    ],
  },
  {
    key: 'vibeBoost' as const,
    question: '🫶 Niveau ambiance globale et accueil, c\'était comment ?',
    answers: [
      { label: '🥰 Adorables, je me suis senti(e) hyper bien accueilli(e)', value: 5 },
      { label: '🤙 Tranquille, ambiance cool et sans prise de tête', value: 4 },
      { label: '🤐 Un peu froids ou distants', value: 3 },
      { label: '😬 Pas très à l\'aise / Ambiance parfois pesante ou stressante', value: 2 },
    ],
  },
  {
    key: 'retourBonus' as const,
    question: '🔁 Finalement, tu y retournerais un jour ?',
    answers: [
      { label: '🎒 Demain s\'il le faut, j\'ai pas tout vu !', value: 0.3 },
      { label: '✈️ Pourquoi pas, si l\'occasion se présente', value: 0.1 },
      { label: '🌍 Bof, le monde est grand, je préfère voir autre chose', value: 0 },
      { label: '🚫 Jamais de la vie', value: -0.3 },
    ],
  },
]

type QuestionKey = 'food' | 'night' | 'culture' | 'nature' | 'value' | 'ease' | 'memorability' | 'vibeBoost' | 'retourBonus'

const TYPE_OPTIONS: { kind: DestKind; icon: string; label: string; desc: string }[] = [
  { kind: 'place', icon: '📍', label: 'Destination', desc: 'Une ville ou un endroit précis' },
  { kind: 'zone', icon: '🗺️', label: 'Road trip / Zone', desc: 'Une région, un itinéraire' },
]

const COMPANION_OPTIONS: Array<{ value: NonNullable<Destination['companions']>; label: string }> = [
  { value: 'solo', label: '🧍 Solo' },
  { value: 'couple', label: '💑 Couple' },
  { value: 'amis', label: '👯 Amis' },
  { value: 'famille', label: '👨‍👩‍👧 Famille' },
  { value: 'travail', label: '💻 Travail' },
]

const TRIP_TYPE_OPTIONS: { id: string; label: string }[] = [
  { id: 'culture',  label: '🏛️ Musées & monuments' },
  { id: 'food',     label: '🍽️ Food tour' },
  { id: 'nature',   label: '🌿 Grand air & rando' },
  { id: 'ville',    label: '🏙️ City break' },
  { id: 'fete',     label: '🌙 Vie nocturne' },
  { id: 'repos',    label: '🧘 Mode lézard' },
  { id: 'roadtrip', label: '🚗 Road trip' },
  { id: 'bleisure', label: '💻 Bleisure' },
]

const TRIP_TYPE_LABEL_TO_ID: Record<string, string> = Object.fromEntries(
  TRIP_TYPE_OPTIONS.map(option => [option.label, option.id])
)

function getIntentFromTripTypes(tripTypes: string[]): Intent {
  const ids = tripTypes.map(label => TRIP_TYPE_LABEL_TO_ID[label]).filter(Boolean)
  if (ids.includes('food')) return 'gastro'
  if (ids.includes('fete')) return 'sorties'
  if (ids.includes('bleisure')) return 'travail'
  if (ids.includes('nature') || ids.includes('roadtrip')) return 'nature'
  if (ids.includes('ville') || ids.includes('repos')) return 'city-trip'
  return 'tourisme'
}

const STANDOUT_OPTIONS = [
  // Tops
  '✨ L\'énergie',
  '🤤 Claques culinaires',
  '💬 Les locaux',
  '📸 Spots de folie',
  '⛩️ Dépaysement',
  '🧱 Architecture & ruelles',
  // Flops
  '💸 Budget qui pique',
  '🚏 Transports galère',
  '👤 La foule',
  '🎪 Pièges à touristes',
  '😴 Rythme épuisant',
  '🌦️ Météo capricieuse',
]

function stripChipEmoji(label: string) {
  const firstSpace = label.indexOf(' ')
  return firstSpace === -1 ? label : label.slice(firstSpace + 1)
}

function restoreChipLabel(value: string, options: string[]) {
  return options.find(option => stripChipEmoji(option) === value) ?? value
}

const QUICK_STOP_SUGGESTIONS: Record<string, string[]> = {
  allemagne: ['Berlin', 'Hambourg', 'Munich', 'Cologne', 'Francfort'],
  italie: ['Turin', 'Venise', 'Florence', 'Rome', 'Naples', 'Taormine'],
  france: ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Nice'],
  espagne: ['Barcelone', 'Madrid', 'Seville', 'Valence', 'Grenade'],
  portugal: ['Lisbonne', 'Porto', 'Coimbra', 'Faro'],
  texas: ['Austin', 'Dallas', 'Houston', 'San Antonio'],
  etatsunis: ['New York', 'Los Angeles', 'Chicago', 'San Francisco'],
  etatsunisdamerique: ['New York', 'Los Angeles', 'Chicago', 'San Francisco'],
}

function getQuickStopSuggestions(state: WizardState, stops: RoadTripStop[]): string[] {
  const keys = [state.name, state.state, state.country]
    .filter(Boolean)
    .map(value => normalizeCountry(value as string).replace(/[^a-z0-9]/g, ''))
  const options = keys.flatMap(key => QUICK_STOP_SUGGESTIONS[key] ?? [])
  const used = new Set(stops.map(stop => normalizeCountry(stop.name)))
  return Array.from(new Set(options)).filter(name => !used.has(normalizeCountry(name))).slice(0, 5)
}

const TIER_LABELS: Record<Tier, string> = {
  S: 'Exceptionnel',
  A: 'Génial',
  B: 'Correct',
  C: 'Bof',
  D: 'À éviter',
}

const TIER_EXPLANATIONS: Record<Tier, string> = {
  S: 'Un endroit que tu n\'oublieras pas. Il rejoint ton top absolu.',
  A: 'Vraiment bien. Tu recommanderais sans hésiter.',
  B: 'Une bonne expérience dans l\'ensemble, avec quelques bémols.',
  C: 'Mitigé. Ça valait le déplacement, mais rien d\'exceptionnel.',
  D: 'Pas le meilleur souvenir. Mieux vaut noter pour ne pas y retourner.',
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
const AUTO_IMAGE_VERSION = 5

export default function AddDestinationWizard({ onClose, onAdd, initialDestination, onUpdate, existingDestinations, coupDeCoeurDestinations = [], onDuplicateFound }: WizardProps) {
  const isEditing = !!initialDestination
  const [step, setStep] = useState<WizardStep>(isEditing ? 'result' : 'type')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PhotonResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PhotonResult | null>(null)
  const [state, setState] = useState<WizardState>(
    isEditing
      ? {
          name: initialDestination.name,
          country: initialDestination.country,
          countryCode: initialDestination.countryCode,
          state: initialDestination.state,
          osmValue: initialDestination.osmValue,
          osmId: initialDestination.osmId,
          osmType: initialDestination.osmType,
          lat: initialDestination.lat,
          lng: initialDestination.lng,
          extent: initialDestination.extent,
          geojson: initialDestination.geojson,
          kind: initialDestination.kind ?? 'place',
          tripName: initialDestination.tripName ?? '',
          food: initialDestination.food,
          night: initialDestination.night,
          culture: initialDestination.culture,
          nature: initialDestination.nature,
          value: initialDestination.value,
          ease: initialDestination.ease ?? null,
          memorability: initialDestination.memorability ?? null,
          vibeBoost: initialDestination.vibeBoost ?? null,
          retourBonus: initialDestination.retourBonus ?? 0,
          intent: initialDestination.intent,
          tripYear: initialDestination.tripYear ?? null,
          tripDays: initialDestination.tripDays ?? null,
          companions: initialDestination.companions ?? null,
          personalBudget: initialDestination.personalBudget ?? null,
          tripTypes: initialDestination.tripTypes ?? [],
          standout: initialDestination.standout ?? '',
          standoutTags: initialDestination.standoutTags ?? (initialDestination.standout ? [restoreChipLabel(initialDestination.standout, STANDOUT_OPTIONS)] : []),
          coupDeCoeur: Boolean(initialDestination.coupDeCoeur),
          livedThere: Boolean(initialDestination.livedThere),
          replaceCoupDeCoeurName: '',
        }
      : {
          name: '', country: '', countryCode: undefined, state: undefined, osmValue: undefined, osmId: undefined, osmType: undefined, lat: 0, lng: 0,
          kind: 'place', tripName: '',
          food: null, night: null, culture: null, nature: null, value: null,
          ease: null, memorability: null,
          vibeBoost: null, retourBonus: 0,
          intent: 'tourisme',
          tripYear: null, tripDays: null, companions: null, personalBudget: null, tripTypes: [], standout: '', standoutTags: [],
          coupDeCoeur: false, livedThere: false, replaceCoupDeCoeurName: '',
        }
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answeredKeys, setAnsweredKeys] = useState<Set<QuestionKey>>(() => {
    // En mode édition, pré-marquer les questions déjà répondues pour que
    // l'utilisateur sache où il en est et puisse naviguer sans tout re-saisir.
    if (!initialDestination) return new Set()
    const keys = new Set<QuestionKey>()
    if (initialDestination.food != null) keys.add('food')
    if (initialDestination.night != null) keys.add('night')
    if (initialDestination.culture != null) keys.add('culture')
    if (initialDestination.nature != null) keys.add('nature')
    if (initialDestination.value != null) keys.add('value')
    if (initialDestination.ease != null) keys.add('ease')
    if (initialDestination.memorability != null) keys.add('memorability')
    if (initialDestination.vibeBoost != null) keys.add('vibeBoost')
    if (initialDestination.retourBonus) keys.add('retourBonus')
    return keys
  })
  const finalScore = useMemo(() => computeScore(state), [state])
  const finalTier = scoreToTier(finalScore)
  const [stops, setStops] = useState<RoadTripStop[]>(
    isEditing && initialDestination.stops?.length ? initialDestination.stops : []
  )
  const [quickStopLoading, setQuickStopLoading] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [resolvingImage, setResolvingImage] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceOptions = coupDeCoeurDestinations.filter(destination => destination.name !== initialDestination?.name)
  const needsCoupDeCoeurReplacement = state.coupDeCoeur && !initialDestination?.coupDeCoeur && replaceOptions.length >= 2

  // Fermeture avec garde : demande confirmation si l'utilisateur est en plein
  // questionnaire pour éviter la perte accidentelle de réponses.
  const handleClose = () => {
    const hasProgress = step !== 'type' && step !== 'search'
    if (hasProgress && !window.confirm('Fermer le formulaire ? Tes réponses seront perdues.')) return
    onClose()
  }

  const reorderStops = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) return
    const next = [...stops]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setStops(next)
  }

  // Centre géographique pour biaiser Photon vers le pays courant
  const stopCenter = state.extent
    ? { lat: (state.extent[1] + state.extent[3]) / 2, lng: (state.extent[0] + state.extent[2]) / 2 }
    : { lat: state.lat, lng: state.lng }

  // Si la zone est un état/région/comté, on restreint les étapes à cet état.
  // Le nom de la zone EST le nom de l'état (Photon ne renvoie pas `state` quand l'élément est lui-même un state).
  const stopStateFilter = state.osmValue && ADMIN_ZONE_OSM_VALUES.has(state.osmValue) && state.osmValue !== 'country'
    ? (state.state || state.name)
    : undefined
  const quickStopSuggestions = getQuickStopSuggestions(state, stops)
  const suggestionItems = useMemo<SuggestionItem[]>(() => {
    return sortSuggestions(suggestions, query, state.kind)
      .map(result => {
        const displayCountry = result.country
          ? `${result.state && result.state !== result.name ? `${result.state}, ` : ''}${result.country}`
          : undefined
        return {
          result,
          alreadyAdded: !isEditing && state.kind === 'place' && isPhotonDuplicate(result, existingDestinations),
          displayCountry,
          flag: getFlagEmoji(result.countryCode),
          zoneTypeLabel: state.kind === 'zone' ? getZoneTypeLabel(result) : undefined,
        }
      })
      .slice(0, 4)
  }, [existingDestinations, isEditing, query, state.kind, suggestions])

  useEffect(() => {
    if (step === 'search' && inputRef.current) inputRef.current.focus()
  }, [step])

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSuggestions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await searchPhoton(query, { kindFilter: state.kind === 'zone' ? 'zone' : 'place' })
        setSuggestions(results)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, state.kind])

  const selectSuggestion = (r: PhotonResult) => {
    // Détection précoce du doublon : dès qu'on sait le nom + les coords, on
    // évite de faire remplir tout le questionnaire pour rien.
    if (onDuplicateFound && existingDestinations && !isEditing) {
      const dup = findDuplicate(
        { name: r.name, lat: r.lat, lng: r.lng, kind: state.kind },
        existingDestinations,
      )
      if (dup) {
        onDuplicateFound(dup, r.name)
        return
      }
    }
    setSelected(r)
    setQuery(r.name + (r.country ? `, ${r.country}` : ''))
    setSuggestions([])
    setState(prev => ({
      ...prev,
          name: r.name,
          country: r.country,
          countryCode: r.countryCode,
          state: r.state,
          osmValue: r.osmValue,
          osmId: r.osmId,
          osmType: r.osmType,
          lat: r.lat,
      lng: r.lng,
      extent: r.extent,
      geojson: undefined,
    }))
    setQuestionIndex(0)
    setAnsweredKeys(new Set())
    setStep('questions')
    if (state.kind === 'zone') {
      // Resolve the exact OSM selection so homonyms cannot replace the chosen island/region.
      resolveZoneGeojson(r).then(geojson => {
        setState(prev => (
          prev.osmId === r.osmId && prev.osmType === r.osmType
            ? { ...prev, geojson }
            : prev
        ))
      })
    }
  }

  const selectKind = (kind: DestKind) => {
    setState(prev => ({ ...prev, kind }))
    setStep('search')
  }

  const answerQuestion = (key: QuestionKey, value: number | null) => {
    setState(prev => ({ ...prev, [key]: value }))
    setAnsweredKeys(prev => new Set([...prev, key]))

    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex(i => i + 1)
    } else {
      setStep('profile')
    }
  }

  const finishQuestionnaire = (nextState: WizardState = state) => {
    setStep(nextState.kind === 'zone' ? 'stops' : 'result')
  }

  const renderWizardHeading = (counterLabel?: string) => (
    <div className="wizard-step-top">
      {state.name && (
        <p className={`wizard-dest-label${isEditing ? ' is-editing' : ''}`}>
          {state.name}
        </p>
      )}
      {counterLabel && (
        <div className="wizard-question-counter">
          {counterLabel}
        </div>
      )}
    </div>
  )

  const addEmptyStop = () => {
    if (stops.length >= 7) return
    setStops(prev => [...prev, { name: '', lat: NaN, lng: NaN, type: 'stage' }])
  }

  const addQuickStop = async (name: string) => {
    if (quickStopLoading || stops.length >= 7) return
    setQuickStopLoading(name)
    try {
      const results = await searchPhoton(name, {
        country: state.country,
        state: stopStateFilter,
        lat: stopCenter.lat,
        lng: stopCenter.lng,
        kindFilter: 'place',
      })
      const exact = results.find(result => normalizeCountry(result.name) === normalizeCountry(name))
      const pick = exact ?? results[0]
      if (!pick) return
      setStops(prev => {
        const alreadyUsed = prev.some(stop => normalizeCountry(stop.name) === normalizeCountry(pick.name))
        if (alreadyUsed || prev.length >= 7) return prev
        return [...prev, { name: pick.name, lat: pick.lat, lng: pick.lng, type: 'stage' }]
      })
    } finally {
      setQuickStopLoading(null)
    }
  }

  const confirmAdd = async () => {
    if (resolvingImage) return
    if (needsCoupDeCoeurReplacement && !state.replaceCoupDeCoeurName) return
    setResolvingImage(true)
    let s = state
    const score = computeScore(s)
    const tier = scoreToTier(score)
    const isZone = s.kind === 'zone'

    // Zones: pin position must come from the *main* polygon centroid, not from
    // Photon's extent average (which encompasses overseas territories — putting
    // "France" in West Africa) nor from Photon's label point (often offset for
    // regions like Corse). We await Nominatim here if its background fetch from
    // selectSuggestion hasn't completed yet.
    let geojson = s.geojson
    if (isZone && !geojson) {
      geojson = await resolveZoneGeojson(s)
      if (geojson) {
        s = { ...s, geojson }
        setState(s)
      }
    }
    const centroid = isZone ? geoCentroid(geojson) : null

    // Resolution order for zones:
    //   1. centroid of the largest polygon (Nominatim) — accurate for metropoles
    //      and islands
    //   2. Photon's r.lat/r.lng — usually the OSM label point (decent fallback)
    //   3. average of Photon's extent — worst case, biased by outlier territories
    const lat = isZone
      ? (centroid?.lat ?? (Number.isFinite(s.lat) ? s.lat : (s.extent ? (s.extent[1] + s.extent[3]) / 2 : NaN)))
      : s.lat
    const lng = isZone
      ? (centroid?.lng ?? (Number.isFinite(s.lng) ? s.lng : (s.extent ? (s.extent[0] + s.extent[2]) / 2 : NaN)))
      : s.lng
    // Persist the bbox of the main polygon so the map zoom/focus stays tight on
    // the real region (e.g. metropolitan France) rather than the global extent.
    const extentForSave: [number, number, number, number] | undefined = isZone
      ? (centroid?.bbox ?? s.extent)
      : s.extent
    const validStops = s.kind === 'zone'
      ? stops.filter(st => st.name.trim() && Number.isFinite(st.lat) && Number.isFinite(st.lng))
      : undefined
    const imageResult = isEditing && initialDestination.image && initialDestination.destinationKey
      ? {
          image: initialDestination.image,
          imageProvider: initialDestination.imageProvider,
          imageAuthor: initialDestination.imageAuthor,
          imageSourceUrl: initialDestination.imageSourceUrl,
          imageQuery: initialDestination.imageQuery,
          destinationKey: initialDestination.destinationKey,
        }
      : await getDestinationImage({
          name: s.name,
          country: s.country,
          state: s.state,
          kind: s.kind,
          lat,
          lng,
          osmValue: s.osmValue,
          osmId: s.osmId,
          osmType: s.osmType,
          countryCode: s.countryCode,
          stops: validStops,
          fallbackImage: DEFAULT_IMAGE,
        })

    const result: Destination = {
      name: s.name,
      country: s.country,
      destinationKey: imageResult.destinationKey,
      lat, lng,
      tier,
      kind: s.kind,
      stops: validStops,
      extent: s.kind === 'zone' ? extentForSave : undefined,
      geojson: s.kind === 'zone' ? s.geojson : undefined,
      state: s.state,
      osmValue: s.osmValue,
      osmId: s.osmId,
      osmType: s.osmType,
      countryCode: s.countryCode,
      food: s.food || 3,
      night: s.night || 3,
      culture: s.culture || 3,
      nature: s.nature || 3,
      value: s.value || 3,
      ease: s.ease ?? undefined,
      memorability: s.memorability ?? undefined,
      vibeBoost: s.vibeBoost ?? undefined,
      retourBonus: s.retourBonus || undefined,
      intent: s.intent,
      score: Math.round(score * 10) / 10,
      notes: isEditing ? (initialDestination.notes ?? 1) : 1,
      image: imageResult.image,
      imageProvider: imageResult.imageProvider,
      imageAuthor: imageResult.imageAuthor,
      imageSourceUrl: imageResult.imageSourceUrl,
      imageQuery: imageResult.imageQuery,
      imageSearchVersion: imageResult.imageProvider === 'fallback' ? undefined : AUTO_IMAGE_VERSION,
      tripYear: Number.isFinite(s.tripYear) ? s.tripYear ?? undefined : undefined,
      tripDays: Number.isFinite(s.tripDays) ? s.tripDays ?? undefined : undefined,
      companions: s.companions ?? undefined,
      personalBudget: Number.isFinite(s.personalBudget) ? s.personalBudget ?? undefined : undefined,
      tripTypes: s.tripTypes.length ? s.tripTypes : undefined,
      standout: s.standoutTags[0] ? stripChipEmoji(s.standoutTags[0]) : undefined,
      standoutTags: s.standoutTags.length ? s.standoutTags : undefined,
      coupDeCoeur: s.coupDeCoeur,
      livedThere: s.livedThere,
    }

    const saveOptions: SaveOptions | undefined = s.replaceCoupDeCoeurName
      ? { replaceCoupDeCoeurName: s.replaceCoupDeCoeurName }
      : undefined

    if (isEditing && onUpdate) {
      onUpdate(result, saveOptions)
    } else {
      onAdd(result, saveOptions)
    }
    setResolvingImage(false)
  }

  const activeQuestions = QUESTIONS
  const progressSteps: WizardStep[] = state.kind === 'zone'
    ? ['type', 'search', 'questions', 'profile', 'context', 'stops']
    : ['type', 'search', 'questions', 'profile', 'context']

  const toggleTripType = (option: string) => {
    setState(prev => {
      const selected = prev.tripTypes.includes(option)
      if (selected) {
        const tripTypes = prev.tripTypes.filter(item => item !== option)
        return { ...prev, tripTypes, intent: getIntentFromTripTypes(tripTypes) }
      }
      if (prev.tripTypes.length >= 3) return prev
      const tripTypes = [...prev.tripTypes, option]
      return { ...prev, tripTypes, intent: getIntentFromTripTypes(tripTypes) }
    })
  }

  const toggleStandoutTag = (option: string) => {
    setState(prev => ({
      ...prev,
      standoutTags: prev.standoutTags.includes(option)
        ? prev.standoutTags.filter(item => item !== option)
        : [...prev.standoutTags, option],
    }))
  }

  const renderStayTypeFields = () => (
    <div className="wizard-context wizard-context--embedded wizard-context--tags">
      <div className="wizard-context-group">
        <span>Type de séjour</span>
        <div className="wizard-chip-row" aria-label="Type de séjour">
          {TRIP_TYPE_OPTIONS.map(option => {
            const isSelected = state.tripTypes.includes(option.label)
            const isDisabled = !isSelected && state.tripTypes.length >= 3
            return (
              <button
                key={option.id}
                className={isSelected ? 'is-selected' : ''}
                disabled={isDisabled}
                onClick={() => toggleTripType(option.label)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="wizard-context-group">
        <span>Ce que tu retiens du séjour</span>
        <div className="wizard-chip-row" aria-label="Ce que tu retiens du séjour">
          {STANDOUT_OPTIONS.map(option => (
            <button
              key={option}
              className={state.standoutTags.includes(option) ? 'is-selected' : ''}
              onClick={() => toggleStandoutTag(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const renderTripContextFields = () => (
    <div className="wizard-context wizard-context--embedded">
      <div className="wizard-context-grid">
        <label>
          <span>Année</span>
          <input
            value={state.tripYear ?? ''}
            inputMode="numeric"
            placeholder="2024"
            onChange={e => setState(prev => ({ ...prev, tripYear: e.target.value ? Number(e.target.value) : null }))}
          />
        </label>
        <label>
          <span>Durée</span>
          <input
            value={state.tripDays ?? ''}
            inputMode="numeric"
            placeholder="5 jours"
            onChange={e => setState(prev => ({ ...prev, tripDays: e.target.value ? Number(e.target.value) : null }))}
          />
        </label>
        <label>
          <span>Budget perso</span>
          <input
            value={state.personalBudget ?? ''}
            inputMode="numeric"
            placeholder="450 €"
            onChange={e => setState(prev => ({ ...prev, personalBudget: e.target.value ? Number(e.target.value) : null }))}
          />
          <small className="wizard-field-helper">hors transport si besoin</small>
        </label>
      </div>
      <div className="wizard-context-group">
        <span>Avec qui ?</span>
        <div className="wizard-chip-row" aria-label="Avec qui">
          {COMPANION_OPTIONS.map(option => (
            <button
              key={option.value}
              className={state.companions === option.value ? 'is-selected' : ''}
              onClick={() => setState(prev => ({ ...prev, companions: prev.companions === option.value ? null : option.value }))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="wizard-context-group">
        <span>Coup de cœur</span>
        <div className="wizard-toggle-row" aria-label="Coup de cœur">
          <button
            type="button"
            role="switch"
            aria-checked={state.coupDeCoeur}
            className={`wizard-favorite-toggle${state.coupDeCoeur ? ' is-selected' : ''}`}
            onClick={() => setState(prev => ({
              ...prev,
              coupDeCoeur: !prev.coupDeCoeur,
              replaceCoupDeCoeurName: prev.coupDeCoeur ? '' : prev.replaceCoupDeCoeurName,
            }))}
          >
            <span className="wizard-favorite-switch" aria-hidden="true">
              <span>❤️</span>
            </span>
            <span>Coup de cœur</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={state.livedThere}
            className={`wizard-favorite-toggle wizard-lived-toggle${state.livedThere ? ' is-selected' : ''}`}
            onClick={() => setState(prev => ({ ...prev, livedThere: !prev.livedThere }))}
          >
            <span className="wizard-favorite-switch" aria-hidden="true">
              <span>🏠</span>
            </span>
            <span>A vécu là-bas</span>
          </button>
        </div>
        {needsCoupDeCoeurReplacement && (
          <div className="wizard-replace-choice">
            <span>Tu as déjà 2 coups de cœur. Remplacer lequel ?</span>
            <div className="wizard-chip-row" aria-label="Remplacer un coup de cœur">
              {replaceOptions.map(destination => (
                <button
                  key={destination.name}
                  className={state.replaceCoupDeCoeurName === destination.name ? 'is-selected' : ''}
                  onClick={() => setState(prev => ({ ...prev, replaceCoupDeCoeurName: destination.name }))}
                >
                  {destination.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderStopsSection = () => (
    <div className="wizard-stops">
      <div className="wizard-quick-stops">
        <p className="wizard-quick-stops-title">Suggestions rapides</p>
        <div className="wizard-quick-stops-row">
          {quickStopSuggestions.length > 0 ? quickStopSuggestions.map(name => (
            <button
              key={name}
              type="button"
              className="wizard-quick-stop-btn"
              disabled={quickStopLoading !== null || stops.length >= 7}
              onClick={() => addQuickStop(name)}
            >
              {quickStopLoading === name ? 'Ajout...' : `+ ${name}`}
            </button>
          )) : (
            <span className="wizard-quick-stop-empty">Ajoute tes villes dans l'ordre du trajet.</span>
          )}
        </div>
      </div>

      {stops.map((stop, i) => {
        const stopLinkedDest = stop.name && Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && existingDestinations
          ? findDestinationAtLocation(stop, existingDestinations)
          : null
        return (
          <div key={i}>
            <StopAutocomplete
              index={i}
              stop={stop}
              country={state.country}
              state={stopStateFilter}
              centerLat={stopCenter.lat}
              centerLng={stopCenter.lng}
              isDragging={dragIndex === i}
              isDragTarget={dragOverIndex === i && dragIndex !== null && dragIndex !== i}
              onDragStart={() => setDragIndex(i)}
              onDragOver={e => {
                if (dragIndex === null) return
                e.preventDefault()
                if (dragOverIndex !== i) setDragOverIndex(i)
              }}
              onDragLeave={() => {
                if (dragOverIndex === i) setDragOverIndex(null)
              }}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) reorderStops(dragIndex, i)
                setDragIndex(null)
                setDragOverIndex(null)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setDragOverIndex(null)
              }}
              onChange={next => {
                const updated = [...stops]
                updated[i] = next
                setStops(updated)
              }}
              onRemove={() => setStops(stops.filter((_, j) => j !== i))}
            />
            {stopLinkedDest && (
              <p className="wizard-dup-hint">
                Tu as deja note <strong>{stopLinkedDest.name}</strong> - le stop sera lie automatiquement.
              </p>
            )}
          </div>
        )
      })}

      {stops.length < 7 && (
        <button
          type="button"
          className="wizard-add-stop"
          onClick={addEmptyStop}
        >
          + Ajouter une etape
        </button>
      )}
    </div>
  )

  return (
    <div className="wizard-overlay" role="dialog" aria-label={isEditing ? `Modifier ${initialDestination.name}` : 'Ajouter une destination'} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="wizard-panel">
        <button className="wizard-close" aria-label="Fermer" onClick={handleClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>

        {isEditing && step !== 'result' && (
          <p className="wizard-edit-label">Modifier — {initialDestination.name}</p>
        )}

        {/* Progress dots — masqués en mode édition (on saute type/search) */}
        {!isEditing && step !== 'result' && (
          <div className="wizard-progress">
            {progressSteps.map((s, i) => (
              <span key={s} className={`wizard-dot ${step === s ? 'active' : (i < progressSteps.indexOf(step) ? 'done' : '')}`} />
            ))}
          </div>
        )}

        {step === 'type' && (
          <div className="wizard-step">
            <h2 className="wizard-title">C'était quoi comme trip ?</h2>
            <div className="wizard-type-grid">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.kind}
                  className="wizard-type-card"
                  onClick={() => selectKind(opt.kind)}
                >
                  <span className="type-icon">{opt.icon}</span>
                  <strong>{opt.label}</strong>
                  <small>{opt.desc}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'search' && (
          <div className="wizard-step">
            <h2 className="wizard-title">Où es-tu allé ?</h2>
            <p className="wizard-sub">
              {state.kind === 'zone'
                ? 'Tape une région, un état, un pays…'
                : 'Tape une ville ou un endroit précis…'}
            </p>
            <div className="wizard-search-box">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={state.kind === 'zone' ? 'France, Texas, Côte d\'Azur…' : 'Paris, Tokyo, Marrakech…'}
                className="wizard-input"
                onKeyDown={e => e.key === 'Escape' && onClose()}
              />
              {loading && <span className="wizard-spinner">·</span>}
            </div>
            {suggestions.length > 0 && (
              <ul className="wizard-suggestions">
                {suggestionItems.map(({ result, alreadyAdded, displayCountry, flag, zoneTypeLabel }, i) => (
                  <li key={i}>
                    <button onClick={() => selectSuggestion(result)} className={alreadyAdded ? 'is-duplicate' : ''}>
                      <span className="sug-main">
                        <span className="sug-name-row">
                          <span className="sug-name">{result.name}</span>
                          {zoneTypeLabel && <span className="sug-kind">{zoneTypeLabel}</span>}
                          {alreadyAdded && <span className="sug-status">Déjà ajouté</span>}
                        </span>
                        {displayCountry && (
                          <span className="sug-country">
                            {flag && <span className="sug-flag" aria-hidden="true">{flag}</span>}
                            {displayCountry}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="wizard-back"
              style={{ marginTop: 12 }}
              onClick={() => setStep('type')}
            >
              ← Changer de type
            </button>
          </div>
        )}

        {step === 'questions' && (
          <div className="wizard-step">
            {renderWizardHeading(`${questionIndex + 1} / ${activeQuestions.length}`)}
            <h2 className="wizard-title">{activeQuestions[questionIndex]?.question}</h2>
            <div className="wizard-answers">
              {activeQuestions[questionIndex]?.answers.map((a, i) => {
                const questionKey = activeQuestions[questionIndex].key as QuestionKey
                const currentValue = state[questionKey as keyof WizardState]
                const isSelected = a.value === currentValue && answeredKeys.has(questionKey)
                return (
                  <button
                    key={i}
                    className={`wizard-answer-btn${isSelected ? ' is-selected' : ''}`}
                    onClick={() => answerQuestion(
                      questionKey,
                      a.value as number | null,
                    )}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
            {questionIndex > 0 && (
              <button className="wizard-back" onClick={() => setQuestionIndex(i => i - 1)}>
                ← Précédent
              </button>
            )}
          </div>
        )}

        {step === 'profile' && (
          <div className="wizard-step">
            {renderWizardHeading(`${activeQuestions.length + 1} / ${activeQuestions.length + 2}`)}
            <h2 className="wizard-title">Type de séjour</h2>
            {renderStayTypeFields()}
            <div className="wizard-step-actions">
              <button className="wizard-back" onClick={() => setStep('questions')}>
                Précédent
              </button>
              <button className="wizard-next" onClick={() => setStep('context')}>
                Continuer
              </button>
            </div>
          </div>
        )}

        {step === 'context' && (
          <div className="wizard-step">
            {renderWizardHeading(`${activeQuestions.length + 2} / ${activeQuestions.length + 2}`)}
            <h2 className="wizard-title">Derniers détails</h2>
            {renderTripContextFields()}
            <div className="wizard-step-actions">
              <button className="wizard-back" onClick={() => setStep(isEditing ? 'result' : 'profile')}>
                Précédent
              </button>
              <button
                className="wizard-next"
                onClick={() => finishQuestionnaire()}
                disabled={needsCoupDeCoeurReplacement && !state.replaceCoupDeCoeurName}
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {step === 'stops' && state.kind === 'zone' && (
          <div className="wizard-step wizard-stops-step">
            {renderWizardHeading('Itineraire')}
            <h2 className="wizard-title">Quelles etaient les etapes ?</h2>
            <p className="wizard-sub">
              Optionnel : ajoute seulement les stops qui racontent le trajet. La note reste globale au road trip.
            </p>
            {renderStopsSection()}
            <div className="wizard-step-actions">
              <button className="wizard-back" onClick={() => setStep(isEditing ? 'context' : 'questions')}>
                Précédent
              </button>
              <button className="wizard-next" onClick={() => setStep('result')}>
                {stops.length > 0 ? 'Continuer' : 'Passer'}
              </button>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="wizard-step wizard-result">
            <p className="wizard-place-name">{state.name}</p>
            <div
              className="result-tier-badge"
              style={{ '--tier-color': TIER_COLORS[finalTier].pin } as React.CSSProperties}
            >
              {finalTier}
            </div>
            <h2 className="wizard-title">{TIER_LABELS[finalTier]}</h2>
            <p className="result-explanation">{TIER_EXPLANATIONS[finalTier]}</p>
            <div className="result-score">
              <span>Score</span>
              <strong>{finalScore.toFixed(1).replace('.', ',')}</strong>
            </div>
            <div className="result-axes">
              {(['food', 'night', 'culture', 'nature', 'value', 'ease', 'memorability'] as const).map(axis => {
                const raw = state[axis]
                if ((axis === 'ease' || axis === 'memorability') && raw === null) return null
                const val = raw || 3
                const label = {
                  food: 'Bouffe',
                  night: 'Soirées',
                  culture: 'Activités',
                  nature: 'Cadre',
                  value: 'Prix',
                  ease: 'Facilité',
                  memorability: 'Souvenir',
                }[axis]
                return (
                  <div key={axis} className="result-axis">
                    <span>{label}</span>
                    <div className="axis-bar">
                      <div className="axis-fill" style={{ width: `${(val / 5) * 100}%`, background: TIER_COLORS[finalTier].pin }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <button className="wizard-submit" onClick={confirmAdd} disabled={resolvingImage || (needsCoupDeCoeurReplacement && !state.replaceCoupDeCoeurName)}>
              {resolvingImage
                ? 'Recherche de la photo...'
                : isEditing ? 'Enregistrer les modifications' : 'Ajouter à ma carte'}
            </button>
            {isEditing && (
              <div className="wizard-result-secondary-actions">
                <button
                  className="wizard-result-redo"
                  onClick={() => setStep('context')}
                >
                  Modifier les détails
                </button>
                <button
                  className="wizard-result-redo"
                  onClick={() => {
                    setQuestionIndex(0)
                    // Ne pas effacer answeredKeys : les réponses déjà données
                    // restent visibles pour que l'utilisateur sache où il en est.
                    setStep('questions')
                  }}
                >
                  Refaire la notation
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
