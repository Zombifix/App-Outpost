import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Destination, Friendship, Tier } from '../types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { TIER_COLORS } from '../data'
import { getDestinationScore, getDestinationTier, getMaxCoupDeCoeur } from '../utils'
import { findDestinationAtLocation, findRoadtripStopsAtLocation } from '../utils/duplicates'
import { Icon } from './Icon'
import { useActivityFeed } from '../hooks/useActivityFeed'

interface DestinationSheetProps {
  destination: Destination
  coupDeCoeur: boolean
  coupDeCoeurCount: number
  allDestinations?: Destination[]
  compareWith?: {
    friend: Friendship
    mine?: Destination | null
    theirs: Destination
  }
  compareMode?: 'targeted' | 'global'
  onClose: () => void
  onFocus: () => void
  onCompareFriend?: (friendUserId: string) => void
  onExitCompare?: () => void
  onCoupDeCoeur: () => void
  onEdit: (destination: Destination) => void
  onDelete: (name: string) => void
  onOpenTrip?: (tripName: string) => void
}

interface FriendVisitor {
  userId: string
  displayName: string
  handle?: string
  bg?: string
  fg?: string
  tier?: Tier
}

type SnapState = 'peek' | 'full'

const PEEK_RATIO = 0.55
const FULL_RATIO = 0.08
const CLOSE_RATIO = 0.85

const COMPANION_LABELS: Record<NonNullable<Destination['companions']>, string> = {
  solo: 'Solo',
  couple: 'Couple',
  amis: 'Friends',
  famille: 'Family',
  travail: 'Work',
}

function formatEuro(value: number) {
  return `${Math.round(value).toLocaleString('en-US')} EUR`
}

const INTENT_LABELS: Record<Destination['intent'], string> = {
  tourisme: 'Tourism',
  sorties: 'Nightlife',
  gastro: 'Food & Gastronomy',
  nature: 'Nature',
  travail: 'Work',
  'city-trip': 'City trip',
}

const INTENT_EMOJIS: Record<Destination['intent'], string> = {
  tourisme: '🗺️',
  sorties: '🌙',
  gastro: '🍽️',
  nature: '🌿',
  travail: '💼',
  'city-trip': '🏙️',
}

type ContextDetail =
  | { kind: 'text'; icon: string; label: string; value: string }
  | { kind: 'chips'; icon: string; label: string; chips: Array<{ label: string; tone: 'neutral' | 'positive' | 'negative' }> }

const STANDOUT_FLOP_LABELS = new Set([
  'Budget qui pique',
  'Transports galere',
  'La foule',
  'Pieges a touristes',
  'Rythme epuisant',
  'Meteo capricieuse',
])

function getDestinationContext(destination: Destination) {
  const meta: Array<{ icon: string; label: string }> = []
  const details: ContextDetail[] = []

  if (destination.tripYear) {
    meta.push({ icon: 'calendar', label: String(destination.tripYear) })
  }
  if (destination.tripDays) {
    meta.push({ icon: 'clock', label: `${destination.tripDays} day${destination.tripDays > 1 ? 's' : ''}` })
  }
  if (destination.personalBudget) {
    const perDay = destination.tripDays ? destination.personalBudget / destination.tripDays : destination.personalBudget
    meta.push({
      icon: 'coins',
      label: destination.tripDays ? `~${formatEuro(perDay)}/day` : `~${formatEuro(destination.personalBudget)}`,
    })
  }
  if (destination.companions) {
    details.push({ kind: 'text', icon: 'users', label: 'With', value: COMPANION_LABELS[destination.companions] })
  }
  if (destination.tripTypes?.length) {
    details.push({
      kind: 'chips',
      icon: 'sliders',
      label: 'Type',
      chips: destination.tripTypes.map(label => ({ label, tone: 'neutral' as const })),
    })
  }
  const standoutValues = destination.standoutTags?.length ? destination.standoutTags : destination.standout ? [destination.standout] : []
  if (standoutValues.length) {
    details.push({
      kind: 'chips',
      icon: 'sparkles',
      label: 'Highlights',
      chips: standoutValues.map(label => ({
        label,
        tone: STANDOUT_FLOP_LABELS.has(label) ? ('negative' as const) : ('positive' as const),
      })),
    })
  }

  return { meta, details, hasContext: meta.length > 0 || details.length > 0 }
}

