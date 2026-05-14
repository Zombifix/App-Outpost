import type { FeedItem, Friend } from '../types'
import { TIER_COLORS } from '../data'

interface ActivityFeedProps {
  feed: FeedItem[]
  friends: Friend[]
}

export default function ActivityFeed({ feed, friends }: ActivityFeedProps) {
  const friendMap = Object.fromEntries(friends.map(f => [f.initials, f]))

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        height: 128,
        background: 'linear-gradient(to top, #06111f 55%, transparent 100%)',
        display: 'flex',
        alignItems: 'flex-end',
        paddingBottom: 16,
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
            <div
              key={i}
              style={{
                flexShrink: 0,
                width: 168,
                background: 'rgba(255,255,255,0.07)',
                border: '0.5px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              {/* Header: avatar + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: friend?.bg ?? '#eee',
                    color: friend?.color ?? '#333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {item.friend}
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {friend?.name ?? item.friend}
                </span>
              </div>

              {/* Destination */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15 }}>{item.flag}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'white', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.dest}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: tierColor.pin,
                    flexShrink: 0,
                  }}
                >
                  {item.tier}
                </span>
              </div>

              {/* Time */}
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{item.time}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
