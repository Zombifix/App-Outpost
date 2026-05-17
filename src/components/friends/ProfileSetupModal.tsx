import { useEffect, useState } from 'react'
import type { useMyProfile } from '../../hooks/useMyProfile'
import { useAuth } from '../../lib/auth'

type ProfileHook = ReturnType<typeof useMyProfile>

interface ProfileSetupModalProps {
  /** Les actions du hook useMyProfile détenu par le parent (AppInner). On les
   *  passe en props pour que le upsert mute le MÊME state que celui qui
   *  contrôle l'affichage du modal — sinon le modal reste ouvert après création. */
  upsert: ProfileHook['upsert']
  checkHandleAvailable: ProfileHook['checkHandleAvailable']
}

/**
 * Forcé au premier login : impossible de fermer tant que le handle + nom ne sont
 * pas remplis et sauvés. Sans `public_profile`, l'utilisateur est invisible aux
 * recherches d'amis et les RPC `my_friendships` ne retournent rien.
 *
 * Rendu uniquement par App.tsx quand `useMyProfile().needsSetup === true`.
 */
export default function ProfileSetupModal({ upsert, checkHandleAvailable }: ProfileSetupModalProps) {
  const { user, signOut } = useAuth()
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'taken' | 'free' | 'invalid'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pré-remplir avec l'email
  useEffect(() => {
    if (!user?.email) return
    const local = user.email.split('@')[0]
    setDisplayName(prev => prev || prettifyName(local))
    setHandle(prev => prev || sanitizeHandle(local))
  }, [user])

  // Vérification live de la dispo du handle (debounced)
  useEffect(() => {
    const cleaned = sanitizeHandle(handle)
    if (cleaned.length < 2) {
      setHandleStatus(cleaned.length === 0 ? 'idle' : 'invalid')
      return
    }
    setHandleStatus('checking')
    const t = window.setTimeout(async () => {
      const free = await checkHandleAvailable(cleaned)
      setHandleStatus(free ? 'free' : 'taken')
    }, 350)
    return () => window.clearTimeout(t)
  }, [handle, checkHandleAvailable])

  const submit = async () => {
    setError(null)
    const cleanedHandle = sanitizeHandle(handle)
    const cleanedName = displayName.trim()
    if (cleanedHandle.length < 2) { setError('Handle trop court (min 2)'); return }
    if (!cleanedName) { setError('Nom requis'); return }
    if (handleStatus === 'taken') { setError('Handle déjà pris'); return }
    setBusy(true)
    const res = await upsert({ handle: cleanedHandle, displayName: cleanedName })
    setBusy(false)
    if (!res.ok) setError(res.error ?? 'Erreur')
  }

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="Créer ton profil">
      <aside className="account-panel friends-add-panel" style={{ maxWidth: 460 }}>
        <h2 style={{ marginTop: 4 }}>Bienvenue sur Outpost</h2>
        <p className="account-hint">
          Choisis un pseudo (handle) et un nom affiché. C'est ce que tes amis verront pour te trouver et comparer leurs tier lists avec la tienne.
        </p>

        <label>
          Pseudo
          <div className="profile-setup-handle-wrap">
            <span className="profile-setup-handle-prefix">@</span>
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="theo-p"
              maxLength={32}
              autoFocus
            />
          </div>
        </label>
        <HandleHint status={handleStatus} value={sanitizeHandle(handle)} />

        <label>
          Nom affiché
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Théo"
            maxLength={60}
          />
        </label>

        {error && <p className="friends-feedback-err">{error}</p>}

        <button
          className="add-submit"
          onClick={submit}
          disabled={busy || handleStatus === 'taken' || handleStatus === 'invalid' || handleStatus === 'checking'}
          style={{ marginTop: 12 }}
        >
          {busy ? 'Création…' : 'Créer mon profil'}
        </button>

        <button
          onClick={signOut}
          style={{
            marginTop: 8, background: 'transparent', border: 'none',
            color: '#9ca3af', fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Me déconnecter
        </button>
      </aside>
    </div>
  )
}

function HandleHint({ status, value }: { status: string; value: string }) {
  if (status === 'idle') return <p className="friends-muted">Minimum 2 caractères, lettres / chiffres / tirets.</p>
  if (status === 'invalid') return <p className="friends-feedback-err">Handle trop court.</p>
  if (status === 'checking') return <p className="friends-muted">Vérification…</p>
  if (status === 'taken') return <p className="friends-feedback-err">@{value} est déjà pris.</p>
  if (status === 'free') return <p className="friends-feedback-ok">@{value} est disponible ✓</p>
  return null
}

function sanitizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function prettifyName(raw: string): string {
  return raw.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
