import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as d3 from 'd3'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Destination } from '../types'
import { TIER_COLORS } from '../data'

interface FlyTarget {
  lat: number
  lng: number
  name: string
}

interface WorldMapProps {
  destinations: Destination[]
  flyTarget: FlyTarget | null
  selectedName?: string
  onSelect: (name: string) => void
  onFlyTargetConsumed: () => void
}

const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

function rdp(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1]
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  let maxDist = 0, maxIdx = 1
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]
    const dist = len === 0
      ? Math.hypot(px - x1, py - y1)
      : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist > tol) {
    const left = rdp(pts.slice(0, maxIdx + 1), tol)
    const right = rdp(pts.slice(maxIdx), tol)
    return [...left.slice(0, -1), ...right]
  }
  return [pts[0], pts[pts.length - 1]]
}

function projectGeojson(geojson: object, proj: d3.GeoProjection): string {
  const geo = geojson as { type: string; coordinates: number[][][][] | number[][][] }
  const rings: number[][][] =
    geo.type === 'Polygon'
      ? (geo.coordinates as number[][][])
      : geo.type === 'MultiPolygon'
        ? (geo.coordinates as number[][][][]).flat(1)
        : []

  return rings
    .map(ring => {
      const raw = ring
        .map(coord => proj([coord[0], coord[1]]))
        .filter((p): p is [number, number] => p !== null && isFinite(p[0]) && isFinite(p[1]))

      if (raw.length < 3) return ''

      const spikeFiltered: [number, number][] = [raw[0]]
      for (let i = 1; i < raw.length - 1; i++) {
        const [ax, ay] = raw[i - 1], [bx, by] = raw[i], [cx, cy] = raw[i + 1]
        const dx1 = ax - bx, dy1 = ay - by
        const dx2 = cx - bx, dy2 = cy - by
        const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2)
        if (len1 < 0.001 || len2 < 0.001) { spikeFiltered.push(raw[i]); continue }
        const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2)
        if (!(dot > 0.9 && len1 > 2 && len2 > 2)) spikeFiltered.push(raw[i])
      }
      spikeFiltered.push(raw[raw.length - 1])

      if (spikeFiltered.length < 3) return ''
      const pts = rdp(spikeFiltered, 0.5)
      if (pts.length < 3) return ''
      return 'M' + pts.map(p => p.join(',')).join('L') + 'Z'
    })
    .filter(Boolean)
    .join(' ')
}

