import { useState } from 'react'
import { useFriends } from '../../hooks/useFriends'

interface FriendsOnMapPanelProps {
  onOpenProfile: (userId: string) => void
  onAddFriend: () => void
}

/**
 * Panneau flottant droite sur la vue Map.
 * Liste mes amis acceptés ; clic = ouvre le profil (onglet Carte par défaut côté parent si voulu).
 * Beaucoup plus utile que l'ancien FriendsPanel orphelin : action concrète + entrée vers le profil.
 *
 * Note : la surcouche des pins d'amis directement sur la WorldMap reste à câbler dans une
 * étape future (modifications du composant WorldMap requises). Cette première version donne
 * déjà accès au profil + carte d'un ami.
 */
export default function FriendsOnMapPanel({ onOpenProfile, onAddFriend }: FriendsOnMapPanelProps) {
  const { accepted } = useFriends()
  const [collapsed, setCollapsed] = useState(false)

  if (accepted.length === 0) {
    return (
      <aside className="panel-friends-on-map panel-friends-on-map--empty">
        <button className="panel-friends-collapse" onClick={() => setCollapsed(v => !v)}>
          {collapsed ? '▴' : '▾'}
        </button>
        {!collapsed && (
          <>
            <h4>Amis</h4>
            <p className="friends-muted">Personne pour l'instant.</p>
            <button className="add-submit" onClick={onAddFriend}>+ Ajouter un ami</button>
          </>
        )}
      </aside>
    )
  }

  return (
    <aside className="panel-friends-on-map" aria-label="Amis sur la carte">
      <header className="panel-friends-header">
        <h4>Amis</h4>
        <button className="panel-friends-collapse" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Déplier' : 'Replier'}>
          {collapsed ? '▴' : '▾'}
        </button>
      </header>
      {!collapsed && (
        <>
          <ul className="panel-friends-list">
            {accepted.map(f => (
              <li key={f.otherUser}>
                <button className="panel-friends-row" onClick={() => onOpenProfile(f.otherUser)}>
                  <span className="friends-avatar panel-friends-avatar" style={{ background: f.avatarBg, color: f.avatarFg }}>
                    {f.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="panel-friends-meta">
                    <strong>{f.displayName}</strong>
                    <small>@{f.handle}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="panel-friends-add" onClick={onAddFriend}>+ Ajouter un ami</button>
        </>
      )}
    </aside>
  )
}
