import type { Destination, Friendship, Tier } from '../../types'
import { TIER_COLORS, TIER_ORDER } from '../../data'

interface FriendCompareViewProps {
  friend: Friendship
  myDestinations: Destination[]
  theirDestinations: Destination[]
}

/**
 * Comparateur Moi vs Ami — source unique de vérité.
 * Utilisé depuis :
 *   - FriendProfileSheet (onglet Tier list)
 *   - TierListPage (bouton "Comparer avec un ami")
 *
 * Rendu en flux (pas en modal/overlay) : le parent décide du cadrage.
 */
export default function FriendCompareView({ friend, myDestinations, theirDestinations }: FriendCompareViewProps) {
  return (
    <div className="friend-compare">
      <CommonDests mine={myDestinations} theirs={theirDestinations} friendName={friend.displayName} />
      <div className="friend-compare-grid">
        <DestList destinations={myDestinations} label="Moi" />
        <div className="friend-compare-sep" />
        <DestList destinations={theirDestinations} label={friend.displayName} />
      </div>
    </div>
  )
}

function CommonDests({ mine, theirs, friendName }: { mine: Destination[]; theirs: Destination[]; friendName: string }) {
  const myMap = new Map(mine.map(d => [d.name.toLowerCase(), d]))
  const common = theirs
    .map(t => ({ them: t, mine: myMap.get(t.name.toLowerCase()) }))
    .filter((x): x is { them: Destination; mine: Destination } => !!x.mine)
  if (common.length === 0) {
    return <p className="friends-muted">Aucune destination en commun avec {friendName} pour le moment.</p>
  }
  return (
    <section className="friend-compare-common">
      <h4>{common.length} destination{common.length > 1 ? 's' : ''} en commun</h4>
      <div className="friend-compare-common-list">
        {common.map(({ them, mine: m }) => {
          const same = them.tier === m.tier
          return (
            <div key={them.name} className={`friend-compare-common-row${same ? ' is-match' : ''}`}>
              <span className="friend-compare-common-name">{them.name}</span>
              <span className="friend-compare-common-tiers">
                {m.tier && <TierBadge tier={m.tier} />}
                <span className="friend-compare-vs">{same ? '=' : 'vs'}</span>
                {them.tier && <TierBadge tier={them.tier} />}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const c = TIER_COLORS[tier]
  return (
    <span
      className="tier-badge-compact"
      style={{ color: c.label, background: c.pin + '20', borderColor: c.pin + '55' }}
    >
      {tier}
    </span>
  )
}

function DestList({ destinations, label }: { destinations: Destination[]; label: string }) {
  return (
    <div className="friend-compare-col">
      <h5 className="friend-compare-col-label">{label}</h5>
      {TIER_ORDER.map(tier => {
        const items = destinations.filter(d => d.tier === tier)
        if (items.length === 0) return null
        const c = TIER_COLORS[tier]
        return (
          <div key={tier} className="friend-compare-tier-block">
            <div className="friend-compare-tier-header">
              <span className="tier-badge-compact" style={{ color: c.label, background: c.pin + '20', borderColor: c.pin + '55' }}>{tier}</span>
              <span className="friend-compare-tier-line" style={{ background: c.pin + '30' }} />
            </div>
            {items.map(d => (
              <div key={d.name} className="friend-compare-tier-item">
                <span className="friend-compare-tier-dot" style={{ background: c.pin }} />
                <span className="friend-compare-tier-name">{d.name}</span>
                <span className="friend-compare-tier-country">{d.country}</span>
              </div>
            ))}
          </div>
        )
      })}
      {destinations.length === 0 && (
        <p className="friends-muted">Aucune destination.</p>
      )}
    </div>
  )
}
