import type { Friend } from '../types'

interface FriendsPanelProps {
  friends: Friend[]
}

export default function FriendsPanel({ friends }: FriendsPanelProps) {
  return (
    <div
      className="panel"
      style={{
        right: 16,
        bottom: 136,
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
        Amis
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {friends.map((f, i) => (
          <div
            key={f.initials}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: i < friends.length - 1 ? '0.5px solid rgba(0,0,0,0.07)' : 'none',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: f.bg,
                color: f.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {f.initials}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{f.count} destinations</div>
            </div>

            <button
              style={{
                fontSize: 11,
                fontWeight: 400,
                padding: '3px 10px',
                borderRadius: 6,
                border: '0.5px solid rgba(0,0,0,0.12)',
                background: 'white',
                color: '#444',
                flexShrink: 0,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              Comparer
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#888',
          textAlign: 'center',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(0,0,0,0.2)',
        }}
      >
        + Ajouter un ami
      </div>
    </div>
  )
}
