import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import type { Destination, Friendship, Tier } from '../types'
import { TIER_COLORS, TIER_ORDER } from '../data'
import { getDestinationScore, getDestinationTier } from '../utils'
import CompareWithFriendButton from './friends/CompareWithFriendButton'
import { SegmentedControl } from './SegmentedControl'

interface TierListPanelProps {
  destinations: Destination[]
  collapsed: boolean
  coupDeCoeurCount: number
  dockMode?: 'stacked-left' | 'bottom-left' | 'overlay-bottom'
  onCollapseToggle: () => void
  onFlyTo: (name: string) => void
  onCompareFriend?: (friend: Friendship) => void
  onMobileToggle?: () => void
  onViewTierList?: () => void
  compareFriendDestinations?: Destination[]
  compareFriendName?: string
  compareFriendAvatarUrl?: string | null
}

const tierLabels: Record<Tier, string> = {
  S: 'Exceptional',
  A: 'Great',
  B: 'Decent',
  C: 'Meh',
  D: 'Avoid',
}

type SortMode = 'score' | 'recent'

const sortLabels: Record<SortMode, string> = {
  score: 'Top rated',
  recent: 'Most recent',
}

const mobileSortLabels: Record<SortMode, string> = {
  score: 'By rating',
  recent: 'By date',
}

function destinationScore(destination: Destination) {
  return getDestinationScore(destination)
}

function compareDestinations(a: Destination, b: Destination, sortMode: SortMode) {
  const aScore = destinationScore(a)
  const bScore = destinationScore(b)

  if (sortMode === 'recent') {
    const aYear = a.tripYear ?? -Infinity
    const bYear = b.tripYear ?? -Infinity
    if (aYear !== bYear) return bYear - aYear
  }

  if (aScore !== bScore) return bScore - aScore
  return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
}

