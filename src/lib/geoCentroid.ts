// Compute centroid and bounding box of the largest polygon inside a GeoJSON geometry.
//
// Why "largest polygon" and not whole MultiPolygon: countries like France include
// DOM-TOM (Guyane, Réunion, Mayotte, etc.) as separate polygons. Averaging across
// them puts the centroid in the Atlantic / Africa. Picking the main landmass keeps
// pins on metropolitan France while still keeping the same logic for simple regions
// (Corse, Bali) — when there's only one polygon, it's automatically chosen.

type Ring = [number, number][] // [lng, lat]

export interface GeoCentroidResult {
  lat: number
  lng: number
  bbox: [number, number, number, number] // [west, south, east, north]
}

function ringArea(ring: Ring): number {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(area / 2)
}

function ringCentroid(ring: Ring): { lng: number; lat: number; area: number } {
  let twiceArea = 0
  let x = 0
  let y = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    twiceArea += cross
    x += (ring[j][0] + ring[i][0]) * cross
    y += (ring[j][1] + ring[i][1]) * cross
  }
  const area = twiceArea / 2
  if (Math.abs(area) < 1e-12) {
    // Degenerate — fallback to average of vertices.
    const sum = ring.reduce((acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }), { lng: 0, lat: 0 })
    return { lng: sum.lng / ring.length, lat: sum.lat / ring.length, area: 0 }
  }
  return { lng: x / (6 * area), lat: y / (6 * area), area: Math.abs(area) }
}

function ringBbox(ring: Ring): [number, number, number, number] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  return [west, south, east, north]
}

function isValidRing(ring: unknown): ring is Ring {
  return Array.isArray(ring) && ring.length >= 3 && ring.every(p =>
    Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  )
}

export function geoCentroid(geometry: GeoJSON.Geometry | undefined | null): GeoCentroidResult | null {
  if (!geometry) return null

  let polygons: Ring[] = []
  if (geometry.type === 'Polygon') {
    if (isValidRing(geometry.coordinates[0])) polygons = [geometry.coordinates[0] as Ring]
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      const outer = poly[0]
      if (isValidRing(outer)) polygons.push(outer as Ring)
    }
  } else {
    return null
  }

  if (polygons.length === 0) return null

  let bestRing: Ring = polygons[0]
  let bestArea = ringArea(polygons[0])
  for (let i = 1; i < polygons.length; i++) {
    const area = ringArea(polygons[i])
    if (area > bestArea) {
      bestArea = area
      bestRing = polygons[i]
    }
  }

  const { lng, lat } = ringCentroid(bestRing)
  const bbox = ringBbox(bestRing)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lat, lng, bbox }
}

// Quick heuristic: is the stored extent + point likely broken?
// Used to decide whether a legacy destination needs re-geocoding.
export function isSuspiciousZone(
  point: { lat: number; lng: number },
  extent: [number, number, number, number] | undefined | null,
): boolean {
  if (!extent || extent.length !== 4 || !extent.every(Number.isFinite)) return false
  const [a, b, c, d] = extent
  // Tolerant to either [w,s,e,n] or [w,n,e,s] — span is order-agnostic.
  const lngSpan = Math.abs(c - a)
  const latSpan = Math.abs(d - b)
  if (lngSpan > 40 || latSpan > 40) return true
  const west = Math.min(a, c), east = Math.max(a, c)
  const south = Math.min(b, d), north = Math.max(b, d)
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  if (point.lng < west - 1 || point.lng > east + 1) return true
  if (point.lat < south - 1 || point.lat > north + 1) return true
  return false
}
