import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Destination, RoadTripStop, Tier } from '../types'
import { TIER_COLORS } from '../data'
import { destinationNameKey } from '../utils/destinationIdentity'
import { haversineMeters } from '../utils/duplicates'

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
  onDeselect?: () => void
  onFlyTargetConsumed: () => void
  friendDestinations?: Destination[]
  friendInitials?: string
  sharedNames?: Set<string>
  hidden?: boolean
}

const ATLAS_PREMIUM_PALETTE = {
  sea: '#c9e3ee',
  land: '#f2eee4',
  sand: '#e8ddc8',
  sage: '#aebf9a',
  sageSoft: '#c2ceb2',
  ice: '#eef6f7',
  relief: '#d3c8b6',
  labelCountry: '#766f64',
  labelOcean: '#7fa6bf',
  labelHalo: 'rgba(246, 242, 232, 0.88)',
  border: 'rgba(145, 131, 110, 0.18)',
  borderSoft: 'rgba(145, 131, 110, 0.10)',
  coast: 'rgba(172, 207, 220, 0.42)',
}

const ATLAS_COUNTRY_LABELS: GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; priority: number }> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'CANADA', priority: 1 }, geometry: { type: 'Point', coordinates: [-103, 58] } },
    { type: 'Feature', properties: { name: 'UNITED STATES', priority: 1 }, geometry: { type: 'Point', coordinates: [-98, 39] } },
    { type: 'Feature', properties: { name: 'MEXICO', priority: 2 }, geometry: { type: 'Point', coordinates: [-102, 23] } },
    { type: 'Feature', properties: { name: 'BRAZIL', priority: 1 }, geometry: { type: 'Point', coordinates: [-52, -11] } },
    { type: 'Feature', properties: { name: 'ARGENTINA', priority: 2 }, geometry: { type: 'Point', coordinates: [-64, -35] } },
    { type: 'Feature', properties: { name: 'UNITED KINGDOM', priority: 2 }, geometry: { type: 'Point', coordinates: [-2, 54] } },
    { type: 'Feature', properties: { name: 'FRANCE', priority: 1 }, geometry: { type: 'Point', coordinates: [2, 46] } },
    { type: 'Feature', properties: { name: 'SPAIN', priority: 2 }, geometry: { type: 'Point', coordinates: [-3.5, 40] } },
    { type: 'Feature', properties: { name: 'GERMANY', priority: 1 }, geometry: { type: 'Point', coordinates: [10, 51] } },
    { type: 'Feature', properties: { name: 'ITALY', priority: 2 }, geometry: { type: 'Point', coordinates: [12, 43] } },
    { type: 'Feature', properties: { name: 'POLAND', priority: 2 }, geometry: { type: 'Point', coordinates: [19, 52] } },
    { type: 'Feature', properties: { name: 'UKRAINE', priority: 2 }, geometry: { type: 'Point', coordinates: [31, 49] } },
    { type: 'Feature', properties: { name: 'TURKEY', priority: 2 }, geometry: { type: 'Point', coordinates: [35, 39] } },
    { type: 'Feature', properties: { name: 'RUSSIA', priority: 1 }, geometry: { type: 'Point', coordinates: [80, 60] } },
    { type: 'Feature', properties: { name: 'MOROCCO', priority: 2 }, geometry: { type: 'Point', coordinates: [-6, 31] } },
    { type: 'Feature', properties: { name: 'ALGERIA', priority: 1 }, geometry: { type: 'Point', coordinates: [2, 28] } },
    { type: 'Feature', properties: { name: 'MAURITANIA', priority: 2 }, geometry: { type: 'Point', coordinates: [-10, 20] } },
    { type: 'Feature', properties: { name: 'LIBYA', priority: 2 }, geometry: { type: 'Point', coordinates: [18, 27] } },
    { type: 'Feature', properties: { name: 'EGYPT', priority: 2 }, geometry: { type: 'Point', coordinates: [30, 27] } },
    { type: 'Feature', properties: { name: 'MALI', priority: 3 }, geometry: { type: 'Point', coordinates: [-4, 17] } },
    { type: 'Feature', properties: { name: 'NIGER', priority: 3 }, geometry: { type: 'Point', coordinates: [9, 17] } },
    { type: 'Feature', properties: { name: 'CHAD', priority: 3 }, geometry: { type: 'Point', coordinates: [19, 15] } },
    { type: 'Feature', properties: { name: 'SUDAN', priority: 2 }, geometry: { type: 'Point', coordinates: [30, 15] } },
    { type: 'Feature', properties: { name: 'ETHIOPIA', priority: 3 }, geometry: { type: 'Point', coordinates: [40, 9] } },
    { type: 'Feature', properties: { name: 'SOUTH AFRICA', priority: 2 }, geometry: { type: 'Point', coordinates: [24, -29] } },
    { type: 'Feature', properties: { name: 'SAUDI ARABIA', priority: 2 }, geometry: { type: 'Point', coordinates: [45, 24] } },
    { type: 'Feature', properties: { name: 'IRAN', priority: 2 }, geometry: { type: 'Point', coordinates: [53, 32] } },
    { type: 'Feature', properties: { name: 'INDIA', priority: 1 }, geometry: { type: 'Point', coordinates: [78, 22] } },
    { type: 'Feature', properties: { name: 'CHINA', priority: 1 }, geometry: { type: 'Point', coordinates: [104, 35] } },
    { type: 'Feature', properties: { name: 'JAPAN', priority: 2 }, geometry: { type: 'Point', coordinates: [138, 38] } },
    { type: 'Feature', properties: { name: 'AUSTRALIA', priority: 1 }, geometry: { type: 'Point', coordinates: [134, -25] } },
  ],
}

