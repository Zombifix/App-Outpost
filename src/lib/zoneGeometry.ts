import type { Destination } from '../types'
import { geoCentroid, isSuspiciousZone } from './geoCentroid'

const NOMINATIM_ACCEPT_LANGUAGE = 'fr'

interface ZoneGeometryInput {
  name: string
  country: string
  osmId?: number
  osmType?: Destination['osmType']
}

export function needsZoneGeometryRepair(destination: Destination) {
  return destination.kind === 'zone'
    && (isSuspiciousZone({ lat: destination.lat, lng: destination.lng }, destination.extent) || !destination.geojson)
}

function getLookupOsmId(input: ZoneGeometryInput): string | null {
  if (!Number.isFinite(input.osmId) || !input.osmType) return null
  const type = input.osmType.toLowerCase()
  const prefix = type === 'relation' || type === 'r'
    ? 'R'
    : type === 'way' || type === 'w'
      ? 'W'
      : type === 'node' || type === 'n'
        ? 'N'
        : null
  return prefix ? `${prefix}${input.osmId}` : null
}

function readGeometry(data: unknown): GeoJSON.Geometry | undefined {
  const feature = (data as { features?: Array<{ geometry?: unknown }> } | undefined)?.features?.[0]
  const geom = feature?.geometry
  if (geom && typeof geom === 'object' && typeof (geom as { type?: unknown }).type === 'string') {
    return geom as GeoJSON.Geometry
  }
  return undefined
}

export async function resolveZoneGeojson(input: ZoneGeometryInput): Promise<GeoJSON.Geometry | undefined> {
  const osmId = getLookupOsmId(input)
  try {
    if (osmId) {
      const lookup = await fetch(
        `https://nominatim.openstreetmap.org/lookup?osm_ids=${encodeURIComponent(osmId)}&format=geojson&polygon_geojson=1&polygon_threshold=0.01`,
        { headers: { 'Accept-Language': NOMINATIM_ACCEPT_LANGUAGE } },
      )
      return readGeometry(await lookup.json())
    }

    const q = input.country ? `${input.name}, ${input.country}` : input.name
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=geojson&polygon_geojson=1&polygon_threshold=0.01&limit=1`,
      { headers: { 'Accept-Language': NOMINATIM_ACCEPT_LANGUAGE } },
    )
    return readGeometry(await res.json())
  } catch {
    return undefined
  }
}

export async function repairZoneDestinationGeometry(destination: Destination): Promise<Destination | null> {
  if (destination.kind !== 'zone') return null
  const geom = await resolveZoneGeojson(destination)
  const centroid = geoCentroid(geom)
  if (!geom || !centroid) return null

  const dLat = Math.abs(centroid.lat - destination.lat)
  const dLng = Math.abs(centroid.lng - destination.lng)
  const meaningful = !Number.isFinite(destination.lat)
    || !Number.isFinite(destination.lng)
    || dLat > 1
    || dLng > 1
    || !destination.geojson
    || isSuspiciousZone({ lat: destination.lat, lng: destination.lng }, destination.extent)

  if (!meaningful) return null

  return {
    ...destination,
    lat: centroid.lat,
    lng: centroid.lng,
    extent: centroid.bbox,
    geojson: geom,
  }
}