function getCriteria(destination: Destination) {
  const base: Array<[string, number, string]> = []
  if (typeof destination.food === 'number') base.push(['Food & Gastronomy', destination.food, 'utensils'])
  if (typeof destination.night === 'number') base.push(['Nightlife', destination.night, 'martini'])
  if (typeof destination.culture === 'number') base.push(['Culture & History', destination.culture, 'temple'])
  if (typeof destination.nature === 'number') base.push(['Nature & Scenery', destination.nature, 'mountain'])
  if (typeof destination.value === 'number') base.push(['Value for money', destination.value, 'coins'])
  if (typeof destination.ease === 'number') {
    base.push(['Ease on-site', destination.ease, 'compass'])
  }
  return base
}

function getComparableCriteria(destination: Destination, compareDestination: Destination) {
  const mine = new Map(getCriteria(destination).map(([label, value, icon]) => [label, { value, icon }]))
  return getCriteria(compareDestination).flatMap(([label, compareValue]) => {
    const current = mine.get(label)
    if (!current) return []
    return [{
      label,
      icon: current.icon,
      mine: current.value,
      theirs: compareValue,
      gap: Math.abs(current.value - compareValue),
    }]
  })
}

function getCompareTags(destination: Destination, compareDestination: Destination) {
  const mine = destination.standoutTags?.length ? destination.standoutTags : destination.standout ? [destination.standout] : []
  const theirs = compareDestination.standoutTags?.length ? compareDestination.standoutTags : compareDestination.standout ? [compareDestination.standout] : []
  const mineSet = new Set(mine)
  const theirSet = new Set(theirs)
  return {
    common: mine.filter(tag => theirSet.has(tag)),
    mineOnly: mine.filter(tag => !theirSet.has(tag)),
    theirsOnly: theirs.filter(tag => !mineSet.has(tag)),
  }
}

function getCompareCompatibility(compareCriteria: Array<{ gap: number }>) {
  if (!compareCriteria.length) return { score: 0, shared: 0, differences: 0 }
  const shared = compareCriteria.filter(item => item.gap <= 1).length
  const differences = compareCriteria.filter(item => item.gap > 1).length
  const averageGap = compareCriteria.reduce((sum, item) => sum + item.gap, 0) / compareCriteria.length
  return {
    score: Math.max(0, Math.min(100, Math.round(100 - averageGap * 16))),
    shared,
    differences,
  }
}

function formatCompareLabel(mine: number | undefined, theirs: number | undefined, suffix = '') {
  if (mine == null || theirs == null) return ''
  const format = (value: number) => `${Math.round(value).toLocaleString('fr-FR')}${suffix}`
  return `${format(mine)} / ${format(theirs)}`
}

function formatScore(destination: Destination) {
  return getDestinationScore(destination)
    .toFixed(1)
    .replace('.', ',')
}

function getDisplayTier(destination: Destination) {
  return getDestinationTier(destination)
}

function isRoadTripTagged(destination: Destination) {
  return Boolean(destination.tripTypes?.includes('🚗 Road trip'))
}

function hasRenderableStops(destination: Destination) {
  return isRoadTripTagged(destination) && Boolean(destination.stops?.some(stop => stop.name.trim() && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)))
}

export default function DestinationSheet(props: DestinationSheetProps) {
  const isComparison = Boolean(props.compareWith)
  const useSheetLayout = useMediaQuery(isComparison ? '(max-width: 1100px)' : '(max-width: 768px)')

  if (useSheetLayout) return <MobileSheet {...props} />
  return (
    <aside className={`destination-card${isComparison ? ' is-comparison' : ''}`} aria-label={`Detail de ${props.destination.name}`}>
      <DestinationCardContent {...props} />
    </aside>
  )
}

type DragState = { startY: number; lastY: number; lastT: number; v: number; current: number } | null

