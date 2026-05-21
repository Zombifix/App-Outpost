import { useEffect, useRef, useState } from 'react'
import type { Friendship } from '../../types'
import { useFriends } from '../../hooks/useFriends'

interface CompareWithFriendButtonProps {
  onPick: (friend: Friendship) => void
  compact?: boolean
}

export default function CompareWithFriendButton({ onPick, compact }: CompareWithFriendButtonProps) {
  const { accepted } = useFriends()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (accepted.length === 0) return null

  return (
    <div className={`compare-picker${compact ? ' compare-picker--compact' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="compare-picker-trigger"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4v16" />
          <path d="m3 8 4-4 4 4" />
          <path d="M17 20V4" />
          <path d="m13 16 4 4 4-4" />
        </svg>
        <span>{compact ? 'Comparer' : 'Comparer avec un ami'}</span>
        <span className={`compare-picker-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <ul className="compare-picker-menu" role="listbox">
          {accepted.map(friend => (
            <li key={friend.otherUser}>
              <button
                type="button"
                className="compare-picker-item"
                onClick={() => { setOpen(false); onPick(friend) }}
              >
                <span className="compare-picker-avatar" style={{ background: friend.avatarBg, color: friend.avatarFg }}>
                  {friend.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="compare-picker-meta">
                  <strong>{friend.displayName}</strong>
                  <small>@{friend.handle}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
