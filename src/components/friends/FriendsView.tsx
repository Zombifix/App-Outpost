import { useState } from 'react'
import { useFriends } from '../../hooks/useFriends'
import { useAuth } from '../../lib/auth'
import { supabaseConfigured } from '../../lib/supabase'
import AddFriendModal from './AddFriendModal'
import ActivityStrip from './ActivityStrip'
import type { Friendship } from '../../types'

interface FriendsViewProps {
  onOpenProfile?: (userId: string) => void
  onFlyTo?: (lat: number, lng: number, name: string) => void
}

/**
 * Hub social — la nouvelle 4e vue de premier niveau.
 *
 * Contient :
 *  - Empty state pédagogique si aucune amitié
 *  - Section "Demandes reçues" (Accepter / Refuser)
 *  - Section "Demandes envoyées" (statut + Annuler)
 *  - Liste d'amis acceptés avec actions
 *  - Gros bouton "+ Ajouter un ami" qui ouvre l'unique AddFriendModal
 */
export default function FriendsView({ onOpenProfile, onFlyTo }: FriendsViewProps) {
  const { user } = useAuth()
  const { accepted, incoming, outgoing, loading, acceptRequest, removeFriendship, error } = useFriends()
  const [addOpen, setAddOpen] = useState(false)

  if (!supabaseConfigured) {
    return (
      <main className="friends-view friends-view--unconfigured">
        <h2>Amis</h2>
        <p>
          Le système d'amis nécessite Supabase. Crée un fichier <code>.env.local</code> à la racine
          (voir <code>.env.local.example</code>) avec <code>VITE_SUPABASE_URL</code> et
          <code> VITE_SUPABASE_ANON_KEY</code>, puis relance <code>npm run dev</code>.
        </p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="friends-view friends-view--signin">
        <h2>Connecte-toi pour voir tes amis</h2>
        <p>Ouvre le menu "Compte" en haut à droite pour te connecter par email.</p>
      </main>
    )
  }

  const isEmpty = accepted.length === 0 && incoming.length === 0 && outgoing.length === 0

  return (
    <main className="friends-view" aria-label="Mes amis">
      <header className="friends-header">
        <div>
          <h1>Amis</h1>
          <p>{accepted.length} ami{accepted.length > 1 ? 's' : ''} · {incoming.length} demande{incoming.length > 1 ? 's' : ''} en attente</p>
        </div>
        <button className="add-submit friends-add-cta" onClick={() => setAddOpen(true)}>
          + Ajouter un ami
        </button>
      </header>

      {error && <p className="friends-feedback-err">{error}</p>}
      {loading && <p className="friends-muted">Chargement…</p>}

      {isEmpty && !loading && (
        <section className="friends-empty">
          <h3>Personne pour l'instant</h3>
          <p>Invite quelqu'un par email, ajoute-le par pseudo ou partage ton lien.</p>
          <button className="add-submit" onClick={() => setAddOpen(true)}>+ Ajouter mon premier ami</button>
        </section>
      )}

      {incoming.length > 0 && (
        <section className="friends-section">
          <h3>Demandes reçues</h3>
          <div className="friends-list">
            {incoming.map(f => (
              <FriendRow
                key={f.otherUser}
                friendship={f}
                onOpenProfile={onOpenProfile}
                primaryLabel="Accepter"
                onPrimary={() => acceptRequest(f.otherUser)}
                secondaryLabel="Refuser"
                onSecondary={() => removeFriendship(f.otherUser)}
              />
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="friends-section">
          <h3>Demandes envoyées</h3>
          <div className="friends-list">
            {outgoing.map(f => (
              <FriendRow
                key={f.otherUser}
                friendship={f}
                onOpenProfile={onOpenProfile}
                statusLabel="En attente"
                secondaryLabel="Annuler"
                onSecondary={() => removeFriendship(f.otherUser)}
              />
            ))}
          </div>
        </section>
      )}

      {accepted.length > 0 && (
        <section className="friends-section">
          <h3>Activité récente</h3>
          <ActivityStrip variant="full" onFlyTo={onFlyTo} onOpenProfile={onOpenProfile} />
        </section>
      )}

      {accepted.length > 0 && (
        <section className="friends-section">
          <h3>Mes amis</h3>
          <div className="friends-list">
            {accepted.map(f => (
              <FriendRow
                key={f.otherUser}
                friendship={f}
                onOpenProfile={onOpenProfile}
                primaryLabel="Voir le profil"
                onPrimary={() => onOpenProfile?.(f.otherUser)}
                secondaryLabel="Retirer"
                onSecondary={() => {
                  if (window.confirm(`Retirer ${f.displayName} de tes amis ?`)) {
                    void removeFriendship(f.otherUser)
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      {addOpen && <AddFriendModal onClose={() => setAddOpen(false)} />}
    </main>
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
}

function FriendRow({ friendship, onOpenProfile, primaryLabel, onPrimary, secondaryLabel, onSecondary, statusLabel }: FriendRowProps) {
  const f = friendship
  return (
    <div className="friends-row">
      <button
        className="friends-row-identity"
        onClick={() => onOpenProfile?.(f.otherUser)}
        title={`Profil de ${f.displayName}`}
      >
        <span className="friends-avatar" style={{ background: f.avatarBg, color: f.avatarFg }}>
          {f.displayName.slice(0, 1).toUpperCase()}
        </span>
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
