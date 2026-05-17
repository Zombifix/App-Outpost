import { useEffect, useRef, useState } from 'react'
import type { Destination } from '../types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { Icon } from './Icon'

interface DestinationSheetProps {
  destination: Destination
  coupDeCoeur: boolean
  coupDeCoeurCount: number
  onClose: () => void
  onFocus: () => void
  onCoupDeCoeur: () => void
  onEdit: (destination: Destination) => void
  onDelete: (name: string) => void
}

type SnapState = 'peek' | 'full'

const PEEK_RATIO = 0.62
const FULL_RATIO = 0.12
const CLOSE_RATIO = 0.85

export default function DestinationSheet(props: DestinationSheetProps) {
  const isMobile = useMediaQuery('(max-width: 760px)')

  if (isMobile) return <MobileSheet {...props} />
  return (
    <aside className="destination-card" aria-label={`Detail de ${props.destination.name}`}>
      <DestinationCardContent {...props} />
    </aside>
  )
}

type DragState = { startY: number; lastY: number; lastT: number; v: number; current: number } | null

function MobileSheet(props: DestinationSheetProps) {
  const sheetRef = useRef<HTMLElement | null>(null)
  const [snap, setSnap] = useState<SnapState>('peek')
  const dragRef = useRef<DragState>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)

  // Reset to peek when destination changes
  useEffect(() => {
    setSnap('peek')
    setDragOffset(0)
  }, [props.destination.name])

  // Lock body scroll while sheet open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement
    try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    dragRef.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), v: 0, current: 0 }
    setIsDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const delta = e.clientY - d.startY
    const now = performance.now()
    const dt = now - d.lastT
    const v = dt > 0 ? (e.clientY - d.lastY) / dt : 0
    dragRef.current = { ...d, lastY: e.clientY, lastT: now, v, current: delta }
    setDragOffset(delta)
  }

  const onPointerUp = () => {
    const d = dragRef.current
    if (!d) return
    const vh = window.innerHeight
    const moved = Math.abs(d.current)
    const baseTop = snap === 'peek' ? vh * PEEK_RATIO : vh * FULL_RATIO
    const finalTop = baseTop + d.current
    const velocity = d.v

    dragRef.current = null
    setIsDragging(false)
    setDragOffset(0)

    if (moved < 6) {
      setSnap(s => (s === 'peek' ? 'full' : 'peek'))
      return
    }
    if (finalTop > vh * CLOSE_RATIO || velocity > 1.2) {
      props.onClose()
      return
    }
    if (velocity < -0.6) { setSnap('full'); return }
    if (velocity > 0.6) { setSnap('peek'); return }
    const midpoint = vh * ((PEEK_RATIO + FULL_RATIO) / 2)
    setSnap(finalTop < midpoint ? 'full' : 'peek')
  }

  const style: React.CSSProperties = isDragging
    ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
    : {}

  return (
    <div className="destination-sheet-backdrop" onClick={props.onClose} role="presentation">
      <aside
        ref={sheetRef}
        className={`destination-sheet is-${snap}${isDragging ? ' is-dragging' : ''}`}
        aria-label={`Detail de ${props.destination.name}`}
        onClick={e => e.stopPropagation()}
        style={style}
      >
        <button
          className="destination-sheet-handle"
          aria-label={snap === 'peek' ? 'Agrandir' : 'Reduire'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="destination-sheet-grabber" />
        </button>
        <div className="destination-sheet-body">
          <DestinationCardContent {...props} />
        </div>
      </aside>
    </div>
  )
}

function DestinationCardContent({
  destination,
  coupDeCoeur,
  coupDeCoeurCount,
  onClose,
  onFocus,
  onCoupDeCoeur,
  onEdit,
  onDelete,
}: DestinationSheetProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const criteria = [
    ['Gastronomie', destination.food, 'utensils'],
    ['Sorties & Vie nocturne', destination.night, 'martini'],
    ['Culture & Histoire', destination.culture, 'temple'],
    ['Nature & Paysages', destination.nature, 'mountain'],
    ['Rapport qualite/prix', destination.value, 'coins'],
  ] as const

  const coupDeCoeurDisabled = !coupDeCoeur && coupDeCoeurCount >= 2

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }

  return (
    <>
      <button className="floating-close" aria-label="Fermer le detail" onClick={onClose}>
        <Icon name="x" />
      </button>
      <div className="floating-kebab-wrap">
        <button
          className={`card-kebab${menuOpen ? ' is-open' : ''}`}
          aria-label="Options"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(v => !v); setConfirmDelete(false) }}
        >
          <Icon name="more-vertical" />
        </button>
        {menuOpen && !confirmDelete && (
          <div className="card-kebab-menu">
            <button onClick={() => { closeMenu(); onEdit(destination) }}>
              <Icon name="edit" />
              Modifier
            </button>
            <button className="danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" />
              Supprimer
            </button>
          </div>
        )}
        {menuOpen && confirmDelete && (
          <div className="card-kebab-menu card-delete-confirm">
            <p>Supprimer <strong>{destination.name}</strong> ?</p>
            <div className="confirm-actions">
              <button onClick={closeMenu}>Annuler</button>
              <button className="danger" onClick={() => onDelete(destination.name)}>Confirmer</button>
            </div>
          </div>
        )}
      </div>
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      />
      <div className="destination-title-row">
        {destination.tier && <span className={`tier-orb tier-${destination.tier.toLowerCase()}`}>{destination.tier}</span>}
        <div>
          <h2>{destination.name}, {destination.country}</h2>
          {destination.intent && (
            <span className="intent-pill">{destination.intent}</span>
          )}
        </div>
        <button
          className={`coup-de-coeur-button${coupDeCoeur ? ' is-active' : ''}`}
          aria-label={coupDeCoeur ? 'Retirer le coup de cœur' : coupDeCoeurDisabled ? 'Limite atteinte (2/2)' : `Coup de cœur · ${coupDeCoeurCount}/2 utilisé`}
          title={coupDeCoeur ? 'Coup de cœur · retirer' : coupDeCoeurDisabled ? '2 coups de cœur déjà utilisés' : `Coup de cœur · ${coupDeCoeurCount}/2 utilisé`}
          disabled={coupDeCoeurDisabled}
          onClick={onCoupDeCoeur}
        >
          <Icon name="heart" />
        </button>
      </div>
      <p>{destination.summary}</p>
      <h3>Notes par critere</h3>
      <div className="criteria-list">
        {criteria.map(([label, value, icon]) => (
          <div className="criterion" key={label}>
            <Icon name={icon} />
            <span>{label}</span>
            <strong>{Number(value).toFixed(1).replace('.', ',')}</strong>
          </div>
        ))}
      </div>
      <button className="map-button" onClick={onFocus}>
        <Icon name="map" />
        Voir sur la carte
      </button>
    </>
  )
}
