import type { Destination, Friend, Tier } from '../types'
import { TIER_COLORS, TIER_ORDER, FRIEND_DESTINATIONS } from '../data'
import { destinationNameKey, destinationNameSet } from '../utils/destinationIdentity'

interface CompareViewProps {
  friend: Friend
  myDestinations: Destination[]
  onClose: () => void
}

function Stars({ value, small }: { value: number; small?: boolean }) {
  const size = small ? 10 : 11
  return (
    <span style={{ fontSize: size, letterSpacing: 0.5 }}>
      <span style={{ color: '#EF9F27' }}>{'★'.repeat(value)}</span>
      <span style={{ color: '#e0e0e0' }}>{'★'.repeat(5 - value)}</span>
    </span>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const { pin, label } = TIER_COLORS[tier]
  return (
    <span style={{
      fontFamily: 'var(--font-serif)',
      fontSize: 11,
      fontWeight: 500,
      color: label,
      background: pin + '18',
      border: `0.5px solid ${pin}44`,
      borderRadius: 4,
      padding: '1px 5px',
      lineHeight: 1.6,
      flexShrink: 0,
    }}>
      {tier}
    </span>
  )
}

function DestList({ destinations, label, color }: { destinations: Destination[]; label: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        {label}
      </div>
      {TIER_ORDER.map(tier => {
        const items = destinations.filter(d => d.tier === tier)
        if (items.length === 0) return null
        const { pin } = TIER_COLORS[tier]
        return (
          <div key={tier} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}>
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 12,
                fontWeight: 500,
                color: TIER_COLORS[tier].label,
                background: pin + '18',
                border: `0.5px solid ${pin}40`,
                borderRadius: 4,
                width: 22,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>{tier}</span>
              <div style={{ flex: 1, height: '0.5px', background: pin + '25' }} />
            </div>
            {items.map(dest => (
              <div key={dest.name} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '4px 0 4px 4px',
                borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                fontSize: 12,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: pin, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 400, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dest.name}
                </span>
                <span style={{ fontSize: 12 }}>{dest.country}</span>
              </div>
            ))}
          </div>
        )
      })}
      {destinations.length === 0 && (
        <div style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>Aucune destination</div>
      )}
    </div>
  )
}

function CommonDests({ mine, theirs }: { mine: Destination[]; theirs: Destination[] }) {
  const myNames = destinationNameSet(mine)
  const common = theirs.filter(d => myNames.has(destinationNameKey(d)))
  if (common.length === 0) return null

  return (
    <div style={{
      margin: '16px 0 0',
      padding: '12px',
      background: 'rgba(99,153,34,0.06)',
      border: '0.5px solid rgba(99,153,34,0.2)',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Destinations en commun · {common.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {common.map(d => {
          const myDest = mine.find(m => destinationNameKey(m) === destinationNameKey(d))!
          return (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span>{d.country}</span>
              <span style={{ fontWeight: 500, color: '#1a1a1a' }}>{d.name}</span>
              <TierBadge tier={myDest.tier ?? 'D'} />
              <span style={{ color: '#bbb' }}>vs</span>
              <TierBadge tier={d.tier ?? 'D'} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CompareView({ friend, myDestinations, onClose }: CompareViewProps) {
  const theirDestinations = FRIEND_DESTINATIONS[friend.initials] ?? []

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6,17,31,0.55)',
          zIndex: 60,
          animation: 'fade-in 0.2s ease',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 520,
        maxWidth: '92vw',
        height: '100vh',
        background: 'white',
        zIndex: 61,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slide-in 0.25s cubic-bezier(0.22,1,0.36,1)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '18px 20px',
          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: friend.bg,
            color: friend.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 500,
            flexShrink: 0,
          }}>
            {friend.initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 15, color: '#1a1a1a' }}>
              Toi vs {friend.name}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
              {myDestinations.length} destinations · {theirDestinations.length} destinations
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.06)',
              fontSize: 16,
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Common destinations banner */}
        <div style={{ padding: '0 20px', flexShrink: 0 }}>
          <CommonDests mine={myDestinations} theirs={theirDestinations} />
        </div>

        {/* Side-by-side lists */}
        <div style={{
          display: 'flex',
          gap: 16,
          padding: '16px 20px',
          flex: 1,
          overflowY: 'auto',
          scrollbarWidth: 'none',
        }}>
          <DestList destinations={myDestinations} label="Moi" color="#06111f" />
          <div style={{ width: '0.5px', background: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />
          <DestList destinations={theirDestinations} label={friend.name} color={friend.color} />
        </div>
      </div>
    </>
  )
}
