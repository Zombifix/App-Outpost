import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Destination, RoadTripStop, Tier } from '../types'
import { TIER_COLORS } from '../data'

const MAPTILER_KEY = 'aETkeQlWzYNolMJrUTIx'
const STYLE_URL = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
const INIT_CENTER: [number, number] = [10, 10]
const INIT_ZOOM = 1.5
const MIN_PIN_SCALE = 0.86
const PIN_DRAG_THRESHOLD = 4

type Proj = (ll: [number, number]) => [number, number] | null

interface PinPanState {
  pointerId: number
  lastX: number
  lastY: number
  totalX: number
  totalY: number
  moved: boolean
}

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

  map.addSource('atlas-relief', {
    type: 'raster',
    tiles: ['https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: '© Esri',
  })

  const firstVectorLayerId = map.getStyle().layers.find(layer => layer.type !== 'background')?.id
  map.addLayer({
    id: 'atlas-relief-raster',
    type: 'raster',
    source: 'atlas-relief',
    paint: {
      'raster-opacity': 0.18,
      'raster-saturation': -1,
      'raster-contrast': 0.12,
      'raster-brightness-min': 0.12,
      'raster-brightness-max': 0.96,
    },
  }, firstVectorLayerId)

  for (const layer of map.getStyle().layers) {
    const { id, type } = layer
    const lid = id.toLowerCase()

    if (id === 'atlas-relief-raster') continue

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
  const pinPanRef       = useRef<PinPanState | null>(null)
  const suppressClickRef = useRef(false)

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

  const isPinInteractionTarget = (target: EventTarget | null) => {
    return target instanceof Element && Boolean(
      target.closest('.map-pin, .map-pin-route-card, .stop-root, .route-stop-root'),
    )
  }

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !isPinInteractionTarget(event.target)) return
    pinPanRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      totalX: 0,
      totalY: 0,
      moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMoveCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const pan = pinPanRef.current
    const map = mapRef.current
    if (!pan || !map || pan.pointerId !== event.pointerId) return

    const dx = event.clientX - pan.lastX
    const dy = event.clientY - pan.lastY
    if (dx === 0 && dy === 0) return

    pan.totalX += dx
    pan.totalY += dy
    pan.lastX = event.clientX
    pan.lastY = event.clientY

    if (!pan.moved && Math.hypot(pan.totalX, pan.totalY) < PIN_DRAG_THRESHOLD) return
    pan.moved = true
    event.preventDefault()

    const center = map.project(map.getCenter())
    map.setCenter(map.unproject([center.x - dx, center.y - dy]))
  }

  const handlePointerEndCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const pan = pinPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    if (pan.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    pinPanRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section
      className="map-area"
      aria-label="Carte des destinations"
      draggable={false}
      onDragStartCapture={(event) => event.preventDefault()}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerEndCapture}
      onPointerCancelCapture={handlePointerEndCapture}
      onClickCapture={handleClickCapture}
    >
      <div ref={mapContainerRef} className="map-gl-container" draggable={false} />

      <svg ref={svgRef} className="map-pins-overlay" aria-label="Pins des destinations" draggable={false}>
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
              draggable={false}
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
            draggable={false}
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