function safeSetPaint(map: maplibregl.Map, layerId: string, property: string, value: unknown) {
  try { map.setPaintProperty(layerId, property, value) } catch { /* layer/property not supported in this style */ }
}

function safeSetLayout(map: maplibregl.Map, layerId: string, property: string, value: unknown) {
  try { map.setLayoutProperty(layerId, property, value) } catch { /* layer/property not supported in this style */ }
}

function safeSetFilter(map: maplibregl.Map, layerId: string, filter: unknown) {
  try { map.setFilter(layerId, filter as maplibregl.FilterSpecification) } catch { /* tile schemas may vary */ }
}

function safeSetLayerZoomRange(map: maplibregl.Map, layerId: string, minzoom: number, maxzoom: number) {
  try { map.setLayerZoomRange(layerId, minzoom, maxzoom) } catch { /* layer may not support zoom range updates */ }
}

function hideLayer(map: maplibregl.Map, layerId: string) {
  safeSetLayout(map, layerId, 'visibility', 'none')
}

function addAtlasCountryLabels(map: maplibregl.Map) {
  if (map.getSource('atlas-country-labels')) return

  map.addSource('atlas-country-labels', {
    type: 'geojson',
    data: ATLAS_COUNTRY_LABELS,
  })

  map.addLayer({
    id: 'atlas-country-labels',
    type: 'symbol',
    source: 'atlas-country-labels',
    minzoom: 0,
    maxzoom: 8,
    layout: {
      'symbol-sort-key': ['get', 'priority'],
      'text-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-font': ['Roboto Bold', 'Noto Sans Bold'],
      'text-ignore-placement': false,
      'text-letter-spacing': 0.16,
      'text-max-width': 8,
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        0, 9.5,
        2, 11.5,
        4, 13.5,
        7, 15,
      ],
    },
    paint: {
      'text-color': ATLAS_PREMIUM_PALETTE.labelCountry,
      'text-halo-blur': 0.35,
      'text-halo-color': ATLAS_PREMIUM_PALETTE.labelHalo,
      'text-halo-width': 1.5,
      'text-opacity': [
        'interpolate', ['linear'], ['zoom'],
        0, 0.62,
        2, 0.86,
        7, 0.78,
      ],
    },
  })
}