export default function WorldMap({
  destinations,
  flyTarget,
  selectedName,
  onSelect,
  onFlyTargetConsumed,
}: WorldMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  // Refs for groups whose transforms D3 manages directly — no React state involved
  const zonesGroupRef = useRef<SVGGElement>(null)
  const pinsGroupRef = useRef<SVGGElement>(null)

  const [dimensions, setDimensions] = useState({ width: 900, height: 520 })
  const [worldData, setWorldData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [projectionReady, setProjectionReady] = useState(false)
  // zoomK only used for pin scale — updated on zoom END, not every frame
  const [zoomK, setZoomK] = useState(1)

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setDimensions({ width: Math.max(320, rect.width), height: Math.max(260, rect.height) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    fetch(WORLD_ATLAS_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        setWorldData(feature(topo, topo.objects.countries as GeometryCollection) as GeoJSON.FeatureCollection)
      })
      .catch(() => setWorldData(null))
  }, [])

  useEffect(() => {
    if (!worldData || !svgRef.current) return

    const { width, height } = dimensions
    const svg = d3.select(svgRef.current)
    const projection = d3.geoNaturalEarth1()
      .scale(Math.min(width / 5.85, height / 2.62))
      .translate([width / 2, height / 2 + 6])

    projectionRef.current = projection
    const pathGen = d3.geoPath().projection(projection)

    svg.select('g.countries').remove()
    const countries = svg.insert('g', ':first-child').attr('class', 'countries')

    countries.selectAll('path')
      .data(worldData.features)
      .join('path')
      .attr('d', pathGen as unknown as string)
      .attr('fill', 'url(#land-gradient)')
      .attr('stroke', 'rgba(175, 194, 157, 0.62)')
      .attr('stroke-width', 0.55)
      .attr('opacity', 0.95)
      .attr('filter', 'url(#land-relief)')

    const graticule = d3.geoGraticule().step([30, 30])
    countries.append('path')
      .datum(graticule())
      .attr('d', pathGen as unknown as string)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(74, 110, 130, 0.12)')
      .attr('stroke-width', 0.7)

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 7])
      .on('zoom', event => {
        // All transforms applied directly to DOM — zero React re-renders per frame
        const k = event.transform.k
        const t = String(event.transform)
        countries.attr('transform', t)
        if (zonesGroupRef.current) zonesGroupRef.current.setAttribute('transform', t)
        if (pinsGroupRef.current) {
          pinsGroupRef.current.setAttribute('transform', t)
          // Counter-scale each pin so it keeps constant screen size,
          // anchored precisely at its geographic point (the <g> translate origin)
          const invK = 1 / k
          pinsGroupRef.current.querySelectorAll<SVGGElement>('g.pin-root').forEach(el => {
            const tx = el.dataset.tx
            const ty = el.dataset.ty
            if (tx !== undefined && ty !== undefined) {
              el.setAttribute('transform', `translate(${tx},${ty}) scale(${invK})`)
            }
          })
        }
        svgRef.current?.classList.add('is-zooming')
      })
      .on('end', event => {
        // React only updates once after zoom settles, for pin scale recalculation
        setZoomK(event.transform.k)
        svgRef.current?.classList.remove('is-zooming')
      })

    zoomRef.current = zoom
    svg.call(zoom)

    // Reset group transforms and scale state on projection rebuild
    if (zonesGroupRef.current) zonesGroupRef.current.removeAttribute('transform')
    if (pinsGroupRef.current) pinsGroupRef.current.removeAttribute('transform')
    setZoomK(1)
    setProjectionReady(true)
  }, [worldData, dimensions])

  useEffect(() => {
    if (!flyTarget || !projectionRef.current || !svgRef.current || !zoomRef.current) return

    const projected = projectionRef.current([flyTarget.lng, flyTarget.lat])
    if (!projected) return

    const [x, y] = projected
    const { width, height } = dimensions
    const scale = 2.35
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-x, -y)

    d3.select(svgRef.current)
      .transition()
      .duration(760)
      .ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, transform)

    onFlyTargetConsumed()
  }, [flyTarget, dimensions, onFlyTargetConsumed])

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(260).call(zoomRef.current.scaleBy, factor)
  }

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current).transition().duration(360).call(zoomRef.current.transform, d3.zoomIdentity)
  }

  // Memoize zone polygon paths — only recompute when destinations or projection changes
  const zonePaths = useMemo(() => {
    if (!projectionReady || !projectionRef.current) return []
    const proj = projectionRef.current
    return destinations
      .filter(d => d.kind === 'zone')
      .map(d => {
        const color = TIER_COLORS[d.tier].pin
        const sharedProps = {
          fill: color, fillOpacity: 0.13,
          stroke: color, strokeWidth: 1.3, strokeOpacity: 0.5,
          strokeDasharray: '6 3' as const,
        }
        if (d.geojson) {
          const pathStr = projectGeojson(d.geojson, proj)
          if (!pathStr) return null
          return <path key={d.name} {...sharedProps} d={pathStr} />
        }
        if (d.extent) {
          const [w, s, e, n] = d.extent
          const sw = proj([w, s]); const se = proj([e, s])
          const ne = proj([e, n]); const nw = proj([w, n])
          if (!sw || !se || !ne || !nw) return null
          return <polygon key={d.name} {...sharedProps} points={[sw, se, ne, nw].map(p => p.join(',')).join(' ')} />
        }
        return null
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectionReady, destinations, dimensions])

  return (
    <section className="map-area" ref={wrapperRef} aria-label="Carte des destinations">
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="world-map">
        <defs>
          <linearGradient id="land-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f4f0dc" />
            <stop offset="44%" stopColor="#dce8c9" />
            <stop offset="100%" stopColor="#c4dfc4" />
          </linearGradient>
          <filter id="land-relief" x="-18%" y="-18%" width="136%" height="136%">
            <feTurbulence type="fractalNoise" baseFrequency="0.017" numOctaves="2" seed="8" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feDropShadow in="rough" dx="1.8" dy="2.4" stdDeviation="1.2" floodColor="#8ba983" floodOpacity="0.28" result="shadow" />
            <feBlend in="rough" in2="shadow" mode="normal" />
          </filter>
        </defs>

        {/* Zones: D3 manages the group transform via zonesGroupRef */}
        <g ref={zonesGroupRef}>{zonePaths}</g>

        {/* Pins: positioned at BASE projection coords — the group transform (D3-managed) moves them */}
        <g ref={pinsGroupRef}>
          {projectionReady && destinations.map(destination => (
            <Pin
              key={destination.name}
              destination={destination}
              projection={projectionRef.current!}
              zoomK={zoomK}
              selected={destination.name === selectedName}
              onSelect={onSelect}
            />
          ))}
        </g>
      </svg>

      <div className="map-controls" aria-label="Controles de carte">
        <button aria-label="Zoomer" onClick={() => zoomBy(1.35)}>+</button>
        <button aria-label="Dezoomer" onClick={() => zoomBy(0.75)}>−</button>
        <span className="map-controls-divider" aria-hidden="true" />
        <button aria-label="Recadrer la carte" onClick={resetZoom}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9V4h5" />
            <path d="M21 9V4h-5" />
            <path d="M3 15v5h5" />
            <path d="M21 15v5h-5" />
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
    </section>
  )
}

interface PinProps {
  destination: Destination
  projection: d3.GeoProjection
  zoomK: number
  selected: boolean
  onSelect: (name: string) => void
}

// memo: only re-renders when props actually change (not on every zoom frame)
const Pin = memo(function Pin({ destination, projection, zoomK, selected, onSelect }: PinProps) {
  const projected = projection([destination.lng, destination.lat])
  if (!projected) return null

  // Base projected coords — the parent group's D3 transform handles zoom positioning
  const [cx, cy] = projected
  // scale(1/zoomK) counter-acts the parent group's D3 zoom, keeping pins at constant
  // screen size anchored precisely at the geographic point (translate origin = 0,0 local)
  const invK = 1 / zoomK
  // Below threshold: compact circle pin; above: full card with name+score
  const isCompact = zoomK < 2

  if (destination.kind === 'stop') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <circle r={5} fill="#8b9db5" stroke="white" strokeWidth={1.2} opacity={0.85}
          style={{ cursor: 'pointer' }} onClick={() => onSelect(destination.name)} />
      </g>
    )
  }

  const color = TIER_COLORS[destination.tier!].pin
  const score = (destination.score ?? (destination.food + destination.night + destination.culture + destination.nature + destination.value) / 5)
    .toFixed(1)
    .replace('.', ',')

  if (destination.kind === 'zone') {
    return (
      <g
        className={`pin-root${selected ? ' pin-selected' : ''}`}
        data-tx={cx} data-ty={cy}
        transform={`translate(${cx},${cy}) scale(${invK})`}
      >
        <foreignObject className="pin-foreign-object" x="-70" y="-36" width="140" height="40">
          <div className="pin-stage">
            <button
              className="map-pin map-pin-zone-label"
              onClick={() => onSelect(destination.name)}
              style={{ '--pin-color': color } as CSSProperties}
            >
              <span>{destination.tier}</span>
              <strong>{destination.name}</strong>
            </button>
          </div>
        </foreignObject>
      </g>
    )
  }

  return (
    <g
      className={`pin-root${selected ? ' pin-selected' : ''}`}
      data-tx={cx} data-ty={cy}
      transform={`translate(${cx},${cy}) scale(${invK})`}
    >
      <foreignObject className="pin-foreign-object" x="-82" y="-148" width="164" height="168">
        <div className="pin-stage">
          <button
            className={`map-pin${isCompact ? ' map-pin--compact' : ''}${destination.kind === 'stage' ? ' map-pin-stage' : ''}`}
            onClick={() => onSelect(destination.name)}
            style={{ '--pin-color': color } as CSSProperties}
          >
            <span>{destination.tier}</span>
            <strong>
              {destination.name}
              {destination.kind === 'stage' && destination.tripName ? <em> · {destination.tripName}</em> : null}
            </strong>
            <small>{score}</small>
          </button>
        </div>
      </foreignObject>
    </g>
  )
})
