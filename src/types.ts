export type Tier = 'S' | 'A' | 'B' | 'C' | 'D'

export type Intent =
  | 'city-trip'
  | 'tourisme'
  | 'sorties'
  | 'gastro'
  | 'nature'
  | 'travail'

export interface Destination {
  name: string
  country: string
  lat: number
  lng: number
  tier: Tier
  food: number
  night: number
  culture: number
  nature: number
  value: number
  intent: Intent
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
