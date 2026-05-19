import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from './types'
import { useDestinationsStore } from './hooks/useDestinationsStore'
import WorldMap from './components/WorldMap'
import DestinationSheet from './components/DestinationSheet'
import BottomNav from './components/BottomNav'
import { BrandLogo } from './components/BrandLogo'
import { Icon } from './components/Icon'
import Nav from './components/Nav'
import TierListPanel from './components/TierListPanel'
import type { SaveOptions } from './components/AddDestinationWizard'
import DuplicateFoundModal from './components/DuplicateFoundModal'
import { findDuplicate } from './utils/duplicates'
import ProfileSetupModal from './components/friends/ProfileSetupModal'
import FriendToast from './components/friends/FriendToast'

// Routes / panels lourds chargés à la demande pour réduire le bundle initial.
// Le fallback est `null` parce que ces écrans apparaissent en réponse à un clic
// utilisateur — un spinner brièvement visible ferait plus de bruit qu'autre chose.
const TierListPage = lazy(() => import('./components/TierListPage'))
const AddDestinationWizard = lazy(() => import('./components/AddDestinationWizard'))
const FriendProfileSheet = lazy(() => import('./components/friends/FriendProfileSheet'))
const AddFriendModal = lazy(() => import('./components/friends/AddFriendModal'))
const FriendsManagePanel = lazy(() => import('./components/friends/FriendsManagePanel'))
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { useFriends } from './hooks/useFriends'
import { useMyProfile } from './hooks/useMyProfile'
import { getFakeFriendDestinations } from './hooks/_fakeFriends'

const PUBLIC_ID_KEY = 'outpost-public-id'
type View = 'map' | 'tier-list' | 'explore' | 'friends'
export type DestinationFilters = {
  topTiers: boolean
  under300: boolean
  recentOnly: boolean
  duration: 'all' | 'short' | 'long'
  ambiance: boolean
}

const VALID_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D']
const VALID_INTENTS: Intent[] = ['city-trip', 'tourisme', 'sorties', 'gastro', 'nature', 'travail']
const VALID_KINDS: NonNullable<Destination['kind']>[] = ['place', 'zone', 'stop', 'stage']
const VALID_COMPANIONS: NonNullable<Destination['companions']>[] = ['solo', 'couple', 'amis', 'famille', 'travail']
const DEFAULT_FILTERS: DestinationFilters = {
  topTiers: false,
  under300: false,
  recentOnly: false,
  duration: 'all',
  ambiance: false,
}

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

  // Construction explicite : on ne fait PAS de spread du record d'entrée pour
  // éviter de propager des champs inconnus (sécurité de typage + invariants types).
  return {
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
    geojson: isRecord(value.geojson) && typeof (value.geojson as { type?: unknown }).type === 'string'
      ? (value.geojson as unknown as GeoJSON.Geometry)
      : undefined,
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
    tripYear: value.tripYear === undefined ? undefined : finiteNumber(value.tripYear, undefined),
    tripDays: value.tripDays === undefined ? undefined : finiteNumber(value.tripDays, undefined),
    companions: VALID_COMPANIONS.includes(value.companions as NonNullable<Destination['companions']>)
      ? value.companions as Destination['companions']
      : undefined,
    personalBudget: value.personalBudget === undefined ? undefined : finiteNumber(value.personalBudget, undefined),
    standout: typeof value.standout === 'string' ? value.standout : undefined,
    coupDeCoeur: typeof value.coupDeCoeur === 'boolean' ? value.coupDeCoeur : undefined,
  }
}

function normalizeDestinations(value: unknown): Destination[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map(normalizeDestination).filter((item): item is Destination => item !== null)
  return normalized.length ? normalized : null
}

