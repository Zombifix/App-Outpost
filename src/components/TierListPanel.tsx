import type { Destination } from '../types'
import { TIER_COLORS, TIER_ORDER } from '../data'

interface TierListPanelProps {
  destinations: Destination[]
  onFlyTo: (name: string) => void
}

export default function TierListPanel({ destinations, onFlyTo }: TierListPanelProps) {
  return (
    <div
      className="panel scrollable"
      style={{
        top: 72,
        left: 16,
        width: 232,
        maxHeight: 'calc(100vh - 88px)',
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
        Mes destinations
      </div>

      {TIER_ORDER.map(tier => {
        const items = destinations.filter(d => d.tier === tier)
        if (items.length === 0) return null
        return (
          <div key={tier} style={{ marginBottom: 10 }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 500,
                fontSize: 17,
                color: TIER_COLORS[tier].label,
                marginBottom: 4,
                paddingBottom: 4,
                borderBottom: `1.5px solid ${TIER_COLORS[tier].pin}33`,
              }}
            >
              {tier}
            </div>
            {items.map(dest => (
              <button
                key={dest.name}
                onClick={() => onFlyTo(dest.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '5px 4px',
                  borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#1a1a1a',
                  borderRadius: 6,
                  transition: 'background 0.1s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: TIER_COLORS[dest.tier].pin,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{dest.name}</span>
                <span style={{ fontSize: 14 }}>{dest.country}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
