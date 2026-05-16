import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Destination, RoadTripStop, Tier } from '../types'
import { TIER_COLORS } from '../data'

const MAPTILER_KEY = 'aETkeQlWzYNolMJrUTIx'
const STYLE_URL = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
const INIT_CENTER: [number, number] = [10, 10]
const INIT_ZOOM = 1.5
const MIN_PIN_SCALE = 0.86

type Proj = (ll: [number, number]) => [number, number] | null

function pinScaleFromZoomK(zoomK: number) {
  if (!Number.isFinite(zoomK) || zoomK <= 0) return 1
  return Math.max(MIN_PIN_SCALE, Math.min(1, 1 / Math.sqrt(zoomK)))
}

function getTierColor(tier?: Tier) {
  return tier ? TIER_COLORS[tier]?.pin : undefined
}

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
// Stratégie : ESRI raster très désaturé (hillshade/texture) + fills vector atlas
// sur palette : bleu glacier / blanc sable / vert sauge / frontières fantôme
function customizeStyle(map: maplibregl.Map) {
  // ── ESRI World Physical en fond — relief ombré, quasi greyscale
  map.addSource('esri-physical', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: '© Esri'
  })
  const firstLayerId = map.getStyle().layers[0]?.id
  map.addLayer({
    id: 'esri-physical-raster',
    type: 'raster',
    source: 'esri-physical',
    paint: {
      'raster-opacity': 0.32,        // texture relief uniquement — couleur via fills vector
      'raster-saturation': -0.80,    // quasi greyscale → la couleur vient du vector
      'raster-contrast': 0.22,
      'raster-brightness-max': 0.88,
    }
  }, firstLayerId)

  // ── Layers MapTiler vector : palette atlas premium
  for (const layer of map.getStyle().layers) {
    const { id, type } = layer
    const lid = id.toLowerCase()

    // ── Hillshade → masqué (ESRI fournit)
    if (type === 'hillshade') {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Background → fond terre blanc cassé sable
    if (type === 'background') {
      map.setPaintProperty(id, 'background-color', '#ede8dc')
      continue
    }

    // ── Fills → palette sélective
    if (type === 'fill') {
      // Eau (océan / lacs) → bleu glacier pâle semi-transparent
      if (/water/.test(lid) && !/waterway|waterfall|land/.test(lid)) {
        map.setPaintProperty(id, 'fill-color', '#b6d4e3')
        map.setPaintProperty(id, 'fill-opacity', 0.58)
        continue
      }
      // Forêt → vert sauge désaturé
      if (/wood|forest|tree/.test(lid)) {
        map.setPaintProperty(id, 'fill-color', '#a8c490')
        map.setPaintProperty(id, 'fill-opacity', 0.28)
        continue
      }
      // Scrub / prairie / parc → vert sauge plus clair
      if (/scrub|grass|meadow|park|green/.test(lid)) {
        map.setPaintProperty(id, 'fill-color', '#b8cc9e')
        map.setPaintProperty(id, 'fill-opacity', 0.22)
        continue
      }
      // Glace / neige → blanc bleuté
      if (/glacier|ice|snow/.test(lid)) {
        map.setPaintProperty(id, 'fill-color', '#e8f2f5')
        map.setPaintProperty(id, 'fill-opacity', 0.65)
        continue
      }
      // Sable / désert → beige chaud
      if (/sand|beach|desert/.test(lid)) {
        map.setPaintProperty(id, 'fill-color', '#e8dfc8')
        map.setPaintProperty(id, 'fill-opacity', 0.40)
        continue
      }
      // Tout le reste (urbain, landuse, bâtiments…) → masqué
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Labels : typographie atlas premium — matching strict sur les noms exacts
    if (type === 'symbol') {
      if (lid === 'country labels') {
        // Pays : uppercase espacé, gris chaud — filtre zoom natif outdoor-v2 conservé
        map.setPaintProperty(id, 'text-color', '#7a7060')
        map.setPaintProperty(id, 'text-halo-color', 'rgba(242,238,228,0.82)')
        map.setPaintProperty(id, 'text-halo-width', 1.8)
        map.setLayoutProperty(id, 'text-font', ['Open Sans Bold'])
        map.setLayoutProperty(id, 'text-transform', 'uppercase')
        map.setLayoutProperty(id, 'text-letter-spacing', 0.18)
        continue
      }
      if (lid === 'ocean labels') {
        map.setPaintProperty(id, 'text-color', 'rgba(130,165,188,0.88)')
        map.setPaintProperty(id, 'text-halo-color', 'rgba(180,215,235,0.20)')
        map.setPaintProperty(id, 'text-halo-width', 1.2)
        map.setLayoutProperty(id, 'text-font', ['Open Sans Italic'])
        map.setLayoutProperty(id, 'text-letter-spacing', 0.22)
        continue
      }
      if (lid === 'sea labels') {
        map.setPaintProperty(id, 'text-color', 'rgba(130,165,188,0.72)')
        map.setPaintProperty(id, 'text-halo-color', 'rgba(180,215,235,0.16)')
        map.setPaintProperty(id, 'text-halo-width', 1.0)
        map.setLayoutProperty(id, 'text-font', ['Open Sans Italic'])
        map.setLayoutProperty(id, 'text-letter-spacing', 0.18)
        continue
      }
      // Tout le reste (régions, villes, oblasts…) → masqué
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Routes, transport, infra → masqués
    if (/road|tunnel|bridge|transit|rail|aeroway|building|poi|ferry|indoor|path|track|gate|aerodrome|runway|taxiway|pier|dam|parking|steps|pedestrian|cycleway|footway/.test(lid)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Contours / graticule → masqués
    if (/contour|graticule|grid|tropic|equator|arctic|antarctic|polar|meridian|parallel/.test(lid)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Rivières / côtes → masqués (ESRI les montre)
    if (type === 'line' && /waterway|river|canal|stream|coast/.test(lid)) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Halos admin / frontières disputées → masqués
    if (type === 'line' && /boundary|admin|border/.test(lid) && (/-bg$/.test(lid) || /disputed|claim/.test(lid))) {
      map.setLayoutProperty(id, 'visibility', 'none')
      continue
    }

    // ── Frontières → fantôme atlas (gris chaud très léger)
    if (type === 'line' && /boundary|admin|border/.test(lid)) {
      map.setPaintProperty(id, 'line-color', 'rgba(168,152,128,0.16)')
      map.setPaintProperty(id, 'line-width', 0.45)
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
  const color = getTierColor(d.tier)
  if (!color) return
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
  const color = getTierColor(d.tier)
  if (!d.stops?.length || !color) return
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
  const validStops = d.stops.filter(s => s.name.trim() && Number.isFinite(s.lat) && Number.isFinite(s.lng))
  const stageStops   = validStops.filter(s => (s.type ?? 'stage') === 'stage')
  const passageStops = validStops.filter(s => s.type === 'passage')

  const toFeatures = (stops: typeof validStops) => stops.map(s => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
    properties: { name: s.name, type: s.type ?? 'stage' },
  }))

  map.addSource(`${sid}_pts_stage`, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: toFeatures(stageStops) },
  })
  map.addLayer({
    id: `${sid}_dots_stage`, type: 'circle', source: `${sid}_pts_stage`,
    paint: {
      'circle-radius': 3.2, 'circle-color': color,
      'circle-stroke-width': 1, 'circle-stroke-color': 'white',
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 6, 0.9] as maplibregl.ExpressionSpecification,
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 6, 1] as maplibregl.ExpressionSpecification,
    },
  })
  if (passageStops.length) {
    map.addSource(`${sid}_pts_passage`, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: toFeatures(passageStops) },
    })
    map.addLayer({
      id: `${sid}_dots_passage`, type: 'circle', source: `${sid}_pts_passage`,
      paint: {
        'circle-radius': 2.2, 'circle-color': '#ffffff',
        'circle-stroke-width': 1.2, 'circle-stroke-color': color,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.9] as maplibregl.ExpressionSpecification,
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.85] as maplibregl.ExpressionSpecification,
      },
    })
  }
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
    const pinScale = pinScaleFromZoomK(k)

    pinsGroupRef.current.querySelectorAll<SVGGElement>('g.pin-root').forEach(el => {
      const lng = parseFloat(el.dataset.lng ?? '0')
      const lat = parseFloat(el.dataset.lat ?? '0')
      if (!isFinite(lng) || !isFinite(lat)) return
      const { x, y } = map.project([lng, lat] as maplibregl.LngLatLike)
      el.setAttribute('transform', `translate(${x},${y}) scale(${pinScale})`)
    })

    pinsGroupRef.current.querySelectorAll<SVGGElement>('g.stop-root').forEach(el => {
      const lng = parseFloat(el.dataset.lng ?? '0')
      const lat = parseFloat(el.dataset.lat ?? '0')
      if (!isFinite(lng) || !isFinite(lat)) return
      const { x, y } = map.project([lng, lat] as maplibregl.LngLatLike)
      el.setAttribute('transform', `translate(${x},${y})`)
    })

    pinsGroupRef.current.querySelectorAll<SVGGElement>('g.route-stop-root').forEach(el => {
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

  const zoomToZone = (d: Destination) => {
    const map = mapRef.current
    if (!map) return
    let bounds: [[number, number], [number, number]] | null = null
    if (d.extent) {
      const [w, s, e, n] = d.extent
      bounds = [[w, s], [e, n]]
    } else if (d.stops?.length) {
      const valid = d.stops.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      if (valid.length) {
        const lngs = valid.map(s => s.lng), lats = valid.map(s => s.lat)
        bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
      }
    }
    if (!bounds) return
    map.fitBounds(bounds, { padding: 80, maxZoom: 7, duration: 800 })
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
                {friendOnly.flatMap(d => (
                  d.kind === 'zone' && d.stops?.length && getTierColor(d.tier)
                    ? d.stops.map((stop, index) => (
                      <RouteStop
                        key={`friend-stop:${d.name}:${stop.name}:${index}`}
                        stop={stop}
                        parentName={d.name}
                        projection={projFnRef.current}
                        color={getTierColor(d.tier)!}
                        owner="friend"
                        zoomK={zoomK}
                        onSelect={onSelect}
                      />
                    ))
                    : []
                ))}
                {destinations.flatMap(d => (
                  d.kind === 'zone' && d.stops?.length && getTierColor(d.tier)
                    ? d.stops.map((stop, index) => (
                      <RouteStop
                        key={`stop:${d.name}:${stop.name}:${index}`}
                        stop={stop}
                        parentName={d.name}
                        projection={projFnRef.current}
                        color={getTierColor(d.tier)!}
                        owner="me"
                        zoomK={zoomK}
                        onSelect={onSelect}
                      />
                    ))
                    : []
                ))}
                {friendOnly.map(d => (
                  <Pin key={`friend:${d.name}`} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={false} onSelect={onSelect} onZoomToZone={zoomToZone}
                    owner="friend" badge={friendInitials} />
                ))}
                {destinations.map(d => (
                  <Pin key={d.name} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={d.name === selectedName} onSelect={onSelect} onZoomToZone={zoomToZone}
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
  onZoomToZone?: (d: Destination) => void
  owner?: 'me' | 'friend'
  badge?: string
  shared?: boolean
}

interface RouteStopProps {
  stop: RoadTripStop
  parentName: string
  projection: Proj
  color: string
  owner: 'me' | 'friend'
  zoomK: number
  onSelect: (name: string) => void
}

const RouteStop = memo(function RouteStop({
  stop, parentName, projection, color, owner, zoomK, onSelect,
}: RouteStopProps) {
  if (!stop.name.trim() || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return null
  const projected = projection([stop.lng, stop.lat])
  if (!projected) return null
  const [cx, cy] = projected
  const isPassage = stop.type === 'passage'

  return (
    <g
      className={`route-stop-root route-stop-root--${owner}${isPassage ? ' route-stop-root--passage' : ''}`}
      data-lng={stop.lng}
      data-lat={stop.lat}
      transform={`translate(${cx},${cy})`}
      style={{ '--pin-color': color } as CSSProperties}
      onClick={() => onSelect(parentName)}
    >
      <title>{stop.name}{isPassage ? ' (passage)' : ''}</title>
      <circle className="route-stop-hit" r={15} />
      {isPassage ? (
        <circle className="route-stop-dot route-stop-dot--passage" r={3.5} />
      ) : (
        <>
          <circle className="route-stop-dot" r={5.5} />
          <circle className="route-stop-core" r={2.5} />
          {zoomK >= 5 && <text className="route-stop-label" x={9} y={4}>{stop.name}</text>}
        </>
      )}
    </g>
  )
})

const Pin = memo(function Pin({
  destination, projection, zoomK, selected, onSelect, onZoomToZone, owner = 'me', badge, shared,
}: PinProps) {
  const projected = projection([destination.lng, destination.lat])
  if (!projected) return null
  const [cx, cy] = projected
  const pinScale = pinScaleFromZoomK(zoomK)
  const isCompact = zoomK < 2

  // ── Stop (road trip waypoint) ──────────────────────────────────────────────
  if (destination.kind === 'stop') {
    return (
      <g className="stop-root" data-lng={destination.lng} data-lat={destination.lat}
         transform={`translate(${cx},${cy})`}
         style={{ cursor: 'pointer' }}
         onClick={() => onSelect(destination.name)}>
        <circle r={16} fill="transparent" />
        <circle r={6.5}
          fill={owner === 'friend' ? '#fff' : '#8b9db5'}
          stroke={owner === 'friend' ? '#7C8DB5' : 'white'}
          strokeWidth={owner === 'friend' ? 1.8 : 1.4}
          opacity={0.85}
          pointerEvents="none" />
      </g>
    )
  }

  const color = getTierColor(destination.tier)
  if (!color) return null
  const score = (destination.score ?? (destination.food + destination.night + destination.culture + destination.nature + destination.value) / 5)
    .toFixed(1).replace('.', ',')

  // ── Zone label ─────────────────────────────────────────────────────────────
  if (destination.kind === 'zone') {
    const stopCount = destination.stops?.filter(stop => (
      stop.name.trim() && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
    )).length ?? 0

    return (
      <g className={`pin-root pin-owner-${owner}${selected ? ' pin-selected' : ''}`}
         data-lng={destination.lng} data-lat={destination.lat}
         transform={`translate(${cx},${cy}) scale(${pinScale})`}>
        <foreignObject className="pin-foreign-object pin-foreign-object--route" x="-118" y="-58" width="236" height="78">
          <div className="pin-stage pin-stage--route">
            <button
              className={`map-pin-route-card${owner === 'friend' ? ' map-pin--friend' : ''}`}
              onClick={() => { onSelect(destination.name); onZoomToZone?.(destination) }}
              style={{ '--pin-color': color } as CSSProperties}>
              <span className="route-tier">{destination.tier}</span>
              <span className="route-copy">
                <strong>{destination.name}</strong>
                <small>{stopCount > 0 ? `${stopCount} lieu${stopCount > 1 ? 'x' : ''}` : 'Zone'}</small>
              </span>
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
       transform={`translate(${cx},${cy}) scale(${pinScale})`}>
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
