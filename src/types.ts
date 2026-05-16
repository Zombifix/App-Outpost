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
  score?: number
  notes?: number
  summary?: string
  stops?: RoadTripStop[]
  food: number
  night: number
  culture: number
  nature: number
  value: number
  intent: Intent
  coupDeCoeur?: boolean
}

export interface Friend {
  initials: string
  name: string
  color: string
  bg: string
  count: number
}

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
