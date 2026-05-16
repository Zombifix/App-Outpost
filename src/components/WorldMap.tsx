import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Destination } from '../types'
import { TIER_COLORS } from '../data'

const MAPTILER_KEY = 'aETkeQlWzYNolMJrUTIx'
const STYLE_URL = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
const INIT_CENTER: [number, number] = [10, 10]
const INIT_ZOOM = 1.5

type Proj = (ll: [number, number]) => [number, number] | null

interface FlyTarget { lat: number; lng: number; name: string }
interface WorldMapProps {
  destinations: Destination[]
  flyTarget: FlyTarget | null
  selectedName?: string
  onSelect: (name: string) => void
  onFlyTargetConsumed: () => void
  friendDestinations?: Destination[]
  friendInitials?: string
  sharedNames?: Set<string>
}

// ─── Customize MapTiler style layers ─────────────────────────────────────────
function customizeStyle(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers) {
    const { id, type } = layer

    // ── Tous les labels / icônes → masqués (custom pins prennent le dessus)
    if (type === 'symbol') {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Routes, transport, bâtiments, POI → masqués (pas une carte de nav)
    if (/road|tunnel|bridge|transit|rail|aeroway|building|poi|ferry|indoor|path|track|gate|motorway|pedestrian|cycleway|footway|steps|pier|dam|aerodrome|runway|taxiway|piste|parking/.test(id)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Contours d'altitude → masqués (trop technique)
    if (/contour/.test(id)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Landuse urbain → masqué
    if (/landuse/.test(id)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Grille / tropiques / équateur / cercle polaire → masqués
    if (/graticule|grid|tropic|equator|arctic|antarctic|polar|circle.of|meridian|parallel/.test(id)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Frontières admin → beige/gris très subtil, pas de noir
    if (type === 'line' && /boundary|admin|border/.test(id)) {
      map.setPaintProperty(id, 'line-color', 'rgba(155,135,115,0.20)')
      map.setPaintProperty(id, 'line-width', 0.55)
      continue
    }

    // ── Côtes → très subtiles
    if (type === 'line' && /coast/.test(id)) {
      map.setPaintProperty(id, 'line-color', 'rgba(120,158,182,0.22)')
      map.setPaintProperty(id, 'line-width', 0.5)
      continue
    }

    // ── Cours d'eau (rivières, canaux) → bleu doux
    if (type === 'line' && /waterway|river|canal|stream/.test(id)) {
      map.setPaintProperty(id, 'line-color', '#A8D3EA')
      map.setPaintProperty(id, 'line-opacity', 0.6)
      continue
    }

    // ── Eau de fond (océan/background) → bleu profond aquarelle
    if (type === 'background') {
      map.setPaintProperty(id, 'background-color', '#9BBFD9')
      continue
    }

    // ── Eau intérieure (lacs, réservoirs) → bleu légèrement plus clair
    if (type === 'fill' && /water|lake|reservoir|ocean|sea/.test(id)) {
      map.setPaintProperty(id, 'fill-color', '#A8D3EA')
      continue
    }

    // ── Terre de base → beige chaud
    if (type === 'fill' && /^land$/.test(id)) {
      map.setPaintProperty(id, 'fill-color', '#F2EBD8')
      continue
    }

    // ── Végétation / landcover → vert olive doux
    if (type === 'fill' && /landcover|wood|forest|grass|scrub|meadow|heath|vegetation/.test(id)) {
      map.setPaintProperty(id, 'fill-color', '#B8C99A')
      map.setPaintProperty(id, 'fill-opacity', 0.52)
      continue
    }

    // ── Sable / désert / plage → beige sable
    if (type === 'fill' && /sand|desert|beach|bare|dune/.test(id)) {
      map.setPaintProperty(id, 'fill-color', '#E8D8B8')
      continue
    }

    // ── Hillshade → relief doux, opacity 0.28, pas de contraste excessif
    if (type === 'hillshade') {
      map.setPaintProperty(id, 'hillshade-shadow-color', 'rgba(55,42,22,0.35)')
      map.setPaintProperty(id, 'hillshade-highlight-color', 'rgba(255,252,238,0.32)')
      map.setPaintProperty(id, 'hillshade-exaggeration', 0.42)
      continue
    }
  }
}

// ─── Zone + route layers ──────────────────────────────────────────────────────
function clearZoneRouteLayers(map: maplibregl.Map) {
  const style = map.getStyle()
  for (const l of style.layers) {
    if (l.id.startsWith('_z_') || l.id.startsWith('_r_')) {
      try { map.removeLayer(l.id) } catch { /* already removed */ }
    }
  }
  for (const sid of Object.keys(style.sources)) {
    if (sid.startsWith('_z_') || sid.startsWith('_r_')) {
      try { map.removeSource(sid) } catch { /* already removed */ }
    }
  }
}

function addZoneLayer(map: maplibregl.Map, d: Destination, owner: 'me' | 'friend') {
  if (!d.tier) return
  const color = TIER_COLORS[d.tier].pin
  const sid = `_z_${owner}_${d.name}`

  let geometry: GeoJSON.Geometry | null = null
  if (d.geojson) {
    geometry = d.geojson as GeoJSON.Geometry
  } else if (d.extent) {
    const [w, s, e, n] = d.extent
    geometry = { type: 'Polygon', coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] }
  }
  if (!geometry || map.getSource(sid)) return

  map.addSource(sid, { type: 'geojson', data: { type: 'Feature', geometry, properties: {} } })
  map.addLayer({
    id: `${sid}_fill`, type: 'fill', source: sid,
    paint: { 'fill-color': color, 'fill-opacity': owner === 'friend' ? 0.35 : 0.13 },
  })
  map.addLayer({
    id: `${sid}_line`, type: 'line', source: sid,
    paint: {
      'line-color': owner === 'friend' ? '#7C8DB5' : color,
      'line-width': owner === 'friend' ? 2 : 1.3,
      'line-opacity': owner === 'friend' ? 0.85 : 0.5,
      'line-dasharray': owner === 'friend' ? [5, 4] : [6, 3],
    },
  })
}

function addRouteLayer(map: maplibregl.Map, d: Destination) {
  if (!d.stops?.length || !d.tier) return
  const color = TIER_COLORS[d.tier].pin
  const sid = `_r_${d.name}`
  const coords = d.stops
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map(s => [s.lng, s.lat] as [number, number])
  if (coords.length < 2 || map.getSource(sid)) return

  map.addSource(sid, {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
  })
  map.addLayer({
    id: `${sid}_line`, type: 'line', source: sid,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': 2.4, 'line-opacity': 0.9 },
  })
  map.addSource(`${sid}_pts`, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: d.stops.map(s => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        properties: {},
      })),
    },
  })
  map.addLayer({
    id: `${sid}_dots`, type: 'circle', source: `${sid}_pts`,
    paint: {
      'circle-radius': 3.2, 'circle-color': color,
      'circle-stroke-width': 1, 'circle-stroke-color': 'white', 'circle-opacity': 0.95,
    },
  })
}

