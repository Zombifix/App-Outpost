import { useEffect, useRef, useState } from 'react'
import type { Destination, Intent, Tier } from '../types'
import { TIER_COLORS } from '../data'

interface WizardProps {
  onClose: () => void
  onAdd: (destination: Destination) => void
}

type DestKind = 'place' | 'zone' | 'stop' | 'stage'
type WizardStep = 'search' | 'type' | 'questions' | 'result'

interface PhotonResult {
  name: string
  country: string
  lat: number
  lng: number
  extent?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
}

interface WizardState {
  name: string
  country: string
  lat: number
  lng: number
  extent?: [number, number, number, number]
  geojson?: object
  kind: DestKind
  tripName: string
  food: number
  night: number
  culture: number
  nature: number
  value: number
  vibeBoost: number   // ambiance générale boost
  retourBonus: number // "tu y retournerais" bonus
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
  const totalWeight = w.food + w.night + w.culture + w.nature + w.value
  const weighted =
    (state.food * w.food +
      state.night * w.night +
      state.culture * w.culture +
      state.nature * w.nature +
      state.value * w.value) /
    totalWeight
  const boosted = weighted + state.vibeBoost * 0.2 * ((weighted - 1) / 4)
  return Math.min(5, Math.max(1, boosted + state.retourBonus))
}

