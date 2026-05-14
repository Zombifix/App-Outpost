interface NavProps {
  totalDestinations: number
}

export default function Nav({ totalDestinations }: NavProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'linear-gradient(to bottom, rgba(6,17,31,0.85) 0%, transparent 100%)',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, pointerEvents: 'auto' }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 22,
          color: 'white',
          letterSpacing: '0.02em',
        }}>
          Outpost
        </span>
        {totalDestinations > 0 && (
          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 400,
          }}>
            {totalDestinations} {totalDestinations === 1 ? 'lieu' : 'lieux'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto' }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 500,
          color: 'white',
          cursor: 'pointer',
        }}>
          TP
        </div>
      </div>
    </div>
  )
}
