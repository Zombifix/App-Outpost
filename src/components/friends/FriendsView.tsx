import { useMemo, useState } from 'react'
import { Avatar } from '../Avatar'
import { useFriends } from '../../hooks/useFriends'
import { useActivityFeed } from '../../hooks/useActivityFeed'
import { useAuth } from '../../lib/auth'
import { supabaseConfigured } from '../../lib/supabase'
import { FAKE_FRIENDS_MODE } from '../../hooks/_fakeFriends'
import { t } from '../../i18n'
import AddFriendModal from './AddFriendModal'
import ActivityStrip from './ActivityStrip'
import type { Friendship } from '../../types'

interface FriendsViewProps {
  onOpenProfile?: (userId: string) => void
  onFlyTo?: (lat: number, lng: number, name: string) => void
}

export default function FriendsView({ onOpenProfile, onFlyTo }: FriendsViewProps) {
  const { user } = useAuth()
  const { accepted, incoming, outgoing, loading, acceptRequest, removeFriendship, error } = useFriends()
  const { events } = useActivityFeed(60)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)

  const sharedCount = useMemo(() => {
    const since = Date.now() - 30 * 24 * 3600 * 1000
    return events.filter(
      e => e.kind === 'destination_added' && new Date(e.createdAt).getTime() >= since,
    ).length
  }, [events])

  if (!supabaseConfigured && !FAKE_FRIENDS_MODE) {
    if (import.meta.env.DEV) {
      console.info('[FriendsView] Supabase not configured — see .env.local.example for VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
    }
    return (
      <main className="friends-view friends-view--unconfigured">
        <h2>{t('Friends', 'Amis')}</h2>
        <p>{t('This feature is not available yet.', 'Cette fonctionnalité n\'est pas encore disponible.')}</p>
      </main>
    )
  }

  if (!user && !FAKE_FRIENDS_MODE) {
    return (
      <main className="friends-view friends-view--signin">
        <h2>{t('Sign in to see your friends', 'Connecte-toi pour voir tes amis')}</h2>
        <p>{t('Open the "Account" menu in the top right to sign in.', 'Ouvre le menu "Compte" en haut à droite pour te connecter.')}</p>
      </main>
    )
  }

  const isEmpty = accepted.length === 0 && incoming.length === 0 && outgoing.length === 0

  return (
    <main className="friends-view" aria-label={t('My friends', 'Mes amis')}>
      <header className="friends-header">
        <div className="friends-header-text">
          <h1>{t('Friends', 'Amis')}</h1>
          <p className="friends-header-stats">
            <span><strong>{accepted.length}</strong> {t(accepted.length > 1 ? 'friends' : 'friend', accepted.length > 1 ? 'amis' : 'ami')}</span>
            <span aria-hidden="true"> · </span>
            <span><strong>{incoming.length}</strong> {t(`pending ${incoming.length > 1 ? 'requests' : 'request'}`, `demande${incoming.length > 1 ? 's' : ''} en attente`)}</span>
            <span aria-hidden="true"> · </span>
            <span><strong>{sharedCount}</strong> {t(`${sharedCount > 1 ? 'destinations' : 'destination'} shared this month`, `destination${sharedCount > 1 ? 's' : ''} partagée${sharedCount > 1 ? 's' : ''} ce mois`)}</span>
          </p>
        </div>
        <button className="friends-action-btn friends-action-secondary" onClick={() => setAddOpen(true)}>
          + {t('Add a friend', 'Ajouter un ami')}
        </button>
      </header>

      {error && <p className="friends-feedback-err">{error}</p>}
      {loading && <p className="friends-muted">{t('Loading…', 'Chargement…')}</p>}

      {isEmpty && !loading && (
        <section className="friends-empty">
          <h3>{t('No one yet', 'Personne pour l\'instant')}</h3>
          <p>{t('Invite someone by email, add them by username, or share your link.', 'Invite quelqu\'un par email, ajoute-le par pseudo ou partage ton lien.')}</p>
          <button className="add-submit" onClick={() => setAddOpen(true)}>+ {t('Add my first friend', 'Ajouter mon premier ami')}</button>
        </section>
      )}

      {!isEmpty && (
        <div className="friends-layout">
          <section className="friends-feed">
            <SectionHead title={t('Recent activity', 'Activité récente')} />
            {accepted.length > 0 ? (
              <ActivityStrip variant="full" onFlyTo={onFlyTo} onOpenProfile={onOpenProfile} />
            ) : (
              <p className="friends-muted">{t('Add friends to see their trips here.', 'Ajoute des amis pour voir leurs voyages ici.')}</p>
            )}
          </section>

          <aside className="friends-aside" aria-label={t('My friends and requests', 'Mes amis et demandes')}>
            {incoming.length > 0 && (
              <section className="friends-section">
                <SectionHead title={t('Received requests', 'Demandes reçues')} count={incoming.length} tone="accent" />
                <div className="friends-list">
                  {incoming.map(f => (
                    <FriendRow
                      key={f.otherUser}
                      friendship={f}
                      onOpenProfile={onOpenProfile}
                      primaryLabel={t('Accept', 'Accepter')}
                      onPrimary={() => acceptRequest(f.otherUser)}
                      secondaryLabel={t('Decline', 'Refuser')}
                      onSecondary={() => removeFriendship(f.otherUser)}
                      accent
                      compact
                    />
                  ))}
                </div>
              </section>
            )}

            {outgoing.length > 0 && (
              <section className="friends-section">
                <SectionHead title={t('Sent requests', 'Demandes envoyées')} count={outgoing.length} />
                <div className="friends-list">
                  {outgoing.map(f => (
                    <FriendRow
                      key={f.otherUser}
                      friendship={f}
                      onOpenProfile={onOpenProfile}
                      statusLabel={t('Pending', 'En attente')}
                      secondaryLabel={t('Cancel', 'Annuler')}
                      onSecondary={() => removeFriendship(f.otherUser)}
                      compact
                    />
                  ))}
                </div>
              </section>
            )}

            {accepted.length > 0 && (
              <section className="friends-section">
                <SectionHead title={t('My friends', 'Mes amis')} count={accepted.length} />
                <div className="friends-list">
                  {accepted.map(f => {
                    const isConfirming = confirmingRemove === f.otherUser
                    return (
                      <FriendRow
                        key={f.otherUser}
                        friendship={f}
                        onOpenProfile={onOpenProfile}
                        primaryLabel={isConfirming ? t('Confirm', 'Confirmer') : undefined}
                        onPrimary={isConfirming ? () => {
                          setConfirmingRemove(null)
                          void removeFriendship(f.otherUser)
                        } : undefined}
                        secondaryLabel={isConfirming ? t('Cancel', 'Annuler') : t('Remove', 'Retirer')}
                        onSecondary={() => setConfirmingRemove(isConfirming ? null : f.otherUser)}
                        compact
                      />
                    )
                  })}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

      {addOpen && <AddFriendModal onClose={() => setAddOpen(false)} />}
    </main>
  )
}

interface SectionHeadProps {
  title: string
  count?: number
  tone?: 'default' | 'accent'
}

function SectionHead({ title, count, tone = 'default' }: SectionHeadProps) {
  return (
    <div className={`friends-section-head${tone === 'accent' ? ' friends-section-head--accent' : ''}`}>
      <h3>{title}</h3>
      {typeof count === 'number' && <span className="friends-section-count">{count}</span>}
    </div>
  )
}

interface FriendRowProps {
  friendship: Friendship
  onOpenProfile?: (userId: string) => void
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  statusLabel?: string
  accent?: boolean
  compact?: boolean
}

function FriendRow({ friendship, onOpenProfile, primaryLabel, onPrimary, secondaryLabel, onSecondary, statusLabel, accent, compact }: FriendRowProps) {
  const f = friendship
  return (
    <div className={`friends-row${accent ? ' friends-row--accent' : ''}${compact ? ' friends-row--compact' : ''}`}>
      <button
        className="friends-row-identity"
        onClick={() => onOpenProfile?.(f.otherUser)}
        title={t(`${f.displayName}'s profile`, `Profil de ${f.displayName}`)}
      >
        <Avatar avatarUrl={f.avatarUrl} initials={f.displayName} bg={f.avatarBg} fg={f.avatarFg} />
        <span className="friends-row-meta">
          <strong>{f.displayName}</strong>
          <small>@{f.handle}{statusLabel ? ` · ${statusLabel}` : ''}</small>
        </span>
      </button>
      <div className="friends-row-actions">
        {primaryLabel && onPrimary && (
          <button className="add-submit friends-action-btn" onClick={onPrimary}>{primaryLabel}</button>
        )}
        {secondaryLabel && onSecondary && (
          <button className="friends-action-btn friends-action-secondary" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
