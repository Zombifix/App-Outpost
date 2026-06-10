import { useEffect, useMemo, useState } from 'react'
import type { PublicProfile } from '../../types'
import { useFriends } from '../../hooks/useFriends'
import { useAuth } from '../../lib/auth'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { SegmentedControl } from '../SegmentedControl'
import { t } from '../../i18n'

type Tab = 'email' | 'handle' | 'link'

interface AddFriendModalProps {
  onClose: () => void
}

/**
 * Modal unifié d'ajout d'ami — trois méthodes en onglets :
 *  1. Email (envoie un magic-link Supabase + crée un friend_invites token)
 *  2. Handle (lookup en live dans public_profiles + envoie send_friend_request)
 *  3. Lien d'invitation à copier/partager
 *
 * C'est *le seul* point d'entrée pour ajouter un ami partout dans l'app.
 */
export default function AddFriendModal({ onClose }: AddFriendModalProps) {
  const [tab, setTab] = useState<Tab>('handle')
  const { user } = useAuth()
  const { searchProfiles, sendRequestByUserId, createEmailInvite, pendingActions } = useFriends()

  const [handleQuery, setHandleQuery] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [sentTo, setSentTo] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const [email, setEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailInviteLink, setEmailInviteLink] = useState('')

  const [linkCopied, setLinkCopied] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)

  const buildInviteLink = (token: string) => `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(token)}`

  // Debounce + recherche live des profils par handle/displayName
  useEffect(() => {
    if (tab !== 'handle') return
    const q = handleQuery.trim()
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    const t = window.setTimeout(async () => {
      const found = await searchProfiles(q)
      setResults(found.filter(p => p.userId !== user?.id))
      setSearching(false)
    }, 220)
    return () => window.clearTimeout(t)
  }, [handleQuery, tab, searchProfiles, user])

  const sendHandle = async (profile: PublicProfile) => {
    // Garde anti double-clic locale, complétée par le pendingActions du hook
    if (pendingActions.has(`user:${profile.userId}`)) return
    const res = await sendRequestByUserId(profile.userId)
    if (res.ok) {
      setSentTo(prev => new Set(prev).add(profile.userId))
      setFeedback({ kind: 'ok', msg: t(`Request sent to @${profile.handle}`, `Demande envoyée à @${profile.handle}`) })
    } else {
      setFeedback({ kind: 'err', msg: res.error ?? t('Unknown error', 'Erreur inconnue') })
    }
  }

  const sendEmail = async () => {
    const cleaned = email.trim().toLowerCase()
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setFeedback({ kind: 'err', msg: 'Invalid email' })
      return
    }
    setEmailBusy(true)
    const inv = await createEmailInvite(cleaned)
    if (inv.error || !inv.token) {
      setFeedback({ kind: 'err', msg: inv.error ?? t('Invite error', 'Erreur invitation') })
      setEmailBusy(false)
      return
    }
    const link = buildInviteLink(inv.token)
    setEmailInviteLink(link)
    setEmailBusy(false)
    setFeedback({ kind: 'ok', msg: `Link ready for ${cleaned}. Copy it and send it from your messaging app.` })
  }

  const generateInviteLink = async () => {
    if (inviteToken) return
    setInviteBusy(true)
    const inv = await createEmailInvite(`invite+${Date.now()}@outpost.local`)
    setInviteBusy(false)
    if (inv.token) setInviteToken(inv.token)
    else setFeedback({ kind: 'err', msg: inv.error ?? 'Could not create link' })
  }

  const shareLink = useMemo(() => {
    if (!inviteToken) return ''
    return buildInviteLink(inviteToken)
  }, [inviteToken])

  const copyEmailLink = async () => {
    if (!emailInviteLink) return
    try {
      await navigator.clipboard.writeText(emailInviteLink)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      setFeedback({ kind: 'err', msg: 'Could not copy — select the link manually.' })
    }
  }

  const copyLink = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      setFeedback({ kind: 'err', msg: 'Could not copy — select the link manually.' })
    }
  }

  const nativeShare = async () => {
    if (!shareLink) return
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join me on Outpost', url: shareLink })
      } else {
        await copyLink()
      }
    } catch { /* user cancelled */ }
  }

  const trapRef = useFocusTrap<HTMLDivElement>(true)

  return (
    <div ref={trapRef} className="account-overlay friends-modal-overlay" role="dialog" aria-modal="true" aria-label={t('Add a friend', 'Ajouter un ami')} onClick={onClose}>
      <aside
        className="account-panel friends-add-panel"
        onClick={e => e.stopPropagation()}
      >
        <button className="floating-close" aria-label={t('Close', 'Fermer')} onClick={onClose}>
          <CloseIcon />
        </button>

        <h2>{t('Add a friend', 'Ajouter un ami')}</h2>
        <p className="account-hint">
          {t('Find someone by username, invite them by email, or share your personal link.', 'Trouve quelqu\'un par pseudo, invite-le par email, ou partage ton lien personnel.')}
        </p>

        <SegmentedControl
          className="account-tabs"
          ariaLabel={t('Add a friend', 'Ajouter un ami')}
          role="tablist"
          size="sm"
          layout="fill"
          value={tab}
          options={[
            { value: 'handle', label: t('@ Username', '@ Pseudo') },
            { value: 'email', label: 'Email' },
            { value: 'link', label: t('Link', 'Lien') },
          ]}
          onChange={nextTab => {
            setTab(nextTab)
            setFeedback(null)
          }}
        />

        {tab === 'handle' && (
          <div className="friends-tab-pane">
            <label>
              {t('Username or name', 'Pseudo ou nom')}
              <input
                value={handleQuery}
                onChange={e => setHandleQuery(e.target.value)}
                placeholder="@lea-m ou Léa"
                autoFocus
              />
            </label>
            <div className="friends-results">
              {searching && <p className="friends-muted">{t('Searching…', 'Recherche…')}</p>}
              {!searching && handleQuery.trim().length >= 2 && results.length === 0 && (
                <p className="friends-muted">{t('No profile found for', 'Aucun profil trouvé pour')} "{handleQuery}".</p>
              )}
              {results.map(p => (
                <div className="friends-result-row" key={p.userId}>
                  <span className="friends-avatar" style={{ background: p.avatarBg, color: p.avatarFg }}>
                    {p.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="friends-result-meta">
                    <strong>{p.displayName}</strong>
                    <small>@{p.handle}</small>
                  </div>
                  <button
                    className="add-submit friends-action-btn"
                    disabled={sentTo.has(p.userId) || pendingActions.has(`user:${p.userId}`)}
                    onClick={() => sendHandle(p)}
                  >
                    {sentTo.has(p.userId)
                      ? t('Sent ✓', 'Envoyé ✓')
                      : pendingActions.has(`user:${p.userId}`) ? t('Sending…', 'Envoi…') : t('Add', 'Demander')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'email' && (
          <div className="friends-tab-pane">
            <label>
              {t("Friend's email", "Email de l'ami")}
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="friend@email.com"
                autoFocus
              />
            </label>
            <p className="friends-muted">
              {t('Generate a link for this person, then send it from your messaging app.', 'Génère un lien pour cette personne, puis envoie-le depuis ton app de messagerie.')}
            </p>
            <button className="add-submit friends-primary-action" onClick={sendEmail} disabled={emailBusy}>
              {emailBusy ? t('Creating…', 'Création…') : t('Create link', 'Créer le lien')}
            </button>
            {emailInviteLink && (
              <div className="friends-share-box">
                <input readOnly value={emailInviteLink} onClick={e => (e.target as HTMLInputElement).select()} />
                <button className="friends-secondary-action" onClick={copyEmailLink}>
                  {linkCopied ? t('Copied', 'Copié') : t('Copy', 'Copier')}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'link' && (
          <div className="friends-tab-pane">
            <p className="friends-muted">
              {t('Share this link with anyone; whoever signs in with it will become your friend.', 'Partage ce lien à qui tu veux ; toute personne qui se connecte avec deviendra ami avec toi.')}
            </p>
            {!inviteToken && (
              <button className="add-submit friends-primary-action" onClick={generateInviteLink} disabled={inviteBusy}>
                {inviteBusy ? t('Creating…', 'Création…') : t("Generate my invite link", "Générer mon lien d'invitation")}
              </button>
            )}
            {inviteToken && (
              <>
                <label>
                  {t('Your link', 'Ton lien')}
                  <input readOnly value={shareLink} onClick={e => (e.target as HTMLInputElement).select()} />
                </label>
                <div className="friends-link-actions">
                  <button className="add-submit friends-primary-action" onClick={copyLink}>
                    {linkCopied ? t('Copied ✓', 'Copié ✓') : t('Copy', 'Copier')}
                  </button>
                  <button className="friends-secondary-action" onClick={nativeShare}>
                    {t('Share', 'Partager')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {feedback && (
          <p className={feedback.kind === 'ok' ? 'friends-feedback-ok' : 'friends-feedback-err'}>
            {feedback.msg}
          </p>
        )}
      </aside>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}