function syncZoneRouteLayers(
  map: maplibregl.Map,
  destinations: Destination[],
  friendDestinations?: Destination[],
  sharedNames?: Set<string>,
) {
  clearZoneRouteLayers(map)
  const shared = sharedNames ?? new Set<string>()
  for (const d of destinations) {
    if (d.kind === 'zone') { addZoneLayer(map, d, 'me'); addRouteLayer(map, d) }
  }
  if (friendDestinations) {
    for (const d of friendDestinations) {
      if (d.kind === 'zone' && !shared.has(d.name.toLowerCase())) addZoneLayer(map, d, 'friend')
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorldMap({
  destinations, flyTarget, selectedName, onSelect, onFlyTargetConsumed,
  friendDestinations, friendInitials, sharedNames,
}: WorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const svgRef          = useRef<SVGSVGElement>(null)
  const pinsGroupRef    = useRef<SVGGElement>(null)
  const projFnRef       = useRef<Proj>(() => null)

  const [mapReady, setMapReady] = useState(false)
  const [zoomK, setZoomK]       = useState(1)

  // ── Init MapLibre ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLE_URL,
      center: INIT_CENTER,
      zoom: INIT_ZOOM,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    })

    map.on('load', () => {
      customizeStyle(map)
      projFnRef.current = ([lng, lat]) => {
        const { x, y } = map.project([lng, lat] as maplibregl.LngLatLike)
        return [x, y]
      }
      setMapReady(true)
    })

    // Mise à jour directe du DOM des pins — zéro re-render React par frame
    map.on('move', () => updatePins(map))
    map.on('zoom', () => setZoomK(Math.pow(2, map.getZoom() - INIT_ZOOM)))

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync zones / routes quand destinations change ───────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    syncZoneRouteLayers(mapRef.current, destinations, friendDestinations, sharedNames)
  }, [mapReady, destinations, friendDestinations, sharedNames])

  // ── Repositionner les pins au chargement et aux changements ─────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    updatePins(mapRef.current)
  }, [mapReady, destinations, friendDestinations])

  // ── Mise à jour directe des transforms SVG (bypass React) ──────────────────
  function updatePins(map: maplibregl.Map) {
    if (!pinsGroupRef.current) return
    const k    = Math.pow(2, map.getZoom() - INIT_ZOOM)
    const invK = 1 / k

    pinsGroupRef.current.querySelectorAll<SVGGElement>('g.pin-root').forEach(el => {
      const lng = parseFloat(el.dataset.lng ?? '0')
      const lat = parseFloat(el.dataset.lat ?? '0')
      if (!isFinite(lng) || !isFinite(lat)) return
      const { x, y } = map.project([lng, lat] as maplibregl.LngLatLike)
      el.setAttribute('transform', `translate(${x},${y}) scale(${invK})`)
    })

    pinsGroupRef.current.querySelectorAll<SVGGElement>('g.stop-root').forEach(el => {
      const lng = parseFloat(el.dataset.lng ?? '0')
      const lat = parseFloat(el.dataset.lat ?? '0')
      if (!isFinite(lng) || !isFinite(lat)) return
      const { x, y } = map.project([lng, lat] as maplibregl.LngLatLike)
      el.setAttribute('transform', `translate(${x},${y})`)
    })
  }

  // ── Fly to destination ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!flyTarget || !mapRef.current || !mapReady) return
    mapRef.current.flyTo({
      center: [flyTarget.lng, flyTarget.lat] as maplibregl.LngLatLike,
      zoom: Math.max(mapRef.current.getZoom(), 4),
      duration: 760,
    })
    onFlyTargetConsumed()
  }, [flyTarget, mapReady, onFlyTargetConsumed])

  const zoomBy = (factor: number) => {
    const map = mapRef.current
    if (!map) return
    map.zoomTo(map.getZoom() + Math.log2(factor), { duration: 260 })
  }

  const resetZoom = () => {
    mapRef.current?.flyTo({ center: INIT_CENTER, zoom: INIT_ZOOM, duration: 400 })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className="map-area" aria-label="Carte des destinations">
      <div ref={mapContainerRef} className="map-gl-container" />

      <svg ref={svgRef} className="map-pins-overlay" aria-label="Pins des destinations">
        <g ref={pinsGroupRef}>
          {mapReady && (() => {
            const shared   = sharedNames ?? new Set<string>()
            const friendOnly = friendDestinations
              ? friendDestinations.filter(d => !shared.has(d.name.toLowerCase()))
              : []
            return (
              <>
                {friendOnly.map(d => (
                  <Pin key={`friend:${d.name}`} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={false} onSelect={onSelect}
                    owner="friend" badge={friendInitials} />
                ))}
                {destinations.map(d => (
                  <Pin key={d.name} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={d.name === selectedName} onSelect={onSelect}
                    owner="me" shared={shared.has(d.name.toLowerCase())} />
                ))}
              </>
            )
          })()}
        </g>
      </svg>

      <div className="map-controls" aria-label="Controles de carte">
        <button aria-label="Zoomer" onClick={() => zoomBy(1.35)}>+</button>
        <button aria-label="Dezoomer" onClick={() => zoomBy(0.75)}>−</button>
        <span className="map-controls-divider" aria-hidden="true" />
        <button aria-label="Recadrer la carte" onClick={resetZoom}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9V4h5" /><path d="M21 9V4h-5" />
            <path d="M3 15v5h5" /><path d="M21 15v5h-5" />
          </svg>
        </button>
      </div>

      <div className="legend">
        {[['S','Exceptionnel'],['A','Genial'],['B','Tres bien'],['C','Correct'],['D','Decouvrant']].map(([tier, label]) => (
          <span key={tier}>
            <i className={`tier-dot tier-${tier.toLowerCase()}`}>{tier}</i>
            {label}
          </span>
        ))}
      </div>

      <p className="map-attribution">
        <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">© MapTiler</a>
        {' · '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
      </p>
    </section>
  )
}

