import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Destination, Intent, RoadTripStop, Tier } from './types'
import { useMyDestinations } from './hooks/useMyDestinations'
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
import { destinationNameKey, destinationNameSet } from './utils/destinationIdentity'
import ProfileSetupModal from './components/friends/ProfileSetupModal'
import FriendToast from './components/friends/FriendToast'

// Routes / panels lourds chargés à la demande pour réduire le bundle initial.
// Le fallback est `null` parce que ces écrans apparaissent en réponse à un clic
// utilisateur — un spinner brièvement visible ferait plus de bruit qu'autre chose.
const TierListPage = lazy(() => import('./components/TierListPage'))
const AddDestinationWizard = lazy(() => import('./components/AddDestinationWizard'))
const AddFriendModal = lazy(() => import('./components/friends/AddFriendModal'))
const FriendsManagePanel = lazy(() => import('./components/friends/FriendsManagePanel'))
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { FriendsProvider, useFriends } from './hooks/useFriends'
import { useFriendDestinations } from './hooks/useFriendDestinations'
import { useMyProfile } from './hooks/useMyProfile'
import { FAKE_FRIENDS_MODE, findFakeFriendByHandle, getFakeFriendDestinations } from './hooks/_fakeFriends'

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
const VALID_OSM_TYPES: NonNullable<Destination['osmType']>[] = ['N', 'W', 'R', 'node', 'way', 'relation']
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

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length ? items : undefined
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
    destinationKey: typeof value.destinationKey === 'string' ? value.destinationKey : undefined,
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
    ease: value.ease === undefined || value.ease === null ? undefined : finiteNumber(value.ease, undefined),
    memorability: value.memorability === undefined || value.memorability === null ? undefined : finiteNumber(value.memorability, undefined),
    score: value.score === undefined ? undefined : finiteNumber(value.score, 3),
    notes: value.notes === undefined ? undefined : finiteNumber(value.notes, 1),
    stops: normalizeStops(value.stops),
    extent: extent?.every(Number.isFinite) ? extent : undefined,
    geojson: isRecord(value.geojson) && typeof (value.geojson as { type?: unknown }).type === 'string'
      ? (value.geojson as unknown as GeoJSON.Geometry)
      : undefined,
    state: typeof value.state === 'string' ? value.state : undefined,
    osmValue: typeof value.osmValue === 'string' ? value.osmValue : undefined,
    osmId: value.osmId === undefined ? undefined : finiteNumber(value.osmId, undefined),
    osmType: VALID_OSM_TYPES.includes(value.osmType as NonNullable<Destination['osmType']>)
      ? value.osmType as Destination['osmType']
      : undefined,
    countryCode: typeof value.countryCode === 'string' ? value.countryCode : undefined,
    image: typeof value.image === 'string' ? value.image : undefined,
    imageProvider: ['unsplash', 'pexels', 'wikivoyage', 'wikipedia', 'wikimedia', 'fallback'].includes(value.imageProvider as string)
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
    tripTypes: normalizeStringList(value.tripTypes),
    standout: typeof value.standout === 'string' ? value.standout : undefined,
    standoutTags: normalizeStringList(value.standoutTags),
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
      <FriendsProvider>
        <AppInner />
      </FriendsProvider>
    </AuthProvider>
  )
}

function AppInner() {
  const { user } = useAuth()
  const { incoming, refresh: refreshFriends } = useFriends()
  const { profile, needsSetup, upsert: upsertProfile, checkHandleAvailable } = useMyProfile()
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
      <AppCore pendingFriendCount={pendingFriendCount} profileHandle={profile?.handle ?? null} />
      {needsSetup && (
        <ProfileSetupModal upsert={upsertProfile} checkHandleAvailable={checkHandleAvailable} />
      )}
      {friendToast && (
        <FriendToast message={friendToast} onDismiss={() => setFriendToast(null)} />
      )}
    </>
  )
}