export default function TierListPanel({
  destinations,
  collapsed,
  coupDeCoeurCount,
  dockMode = 'overlay-bottom',
  onCollapseToggle,
  onFlyTo,
  onCompareFriend,
  onViewTierList,
  compareFriendDestinations,
  compareFriendName,
  compareFriendAvatarUrl,
}: TierListPanelProps) {
  const tiersWithItems = TIER_ORDER.filter(t =>
    destinations.some(d => getDestinationTier(d) === t && d.kind !== 'stop')
  )
  const [mobileTier, setMobileTier] = useState<Tier | 'all'>('all')
  const [sortMode, setSortMode] = useState<SortMode>('score')
  const railRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 })
  const suppressClickRef = useRef(false)
  const scrollFrameRef = useRef<number | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const updateRailControls = () => {
    const rail = railRef.current
    if (!rail) return
    const maxScroll = rail.scrollWidth - rail.clientWidth
    setCanScrollPrev(rail.scrollLeft > 2)
    setCanScrollNext(rail.scrollLeft < maxScroll - 2)
  }

  const scheduleRailControlsUpdate = () => {
    if (scrollFrameRef.current !== null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      updateRailControls()
    })
  }

  useEffect(() => {
    updateRailControls()
    window.addEventListener('resize', updateRailControls)
    return () => {
      window.removeEventListener('resize', updateRailControls)
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [destinations])

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * Math.round(rail.clientWidth * 0.72), behavior: 'smooth' })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.pointerType !== 'mouse') return
    if ((event.target as HTMLElement).closest('button')) return
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
    scheduleRailControlsUpdate()
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

  const sortControl = (className = '', compact = false) => (
    <div className={`tier-sort-toggle${className ? ` ${className}` : ''}`} role="group" aria-label="Sort tier list">
      {(['score', 'recent'] as SortMode[]).map(mode => (
        <button
          key={mode}
          type="button"
          className={sortMode === mode ? 'is-active' : ''}
          aria-pressed={sortMode === mode}
          onClick={() => setSortMode(mode)}
        >
          {compact ? mobileSortLabels[mode] : sortLabels[mode]}
        </button>
      ))}
    </div>
  )

  const mobileTierItems = destinations.filter(d => {
    if (d.kind === 'stop') return false
    if (mobileTier === 'all') return true
    return getDestinationTier(d) === mobileTier
  }).sort((a, b) => compareDestinations(a, b, sortMode))
  const tierCounts = TIER_ORDER.map(tier => ({
    tier,
    count: destinations.filter(d => d.kind !== 'stop' && getDestinationTier(d) === tier).length,
  })).filter(item => item.count > 0)
  const friendTierCounts = compareFriendDestinations
    ? TIER_ORDER.map(tier => ({
        tier,
        count: compareFriendDestinations.filter(d => d.kind !== 'stop' && getDestinationTier(d) === tier).length,
      })).filter(item => item.count > 0)
    : null
  const tierCountChips = tierCounts.length > 0 ? tierCounts.map(({ tier, count }) => (
    <span
      key={tier}
      className={`tier-board-collapsed-count tier-board-collapsed-count--${tier.toLowerCase()}`}
    >
      <span className="tier-board-collapsed-dot" aria-hidden="true" />
      {count}
    </span>
  )) : (
    <span className="tier-board-collapsed-count tier-board-collapsed-count--empty">0</span>
  )

  const tierOptions = [
    { value: 'all' as const, label: 'All' },
    ...tiersWithItems.map(tier => ({
      value: tier,
      label: tier,
      accentColor: TIER_COLORS[tier].pin,
      ariaLabel: tierLabels[tier],
    })),
  ]

  const dockClass = dockMode === 'stacked-left'
    ? ' tier-board--stacked-left'
    : dockMode === 'bottom-left'
      ? ' tier-board--bottom-left'
      : ''

  return (
    <section className={`tier-board ${collapsed ? 'is-collapsed' : ''}${dockClass}`} aria-label="My rankings">
      {/* iOS drag handle — clickable to collapse/expand on mobile */}
      <button
        type="button"
        className="tier-board-handle"
        onClick={onCollapseToggle}
        aria-label={collapsed ? 'Expand' : 'Collapse'}
      >
        <span className="tier-board-handle-bar" />
        {collapsed && (
          <span className="tier-board-collapsed-hint" aria-hidden="true">
            <span className="tier-board-collapsed-row">
              <span className="tier-board-collapsed-label">My rankings</span>
              <span className="tier-board-collapsed-counts" aria-label="Summary by rating">
                {tierCounts.length > 0 ? tierCounts.map(({ tier, count }) => (
                  <span
                    key={tier}
                    className={`tier-board-collapsed-count tier-board-collapsed-count--${tier.toLowerCase()}`}
                  >
                    <span className="tier-board-collapsed-dot" aria-hidden="true" />
                    {count}
                  </span>
                )) : (
                  <span className="tier-board-collapsed-count tier-board-collapsed-count--empty">0</span>
                )}
              </span>
            </span>
            {friendTierCounts && compareFriendName && (
              <span className="tier-board-collapsed-row tier-board-collapsed-row--friend">
                <span className="tier-board-collapsed-label tier-board-collapsed-label--friend">
                  {compareFriendAvatarUrl && (
                    <img src={compareFriendAvatarUrl} alt="" aria-hidden="true" className="tier-board-friend-avatar" />
                  )}
                  {compareFriendName}
                </span>
                <span className="tier-board-collapsed-counts">
                  {friendTierCounts.length > 0 ? friendTierCounts.map(({ tier, count }) => (
                    <span
                      key={tier}
                      className={`tier-board-collapsed-count tier-board-collapsed-count--${tier.toLowerCase()}`}
                    >
                      <span className="tier-board-collapsed-dot" aria-hidden="true" />
                      {count}
                    </span>
                  )) : (
                    <span className="tier-board-collapsed-count tier-board-collapsed-count--empty">0</span>
                  )}
                </span>
              </span>
            )}
          </span>
        )}
      </button>

      <div className="tier-board-head">
        <div className="tier-board-title">
          <h2>My rankings <span>· {destinations.filter(d => d.kind !== 'stop').length}</span></h2>
          {collapsed && (
            <div className="tier-board-title-counts" aria-label="Summary by rating">
              {tierCountChips}
            </div>
          )}
        </div>
        <div className="tier-board-actions">
          {onCompareFriend && (
            <CompareWithFriendButton onPick={onCompareFriend} compact />
          )}
          <button
            className="next-control-inline next-control-inline--fold"
            aria-label={collapsed ? 'Expand rankings' : 'Collapse rankings'}
            onClick={onCollapseToggle}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={collapsed ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
            </svg>
            <span>{collapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </div>
      </div>

      <div className="tier-desktop-tabs" aria-label="Filtrer par tier">
        <SegmentedControl
          className="tier-desktop-tabs-list"
          ariaLabel="Filter by tier"
          role="radiogroup"
          size="sm"
          layout="hug"
          tone="tinted"
          value={mobileTier}
          options={tierOptions}
          onChange={setMobileTier}
        />
        {sortControl('tier-sort-toggle-desktop')}
      </div>

      {/* ── Mobile view: heading + tier pills + cards ── */}
      <div className="tier-mobile-section">
        <div className="tier-mobile-topline">
          <h2 className="tier-mobile-title">My rankings</h2>
        </div>
        <div className="tier-mobile-filter-row">
          <SegmentedControl
            className="tier-mobile-tabs"
            ariaLabel="Filter by tier"
            role="radiogroup"
            size="sm"
            layout="scrollable"
            tone="tinted"
            value={mobileTier}
            options={tierOptions}
            onChange={setMobileTier}
          />
          {sortControl('tier-sort-toggle-mobile', true)}
        </div>
        <div className="tier-mobile-strip">
          {mobileTierItems.map(destination => {
            const isCoupDeCoeur = Boolean(destination.coupDeCoeur)
            const destinationTier = getDestinationTier(destination)
            const colors = TIER_COLORS[destinationTier]
            return (
              <article
                key={destination.name}
                className={`mini-destination${isCoupDeCoeur ? ' is-coup-de-coeur' : ''}`}
                style={{
                  backgroundImage: destination.image ? `url(${destination.image})` : undefined,
                  '--tier-pin': colors?.pin,
                } as CSSProperties}
              >
                <button
                  className="mini-destination-main"
                  onClick={() => onFlyTo(destination.name)}
                  aria-label={`Voir ${destination.name} sur la carte`}
                >
                  <span>{destination.name}</span>
                  <em>{destination.country}</em>
                </button>
                <span className="mini-tier-badge" aria-hidden="true" style={{ background: colors.pin } as CSSProperties}>
                  {destinationTier}
                </span>
                {isCoupDeCoeur && (
                  <span className="mini-heart-badge is-active" aria-label="Coup de coeur">
                    <HeartIcon filled />
                  </span>
                )}
              </article>
            )
          })}
        </div>
      </div>

      {/* ── Desktop view: full tier columns ── */}
      <div className="tier-rail">
        <button
          className="tier-rail-control tier-rail-control-prev"
          aria-label="See previous tiers"
          disabled={!canScrollPrev}
          onClick={() => scrollRail(-1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <div
          ref={railRef}
          className="tier-columns"
          onScroll={scheduleRailControlsUpdate}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
          onClickCapture={handleRailClickCapture}
        >
          {TIER_ORDER.map(tier => {
            const items = destinations
              .filter(destination => getDestinationTier(destination) === tier && destination.kind !== 'stop')
              .filter(() => mobileTier === 'all' || mobileTier === tier)
              .sort((a, b) => compareDestinations(a, b, sortMode))
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
                <div className="destination-strip-wrap">
                  <div className="destination-strip">
                  {items.map(destination => {
                    const isCoupDeCoeur = Boolean(destination.coupDeCoeur)

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
                        {isCoupDeCoeur && (
                          <span className="mini-favorite-button is-active" aria-label="Coup de coeur" title="Coup de coeur">
                            <HeartIcon filled />
                          </span>
                        )}
                      </article>
                    )
                  })}
                  </div>
                  {items.length > 3 && (
                    <span className="destination-strip-more">+{items.length - 3}</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
        <button
          className="tier-rail-control tier-rail-control-next"
          aria-label="See next tiers"
          disabled={!canScrollNext}
          onClick={() => scrollRail(1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

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

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
    </svg>
  )
}