// ─── Pin component ────────────────────────────────────────────────────────────
interface PinProps {
  destination: Destination
  projection: Proj
  zoomK: number
  selected: boolean
  onSelect: (name: string) => void
  owner?: 'me' | 'friend'
  badge?: string
  shared?: boolean
}

const Pin = memo(function Pin({
  destination, projection, zoomK, selected, onSelect, owner = 'me', badge, shared,
}: PinProps) {
  const projected = projection([destination.lng, destination.lat])
  if (!projected) return null
  const [cx, cy] = projected
  const invK = 1 / zoomK
  const isCompact = zoomK < 2

  // ── Stop (road trip waypoint) ──────────────────────────────────────────────
  if (destination.kind === 'stop') {
    return (
      <g className="stop-root" data-lng={destination.lng} data-lat={destination.lat}
         transform={`translate(${cx},${cy})`}>
        <circle r={5}
          fill={owner === 'friend' ? '#fff' : '#8b9db5'}
          stroke={owner === 'friend' ? '#7C8DB5' : 'white'}
          strokeWidth={owner === 'friend' ? 1.6 : 1.2}
          opacity={0.85}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect(destination.name)} />
      </g>
    )
  }

  const color = TIER_COLORS[destination.tier!].pin
  const score = (destination.score ?? (destination.food + destination.night + destination.culture + destination.nature + destination.value) / 5)
    .toFixed(1).replace('.', ',')

  // ── Zone label ─────────────────────────────────────────────────────────────
  if (destination.kind === 'zone') {
    return (
      <g className={`pin-root pin-owner-${owner}${selected ? ' pin-selected' : ''}`}
         data-lng={destination.lng} data-lat={destination.lat}
         transform={`translate(${cx},${cy}) scale(${invK})`}>
        <foreignObject className="pin-foreign-object" x="-70" y="-36" width="140" height="40">
          <div className="pin-stage">
            <button
              className={`map-pin map-pin-zone-label${owner === 'friend' ? ' map-pin--friend' : ''}`}
              onClick={() => onSelect(destination.name)}
              style={{ '--pin-color': color } as CSSProperties}>
              <strong>{destination.name}</strong>
              {owner === 'friend' && badge && <em className="pin-friend-badge">{badge}</em>}
              {shared && <em className="pin-shared-badge">2</em>}
            </button>
          </div>
        </foreignObject>
      </g>
    )
  }

  // ── Full destination pin ───────────────────────────────────────────────────
  return (
    <g className={`pin-root pin-owner-${owner}${selected ? ' pin-selected' : ''}`}
       data-lng={destination.lng} data-lat={destination.lat}
       transform={`translate(${cx},${cy}) scale(${invK})`}>
      <foreignObject className="pin-foreign-object" x="-82" y="-148" width="164" height="168">
        <div className="pin-stage">
          <button
            className={`map-pin${isCompact ? ' map-pin--compact' : ''}${destination.kind === 'stage' ? ' map-pin-stage' : ''}${owner === 'friend' ? ' map-pin--friend' : ''}`}
            onClick={() => onSelect(destination.name)}
            style={{ '--pin-color': color } as CSSProperties}>
            <span>{destination.tier}</span>
            <strong>
              {destination.name}
              {destination.kind === 'stage' && destination.tripName ? <em> · {destination.tripName}</em> : null}
            </strong>
            {owner === 'friend' && badge && <em className="pin-friend-badge">{badge}</em>}
            {shared && <em className="pin-shared-badge">2</em>}
          </button>
        </div>
      </foreignObject>
    </g>
  )
})
