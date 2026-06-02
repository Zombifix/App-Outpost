import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Destination, Intent, MapVisibility, RoadTripStop, Tier } from './types'
import type { ContinentBucket, TravelerProfile } from './utils'
import { useMyDestinations } from './hooks/useMyDestinations'
import { useFocusTrap } from './hooks/useFocusTrap'
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
import { computeTravelerProfile, getDestinationScore, getDestinationTier, getMaxCoupDeCoeur, withRecalculatedScore } from './utils'
import ProfileSetupModal from './components/friends/ProfileSetupModal'
import FriendToast from './components/friends/FriendToast'
import { Avatar } from './components/Avatar'
import { SegmentedControl } from './components/SegmentedControl'

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
import { useMediaQuery } from './hooks/useMediaQuery'

const PUBLIC_ID_KEY = 'outpost-public-id'
type View = 'map' | 'tier-list' | 'explore' | 'friends'
export type DestinationFilters = {
  coupDeCoeur: boolean
  thisYear: boolean
  companions: 'all' | 'solo' | 'amis' | 'famille'
  budget: 'all' | '$' | '$$' | '$$$'
}

const VALID_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D']
const VALID_INTENTS: Intent[] = ['city-trip', 'tourisme', 'sorties', 'gastro', 'nature', 'travail']
const VALID_KINDS: NonNullable<Destination['kind']>[] = ['place', 'zone', 'stop', 'stage']
const VALID_COMPANIONS: NonNullable<Destination['companions']>[] = ['solo', 'couple', 'amis', 'famille', 'travail']
const VALID_OSM_TYPES: NonNullable<Destination['osmType']>[] = ['N', 'W', 'R', 'node', 'way', 'relation']
const DEFAULT_FILTERS: DestinationFilters = {
  coupDeCoeur: false,
  thisYear: false,
  companions: 'all',
  budget: 'all',
}

type DesktopLegendMode = 'stacked-left' | 'bottom-left' | 'overlay-bottom'
type DesktopTierMode = 'stacked-left' | 'bottom-left' | 'overlay-bottom'
type DesktopControlsMode = 'bottom-left' | 'overlay-bottom'

type DesktopDockState = {
  controlsBottom: number
  controlsLeft: number
  controlsMode: DesktopControlsMode
  leftDockWidth: number
  leftDockX: number
  legendBottom: number
  legendHeight: number
  legendMode: DesktopLegendMode
  sidebarBottom: number
  stackBottom: number
  stackGap: number
  stackTop: number
  tierHeight: number
  tierMode: DesktopTierMode
  tierPanelWidth: number
  tierStackTop: number
}

const DESKTOP_DOCK_DEFAULT: DesktopDockState = {
  controlsBottom: 0,
  controlsLeft: 0,
  controlsMode: 'overlay-bottom',
  leftDockWidth: 0,
  leftDockX: 16,
  legendBottom: 0,
  legendHeight: 0,
  legendMode: 'overlay-bottom',
  sidebarBottom: 0,
  stackBottom: 0,
  stackGap: 24,
  stackTop: 0,
  tierHeight: 72,
  tierMode: 'overlay-bottom',
  tierPanelWidth: 0,
  tierStackTop: 0,
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
    food: value.food === undefined || value.food === null ? undefined : finiteNumber(value.food, undefined),
    night: value.night === undefined || value.night === null ? undefined : finiteNumber(value.night, undefined),
    culture: value.culture === undefined || value.culture === null ? undefined : finiteNumber(value.culture, undefined),
    nature: value.nature === undefined || value.nature === null ? undefined : finiteNumber(value.nature, undefined),
    value: value.value === undefined || value.value === null ? undefined : finiteNumber(value.value, undefined),
    ease: value.ease === undefined || value.ease === null ? undefined : finiteNumber(value.ease, undefined),
    memorability: value.memorability === undefined || value.memorability === null ? undefined : finiteNumber(value.memorability, undefined),
    vibeBoost: value.vibeBoost === undefined || value.vibeBoost === null ? undefined : finiteNumber(value.vibeBoost, undefined),
    retourBonus: value.retourBonus === undefined || value.retourBonus === null ? undefined : finiteNumber(value.retourBonus, undefined),
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

function getMapPrivacyMessage(reason: 'private' | 'friends_only' | null, handle?: string | null) {
  const owner = handle ? `@${handle}` : 'Cette carte'
  if (reason === 'friends_only') {
    return {
      title: `${owner} est visible uniquement par ses amis.`,
      body: 'Ajoute cette personne en ami pour voir sa carte, ou retourne à ton carnet.',
    }
  }
  return {
    title: 'Cette carte est privée.',
    body: 'Seul son propriétaire peut la consulter pour le moment.',
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
  const { profile, needsSetup, upsert: upsertProfile, updateMapVisibility, checkHandleAvailable } = useMyProfile()
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
      const { data: inviterId, error } = await client.rpc('consume_invite', { invite_token: token })
      url.searchParams.delete('invite')
      window.history.replaceState({}, '', url.toString())
      if (error) {
        setFriendToast(`Invitation impossible : ${error.message}`)
        return
      }
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
      <AppCore
        pendingFriendCount={pendingFriendCount}
        profileHandle={profile?.handle ?? null}
        profileMapVisibility={profile?.mapVisibility ?? 'friends'}
        profileAvatarUrl={profile?.avatarUrl ?? null}
        profileAvatarBg={profile?.avatarBg ?? '#e5e5e5'}
        profileAvatarFg={profile?.avatarFg ?? '#1a1a1a'}
        onMapVisibilityChange={updateMapVisibility}
      />
      {needsSetup && (
        <ProfileSetupModal upsert={upsertProfile} checkHandleAvailable={checkHandleAvailable} />
      )}
      {friendToast && (
        <FriendToast message={friendToast} onDismiss={() => setFriendToast(null)} />
      )}
    </>
  )
}

function MobileAvatarImg({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback.slice(0, 1).toUpperCase()}</>
  return <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setFailed(true)} />
}

