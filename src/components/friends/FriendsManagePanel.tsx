import { useState } from 'react'
import { useFriends } from '../../hooks/useFriends'
import type { Friendship } from '../../types'

interface FriendsManagePanelProps {
  onClose: () => void
  onOpenAddFriend: () => void
  onOpenProfile: (userId: string) => void
  onViewFriendCarnet: (friend: Friendship) => void
}

type Tab = 'requests' | 'friends'

/**
 * Mini-pop-up dense de gestion des amis. Pas de gros boutons, pas de gros
 * titres : tout est inline, icon-only pour les actions, divisé en deux onglets
 * (Demandes / Amis). Le fil d'activité vit dans la sidebar de la map.
 */
export default function FriendsManagePanel({ onClose, onOpenAddFriend, onOpenProfile, onViewFriendCarnet }: FriendsManagePanelProps) {
  const { accepted, incoming, outgoing, loading, acceptRequest, removeFriendship, error } = useFriends()
  const requestsCount = incoming.length + outgoing.length
  const [tab, setTab] = useState<Tab>(incoming.length > 0 ? 'requests' : 'friends')

  return (
    <div className="manage-overlay" role="dialog" aria-label="Gestion des amis" onClick={onClose}>
      <aside className="manage-panel" onClick={e => e.stopPropagation()}>
        <header className="manage-head">
          <div className="manage-title">
            <h2>Amis</h2>
            <span className="manage-count">{accepted.length}</span>
          </div>
          <button
            type="button"
            className="manage-add"
            onClick={onOpenAddFriend}
            aria-label="Ajouter un ami"
          >
            <PlusIcon />
            <span>Ajouter</span>
          </button>
          <button
            type="button"
            className="manage-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <CloseIcon />
          </button>
        </header>

        <nav className="manage-tabs" role="tablist" aria-label="Sections amis">
          <button
            role="tab"
            aria-selected={tab === 'requests'}
            className={`manage-tab${tab === 'requests' ? ' is-active' : ''}`}
            onClick={() => setTab('requests')}
          >
            Demandes
            {requestsCount > 0 && <span className="manage-tab-badge">{requestsCount}</span>}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'friends'}
            className={`manage-tab${tab === 'friends' ? ' is-active' : ''}`}
            onClick={() => setTab('friends')}
          >
            Mes amis
          </button>
        </nav>

        {error && <p className="friends-feedback-err" style={{ margin: 0 }}>{error}</p>}
        {loading && <p className="friends-muted">Chargement…</p>}

        {tab === 'requests' && (
          <div className="manage-body">
            {requestsCount === 0 && !loading && (
              <EmptyState label="Aucune demande en attente." />
            )}
            {incoming.length > 0 && (
              <RowGroup label="Reçues">
                {incoming.map(f => (
                  <ManageRow
                    key={f.otherUser}
                    friendship={f}
                    onOpen={() => { onClose(); onOpenProfile(f.otherUser) }}
                    actions={
                      <>
                        <IconButton tone="accept" title="Accepter" onClick={() => acceptRequest(f.otherUser)}>
                          <CheckIcon />
                        </IconButton>
                        <IconButton tone="reject" title="Refuser" onClick={() => removeFriendship(f.otherUser)}>
                          <CloseIcon />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </RowGroup>
            )}
            {outgoing.length > 0 && (
              <RowGroup label="Envoyées">
                {outgoing.map(f => (
                  <ManageRow
                    key={f.otherUser}
                    friendship={f}
                    statusLabel="En attente"
                    onOpen={() => { onClose(); onOpenProfile(f.otherUser) }}
                    actions={
                      <IconButton tone="neutral" title="Annuler" onClick={() => removeFriendship(f.otherUser)}>
                        <CloseIcon />
                      </IconButton>
                    }
                  />
                ))}
              </RowGroup>
            )}
          </div>
        )}

        {tab === 'friends' && (
          <div className="manage-body">
            {accepted.length === 0 && !loading && (
              <EmptyState label="Personne pour l'instant. Ajoute quelqu'un par pseudo, email ou lien." />
            )}
            {accepted.map(f => (
              <ManageRow
                key={f.otherUser}
                friendship={f}
                onOpen={() => onViewFriendCarnet(f)}
                hint="Voir sa carte"
                actions={
                  <IconButton
                    tone="neutral"
                    title="Retirer"
                    onClick={() => {
                      if (window.confirm(`Retirer ${f.displayName} de tes amis ?`)) {
                        void removeFriendship(f.otherUser)
                      }
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                }
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="manage-empty">{label}</p>
}

function RowGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="manage-group">
      <h4>{label}</h4>
      <ul>{children}</ul>
    </div>
  )
}

interface ManageRowProps {
  friendship: Friendship
  onOpen: () => void
  statusLabel?: string
  hint?: string
  actions: React.ReactNode
}

function ManageRow({ friendship: f, onOpen, statusLabel, hint, actions }: ManageRowProps) {
  return (
    <li className="manage-row">
      <button className="manage-row-identity" onClick={onOpen} title={hint ?? `Profil de ${f.displayName}`}>
        <span className="manage-avatar" style={{ background: f.avatarBg, color: f.avatarFg }}>
          {f.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="manage-row-meta">
          <strong>{f.displayName}</strong>
          <small>@{f.handle}{statusLabel ? ` · ${statusLabel}` : ''}</small>
        </span>
      </button>
      <span className="manage-row-actions">{actions}</span>
    </li>
  )
}

function IconButton({
  tone, title, onClick, children,
}: {
  tone: 'accept' | 'reject' | 'neutral'
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`manage-icon-btn manage-icon-btn--${tone}`}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
