export default function Nav() {
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
        background: 'linear-gradient(to bottom, rgba(6,17,31,0.75) 0%, transparent 100%)',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 22,
          color: 'white',
          letterSpacing: '0.02em',
          pointerEvents: 'auto',
        }}
      >
        Wander
      </span>

      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 500,
          color: 'white',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        TP
      </div>
    </div>
  )
}
