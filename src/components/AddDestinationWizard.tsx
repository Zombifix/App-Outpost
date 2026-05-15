import { useEffect, useRef, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from '../types'
import { TIER_COLORS } from '../data'

interface WizardProps {
  onClose: () => void
  onAdd: (destination: Destination) => void
  initialDestination?: Destination
  onUpdate?: (destination: Destination) => void
}

type DestKind = 'place' | 'zone' | 'stop' | 'stage'
type WizardStep = 'search' | 'type' | 'questions' | 'result'

interface PhotonResult {
  name: string
  country: string
  state?: string
  osmValue?: string
  lat: number
  lng: number
  extent?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

const ZONE_OSM_VALUES = new Set(['country', 'state', 'region', 'province', 'county', 'department', 'district'])
const PLACE_OSM_VALUES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'locality'])

interface WizardState {
  name: string
  country: string
  state?: string
  osmValue?: string
  lat: number
  lng: number
  extent?: [number, number, number, number]
  geojson?: object
  kind: DestKind
  tripName: string
  food: number | null
  night: number | null
  culture: number | null
  nature: number | null
  value: number | null
  vibeBoost: number | null
  retourBonus: number
  intent: Intent
}

async function fetchNominatimGeojson(name: string, country: string): Promise<object | undefined> {
  const q = country ? `${name}, ${country}` : name
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=geojson&polygon_geojson=1&polygon_threshold=0.01&limit=1`,
      { headers: { 'Accept-Language': 'fr' } },
    )
    const data = await res.json()
    return (data.features?.[0]?.geometry as object | undefined)
  } catch {
    return undefined
  }
}

const INTENT_WEIGHTS: Record<Intent, Record<string, number>> = {
  gastro:     { food: 2.0, night: 1.0, culture: 1.0, nature: 1.0, value: 1.0 },
  nature:     { food: 1.0, night: 0.8, culture: 1.0, nature: 2.0, value: 1.1 },
  sorties:    { food: 1.2, night: 1.8, culture: 1.0, nature: 0.8, value: 1.0 },
  tourisme:   { food: 1.0, night: 1.0, culture: 1.5, nature: 1.2, value: 1.0 },
  travail:    { food: 1.1, night: 0.8, culture: 1.0, nature: 0.9, value: 1.5 },
  'city-trip': { food: 1.0, night: 1.0, culture: 1.0, nature: 1.0, value: 1.0 },
}

function scoreToTier(score: number): Tier {
  if (score >= 4.5) return 'S'
  if (score >= 3.5) return 'A'
  if (score >= 2.5) return 'B'
  if (score >= 1.5) return 'C'
  return 'D'
}

function computeScore(state: WizardState): number {
  const w = INTENT_WEIGHTS[state.intent]
  const axes = [
    ['food', state.food],
    ['night', state.night],
    ['culture', state.culture],
    ['nature', state.nature],
    ['value', state.value],
  ] as const
  const active = axes.filter(([, v]) => v !== null) as [string, number][]
  const totalWeight = active.reduce((sum, [k]) => sum + w[k], 0)
  const weighted = totalWeight === 0 ? 3 : active.reduce((sum, [k, v]) => sum + v * w[k], 0) / totalWeight
  const vibe = state.vibeBoost ?? 3
  const boosted = weighted + vibe * 0.2 * ((weighted - 1) / 4)
  return Math.min(5, Math.max(1, boosted + state.retourBonus))
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
    onChange({ name: r.name, lat: r.lat, lng: r.lng })
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
            onChange({ name: e.target.value, lat: NaN, lng: NaN })
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
  const params = [`q=${encodeURIComponent(q)}`, 'limit=15', 'lang=fr']
  if (Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    params.push(`lat=${opts.lat}`, `lon=${opts.lng}`, 'location_bias_scale=0.3')
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params.join('&')}`)
  const data = await res.json()
  let all: PhotonResult[] = (data.features ?? []).map((f: Record<string, unknown>) => {
    const props = f.properties as Record<string, unknown>
    const geom = f.geometry as { coordinates: [number, number] }
    return {
      name: (props.name as string) ?? '',
      country: (props.country as string) ?? '',
      state: (props.state as string) ?? undefined,
      osmValue: (props.osm_value as string) ?? undefined,
      lat: geom.coordinates[1],
      lng: geom.coordinates[0],
      extent: props.extent as [number, number, number, number] | undefined,
    }
  })

  if (opts.kindFilter === 'place') {
    all = all.filter(r => r.osmValue && PLACE_OSM_VALUES.has(r.osmValue))
  } else if (opts.kindFilter === 'zone') {
    all = all.filter(r => r.osmValue && ZONE_OSM_VALUES.has(r.osmValue))
  }

  if (opts.state) {
    // Filtre strict : si la zone est un état/région, on n'accepte QUE des résultats
    // dans cet état (peu importe le résultat — on retourne vide si rien ne match).
    const target = normalizeCountry(opts.state)
    return all.filter(r => r.state && normalizeCountry(r.state) === target).slice(0, 6)
  }
  if (opts.country) {
    // Filtre strict aussi pour les pays : on n'accepte que des villes du pays.
    const target = normalizeCountry(opts.country)
    return all.filter(r => normalizeCountry(r.country) === target).slice(0, 6)
  }
  return all.slice(0, 6)
}

