import { useEffect, useMemo, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from './types'
import { DESTINATIONS } from './data'
import { resolveDestinationImage } from './services/imageSearch'
import WorldMap from './components/WorldMap'
import DestinationSheet from './components/DestinationSheet'
import { BrandLogo } from './components/BrandLogo'
import { Icon } from './components/Icon'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'
import TierListPage from './components/TierListPage'
import AddDestinationWizard from './components/AddDestinationWizard'
import FriendsView from './components/friends/FriendsView'
import FriendProfileSheet from './components/friends/FriendProfileSheet'
import ActivityStrip from './components/friends/ActivityStrip'
import AddFriendModal from './components/friends/AddFriendModal'
import ProfileSetupModal from './components/friends/ProfileSetupModal'
import FriendToast from './components/friends/FriendToast'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { useFriends } from './hooks/useFriends'
import { useMyProfile } from './hooks/useMyProfile'

const STORAGE_KEY = 'outpost-destinations-v2'
const LEGACY_STORAGE_KEY = 'triptier-destinations-v2'
const PUBLIC_ID_KEY = 'outpost-public-id'
const AUTO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
const AUTO_IMAGE_VERSION = 5
type View = 'map' | 'tier-list' | 'explore' | 'friends'

const VALID_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D']
const VALID_INTENTS: Intent[] = ['city-trip', 'tourisme', 'sorties', 'gastro', 'nature', 'travail']
const VALID_KINDS: NonNullable<Destination['kind']>[] = ['place', 'zone', 'stop', 'stage']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeStops(value: unknown): RoadTripStop[] | undefined {
  if (!Array.isArray(value)) return undefined
  const stops = value
    .filter(isRecord)
    .map(stop => ({
      name: typeof stop.name === 'string' ? stop.name.trim() : '',
      lat: finiteNumber(stop.lat, NaN),
      lng: finiteNumber(stop.lng, NaN),
      type: stop.type === 'passage' ? 'passage' as const : stop.type === 'stage' ? 'stage' as const : undefined,
    }))
    .filter(stop => stop.name && Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
  return stops.length ? stops : undefined
}

function normalizeDestination(value: unknown): Destination | null {
  if (!isRecord(value)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const lat = finiteNumber(value.lat, NaN)
  const lng = finiteNumber(value.lng, NaN)
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const country = typeof value.country === 'string' && value.country.trim()
    ? value.country.trim()
    : 'Inconnu'
  const tier = VALID_TIERS.includes(value.tier as Tier) ? value.tier as Tier : undefined
  const kind = VALID_KINDS.includes(value.kind as NonNullable<Destination['kind']>)
    ? value.kind as Destination['kind']
    : 'place'
  const intent = VALID_INTENTS.includes(value.intent as Intent) ? value.intent as Intent : 'tourisme'
  const extent = Array.isArray(value.extent) && value.extent.length === 4
    ? value.extent.map(coord => finiteNumber(coord, NaN)) as [number, number, number, number]
    : undefined

  return {
    ...(value as Destination),
    name,
    country,
    lat,
    lng,
    tier,
    kind,
    intent,
    food: finiteNumber(value.food, 3),
    night: finiteNumber(value.night, 3),
    culture: finiteNumber(value.culture, 3),
    nature: finiteNumber(value.nature, 3),
    value: finiteNumber(value.value, 3),
    score: value.score === undefined ? undefined : finiteNumber(value.score, 3),
    notes: value.notes === undefined ? undefined : finiteNumber(value.notes, 1),
    stops: normalizeStops(value.stops),
    extent: extent?.every(Number.isFinite) ? extent : undefined,
    geojson: isRecord(value.geojson) ? value.geojson : undefined,
    state: typeof value.state === 'string' ? value.state : undefined,
    osmValue: typeof value.osmValue === 'string' ? value.osmValue : undefined,
    image: typeof value.image === 'string' ? value.image : undefined,
    imageProvider: ['pexels', 'wikivoyage', 'wikipedia', 'wikimedia', 'fallback'].includes(value.imageProvider as string)
      ? value.imageProvider as Destination['imageProvider']
      : undefined,
    imageAuthor: typeof value.imageAuthor === 'string' ? value.imageAuthor : undefined,
    imageSourceUrl: typeof value.imageSourceUrl === 'string' ? value.imageSourceUrl : undefined,
    imageQuery: typeof value.imageQuery === 'string' ? value.imageQuery : undefined,
    imageSearchVersion: value.imageSearchVersion === undefined ? undefined : finiteNumber(value.imageSearchVersion, 0),
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    tripName: typeof value.tripName === 'string' ? value.tripName : undefined,
    coupDeCoeur: typeof value.coupDeCoeur === 'boolean' ? value.coupDeCoeur : undefined,
  }
}

function normalizeDestinations(value: unknown): Destination[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map(normalizeDestination).filter((item): item is Destination => item !== null)
  return normalized.length ? normalized : null
}

function loadDestinations(): Destination[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (saved) {
      const normalized = normalizeDestinations(JSON.parse(saved))
      if (normalized) return normalized
    }
  } catch {
    /* ignore */
  }
  return DESTINATIONS
}

function loadPublicId(): string {
  try {
    return localStorage.getItem(PUBLIC_ID_KEY) ?? ''
  } catch {
    return ''
  }
}

function hasWeakAutoImage(destination: Destination) {
  return (destination.imageProvider === 'wikipedia' && destination.imageSearchVersion !== AUTO_IMAGE_VERSION)
    || destination.imageProvider === 'wikimedia'
    || destination.imageProvider === 'fallback'
    || (!destination.imageProvider && destination.image === AUTO_IMAGE_FALLBACK)
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

function AppInner() {
  const { user } = useAuth()
  const { incoming, refresh: refreshFriends } = useFriends()
  const { needsSetup, upsert: upsertProfile, checkHandleAvailable } = useMyProfile()
  const pendingFriendCount = incoming.length
  const [friendToast, setFriendToast] = useState<string | null>(null)

  // Consommer un éventuel ?invite=<token> dès qu'on est connecté.
  // Le RPC retourne le user_id de l'inviteur ; on récupère son profil pour
  // afficher un toast "Tu es maintenant ami avec X".
  useEffect(() => {
    if (!user || !supabase) return
    const url = new URL(window.location.href)
    const token = url.searchParams.get('invite')
    if (!token) return
    const client = supabase
    void (async () => {
      const { data: inviterId } = await client.rpc('consume_invite', { invite_token: token })
      url.searchParams.delete('invite')
      window.history.replaceState({}, '', url.toString())
      if (inviterId) {
        const { data: inviterProfile } = await client
          .from('public_profiles')
          .select('display_name, handle')
          .eq('user_id', inviterId as string)
          .maybeSingle()
        const name = inviterProfile?.display_name ?? inviterProfile?.handle ?? 'ton ami'
        setFriendToast(`Tu es maintenant ami avec ${name}`)
        void refreshFriends()
      }
    })()
  }, [user, refreshFriends])

  return (
    <>
      <AppCore pendingFriendCount={pendingFriendCount} />
      {needsSetup && (
        <ProfileSetupModal upsert={upsertProfile} checkHandleAvailable={checkHandleAvailable} />
      )}
      {friendToast && (
        <FriendToast message={friendToast} onDismiss={() => setFriendToast(null)} />
      )}
    </>
  )
}

function AppCore({ pendingFriendCount }: { pendingFriendCount: number }) {
  const [profileFriendUserId, setProfileFriendUserId] = useState<string | null>(null)
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [destinations, setDestinations] = useState<Destination[]>(loadDestinations)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>('Kyoto')
  const [filterTop, setFilterTop] = useState(false)
  const [sortByScore, setSortByScore] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [tierListCollapsed, setTierListCollapsed] = useState(false)
  const [addingDestination, setAddingDestination] = useState(false)
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null)
  const [activeView, setActiveView] = useState<View>('map')
  const [accountOpen, setAccountOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [publicId, setPublicId] = useState<string>(loadPublicId)

  useEffect(() => {
    try {
      if (publicId) localStorage.setItem(PUBLIC_ID_KEY, publicId)
      else localStorage.removeItem(PUBLIC_ID_KEY)
    } catch {
      /* ignore */
    }
  }, [publicId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
    } catch {
      /* ignore */
    }
  }, [destinations])

  useEffect(() => {
    const refreshTargets = destinations.filter(hasWeakAutoImage)
    if (!refreshTargets.length) return

    let cancelled = false
    Promise.all(refreshTargets.map(async destination => {
      const imageResult = await resolveDestinationImage({
        name: destination.name,
        country: destination.country,
        kind: destination.kind,
        stops: destination.stops,
        fallbackImage: destination.image ?? AUTO_IMAGE_FALLBACK,
      })

      if (imageResult.imageProvider === 'fallback' || imageResult.imageProvider === 'wikimedia') return null
      return { name: destination.name, imageResult }
    })).then(results => {
      if (cancelled) return
      const upgrades = results.filter((result): result is NonNullable<typeof result> => result !== null)
      if (!upgrades.length) return
      setDestinations(previous => previous.map(destination => {
        const upgrade = upgrades.find(item => item.name === destination.name)
        return upgrade
          ? {
              ...destination,
              image: upgrade.imageResult.image,
              imageProvider: upgrade.imageResult.imageProvider,
              imageAuthor: upgrade.imageResult.imageAuthor,
              imageSourceUrl: upgrade.imageResult.imageSourceUrl,
              imageQuery: upgrade.imageResult.imageQuery,
              imageSearchVersion: AUTO_IMAGE_VERSION,
            }
          : destination
      }))
    }).catch(() => {
      /* keep the current stored images */
    })

    return () => {
      cancelled = true
    }
  }, [destinations])

  const visibleDestinations = useMemo(() => {
    const filtered = filterTop
      ? destinations.filter(destination => destination.tier === 'S' || destination.tier === 'A')
      : destinations

    return [...filtered].sort((a, b) => {
      if (sortByScore) return (b.score ?? 0) - (a.score ?? 0)
      return a.name.localeCompare(b.name)
    })
  }, [destinations, filterTop, sortByScore])

  const selected = useMemo(
    () => destinations.find(destination => destination.name === selectedName) ?? null,
    [destinations, selectedName],
  )

  const selectByName = (name: string) => {
    const destination = destinations.find(item => item.name === name)
    if (!destination) return
    setSelectedName(destination.name)
    setFlyTarget({ lat: destination.lat, lng: destination.lng, name: destination.name })
  }

  const focusSelected = () => {
    if (!selected) return
    setFlyTarget({ lat: selected.lat, lng: selected.lng, name: selected.name })
  }

  const coupDeCoeurCount = useMemo(
    () => destinations.filter(d => d.coupDeCoeur).length,
    [destinations],
  )

  const toggleCoupDeCoeur = (name: string) => {
    setDestinations(previous => previous.map(d => {
      if (d.name !== name) return d
      if (d.coupDeCoeur) return { ...d, coupDeCoeur: false }
      if (previous.filter(x => x.coupDeCoeur).length >= 2) return d
      return { ...d, coupDeCoeur: true }
    }))
  }

  const removeDestination = (name: string) => {
    setDestinations(previous => previous.filter(item => item.name !== name))
    if (selectedName === name) setSelectedName(null)
  }

  const updateDestination = (updated: Destination) => {
    setDestinations(previous => previous.map(item => item.name === updated.name ? updated : item))
    setEditingDestination(null)
  }

  const addDestination = (destination: Destination) => {
    setDestinations(previous => {
      const exists = previous.some(item => item.name.toLowerCase() === destination.name.toLowerCase())
      return exists ? previous : [...previous, destination]
    })
    setSelectedName(destination.name)
    setFlyTarget({ lat: destination.lat, lng: destination.lng, name: destination.name })
    setAddingDestination(false)
    setActiveView('map')
  }

  const shareTierList = async () => {
    const slug = publicId.trim() || 'invite'
    const url = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(slug)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Lien de partage', url)
    }
    setShareCopied(true)
    window.setTimeout(() => setShareCopied(false), 1800)
  }

  const appClass = [
    'travel-app',
    tierListCollapsed ? 'tier-collapsed' : '',
    !(activeView === 'map' && selected) ? 'no-card' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={appClass}>
      <div className="mobile-brand" aria-hidden="true">
        <BrandLogo className="mobile-brand-logo" />
      </div>
      {activeView === 'map' && (
        <WorldMap
          destinations={visibleDestinations}
          flyTarget={flyTarget}
          selectedName={selected?.name}
          onSelect={selectByName}
          onFlyTargetConsumed={() => setFlyTarget(null)}
        />
      )}
      {activeView === 'tier-list' && (
        <TierListPage destinations={destinations} />
      )}
      {activeView === 'explore' && (
        <ExploreView
          destinations={destinations}
          onSelect={name => {
            setActiveView('map')
            selectByName(name)
          }}
        />
      )}
      {activeView === 'friends' && (
        <FriendsView
          onOpenProfile={setProfileFriendUserId}
          onFlyTo={(lat, lng, name) => {
            setActiveView('map')
            setFlyTarget({ lat, lng, name })
            setSelectedName(name)
          }}
        />
      )}
      <Nav
        totalDestinations={visibleDestinations.length}
        activeView={activeView}
        filterTop={filterTop}
        sortByScore={sortByScore}
        shareCopied={shareCopied}
        publicId={publicId}
        pendingFriendCount={pendingFriendCount}
        onViewChange={setActiveView}
        onAddClick={() => setAddingDestination(true)}
        onFilterToggle={() => setFilterTop(value => !value)}
        onSortToggle={() => setSortByScore(value => !value)}
        onSearch={selectByName}
        destinations={destinations}
        onShare={shareTierList}
        onAccountClick={() => setAccountOpen(true)}
      />
      {activeView === 'map' && selected && (
        <DestinationSheet
          destination={selected}
          coupDeCoeur={selected.coupDeCoeur ?? false}
          coupDeCoeurCount={coupDeCoeurCount}
          onClose={() => setSelectedName(null)}
          onFocus={focusSelected}
          onCoupDeCoeur={() => toggleCoupDeCoeur(selected.name)}
          onEdit={dest => setEditingDestination(dest)}
          onDelete={name => removeDestination(name)}
        />
      )}
      {activeView === 'map' && (
        <TierListPanel
          destinations={visibleDestinations}
          manageMode={manageMode}
          collapsed={tierListCollapsed}
          coupDeCoeurCount={coupDeCoeurCount}
          onManageToggle={() => setManageMode(value => !value)}
          onCollapseToggle={() => setTierListCollapsed(value => !value)}
          onCoupDeCoeurToggle={toggleCoupDeCoeur}
          onFlyTo={selectByName}
          onDelete={removeDestination}
        />
      )}
      {addingDestination && (
        <AddDestinationWizard
          onClose={() => setAddingDestination(false)}
          onAdd={addDestination}
        />
      )}
      {editingDestination && (
        <AddDestinationWizard
          onClose={() => setEditingDestination(null)}
          onAdd={addDestination}
          initialDestination={editingDestination}
          onUpdate={updateDestination}
        />
      )}
      {/* Le panneau "Amis" flottant sur la map a été retiré : il chevauchait
          la destination card et le tier board. L'accès aux amis se fait via
          le bouton "Amis" de la sidebar et l'ActivityStrip ci-dessous reste
          contextuel (caché tant qu'il n'y a pas d'activité). */}
      {activeView === 'map' && (
        <ActivityStrip
          variant="compact"
          onFlyTo={(lat, lng, name) => {
            setFlyTarget({ lat, lng, name })
            setSelectedName(name)
          }}
          onOpenProfile={setProfileFriendUserId}
          onSeeAll={() => setActiveView('friends')}
        />
      )}
      {profileFriendUserId && (
        <FriendProfileSheet
          friendUserId={profileFriendUserId}
          myDestinations={destinations}
          onClose={() => setProfileFriendUserId(null)}
          onFlyTo={(lat, lng, name) => {
            setProfileFriendUserId(null)
            setActiveView('map')
            setFlyTarget({ lat, lng, name })
            setSelectedName(name)
          }}
        />
      )}
      {addFriendOpen && (
        <AddFriendModal onClose={() => setAddFriendOpen(false)} />
      )}
      {accountOpen && (
        <AccountPanel
          publicId={publicId}
          onPublicIdChange={setPublicId}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </div>
  )
}

function ExploreView({ destinations, onSelect }: { destinations: Destination[]; onSelect: (name: string) => void }) {
  const topTiers = destinations.filter(destination => destination.tier === 'S' || destination.tier === 'A')
  const suggestionSeeds = [
    {
      name: 'Seoul',
      reason: 'Tu notes haut les villes culture, food et energie nocturne.',
      image: 'https://images.unsplash.com/photo-1538485399081-7c8ed6f92825?auto=format&fit=crop&w=900&q=85',
    },
    {
      name: 'Porto',
      reason: 'Proche de Lisbonne dans ton classement, plus doux et tres bon rapport qualite/prix.',
      image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=900&q=85',
    },
    {
      name: 'Osaka',
      reason: 'Si Kyoto est S tier, Osaka peut completer la carte cote gastronomie.',
      image: 'https://images.unsplash.com/photo-1590253230532-a67f6bc61c9e?auto=format&fit=crop&w=900&q=85',
    },
  ]

  return (
    <main className="explore-page" aria-label="Explorer des suggestions">
      <section className="ai-panel">
        <span className="ai-chip">IA bientot connectee</span>
        <h2>Suggestions basees sur ton classement</h2>
        <p>
          Pour le moment, ce module est un placeholder. Il simulera ensuite des recommandations en regardant tes tiers,
          tes notes par critere et les destinations que tes amis ajoutent.
        </p>
        <div className="ai-context">
          <strong>{topTiers.length}</strong>
          <span>destinations fortes detectees dans ta tier list</span>
        </div>
      </section>

      <section className="suggestion-grid">
        {suggestionSeeds.map(suggestion => (
          <article className="suggestion-card" key={suggestion.name}>
            <div style={{ backgroundImage: `url(${suggestion.image})` }} />
            <h3>{suggestion.name}</h3>
            <p>{suggestion.reason}</p>
            <button onClick={() => onSelect('Kyoto')}>Voir un exemple sur la carte</button>
          </article>
        ))}
      </section>
    </main>
  )
}

interface AccountPanelProps {
  publicId: string
  onPublicIdChange: (value: string) => void
  onClose: () => void
}

function AccountPanel({ publicId, onPublicIdChange, onClose }: AccountPanelProps) {
  const { user, signInWithEmail, signOut } = useAuth()
  const { profile } = useMyProfile()
  const [draftId, setDraftId] = useState(publicId || profile?.handle || '')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  // Synchronise le draftId avec le handle Supabase une fois qu'il est chargé
  useEffect(() => {
    if (profile?.handle && !publicId) {
      setDraftId(profile.handle)
      onPublicIdChange(profile.handle)
    }
  }, [profile, publicId, onPublicIdChange])

  const saveLocal = () => {
    const normalized = draftId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    onPublicIdChange(normalized)
    setSavedTick(true)
    window.setTimeout(() => setSavedTick(false), 1800)
  }

  const sendMagicLink = async () => {
    const cleaned = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setFeedback({ kind: 'err', msg: 'Email invalide' })
      return
    }
    setBusy(true)
    const res = await signInWithEmail(cleaned)
    setBusy(false)
    setFeedback(res.error ? { kind: 'err', msg: res.error } : { kind: 'ok', msg: 'Lien envoyé. Ouvre ton email pour te connecter.' })
  }

  const shareLink = draftId.trim()
    ? `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(draftId.trim())}`
    : ''

  return (
    <div className="account-overlay" role="dialog" aria-label="Compte" onClick={onClose}>
      <aside className="account-panel" onClick={event => event.stopPropagation()}>
        <button className="floating-close" aria-label="Fermer le compte" onClick={onClose}>
          <Icon name="x" />
        </button>
        <div className="account-avatar">{draftId ? draftId.slice(0, 1).toUpperCase() : '·'}</div>
        <h2>Mon compte</h2>

        {user ? (
          <>
            <p className="account-hint">Connecté en tant que <strong>{user.email}</strong></p>
            <button
              className="add-submit"
              onClick={async () => { await signOut(); onClose() }}
              style={{ background: 'transparent', color: '#b91c1c', border: '0.5px solid rgba(220,38,38,0.3)' }}
            >
              Me déconnecter
            </button>
          </>
        ) : (
          <>
            <p className="account-hint">
              Connecte-toi par email pour synchroniser tes destinations dans le cloud
              et activer le système d'amis.
            </p>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="toi@email.com"
                autoComplete="email"
              />
            </label>
            <button className="add-submit" onClick={sendMagicLink} disabled={busy}>
              {busy ? 'Envoi…' : 'Recevoir un lien magique'}
            </button>
            {feedback && (
              <p className={feedback.kind === 'ok' ? 'friends-feedback-ok' : 'friends-feedback-err'}>
                {feedback.msg}
              </p>
            )}
          </>
        )}

        <hr style={{ border: 'none', borderTop: '0.5px solid rgba(0,0,0,0.08)', margin: '20px 0' }} />

        <label>
          Identifiant public (lien de partage)
          <input
            value={draftId}
            onChange={event => setDraftId(event.target.value)}
            placeholder="ton-pseudo"
          />
        </label>
        {shareLink && (
          <label>
            Ton lien de partage
            <input readOnly value={shareLink} onClick={e => (e.target as HTMLInputElement).select()} />
          </label>
        )}
        <button
          className="add-submit"
          onClick={saveLocal}
          style={{ marginTop: 8, background: savedTick ? '#3B6D11' : undefined }}
        >
          {savedTick ? 'Enregistré ✓' : "Enregistrer l'identifiant"}
        </button>
      </aside>
    </div>
  )
}