function customizeAtlasPremiumStyle(map: maplibregl.Map) {
  const palette = ATLAS_PREMIUM_PALETTE

  for (const layer of map.getStyle().layers) {
    const { id, type } = layer
    const lid = id.toLowerCase()

    if (type === 'hillshade') {
      safeSetPaint(map, id, 'hillshade-shadow-color', palette.relief)
      safeSetPaint(map, id, 'hillshade-highlight-color', '#fffaf0')
      safeSetPaint(map, id, 'hillshade-accent-color', '#c6bba8')
      safeSetPaint(map, id, 'hillshade-exaggeration', ['interpolate', ['linear'], ['zoom'], 0, 0.22, 4, 0.16, 8, 0.10])
      continue
    }

    if (type === 'background') {
      safeSetPaint(map, id, 'background-color', palette.land)
      continue
    }

    if (type === 'fill') {
      if (/water/.test(lid) && !/waterway|waterfall|land/.test(lid)) {
        safeSetPaint(map, id, 'fill-color', palette.sea)
        safeSetPaint(map, id, 'fill-opacity', 0.82)
        continue
      }

      if (/wood|forest|tree/.test(lid)) {
        safeSetPaint(map, id, 'fill-color', palette.sage)
        safeSetPaint(map, id, 'fill-opacity', 0.14)
        continue
      }

      if (/scrub|grass|meadow|park|green/.test(lid)) {
        safeSetPaint(map, id, 'fill-color', palette.sageSoft)
        safeSetPaint(map, id, 'fill-opacity', 0.1)
        continue
      }

      if (/glacier|ice|snow/.test(lid)) {
        safeSetPaint(map, id, 'fill-color', palette.ice)
        safeSetPaint(map, id, 'fill-opacity', 0.74)
        continue
      }

      if (/sand|beach|desert/.test(lid)) {
        safeSetPaint(map, id, 'fill-color', palette.sand)
        safeSetPaint(map, id, 'fill-opacity', 0.34)
        continue
      }

      if (/landcover|landuse|earth|land|country|admin/.test(lid) && !/label|boundary|border/.test(lid)) {
        safeSetPaint(map, id, 'fill-color', palette.land)
        safeSetPaint(map, id, 'fill-opacity', 0.68)
        continue
      }

      hideLayer(map, id)
      continue
    }

    if (type === 'symbol') {
      if (/country/.test(lid) && /label/.test(lid)) {
        hideLayer(map, id)
        continue
      }

      if (/ocean/.test(lid) && /label/.test(lid)) {
        safeSetLayout(map, id, 'visibility', 'visible')
        safeSetLayerZoomRange(map, id, 0, 24)
        safeSetPaint(map, id, 'text-color', palette.labelOcean)
        safeSetPaint(map, id, 'text-opacity', 0.72)
        safeSetPaint(map, id, 'text-halo-color', 'rgba(220, 239, 246, 0.42)')
        safeSetPaint(map, id, 'text-halo-width', 1.1)
        safeSetPaint(map, id, 'text-halo-blur', 0.25)
        safeSetLayout(map, id, 'text-font', ['Open Sans Italic'])
        safeSetLayout(map, id, 'text-letter-spacing', 0.18)
        safeSetLayout(map, id, 'text-size', ['interpolate', ['linear'], ['zoom'], 0, 12, 3, 15, 6, 17])
        continue
      }

      if (/sea/.test(lid) && /label/.test(lid)) {
        safeSetLayout(map, id, 'visibility', 'visible')
        safeSetLayerZoomRange(map, id, 0, 24)
        safeSetPaint(map, id, 'text-color', palette.labelOcean)
        safeSetPaint(map, id, 'text-opacity', 0.5)
        safeSetPaint(map, id, 'text-halo-color', 'rgba(220, 239, 246, 0.30)')
        safeSetPaint(map, id, 'text-halo-width', 0.8)
        safeSetLayout(map, id, 'text-font', ['Open Sans Italic'])
        safeSetLayout(map, id, 'text-letter-spacing', 0.14)
        continue
      }

      hideLayer(map, id)
      continue
    }

    if (/road|tunnel|bridge|transit|rail|aeroway|building|poi|ferry|indoor|path|track|gate|aerodrome|runway|taxiway|pier|dam|parking|steps|pedestrian|cycleway|footway/.test(lid)) {
      hideLayer(map, id)
      continue
    }

    if (/contour|graticule|grid|tropic|equator|arctic|antarctic|polar|meridian|parallel/.test(lid)) {
      hideLayer(map, id)
      continue
    }

    if (type === 'line' && /coast|shore|water/.test(lid)) {
      safeSetPaint(map, id, 'line-color', palette.coast)
      safeSetPaint(map, id, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 0, 0.16, 3, 0.32, 7, 0.22])
      safeSetPaint(map, id, 'line-width', ['interpolate', ['linear'], ['zoom'], 0, 0.6, 4, 1.9, 8, 3.2])
      safeSetPaint(map, id, 'line-blur', 1.7)
      continue
    }

    if (type === 'line' && /river|canal|stream/.test(lid)) {
      safeSetPaint(map, id, 'line-color', 'rgba(137, 184, 204, 0.18)')
      safeSetPaint(map, id, 'line-width', 0.35)
      safeSetPaint(map, id, 'line-opacity', 0.32)
      safeSetPaint(map, id, 'line-blur', 0.4)
      continue
    }

    if (type === 'line' && /boundary|admin|border/.test(lid) && (/-bg$/.test(lid) || /disputed|claim/.test(lid))) {
      hideLayer(map, id)
      continue
    }

    if (type === 'line' && /boundary|admin|border/.test(lid)) {
      safeSetPaint(map, id, 'line-color', palette.border)
      safeSetPaint(map, id, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 0, 0.2, 4, 0.28, 7, 0.18])
      safeSetPaint(map, id, 'line-width', ['interpolate', ['linear'], ['zoom'], 0, 0.25, 4, 0.38, 8, 0.55])
      safeSetPaint(map, id, 'line-blur', 0.25)
      continue
    }

    if (type === 'line') {
      safeSetPaint(map, id, 'line-color', palette.borderSoft)
      safeSetPaint(map, id, 'line-width', 0.25)
      safeSetPaint(map, id, 'line-opacity', 0.16)
    }
  }

  addAtlasCountryLabels(map)
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
  if (!style?.layers || !style.sources) return
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
  if (!map.isStyleLoaded()) return
  const color = getTierColor(d.tier)
  if (!color) return
  const sid = `_z_${owner}_${d.name}`

  let geometry: GeoJSON.Geometry | null = null
  if (d.geojson) {
    geometry = d.geojson
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
  // White glow border for organic feel
  map.addLayer({
    id: `${sid}_line_glow`, type: 'line', source: sid,
    paint: {
      'line-color': '#ffffff',
      'line-width': owner === 'friend' ? 5 : 4,
      'line-opacity': owner === 'friend' ? 0.55 : 0.45,
      'line-blur': 2,
    },
  })
  // Colored border on top
  map.addLayer({
    id: `${sid}_line`, type: 'line', source: sid,
    paint: {
      'line-color': owner === 'friend' ? '#7C8DB5' : color,
      'line-width': owner === 'friend' ? 1.8 : 1.4,
      'line-opacity': owner === 'friend' ? 0.75 : 0.55,
    },
  })
}

