import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Destination } from '../types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { TIER_COLORS } from '../data'
import { scoreToTier } from '../utils'
import { findDestinationAtLocation, findRoadtripStopsAtLocation } from '../utils/duplicates'
import { Icon } from './Icon'
import { useActivityFeed } from '../hooks/useActivityFeed'

interface DestinationSheetProps {
  destination: Destination
  coupDeCoeur: boolean
  coupDeCoeurCount: number
  allDestinations?: Destination[]
  onClose: () => void
  onFocus: () => void
  onCoupDeCoeur: () => void
  onEdit: (destination: Destination) => void
  onDelete: (name: string) => void
  onOpenTrip?: (tripName: string) => void
}

type SnapState = 'peek' | 'full'

const PEEK_RATIO = 0.40
const FULL_RATIO = 0.08
const CLOSE_RATIO = 0.85

const COMPANION_LABELS: Record<NonNullable<Destination['companions']>, string> = {
  solo: 'Solo',
  couple: 'Couple',
  amis: 'Amis',
  famille: 'Famille',
  travail: 'Travail',
}

function formatEuro(value: number) {
  return `${Math.round(value).toLocaleString('fr-FR')} €`
}

const INTENT_LABELS: Record<Destination['intent'], string> = {
  tourisme: 'Tourisme',
  sorties: 'Sorties',
  gastro: 'Gastronomie',
  nature: 'Nature',
  travail: 'Travail',
  'city-trip': 'City-trip',
}

const INTENT_EMOJIS: Record<Destination['intent'], string> = {
  tourisme: '🗺',
  sorties: '🌙',
  gastro: '🍽',
  nature: '🌿',
  travail: '💼',
  'city-trip': '🏙',
}

function getDestinationContext(destination: Destination) {
  const meta: Array<{ icon: string; label: string }> = []
  const details: Array<{ icon: string; label: string; value: string }> = []

  if (destination.tripYear) {
    meta.push({ icon: 'calendar', label: String(destination.tripYear) })
  }
  if (destination.tripDays) {
    meta.push({ icon: 'clock', label: `${destination.tripDays} jour${destination.tripDays > 1 ? 's' : ''}` })
  }
  if (destination.personalBudget) {
    const perDay = destination.tripDays ? destination.personalBudget / destination.tripDays : destination.personalBudget
    meta.push({
      icon: 'coins',
      label: destination.tripDays ? `~${formatEuro(perDay)}/jour` : `~${formatEuro(destination.personalBudget)}`,
    })
  }
  if (destination.companions) {
    details.push({ icon: 'users', label: 'Avec', value: COMPANION_LABELS[destination.companions] })
  }
  if (destination.standout) {
    details.push({ icon: 'sparkles', label: 'Marquant', value: destination.standout })
  }

  return { meta, details, hasContext: meta.length > 0 || details.length > 0 }
}

function getCriteria(destination: Destination) {
  return [
    ['Gastronomie', destination.food, 'utensils'],
    ['Sorties & Vie nocturne', destination.night, 'martini'],
    ['Culture & Histoire', destination.culture, 'temple'],
    ['Nature & Paysages', destination.nature, 'mountain'],
    ['Rapport qualite/prix', destination.value, 'coins'],
  ] as const
}

function formatScore(destination: Destination) {
  return (destination.score ?? (destination.food + destination.night + destination.culture + destination.nature + destination.value) / 5)
    .toFixed(1)
    .replace('.', ',')
}

