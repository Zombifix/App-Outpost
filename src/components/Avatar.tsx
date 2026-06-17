import { useState } from 'react'

interface AvatarProps {
  avatarUrl?: string | null
  fallbackUrl?: string
  initials: string
  bg: string
  fg: string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
  ariaHidden?: boolean
}

export function Avatar({
  avatarUrl,
  fallbackUrl,
  initials,
  bg,
  fg,
  className = 'friends-avatar',
  style,
  ariaLabel,
  ariaHidden,
}: AvatarProps) {
  const [primaryFailed, setPrimaryFailed] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)
  const activeUrl = !primaryFailed ? (avatarUrl ?? null) : (fallbackUrl && !fallbackFailed ? fallbackUrl : null)
  const showImage = !!activeUrl
  const fallbackInitial = initials.trim().charAt(0).toUpperCase() || '·'

  return (
    <span
      className={className}
      style={showImage ? style : { background: bg, color: fg, ...style }}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    >
      {showImage ? (
        <img
          src={activeUrl}
          alt=""
          aria-hidden="true"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
          onError={() => {
            if (!primaryFailed) setPrimaryFailed(true)
            else setFallbackFailed(true)
          }}
        />
      ) : (
        fallbackInitial
      )}
    </span>
  )
}
