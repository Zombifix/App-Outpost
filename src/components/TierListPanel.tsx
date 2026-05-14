import type { Destination } from '../types'
import { TIER_COLORS, TIER_ORDER } from '../data'

interface TierListPanelProps {
  destinations: Destination[]
  onFlyTo: (name: string) => void
}

export default function TierListPanel({ destinations, onFlyTo }: TierListPanelProps) {
  return (
    <div
      className="panel scrollable panel-left"
      style={{
        top: 72,
        left: 16,
        width: 236,
        maxHeight: 'calc(100vh - 92px)',
        zIndex: 40,
        padding: '14px 0 6px',
      }}
    >
      <div style={{ paddingLeft: 14, paddingRight: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Mes voyages
        </div>
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
          {destinations.length} {destinations.length <= 1 ? 'destination' : 'destinations'} visitées
        </div>
      </div>

      {TIER_ORDER.map(tier => {
        const items = destinations.filter(d => d.tier === tier)
        if (items.length === 0) return null
        const { pin, label } = TIER_COLORS[tier]

        return (
          <div key={tier} style={{ marginBottom: 2 }}>
            {/* Tier header avec badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 14px',
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 500,
                  fontSize: 13,
                  color: label,
                  background: pin + '18',
                  border: `1px solid ${pin}40`,
                  borderRadius: 6,
                  width: 26,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                {tier}
              </span>
              <div
                style={{
                  flex: 1,
                  height: '0.5px',
                  background: pin + '30',
                }}
              />
              <span style={{ fontSize: 10, color: '#bbb', fontWeight: 400 }}>
                {items.length}
              </span>
            </div>

            {/* Items */}
            {items.map(dest => (
              <button
                key={dest.name}
                onClick={() => onFlyTo(dest.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#1a1a1a',
                  borderRadius: 0,
                  transition: 'background 0.1s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: TIER_COLORS[dest.tier].pin,
                    flexShrink: 0,
                    boxShadow: `0 0 5px ${TIER_COLORS[dest.tier].pin}88`,
                  }}
                />
                <span style={{ flex: 1 }}>{dest.name}</span>
                <span style={{ fontSize: 13 }}>{dest.country}</span>
              </button>
            ))}

            <div style={{ height: 6 }} />
          </div>
        )
      })}
    </div>
  )
}
