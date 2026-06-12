import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Destination } from '../types'
import type { ContinentBucket } from '../utils'
import { computeTravelerProfile } from '../utils'
import { t } from '../i18n'

const ACCOUNT_CONTINENT_META: Record<ContinentBucket, { label: string; icon: string; color: string; soft: string }> = {
  Europe: { label: 'Europe', icon: '🍷', color: '#ef7b73', soft: '#fff1f1' },
  Asie: { label: 'Asia', icon: '🏮', color: '#f7bd42', soft: '#fff7dd' },
  Ameriques: { label: 'Americas', icon: '🌎', color: '#45c489', soft: '#e8fbf2' },
  Afrique: { label: 'Africa', icon: '🌍', color: '#f0934e', soft: '#fff2e6' },
  Oceanie: { label: 'Oceania', icon: '🌊', color: '#56a8f5', soft: '#eaf5ff' },
  Autre: { label: 'Other', icon: '🧭', color: '#94a3b8', soft: '#f1f5f9' },
}

const PROFILE_ACHIEVEMENT_ICONS: Record<string, string> = {
  'note-merit': '⭐',
  'good-public': '🌟',
  'heart-rare': '🤍',
  'heart-easy': '💗',
  'return-ticket': '🔥',
  terrain: '📍',
  'continent-compass': '🧭',
  'soft-addition': '💶',
  'budget-control': '💶',
  'weekend-profit': '🗓️',
  'wide-gap': '🌍',
  'culture-sling': '🏛️',
  'plate-priority': '🍽️',
  'documented-trouble': '⚠️',
  'seasoned-book': '📘',
  'outside-comfort': '🌿',
}

export function getProfileAchievementIcon(key: string, icon: string) {
  return PROFILE_ACHIEVEMENT_ICONS[key] ?? icon
}

/* ── Carte complète — réservée au panneau Compte ─────────────────────────── */

