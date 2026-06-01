import { useState } from 'react'

interface AvatarProps {
  avatarUrl?: string | null
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
  initials,
  bg,
  fg,
  className = 'friends-avatar',
  style,
  ariaLabel,
  ariaHidden,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!avatarUrl && !imgFailed

  return (
    <span
      className={className}
      style={showImage ? style : { background: bg, color: fg, ...style }}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        initials.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}
