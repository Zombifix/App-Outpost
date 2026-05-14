import type { Friend } from '../types'

interface FriendsPanelProps {
  friends: Friend[]
  onCompare: (friend: Friend) => void
}

export default function FriendsPanel({ friends, onCompare }: FriendsPanelProps) {
  return (
    <div
      className="panel panel-right panel-friends"
      style={{ right: 16, bottom: 152, width: 272, zIndex: 40 }}
    >
      <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Amis
      </div>

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
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: f.bg, color: f.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 500, flexShrink: 0,
          }}>
            {f.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{f.name}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{f.count} destinations</div>
          </div>
          <button
            onClick={() => onCompare(f)}
            style={{
              fontSize: 11, fontWeight: 500, padding: '4px 11px',
              borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)',
              background: 'white', color: '#333', flexShrink: 0,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#06111f'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#06111f' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#333'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)' }}
          >
            Comparer
          </button>
        </div>
      ))}

      <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', textAlign: 'center', cursor: 'pointer', textDecorationLine: 'underline', textDecorationColor: 'rgba(0,0,0,0.15)' }}>
        + Ajouter un ami
      </div>
    </div>
  )
}
