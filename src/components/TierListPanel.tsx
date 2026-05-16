import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import type { Destination, Tier } from '../types'
import { TIER_COLORS, TIER_ORDER } from '../data'

interface TierListPanelProps {
  destinations: Destination[]
  manageMode: boolean
  collapsed: boolean
  coupDeCoeurCount: number
  onManageToggle: () => void
  onCollapseToggle: () => void
  onCoupDeCoeurToggle: (name: string) => void
  onFlyTo: (name: string) => void
  onDelete?: (name: string) => void
}

const tierLabels: Record<Tier, string> = {
  S: 'Exceptionnel',
  A: 'Genial',
  B: 'Tres bien',
  C: 'Correct',
  D: 'Decouvrant',
}

export default function TierListPanel({
  destinations,
  manageMode,
  collapsed,
  coupDeCoeurCount,
  onManageToggle,
  onCollapseToggle,
  onCoupDeCoeurToggle,
  onFlyTo,
  onDelete,
}: TierListPanelProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 })
  const suppressClickRef = useRef(false)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const updateRailControls = () => {
    const rail = railRef.current
    if (!rail) return
    const maxScroll = rail.scrollWidth - rail.clientWidth
    setCanScrollPrev(rail.scrollLeft > 2)
    setCanScrollNext(rail.scrollLeft < maxScroll - 2)
  }

  useEffect(() => {
    updateRailControls()
    window.addEventListener('resize', updateRailControls)
    return () => window.removeEventListener('resize', updateRailControls)
  }, [destinations])

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * Math.round(rail.clientWidth * 0.72), behavior: 'smooth' })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const rail = event.currentTarget
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
    }
    rail.setPointerCapture(event.pointerId)
    rail.classList.add('is-grabbing')
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag.active) return
    const delta = event.clientX - drag.startX
    if (Math.abs(delta) > 6) drag.moved = true
    event.currentTarget.scrollLeft = drag.scrollLeft - delta
    updateRailControls()
  }

  const endPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    dragRef.current = { active: false, moved: false, startX: 0, scrollLeft: 0 }
    event.currentTarget.classList.remove('is-grabbing')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    updateRailControls()
  }

  const handleRailClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <section className={`tier-board ${manageMode ? 'is-managing' : ''} ${collapsed ? 'is-collapsed' : ''}`} aria-label="Ma tier list">
      <div className="tier-board-head">
        <div className="tier-board-title">
          <h2>Ma tier list <span>({destinations.length} destinations)</span></h2>
          <span className="tier-favorite-counter">{coupDeCoeurCount}/2 coups de coeur</span>
        </div>
        <button onClick={onManageToggle}>
          <Icon />
          {manageMode ? 'Terminer' : 'Gerer ma tier list'}
        </button>
      </div>

      <div className="tier-rail">
        <button
          className="tier-rail-control tier-rail-control-prev"
          aria-label="Voir les tiers precedents"
          disabled={!canScrollPrev}
          onClick={() => scrollRail(-1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <div
          ref={railRef}
          className="tier-columns"
          onScroll={updateRailControls}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
          onClickCapture={handleRailClickCapture}
        >
          {TIER_ORDER.map(tier => {
            const items = destinations.filter(destination => destination.tier === tier && destination.kind !== 'stop')
            const colors = TIER_COLORS[tier]

            return (
              <article
                className={`tier-column tier-column-${tier.toLowerCase()}`}
                key={tier}
                style={{ '--tier-items': Math.max(items.length, 1) } as CSSProperties}
              >
                <header>
                  <strong style={{ color: colors.label }}>{tier}</strong>
                  <span style={{ color: colors.label }}>{tierLabels[tier]}</span>
                  <small>{items.length}</small>
                </header>
                <div className="destination-strip">
                  {items.map(destination => {
                    const isCoupDeCoeur = Boolean(destination.coupDeCoeur)
                    const coupDeCoeurDisabled = !isCoupDeCoeur && coupDeCoeurCount >= 2

                    return (
                      <article
                        className={`mini-destination ${isCoupDeCoeur ? 'is-coup-de-coeur' : ''}`}
                        key={destination.name}
                        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
                      >
                        <button
                          className="mini-destination-main"
                          onClick={() => onFlyTo(destination.name)}
                          aria-label={`Voir ${destination.name} sur la carte`}
                        >
                          <span>{destination.name}</span>
                        </button>
                        <button
                          className={`mini-favorite-button ${isCoupDeCoeur ? 'is-active' : ''}`}
                          aria-label={isCoupDeCoeur ? `Retirer ${destination.name} des coups de coeur` : coupDeCoeurDisabled ? 'Limite de 2 coups de coeur atteinte' : `Ajouter ${destination.name} aux coups de coeur`}
                          aria-pressed={isCoupDeCoeur}
                          disabled={coupDeCoeurDisabled}
                          title={isCoupDeCoeur ? 'Coup de coeur' : coupDeCoeurDisabled ? '2 coups de coeur deja choisis' : 'Marquer coup de coeur'}
                          onClick={() => onCoupDeCoeurToggle(destination.name)}
                        >
                          <HeartIcon />
                          <span>Coup coeur</span>
                        </button>
                        {manageMode && onDelete && (
                          <button
                            className="mini-destination-delete"
                            aria-label={`Supprimer ${destination.name}`}
                            onClick={() => onDelete(destination.name)}
                          >
                            x
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
        <button
          className="tier-rail-control tier-rail-control-next"
          aria-label="Voir les tiers suivants"
          disabled={!canScrollNext}
          onClick={() => scrollRail(1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <button
        className="next-control"
        aria-label={collapsed ? 'Deplier la tier list' : 'Replier la tier list'}
        onClick={onCollapseToggle}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={collapsed ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
        </svg>
      </button>
    </section>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
    </svg>
  )
}

function Icon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </svg>
  )
}