const QUESTIONS = [
  {
    key: 'food' as const,
    question: 'La bouffe ?',
    answers: [
      { label: 'Incroyable', value: 5 },
      { label: 'Bien', value: 4 },
      { label: 'Bof', value: 2 },
      { label: 'Pas vraiment testé', value: null },
    ],
  },
  {
    key: 'night' as const,
    question: 'Les soirées ?',
    answers: [
      { label: 'Enflammées', value: 5 },
      { label: 'Sympas', value: 4 },
      { label: 'Calme', value: 2 },
      { label: 'Pas mon truc', value: null },
    ],
  },
  {
    key: 'culture' as const,
    question: 'Trucs à voir / faire ?',
    answers: [
      { label: 'Plein !', value: 5 },
      { label: 'Quelques-uns', value: 3 },
      { label: 'Peu de choses', value: 2 },
      { label: 'Rien à faire', value: 1 },
    ],
  },
  {
    key: 'nature' as const,
    question: 'La nature, les paysages ?',
    answers: [
      { label: 'Magnifiques', value: 5 },
      { label: 'Jolis', value: 3 },
      { label: 'Bof', value: 2 },
      { label: 'Inexistants', value: 1 },
    ],
  },
  {
    key: 'value' as const,
    question: 'Rapport qualité / prix ?',
    answers: [
      { label: 'Excellent', value: 5 },
      { label: 'Correct', value: 3 },
      { label: 'Cher', value: 2 },
      { label: 'Trop cher', value: 1 },
    ],
  },
  {
    key: 'vibeBoost' as const,
    question: "L'ambiance générale ?",
    answers: [
      { label: "J'adore", value: 5 },
      { label: 'Bien', value: 4 },
      { label: 'Neutre', value: 3 },
      { label: 'Bof', value: 2 },
    ],
  },
  {
    key: 'retourBonus' as const,
    question: 'Tu y retournerais ?',
    answers: [
      { label: 'Oui, direct !', value: 0.3 },
      { label: 'Pourquoi pas', value: 0 },
      { label: 'Non', value: -0.3 },
    ],
  },
  {
    key: 'intent' as const,
    question: 'Ce voyage, ça ressemblait à…',
    answers: [
      { label: 'Culture & histoire', value: 'tourisme' as Intent },
      { label: 'Nature & grand air', value: 'nature' as Intent },
      { label: 'Gastronomie', value: 'gastro' as Intent },
      { label: 'Soirées & nightlife', value: 'sorties' as Intent },
      { label: 'Détente & balade', value: 'city-trip' as Intent },
      { label: 'Boulot / perso', value: 'travail' as Intent },
    ],
  },
]

type QuestionKey = 'food' | 'night' | 'culture' | 'nature' | 'value' | 'vibeBoost' | 'retourBonus' | 'intent'

const TYPE_OPTIONS: { kind: DestKind; icon: string; label: string; desc: string }[] = [
  { kind: 'place', icon: '📍', label: 'Destination', desc: 'Une ville ou un endroit précis' },
  { kind: 'zone', icon: '🗺️', label: 'Road trip / Zone', desc: 'Une région, un itinéraire' },
]

const TIER_LABELS: Record<Tier, string> = {
  S: 'Exceptionnel',
  A: 'Génial',
  B: 'Très bien',
  C: 'Correct',
  D: 'Décevant',
}