// Route line + stops are rendered by SVG overlay (RoutePath + RouteStop) — no MapLibre layer needed.

function syncZoneRouteLayers(
  map: maplibregl.Map,
  destinations: Destination[],
  friendDestinations?: Destination[],
  sharedNames?: Set<string>,
) {
  clearZoneRouteLayers(map)
  const shared = sharedNames ?? new Set<string>()
  for (const d of destinations) {
    if (d.kind === 'zone') {
      addZoneLayer(map, d, 'me')
    }
  }
  if (friendDestinations) {
    for (const d of friendDestinations) {
      if (d.kind === 'zone' && !shared.has(destinationNameKey(d))) addZoneLayer(map, d, 'friend')
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorldMap({
  destinations, flyTarget, selectedName, onSelect, onDeselect, onFlyTargetConsumed,
  friendDestinations, friendInitials, sharedNames, hidden,
}: WorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const svgRef          = useRef<SVGSVGElement>(null)
  const pinsGroupRef    = useRef<SVGGElement>(null)
  const projFnRef       = useRef<Proj>(() => null)

  const [mapReady, setMapReady] = useState(false)
  const [zoomK, setZoomK]       = useState(1)
  const [expandedRouteKey, setExpandedRouteKey] = useState<string | null>(null)

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
      customizeAtlasPremiumStyle(map)
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

  // ── Resize MapLibre quand la map redevient visible ─────────────────────────
  useEffect(() => {
    if (hidden || !mapReady || !mapRef.current) return
    mapRef.current.resize()
    updatePins(mapRef.current)
  }, [hidden, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clic sur le fond de carte → désélectionne ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const handler = () => {
      setExpandedRouteKey(null)
      onDeselect?.()
    }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [mapReady, onDeselect])

  // ── Sync zones / routes quand destinations change ───────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    try {
      syncZoneRouteLayers(mapRef.current, destinations, friendDestinations, sharedNames)
    } catch {
      // style not yet ready — will re-run when mapReady changes
    }
  }, [mapReady, destinations, friendDestinations, sharedNames])

  // ── Repositionner les pins au chargement et aux changements ─────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    updatePins(mapRef.current)
  }, [mapReady, destinations, friendDestinations, expandedRouteKey, selectedName])

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

    // Re-build route paths every map move — geodesic samples + fresh projection.
    const project: Proj = ([lng, lat]) => {
      const { x, y } = map.project([lng, lat] as maplibregl.LngLatLike)
      return [x, y]
    }
    pinsGroupRef.current.querySelectorAll<SVGGElement>('g.route-path-root').forEach(group => {
      const raw = group.dataset.stops
      if (!raw) {
        group.querySelectorAll<SVGPathElement>('path').forEach(p => p.setAttribute('d', ''))
        return
      }
      const stops: { lng: number; lat: number }[] = []
      for (const pair of raw.split(';')) {
        const [lngStr, latStr] = pair.split(',')
        const lng = parseFloat(lngStr)
        const lat = parseFloat(latStr)
        if (isFinite(lng) && isFinite(lat)) stops.push({ lng, lat })
      }
      const d = stops.length >= 2 ? buildRoutePath(stops, project) : ''
      group.querySelectorAll<SVGPathElement>('path').forEach(p => p.setAttribute('d', d))
    })
  }

  // ── Fly to destination ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!flyTarget || !mapRef.current || !mapReady) return
    const zoneTarget = [...destinations, ...(friendDestinations ?? [])]
      .find(destination => destination.name === flyTarget.name && destination.kind === 'zone')
    if (zoneTarget) {
      zoomToZone(zoneTarget)
      onFlyTargetConsumed()
      return
    }
    mapRef.current.flyTo({
      center: [flyTarget.lng, flyTarget.lat] as maplibregl.LngLatLike,
      zoom: Math.max(mapRef.current.getZoom(), 4),
      duration: 760,
    })
    onFlyTargetConsumed()
  }, [flyTarget, mapReady, onFlyTargetConsumed, destinations, friendDestinations])

  const zoomBy = (factor: number) => {
    const map = mapRef.current
    if (!map) return
    map.zoomTo(map.getZoom() + Math.log2(factor), { duration: 260 })
  }

  const resetZoom = () => {
    const map = mapRef.current
    if (!map) return

    const visiblePoints = [
      ...destinations,
      ...(friendDestinations ?? []),
      ...destinations.flatMap(destination => destination.stops ?? []),
      ...(friendDestinations ?? []).flatMap(destination => destination.stops ?? []),
    ].filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))

    if (visiblePoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      for (const point of visiblePoints) {
        bounds.extend([point.lng, point.lat])
      }
      map.fitBounds(bounds, { padding: 58, maxZoom: 4.2, duration: 520 })
      return
    }

    if (visiblePoints.length === 1) {
      map.flyTo({ center: [visiblePoints[0].lng, visiblePoints[0].lat], zoom: 4, duration: 520 })
      return
    }

    map.flyTo({ center: INIT_CENTER, zoom: INIT_ZOOM, duration: 400 })
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

  const expandTripRoute = (d: Destination, owner: 'me' | 'friend') => {
    setExpandedRouteKey(`${owner}:${d.name}`)
    onSelect(d.name)
    zoomToZone(d)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section
      className="map-area"
      aria-label="Carte des destinations"
      draggable={false}
      onDragStartCapture={(event) => event.preventDefault()}
    >
      <div ref={mapContainerRef} className="map-gl-container" draggable={false} />

      <svg ref={svgRef} className="map-pins-overlay" aria-label="Pins des destinations">
        <g ref={pinsGroupRef}>
          {mapReady && (() => {
            const shared   = sharedNames ?? new Set<string>()
            const friendOnly = friendDestinations
              ? friendDestinations.filter(d => !shared.has(destinationNameKey(d)))
              : []

            // Index of standalone destinations (place/stage) — used to detect
            // when a roadtrip stop sits at the same location as one of them.
            const placeDests = destinations.filter(d => d.kind !== 'zone' && d.kind !== 'stop')
            const overlapsByDest: Record<string, PinTripBadge[]> = {}
            const skipStops = new Set<string>() // `${tripName}|${stopIndex}`

            for (const trip of destinations) {
              if (trip.kind !== 'zone' || !trip.stops?.length) continue
              const tripColor = getTierColor(trip.tier) ?? '#1B5FE8'
              let stageCounter = 0
              trip.stops.forEach((stop, index) => {
                const stageNumber = ++stageCounter
                if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return
                const match = placeDests.find(p => haversineMeters(p, stop) <= 50)
                if (match) {
                  ;(overlapsByDest[match.name] ||= []).push({
                    tripName: trip.name,
                    color: tripColor,
                    stageNumber,
                  })
                  skipStops.add(`${trip.name}|${index}`)
                }
              })
            }

            const renderRouteGroup = (d: Destination, owner: 'me' | 'friend') => {
              const color = getTierColor(d.tier)
              if (!d.stops?.length || !color) return [] as JSX.Element[]
              if (expandedRouteKey !== `${owner}:${d.name}` && selectedName !== d.name) return [] as JSX.Element[]
              const stopEls = d.stops.map((stop, index) => {
                // Stop fusionné avec une destination solo → masqué au profit du pin photo
                if (owner === 'me' && skipStops.has(`${d.name}|${index}`)) return null
                return (
                  <RouteStop
                    key={`${owner}-stop:${d.name}:${stop.name}:${index}`}
                    stop={stop}
                    parentName={d.name}
                    projection={projFnRef.current}
                    color={color}
                    owner={owner}
                    onSelect={onSelect}
                  />
                )
              })
              return [
                <RoutePath
                  key={`${owner}-path:${d.name}`}
                  stops={d.stops}
                  projection={projFnRef.current}
                  color={color}
                  owner={owner}
                />,
                ...stopEls.filter((el): el is JSX.Element => el !== null),
              ]
            }

            return (
              <>
                {friendOnly.flatMap(d => d.kind === 'zone' ? renderRouteGroup(d, 'friend') : [])}
                {destinations.flatMap(d => d.kind === 'zone' ? renderRouteGroup(d, 'me') : [])}
                {friendOnly.filter(d => d.kind !== 'zone').map(d => (
                  <Pin key={`friend:${d.name}`} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={expandedRouteKey === `friend:${d.name}`} onSelect={onSelect} onZoomToZone={zoomToZone} onExpandTrip={expandTripRoute}
                    owner="friend" badge={friendInitials} />
                ))}
                {destinations.filter(d => d.kind !== 'zone').map(d => (
                  <Pin key={d.name} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={d.name === selectedName || expandedRouteKey === `me:${d.name}`} onSelect={onSelect} onZoomToZone={zoomToZone} onExpandTrip={expandTripRoute}
                    owner="me" shared={shared.has(destinationNameKey(d))}
                    tripBadges={overlapsByDest[d.name]} />
                ))}
                {friendOnly.filter(d => d.kind === 'zone').map(d => (
                  <Pin key={`friend:${d.name}`} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={expandedRouteKey === `friend:${d.name}`} onSelect={onSelect} onZoomToZone={zoomToZone} onExpandTrip={expandTripRoute}
                    owner="friend" badge={friendInitials} />
                ))}
                {destinations.filter(d => d.kind === 'zone').map(d => (
                  <Pin key={d.name} destination={d} projection={projFnRef.current}
                    zoomK={zoomK} selected={d.name === selectedName || expandedRouteKey === `me:${d.name}`} onSelect={onSelect} onZoomToZone={zoomToZone} onExpandTrip={expandTripRoute}
                    owner="me" shared={shared.has(destinationNameKey(d))}
                    tripBadges={overlapsByDest[d.name]} />
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
export interface PinTripBadge {
  tripName: string
  color: string
  stageNumber?: number
}

interface PinProps {
  destination: Destination
  projection: Proj
  zoomK: number
  selected: boolean
  onSelect: (name: string) => void
  onZoomToZone?: (d: Destination) => void
  onExpandTrip?: (d: Destination, owner: 'me' | 'friend') => void
  owner?: 'me' | 'friend'
  badge?: string
  shared?: boolean
  tripBadges?: PinTripBadge[]
}

interface RouteStopProps {
  stop: RoadTripStop
  parentName: string
  projection: Proj
  color: string
  owner: 'me' | 'friend'
  onSelect: (name: string) => void
}

const RouteStop = memo(function RouteStop({
  stop, parentName, projection, color, owner, onSelect,
}: RouteStopProps) {
  if (!stop.name.trim() || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return null
  const projected = projection([stop.lng, stop.lat])
  if (!projected) return null
  const [cx, cy] = projected

  return (
    <g
      className={`route-stop-root route-stop-root--${owner}`}
      data-lng={stop.lng}
      data-lat={stop.lat}
      transform={`translate(${cx},${cy})`}
      style={{ '--pin-color': color } as CSSProperties}
      onClick={() => onSelect(parentName)}
    >
      <title>{stop.name}</title>
      <circle className="route-stop-hit" r={16} />
      <circle className="route-stop-dot" r={4} />
      <foreignObject className="route-stop-label-object" x="-64" y="-34" width="128" height="28" overflow="visible">
        <div className="route-stop-label-pill">{stop.name}</div>
      </foreignObject>
    </g>
  )
})

// ── Route polyline ───────────────────────────────────────────────────────────
interface RoutePathProps {
  stops: RoadTripStop[]
  projection: Proj
  color: string
  owner: 'me' | 'friend'
}

/**
 * Sample N intermediate points along the great circle between two lng/lat coords.
 * Returns [a, ..., b] (inclusive). Used so long segments curve along Earth's surface
 * instead of cutting straight through unrelated geography on a Mercator map.
 */
function greatCircleSamples(a: [number, number], b: [number, number], segments = 24): [number, number][] {
  const toRad = (d: number) => d * Math.PI / 180
  const toDeg = (r: number) => r * 180 / Math.PI
  const lon1 = toRad(a[0]), lat1 = toRad(a[1])
  const lon2 = toRad(b[0]), lat2 = toRad(b[1])
  const haver = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  const d = 2 * Math.atan2(Math.sqrt(haver), Math.sqrt(1 - haver))
  if (d < 1e-9) return [a, b]
  const out: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const f = i / segments
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    const latI = Math.atan2(z, Math.sqrt(x * x + y * y))
    const lonI = Math.atan2(y, x)
    out.push([toDeg(lonI), toDeg(latI)])
  }
  return out
}

/**
 * Build the screen-space path for a sequence of geographic stops.
 * Each consecutive pair is interpolated along the great circle (so the rendered
 * curve follows Earth, not a Mercator straight line) and the resulting screen
 * points are connected with a cubic-smooth polyline.
 */
function buildRoutePath(stops: { lng: number; lat: number }[], project: (ll: [number, number]) => [number, number] | null): string {
  if (stops.length < 2) return ''
  const allScreen: [number, number][] = []
  for (let i = 0; i < stops.length - 1; i++) {
    const a: [number, number] = [stops[i].lng, stops[i].lat]
    const b: [number, number] = [stops[i + 1].lng, stops[i + 1].lat]
    const dLng = Math.abs(b[0] - a[0]); const dLat = Math.abs(b[1] - a[1])
    const rough = Math.hypot(dLng, dLat)
    const segs = Math.max(8, Math.min(64, Math.round(rough * 1.5)))
    const samples = greatCircleSamples(a, b, segs)

    // Project this segment's samples
    const projected: [number, number][] = []
    for (const s of samples) {
      const p = project(s)
      if (p) projected.push(p)
    }
    if (projected.length < 2) continue

    // Gentle perpendicular arc that bows northward (negative SVG-y) for organic feel
    const pA = projected[0], pB = projected[projected.length - 1]
    const cdx = pB[0] - pA[0], cdy = pB[1] - pA[1]
    const clen = Math.hypot(cdx, cdy) || 1
    let nx = -cdy / clen, ny = cdx / clen
    if (ny > 0) { nx = -nx; ny = -ny } // ensure bow goes up (north)
    const arcH = Math.min(clen * 0.1, 55)

    for (let k = (i === 0 ? 0 : 1); k < projected.length; k++) {
      const t = k / (projected.length - 1)
      const bow = Math.sin(t * Math.PI) * arcH
      allScreen.push([projected[k][0] + nx * bow, projected[k][1] + ny * bow])
    }
  }
  if (allScreen.length < 2) return ''
  // Catmull-Rom → cubic bezier
  const parts: string[] = [`M ${allScreen[0][0].toFixed(1)} ${allScreen[0][1].toFixed(1)}`]
  for (let i = 1; i < allScreen.length; i++) {
    const p0 = allScreen[Math.max(0, i - 2)]
    const p1 = allScreen[i - 1]
    const p2 = allScreen[i]
    const p3 = allScreen[Math.min(allScreen.length - 1, i + 1)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    parts.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`)
  }
  return parts.join(' ')
}

const RoutePath = memo(function RoutePath({ stops, projection, color, owner }: RoutePathProps) {
  const validStops = stops.filter(s => s.name.trim() && Number.isFinite(s.lat) && Number.isFinite(s.lng))
  if (validStops.length < 2) return null
  const d = buildRoutePath(validStops, projection)
  // Serialize stops as `lng,lat;lng,lat;...` for imperative re-projection on map move.
  const stopsAttr = validStops.map(s => `${s.lng},${s.lat}`).join(';')
  return (
    <g
      className={`route-path-root route-path-root--${owner}`}
      data-stops={stopsAttr}
      style={{ '--pin-color': color } as CSSProperties}
    >
      <path className="route-path-glow" d={d} />
      <path className="route-path-halo" d={d} />
      <path className="route-path" d={d} />
    </g>
  )
})

const Pin = memo(function Pin({
  destination, projection, zoomK, selected, onSelect, onZoomToZone, onExpandTrip, owner = 'me', badge, shared, tripBadges,
}: PinProps) {
  const [tripHovered, setTripHovered] = useState(false)
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

  // ── Zone (road trip / région)
  if (destination.kind === 'zone') {
    const validStops = destination.stops?.filter(s => s.name.trim() && Number.isFinite(s.lat) && Number.isFinite(s.lng)) ?? []
    const stageCount = validStops.length

    const ZoneStar = () => (
      <svg className="map-pin-pill-star" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )


    // Road trip avec arrêts → pill unifiée avec photo + texte
    if (stageCount > 0) {
      return (
        <g
          className={`pin-root pin-owner-${owner}${selected ? ' pin-selected' : ''}`}
          data-lng={destination.lng}
          data-lat={destination.lat}
          transform={`translate(${cx},${cy}) scale(${pinScale})`}
        >
          <foreignObject x="-10" y="-30" width="300" height="64" overflow="visible">
            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
              <button
                className={`map-pin-trip-card${owner === 'friend' ? ' map-pin-trip-card--friend' : ''}${(tripHovered || selected) ? ' map-pin-trip-card--revealed' : ''}`}
                style={{ '--pin-color': color, '--pin-photo': destination.image ? `url("${destination.image}")` : 'none' } as CSSProperties}
                onPointerEnter={() => setTripHovered(true)}
                onPointerLeave={() => setTripHovered(false)}
                onFocus={() => setTripHovered(true)}
                onBlur={() => setTripHovered(false)}
                onClick={() => {
                  if (onExpandTrip) onExpandTrip(destination, owner)
                  else onZoomToZone?.(destination)
                }}
              >
                <span className="map-pin-trip-thumb">
                  {destination.tier && (
                    <span className="map-pin-trip-badge">{destination.tier}</span>
                  )}
                  <span className="map-pin-trip-icon" aria-hidden="true">🚗</span>
                </span>
                <span className="map-pin-pill-name">{destination.name}</span>
                <span className="map-pin-pill-sub">· {stageCount} arrêt{stageCount > 1 ? 's' : ''}</span>
              </button>
            </div>
          </foreignObject>
        </g>
      )
    }

    // Zone simple sans route → pill étoile + nom + score
    return (
      <g
        className={`pin-root pin-owner-${owner}`}
        data-lng={destination.lng}
        data-lat={destination.lat}
        transform={`translate(${cx},${cy}) scale(${pinScale})`}
      >
        <foreignObject x="-10" y="-24" width="300" height="50" overflow="visible">
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <button
              className={`map-pin-zone-label${owner === 'friend' ? ' map-pin-zone-label--friend' : ''}`}
              style={{ '--pin-color': color } as CSSProperties}
              onClick={() => { onSelect(destination.name); onZoomToZone?.(destination) }}
            >
              <ZoneStar />
              <span className="map-pin-pill-name">{destination.name}</span>
              {destination.score != null && (
                <span className="map-pin-pill-sub">· {destination.score.toFixed(1)}</span>
              )}
            </button>
          </div>
        </foreignObject>
      </g>
    )
  }

  // ── Full destination pin ───────────────────────────────────────────────────
  const isCoupDeCoeur = Boolean(destination.coupDeCoeur)
  return (
    <g className={`pin-root pin-owner-${owner}${selected ? ' pin-selected' : ''}${isCoupDeCoeur ? ' pin-coup-de-coeur' : ''}`}
       data-lng={destination.lng} data-lat={destination.lat}
       transform={`translate(${cx},${cy}) scale(${pinScale})`}>
      <foreignObject className="pin-foreign-object" x="-82" y="-148" width="164" height="168">
        <div className="pin-stage">
          <button
            className={`map-pin${isCompact ? ' map-pin--compact' : ''}${destination.kind === 'stage' ? ' map-pin-stage' : ''}${owner === 'friend' ? ' map-pin--friend' : ''}${destination.image ? ' map-pin--has-photo' : ''}${isCoupDeCoeur ? ' map-pin--coup-de-coeur' : ''}`}
            draggable={false}
            onClick={() => onSelect(destination.name)}
            style={{
              '--pin-color': color,
              '--pin-photo': destination.image ? `url("${destination.image}")` : 'none',
            } as CSSProperties}>
            <span className="map-pin-tier">{destination.tier}</span>
            {isCoupDeCoeur && (
              <span className="map-pin-heart" aria-label="Coup de coeur">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
                </svg>
              </span>
            )}
            <strong>
              {destination.name}
              {destination.kind === 'stage' && destination.tripName ? <em> · {destination.tripName}</em> : null}
            </strong>
            {owner === 'friend' && badge && <em className="pin-friend-badge">{badge}</em>}
            {shared && <em className="pin-shared-badge">2</em>}
            {tripBadges && tripBadges.length > 0 && (
              <span className="pin-trip-badges" aria-hidden="true">
                {tripBadges.map((b, i) => (
                  <span
                    key={`${b.tripName}-${i}`}
                    className="pin-trip-badge"
                    title={`Étape de ${b.tripName}`}
                    style={{ '--trip-color': b.color } as CSSProperties}
                  >
                    {b.stageNumber !== undefined ? `#${b.stageNumber}` : '•'}
                  </span>
                ))}
              </span>
            )}
          </button>
        </div>
      </foreignObject>
    </g>
  )
})
