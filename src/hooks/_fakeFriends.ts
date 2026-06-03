/// <reference types="vite/client" />
import type { Friendship, ActivityEvent, Destination } from '../types'

export const FAKE_FRIENDS_MODE =
  (import.meta.env.VITE_FAKE_FRIENDS as string | undefined) === '1'

type EnrichedActivity = ActivityEvent & {
  actorHandle?: string
  actorDisplayName?: string
  actorAvatarBg?: string
  actorAvatarFg?: string
}

const NOW = Date.now()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const daysAgo = (d: number) => new Date(NOW - d * 24 * 3600_000).toISOString()

const PROFILES = {
  alice:  { id: 'u-alice',  handle: 'alice-seed',  name: 'Alice (seed)',  bg: '#FEF3C7', fg: '#92400E' },
  bruno:  { id: 'u-bruno',  handle: 'bruno-seed',  name: 'Bruno (seed)',  bg: '#DBEAFE', fg: '#1E40AF' },
  chloe:  { id: 'u-chloe',  handle: 'chloe-seed',  name: 'Chloé (seed)',  bg: '#FCE7F3', fg: '#9D174D' },
  david:  { id: 'u-david',  handle: 'david-seed',  name: 'David (seed)',  bg: '#D1FAE5', fg: '#065F46' },
  elise:  { id: 'u-elise',  handle: 'elise-seed',  name: 'Élise (seed)',  bg: '#EDE9FE', fg: '#5B21B6' },
}

export const FAKE_FRIENDSHIPS: Friendship[] = [
  // accepted
  { otherUser: PROFILES.alice.id, handle: PROFILES.alice.handle, displayName: PROFILES.alice.name, avatarBg: PROFILES.alice.bg, avatarFg: PROFILES.alice.fg, status: 'accepted', initiator: 'me', createdAt: daysAgo(20), acceptedAt: daysAgo(19) },
  { otherUser: PROFILES.bruno.id, handle: PROFILES.bruno.handle, displayName: PROFILES.bruno.name, avatarBg: PROFILES.bruno.bg, avatarFg: PROFILES.bruno.fg, status: 'accepted', initiator: 'them', createdAt: daysAgo(15), acceptedAt: daysAgo(15) },
  // incoming
  { otherUser: PROFILES.chloe.id, handle: PROFILES.chloe.handle, displayName: PROFILES.chloe.name, avatarBg: PROFILES.chloe.bg, avatarFg: PROFILES.chloe.fg, status: 'pending', initiator: 'them', createdAt: daysAgo(2) },
  { otherUser: PROFILES.elise.id, handle: PROFILES.elise.handle, displayName: PROFILES.elise.name, avatarBg: PROFILES.elise.bg, avatarFg: PROFILES.elise.fg, status: 'pending', initiator: 'them', createdAt: daysAgo(1) },
  // outgoing
  { otherUser: PROFILES.david.id, handle: PROFILES.david.handle, displayName: PROFILES.david.name, avatarBg: PROFILES.david.bg, avatarFg: PROFILES.david.fg, status: 'pending', initiator: 'me', createdAt: daysAgo(3) },
]

const enrich = (actor: keyof typeof PROFILES) => ({
  actorHandle: PROFILES[actor].handle,
  actorDisplayName: PROFILES[actor].name,
  actorAvatarBg: PROFILES[actor].bg,
  actorAvatarFg: PROFILES[actor].fg,
})

