export type Tier = 'S' | 'A' | 'B' | 'C' | 'D'

export type Intent =
  | 'city-trip'
  | 'tourisme'
  | 'sorties'
  | 'gastro'
  | 'nature'
  | 'travail'

export interface RoadTripStop {
  name: string
  lat: number
  lng: number
  type?: 'stage' | 'passage'
}

export interface Destination {
  name: string
  country: string
  lat: number
  lng: number
  tier?: Tier
  kind?: 'place' | 'zone' | 'stop' | 'stage'
  tripName?: string
  extent?: [number, number, number, number]
  geojson?: object
  state?: string
  osmValue?: string
  image?: string
  imageProvider?: 'pexels' | 'wikivoyage' | 'wikipedia' | 'wikimedia' | 'fallback'
  imageAuthor?: string
  imageSourceUrl?: string
  imageQuery?: string
  imageSearchVersion?: number
  score?: number
  notes?: number
  summary?: string
  stops?: RoadTripStop[]
  tripYear?: number
  tripDays?: number
  companions?: 'solo' | 'couple' | 'amis' | 'famille' | 'travail'
  personalBudget?: number
  standout?: string
  food: number
  night: number
  culture: number
  nature: number
  value: number
  intent: Intent
  coupDeCoeur?: boolean
}

// Identité publique d'un utilisateur Outpost (cf. table public_profiles)
export interface PublicProfile {
  userId: string
  handle: string
  displayName: string
  avatarBg: string
  avatarFg: string
  bio?: string
}

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'

// Une amitié vue de mon côté (cf. RPC my_friendships)
export interface Friendship {
  otherUser: string
  handle: string
  displayName: string
  avatarBg: string
  avatarFg: string
  status: FriendshipStatus
  /** 'me' si c'est moi qui ai initié la demande, 'them' si c'est l'autre */
  initiator: 'me' | 'them'
  createdAt: string
  acceptedAt?: string
}

export type ActivityKind =
  | 'destination_added'
  | 'tier_changed'
  | 'coup_de_coeur_set'
  | 'roadtrip_created'
  | 'roadtrip_stop_added'
  | 'friendship_accepted'
  | 'reaction_received'
  | 'mutual_destination'
  | 'milestone'

export interface ActivityEvent {
  id: string
  actor: string
  kind: ActivityKind
  payload: Record<string, unknown>
  createdAt: string
}

/** @deprecated — utilise Friendship + PublicProfile. Conservé temporairement pour les composants legacy. */
export interface Friend {
  initials: string
  name: string
  color: string
  bg: string
  count: number
}

/** @deprecated — utilise ActivityEvent. */
export interface FeedItem {
  friend: string
  dest: string
  flag: string
  tier: Tier
  time: string
  lat: number
  lng: number
}

export interface NewDestinationForm {
  name: string
  intent: Intent
  food: number
  night: number
  culture: number
  nature: number
  value: number
}