function AppCore({
  pendingFriendCount,
  profileHandle,
  profileMapVisibility,
  profileAvatarUrl,
  profileAvatarBg,
  profileAvatarFg,
  onMapVisibilityChange,
}: {
  pendingFriendCount: number
  profileHandle: string | null
  profileMapVisibility: MapVisibility
  profileAvatarUrl: string | null
  profileAvatarBg: string
  profileAvatarFg: string
  onMapVisibilityChange: (value: MapVisibility) => Promise<{ ok: boolean; error?: string }>
}) {
  const { user } = useAuth()
  const { friendships, sendRequestByUserId, acceptRequest } = useFriends()
  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [friendsManageOpen, setFriendsManageOpen] = useState(false)
  const [viewingFriend, setViewingFriend] = useState<{ userId: string; handle: string; displayName: string } | null>(null)
  const [compareFriend, setCompareFriend] = useState<import('./types').Friendship | null>(null)
  const [targetedCompare, setTargetedCompare] = useState<{ friendUserId: string; destinationKey: string } | null>(null)
  const [myDestinations, setDestinations, { resetAll: resetMyDestinations, error: myDestinationsError }] = useMyDestinations(normalizeDestinations)
  // Quand on visite le carnet d'un ami : en mode fake on lit depuis _fakeFriends, sinon
  // on fetch via Supabase (RLS autorise les amis acceptés). Le hook renvoie [] quand
  // friendUserId est null, donc on peut l'appeler systématiquement.
  const friendUserIdProd = !FAKE_FRIENDS_MODE && viewingFriend ? viewingFriend.userId : null
  const { destinations: friendDestsProd, access: viewedFriendAccess } = useFriendDestinations(friendUserIdProd)
  const destinations = useMemo(() => {
    if (!viewingFriend) return myDestinations
    if (FAKE_FRIENDS_MODE) return getFakeFriendDestinations(viewingFriend.userId).map(withRecalculatedScore)
    return friendDestsProd
  }, [viewingFriend, myDestinations, friendDestsProd])

  // Mode "comparer" : on superpose les destinations de l'ami sur ma map.
  // Hook conditionnel safe : useFriendDestinations(null) renvoie [].
  const compareFriendUserIdProd = compareFriend && !FAKE_FRIENDS_MODE ? compareFriend.otherUser : null
  const { destinations: compareFriendDestsProd, access: compareFriendAccess } = useFriendDestinations(compareFriendUserIdProd)
  const compareFriendDests = useMemo(() => {
    if (!compareFriend) return [] as Destination[]
    if (FAKE_FRIENDS_MODE) return getFakeFriendDestinations(compareFriend.otherUser).map(withRecalculatedScore)
    return compareFriendDestsProd
  }, [compareFriend, compareFriendDestsProd])
  const targetedCompareFriend = useMemo(
    () => targetedCompare ? (friendships.find(item => item.otherUser === targetedCompare.friendUserId && item.status === 'accepted') ?? null) : null,
    [friendships, targetedCompare]
  )
  const targetedCompareFriendUserIdProd = targetedCompareFriend && !FAKE_FRIENDS_MODE ? targetedCompareFriend.otherUser : null
  const { destinations: targetedCompareFriendDestsProd, access: targetedCompareFriendAccess } = useFriendDestinations(targetedCompareFriendUserIdProd)
  const targetedCompareFriendDests = useMemo(() => {
    if (!targetedCompareFriend) return [] as Destination[]
    if (compareFriend?.otherUser === targetedCompareFriend.otherUser) return compareFriendDests
    if (FAKE_FRIENDS_MODE) return getFakeFriendDestinations(targetedCompareFriend.otherUser).map(withRecalculatedScore)
    return targetedCompareFriendDestsProd
  }, [targetedCompareFriend, compareFriend, compareFriendDests, targetedCompareFriendDestsProd])
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
  const viewingFriendDenied = Boolean(viewingFriend && !FAKE_FRIENDS_MODE && !viewedFriendAccess.allowed && viewedFriendAccess.deniedReason)
  const compareFriendDenied = Boolean(compareFriend && !FAKE_FRIENDS_MODE && !compareFriendAccess.allowed && compareFriendAccess.deniedReason)
  const targetedCompareDenied = Boolean(targetedCompareFriend && !FAKE_FRIENDS_MODE && !targetedCompareFriendAccess.allowed && targetedCompareFriendAccess.deniedReason)

  const friendshipWithViewed = useMemo(
    () => viewingFriend ? (friendships.find(f => f.otherUser === viewingFriend.userId) ?? null) : null,
    [friendships, viewingFriend]
  )

  const [addFriendFeedback, setAddFriendFeedback] = useState<'idle' | 'sent' | 'accepted'>('idle')

  useEffect(() => { setAddFriendFeedback('idle') }, [viewingFriend?.userId])

  const handleAddViewingFriend = useCallback(async () => {
    if (!viewingFriend) return
    const existing = friendships.find(f => f.otherUser === viewingFriend.userId)
    if (existing?.status === 'pending' && existing.initiator === 'them') {
      await acceptRequest(existing.otherUser)
      setAddFriendFeedback('accepted')
    } else {
      await sendRequestByUserId(viewingFriend.userId)
      setAddFriendFeedback('sent')
    }
  }, [viewingFriend, friendships, sendRequestByUserId, acceptRequest])

  const handleCompareViewingFriend = useCallback(() => {
    if (!viewingFriend) return
    const f = friendships.find(fr => fr.otherUser === viewingFriend.userId)
    if (f) {
      setTargetedCompare(null)
      setCompareFriend(f)
      setViewingFriend(null)
    }
  }, [viewingFriend, friendships])
  const handleTargetedCompareFriend = useCallback((friendUserId: string, destination: Destination) => {
    const friend = friendships.find(item => item.otherUser === friendUserId && item.status === 'accepted')
    if (!friend) return
    setViewingFriend(null)
    setCompareFriend(null)
    setTargetedCompare({
      friendUserId,
      destinationKey: destinationNameKey(destination),
    })
  }, [friendships])

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
  const [mapDetail, setMapDetail] = useState<'simple' | 'detailed'>(() =>
    (localStorage.getItem('outpost-map-detail') as 'simple' | 'detailed' | null) ?? 'simple'
  )
  const isMobileLayout = useMediaQuery('(max-width: 900px)')
  const [desktopDock, setDesktopDock] = useState<DesktopDockState>(DESKTOP_DOCK_DEFAULT)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!user && url.searchParams.has('invite')) {
      setAccountOpen(true)
    }
  }, [user])

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

  useEffect(() => {
    if (isMobileLayout || activeView !== 'map') {
      setDesktopDock(prev => (
        JSON.stringify(prev) === JSON.stringify(DESKTOP_DOCK_DEFAULT)
          ? prev
          : DESKTOP_DOCK_DEFAULT
      ))
      return
    }

    let frame = 0
    const hasCompareBar = Boolean(compareFriend && !compareFriendDenied && !viewingFriend)

    const measureDocking = () => {
      const visibleRect = (selector: string) => {
        const element = document.querySelector(selector)
        if (!(element instanceof HTMLElement)) return null
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null
        const rect = element.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return rect
      }

      const sidebar = document.querySelector('.sidebar')
      if (!(sidebar instanceof HTMLElement)) return

      const sidebarRect = sidebar.getBoundingClientRect()
      const destinationCardRect = visibleRect('.destination-card')
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const outerMargin = 16
      const rightMargin = 20
      const stackGap = 24
      const bottomMargin = 16
      const controlsBaseOffset = 14
      const controlsGap = 16
      const controlsHeight = 172
      const tierHeight = tierListCollapsed ? 86 : 310
      const legendHeight = hasCompareBar ? 235 : 215
      const leftDockX = Math.round(sidebarRect.left)
      const leftLimit = destinationCardRect ? destinationCardRect.left - rightMargin : viewportWidth - rightMargin
      const availableWidth = Math.max(260, Math.round(leftLimit - leftDockX))
      // Colonne gauche (légende + barre repliée) = largeur exacte de la nav island.
      const leftDockWidth = Math.min(Math.round(sidebarRect.width), availableWidth)
      // Panneau tier déplié = plus large pour afficher les colonnes S/A/B/C/D.
      const tierPanelWidth = Math.max(leftDockWidth, Math.min(700, availableWidth))
      const stackTop = Math.round(sidebarRect.bottom + stackGap)
      const tierTopIfBottomLeft = Math.round(viewportHeight - bottomMargin - tierHeight)
      const stackedLegendBottom = Math.round(stackTop + legendHeight)
      const legendCanStayStacked = stackedLegendBottom + stackGap <= tierTopIfBottomLeft
      const tierFitsUnderLegend = stackTop + legendHeight + stackGap + tierHeight + bottomMargin <= viewportHeight
      const tierMode: DesktopTierMode = tierFitsUnderLegend ? 'stacked-left' : 'bottom-left'
      const legendMode: DesktopLegendMode = legendCanStayStacked && tierMode === 'stacked-left'
        ? 'stacked-left'
        : 'bottom-left'
      const tierStackTop = tierMode === 'stacked-left'
        ? Math.round(stackTop + legendHeight + stackGap)
        : 0
      const legendBottom = tierMode === 'bottom-left'
        ? Math.round(tierHeight + bottomMargin + stackGap)
        : bottomMargin
      const controlsTopUnderTier = tierMode === 'stacked-left'
        ? tierStackTop + tierHeight + 58
        : viewportHeight - bottomMargin - controlsGap - controlsHeight
      const controlsBottom = Math.max(
        bottomMargin,
        Math.round(viewportHeight - controlsTopUnderTier - controlsHeight),
      )
      const controlsWidth = 44
      const controlsLeft = Math.round(Math.min(
        leftDockX + 16,
        leftLimit - controlsWidth,
      ))
      const stackBottom = tierMode === 'stacked-left'
        ? Math.round(tierStackTop + tierHeight)
        : legendMode === 'stacked-left'
          ? Math.round(stackTop + legendHeight)
          : 0

      setDesktopDock(prev => {
        const next: DesktopDockState = {
          controlsBottom,
          controlsLeft,
          controlsMode: 'bottom-left',
          leftDockWidth,
          leftDockX,
          legendBottom,
          legendHeight,
          legendMode,
          sidebarBottom: Math.round(sidebarRect.bottom),
          stackBottom,
          stackGap,
          stackTop,
          tierHeight,
          tierMode,
          tierPanelWidth,
          tierStackTop,
        }
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
    }

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measureDocking)
    }

    scheduleMeasure()
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [
    activeView,
    compareFriend,
    compareFriendDenied,
    isMobileLayout,
    selectedName,
    tierListCollapsed,
    viewingFriend,
  ])

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
      if (filters.coupDeCoeur && !destination.coupDeCoeur) return false
      if (filters.thisYear && destination.tripYear !== currentYear) return false
      if (filters.companions !== 'all') {
        const c = destination.companions
        if (filters.companions === 'amis' && c !== 'amis' && c !== 'couple') return false
        if (filters.companions !== 'amis' && c !== filters.companions) return false
      }
      if (filters.budget !== 'all') {
        const b = destination.personalBudget
        if (filters.budget === '$' && (b === undefined || b >= 300)) return false
        if (filters.budget === '$$' && (b === undefined || b < 300 || b > 800)) return false
        if (filters.budget === '$$$' && (b === undefined || b <= 800)) return false
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      if (sortByScore) return getDestinationScore(b) - getDestinationScore(a)
      return a.name.localeCompare(b.name)
    })
  }, [destinations, filters, sortByScore])

  const selected = useMemo(
    () => destinations.find(destination => destination.name === selectedName) ?? null,
    [destinations, selectedName],
  )

  const selectedCompareDestination = useMemo(() => {
    if (!selected || !compareFriend) return null
    return compareFriendDests.find(destination => destinationNameKey(destination) === destinationNameKey(selected)) ?? null
  }, [selected, compareFriend, compareFriendDests])
  const selectedTargetedCompareDestination = useMemo(() => {
    if (!selected || !targetedCompareFriend || !targetedCompare) return null
    if (destinationNameKey(selected) !== targetedCompare.destinationKey) return null
    return targetedCompareFriendDests.find(destination => destinationNameKey(destination) === targetedCompare.destinationKey) ?? null
  }, [selected, targetedCompareFriend, targetedCompare, targetedCompareFriendDests])
  const activeSheetCompare = useMemo(() => {
    if (targetedCompareFriend && selectedTargetedCompareDestination) {
      return {
        mode: 'targeted' as const,
        friend: targetedCompareFriend,
        destination: selectedTargetedCompareDestination,
      }
    }
    if (compareFriend && selectedCompareDestination) {
      return {
        mode: 'global' as const,
        friend: compareFriend,
        destination: selectedCompareDestination,
      }
    }
    return null
  }, [targetedCompareFriend, selectedTargetedCompareDestination, compareFriend, selectedCompareDestination])

  useEffect(() => {
    if (!targetedCompare) return
    if (!selected || destinationNameKey(selected) !== targetedCompare.destinationKey) {
      setTargetedCompare(null)
    }
  }, [selected, targetedCompare])

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
      if (d.coupDeCoeur) return withRecalculatedScore({ ...d, coupDeCoeur: false })
      if (previous.filter(x => x.coupDeCoeur).length >= getMaxCoupDeCoeur(previous.length)) return d
      return withRecalculatedScore({ ...d, coupDeCoeur: true })
    }))
  }

  const removeDestination = (name: string) => {
    setDestinations(previous => previous.filter(item => item.name !== name))
    if (selectedName === name) setSelectedName(null)
  }

  const updateDestination = (updated: Destination, options?: SaveOptions) => {
    const originalName = editingDestination?.name ?? updated.name
    const merged = withRecalculatedScore(updated)

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
    const normalizedDestination = withRecalculatedScore(destination)
    const dup = findDuplicate(normalizedDestination, destinations)
    if (dup) {
      setDuplicateConflict({ existing: dup, incoming: normalizedDestination })
      setAddingDestination(false)
      return
    }
    setDestinations(previous => [
      ...previous.map(item => (
        options?.replaceCoupDeCoeurName && item.name === options.replaceCoupDeCoeurName
          ? { ...item, coupDeCoeur: false }
          : item
      )),
      normalizedDestination,
    ])
    setSelectedName(normalizedDestination.name)
    setFlyTarget({ lat: normalizedDestination.lat, lng: normalizedDestination.lng, name: normalizedDestination.name })
    setAddingDestination(false)
    setActiveView('map')
  }

  const shareTierList = async () => {
    if (!publicId.trim()) return
    const slug = publicId.trim()
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
        throw new Error('Clipboard API unavailable')
      }
    } catch {
      // Fallback discret : on garde le toast "Lien copié" mais on log le lien
      // pour permettre une copie manuelle via les devtools si besoin.
      console.warn('[share] clipboard unavailable, link:', url)
    }
  }

  const appClass = [
    'travel-app',
    `view-${activeView}`,
    tierListCollapsed ? 'tier-collapsed' : '',
    !(activeView === 'map' && selected) ? 'no-card' : '',
    compareFriend && !compareFriendDenied && activeView === 'map' && !viewingFriend ? 'compare-active' : '',
    selectedCompareDestination && !compareFriendDenied && activeView === 'map' ? 'destination-compare-open' : '',
    activeView === 'map' && !isMobileLayout ? `desktop-legend-${desktopDock.legendMode}` : '',
    activeView === 'map' && !isMobileLayout ? `desktop-tier-${desktopDock.tierMode}` : '',
    activeView === 'map' && !isMobileLayout ? `desktop-controls-${desktopDock.controlsMode}` : '',
  ].filter(Boolean).join(' ')

  const appStyle = useMemo(() => (
    {
      '--desktop-controls-bottom': `${desktopDock.controlsBottom}px`,
      '--desktop-controls-left': `${desktopDock.controlsLeft}px`,
      '--desktop-left-dock-w': `${desktopDock.leftDockWidth}px`,
      '--desktop-left-dock-x': `${desktopDock.leftDockX}px`,
      '--desktop-left-stack-bottom': `${desktopDock.stackBottom}px`,
      '--desktop-left-stack-gap': `${desktopDock.stackGap}px`,
      '--desktop-left-stack-top': `${desktopDock.stackTop}px`,
      '--desktop-sidebar-bottom': `${desktopDock.sidebarBottom}px`,
      '--desktop-legend-bottom': `${desktopDock.legendBottom}px`,
      '--desktop-legend-height': `${desktopDock.legendHeight}px`,
      '--desktop-tier-height': `${desktopDock.tierHeight}px`,
      '--desktop-tier-panel-w': `${desktopDock.tierPanelWidth}px`,
      '--desktop-tier-stack-top': `${desktopDock.tierStackTop}px`,
    } as CSSProperties
  ), [desktopDock])

  return (
    <div className={appClass} style={appStyle}>
      {myDestinationsError && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#fff1f0',
            color: '#8a1a1a',
            border: '1px solid #f3c2c2',
            borderRadius: 10,
            padding: '8px 14px',
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            maxWidth: 'min(92vw, 480px)',
          }}
        >
          Sync failed: {myDestinationsError}. Your changes are saved locally.
        </div>
      )}
      <div className="mobile-header">
        <BrandLogo className="mobile-brand-logo" />
        <button
          className={`mobile-header-avatar${accountOpen ? ' is-active' : ''}`}
          onClick={() => setAccountOpen(v => !v)}
          aria-label={accountOpen ? 'Close account' : 'My account'}
          aria-expanded={accountOpen}
        >
          {profileAvatarUrl
            ? <MobileAvatarImg src={profileAvatarUrl} fallback={publicId || '·'} />
            : publicId ? publicId.slice(0, 1).toUpperCase() : <Icon name="user" />
          }
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
        friendDestinations={compareFriend && !compareFriendDenied ? compareFriendDests : undefined}
        friendInitials={compareFriend && !compareFriendDenied ? (compareFriend.displayName || '?').slice(0, 1).toUpperCase() : undefined}
        friendAvatarUrl={compareFriend && !compareFriendDenied ? (compareFriend.avatarUrl ?? null) : null}
        sharedNames={compareFriend && !compareFriendDenied ? compareSharedNames : undefined}
        controlsMode={desktopDock.controlsMode}
        legendMode={desktopDock.legendMode}
        hidden={activeView !== 'map'}
        mapDetail={mapDetail}
      />
      {/* Barre flottante compare quand on superpose les pins d'un ami */}
      {compareFriend && !compareFriendDenied && activeView === 'map' && !viewingFriend && (
        <div
          className={[
            'compare-inline-bar',
            !isMobileLayout && desktopDock.legendMode === 'stacked-left' ? 'compare-inline-bar--stacked-left' : '',
            !isMobileLayout && desktopDock.legendMode === 'bottom-left' ? 'compare-inline-bar--bottom-left' : '',
          ].filter(Boolean).join(' ')}
          role="status"
        >
          <div className="compare-inline-legend">
            <span className="compare-inline-item">
              <span className="compare-legend-dot compare-legend-dot--mine" aria-hidden="true" />
              Toi
            </span>
            <span className="compare-inline-item">
              <Avatar
                className="compare-legend-dot compare-legend-dot--theirs"
                avatarUrl={compareFriend.avatarUrl}
                initials={compareFriend.displayName.slice(0, 1)}
                bg={compareFriend.avatarBg}
                fg={compareFriend.avatarFg}
                ariaHidden={true}
              />
              {compareFriend.displayName.split(' ')[0]}
            </span>
            <span className="compare-inline-item">
              <span className="compare-legend-dot compare-legend-dot--shared" aria-hidden="true" />
              {compareCommonCount} en commun
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-pill btn-sm compare-inline-close"
            onClick={() => setCompareFriend(null)}
            aria-label={`Quitter la comparaison avec ${compareFriend.displayName}`}
          >
            <Icon name="x" /> Quitter la comparaison
          </button>
        </div>
      )}
      {/* Empty state quand on visite le carnet d'un ami qui n'a pas encore
          ajouté de destinations (ami qui débute, ou un seed sans data). */}
      {viewingFriendDenied && activeView === 'map' && (
        <div className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>{getMapPrivacyMessage(viewedFriendAccess.deniedReason, viewingFriend?.handle).title}</h3>
            <p>{getMapPrivacyMessage(viewedFriendAccess.deniedReason, viewingFriend?.handle).body}</p>
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
      {viewingFriend && activeView === 'map' && !viewingFriendDenied && destinations.length === 0 && (
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
      {!viewingFriend && activeView === 'map' && myDestinations.length === 0 && (
        <div className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>Ton carnet est vide</h3>
            <p>Ajoute ta première destination pour la voir apparaître sur la carte.</p>
            <button
              type="button"
              className="add-submit"
              onClick={() => setAddingDestination(true)}
            >
              + Ajouter ma première destination
            </button>
          </div>
        </div>
      )}
      {!viewingFriend && activeView === 'map' && myDestinations.length > 0 && visibleDestinations.length === 0 && (
        <div className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>Aucun résultat pour ces filtres</h3>
            <p>Modifie ou réinitialise les filtres pour revoir tes destinations.</p>
            <button
              type="button"
              className="friends-action-btn friends-action-secondary"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Réinitialiser les filtres
            </button>
          </div>
        </div>
      )}
      {compareFriendDenied && activeView === 'map' && !viewingFriend && (
        <div className="empty-friend-carnet" role="status">
          <div className="empty-friend-carnet-card">
            <h3>{getMapPrivacyMessage(compareFriendAccess.deniedReason, compareFriend?.handle).title}</h3>
            <p>La comparaison ne peut pas s'afficher tant que cette carte n'est pas visible pour toi.</p>
            <button
              type="button"
              className="friends-action-btn friends-action-secondary"
              onClick={() => setCompareFriend(null)}
            >
              Fermer la comparaison
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
        canShare={!!user && !!publicId}
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
        isAuthenticated={!!user}
        friendshipWithViewed={friendshipWithViewed}
        addFriendFeedback={addFriendFeedback}
        onAddViewingFriend={handleAddViewingFriend}
        onCompareViewingFriend={handleCompareViewingFriend}
      />
      {friendsManageOpen && (
        <Suspense fallback={null}>
          <FriendsManagePanel
            onClose={() => setFriendsManageOpen(false)}
            onOpenAddFriend={() => { setFriendsManageOpen(false); setAddFriendOpen(true) }}
            onViewFriendCarnet={f => {
              setFriendsManageOpen(false)
              setTargetedCompare(null)
              setViewingFriend({ userId: f.otherUser, handle: f.handle, displayName: f.displayName })
              setActiveView('map')
              setSelectedName(null)
            }}
            onCompareFriend={f => {
              setFriendsManageOpen(false)
              setTargetedCompare(null)
              setCompareFriend(f)
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
          compareWith={activeSheetCompare
            ? { friend: activeSheetCompare.friend, destination: activeSheetCompare.destination }
            : undefined}
          compareMode={activeSheetCompare?.mode}
          onClose={() => {
            setSelectedName(null)
            if (targetedCompareDenied) setTargetedCompare(null)
          }}
          onFocus={focusSelected}
          onCompareFriend={friendUserId => handleTargetedCompareFriend(friendUserId, selected)}
          onExitCompare={() => {
            if (activeSheetCompare?.mode === 'targeted') setTargetedCompare(null)
            else setCompareFriend(null)
          }}
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
          dockMode={desktopDock.tierMode}
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
          destinations={myDestinations}
          publicId={publicId}
          mapVisibility={profileMapVisibility}
          mapDetail={mapDetail}
          onPublicIdChange={setPublicId}
          onMapVisibilityChange={onMapVisibilityChange}
          onMapDetailChange={v => { setMapDetail(v); localStorage.setItem('outpost-map-detail', v) }}
          onClose={() => setAccountOpen(false)}
          onResetCarnet={resetMyDestinations}
          carnetCount={myDestinations.length}
        />
      )}
    </div>
  )
}

function ExploreView(_props: { destinations: Destination[]; onSelect: (name: string) => void }) {
  return (
    <main className="explore-page explore-page--soon" aria-label="Explore — coming soon">
      <section className="explore-soon">
        <span className="explore-soon__chip">Coming soon</span>
        <h2 className="explore-soon__title">The explorer is coming soon</h2>
        <p className="explore-soon__text">
          This section will suggest destinations tailored to your journal, your ratings,
          and those of your friends. We're working on it — see you soon.
        </p>
      </section>
    </main>
  )
}

const CONTINENT_DISPLAY: Record<string, string> = {
  Europe: 'Europe',
  Asie: 'Asie',
  Ameriques: 'Amériques',
  Afrique: 'Afrique',
  Oceanie: 'Océanie',
  Autre: 'Autre',
}

function LegacyTravelerProfileCard({ destinations }: { destinations: Destination[] }) {
  const profile = useMemo(() => computeTravelerProfile(destinations), [destinations])
  const { total, confidence, signatures, archetype, continents } = profile
  const visibleContinents = continents.filter(c => c.continent !== 'Autre')

  return (
    <div className="carnet-stats account-profile-card" aria-label="Profil voyageur">
      <span className="carnet-stats-paper-grain" aria-hidden="true" />
      <span className="carnet-stats-stamp" aria-hidden="true" />
      <span className="carnet-stats-eyebrow" aria-hidden="true">Profil voyageur</span>

      <div className="carnet-stats-hero">
        <div className="carnet-stats-hero-stack">
          <span className="carnet-stats-hero-num">{total}</span>
          <span className="carnet-stats-hero-label">destination{total > 1 ? 's' : ''}</span>
        </div>
        {archetype && (
          <span className="carnet-stats-archetype carnet-stats-archetype--clean">{archetype}</span>
        )}
      </div>

      {(total === 0 || confidence === 'light') && (
        <div className="carnet-stats-empty">
          Profil en construction · ajoute des destinations pour révéler ton style
        </div>
      )}

      {signatures.length > 0 && (
        <ul className="carnet-stats-signals">
          {signatures.map(sig => (
            <li key={sig.key} className={`carnet-signal carnet-signal--${sig.key}`}>
              <span className="carnet-signal-icon" aria-hidden="true">{sig.icon}</span>
              <span className="carnet-signal-body">
                <span className="carnet-signal-label">{sig.label}</span>
                {sig.detail && <span className="carnet-signal-detail">{sig.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {visibleContinents.length > 0 && confidence !== 'light' && (
        <div className="carnet-stats-continents-inline">
          {visibleContinents.map((c, i) => (
            <span key={c.continent} className="carnet-cont-item">
              {i > 0 && <span className="carnet-cont-sep" aria-hidden="true">·</span>}
              <span className="carnet-cont-name">{CONTINENT_DISPLAY[c.continent]}</span>
              <span className="carnet-cont-pct">{Math.round(c.pct)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const ACCOUNT_CONTINENT_META: Record<ContinentBucket, { label: string; icon: string; color: string; soft: string }> = {
  Europe: { label: 'Europe', icon: '🍷', color: '#ef7b73', soft: '#fff1f1' },
  Asie: { label: 'Asie', icon: '🏮', color: '#f7bd42', soft: '#fff7dd' },
  Ameriques: { label: 'Amériques', icon: '🌎', color: '#45c489', soft: '#e8fbf2' },
  Afrique: { label: 'Afrique', icon: '🌍', color: '#f0934e', soft: '#fff2e6' },
  Oceanie: { label: 'Océanie', icon: '🌊', color: '#56a8f5', soft: '#eaf5ff' },
  Autre: { label: 'Autre', icon: '🧭', color: '#94a3b8', soft: '#f1f5f9' },
}

type AccountProfileChip = { key: string; label: string }
type AccountProfileTitle = { title: string; subtitle: string | null }
type AccountProfileAchievement = {
  key: string
  icon: string
  title: string
  detail: string
  tone?: 'red' | 'gold' | 'heart' | 'teal' | 'blue'
}

function medianValue(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function buildAccountProfileTitle(profile: TravelerProfile): AccountProfileTitle {
  const text = profile.archetype ?? ''
  const lower = text.toLowerCase()
  let title = 'Profil voyageur'

  if (lower.includes('reconna') || lower.includes('faible') || lower.includes('retourne souvent')) {
    title = 'Habitué fidèle'
  } else if (lower.includes('émotions') || lower.includes('enthousiasme') || lower.includes('objectif')) {
    title = 'Voyageur sélectif'
  } else if (lower.includes('panneaux') || lower.includes('vieilles pierres') || lower.includes('culture')) {
    title = 'Explorateur réfléchi'
  } else if (lower.includes('budget') || lower.includes('addition') || lower.includes('raisonnable')) {
    title = 'Confort mesuré'
  } else if (lower.includes('week-end') || lower.includes('48 h') || lower.includes('pont')) {
    title = 'Nomade précis'
  } else if (lower.includes('nature') || lower.includes('wi-fi') || lower.includes('béton')) {
    title = 'Curieux nature'
  } else if (lower.includes('restos') || lower.includes('repas') || lower.includes('réservation')) {
    title = 'Épicurien organisé'
  } else if (lower.includes('stats') || lower.includes('données') || lower.includes('camp')) {
    title = 'Explorateur ouvert'
  } else if (profile.total > 0) {
    title = 'Voyageur sélectif'
  }

  return {
    title,
    subtitle: text || (profile.total > 0 ? 'Le carnet commence à dessiner ton style.' : null),
  }
}

function buildBehaviorChips(profile: TravelerProfile): AccountProfileChip[] {
  const chips: AccountProfileChip[] = []
  const add = (key: string, label: string) => {
    if (chips.length < 3 && !chips.some(chip => chip.label === label)) chips.push({ key, label })
  }

  for (const sig of profile.signatures) {
    if (sig.key === 'geo') add('faithful', 'Fidèle')
    if (sig.key === 'coeur') add('selective', 'Sélectif')
    if (sig.key === 'notes') add('thoughtful', 'Réfléchi')
    if (sig.key === 'budget') add('comfort', 'Confort')
    if (sig.key === 'format') add('nomad', 'Nomade')
    if (sig.key === 'intent') add('curious', 'Curieux')
  }

  if (profile.coupDeCoeurCount <= Math.max(1, Math.round(profile.travelCount * 0.12))) add('calm', 'Calme')
  if (profile.continents.length >= 3) add('open', 'Ouvert')
  if (profile.total >= 12) add('seasoned', 'Aguerri')
  if (profile.total > 0 && chips.length === 0) add('living', 'Carnet vivant')

  return chips.slice(0, 3)
}

function buildAccountProfileAchievements(destinations: Destination[], profile: TravelerProfile): AccountProfileAchievement[] {
  const travels = destinations.filter(destination => !destination.livedThere)
  const achievements: AccountProfileAchievement[] = []
  const add = (achievement: AccountProfileAchievement) => {
    if (!achievements.some(item => item.key === achievement.key)) achievements.push(achievement)
  }

  const countryCounts = new Map<string, number>()
  travels.forEach(destination => {
    if (destination.country) countryCounts.set(destination.country, (countryCounts.get(destination.country) ?? 0) + 1)
  })
  const topCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topCountry && topCountry[1] >= 2) {
    add({
      key: 'country',
      icon: '📍',
      title: 'Revient sur ses pas',
      detail: `${topCountry[0]} · ${topCountry[1]} voyages`,
      tone: 'red',
    })
  }

  const scores = travels.map(destination => destination.score ?? getDestinationScore(destination)).filter(Number.isFinite)
  const averageScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
  if (averageScore !== null && scores.length >= 3) {
    add({
      key: 'score',
      icon: '⭐',
      title: averageScore >= 3.7 ? 'Note facile' : 'Avis mesuré',
      detail: `moy. ${averageScore.toFixed(1)} / 5`,
      tone: 'gold',
    })
  } else {
    const budgets = travels
      .map(destination => destination.personalBudget && destination.tripDays && destination.tripDays > 0
        ? destination.personalBudget / destination.tripDays
        : null)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const medianBudget = medianValue(budgets)
    if (medianBudget !== null) {
      add({
        key: 'budget',
        icon: '💳',
        title: medianBudget >= 150 ? 'Confort assumé' : 'Budget maîtrisé',
        detail: `${Math.round(medianBudget)} € / jour`,
        tone: 'gold',
      })
    }
  }

  const firstHeart = travels.find(destination => destination.coupDeCoeur)
  if (profile.coupDeCoeurCount > 0) {
    add({
      key: 'heart',
      icon: '💛',
      title: profile.coupDeCoeurCount <= 1 ? 'Coup de cœur rare' : 'Coups de cœur',
      detail: firstHeart?.name ?? `${profile.coupDeCoeurCount} destinations`,
      tone: 'heart',
    })
  }

  const leadContinent = profile.continents.find(continent => continent.continent !== 'Autre') ?? profile.continents[0]
  if (leadContinent) {
    add({
      key: 'continent',
      icon: ACCOUNT_CONTINENT_META[leadContinent.continent].icon,
      title: 'Zone dominante',
      detail: `${ACCOUNT_CONTINENT_META[leadContinent.continent].label} · ${Math.round(leadContinent.pct)}%`,
      tone: 'teal',
    })
  }

  return achievements.slice(0, 4)
}

function TravelerProfileCard({ destinations }: { destinations: Destination[] }) {
  const profile = useMemo(() => computeTravelerProfile(destinations), [destinations])
  const { total, confidence, continents, countries } = profile
  const profileTitle = useMemo(() => buildAccountProfileTitle(profile), [profile])
  const behaviorChips = useMemo(() => buildBehaviorChips(profile), [profile])
  const achievements = useMemo(() => buildAccountProfileAchievements(destinations, profile), [destinations, profile])
  const visibleContinents = continents.filter(continent => continent.continent !== 'Autre')
  const stackSegments = visibleContinents.length > 0 ? visibleContinents : continents

  return (
    <div className="account-profile-card" aria-label="Profil voyageur">
      {(total === 0 || confidence === 'light') && (
        <div className="account-profile-empty">
          <strong>Profil en construction</strong>
          <span>Ajoute des destinations pour révéler ton style.</span>
        </div>
      )}

      {total > 0 && (
        <>
          <section className="account-profile-title-block" aria-label="Archétype voyageur">
            <span className="account-profile-title-icon" aria-hidden="true">✦</span>
            <div>
              <h3>{profileTitle.title}</h3>
              {profileTitle.subtitle && <p>{profileTitle.subtitle}</p>}
              {behaviorChips.length > 0 && (
                <ul className="account-profile-inline-traits" aria-label="Traits du profil voyageur">
                  {behaviorChips.map(chip => <li key={chip.key}>{chip.label}</li>)}
                </ul>
              )}
            </div>
          </section>

          {achievements.length > 0 && (
            <section className="account-profile-achievements" aria-label="Hauts faits voyageur">
              {achievements.map(achievement => (
                <article key={achievement.key} className={`account-profile-tag account-profile-tag--${achievement.tone ?? 'blue'}`}>
                  <span className="account-profile-tag-icon" aria-hidden="true">{achievement.icon}</span>
                  <span className="account-profile-tag-body">
                    <strong>{achievement.title}</strong>
                    <span>{achievement.detail}</span>
                  </span>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {stackSegments.length > 0 && confidence !== 'light' && (
        <section className="account-profile-continents" aria-label="Territoires explorés">
          <div className="account-profile-section-head">
            <h4>Territoires explorés</h4>
            <span>{countries} pays visités</span>
          </div>
          <div className="account-continent-stack" aria-hidden="true">
            {stackSegments.map(continent => (
              <span
                key={continent.continent}
                className="account-continent-stack-segment"
                style={{
                  '--continent-color': ACCOUNT_CONTINENT_META[continent.continent].color,
                  width: `${Math.max(8, Math.round(continent.pct))}%`,
                } as CSSProperties}
              />
            ))}
          </div>
          <div className="account-continent-list">
            {stackSegments.map(continent => {
              const meta = ACCOUNT_CONTINENT_META[continent.continent]
              return (
                <div key={continent.continent} className="account-continent-row">
                  <span
                    className="account-continent-icon"
                    style={{
                      '--continent-color': meta.color,
                      '--continent-soft': meta.soft,
                    } as CSSProperties}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>
                  <strong>{meta.label}</strong>
                  <span className="account-continent-meter" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, Math.round(continent.pct))}%`, background: meta.color }} />
                  </span>
                  <span className="account-continent-pct">{Math.round(continent.pct)}%</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

interface AccountPanelProps {
  destinations: Destination[]
  publicId: string
  mapVisibility: MapVisibility
  mapDetail: 'simple' | 'detailed'
  onPublicIdChange: (value: string) => void
  onMapVisibilityChange: (value: MapVisibility) => Promise<{ ok: boolean; error?: string }>
  onMapDetailChange: (value: 'simple' | 'detailed') => void
  onClose: () => void
  onResetCarnet: () => Promise<{ error?: string }>
  carnetCount: number
}

type AccountMode = 'profile' | 'map' | 'account'
type PasswordAuthMode = 'signin' | 'signup' | 'forgot' | 'forgot-sent'

function AccountPanel({ destinations, publicId, mapVisibility, mapDetail, onPublicIdChange, onMapVisibilityChange, onMapDetailChange, onClose, onResetCarnet, carnetCount }: AccountPanelProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(true)
  const { user, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword, signOut } = useAuth()
  const { profile } = useMyProfile()
  const [draftId, setDraftId] = useState(publicId || profile?.handle || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<AccountMode>('profile')
  const [passwordMode, setPasswordMode] = useState<PasswordAuthMode>('signin')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [savedTick, setSavedTick] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [visibilityDraft, setVisibilityDraft] = useState<MapVisibility>(mapVisibility)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
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

  useEffect(() => {
    setVisibilityDraft(mapVisibility)
  }, [mapVisibility])

  const saveLocal = () => {
    const normalized = draftId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    onPublicIdChange(normalized)
    setDraftId(normalized)
    setSavedTick(true)
    window.setTimeout(() => setSavedTick(false), 1800)
  }

  const submitPasswordAuth = async () => {
    const cleaned = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setFeedback({ kind: 'err', msg: 'Invalid email' })
      return
    }
    if (password.length < 6) {
      setFeedback({ kind: 'err', msg: 'Password too short: use at least 6 characters.' })
      return
    }

    setBusy(true)
    const res: { error?: string; needsConfirmation?: boolean } = passwordMode === 'signin'
      ? await signInWithPassword(cleaned, password)
      : await signUpWithPassword(cleaned, password)
    setBusy(false)
    if (res.error) {
      setFeedback({ kind: 'err', msg: res.error })
      return
    }
    if (res.needsConfirmation) {
      setFeedback({
        kind: 'ok',
        msg: 'Account created. Check your inbox to confirm your email, then sign in.',
      })
      if (import.meta.env.DEV) {
        console.info('[auth] Supabase awaiting email confirmation. Disable "Confirm email" in Supabase to skip SMTP during dev.')
      }
      return
    }
    setFeedback({ kind: 'ok', msg: passwordMode === 'signin'
      ? 'Signed in.'
      : 'Account created. You can use this password to return.' })
  }

  const submitForgotPassword = async () => {
    const cleaned = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setFeedback({ kind: 'err', msg: 'Invalid email' })
      return
    }
    setBusy(true)
    const res = await resetPassword(cleaned)
    setBusy(false)
    if (res.error) {
      setFeedback({ kind: 'err', msg: res.error })
      return
    }
    setPasswordMode('forgot-sent')
    setFeedback(null)
  }

  const connectWithGoogle = async () => {
    setGoogleBusy(true)
    const res = await signInWithGoogle()
    setGoogleBusy(false)
    if (res.error) setFeedback({ kind: 'err', msg: res.error })
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
        throw new Error('Clipboard API unavailable')
      }
    } catch {
      console.warn('[share] clipboard unavailable, link:', shareLink)
    }
  }

  const saveVisibility = async () => {
    setVisibilityBusy(true)
    const result = await onMapVisibilityChange(visibilityDraft)
    setVisibilityBusy(false)
    if (!result.ok) {
      setFeedback({ kind: 'err', msg: result.error ?? 'Could not save visibility.' })
      return
    }
    setFeedback({ kind: 'ok', msg: 'Map visibility updated.' })
  }

  return (
    <div ref={trapRef} className="account-overlay" role="dialog" aria-modal="true" aria-label="Compte" onClick={onClose}>
      <aside className="account-panel" onClick={event => event.stopPropagation()}>
        <div className="account-panel-head">
          <div className="account-identity">
            <Avatar avatarUrl={profile?.avatarUrl} initials={draftId || '·'} bg={profile?.avatarBg ?? '#e5e5e5'} fg={profile?.avatarFg ?? '#1a1a1a'} className="account-avatar" />
            <div>
              <h2>Mon compte</h2>
              <p>{user?.email ?? (draftId ? `@${draftId}` : 'Profil local')}</p>
            </div>
          </div>
          <button className="account-close" aria-label="Fermer le compte" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <SegmentedControl
          className="account-tabs"
          ariaLabel="Parametres du compte"
          role="tablist"
          size="sm"
          layout="fill"
          value={mode}
          options={[
            { value: 'profile', label: 'Profil' },
            { value: 'share', label: 'Partage' },
            { value: 'account', label: 'Compte' },
          ]}
          onChange={nextMode => {
            setMode(nextMode)
            setFeedback(null)
          }}
        />
        {mode === 'profile' && (
          <div className="account-section account-section--profile">
            <TravelerProfileCard destinations={destinations} />
          </div>
        )}

        {mode === 'account' && (
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
                  Synchronise tes destinations et retrouve ta carte sur tous tes appareils.
                </p>
                <button className="account-google" onClick={connectWithGoogle} disabled={googleBusy || busy}>
                  <span aria-hidden="true">G</span>
                  {googleBusy ? 'Connexion...' : 'Continuer avec Google'}
                </button>
                <div className="account-divider"><span>ou</span></div>
                <SegmentedControl
                  className="account-auth-tabs"
                  ariaLabel="Connexion ou inscription"
                  role="tablist"
                  size="sm"
                  layout="fill"
                  value={passwordMode}
                  options={[
                    { value: 'signin', label: 'Connexion' },
                    { value: 'signup', label: 'Inscription' },
                  ]}
                  onChange={nextMode => {
                    setPasswordMode(nextMode)
                    setFeedback(null)
                  }}
                />
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
                <label>
                  Mot de passe
                  <input
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="6 caractères minimum"
                    autoComplete={passwordMode === 'signin' ? 'current-password' : 'new-password'}
                    onKeyDown={event => {
                      if (event.key === 'Enter') void submitPasswordAuth()
                    }}
                  />
                </label>
                <button className="add-submit account-primary" onClick={() => void submitPasswordAuth()} disabled={busy || googleBusy}>
                  {busy ? 'Patiente...' : passwordMode === 'signin' ? 'Se connecter' : 'S’inscrire'}
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

        {mode === 'share' && (
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
            <label>
              Visibilité de la carte
              <select
                value={visibilityDraft}
                onChange={event => setVisibilityDraft(event.target.value as MapVisibility)}
                disabled={visibilityBusy}
              >
                <option value="public">Publique</option>
                <option value="friends">Amis uniquement</option>
                <option value="private">Privée</option>
              </select>
            </label>
            <p className="account-hint">
              Public: toute personne avec le lien peut voir ta carte. Amis uniquement: seulement tes amis. Privée: toi uniquement.
            </p>
            <div className="account-actions">
              <button
                className="add-submit account-primary"
                onClick={saveVisibility}
                disabled={visibilityBusy || visibilityDraft === mapVisibility}
              >
                {visibilityBusy ? 'Enregistrement...' : 'Enregistrer la visibilité'}
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
  totalDestinations: number
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

function DestinationCard({ destination, coupDeCoeur, coupDeCoeurCount, totalDestinations, onClose, onFocus, onCoupDeCoeur, onEdit, onDelete }: DestinationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const context = getDestinationContext(destination)

  const criteria: Array<[string, number, string]> = []
  if (typeof destination.food === 'number') criteria.push(['Gastronomie', destination.food, 'utensils'])
  if (typeof destination.night === 'number') criteria.push(['Sorties & Vie nocturne', destination.night, 'martini'])
  if (typeof destination.culture === 'number') criteria.push(['Culture & Histoire', destination.culture, 'temple'])
  if (typeof destination.nature === 'number') criteria.push(['Nature & Paysages', destination.nature, 'mountain'])
  if (typeof destination.value === 'number') criteria.push(['Rapport qualité/prix', destination.value, 'coins'])
  if (typeof destination.ease === 'number') {
    criteria.push(['Facilité sur place', destination.ease, 'compass'])
  }

  const maxCoupDeCoeur = getMaxCoupDeCoeur(totalDestinations)
  const coupDeCoeurDisabled = !coupDeCoeur && coupDeCoeurCount >= maxCoupDeCoeur
  const tier = getDestinationTier(destination)

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }

  return (
    <aside className="destination-card" aria-label={`Detail de ${destination.name}`}>
      <div
        className="destination-hero"
        style={{ backgroundImage: destination.image ? `url(${destination.image})` : undefined }}
      >
        <div className="destination-card-actions">
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
          <button className="floating-close" aria-label="Fermer le detail" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {destination.intent && (
          <span className="intent-pill destination-hero-pill">{destination.intent}</span>
        )}
      </div>
      <div className="destination-title-row">
        <span className={`tier-orb tier-${tier.toLowerCase()}`}>{tier}</span>
        <div>
          <h2>{destination.name}, {destination.country}</h2>
          <div className="destination-pill-row">
            <button
              className={`coup-de-coeur-button${coupDeCoeur ? ' is-active' : ''}`}
              aria-label={coupDeCoeur ? 'Retirer le coup de coeur' : coupDeCoeurDisabled ? `Limite atteinte (${maxCoupDeCoeur}/${maxCoupDeCoeur})` : `Coup de coeur · ${coupDeCoeurCount}/${maxCoupDeCoeur} utilise`}
              title={coupDeCoeur ? 'Coup de coeur · retirer' : coupDeCoeurDisabled ? `${maxCoupDeCoeur} coups de coeur deja utilises` : `Coup de coeur · ${coupDeCoeurCount}/${maxCoupDeCoeur} utilise`}
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