let _idSeq = 0
const nextId = () => `fake-${++_idSeq}`

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=240&q=80`

const brunoDest = (name: string, lat: number, lng: number, tier: string, image: string, ago: number): EnrichedActivity => ({
  id: nextId(),
  actor: PROFILES.bruno.id,
  kind: 'destination_added',
  payload: { name, lat, lng, tier, image },
  createdAt: minutesAgo(ago),
  ...enrich('bruno'),
})

const aliceDest = (name: string, lat: number, lng: number, tier: string, image: string, ago: number): EnrichedActivity => ({
  id: nextId(),
  actor: PROFILES.alice.id,
  kind: 'destination_added',
  payload: { name, lat, lng, tier, image },
  createdAt: minutesAgo(ago),
  ...enrich('alice'),
})

export const FAKE_ACTIVITY: EnrichedActivity[] = [
  // Bruno added 6 dests ~1 min ago (will group)
  brunoDest('Tokyo, Japon',     35.6762, 139.6503, 'S', img('1503899036084-c55cdd92da26'), 1),
  brunoDest('Osaka, Japon',     34.6937, 135.5023, 'A', img('1590559899731-a382839e5549'), 1),
  brunoDest('Kyoto, Japon',     35.0116, 135.7681, 'S', img('1528360983277-13d401cdc186'), 1),
  brunoDest('Nara, Japon',      34.6851, 135.8048, 'B', img('1492571350019-22de08371fd3'), 1),
  brunoDest('Hakone, Japon',    35.2329, 139.1066, 'A', img('1492571350019-22de08371fd3'), 1),
  brunoDest('Hiroshima, Japon', 34.3853, 132.4553, 'B', img('1542931287-023b922fa89b'), 1),
  // Alice added 6 dests ~1 min ago (will also group)
  aliceDest('Lisbonne, Portugal',    38.7223, -9.1393,  'A', img('1548707309-dcebeab9ea9b'), 2),
  aliceDest('Porto, Portugal',       41.1579, -8.6291,  'A', img('1555881400-74d7acaacd8b'), 2),
  aliceDest('Sintra, Portugal',      38.8029, -9.3817,  'S', img('1588535239434-f2c63b97c6da'), 2),
  aliceDest('Évora, Portugal',       38.5667, -7.9000,  'B', img('1560419015-7c427e8ae5ba'), 2),
  aliceDest('Lagos, Portugal',       37.1028, -8.6738,  'C', img('1502920514313-52581002a659'), 2),
  aliceDest('Coimbra, Portugal',     40.2033, -8.4103,  'B', img('1555881400-74d7acaacd8b'), 2),
  // older standalone events
  {
    id: nextId(), actor: PROFILES.alice.id, kind: 'coup_de_coeur_set',
    payload: { name: 'Sintra, Portugal' }, createdAt: minutesAgo(180), ...enrich('alice'),
  },
  {
    id: nextId(), actor: PROFILES.bruno.id, kind: 'tier_changed',
    payload: { name: 'Tokyo, Japon', from: 'A', to: 'S' }, createdAt: minutesAgo(360), ...enrich('bruno'),
  },
]

export const FAKE_USER = { id: 'me-local-dev' }

// ──────────────────────────────────────────────────────────────────────────────
// Cartes des amis (faux)
// Chaque ami a son propre carnet. Cliquer sur un ami dans le panneau de gestion
// déclenche l'ouverture de SA carte (cf. App.tsx viewingFriend).
// ──────────────────────────────────────────────────────────────────────────────

function dest(
  name: string, country: string, lat: number, lng: number,
  tier: Destination['tier'], image: string,
  scores: { food: number; night: number; culture: number; nature: number; value: number },
  intent: Destination['intent'] = 'tourisme',
  score = 4.2,
  countryCode?: string,
): Destination {
  return {
    name, country, lat, lng, tier, image,
    score, notes: 10,
    food: scores.food, night: scores.night, culture: scores.culture,
    nature: scores.nature, value: scores.value,
    intent,
    ...(countryCode ? { countryCode } : {}),
  }
}

const ALICE_DESTS: Destination[] = [
  dest('Lisbonne', 'Portugal',  38.7223, -9.1393, 'A', img('1548707309-dcebeab9ea9b'), { food: 5, night: 4, culture: 5, nature: 4, value: 5 }, 'tourisme', 4.6, 'pt'),
  dest('Porto',    'Portugal',  41.1579, -8.6291, 'A', img('1555881400-74d7acaacd8b'), { food: 5, night: 4, culture: 5, nature: 3, value: 5 }, 'gastro', 4.5, 'pt'),
  dest('Sintra',   'Portugal',  38.8029, -9.3817, 'S', img('1588535239434-f2c63b97c6da'), { food: 4, night: 2, culture: 5, nature: 5, value: 4 }, 'nature', 4.8, 'pt'),
  dest('Madrid',   'Espagne',   40.4168, -3.7038, 'A', img('1543783207-ec64e4d95325'), { food: 5, night: 5, culture: 5, nature: 3, value: 4 }, 'tourisme', 4.5, 'es'),
  dest('Marrakech','Maroc',     31.6295, -7.9811, 'B', img('1597212618440-3f0a8da57c00'), { food: 5, night: 3, culture: 5, nature: 3, value: 5 }, 'tourisme', 4.1, 'ma'),
  dest('Reykjavik','Islande',   64.1466, -21.9426, 'A', img('1486546910464-ec8e45c4a137'), { food: 3, night: 4, culture: 4, nature: 5, value: 2 }, 'nature', 4.4, 'is'),
]

const BRUNO_DESTS: Destination[] = [
  dest('Tokyo',    'Japon',        35.6762, 139.6503, 'S', img('1503899036084-c55cdd92da26'), { food: 5, night: 5, culture: 5, nature: 3, value: 3 }, 'tourisme', 4.9, 'jp'),
  dest('Kyoto',    'Japon',        35.0116, 135.7681, 'S', img('1528360983277-13d401cdc186'), { food: 5, night: 3, culture: 5, nature: 5, value: 4 }, 'tourisme', 4.8, 'jp'),
  dest('Osaka',    'Japon',        34.6937, 135.5023, 'A', img('1590559899731-a382839e5549'), { food: 5, night: 5, culture: 4, nature: 3, value: 4 }, 'gastro', 4.5, 'jp'),
  dest('Séoul',    'Corée du Sud', 37.5665, 126.9780, 'A', img('1538485399081-7a06146d59f2'), { food: 5, night: 5, culture: 4, nature: 3, value: 4 }, 'tourisme', 4.5, 'kr'),
  dest('Taipei',   'Taïwan',       25.0330, 121.5654, 'B', img('1552751753-0fc24f0bb31a'), { food: 5, night: 4, culture: 4, nature: 3, value: 5 }, 'gastro', 4.2, 'tw'),
  dest('Hanoï',    'Vietnam',      21.0285, 105.8542, 'B', img('1528127269322-539801943592'), { food: 5, night: 3, culture: 4, nature: 4, value: 5 }, 'tourisme', 4.0, 'vn'),
  dest('Singapour','Singapour',     1.3521, 103.8198, 'A', img('1565967511849-76a60a516170'), { food: 5, night: 4, culture: 4, nature: 4, value: 2 }, 'tourisme', 4.4, 'sg'),
]

const FRIEND_DESTS_BY_USER: Record<string, Destination[]> = {
  [PROFILES.alice.id]: ALICE_DESTS,
  [PROFILES.bruno.id]: BRUNO_DESTS,
}

export function getFakeFriendDestinations(userId: string): Destination[] {
  return FRIEND_DESTS_BY_USER[userId] ?? []
}

/** Recherche un faux ami par handle (sans le @, case-insensitive). */
export function findFakeFriendByHandle(handle: string): { userId: string; handle: string; displayName: string } | null {
  const clean = handle.trim().toLowerCase().replace(/^@/, '')
  const match = FAKE_FRIENDSHIPS.find(f => f.handle.toLowerCase() === clean)
  if (!match) return null
  return { userId: match.otherUser, handle: match.handle, displayName: match.displayName }
}

// ──────────────────────────────────────────────────────────────────────────────
// Live ticker : en mode fake on simule l'arrivée de nouveaux events régulièrement
// pour montrer le caractère "live" du fil d'activité dans la sidebar.
// Les abonnés (useActivityFeed) reçoivent un callback à chaque tick.
// ──────────────────────────────────────────────────────────────────────────────

const LIVE_EVENT_TEMPLATES = [
  { actor: 'alice' as const, kind: 'destination_added',
    payload: { name: 'Tanger, Maroc',     lat: 35.7595, lng: -5.8340, tier: 'B', image: img('1597212618440-3f0a8da57c00') } },
  { actor: 'bruno' as const, kind: 'tier_changed',
    payload: { name: 'Séoul, Corée du Sud', from: 'A', to: 'S' } },
  { actor: 'alice' as const, kind: 'coup_de_coeur_set',
    payload: { name: 'Lisbonne, Portugal' } },
  { actor: 'bruno' as const, kind: 'destination_added',
    payload: { name: 'Bangkok, Thaïlande', lat: 13.7563, lng: 100.5018, tier: 'A', image: img('1508009603885-50cf7c579365') } },
  { actor: 'alice' as const, kind: 'destination_added',
    payload: { name: 'Séville, Espagne',  lat: 37.3891, lng: -5.9845, tier: 'A', image: img('1559666126-84f389727b9a') } },
]

let _liveCursor = 0
const liveListeners = new Set<(event: EnrichedActivity) => void>()
let liveInterval: ReturnType<typeof setInterval> | null = null

function emitNextLiveEvent() {
  const tpl = LIVE_EVENT_TEMPLATES[_liveCursor % LIVE_EVENT_TEMPLATES.length]
  _liveCursor += 1
  const event: EnrichedActivity = {
    id: nextId(),
    actor: PROFILES[tpl.actor].id,
    kind: tpl.kind as EnrichedActivity['kind'],
    payload: tpl.payload as Record<string, unknown>,
    createdAt: new Date().toISOString(),
    ...enrich(tpl.actor),
  }
  liveListeners.forEach(fn => fn(event))
}

export function subscribeFakeLive(cb: (event: EnrichedActivity) => void): () => void {
  liveListeners.add(cb)
  if (!liveInterval && FAKE_FRIENDS_MODE) {
    // Premier event 8s après le mount, puis toutes les 12s.
    liveInterval = setInterval(emitNextLiveEvent, 12_000)
    setTimeout(emitNextLiveEvent, 8_000)
  }
  return () => {
    liveListeners.delete(cb)
    if (liveListeners.size === 0 && liveInterval) {
      clearInterval(liveInterval)
      liveInterval = null
    }
  }
}
