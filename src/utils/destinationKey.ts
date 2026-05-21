import type { Destination, RoadTripStop } from '../types'

export interface DestinationKeyInput {
  name: string
  country: string
  kind?: Destination['kind']
  lat?: number
  lng?: number
  osmId?: number
  osmType?: Destination['osmType']
  stops?: RoadTripStop[]
}

function normalizeOsmType(value?: Destination['osmType']): string | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'n' || normalized === 'node') return 'node'
  if (normalized === 'w' || normalized === 'way') return 'way'
  if (normalized === 'r' || normalized === 'relation') return 'relation'
  return null
}

export function slugPart(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function stableCoord(value?: number): string {
  return Number.isFinite(value) ? Number(value).toFixed(3) : 'na'
}

export function buildDestinationKey(input: DestinationKeyInput): string {
  const osmType = normalizeOsmType(input.osmType)
  if (osmType && Number.isFinite(input.osmId)) {
    return `osm_${osmType}_${Math.trunc(input.osmId as number)}`
  }

  const stopPart = input.stops?.length
    ? input.stops.slice(0, 3).map(stop => slugPart(stop.name)).filter(Boolean).join('_')
    : ''
  const parts = [
    input.kind ?? 'place',
    slugPart(input.name),
    slugPart(input.country),
    stableCoord(input.lat),
    stableCoord(input.lng),
    stopPart,
  ].filter(Boolean)

  return `slug_${parts.join('_')}`
}
