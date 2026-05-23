import { useState } from 'react'
import { useFriends } from '../../hooks/useFriends'
import type { Friendship } from '../../types'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface FriendsManagePanelProps {
  onClose: () => void
  onOpenAddFriend: () => void
  onViewFriendCarnet: (friend: Friendship) => void
  onCompareFriend: (friend: Friendship) => void
}

/**
 * Mini-pop-up de gestion des amis : une vue unique scrollable qui groupe
 * Demandes reçues → Envoyées → Mes amis. Pas d'onglets — tout est visible
 * d'un coup d'œil. Actions icon-only à droite de chaque ligne.
 */
export default function FriendsManagePanel({ onClose, onOpenAddFriend, onViewFriendCarnet, onCompareFriend }: FriendsManagePanelProps) {
  const { accepted, incoming, outgoing, loading, acceptRequest, removeFriendship, error } = useFriends()
  const isEmpty = accepted.length === 0 && incoming.length === 0 && outgoing.length === 0
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)

  const trapRef = useFocusTrap<HTMLDivElement>(true)

  return (
    <div ref={trapRef} className="manage-overlay" role="dialog" aria-modal="true" aria-label="Gestion des amis" onClick={onClose}>
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

        {error && <p className="friends-feedback-err" style={{ margin: 0 }}>{error}</p>}
        {loading && <p className="friends-muted">Chargement…</p>}

        <div className="manage-body">
          {isEmpty && !loading && (
            <EmptyState label="Personne pour l'instant. Ajoute quelqu'un par pseudo, email ou lien." />
          )}

          {incoming.length > 0 && (
            <RowGroup label={`Reçues · ${incoming.length}`}>
              {incoming.map(f => (
                <ManageRow
                  key={f.otherUser}
                  friendship={f}
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
            <RowGroup label={`Envoyées · ${outgoing.length}`}>
              {outgoing.map(f => (
                <ManageRow
                  key={f.otherUser}
                  friendship={f}
                  statusLabel="En attente"
                  actions={
                    <IconButton tone="neutral" title="Annuler" onClick={() => removeFriendship(f.otherUser)}>
                      <CloseIcon />
                    </IconButton>
                  }
                />
              ))}
            </RowGroup>
          )}

          {accepted.length > 0 && (
            <RowGroup label={`Mes amis · ${accepted.length}`}>
              {accepted.map(f => {
                const isConfirming = confirmingRemove === f.otherUser
                return (
                  <ManageRow
                    key={f.otherUser}
                    friendship={f}
                    onOpen={isConfirming ? undefined : () => onViewFriendCarnet(f)}
                    hint="Voir sa carte"
                    statusLabel={isConfirming ? `Retirer ${f.displayName} ?` : undefined}
                    actions={isConfirming ? (
                      <>
                        <IconButton tone="reject" title="Confirmer le retrait" onClick={() => {
                          setConfirmingRemove(null)
                          void removeFriendship(f.otherUser)
                        }}>
                          <CheckIcon />
                        </IconButton>
                        <IconButton tone="neutral" title="Annuler" onClick={() => setConfirmingRemove(null)}>
                          <CloseIcon />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          tone="neutral"
                          title="Comparer nos cartes"
                          onClick={() => onCompareFriend(f)}
                        >
                          <CompareIcon />
                        </IconButton>
                        <IconButton
                          tone="neutral"
                          title="Retirer"
                          onClick={() => setConfirmingRemove(f.otherUser)}
                        >
                          <CloseIcon />
                        </IconButton>
                      </>
                    )}
                  />
                )
              })}
            </RowGroup>
          )}
        </div>
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
  onOpen?: () => void
  statusLabel?: string
  hint?: string
  actions: React.ReactNode
}

function ManageRow({ friendship: f, onOpen, statusLabel, hint, actions }: ManageRowProps) {
  return (
    <li className="manage-row">
      <button
        type="button"
        className="manage-row-identity"
        onClick={onOpen}
        disabled={!onOpen}
        title={onOpen ? (hint ?? `Voir le carnet de ${f.displayName}`) : undefined}
      >
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

function CompareIcon() {
  // Deux colonnes superposées symbolisant "comparer"
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v16" />
      <path d="m3 8 4-4 4 4" />
      <path d="M17 20V4" />
      <path d="m13 16 4 4 4-4" />
    </svg>
  )
}
