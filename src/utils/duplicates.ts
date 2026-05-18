import type { Destination } from '../types'

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const DUP_NAME_DISTANCE_M = 500
const SAME_PLACE_DISTANCE_M = 50

export type DuplicateCandidate = Pick<Destination, 'name' | 'lat' | 'lng' | 'kind'>

export function findDuplicate(
  candidate: DuplicateCandidate,
  existing: Destination[],
  options: { ignoreName?: string } = {},
): Destination | null {
  const normName = normalize(candidate.name)
  const candKind = candidate.kind ?? 'place'
  for (const item of existing) {
    if (options.ignoreName && item.name === options.ignoreName) continue
    const itemKind = item.kind ?? 'place'
    if (itemKind !== candKind) continue
    if (normalize(item.name) === normName) return item
    const d = haversineMeters(item, candidate)
    if (d < DUP_NAME_DISTANCE_M) return item
  }
  return null
}

export interface PlaceMatch {
  tripName: string
  stageNumber?: number
  stopIndex: number
  isPassage: boolean
}

export function findRoadtripStopsAtLocation(
  point: { lat: number; lng: number },
  destinations: Destination[],
  excludeName?: string,
): PlaceMatch[] {
  const out: PlaceMatch[] = []
  for (const d of destinations) {
    if (d.kind !== 'zone' || !d.stops?.length) continue
    if (excludeName && d.name === excludeName) continue
    let stageCounter = 0
    d.stops.forEach((stop, index) => {
      const isPassage = stop.type === 'passage'
      const stageNumber = isPassage ? undefined : ++stageCounter
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return
      const dist = haversineMeters(stop, point)
      if (dist <= SAME_PLACE_DISTANCE_M) {
        out.push({ tripName: d.name, stageNumber, stopIndex: index, isPassage })
      }
    })
  }
  return out
}

export function findDestinationAtLocation(
  point: { lat: number; lng: number },
  destinations: Destination[],
): Destination | null {
  for (const d of destinations) {
    if (d.kind === 'zone' || d.kind === 'stop') continue
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue
    if (haversineMeters(d, point) <= SAME_PLACE_DISTANCE_M) return d
  }
  return null
}