function MobileSheet(props: DestinationSheetProps) {
  const isComparison = Boolean(props.compareWith)
  const sheetRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [snap, setSnap] = useState<SnapState>(isComparison ? 'full' : 'peek')
  const dragRef = useRef<DragState>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)

  // A comparison needs its full reading surface; a regular card keeps the peek affordance.
  useEffect(() => {
    setSnap(isComparison ? 'full' : 'peek')
    setDragOffset(0)
  }, [props.destination.name, isComparison])

  // Lock body scroll while sheet open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    // Initiate drag only from the handle bar or the hero image area; never from
    // inner scrollable content so vertical scroll inside the sheet still works.
    if (!t.closest('.destination-sheet-handle, .destination-hero')) return
    const captureTarget = e.currentTarget as HTMLElement
    try { captureTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
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

    if (snap === 'peek') {
      if (finalTop > vh * 0.68 || velocity > 0.5) { props.onClose(); return }
      if (velocity < -0.6) { setSnap('full'); return }
      return
    }

    if (finalTop > vh * CLOSE_RATIO || velocity > 1.0) { props.onClose(); return }
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
        className={`destination-sheet is-${snap}${isComparison ? ' is-comparison' : ''}${isDragging ? ' is-dragging' : ''}`}
        aria-label={`Details: ${props.destination.name}`}
        onClick={e => e.stopPropagation()}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className="destination-sheet-handle"
          aria-label={snap === 'peek' ? 'Expand' : 'Collapse'}
          onClick={() => setSnap(s => s === 'peek' ? 'full' : 'peek')}
        >
          <span className="destination-sheet-grabber" />
        </button>
        <div className="destination-sheet-body" ref={bodyRef}>
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
  allDestinations,
  compareMode,
  onClose,
  onFocus,
  onCompareFriend,
  onExitCompare,
  onCoupDeCoeur,
  onEdit,
  onDelete,
  onOpenTrip,
  compareWith,
}: DestinationSheetProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [visitorPickerOpen, setVisitorPickerOpen] = useState(false)
  const visitorPickerRef = useRef<HTMLDivElement | null>(null)
  const mineDestination = compareWith?.mine ?? null
  const compareDestination = compareWith?.theirs ?? null
  const isFriendOnlyComparison = Boolean(compareWith && !mineDestination && compareDestination)
  const canEditOwnDestination = !isFriendOnlyComparison
  const context = getDestinationContext(destination)
  const criteria = getCriteria(destination)
  const compareCriteria = useMemo(
    () => mineDestination && compareDestination ? getComparableCriteria(mineDestination, compareDestination) : [],
    [mineDestination, compareDestination]
  )
  const compareTags = useMemo(
    () => mineDestination && compareDestination ? getCompareTags(mineDestination, compareDestination) : { common: [], mineOnly: [], theirsOnly: [] },
    [mineDestination, compareDestination]
  )
  const compareCompatibility = useMemo(
    () => getCompareCompatibility(compareCriteria),
    [compareCriteria]
  )
  const displayTier = getDisplayTier(destination)

  const tripStopsHere = useMemo(() => {
    if (!allDestinations?.length) return []
    if (destination.kind === 'zone' || destination.kind === 'stop') return []
    return findRoadtripStopsAtLocation(destination, allDestinations.filter(isRoadTripTagged), destination.name)
  }, [destination, allDestinations])

  const tripsHereByName = useMemo(() => {
    const map = new Map<string, { stages: number[]; color: string }>()
    for (const m of tripStopsHere) {
      const trip = allDestinations?.find(d => d.name === m.tripName)
      const tripTier = trip ? getDisplayTier(trip) : undefined
      const tierColor = tripTier ? TIER_COLORS[tripTier]?.pin : undefined
      const entry = map.get(m.tripName) ?? { stages: [], color: tierColor ?? '#1B5FE8' }
      if (m.stageNumber !== undefined) entry.stages.push(m.stageNumber)
      map.set(m.tripName, entry)
    }
    return Array.from(map.entries())
  }, [tripStopsHere, allDestinations])

  // Amis qui ont aussi visitÃ© cette destination (events destination_added).
  // Lit le feed dÃ©jÃ  chargÃ© (60 events) â€" pas de requÃªte supplÃ©mentaire.
  const { events: activityEvents } = useActivityFeed(60)
  const friendVisitors = useMemo(() => {
    const targetName = destination.name.toLowerCase().trim()
    const seen = new Map<string, FriendVisitor>()
    for (const ev of activityEvents) {
      if (ev.kind !== 'destination_added') continue
      const evName = (typeof ev.payload?.name === 'string' ? ev.payload.name : '')
        || (typeof ev.payload?.destination_name === 'string' ? ev.payload.destination_name : '')
      if (!evName || evName.toLowerCase().trim() !== targetName) continue
      if (seen.has(ev.actor)) continue
      const payloadTier = typeof ev.payload?.tier === 'string' && ['S', 'A', 'B', 'C', 'D'].includes(ev.payload.tier)
        ? ev.payload.tier as Tier
        : undefined
      seen.set(ev.actor, {
        userId: ev.actor,
        displayName: ev.actorDisplayName ?? ev.actorHandle ?? 'A friend',
        handle: ev.actorHandle,
        bg: ev.actorAvatarBg,
        fg: ev.actorAvatarFg,
        tier: payloadTier,
      })
    }
    return Array.from(seen.values())
  }, [activityEvents, destination.name])
  const compareableVisitor = !compareWith && friendVisitors.length === 1 ? friendVisitors[0] : null
  const hasMultipleVisitors = !compareWith && friendVisitors.length > 1
  const firstName = compareWith?.friend.displayName.split(' ')[0] ?? ''

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }
  const maxCoupDeCoeur = getMaxCoupDeCoeur(allDestinations?.length ?? 0)
  const coupDeCoeurDisabled = !coupDeCoeur && coupDeCoeurCount >= maxCoupDeCoeur

  useEffect(() => {
    setVisitorPickerOpen(false)
  }, [destination.name, compareWith])

  useEffect(() => {
    if (!visitorPickerOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (visitorPickerRef.current?.contains(event.target as Node)) return
      setVisitorPickerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisitorPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [visitorPickerOpen])

  const cardActions = (
    <div className="destination-card-actions">
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
            <button onClick={() => { closeMenu(); onFocus() }}>
              <Icon name="map" />
              Focus on map
            </button>
            {canEditOwnDestination && (
              <button onClick={() => { closeMenu(); onEdit(destination) }}>
                <Icon name="edit" />
                Edit
              </button>
            )}
            {canEditOwnDestination && (
              <button className="danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" />
                Delete
              </button>
            )}
          </div>
        )}
        {menuOpen && confirmDelete && (
          <div className="card-kebab-menu card-delete-confirm">
            <p>Delete <strong>{destination.name}</strong>?</p>
            <div className="confirm-actions">
              <button onClick={closeMenu}>Cancel</button>
              <button className="danger" onClick={() => onDelete(destination.name)}>Confirm</button>
            </div>
          </div>
        )}
      </div>
      <button className="floating-close" aria-label="Close details" onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  )

  return (
    <>
      {destination.kind === 'zone' && hasRenderableStops(destination) ? (
        <RoadTripCardContent
          destination={destination}
          coupDeCoeur={coupDeCoeur}
          coupDeCoeurDisabled={coupDeCoeurDisabled}
          coupDeCoeurCount={coupDeCoeurCount}
          canEditOwnDestination={canEditOwnDestination}
          context={context}
          criteria={criteria}
          allDestinations={allDestinations}
          onCoupDeCoeur={onCoupDeCoeur}
          onOpenDestination={onOpenTrip}
          cardActions={cardActions}
        />
      ) : (
        <>
      <div className="destination-hero-wrap">
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      >
        <div className="destination-hero-pills">
          {compareWith && (
            <span className="intent-pill destination-hero-pill">
              <Icon name="users" />
              You + {compareWith.friend.displayName.split(' ')[0]}
            </span>
          )}
          {destination.intent && (
            <span className="intent-pill destination-hero-pill">
              <span aria-hidden="true">{INTENT_EMOJIS[destination.intent]}</span>
              {INTENT_LABELS[destination.intent]}
            </span>
          )}
          {canEditOwnDestination && coupDeCoeur ? (
            <button
              className="coup-de-coeur-button destination-hero-favorite is-active"
              aria-label="Remove from favorites"
              title="Favorite — remove"
              onClick={onCoupDeCoeur}
            >
              <Icon name="heart" />
              Favorite
            </button>
          ) : canEditOwnDestination && !coupDeCoeurDisabled && (
            <button
              className="coup-de-coeur-button destination-hero-favorite"
              aria-label="Add to favorites"
              title="Add to favorites"
              onClick={onCoupDeCoeur}
            >
              <Icon name="heart" />
              Favorite
            </button>
          )}
        </div>
      </div>
      {cardActions}
      </div>
      <div className="destination-title-row">
        <span className={`tier-orb tier-${displayTier.toLowerCase()}`}>{displayTier}</span>
        <div>
          <h2>{destination.name}{destination.country && destination.country !== destination.name ? `, ${destination.country}` : ''}</h2>
        </div>
      </div>
      {compareWith && (
        <section className="sheet-compare-banner" aria-label="Comparison in progress">
          <div className="sheet-compare-banner-copy">
            <strong>Comparing with {firstName}</strong>
            {isFriendOnlyComparison && (
              <small>You have not visited or rated this destination yet.</small>
            )}
          </div>
          {onExitCompare && (
            <button
              type="button"
              className="sheet-compare-banner-action"
              onClick={onExitCompare}
            >
              Exit
            </button>
          )}
        </section>
      )}
      {isFriendOnlyComparison && compareDestination && (
        <section className="compare-fallback-note" aria-label="Your travel status">
          <strong>Not in your journal yet</strong>
          <p>
            {compareWith?.friend.displayName.split(' ')[0]} has been to {compareDestination.name}.
            You have not visited or rated this destination yet.
          </p>
        </section>
      )}
      {!compareWith && friendVisitors.length > 0 && (
        <div
          className={`friend-visitors${visitorPickerOpen ? ' is-popover-open' : ''}`}
          aria-label="Friends who've been there"
          ref={visitorPickerRef}
        >
          <button
            type="button"
            className={`friend-visitors-avatars friend-visitors-avatars-btn${hasMultipleVisitors ? ' is-interactive' : ''}`}
            onClick={() => {
              if (compareableVisitor && onCompareFriend) onCompareFriend(compareableVisitor.userId)
              else if (hasMultipleVisitors) setVisitorPickerOpen(value => !value)
            }}
            aria-haspopup={hasMultipleVisitors ? 'menu' : undefined}
            aria-expanded={hasMultipleVisitors ? visitorPickerOpen : undefined}
            disabled={!compareableVisitor && !hasMultipleVisitors}
          >
            {friendVisitors.slice(0, 3).map((v, i) => (
              <span
                key={i}
                className="friend-visitors-avatar"
                style={{ background: v.bg ?? '#c7d2fe', color: v.fg ?? '#1e3a8a' }}
                title={v.displayName}
              >
                {v.displayName.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </button>
          <span className="friend-visitors-text">
            {friendVisitors.length === 1
              ? <><strong>{friendVisitors[0].displayName}</strong> has been there</>
              : friendVisitors.length <= 3
                ? <>{friendVisitors.slice(0, -1).map(v => v.displayName).join(', ')} and <strong>{friendVisitors[friendVisitors.length - 1].displayName}</strong> have been there</>
                : <><strong>{friendVisitors[0].displayName}</strong>, {friendVisitors[1].displayName} and {friendVisitors.length - 2} other{friendVisitors.length - 2 > 1 ? 's' : ''} have been there</>
            }
          </span>
          {compareableVisitor && onCompareFriend && (
            <button
              type="button"
              className="friend-visitors-action"
              onClick={() => onCompareFriend(compareableVisitor.userId)}
            >
              Compare with {compareableVisitor.displayName.split(' ')[0]}
            </button>
          )}
          {hasMultipleVisitors && (
            <>
              <button
                type="button"
                className="friend-visitors-action"
                onClick={() => setVisitorPickerOpen(value => !value)}
                aria-haspopup="menu"
                aria-expanded={visitorPickerOpen}
              >
                Compare with…
              </button>
              {visitorPickerOpen && (
                <div className="friend-visitors-popover" role="menu" aria-label="Choose a friend to compare">
                  {friendVisitors.map(visitor => (
                    <button
                      key={visitor.userId}
                      type="button"
                      className="friend-visitors-option"
                      role="menuitem"
                      onClick={() => {
                        setVisitorPickerOpen(false)
                        onCompareFriend?.(visitor.userId)
                      }}
                    >
                      <span
                        className="friend-visitors-option-avatar"
                        style={{ background: visitor.bg ?? '#c7d2fe', color: visitor.fg ?? '#1e3a8a' }}
                      >
                        {visitor.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="friend-visitors-option-copy">
                        <strong>{visitor.displayName}</strong>
                        <small>Compare with {visitor.displayName.split(' ')[0]}</small>
                      </span>
                      {visitor.tier && (
                        <span
                          className="friend-visitors-option-tier"
                          style={{ color: TIER_COLORS[visitor.tier].label, background: `${TIER_COLORS[visitor.tier].pin}22` }}
                        >
                          {visitor.tier}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {!compareWith && context.hasContext && (
        <div className="destination-context" aria-label="Contexte du voyage">
          {context.meta.length > 0 && (
            <div className="destination-context-meta">
              {context.meta.map(item => (
                <span key={`${item.icon}-${item.label}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
          {context.details.length > 0 && (
            <div className="destination-context-details">
              {context.details.map(item => (
                <div
                  key={`${item.icon}-${item.label}`}
                  className={item.kind === 'chips' ? 'destination-context-row destination-context-row--chips' : 'destination-context-row'}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.kind === 'text' ? (
                    <strong>{item.value}</strong>
                  ) : (
                    <div className="destination-context-chips">
                      {item.chips.map(chip => (
                        <span
                          key={chip.label}
                          className={`destination-context-chip destination-context-chip--${chip.tone}`}
                        >
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {compareWith && (
        <>
          <div className="compare-meta" aria-label={`Comparison with ${compareWith.friend.displayName}`}>
            <div className="compare-meta-list">
              {mineDestination?.tripYear && compareDestination?.tripYear && (
                <span className="compare-meta-item">
                  <Icon name="calendar" />
                  {mineDestination.tripYear} / {compareDestination.tripYear}
                </span>
              )}
              {mineDestination?.tripDays && compareDestination?.tripDays && (
                <span className="compare-meta-item">
                  <Icon name="clock" />
                  {mineDestination.tripDays}d / {compareDestination.tripDays}d
                </span>
              )}
              {mineDestination?.personalBudget && compareDestination?.personalBudget && (
                <span className="compare-meta-item">
                  <Icon name="coins" />
                  {formatCompareLabel(
                    mineDestination.personalBudget / Math.max(mineDestination.tripDays ?? 1, 1),
                    compareDestination.personalBudget / Math.max(compareDestination.tripDays ?? 1, 1),
                    ' EUR/d'
                  )}
                </span>
              )}
              {isFriendOnlyComparison && (
                <>
                  {compareDestination?.tripYear && (
                    <span className="compare-meta-item">
                      <Icon name="calendar" />
                      {compareWith.friend.displayName.split(' ')[0]}: {compareDestination.tripYear}
                    </span>
                  )}
                  {compareDestination?.tripDays && (
                    <span className="compare-meta-item">
                      <Icon name="clock" />
                      {compareWith.friend.displayName.split(' ')[0]}: {compareDestination.tripDays}d
                    </span>
                  )}
                  {compareDestination?.personalBudget && (
                    <span className="compare-meta-item">
                      <Icon name="coins" />
                      {compareWith.friend.displayName.split(' ')[0]}: {Math.round(compareDestination.personalBudget).toLocaleString('fr-FR')} EUR
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {mineDestination && compareDestination ? (
            <section className="compare-sheet-card" aria-label="Compatibility">
              <div className="compare-sheet-score">
                <span>Compatibility</span>
                <strong>{compareCompatibility.score}%</strong>
                <em>match</em>
              </div>
              <div className="compare-sheet-stats">
                <div className="compare-sheet-stat compare-sheet-stat--ok">
                  <span>OK</span>
                  {compareCompatibility.shared} shared criteria
                </div>
                <div className="compare-sheet-stat compare-sheet-stat--warn">
                  <span>!</span>
                  {compareCompatibility.differences} notable differences
                </div>
              </div>
            </section>
          ) : (
            <section className="compare-sheet-card compare-sheet-card--friend-only" aria-label={`${compareWith.friend.displayName} rating`}>
              <div className="compare-sheet-score">
                <span>{compareWith.friend.displayName.split(' ')[0]}'s rating</span>
                <strong>{formatScore(compareDestination ?? destination)}</strong>
                <em>{getDisplayTier(compareDestination ?? destination)}</em>
              </div>
              <div className="compare-sheet-stats">
                <div className="compare-sheet-stat compare-sheet-stat--ok">
                  <span>FYI</span>
                  Friend data is available for this destination.
                </div>
                <div className="compare-sheet-stat compare-sheet-stat--warn">
                  <span>!</span>
                  Add it to your journal to compare your experience side by side.
                </div>
              </div>
            </section>
          )}

          {(mineDestination && compareDestination) ? (
            <section className="compare-tag-groups" aria-label="Compared highlights">
              {compareTags.common.length > 0 && (
                <div className="compare-tag-group">
                  <h3>In common ({compareTags.common.length})</h3>
                  <div className="compare-tag-list">
                    {compareTags.common.map(tag => <span key={tag} className="compare-tag compare-tag--common">{tag}</span>)}
                  </div>
                </div>
              )}
              {(compareTags.mineOnly.length > 0 || compareTags.theirsOnly.length > 0) && (
                <div className={`compare-tag-columns${compareTags.mineOnly.length === 0 || compareTags.theirsOnly.length === 0 ? ' is-single' : ''}`}>
                  {compareTags.mineOnly.length > 0 && (
                    <div className="compare-tag-column">
                      <h3>Yours only ({compareTags.mineOnly.length})</h3>
                      <div className="compare-tag-list">
                        {compareTags.mineOnly.map(tag => <span key={tag} className="compare-tag compare-tag--mine">{tag}</span>)}
                      </div>
                    </div>
                  )}
                  {compareTags.theirsOnly.length > 0 && (
                    <div className="compare-tag-column">
                      <h3>{compareWith.friend.displayName.split(' ')[0]} only ({compareTags.theirsOnly.length})</h3>
                      <div className="compare-tag-list">
                        {compareTags.theirsOnly.map(tag => <span key={tag} className="compare-tag compare-tag--theirs">{tag}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : context.hasContext ? (
            <section className="compare-tag-groups compare-tag-groups--friend-only" aria-label={`${compareWith.friend.displayName} trip details`}>
              <div className="compare-tag-group">
                <h3>{compareWith.friend.displayName.split(' ')[0]}'s trip details</h3>
                <div className="compare-tag-list">
                  {context.details.flatMap(item => (
                    item.kind === 'text'
                      ? [<span key={`${item.label}-${item.value}`} className="compare-tag compare-tag--theirs">{item.label}: {item.value}</span>]
                      : item.chips.map(chip => (
                        <span key={`${item.label}-${chip.label}`} className="compare-tag compare-tag--theirs">
                          {chip.label}
                        </span>
                      ))
                  ))}
                  {context.details.length === 0 && context.meta.map(item => (
                    <span key={`${item.icon}-${item.label}`} className="compare-tag compare-tag--theirs">
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
      <h3>Ratings by criterion</h3>
      {compareWith && compareCriteria.length > 0 ? (
        <div className="criteria-compare" aria-label={`Comparison with ${compareWith.friend.displayName}`}>
          <div className="criteria-compare-head">
            <span />
            <span />
            <strong>You</strong>
            <strong>{compareWith.friend.displayName.split(' ')[0]}</strong>
            <strong>Gap</strong>
          </div>
          <div className="criteria-compare-list">
            {compareCriteria.map(item => (
              <div className="criteria-compare-row" key={item.label}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                <strong>{item.mine.toFixed(1).replace('.', ',')}</strong>
                <strong>{item.theirs.toFixed(1).replace('.', ',')}</strong>
                <strong>{item.gap.toFixed(1).replace('.', ',')}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="criteria-list">
          {criteria.map(([label, value, icon]) => (
            <div className="criterion" key={label}>
              <Icon name={icon} />
              <span>{label}</span>
              <strong>{Number(value).toFixed(1).replace('.', ',')}</strong>
            </div>
          ))}
        </div>
      )}
      {compareWith && criteria.length === 0 && (
        <p className="compare-fallback-empty">
          {isFriendOnlyComparison
            ? `${compareWith.friend.displayName.split(' ')[0]} has not added detailed criterion ratings for this destination yet.`
            : 'One of the two profiles is missing detailed criterion ratings for this destination.'}
        </p>
      )}
      {tripsHereByName.length > 0 && (
        <div className="sheet-cross-links">
          <p className="sheet-cross-links-title">Also a stop in</p>
          <ul>
            {tripsHereByName.map(([tripName, info]) => {
              const stageLabel = info.stages.length
                ? `stop #${info.stages.join(', #')}`
                : 'itinerary'
              return (
                <li key={tripName}>
                  <span className="trip-dot" style={{ '--trip-color': info.color } as CSSProperties} />
                  {onOpenTrip ? (
                    <button
                      type="button"
                      className="trip-link"
                      onClick={() => onOpenTrip(tripName)}
                      style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                    >
                      {tripName}
                    </button>
                  ) : (
                    <span>{tripName}</span>
                  )}
                  <span className="stop-num">{stageLabel}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
        </>
      )}
    </>
  )
}

interface RoadTripCardContentProps {
  destination: Destination
  coupDeCoeur: boolean
  coupDeCoeurDisabled: boolean
  coupDeCoeurCount: number
  canEditOwnDestination?: boolean
  context: ReturnType<typeof getDestinationContext>
  criteria: ReturnType<typeof getCriteria>
  allDestinations?: Destination[]
  onCoupDeCoeur: () => void
  onOpenDestination?: (name: string) => void
  cardActions: JSX.Element
}

function RoadTripCardContent({
  destination,
  coupDeCoeur,
  coupDeCoeurDisabled,
  coupDeCoeurCount,
  canEditOwnDestination = true,
  context,
  criteria,
  allDestinations,
  onCoupDeCoeur,
  onOpenDestination,
  cardActions,
}: RoadTripCardContentProps) {
  const validStops = destination.stops?.filter(stop => stop.name.trim() && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) ?? []
  const stageCount = validStops.length
  const score = formatScore(destination)
  const displayTier = getDisplayTier(destination)

  return (
    <>
      <div className="destination-hero-wrap">
      <div
        className="destination-hero roadtrip-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      >
        <div className="destination-hero-pills">
          <span className="intent-pill destination-hero-pill">
            <Icon name="map" />
            Road trip
          </span>
          <span className="intent-pill destination-hero-pill">
            {stageCount} stop{stageCount > 1 ? 's' : ''}
          </span>
          {canEditOwnDestination && coupDeCoeur && (
            <button
              className="coup-de-coeur-button destination-hero-favorite is-active"
              aria-label="Remove from favorites"
              title="Favorite — remove"
              onClick={onCoupDeCoeur}
            >
              <Icon name="heart" />
              Favorite
            </button>
          )}
        </div>
      </div>
      {cardActions}
      </div>

      <div className="destination-title-row roadtrip-title-row">
        {displayTier && <span className={`tier-orb tier-${displayTier.toLowerCase()}`}>{displayTier}</span>}
        <div>
          <h2>{destination.name}</h2>
          <p className="roadtrip-title-sub">Overall trip experience</p>
        </div>
      </div>

      <section className="roadtrip-score-card" aria-label="Overall road trip rating">
        <div>
          <span>Overall rating</span>
          <strong>{score}</strong>
        </div>
        <p>Rate the road trip as the experience you actually lived. Stops tell the story of the route; detail a city only if it deserves its own entry.</p>
      </section>

      {context.hasContext && (
        <div className="destination-context roadtrip-context" aria-label="Contexte du road trip">
          {context.meta.length > 0 && (
            <div className="destination-context-meta">
              {context.meta.map(item => (
                <span key={`${item.icon}-${item.label}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
          {context.details.length > 0 && (
            <div className="destination-context-details">
              {context.details.map(item => (
                <div
                  key={`${item.icon}-${item.label}`}
                  className={item.kind === 'chips' ? 'destination-context-row destination-context-row--chips' : 'destination-context-row'}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.kind === 'text' ? (
                    <strong>{item.value}</strong>
                  ) : (
                    <div className="destination-context-chips">
                      {item.chips.map(chip => (
                        <span
                          key={chip.label}
                          className={`destination-context-chip destination-context-chip--${chip.tone}`}
                        >
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <h3>Overall ratings</h3>
      <div className="criteria-list">
        {criteria.map(([label, value, icon]) => (
          <div className="criterion" key={label}>
            <Icon name={icon} />
            <span>{label}</span>
            <strong>{Number(value).toFixed(1).replace('.', ',')}</strong>
          </div>
        ))}
      </div>

      <section className="roadtrip-itinerary" aria-label="Road trip itinerary">
        <div className="roadtrip-section-head">
          <h3>Itinerary</h3>
          <span>{validStops.length} stop{validStops.length > 1 ? 's' : ''}</span>
        </div>
        {validStops.length > 0 ? (
          <ol className="roadtrip-timeline">
            {validStops.map((stop, index) => {
              const linkedDestination = allDestinations ? findDestinationAtLocation(stop, allDestinations) : null
              return (
                <li key={`${stop.name}-${index}`}>
                  <span className="roadtrip-step-dot">{index + 1}</span>
                  <div className="roadtrip-step-body">
                    <div>
                      <strong>{stop.name}</strong>
                      <span>Route stop</span>
                    </div>
                    {linkedDestination && linkedDestination.name !== destination.name ? (
                      <button type="button" onClick={() => onOpenDestination?.(linkedDestination.name)}>
                        See entry
                      </button>
                    ) : (
                      <em>Itinerary</em>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="roadtrip-empty">Add stops to tell the story of the route without having to rate each city.</p>
        )}
      </section>
    </>
  )
}
