import { useEffect, useMemo, useRef, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from '../types'
import { TIER_COLORS } from '../data'
import { getDestinationImage } from '../services/imageSearch'
import { findDestinationAtLocation, findDuplicate } from '../utils/duplicates'
import { calculateScore, scoreToTier } from '../utils'

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

const ZONE_OSM_VALUES = new Set(['country', 'state', 'region', 'province', 'county', 'department', 'district'])
const PLACE_OSM_VALUES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'locality'])

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
  replaceCoupDeCoeurName: string
}

async function fetchNominatimGeojson(name: string, country: string): Promise<GeoJSON.Geometry | undefined> {
  const q = country ? `${name}, ${country}` : name
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=geojson&polygon_geojson=1&polygon_threshold=0.01&limit=1`,
      { headers: { 'Accept-Language': 'fr' } },
    )
    const data = await res.json()
    const geom = data?.features?.[0]?.geometry
    // Validation minimale du shape — Nominatim peut renvoyer n'importe quoi en erreur
    if (geom && typeof geom === 'object' && typeof (geom as { type?: unknown }).type === 'string') {
      return geom as GeoJSON.Geometry
    }
    return undefined
  } catch {
    return undefined
  }
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
    all = all.filter(r => r.osmValue && PLACE_OSM_VALUES.has(r.osmValue))
  } else if (opts.kindFilter === 'zone') {
    all = all.filter(r => r.osmValue && ZONE_OSM_VALUES.has(r.osmValue))
  }

  if (opts.state) {
    // Filtre strict : si la zone est un état/région, on n'accepte QUE des résultats
    // dans cet état (peu importe le résultat — on retourne vide si rien ne match).
    const target = normalizeCountry(opts.state)
    return dedupePhotonResults(all.filter(r => r.state && normalizeCountry(r.state) === target)).slice(0, 6)
  }
  if (opts.country) {
    // Filtre strict aussi pour les pays : on n'accepte que des villes du pays.
    const target = normalizeCountry(opts.country)
    return dedupePhotonResults(all.filter(r => normalizeCountry(r.country) === target)).slice(0, 6)
  }
  return dedupePhotonResults(all).slice(0, 6)
}

const QUESTIONS = [
  {
    key: 'food' as const,
    question: '🍽️ Tu as bien mangé pendant ce séjour ?',
    answers: [
      { label: 'Très bien', value: 5 },
      { label: 'Plutôt bien', value: 4 },
      { label: 'Moyen', value: 2 },
      { label: 'Pas assez testé / pas marquant', value: null },
    ],
  },
  {
    key: 'night' as const,
    question: '🌙 Le soir, il y avait de la vie sur place ?',
    answers: [
      { label: 'Oui, beaucoup', value: 5 },
      { label: 'Oui, un peu', value: 4 },
      { label: 'Plutôt calme', value: 2 },
      { label: 'Je n\'ai pas vraiment vu', value: null },
    ],
  },
  {
    key: 'culture' as const,
    question: '🗺️ Tu as trouvé facilement des choses à voir ou à faire ?',
    answers: [
      { label: 'Oui, largement', value: 5 },
      { label: 'Oui, assez pour mon séjour', value: 4 },
      { label: 'Pas tant que ça', value: 2 },
      { label: 'J\'ai vite fait le tour', value: 1 },
    ],
  },
  {
    key: 'nature' as const,
    question: '🏙️ La destination était agréable à regarder / parcourir ?',
    answers: [
      { label: 'Oui, vraiment', value: 5 },
      { label: 'Oui, plutôt', value: 4 },
      { label: 'Pas spécialement', value: 2 },
      { label: 'Ce n\'était pas son point fort', value: 1 },
    ],
  },
  {
    key: 'value' as const,
    question: '💸 Globalement, tu as trouvé que les prix étaient justifiés ?',
    answers: [
      { label: 'Oui, ça valait clairement son prix', value: 5 },
      { label: 'Oui, plutôt', value: 4 },
      { label: 'Un peu cher pour ce que c\'était', value: 2 },
      { label: 'Trop cher pour l\'expérience', value: 1 },
    ],
  },
  {
    key: 'ease' as const,
    question: '🧩 Sur place, c\'était facile de profiter du séjour ?',
    answers: [
      { label: 'Oui, très facile', value: 5 },
      { label: 'Globalement oui', value: 4 },
      { label: 'Pas toujours', value: 2 },
      { label: 'Non, trop de galères', value: 1 },
    ],
  },
  {
    key: 'memorability' as const,
    question: '✨ Cette destination t\'a laissé un vrai souvenir ?',
    answers: [
      { label: 'Oui, clairement', value: 5 },
      { label: 'Oui, quelques bons moments', value: 4 },
      { label: 'Pas vraiment', value: 2 },
      { label: 'Non, rien de marquant', value: 1 },
    ],
  },
  {
    key: 'vibeBoost' as const,
    question: '🫶 Globalement, tu t\'es senti bien là-bas ?',
    answers: [
      { label: 'Oui, direct', value: 5 },
      { label: 'Oui, globalement', value: 4 },
      { label: 'Mitigé', value: 3 },
      { label: 'Pas accroché', value: 2 },
    ],
  },
  {
    key: 'retourBonus' as const,
    question: '🔁 Avec le recul, tu y retournerais ?',
    answers: [
      { label: 'Oui, sans hésiter', value: 0.3 },
      { label: 'Oui, mais pas en priorité', value: 0.1 },
      { label: 'Pas sûr', value: 0 },
      { label: 'Non', value: -0.3 },
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

const TRIP_TYPE_OPTIONS = [
  '🏛️ Culture',
  '🍽️ Food',
  '🌿 Nature',
  '🏙️ Ville',
  '🌙 Fête',
  '🧘 Repos',
  '💻 Boulot',
  '🚗 Road trip',
]

function getIntentFromTripTypes(tripTypes: string[]): Intent {
  const labels = tripTypes.map(option => normalizeCountry(stripChipEmoji(option)))
  if (labels.includes('food')) return 'gastro'
  if (labels.includes('fete')) return 'sorties'
  if (labels.includes('boulot')) return 'travail'
  if (labels.includes('nature') || labels.includes('road trip')) return 'nature'
  if (labels.includes('ville') || labels.includes('repos')) return 'city-trip'
  return 'tourisme'
}

const STANDOUT_OPTIONS = [
  '✨ Ambiance',
  '🍽️ Bouffe',
  '🤝 Rencontres',
  '🏞️ Paysages',
  '🎯 Activités',
  '😌 Calme',
  '🌍 Dépaysement',
  '🏛️ Architecture',
  '🧩 Galères',
  '💸 Trop cher',
  '📸 Trop touristique',
  '😮‍💨 Fatigant',
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
          coupDeCoeur: false, replaceCoupDeCoeurName: '',
        }
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answeredKeys, setAnsweredKeys] = useState<Set<QuestionKey>>(new Set())
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
  const stopStateFilter = state.osmValue && ZONE_OSM_VALUES.has(state.osmValue) && state.osmValue !== 'country'
    ? (state.state || state.name)
    : undefined
  const quickStopSuggestions = getQuickStopSuggestions(state, stops)

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
    // fetch the real polygon in background — will be ready before user finishes questions
    fetchNominatimGeojson(r.name, r.country).then(geojson => {
      setState(prev => ({ ...prev, geojson }))
    })
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
    const s = state
    const score = computeScore(s)
    const tier = scoreToTier(score)
    const isZone = s.kind === 'zone'
    const lat = isZone && s.extent ? (s.extent[1] + s.extent[3]) / 2 : s.lat
    const lng = isZone && s.extent ? (s.extent[0] + s.extent[2]) / 2 : s.lng
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
      extent: s.kind === 'zone' ? s.extent : undefined,
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
      if (prev.tripTypes.length >= 2) return prev
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
            const isSelected = state.tripTypes.includes(option)
            const isDisabled = !isSelected && state.tripTypes.length >= 2
            return (
              <button
                key={option}
                className={isSelected ? 'is-selected' : ''}
                disabled={isDisabled}
                onClick={() => toggleTripType(option)}
              >
                {option}
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
    <div className="wizard-overlay" role="dialog" aria-label={isEditing ? `Modifier ${initialDestination.name}` : 'Ajouter une destination'} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="wizard-panel">
        <button className="wizard-close" aria-label="Fermer" onClick={onClose}>
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
                {suggestions.map((r, i) => (
                  <li key={i}>
                    <button onClick={() => selectSuggestion(r)}>
                      <span className="sug-name">{r.name}</span>
                      {r.country && (
                        <span className="sug-country">
                          {r.state && r.state !== r.name ? `${r.state}, ` : ''}{r.country}
                        </span>
                      )}
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
            <div className="wizard-question-counter">
              {questionIndex + 1} / {activeQuestions.length}
            </div>
            <h2 className="wizard-title">{activeQuestions[questionIndex]?.question}</h2>
            <div className="wizard-answers">
              {activeQuestions[questionIndex]?.answers.map((a, i) => {
                const questionKey = activeQuestions[questionIndex].key as QuestionKey
                return (
                  <button
                    key={i}
                    className={`wizard-answer-btn ${answeredKeys.has(questionKey) ? 'answered' : ''}`}
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
                ← Retour
              </button>
            )}
          </div>
        )}

        {step === 'profile' && (
          <div className="wizard-step">
            <div className="wizard-question-counter">
              {activeQuestions.length + 1} / {activeQuestions.length + 2}
            </div>
            <h2 className="wizard-title">Type de séjour</h2>
            {renderStayTypeFields()}
            <div className="wizard-step-actions">
              <button className="wizard-back" onClick={() => setStep('questions')}>
                Retour
              </button>
              <button className="wizard-next" onClick={() => setStep('context')}>
                Continuer
              </button>
            </div>
          </div>
        )}

        {step === 'context' && (
          <div className="wizard-step">
            <div className="wizard-question-counter">
              {activeQuestions.length + 2} / {activeQuestions.length + 2}
            </div>
            <h2 className="wizard-title">Derniers détails</h2>
            {renderTripContextFields()}
            <div className="wizard-step-actions">
              <button className="wizard-back" onClick={() => setStep('profile')}>
                Retour
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
            <div className="wizard-question-counter">
              Itineraire
            </div>
            <h2 className="wizard-title">Quelles etaient les etapes ?</h2>
            <p className="wizard-sub">
              Optionnel : ajoute seulement les stops qui racontent le trajet. La note reste globale au road trip.
            </p>
            {renderStopsSection()}
            <div className="wizard-step-actions">
              <button className="wizard-back" onClick={() => setStep('questions')}>
                Retour
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
              <button
                className="wizard-result-redo"
                onClick={() => {
                  setQuestionIndex(0)
                  setAnsweredKeys(new Set())
                  setStep('questions')
                }}
              >
                Refaire la notation
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