async function searchPhoton(q: string): Promise<PhotonResult[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=fr`,
  )
  const data = await res.json()
  return (data.features ?? []).map((f: Record<string, unknown>) => {
    const props = f.properties as Record<string, unknown>
    const geom = f.geometry as { coordinates: [number, number] }
    return {
      name: (props.name as string) ?? '',
      country: (props.country as string) ?? '',
      lat: geom.coordinates[1],
      lng: geom.coordinates[0],
      extent: props.extent as [number, number, number, number] | undefined,
    }
  })
}

const QUESTIONS = [
  {
    key: 'food' as const,
    question: 'La bouffe ?',
    answers: [
      { label: 'Incroyable', value: 5 },
      { label: 'Bien', value: 4 },
      { label: 'Bof', value: 2 },
      { label: 'Pas vraiment testé', value: 3 },
    ],
  },
  {
    key: 'night' as const,
    question: 'Les soirées ?',
    answers: [
      { label: 'Enflammées', value: 5 },
      { label: 'Sympas', value: 4 },
      { label: 'Calme', value: 2 },
      { label: 'Pas mon truc', value: 3 },
    ],
  },
  {
    key: 'culture' as const,
    question: 'Trucs à voir / faire ?',
    answers: [
      { label: 'Plein !', value: 5 },
      { label: 'Quelques-uns', value: 3 },
      { label: 'Plutôt vide', value: 1 },
    ],
  },
  {
    key: 'nature' as const,
    question: 'La nature, les paysages ?',
    answers: [
      { label: 'Magnifiques', value: 5 },
      { label: 'Jolis', value: 3 },
      { label: 'Inexistants', value: 2 },
    ],
  },
  {
    key: 'value' as const,
    question: 'Rapport qualité / prix ?',
    answers: [
      { label: 'Excellent', value: 5 },
      { label: 'Correct', value: 3 },
      { label: 'Cher', value: 2 },
    ],
  },
  {
    key: 'vibeBoost' as const,
    question: "L'ambiance générale ?",
    answers: [
      { label: "J'adore", value: 5 },
      { label: 'Bien', value: 4 },
      { label: 'Neutre', value: 3 },
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
  { kind: 'stop', icon: '⚡', label: 'Stop rapide', desc: 'Juste un point sur la carte' },
  { kind: 'stage', icon: '🔗', label: 'Étape d\'un voyage', desc: 'Fait partie d\'un trip' },
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

export default function AddDestinationWizard({ onClose, onAdd }: WizardProps) {
  const [step, setStep] = useState<WizardStep>('search')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PhotonResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PhotonResult | null>(null)
  const [state, setState] = useState<WizardState>({
    name: '', country: '', lat: 0, lng: 0,
    kind: 'place', tripName: '',
    food: 0, night: 0, culture: 0, nature: 0, value: 0,
    vibeBoost: 0, retourBonus: 0,
    intent: 'tourisme',
  })
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answeredKeys, setAnsweredKeys] = useState<Set<QuestionKey>>(new Set())
  const [finalScore, setFinalScore] = useState(0)
  const [finalTier, setFinalTier] = useState<Tier>('B')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'search' && inputRef.current) inputRef.current.focus()
  }, [step])

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSuggestions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await searchPhoton(query)
        setSuggestions(results)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const selectSuggestion = (r: PhotonResult) => {
    setSelected(r)
    setQuery(r.name + (r.country ? `, ${r.country}` : ''))
    setSuggestions([])
    setState(prev => ({ ...prev, name: r.name, country: r.country, lat: r.lat, lng: r.lng, extent: r.extent, geojson: undefined }))
    setStep('type')
    // fetch the real polygon in background — will be ready before user finishes questions
    fetchNominatimGeojson(r.name, r.country).then(geojson => {
      setState(prev => ({ ...prev, geojson }))
    })
  }

  const selectKind = (kind: DestKind) => {
    setState(prev => ({ ...prev, kind }))
    if (kind === 'stop') {
      finishStop({ ...state, kind })
    } else {
      setQuestionIndex(0)
      setAnsweredKeys(new Set())
      setStep('questions')
    }
  }

  const finishStop = (s: WizardState) => {
    const lat = s.extent ? (s.extent[1] + s.extent[3]) / 2 : s.lat
    const lng = s.extent ? (s.extent[0] + s.extent[2]) / 2 : s.lng
    onAdd({
      name: s.name,
      country: s.country,
      lat, lng,
      tier: 'D',
      kind: 'stop',
      food: 3, night: 3, culture: 3, nature: 3, value: 3,
      intent: 'tourisme',
      score: undefined,
      summary: 'Stop rapide ajouté à ta carte.',
    })
  }

  const answerQuestion = (key: QuestionKey, value: number | Intent) => {
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

    onAdd({
      name: s.name,
      country: s.country,
      lat, lng,
      tier: finalTier,
      kind: s.kind,
      tripName: s.kind === 'stage' ? s.tripName || undefined : undefined,
      extent: s.kind === 'zone' ? s.extent : undefined,
      geojson: s.kind === 'zone' ? s.geojson : undefined,
      food: s.food || 3,
      night: s.night || 3,
      culture: s.culture || 3,
      nature: s.nature || 3,
      value: s.value || 3,
      intent: s.intent,
      score: Math.round(finalScore * 10) / 10,
      notes: 1,
      image: DEFAULT_IMAGE,
      summary: `${TIER_LABELS[finalTier]}. ${s.name} rejoint ta tier list.`,
    })
  }

  const activeQuestions = state.kind === 'stop' ? [] : QUESTIONS

  return (
    <div className="wizard-overlay" role="dialog" aria-label="Ajouter une destination" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="wizard-panel">
        <button className="wizard-close" aria-label="Fermer" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Progress dots */}
        {step !== 'result' && (
          <div className="wizard-progress">
            {(['search', 'type', 'questions'] as WizardStep[]).map((s, i) => (
              <span key={s} className={`wizard-dot ${step === s ? 'active' : (i < ['search', 'type', 'questions'].indexOf(step) ? 'done' : '')}`} />
            ))}
          </div>
        )}

        {step === 'search' && (
          <div className="wizard-step">
            <h2 className="wizard-title">Où es-tu allé ?</h2>
            <p className="wizard-sub">Tape une ville, une région, un pays…</p>
            <div className="wizard-search-box">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Paris, Texas, Côte d'Azur…"
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
                      {r.country && <span className="sug-country">{r.country}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 'type' && selected && (
          <div className="wizard-step">
            <p className="wizard-place-name">{selected.name}</p>
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

        {step === 'questions' && (
          <div className="wizard-step">
            {state.kind === 'stage' && questionIndex === 0 && (
              <div className="wizard-trip-input">
                <label>
                  Nom du voyage
                  <input
                    placeholder="Ex: Road trip USA 2024"
                    value={state.tripName}
                    onChange={e => setState(prev => ({ ...prev, tripName: e.target.value }))}
                    className="wizard-input"
                  />
                </label>
              </div>
            )}
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
                    a.value as number | Intent,
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
            {state.kind === 'stage' && state.tripName && (
              <p className="result-trip-badge">✈ {state.tripName}</p>
            )}
            <button className="wizard-submit" onClick={confirmAdd}>
              Ajouter à ma carte
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