function AppCore({ pendingFriendCount, profileHandle }: { pendingFriendCount: number; profileHandle: string | null }) {
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [friendsManageOpen, setFriendsManageOpen] = useState(false)
  const [viewingFriend, setViewingFriend] = useState<{ userId: string; handle: string; displayName: string } | null>(null)
  const [compareFriend, setCompareFriend] = useState<import('./types').Friendship | null>(null)
  const [myDestinations, setDestinations, { resetAll: resetMyDestinations }] = useMyDestinations(normalizeDestinations)
  // Quand on visite le carnet d'un ami : en mode fake on lit depuis _fakeFriends, sinon
  // on fetch via Supabase (RLS autorise les amis acceptés). Le hook renvoie [] quand
  // friendUserId est null, donc on peut l'appeler systématiquement.
  const friendUserIdProd = !FAKE_FRIENDS_MODE && viewingFriend ? viewingFriend.userId : null
  const { destinations: friendDestsProd } = useFriendDestinations(friendUserIdProd)
  const destinations = useMemo(() => {
    if (!viewingFriend) return myDestinations
    if (FAKE_FRIENDS_MODE) return getFakeFriendDestinations(viewingFriend.userId)
    return friendDestsProd
  }, [viewingFriend, myDestinations, friendDestsProd])

  // Mode "comparer" : on superpose les destinations de l'ami sur ma map.
  // Hook conditionnel safe : useFriendDestinations(null) renvoie [].
  const compareFriendUserIdProd = compareFriend && !FAKE_FRIENDS_MODE ? compareFriend.otherUser : null
  const { destinations: compareFriendDestsProd } = useFriendDestinations(compareFriendUserIdProd)
  const compareFriendDests = useMemo(() => {
    if (!compareFriend) return [] as Destination[]
    if (FAKE_FRIENDS_MODE) return getFakeFriendDestinations(compareFriend.otherUser)
    return compareFriendDestsProd
  }, [compareFriend, compareFriendDestsProd])
  // Noms partagés (insensible casse + accents) — sert au visuel.
  // On y ajoute les deux orthographes (la mienne et celle de l'ami) parce que
  // WorldMap les compare au .name brut de chaque destination.
  const compareSharedNames = useMemo(() => {
    if (!compareFriend) return undefined
    const myNorm = destinationNameSet(myDestinations)
    const set = new Set<string>()
    for (const d of compareFriendDests) {
      const key = destinationNameKey(d)
      if (!myNorm.has(key)) continue
      set.add(key)
      set.add(d.name)
      const mineMatch = myDestinations.find(m => destinationNameKey(m) === key)
      if (mineMatch) set.add(mineMatch.name)
    }
    return set
  }, [compareFriend, compareFriendDests, myDestinations])
  // Compteur "en commun" (uniques, par nom normalisé) pour l'UI.
  const compareCommonCount = useMemo(() => {
    if (!compareFriend) return 0
    const myNorm = destinationNameSet(myDestinations)
    let n = 0
    const seen = new Set<string>()
    for (const d of compareFriendDests) {
      const k = destinationNameKey(d)
      if (myNorm.has(k) && !seen.has(k)) { seen.add(k); n++ }
    }
    return n
  }, [compareFriend, compareFriendDests, myDestinations])

  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [pendingMapFocusName, setPendingMapFocusName] = useState<string | null>(null)
  const [filters, setFilters] = useState<DestinationFilters>(DEFAULT_FILTERS)
  const [sortByScore, setSortByScore] = useState(false)
  const [tierListCollapsed, setTierListCollapsed] = useState(true)
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

  // Auto-sync : si on est connecté et qu'on a un handle Supabase mais pas de
  // publicId local (cas typique après signOut+signIn, où le cache localStorage
  // a été purgé pour éviter la fuite entre comptes), on restaure publicId
  // depuis le profile. Sans ça, les boutons "Partager" produisent un slug
  // 'invite' générique au lieu du vrai pseudo de l'utilisateur.
  useEffect(() => {
    if (profileHandle && !publicId) setPublicId(profileHandle)
  }, [profileHandle, publicId])

  // Lien partagé `?u=handle` → on charge directement le carnet de cet ami.
  // En mode fake, lookup local ; en prod, RPC find_user_by_handle + public_profiles.
  // Strip le query param de l'URL après consommation.
  useEffect(() => {
    const url = new URL(window.location.href)
    const handle = url.searchParams.get('u')
    if (!handle) return
    let cancelled = false
    void (async () => {
      if (FAKE_FRIENDS_MODE) {
        const match = findFakeFriendByHandle(handle)
        if (!cancelled && match) {
          setViewingFriend(match)
          setActiveView('map')
        }
      } else if (supabase) {
        const clean = handle.trim().toLowerCase().replace(/^@/, '')
        const { data: targetId } = await supabase.rpc('find_user_by_handle', { target_handle: clean })
        if (targetId) {
          const { data: profile } = await supabase
            .from('public_profiles')
            .select('handle, display_name')
            .eq('user_id', targetId as string)
            .maybeSingle()
          if (!cancelled && profile) {
            setViewingFriend({
              userId: targetId as string,
              handle: profile.handle,
              displayName: profile.display_name ?? profile.handle,
            })
            setActiveView('map')
          }
        }
      }
      url.searchParams.delete('u')
      window.history.replaceState({}, '', url.toString())
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleDestinations = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const filtered = destinations.filter(destination => {
      if (filters.topTiers && destination.tier !== 'S' && destination.tier !== 'A') return false
      if (filters.under300 && (!destination.personalBudget || destination.personalBudget > 300)) return false
      if (filters.recentOnly && (!destination.tripYear || destination.tripYear < currentYear - 1)) return false
      if (filters.duration === 'short' && (!destination.tripDays || destination.tripDays > 4)) return false
      if (filters.duration === 'long' && (!destination.tripDays || destination.tripDays < 7)) return false
      if (filters.ambiance && destination.standout !== 'Ambiance' && !destination.standoutTags?.some(tag => tag.includes('Ambiance'))) return false
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
    // Feedback visuel IMMÉDIAT : on bascule le label "Partager" → "Lien copie"
    // avant l'appel au clipboard. Si jamais l'API bloque indéfiniment (popup
    // permission non résolue, contexte non sécurisé, etc.) l'utilisateur a
    // quand même un retour, et le presse-papier sera tenté en tâche de fond.
    setShareCopied(true)
    window.setTimeout(() => setShareCopied(false), 1800)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        window.prompt('Lien de partage', url)
      }
    } catch {
      window.prompt('Lien de partage', url)
    }
  }

  const appClass = [
    'travel-app',
    `view-${activeView}`,
    tierListCollapsed ? 'tier-collapsed' : '',
    !(activeView === 'map' && selected) ? 'no-card' : '',
    compareFriend && activeView === 'map' && !viewingFriend ? 'compare-active' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={appClass}>
      <div className="mobile-header">
        <BrandLogo className="mobile-brand-logo" />
        <button
          className={`mobile-header-avatar${accountOpen ? ' is-active' : ''}`}
          onClick={() => setAccountOpen(v => !v)}
          aria-label={accountOpen ? 'Fermer mon compte' : 'Mon compte'}
          aria-expanded={accountOpen}
        >
          {publicId ? publicId.slice(0, 1).toUpperCase() : <Icon name="user" />}
        </button>
      </div>
      <BottomNav
        activeView={activeView}
        pendingFriendCount={pendingFriendCount}
        onViewChange={setActiveView}
        onAddClick={() => setAddingDestination(true)}
        onOpenFriends={() => setFriendsManageOpen(true)}
      />
      <WorldMap
        destinations={visibleDestinations}
        flyTarget={flyTarget}
        selectedName={selected?.name}
        onSelect={selectByName}
        onDeselect={() => setSelectedName(null)}
        onFlyTargetConsumed={() => setFlyTarget(null)}
        friendDestinations={compareFriend ? compareFriendDests : undefined}
        friendInitials={compareFriend ? compareFriend.displayName.slice(0, 1).toUpperCase() : undefined}
        sharedNames={compareFriend ? compareSharedNames : undefined}
        hidden={activeView !== 'map'}
      />
      {/* Barre flottante compare quand on superpose les pins d'un ami */}
      {compareFriend && activeView === 'map' && !viewingFriend && (
        <div className="compare-inline-bar" role="status">
          <div className="compare-inline-legend">
            <span className="compare-inline-item">
              <span className="compare-legend-dot compare-legend-dot--mine" aria-hidden="true" />
              Toi
            </span>
            <span className="compare-inline-item">
              <span
                className="compare-legend-dot compare-legend-dot--theirs"
                aria-hidden="true"
              >
                {compareFriend.displayName.slice(0, 1).toUpperCase()}
              </span>
              {compareFriend.displayName.split(' ')[0]}
            </span>
            <span className="compare-inline-item">
              <span className="compare-legend-dot compare-legend-dot--shared" aria-hidden="true" />
              {compareCommonCount} en commun
            </span>
          </div>
          <button
            type="button"
            className="compare-inline-close"
            onClick={() => setCompareFriend(null)}
            aria-label={`Quitter la comparaison avec ${compareFriend.displayName}`}
          >
            <Icon name="x" /> Quitter la comparaison
          </button>
        </div>
      )}
      {/* Empty state quand on visite le carnet d'un ami qui n'a pas encore
          ajouté de destinations (ami qui débute, ou un seed sans data). */}
      {viewingFriend && activeView === 'map' && destinations.length === 0 && (
        <div className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>@{viewingFriend.handle} n'a pas encore ajouté de destinations.</h3>
            <p>Reviens un peu plus tard, ou retourne à ton carnet.</p>
            <button
              type="button"
              className="friends-action-btn friends-action-secondary"
              onClick={() => { setViewingFriend(null); setSelectedName(null) }}
            >
              ← Mon carnet
            </button>
          </div>
        </div>
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
        accountOpen={accountOpen}
        pendingFriendCount={pendingFriendCount}
        onViewChange={setActiveView}
        onAddClick={() => setAddingDestination(true)}
        onFiltersChange={setFilters}
        onSearch={selectByName}
        destinations={destinations}
        onShare={shareTierList}
        onAccountClick={() => setAccountOpen(value => !value)}
        onOpenFriends={() => setFriendsManageOpen(true)}
        onActivityFlyTo={(lat, lng, name, actor) => {
          if (actor) setViewingFriend(actor)
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
            onViewFriendCarnet={f => {
              setFriendsManageOpen(false)
              setViewingFriend({ userId: f.otherUser, handle: f.handle, displayName: f.displayName })
              setActiveView('map')
              setSelectedName(null)
            }}
            onCompareFriend={f => { setFriendsManageOpen(false); setCompareFriend(f) }}
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
          onCompareFriend={viewingFriend ? undefined : setCompareFriend}
          onMobileToggle={() => setTierListCollapsed(value => !value)}
          onViewTierList={() => setActiveView('tier-list')}
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
          reste accessible via l'onglet "Amis". Le clic sur un ami va direct
          au carnet ami (viewingFriend) plutôt que d'ouvrir un profil modal. */}
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
          onResetCarnet={resetMyDestinations}
          carnetCount={myDestinations.length}
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
  /** Vide toutes les destinations de l'utilisateur (Supabase + cache local). */
  onResetCarnet: () => Promise<{ error?: string }>
  /** Nombre actuel de destinations, pour adapter le message de confirmation. */
  carnetCount: number
}

type AccountMode = 'login' | 'public'

function AccountPanel({ publicId, onPublicIdChange, onClose, onResetCarnet, carnetCount }: AccountPanelProps) {
  const { user, signInWithEmail, signOut } = useAuth()
  const { profile } = useMyProfile()
  const [draftId, setDraftId] = useState(publicId || profile?.handle || '')
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<AccountMode>(user ? 'public' : 'login')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [savedTick, setSavedTick] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  const handleConfirmReset = async () => {
    setResetBusy(true)
    const res = await onResetCarnet()
    setResetBusy(false)
    setConfirmResetOpen(false)
    if (res.error) {
      setFeedback({ kind: 'err', msg: `Échec : ${res.error}` })
    }
  }

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
    setDraftId(normalized)
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

  // Fallback slug 'invite' cohérent avec le bouton "Partager" du header.
  // Comme ça l'utilisateur a toujours un lien à copier, même s'il n'a pas
  // encore défini son pseudo (l'app le lui demandera via ProfileSetupModal).
  const shareLink = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(draftId.trim() || 'invite')}`

  const copyShareLink = async () => {
    // Feedback immédiat (cf. shareTierList ci-dessus pour la même raison).
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 1800)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      } else {
        window.prompt('Lien de partage', shareLink)
      }
    } catch {
      window.prompt('Lien de partage', shareLink)
    }
  }

  return (
    <div className="account-overlay" role="dialog" aria-label="Compte" onClick={onClose}>
      <aside className="account-panel" onClick={event => event.stopPropagation()}>
        <div className="account-panel-head">
          <div className="account-identity">
            <div className="account-avatar">{draftId ? draftId.slice(0, 1).toUpperCase() : '·'}</div>
            <div>
              <h2>Mon compte</h2>
              <p>{user?.email ?? (draftId ? `@${draftId}` : 'Profil local')}</p>
            </div>
          </div>
          <button className="account-close" aria-label="Fermer le compte" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="account-tabs" role="tablist" aria-label="Paramètres du compte">
          <button
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => { setMode('login'); setFeedback(null) }}
          >
            Connexion
          </button>
          <button
            role="tab"
            aria-selected={mode === 'public'}
            className={mode === 'public' ? 'is-active' : ''}
            onClick={() => { setMode('public'); setFeedback(null) }}
          >
            Lien public
          </button>
        </div>

        {mode === 'login' && (
          <div className="account-section">
            {user ? (
              <>
                <p className="account-hint">Connecté en tant que <strong>{user.email}</strong>.</p>
                <button
                  className="account-secondary account-danger"
                  onClick={async () => { await signOut(); onClose() }}
                >
                  Me déconnecter
                </button>
                <button
                  className="account-secondary account-reset"
                  onClick={() => setConfirmResetOpen(true)}
                  disabled={carnetCount === 0}
                  title={carnetCount === 0 ? 'Ton carnet est déjà vide' : undefined}
                >
                  Vider mon carnet{carnetCount > 0 ? ` (${carnetCount})` : ''}
                </button>
              </>
            ) : (
              <>
                <p className="account-hint">
                  Synchronise tes destinations et active les amis avec un lien de connexion par email.
                </p>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="toi@email.com"
                    autoComplete="email"
                    autoFocus
                  />
                </label>
                <button className="add-submit account-primary" onClick={sendMagicLink} disabled={busy}>
                  {busy ? 'Envoi...' : 'Recevoir le lien'}
                </button>
                {feedback && (
                  <p className={feedback.kind === 'ok' ? 'friends-feedback-ok' : 'friends-feedback-err'}>
                    {feedback.msg}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'public' && (
          <div className="account-section">
            <p className="account-hint">
              Ton pseudo sert au lien de partage et permet aux amis de retrouver ton carnet.
            </p>
            <label>
              Pseudo public
              <input
                value={draftId}
                onChange={event => setDraftId(event.target.value)}
                placeholder="ton-pseudo"
              />
            </label>
            {shareLink && (
              <label>
                Lien de partage
                <input readOnly value={shareLink} onClick={e => (e.target as HTMLInputElement).select()} />
              </label>
            )}
            <div className="account-actions">
              <button
                className="add-submit account-primary"
                onClick={saveLocal}
                disabled={!draftId.trim()}
              >
                {savedTick ? 'Enregistré' : 'Enregistrer'}
              </button>
              <button
                className="account-secondary"
                onClick={copyShareLink}
                disabled={!shareLink}
              >
                {linkCopied ? 'Copié' : 'Copier le lien'}
              </button>
            </div>
          </div>
        )}
      </aside>
      {confirmResetOpen && (
        <div
          className="duplicate-modal-backdrop"
          onClick={() => !resetBusy && setConfirmResetOpen(false)}
          role="presentation"
        >
          <div
            className="duplicate-modal account-reset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-reset-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="duplicate-modal-body">
              <p className="duplicate-modal-eyebrow">Action irréversible</p>
              <h2 id="account-reset-title">Vider tout ton carnet ?</h2>
              <p className="duplicate-modal-text">
                Tu vas supprimer <strong>{carnetCount} destination{carnetCount > 1 ? 's' : ''}</strong>{' '}
                de ton carnet, sur Supabase et sur cet appareil. Ton compte, ton pseudo et tes amis
                ne sont pas touchés. Cette action ne peut pas être annulée.
              </p>
              <div className="duplicate-modal-actions">
                <button
                  className="duplicate-modal-secondary"
                  onClick={() => setConfirmResetOpen(false)}
                  disabled={resetBusy}
                >
                  Annuler
                </button>
                <button
                  className="duplicate-modal-primary account-reset-confirm"
                  onClick={handleConfirmReset}
                  disabled={resetBusy}
                >
                  {resetBusy ? 'Suppression…' : 'Oui, vider le carnet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  if (destination.tripTypes?.length) {
    details.push({ icon: 'sliders', label: 'Type', value: destination.tripTypes.join(' · ') })
  }
  const standoutValues = destination.standoutTags?.length ? destination.standoutTags : destination.standout ? [destination.standout] : []
  if (standoutValues.length) {
    details.push({ icon: 'sparkles', label: 'Retenu', value: standoutValues.join(' · ') })
  }

  return { meta, details, hasContext: meta.length > 0 || details.length > 0 }
}

function DestinationCard({ destination, coupDeCoeur, coupDeCoeurCount, onClose, onFocus, onCoupDeCoeur, onEdit, onDelete }: DestinationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const context = getDestinationContext(destination)

  const criteria: Array<[string, number, string]> = [
    ['Gastronomie', destination.food, 'utensils'],
    ['Sorties & Vie nocturne', destination.night, 'martini'],
    ['Culture & Histoire', destination.culture, 'temple'],
    ['Nature & Paysages', destination.nature, 'mountain'],
    ['Rapport qualité/prix', destination.value, 'coins'],
  ]
  if (typeof destination.ease === 'number') {
    criteria.push(['Facilité sur place', destination.ease, 'compass'])
  }
  if (typeof destination.memorability === 'number') {
    criteria.push(['Souvenir laissé', destination.memorability, 'star'])
  }

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