function getDisplayTier(destination: Destination) {
  if (Number.isFinite(destination.score)) return scoreToTier(destination.score as number)
  return destination.tier
}

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

    // Depuis peek : fermeture plus facile (seuil bas + vélocité modérée)
    if (snap === 'peek') {
      if (finalTop > vh * 0.68 || velocity > 0.5) {
        props.onClose()
        return
      }
      if (velocity < -0.6) { setSnap('full'); return }
      // Ni fermeture ni ouverture → reste peek
      return
    }

    // Depuis full : comportement standard
    if (finalTop > vh * CLOSE_RATIO || velocity > 1.0) {
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
  allDestinations,
  onClose,
  onFocus,
  onCoupDeCoeur,
  onEdit,
  onDelete,
  onOpenTrip,
}: DestinationSheetProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const context = getDestinationContext(destination)
  const criteria = getCriteria(destination)

  const tripStopsHere = useMemo(() => {
    if (!allDestinations?.length) return []
    if (destination.kind === 'zone' || destination.kind === 'stop') return []
    return findRoadtripStopsAtLocation(destination, allDestinations, destination.name)
  }, [destination, allDestinations])

  const tripsHereByName = useMemo(() => {
    const map = new Map<string, { stages: number[]; color: string }>()
    for (const m of tripStopsHere) {
      const trip = allDestinations?.find(d => d.name === m.tripName)
      const tierColor = trip?.tier ? TIER_COLORS[trip.tier]?.pin : undefined
      const entry = map.get(m.tripName) ?? { stages: [], color: tierColor ?? '#1B5FE8' }
      if (m.stageNumber !== undefined) entry.stages.push(m.stageNumber)
      map.set(m.tripName, entry)
    }
    return Array.from(map.entries())
  }, [tripStopsHere, allDestinations])

  // Amis qui ont aussi visité cette destination (events destination_added).
  // Lit le feed déjà chargé (60 events) — pas de requête supplémentaire.
  const { events: activityEvents } = useActivityFeed(60)
  const friendVisitors = useMemo(() => {
    const targetName = destination.name.toLowerCase().trim()
    const seen = new Map<string, { displayName: string; handle?: string; bg?: string; fg?: string }>()
    for (const ev of activityEvents) {
      if (ev.kind !== 'destination_added') continue
      const evName = (typeof ev.payload?.name === 'string' ? ev.payload.name : '')
        || (typeof ev.payload?.destination_name === 'string' ? ev.payload.destination_name : '')
      if (!evName || evName.toLowerCase().trim() !== targetName) continue
      if (seen.has(ev.actor)) continue
      seen.set(ev.actor, {
        displayName: ev.actorDisplayName ?? ev.actorHandle ?? 'Un ami',
        handle: ev.actorHandle,
        bg: ev.actorAvatarBg,
        fg: ev.actorAvatarFg,
      })
    }
    return Array.from(seen.values())
  }, [activityEvents, destination.name])

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }
  const coupDeCoeurDisabled = !coupDeCoeur && coupDeCoeurCount >= 2

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
      {destination.kind === 'zone' ? (
        <RoadTripCardContent
          destination={destination}
          coupDeCoeur={coupDeCoeur}
          coupDeCoeurDisabled={coupDeCoeurDisabled}
          coupDeCoeurCount={coupDeCoeurCount}
          context={context}
          criteria={criteria}
          allDestinations={allDestinations}
          onCoupDeCoeur={onCoupDeCoeur}
          onFocus={onFocus}
          onOpenDestination={onOpenTrip}
        />
      ) : (
        <>
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      >
        <div className="destination-hero-pills">
          {destination.intent && (
            <span className="intent-pill destination-hero-pill">
              <span aria-hidden="true">{INTENT_EMOJIS[destination.intent]}</span>
              {INTENT_LABELS[destination.intent]}
            </span>
          )}
          <button
            className={`coup-de-coeur-button destination-hero-favorite${coupDeCoeur ? ' is-active' : ''}`}
            aria-label={coupDeCoeur ? 'Retirer le coup de coeur' : coupDeCoeurDisabled ? 'Limite atteinte (2/2)' : `Ajouter en coup de coeur - ${coupDeCoeurCount}/2 utilises`}
            title={coupDeCoeur ? 'Coup de coeur - retirer' : coupDeCoeurDisabled ? '2 coups de coeur deja utilises' : `Coup de coeur - ${coupDeCoeurCount}/2 utilises`}
            disabled={coupDeCoeurDisabled}
            onClick={onCoupDeCoeur}
          >
            <span aria-hidden="true">❤️</span>
            Coup de coeur
          </button>
        </div>
      </div>
      <div className="destination-title-row">
        {destination.tier && <span className={`tier-orb tier-${destination.tier.toLowerCase()}`}>{destination.tier}</span>}
        <div>
          <h2>{destination.name}, {destination.country}</h2>
        </div>
      </div>
      {friendVisitors.length > 0 && (
        <div className="friend-visitors" aria-label="Amis qui y sont allés">
          <div className="friend-visitors-avatars">
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
          </div>
          <span className="friend-visitors-text">
            {friendVisitors.length === 1
              ? <><strong>{friendVisitors[0].displayName}</strong> y est allé</>
              : friendVisitors.length <= 3
                ? <>{friendVisitors.slice(0, -1).map(v => v.displayName).join(', ')} et <strong>{friendVisitors[friendVisitors.length - 1].displayName}</strong> y sont allés</>
                : <><strong>{friendVisitors[0].displayName}</strong>, {friendVisitors[1].displayName} et {friendVisitors.length - 2} autre{friendVisitors.length - 2 > 1 ? 's' : ''} y sont allés</>
            }
          </span>
        </div>
      )}
      {context.hasContext && (
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
                <div key={`${item.icon}-${item.label}`}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
      {tripsHereByName.length > 0 && (
        <div className="sheet-cross-links">
          <p className="sheet-cross-links-title">Aussi étape de</p>
          <ul>
            {tripsHereByName.map(([tripName, info]) => {
              const stageLabel = info.stages.length
                ? `stop #${info.stages.join(', #')}`
                : 'itineraire'
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
      <button className="map-button" onClick={onFocus}>
        <Icon name="map" />
        Voir sur la carte
      </button>
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
  context: ReturnType<typeof getDestinationContext>
  criteria: ReturnType<typeof getCriteria>
  allDestinations?: Destination[]
  onCoupDeCoeur: () => void
  onFocus: () => void
  onOpenDestination?: (name: string) => void
}

function RoadTripCardContent({
  destination,
  coupDeCoeur,
  coupDeCoeurDisabled,
  coupDeCoeurCount,
  context,
  criteria,
  allDestinations,
  onCoupDeCoeur,
  onFocus,
  onOpenDestination,
}: RoadTripCardContentProps) {
  const validStops = destination.stops?.filter(stop => stop.name.trim() && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) ?? []
  const stageCount = validStops.length
  const score = formatScore(destination)
  const displayTier = getDisplayTier(destination)

  return (
    <>
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
            {stageCount || validStops.length} etape{(stageCount || validStops.length) > 1 ? 's' : ''}
          </span>
          <button
            className={`coup-de-coeur-button destination-hero-favorite${coupDeCoeur ? ' is-active' : ''}`}
            aria-label={coupDeCoeur ? 'Retirer le coup de coeur' : coupDeCoeurDisabled ? 'Limite atteinte (2/2)' : `Ajouter en coup de coeur - ${coupDeCoeurCount}/2 utilises`}
            title={coupDeCoeur ? 'Coup de coeur - retirer' : coupDeCoeurDisabled ? '2 coups de coeur deja utilises' : `Coup de coeur - ${coupDeCoeurCount}/2 utilises`}
            disabled={coupDeCoeurDisabled}
            onClick={onCoupDeCoeur}
          >
            <span aria-hidden="true">♥</span>
            Coup de coeur
          </button>
        </div>
      </div>

      <div className="destination-title-row roadtrip-title-row">
        {displayTier && <span className={`tier-orb tier-${displayTier.toLowerCase()}`}>{displayTier}</span>}
        <div>
          <h2>{destination.name}</h2>
          <p className="roadtrip-title-sub">Experience globale du voyage</p>
        </div>
      </div>

      <section className="roadtrip-score-card" aria-label="Evaluation globale du road trip">
        <div>
          <span>Evaluation globale</span>
          <strong>{score}</strong>
        </div>
        <p>Note le road trip comme l'experience que tu as vraiment vecue. Les etapes racontent le trajet; tu peux detailler une ville seulement si elle merite sa propre fiche.</p>
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
                <div key={`${item.icon}-${item.label}`}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <h3>Notes globales</h3>
      <div className="criteria-list">
        {criteria.map(([label, value, icon]) => (
          <div className="criterion" key={label}>
            <Icon name={icon} />
            <span>{label}</span>
            <strong>{Number(value).toFixed(1).replace('.', ',')}</strong>
          </div>
        ))}
      </div>

      <section className="roadtrip-itinerary" aria-label="Itineraire du road trip">
        <div className="roadtrip-section-head">
          <h3>Itineraire</h3>
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
                      <span>Stop du trajet</span>
                    </div>
                    {linkedDestination && linkedDestination.name !== destination.name ? (
                      <button type="button" onClick={() => onOpenDestination?.(linkedDestination.name)}>
                        Fiche existante
                      </button>
                    ) : (
                      <em>Itineraire</em>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="roadtrip-empty">Ajoute des etapes pour raconter le trajet sans devoir noter chaque ville.</p>
        )}
      </section>

      <button className="map-button" onClick={onFocus}>
        <Icon name="map" />
        Voir le trajet
      </button>
    </>
  )
}
