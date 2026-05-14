import type { FeedItem, Friend } from '../types'
import { TIER_COLORS } from '../data'

interface ActivityFeedProps {
  feed: FeedItem[]
  friends: Friend[]
  onFlyTo: (lat: number, lng: number, name: string) => void
}

export default function ActivityFeed({ feed, friends, onFlyTo }: ActivityFeedProps) {
  const friendMap = Object.fromEntries(friends.map(f => [f.initials, f]))

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        height: 140,
        background: 'linear-gradient(to top, rgba(6,17,31,0.98) 55%, transparent 100%)',
        display: 'flex',
        alignItems: 'flex-end',
        paddingBottom: 18,
        paddingLeft: 20,
        paddingRight: 20,
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 10,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          width: '100%',
          pointerEvents: 'auto',
        }}
      >
        {feed.map((item, i) => {
          const friend = friendMap[item.friend]
          const tierColor = TIER_COLORS[item.tier]

          return (
            <button
              key={i}
              onClick={() => onFlyTo(item.lat, item.lng, item.dest)}
              style={{
                flexShrink: 0,
                width: 172,
                background: 'rgba(255,255,255,0.06)',
                border: '0.5px solid rgba(255,255,255,0.14)',
                borderRadius: 12,
                padding: '11px 13px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.11)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {/* Destination + tier */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 16 }}>{item.flag}</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.92)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.dest}
                </span>
                <span style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: tierColor.pin,
                  background: tierColor.pin + '22',
                  border: `0.5px solid ${tierColor.pin}55`,
                  borderRadius: 5,
                  padding: '1px 6px',
                  flexShrink: 0,
                  lineHeight: 1.6,
                }}>
                  {item.tier}
                </span>
              </div>

              {/* Friend + time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: friend?.bg ?? 'rgba(255,255,255,0.15)',
                  color: friend?.color ?? 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 500,
                  flexShrink: 0,
                }}>
                  {item.friend}
                </div>
                <span style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.38)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {friend?.name ?? item.friend} · {item.time}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