export function TravelerProfileCard({ destinations }: { destinations: Destination[] }) {
  const profile = useMemo(() => computeTravelerProfile(destinations), [destinations])
  const { total, confidence, countries, title, subtitle, behaviorTags, achievements, territories } = profile
  const stackSegments = territories

  return (
    <div className="account-profile-card" aria-label={t('Traveler profile', 'Profil voyageur')}>
      {total === 0 && (
        <div className="account-profile-empty">
          <strong>{t('Profile warming up', 'Profil en rodage')}</strong>
          <span>{t('Add destinations to let the journal start talking.', 'Ajoute des destinations pour laisser le carnet commencer à parler.')}</span>
        </div>
      )}

      {total > 0 && (
        <>
          <section className="account-profile-title-block" aria-label={t('Traveler archetype', 'Archétype voyageur')}>
            <span className="account-profile-title-icon" aria-hidden="true">✦</span>
            <div>
              <h3>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
              {behaviorTags.length > 0 && (
                <ul className="account-profile-inline-traits" aria-label={t('Traveler profile traits', 'Traits du profil voyageur')}>
                  {behaviorTags.map(tag => <li key={tag.key}>{tag.label}</li>)}
                </ul>
              )}
            </div>
          </section>

          {achievements.length > 0 && (
            <section className="account-profile-achievements" aria-label={t('Traveler achievements', 'Succès voyageur')}>
              {achievements.map(achievement => (
                <article key={achievement.key} className={`account-profile-tag account-profile-tag--${achievement.tone ?? 'blue'}`}>
                  <span className="account-profile-tag-icon" aria-hidden="true">{getProfileAchievementIcon(achievement.key, achievement.icon)}</span>
                  <span className="account-profile-tag-body">
                    <strong>{achievement.title}</strong>
                    <span>{achievement.detail}</span>
                  </span>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {stackSegments.length > 0 && confidence !== 'empty' && confidence !== 'low' && confidence !== 'light' && (
        <section className="account-profile-continents" aria-label={t('Journal compass', 'Boussole du carnet')}>
          <div className="account-profile-section-head">
            <h4>{t('Journal compass', 'Boussole du carnet')}</h4>
            <span>{countries} {t('countries visited', 'pays visités')}</span>
          </div>
          <div className="account-continent-stack" aria-hidden="true">
            {stackSegments.map(territory => (
              <span
                key={territory.key}
                className="account-continent-stack-segment"
                style={{
                  '--continent-color': ACCOUNT_CONTINENT_META[territory.key].color,
                  width: `${Math.max(8, Math.round(territory.pct))}%`,
                } as CSSProperties}
              />
            ))}
          </div>
          <div className="account-continent-list">
            {stackSegments.map(territory => {
              const meta = ACCOUNT_CONTINENT_META[territory.key]
              return (
                <div key={territory.key} className="account-continent-row">
                  <span
                    className="account-continent-icon"
                    style={{
                      '--continent-color': meta.color,
                      '--continent-soft': meta.soft,
                    } as CSSProperties}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>
                  <strong>{territory.label}</strong>
                  <span className="account-continent-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, Math.round(territory.pct))}%`, background: meta.color }} />
                  </span>
                  <span className="account-continent-pct">{Math.round(territory.pct)}%</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

/* ── Strip slim — bannière compare + overlay map ami ─────────────────────── */

const STRIP_ACHIEVEMENT_COUNT = 2

export interface TravelerProfileStripProps {
  destinations: Destination[]
  /** 'right' : aligné à droite (colonne ami dans la bannière compare). */
  align?: 'left' | 'right'
  /** Chevron qui déplie tous les succès + la boussole inline. */
  expandable?: boolean
  /** Démarre en chip une ligne (✦ titre ▾) — overlay map mobile. */
  defaultCollapsed?: boolean
}

export function TravelerProfileStrip({
  destinations,
  align = 'left',
  expandable = false,
  defaultCollapsed = false,
}: TravelerProfileStripProps) {
  const profile = useMemo(() => computeTravelerProfile(destinations), [destinations])
  const { total, confidence, countries, title, achievements, territories } = profile
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [expanded, setExpanded] = useState(false)

  if (total === 0) return null

  const showContinents = territories.length > 0 && confidence !== 'empty' && confidence !== 'low' && confidence !== 'light'
  const pills = expanded ? achievements : achievements.slice(0, STRIP_ACHIEVEMENT_COUNT)
  const canExpand = expandable && (achievements.length > STRIP_ACHIEVEMENT_COUNT || showContinents)

  if (collapsed) {
    return (
      <button
        type="button"
        className="traveler-strip-chip"
        onClick={() => setCollapsed(false)}
        aria-expanded={false}
        aria-label={t('Show traveler profile', 'Afficher le profil voyageur')}
      >
        <span aria-hidden="true">✦</span>
        <strong>{title}</strong>
        <span aria-hidden="true">▾</span>
      </button>
    )
  }

  return (
    <div
      className={`traveler-strip${align === 'right' ? ' traveler-strip--right' : ''}`}
      aria-label={t('Traveler profile', 'Profil voyageur')}
    >
      <div className="traveler-strip-title">
        <span aria-hidden="true">✦</span>
        <strong>{title}</strong>
        {defaultCollapsed && (
          <button
            type="button"
            className="traveler-strip-toggle"
            onClick={() => setCollapsed(true)}
            aria-label={t('Hide traveler profile', 'Masquer le profil voyageur')}
          >
            ▴
          </button>
        )}
        {canExpand && !defaultCollapsed && (
          <button
            type="button"
            className="traveler-strip-toggle"
            onClick={() => setExpanded(prev => !prev)}
            aria-expanded={expanded}
            aria-label={expanded ? t('Less', 'Moins') : t('See full profile', 'Voir le profil complet')}
          >
            {expanded ? '▴' : '▾'}
          </button>
        )}
      </div>

      {pills.length > 0 && (
        <ul className="traveler-strip-pills" aria-label={t('Traveler achievements', 'Succès voyageur')}>
          {pills.map(achievement => (
            <li key={achievement.key} title={achievement.detail}>
              <span aria-hidden="true">{getProfileAchievementIcon(achievement.key, achievement.icon)}</span>
              {achievement.title}
            </li>
          ))}
        </ul>
      )}

      {showContinents && (
        <div className="traveler-strip-compass">
          <div className="account-continent-stack account-continent-stack--thin" aria-hidden="true">
            {territories.map(territory => (
              <span
                key={territory.key}
                className="account-continent-stack-segment"
                style={{
                  '--continent-color': ACCOUNT_CONTINENT_META[territory.key].color,
                  width: `${Math.max(8, Math.round(territory.pct))}%`,
                } as CSSProperties}
              />
            ))}
          </div>
          <span className="traveler-strip-countries">{countries} {t('countries', 'pays')}</span>
        </div>
      )}

      {expanded && showContinents && (
        <div className="account-continent-list">
          {territories.map(territory => {
            const meta = ACCOUNT_CONTINENT_META[territory.key]
            return (
              <div key={territory.key} className="account-continent-row">
                <span
                  className="account-continent-icon"
                  style={{
                    '--continent-color': meta.color,
                    '--continent-soft': meta.soft,
                  } as CSSProperties}
                  aria-hidden="true"
                >
                  {meta.icon}
                </span>
                <strong>{territory.label}</strong>
                <span className="account-continent-meter" aria-hidden="true">
                  <span style={{ width: `${Math.max(8, Math.round(territory.pct))}%`, background: meta.color }} />
                </span>
                <span className="account-continent-pct">{Math.round(territory.pct)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