const TIER_EXPLANATIONS: Record<Tier, string> = {
  S: 'Un endroit que tu n\'oublieras pas. Il rejoint ton top absolu.',
  A: 'Vraiment bien. Tu recommanderais sans hésiter.',
  B: 'Une bonne expérience dans l\'ensemble, avec quelques bémols.',
  C: 'Mitigé. Ça valait le déplacement, mais rien d\'exceptionnel.',
  D: 'Pas le meilleur souvenir. Mieux vaut noter pour ne pas y retourner.',
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'

export default function AddDestinationWizard({ onClose, onAdd, initialDestination, onUpdate }: WizardProps) {
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
          state: initialDestination.state,
          osmValue: initialDestination.osmValue,
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
          vibeBoost: null,
          retourBonus: 0,
          intent: initialDestination.intent,
        }
      : {
          name: '', country: '', state: undefined, osmValue: undefined, lat: 0, lng: 0,
          kind: 'place', tripName: '',
          food: null, night: null, culture: null, nature: null, value: null,
          vibeBoost: null, retourBonus: 0,
          intent: 'tourisme',
        }
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answeredKeys, setAnsweredKeys] = useState<Set<QuestionKey>>(new Set())
  const [finalScore, setFinalScore] = useState(0)
  const [finalTier, setFinalTier] = useState<Tier>('B')
  const [stops, setStops] = useState<RoadTripStop[]>(
    isEditing && initialDestination.stops?.length ? initialDestination.stops : []
  )
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // En mode édition, précalculer le score/tier depuis les valeurs initiales
  // pour ne pas afficher 0 / 'B' sur l'écran résultat.
  useEffect(() => {
    if (isEditing && step === 'result' && finalScore === 0) {
      const score = computeScore(state)
      setFinalScore(score)
      setFinalTier(scoreToTier(score))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setSelected(r)
    setQuery(r.name + (r.country ? `, ${r.country}` : ''))
    setSuggestions([])
    setState(prev => ({
      ...prev,
      name: r.name,
      country: r.country,
      state: r.state,
      osmValue: r.osmValue,
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

  const answerQuestion = (key: QuestionKey, value: number | null | Intent) => {
    setState(prev => ({ ...prev, [key]: value }))
    setAnsweredKeys(prev => new Set([...prev, key]))

    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex(i => i + 1)
    } else {
      const nextState = { ...state, [key]: value }
      const score = computeScore(nextState as WizardState)
      const tier = scoreToTier(score)
      setFinalScore(score)
      setFinalTier(tier)
      setStep('result')
    }
  }

  const confirmAdd = () => {
    const s = state
    const isZone = s.kind === 'zone'
    const lat = isZone && s.extent ? (s.extent[1] + s.extent[3]) / 2 : s.lat
    const lng = isZone && s.extent ? (s.extent[0] + s.extent[2]) / 2 : s.lng

    const result: Destination = {
      name: s.name,
      country: s.country,
      lat, lng,
      tier: finalTier,
      kind: s.kind,
      stops: s.kind === 'zone'
        ? stops.filter(st => st.name.trim() && Number.isFinite(st.lat) && Number.isFinite(st.lng))
        : undefined,
      extent: s.kind === 'zone' ? s.extent : undefined,
      geojson: s.kind === 'zone' ? s.geojson : undefined,
      state: s.state,
      osmValue: s.osmValue,
      food: s.food || 3,
      night: s.night || 3,
      culture: s.culture || 3,
      nature: s.nature || 3,
      value: s.value || 3,
      intent: s.intent,
      score: Math.round(finalScore * 10) / 10,
      notes: isEditing ? (initialDestination.notes ?? 1) : 1,
      image: isEditing ? initialDestination.image : DEFAULT_IMAGE,
      summary: `${TIER_LABELS[finalTier]}. ${s.name} — tier mis à jour.`,
    }

    if (isEditing && onUpdate) {
      onUpdate(result)
    } else {
      onAdd(result)
    }
  }

  const activeQuestions = QUESTIONS

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
            {(['type', 'search', 'questions'] as WizardStep[]).map((s, i) => (
              <span key={s} className={`wizard-dot ${step === s ? 'active' : (i < ['type', 'search', 'questions'].indexOf(step) ? 'done' : '')}`} />
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
              {activeQuestions[questionIndex]?.answers.map((a, i) => (
                <button
                  key={i}
                  className={`wizard-answer-btn ${answeredKeys.has(activeQuestions[questionIndex].key as QuestionKey) ? 'answered' : ''}`}
                  onClick={() => answerQuestion(
                    activeQuestions[questionIndex].key as QuestionKey,
                    a.value as number | null | Intent,
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {questionIndex > 0 && (
              <button className="wizard-back" onClick={() => setQuestionIndex(i => i - 1)}>
                ← Retour
              </button>
            )}
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
              {(['food', 'night', 'culture', 'nature', 'value'] as const).map(axis => {
                const val = state[axis] || 3
                const label = { food: 'Bouffe', night: 'Soirées', culture: 'Activités', nature: 'Nature', value: 'Prix' }[axis]
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
            {state.kind === 'zone' && (
              <div className="wizard-stops">
                <p className="wizard-stops-title">Étapes du road trip <span>(optionnel)</span></p>
                {stops.map((stop, i) => (
                  <StopAutocomplete
                    key={i}
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
                ))}
                {stops.length < 7 && (
                  <button
                    className="wizard-add-stop"
                    onClick={() => setStops([...stops, { name: '', lat: NaN, lng: NaN }])}
                  >
                    + Ajouter une étape
                  </button>
                )}
              </div>
            )}
            <button className="wizard-submit" onClick={confirmAdd}>
              {isEditing ? 'Enregistrer les modifications' : 'Ajouter à ma carte'}
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
