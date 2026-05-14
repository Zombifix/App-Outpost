import { useState } from 'react'
import type { Intent, NewDestinationForm } from '../types'
import { CITY_COORDS } from '../data'

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
  { key: 'food',    label: 'Gastronomie'        },
  { key: 'night',   label: 'Sorties / nuit'     },
  { key: 'culture', label: 'Culture / histoire' },
  { key: 'nature',  label: 'Nature / paysages'  },
  { key: 'value',   label: 'Rapport qualité/prix'},
]

const DEFAULT_RATINGS = { food: 3, night: 3, culture: 3, nature: 3, value: 3 }

export default function AddPanel({ onAdd }: AddPanelProps) {
  const [name, setName] = useState('')
  const [intent, setIntent] = useState<Intent>('tourisme')
  const [ratings, setRatings] = useState({ ...DEFAULT_RATINGS })
  const [notFound, setNotFound] = useState(false)

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return

    const coords = CITY_COORDS[trimmed]
    if (!coords) {
      setNotFound(true)
      return
    }
    setNotFound(false)
    onAdd({ name: trimmed, intent, ...ratings }, coords)
    setName('')
    setRatings({ ...DEFAULT_RATINGS })
  }

  return (
    <div
      className="panel"
      style={{
        top: 72,
        right: 16,
        width: 272,
        zIndex: 40,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: '#999',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}
      >
        Ajouter une destination
      </div>

      {/* City input */}
      <input
        value={name}
        onChange={e => { setName(e.target.value); setNotFound(false) }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="Ville…"
        style={{
          width: '100%',
          padding: '7px 10px',
          fontSize: 13,
          fontWeight: 400,
          border: '0.5px solid rgba(0,0,0,0.12)',
          borderRadius: 8,
          outline: 'none',
          marginBottom: notFound ? 4 : 10,
          color: '#1a1a1a',
        }}
      />
      {notFound && (
        <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 8 }}>
          Ville non trouvée. Essayez: Paris, Tokyo, Barcelone…
        </div>
      )}

      {/* Intent pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {INTENTS.map(({ key, label, emoji }) => (
          <button
            key={key}
            onClick={() => setIntent(key)}
            style={{
              fontSize: 11,
              fontWeight: 400,
              padding: '3px 9px',
              borderRadius: 999,
              border: '0.5px solid rgba(0,0,0,0.12)',
              background: intent === key ? '#06111f' : 'white',
              color: intent === key ? 'white' : '#444',
              transition: 'all 0.12s',
            }}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Star axes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
        {AXES.map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#555', flex: 1 }}>{label}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRatings(r => ({ ...r, [key]: n }))}
                  style={{
                    fontSize: 15,
                    color: ratings[key] >= n ? '#EF9F27' : '#d8d8d8',
                    lineHeight: 1,
                    padding: '0 1px',
                    transition: 'color 0.1s',
                  }}
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
        style={{
          width: '100%',
          padding: '8px 0',
          background: '#06111f',
          color: 'white',
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 8,
          transition: 'opacity 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Ajouter
      </button>
    </div>
  )
}
