import type { Destination, Friend, FeedItem, Tier } from './types'

export const DESTINATIONS: Destination[] = [
  { name: 'Prague',    country: '🇨🇿', lat: 50.07,  lng: 14.43,   tier: 'S', food: 4, night: 5, culture: 5, nature: 2, value: 5, intent: 'city-trip' },
  { name: 'Tokyo',     country: '🇯🇵', lat: 35.68,  lng: 139.69,  tier: 'S', food: 5, night: 4, culture: 5, nature: 3, value: 3, intent: 'tourisme'  },
  { name: 'New York',  country: '🇺🇸', lat: 40.71,  lng: -74.00,  tier: 'S', food: 5, night: 5, culture: 5, nature: 1, value: 1, intent: 'city-trip' },
  { name: 'Barcelone', country: '🇪🇸', lat: 41.38,  lng: 2.15,    tier: 'A', food: 5, night: 5, culture: 4, nature: 3, value: 3, intent: 'sorties'   },
  { name: 'Lisbonne',  country: '🇵🇹', lat: 38.71,  lng: -9.14,   tier: 'A', food: 4, night: 4, culture: 4, nature: 3, value: 5, intent: 'city-trip' },
  { name: 'Rome',      country: '🇮🇹', lat: 41.90,  lng: 12.49,   tier: 'A', food: 5, night: 3, culture: 5, nature: 2, value: 2, intent: 'tourisme'  },
  { name: 'Dublin',    country: '🇮🇪', lat: 53.33,  lng: -6.24,   tier: 'B', food: 3, night: 5, culture: 3, nature: 3, value: 2, intent: 'sorties'   },
  { name: 'Berlin',    country: '🇩🇪', lat: 52.52,  lng: 13.40,   tier: 'B', food: 3, night: 5, culture: 4, nature: 2, value: 4, intent: 'sorties'   },
  { name: 'Marrakech', country: '🇲🇦', lat: 31.63,  lng: -7.99,   tier: 'B', food: 4, night: 2, culture: 5, nature: 4, value: 4, intent: 'nature'    },
  { name: 'Amsterdam', country: '🇳🇱', lat: 52.37,  lng: 4.90,    tier: 'C', food: 3, night: 4, culture: 4, nature: 3, value: 2, intent: 'city-trip' },
]

export const FRIENDS: Friend[] = [
  { initials: 'AS', name: 'Alex S.',   color: '#0F6E56', bg: '#E1F5EE', count: 24 },
  { initials: 'LM', name: 'Léa M.',   color: '#534AB7', bg: '#EEEDFE', count: 17 },
  { initials: 'JB', name: 'Jules B.', color: '#993C1D', bg: '#FAECE7', count: 31 },
]

export const FEED: FeedItem[] = [
  { friend: 'AS', dest: 'Kyoto',        flag: '🇯🇵', tier: 'S', time: 'Il y a 2h', lat: 35.01,  lng: 135.77 },
  { friend: 'LM', dest: 'Séville',      flag: '🇪🇸', tier: 'A', time: 'Hier',      lat: 37.39,  lng: -5.99  },
  { friend: 'JB', dest: 'Buenos Aires', flag: '🇦🇷', tier: 'B', time: 'Hier',      lat: -34.61, lng: -58.38 },
  { friend: 'AS', dest: 'Copenhague',   flag: '🇩🇰', tier: 'S', time: 'Il y a 3j', lat: 55.68,  lng: 12.57  },
  { friend: 'LM', dest: 'Reykjavik',    flag: '🇮🇸', tier: 'S', time: 'Il y a 4j', lat: 64.13,  lng: -21.93 },
]

export const TIER_COLORS: Record<Tier, { pin: string; label: string }> = {
  S: { pin: '#EF9F27', label: '#854F0B' },
  A: { pin: '#639922', label: '#3B6D11' },
  B: { pin: '#378ADD', label: '#185FA5' },
  C: { pin: '#7F77DD', label: '#534AB7' },
  D: { pin: '#888780', label: '#5F5E5A' },
}

export const TIER_ORDER: Tier[] = ['S', 'A', 'B', 'C', 'D']

export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Paris':       { lat: 48.85,  lng: 2.35   },
  'Londres':     { lat: 51.51,  lng: -0.13  },
  'Madrid':      { lat: 40.42,  lng: -3.70  },
  'Athènes':     { lat: 37.98,  lng: 23.73  },
  'Vienne':      { lat: 48.21,  lng: 16.37  },
  'Budapest':    { lat: 47.50,  lng: 19.04  },
  'Varsovie':    { lat: 52.23,  lng: 21.01  },
  'Stockholm':   { lat: 59.33,  lng: 18.07  },
  'Oslo':        { lat: 59.91,  lng: 10.75  },
  'Copenhague':  { lat: 55.68,  lng: 12.57  },
  'Helsinki':    { lat: 60.17,  lng: 24.94  },
  'Reykjavik':   { lat: 64.13,  lng: -21.93 },
  'Dubaï':       { lat: 25.20,  lng: 55.27  },
  'Bangkok':     { lat: 13.75,  lng: 100.50 },
  'Singapour':   { lat: 1.35,   lng: 103.82 },
  'Sydney':      { lat: -33.87, lng: 151.21 },
  'Buenos Aires':{ lat: -34.61, lng: -58.38 },
  'São Paulo':   { lat: -23.55, lng: -46.63 },
  'Mexico':      { lat: 19.43,  lng: -99.13 },
  'Montréal':    { lat: 45.50,  lng: -73.57 },
  'Toronto':     { lat: 43.65,  lng: -79.38 },
  'Chicago':     { lat: 41.88,  lng: -87.63 },
  'Los Angeles': { lat: 34.05,  lng: -118.24},
  'Miami':       { lat: 25.77,  lng: -80.19 },
  'Kyoto':       { lat: 35.01,  lng: 135.77 },
  'Séville':     { lat: 37.39,  lng: -5.99  },
  'Valence':     { lat: 39.47,  lng: -0.38  },
  'Florence':    { lat: 43.77,  lng: 11.25  },
  'Venise':      { lat: 45.44,  lng: 12.33  },
  'Milan':       { lat: 45.46,  lng: 9.19   },
  'Naples':      { lat: 40.85,  lng: 14.27  },
  'Bruxelles':   { lat: 50.85,  lng: 4.35   },
  'Zurich':      { lat: 47.38,  lng: 8.54   },
  'Genève':      { lat: 46.20,  lng: 6.15   },
  'Moscou':      { lat: 55.75,  lng: 37.62  },
  'Istanbul':    { lat: 41.01,  lng: 28.97  },
  'Le Caire':    { lat: 30.04,  lng: 31.24  },
  'Nairobi':     { lat: -1.29,  lng: 36.82  },
  'Mumbai':      { lat: 19.08,  lng: 72.88  },
  'Delhi':       { lat: 28.61,  lng: 77.21  },
  'Pékin':       { lat: 39.91,  lng: 116.39 },
  'Shanghai':    { lat: 31.23,  lng: 121.47 },
  'Séoul':       { lat: 37.57,  lng: 126.98 },
  'Hong Kong':   { lat: 22.32,  lng: 114.17 },
  'Auckland':    { lat: -36.85, lng: 174.76 },
}
