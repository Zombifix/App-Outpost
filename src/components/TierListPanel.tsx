import type { Destination, Tier } from '../types'
import { TIER_COLORS, TIER_ORDER } from '../data'

interface TierListPanelProps {
  destinations: Destination[]
  manageMode: boolean
  collapsed: boolean
  onManageToggle: () => void
  onCollapseToggle: () => void
  onFlyTo: (name: string) => void
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
  onManageToggle,
  onCollapseToggle,
  onFlyTo,
}: TierListPanelProps) {
  return (
    <section className={`tier-board ${manageMode ? 'is-managing' : ''} ${collapsed ? 'is-collapsed' : ''}`} aria-label="Ma tier list">
      <div className="tier-board-head">
        <h2>Ma tier list <span>({destinations.length} destinations)</span></h2>
        <button onClick={onManageToggle}>
          <Icon />
          {manageMode ? 'Terminer' : 'Gerer ma tier list'}
        </button>
      </div>

      <div className="tier-columns">
        {TIER_ORDER.map(tier => {
          const items = destinations.filter(destination => destination.tier === tier && destination.kind !== 'stop')
          const colors = TIER_COLORS[tier]

          return (
            <article className={`tier-column tier-column-${tier.toLowerCase()}`} key={tier}>
              <header>
                <strong style={{ color: colors.label }}>{tier}</strong>
                <span style={{ color: colors.label }}>{tierLabels[tier]}</span>
                <small>{items.length}</small>
              </header>
              <div className="destination-strip">
                {items.map(destination => (
                  <button
                    className="mini-destination"
                    key={destination.name}
                    onClick={() => onFlyTo(destination.name)}
                    style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
                  >
                    {manageMode && <i aria-hidden="true">...</i>}
                    <span>{destination.name}</span>
                    <small>* {(destination.score ?? 3).toFixed(1).replace('.', ',')}</small>
                  </button>
                ))}
              </div>
            </article>
          )
        })}
      </div>

      <button
        className="next-control"
        aria-label={collapsed ? 'Deplier la tier list' : 'Replier la tier list'}
        onClick={onCollapseToggle}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={collapsed ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
        </svg>
      </button>
    </section>
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
