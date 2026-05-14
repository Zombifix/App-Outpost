import { useState } from 'react'
import type { Intent, NewDestinationForm } from '../types'

interface AddPanelProps {
  onAdd: (form: NewDestinationForm, coords: { lat: number; lng: number }) => void
}

const INTENTS: Array<{ key: Intent; label: string; emoji: string }> = [
  { key: 'tourisme',   label: 'Tourisme', emoji: '🏛️' },
  { key: 'sorties',    label: 'Sorties',  emoji: '🎉' },
  { key: 'gastro',     label: 'Gastro',   emoji: '🍽️' },
  { key: 'nature',     label: 'Nature',   emoji: '🌿' },
  { key: 'travail',    label: 'Travail',  emoji: '💼' },
  { key: 'city-trip',  label: 'City',     emoji: '🏙️' },
]

const AXES: Array<{ key: keyof Omit<NewDestinationForm, 'name' | 'intent'>; label: string }> = [
  { key: 'food',    label: 'Gastronomie'         },
  { key: 'night',   label: 'Sorties / nuit'      },
  { key: 'culture', label: 'Culture / histoire'  },
  { key: 'nature',  label: 'Nature / paysages'   },
  { key: 'value',   label: 'Rapport qualité/prix' },
]

const DEFAULT_RATINGS = { food: 3, night: 3, culture: 3, nature: 3, value: 3 }

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'fr,en' } }
    )
    const data = await res.json()
    if (data.length === 0) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

export default function AddPanel({ onAdd }: AddPanelProps) {
  const [name, setName] = useState('')
  const [intent, setIntent] = useState<Intent>('tourisme')
  const [ratings, setRatings] = useState({ ...DEFAULT_RATINGS })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed || loading) return
    setError(null)
    setSuccess(null)
    setLoading(true)

    const coords = await geocode(trimmed)
    setLoading(false)

    if (!coords) {
      setError(`"${trimmed}" introuvable — vérifie l'orthographe`)
      return
    }

    onAdd({ name: trimmed, intent, ...ratings }, coords)
    setSuccess(`${trimmed} ajouté !`)
    setName('')
    setRatings({ ...DEFAULT_RATINGS })
    setTimeout(() => setSuccess(null), 2500)
  }

  return (
    <div className="panel panel-right" style={{ top: 72, right: 16, width: 272, zIndex: 40 }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Ajouter une destination
      </div>

      {/* City input */}
      <input
        value={name}
        onChange={e => { setName(e.target.value); setError(null) }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="Ville ou pays…"
        style={{
          width: '100%',
          padding: '7px 10px',
          fontSize: 13,
          border: `0.5px solid ${error ? '#e74c3c' : 'rgba(0,0,0,0.12)'}`,
          borderRadius: 8,
          outline: 'none',
          marginBottom: 4,
          color: '#1a1a1a',
          transition: 'border-color 0.15s',
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: '#e74c3c', marginBottom: 8 }}>{error}</div>
      )}
      {success && (
        <div style={{ fontSize: 11, color: '#639922', marginBottom: 8, fontWeight: 500 }}>✓ {success}</div>
      )}
      {!error && !success && <div style={{ marginBottom: 8 }} />}

      {/* Intent pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {INTENTS.map(({ key, label, emoji }) => (
          <button
            key={key}
            onClick={() => setIntent(key)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 999,
              border: `0.5px solid ${intent === key ? '#06111f' : 'rgba(0,0,0,0.12)'}`,
              background: intent === key ? '#06111f' : 'white',
              color: intent === key ? 'white' : '#555',
              transition: 'all 0.12s',
              fontWeight: intent === key ? 500 : 400,
            }}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Star axes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {AXES.map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#555', flex: 1 }}>{label}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRatings(r => ({ ...r, [key]: n }))}
                  style={{ fontSize: 15, color: ratings[key] >= n ? '#EF9F27' : '#e0e0e0', lineHeight: 1, padding: '0 1px', transition: 'color 0.1s' }}
                  onMouseEnter={e => { if (ratings[key] < n) e.currentTarget.style.color = '#EF9F2788' }}
                  onMouseLeave={e => { e.currentTarget.style.color = ratings[key] >= n ? '#EF9F27' : '#e0e0e0' }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          width: '100%',
          padding: '9px 0',
          background: loading ? '#888' : '#06111f',
          color: 'white',
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 8,
          transition: 'opacity 0.1s, background 0.2s',
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {loading ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', fontSize: 13 }}>◌</span>
            Localisation…
          </>
        ) : 'Ajouter'}
      </button>
    </div>
  )
}