function loadPublicId(): string {
  try {
    return localStorage.getItem(PUBLIC_ID_KEY) ?? ''
  } catch {
    return ''
  }
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
  const [friendsManageOpen, setFriendsManageOpen] = useState(false)
  const [viewingFriend, setViewingFriend] = useState<{ userId: string; handle: string; displayName: string } | null>(null)
  const [myDestinations, setDestinations] = useDestinationsStore(normalizeDestinations)
  const destinations = useMemo(
    () => viewingFriend ? getFakeFriendDestinations(viewingFriend.userId) : myDestinations,
    [viewingFriend, myDestinations],
  )
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>('Kyoto')
  const [pendingMapFocusName, setPendingMapFocusName] = useState<string | null>(null)
  const [filters, setFilters] = useState<DestinationFilters>(DEFAULT_FILTERS)
  const [sortByScore, setSortByScore] = useState(false)
  const [tierListCollapsed, setTierListCollapsed] = useState(false)
  const [addingDestination, setAddingDestination] = useState(false)
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null)
  const [duplicateConflict, setDuplicateConflict] = useState<{ existing: Destination; incoming: Destination } | null>(null)
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

  const visibleDestinations = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const filtered = destinations.filter(destination => {
      if (filters.topTiers && destination.tier !== 'S' && destination.tier !== 'A') return false
      if (filters.under300 && (!destination.personalBudget || destination.personalBudget > 300)) return false
      if (filters.recentOnly && (!destination.tripYear || destination.tripYear < currentYear - 1)) return false
      if (filters.duration === 'short' && (!destination.tripDays || destination.tripDays > 4)) return false
      if (filters.duration === 'long' && (!destination.tripDays || destination.tripDays < 7)) return false
      if (filters.ambiance && destination.standout !== 'Ambiance') return false
      return true
    })

    return [...filtered].sort((a, b) => {
      if (sortByScore) return (b.score ?? 0) - (a.score ?? 0)
      return a.name.localeCompare(b.name)
    })
  }, [destinations, filters, sortByScore])

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

  const openDestinationOnMap = (name: string) => {
    const destination = destinations.find(item => item.name === name)
    if (!destination) return
    setSelectedName(destination.name)
    setPendingMapFocusName(destination.name)
    setActiveView('map')
  }

  useEffect(() => {
    if (activeView !== 'map' || !pendingMapFocusName) return
    const destination = destinations.find(item => item.name === pendingMapFocusName)
    if (!destination) {
      setPendingMapFocusName(null)
      return
    }
    setFlyTarget({ lat: destination.lat, lng: destination.lng, name: destination.name })
    setPendingMapFocusName(null)
  }, [activeView, destinations, pendingMapFocusName])

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

  const updateDestination = (updated: Destination, options?: SaveOptions) => {
    const originalName = editingDestination?.name ?? updated.name
    const merged = editingDestination
      ? { ...updated }
      : updated

    setDestinations(previous => previous.map(item => {
      if (options?.replaceCoupDeCoeurName && item.name === options.replaceCoupDeCoeurName) {
        return { ...item, coupDeCoeur: false }
      }
      return item.name === originalName ? merged : item
    }))
    setSelectedName(merged.name)
    setFlyTarget({ lat: merged.lat, lng: merged.lng, name: merged.name })
    setEditingDestination(null)
  }

  const addDestination = (destination: Destination, options?: SaveOptions) => {
    const dup = findDuplicate(destination, destinations)
    if (dup) {
      setDuplicateConflict({ existing: dup, incoming: destination })
      setAddingDestination(false)
      return
    }
    setDestinations(previous => [
      ...previous.map(item => (
        options?.replaceCoupDeCoeurName && item.name === options.replaceCoupDeCoeurName
          ? { ...item, coupDeCoeur: false }
          : item
      )),
      destination,
    ])
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
    `view-${activeView}`,
    tierListCollapsed ? 'tier-collapsed' : '',
    !(activeView === 'map' && selected) ? 'no-card' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={appClass}>
      <div className="mobile-brand" aria-hidden="true">
        <BrandLogo className="mobile-brand-logo" />
      </div>
      <BottomNav
        activeView={activeView}
        pendingFriendCount={pendingFriendCount}
        onViewChange={setActiveView}
        onAddClick={() => setAddingDestination(true)}
        onOpenFriends={() => setFriendsManageOpen(true)}
      />
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
        <Suspense fallback={null}>
          <TierListPage
            destinations={destinations}
            onSelect={openDestinationOnMap}
          />
        </Suspense>
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
      <Nav
        totalDestinations={visibleDestinations.length}
        activeView={activeView}
        filters={filters}
        shareCopied={shareCopied}
        publicId={publicId}
        pendingFriendCount={pendingFriendCount}
        onViewChange={setActiveView}
        onAddClick={() => setAddingDestination(true)}
        onFiltersChange={setFilters}
        onSearch={selectByName}
        destinations={destinations}
        onShare={shareTierList}
        onAccountClick={() => setAccountOpen(true)}
        onOpenFriends={() => setFriendsManageOpen(true)}
        onActivityFlyTo={(lat, lng, name) => {
          setActiveView('map')
          setFlyTarget({ lat, lng, name })
        }}
        viewingFriend={viewingFriend}
        onBackToMyCarnet={() => { setViewingFriend(null); setSelectedName(null) }}
      />
      {friendsManageOpen && (
        <Suspense fallback={null}>
          <FriendsManagePanel
            onClose={() => setFriendsManageOpen(false)}
            onOpenAddFriend={() => { setFriendsManageOpen(false); setAddFriendOpen(true) }}
            onOpenProfile={(userId: string) => { setFriendsManageOpen(false); setProfileFriendUserId(userId) }}
            onViewFriendCarnet={f => {
              setFriendsManageOpen(false)
              setViewingFriend({ userId: f.otherUser, handle: f.handle, displayName: f.displayName })
              setActiveView('map')
              setSelectedName(null)
            }}
          />
        </Suspense>
      )}
      {activeView === 'map' && selected && (
        <DestinationSheet
          destination={selected}
          coupDeCoeur={selected.coupDeCoeur ?? false}
          coupDeCoeurCount={coupDeCoeurCount}
          allDestinations={destinations}
          onClose={() => setSelectedName(null)}
          onFocus={focusSelected}
          onCoupDeCoeur={() => toggleCoupDeCoeur(selected.name)}
          onEdit={dest => setEditingDestination(dest)}
          onDelete={name => removeDestination(name)}
          onOpenTrip={selectByName}
        />
      )}
      {activeView === 'map' && (
        <TierListPanel
          destinations={visibleDestinations}
          collapsed={tierListCollapsed}
          coupDeCoeurCount={coupDeCoeurCount}
          onCollapseToggle={() => setTierListCollapsed(value => !value)}
          onFlyTo={selectByName}
        />
      )}
      {addingDestination && (
        <Suspense fallback={null}>
          <AddDestinationWizard
            onClose={() => setAddingDestination(false)}
            onAdd={addDestination}
            existingDestinations={destinations}
            coupDeCoeurDestinations={destinations.filter(destination => destination.coupDeCoeur)}
            onDuplicateFound={(existing, incomingName) => {
              setAddingDestination(false)
              setDuplicateConflict({
                existing,
                incoming: { ...existing, name: incomingName },
              })
            }}
          />
        </Suspense>
      )}
      {editingDestination && (
        <Suspense fallback={null}>
          <AddDestinationWizard
            onClose={() => setEditingDestination(null)}
            onAdd={addDestination}
            initialDestination={editingDestination}
            onUpdate={updateDestination}
            existingDestinations={destinations}
            coupDeCoeurDestinations={destinations.filter(destination => destination.coupDeCoeur)}
          />
        </Suspense>
      )}
      {duplicateConflict && (
        <DuplicateFoundModal
          existing={duplicateConflict.existing}
          incoming={duplicateConflict.incoming}
          onCancel={() => setDuplicateConflict(null)}
          onMerge={() => {
            setEditingDestination(duplicateConflict.existing)
            setDuplicateConflict(null)
          }}
        />
      )}
      {/* Activité récente : autrefois en bandeau fixe en bas de la map, ce qui
          chevauchait la tier list. L'aperçu vit désormais dans la sidebar
          (composant <SidebarActivity /> dans Nav.tsx) et la liste complète
          reste accessible via l'onglet "Amis". */}
      {profileFriendUserId && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      {addFriendOpen && (
        <Suspense fallback={null}>
          <AddFriendModal onClose={() => setAddFriendOpen(false)} />
        </Suspense>
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


interface DestinationCardProps {
  destination: Destination
  coupDeCoeur: boolean
  coupDeCoeurCount: number
  onClose: () => void
  onFocus: () => void
  onCoupDeCoeur: () => void
  onEdit: (destination: Destination) => void
  onDelete: (name: string) => void
}

const COMPANION_LABELS: Record<NonNullable<Destination['companions']>, string> = {
  solo: 'Solo',
  couple: 'Couple',
  amis: 'Amis',
  famille: 'Famille',
  travail: 'Travail',
}

function formatEuro(value: number) {
  return `${Math.round(value).toLocaleString('fr-FR')} €`
}

function getDestinationContext(destination: Destination) {
  const meta: Array<{ icon: string; label: string }> = []
  const details: Array<{ icon: string; label: string; value: string }> = []

  if (destination.tripYear) {
    meta.push({ icon: 'calendar', label: String(destination.tripYear) })
  }
  if (destination.tripDays) {
    meta.push({ icon: 'clock', label: `${destination.tripDays} jour${destination.tripDays > 1 ? 's' : ''}` })
  }
  if (destination.companions) {
    details.push({ icon: 'users', label: 'Avec', value: COMPANION_LABELS[destination.companions] })
  }
  if (destination.personalBudget) {
    const perDay = destination.tripDays ? destination.personalBudget / destination.tripDays : destination.personalBudget
    meta.push({
      icon: 'coins',
      label: destination.tripDays ? `~${formatEuro(perDay)}/jour` : `~${formatEuro(destination.personalBudget)}`,
    })
  }
  if (destination.standout) {
    details.push({ icon: 'sparkles', label: 'Marquant', value: destination.standout })
  }

  return { meta, details, hasContext: meta.length > 0 || details.length > 0 }
}

function DestinationCard({ destination, coupDeCoeur, coupDeCoeurCount, onClose, onFocus, onCoupDeCoeur, onEdit, onDelete }: DestinationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const context = getDestinationContext(destination)

  const criteria = [
    ['Gastronomie', destination.food, 'utensils'],
    ['Sorties & Vie nocturne', destination.night, 'martini'],
    ['Culture & Histoire', destination.culture, 'temple'],
    ['Nature & Paysages', destination.nature, 'mountain'],
    ['Rapport qualite/prix', destination.value, 'coins'],
  ] as const

  const coupDeCoeurDisabled = !coupDeCoeur && coupDeCoeurCount >= 2

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }

  return (
    <aside className="destination-card" aria-label={`Detail de ${destination.name}`}>
      <button className="floating-close" aria-label="Fermer le detail" onClick={onClose}>
        <Icon name="x" />
      </button>
      <div className="floating-kebab-wrap">
        <button
          className={`card-kebab${menuOpen ? ' is-open' : ''}`}
          aria-label="Options"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(v => !v); setConfirmDelete(false) }}
        >
          <Icon name="more-vertical" />
        </button>
        {menuOpen && !confirmDelete && (
          <div className="card-kebab-menu">
            <button onClick={() => { closeMenu(); onEdit(destination) }}>
              <Icon name="edit" />
              Modifier
            </button>
            <button className="danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" />
              Supprimer
            </button>
          </div>
        )}
        {menuOpen && confirmDelete && (
          <div className="card-kebab-menu card-delete-confirm">
            <p>Supprimer <strong>{destination.name}</strong> ?</p>
            <div className="confirm-actions">
              <button onClick={closeMenu}>Annuler</button>
              <button className="danger" onClick={() => onDelete(destination.name)}>Confirmer</button>
            </div>
          </div>
        )}
      </div>
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      >
        {destination.intent && (
          <span className="intent-pill destination-hero-pill">{destination.intent}</span>
        )}
      </div>
      <div className="destination-title-row">
        {destination.tier && <span className={`tier-orb tier-${destination.tier.toLowerCase()}`}>{destination.tier}</span>}
        <div>
          <h2>{destination.name}, {destination.country}</h2>
          <div className="destination-pill-row">
            <button
              className={`coup-de-coeur-button${coupDeCoeur ? ' is-active' : ''}`}
              aria-label={coupDeCoeur ? 'Retirer le coup de coeur' : coupDeCoeurDisabled ? 'Limite atteinte (2/2)' : `Coup de coeur · ${coupDeCoeurCount}/2 utilise`}
              title={coupDeCoeur ? 'Coup de coeur · retirer' : coupDeCoeurDisabled ? '2 coups de coeur deja utilises' : `Coup de coeur · ${coupDeCoeurCount}/2 utilise`}
              disabled={coupDeCoeurDisabled}
              onClick={onCoupDeCoeur}
            >
              <Icon name="heart" />
              Coup de coeur
            </button>
          </div>
        </div>
        {/*
          className={`coup-de-coeur-button${coupDeCoeur ? ' is-active' : ''}`}
          aria-label={coupDeCoeur ? 'Retirer le coup de cœur' : coupDeCoeurDisabled ? 'Limite atteinte (2/2)' : `Coup de cœur · ${coupDeCoeurCount}/2 utilisé`}
          title={coupDeCoeur ? 'Coup de cœur · retirer' : coupDeCoeurDisabled ? '2 coups de cœur déjà utilisés' : `Coup de cœur · ${coupDeCoeurCount}/2 utilisé`}
          disabled={coupDeCoeurDisabled}
          onClick={onCoupDeCoeur}
        >
          <Icon name="heart" />
        */}
      </div>
      {context.hasContext && (
        <div className="destination-context" aria-label="Contexte du voyage">
          {context.meta.length > 0 && (
            <div className="destination-context-meta">
              {context.meta.map(item => (
                <span key={`${item.icon}-${item.label}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
          {context.details.length > 0 && (
            <div className="destination-context-details">
              {context.details.map(item => (
                <div key={`${item.icon}-${item.label}`}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <h3>Notes par critere</h3>
      <div className="criteria-list">
        {criteria.map(([label, value, icon]) => (
          <div className="criterion" key={label}>
            <Icon name={icon} />
            <span>{label}</span>
            <strong>{Number(value).toFixed(1).replace('.', ',')}</strong>
          </div>
        ))}
      </div>
      <button className="map-button" onClick={onFocus}>
        <Icon name="map" />
        Voir sur la carte
      </button>
    </aside>
  )
}

