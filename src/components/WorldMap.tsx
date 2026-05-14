import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Destination } from '../types'
import { TIER_COLORS } from '../data'

interface WorldMapProps {
  destinations: Destination[]
  flyTarget: string | null
  onFlyTargetConsumed: () => void
}

interface TooltipState {
  x: number
  y: number
  dest: Destination
}

const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

export default function WorldMap({ destinations, flyTarget, onFlyTargetConsumed }: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [worldData, setWorldData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [projectionReady, setProjectionReady] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Fetch TopoJSON once
  useEffect(() => {
    fetch(WORLD_ATLAS_URL)
      .then(r => r.json())
      .then((topo: Topology) => {
        const countries = feature(topo, topo.objects['countries'] as GeometryCollection)
        setWorldData(countries as GeoJSON.FeatureCollection)
      })
      .catch(console.error)
  }, [])

  // Resize listener
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Draw map + setup zoom
  useEffect(() => {
    if (!worldData || !svgRef.current) return
    const { width, height } = dimensions
    const svg = d3.select(svgRef.current)

    const projection = d3.geoNaturalEarth1()
      .scale(width / 6.2)
      .translate([width / 2, height / 2])
    projectionRef.current = projection

    const pathGen = d3.geoPath().projection(projection)

    svg.select('g.countries').remove()
    const g = svg.insert('g', ':first-child').attr('class', 'countries')

    g.selectAll('path')
      .data(worldData.features)
      .join('path')
      .attr('d', pathGen as unknown as string)
      .attr('fill', '#0e2240')
      .attr('stroke', '#06111f')
      .attr('stroke-width', 0.6)

    // Graticule (lignes de latitude/longitude discrètes)
    const graticule = d3.geoGraticule().step([30, 30])
    g.append('path')
      .datum(graticule())
      .attr('d', pathGen as unknown as string)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.04)')
      .attr('stroke-width', 0.5)

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', String(event.transform))
        d3.select(svgRef.current).select<SVGGElement>('g.pins-transform')
          .attr('transform', String(event.transform))
      })
    zoomRef.current = zoom
    svg.call(zoom)

    setProjectionReady(true)
  }, [worldData, dimensions])

  // Fly-to on flyTarget change
  useEffect(() => {
    if (!flyTarget || !projectionRef.current || !svgRef.current || !zoomRef.current) return
    const dest = destinations.find(d => d.name === flyTarget)
    if (!dest) return

    const projected = projectionRef.current([dest.lng, dest.lat])
    if (!projected) return
    const [x, y] = projected
    const { width, height } = dimensions
    const scale = 5
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-x, -y)

    d3.select(svgRef.current)
      .transition()
      .duration(900)
      .ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, transform)

    onFlyTargetConsumed()
  }, [flyTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block', background: '#06111f' }}
      >
        {/* countries group inserted by D3 */}
        <g className="pins-transform">
          {projectionReady && destinations.map(dest => (
            <Pin
              key={dest.name}
              dest={dest}
              projection={projectionRef.current!}
              onEnter={(d, x, y) => setTooltip({ x, y, dest: d })}
              onLeave={() => setTooltip(null)}
            />
          ))}
        </g>
      </svg>

      {tooltip && (
        <Tooltip tooltip={tooltip} />
      )}
    </div>
  )
}

// ─── Pin ─────────────────────────────────────────────────────────────────────

interface PinProps {
  dest: Destination
  projection: d3.GeoProjection
  onEnter: (dest: Destination, x: number, y: number) => void
  onLeave: () => void
}

function Pin({ dest, projection, onEnter, onLeave }: PinProps) {
  const projected = projection([dest.lng, dest.lat])
  if (!projected) return null
  const [cx, cy] = projected
  const { pin } = TIER_COLORS[dest.tier]

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      onMouseEnter={e => onEnter(dest, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      style={{ cursor: 'pointer' }}
    >
      <circle
        r={9}
        fill={pin}
        opacity={0}
        style={{ animation: 'ripple 2.4s ease-out infinite', transformOrigin: '0 0' }}
      />
      <circle r={5} fill={pin} stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={6}
        fontWeight={600}
        fill="white"
        fontFamily="var(--font-serif)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {dest.tier}
      </text>
    </g>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <span style={{ color: '#EF9F27', fontSize: 10, letterSpacing: 1 }}>
      {'★'.repeat(value)}
      <span style={{ color: '#d0d0d0' }}>{'★'.repeat(5 - value)}</span>
    </span>
  )
}

function Tooltip({ tooltip }: { tooltip: TooltipState }) {
  const { x, y, dest } = tooltip
  const { pin, label } = TIER_COLORS[dest.tier]

  const left = x + 14
  const top = y - 10

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        background: 'white',
        border: '0.5px solid rgba(0,0,0,0.1)',
        borderRadius: 12,
        padding: '10px 13px',
        minWidth: 180,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{dest.country}</span>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{dest.name}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-serif)',
            fontSize: 15,
            fontWeight: 500,
            color: label,
            background: pin + '22',
            borderRadius: 6,
            padding: '1px 7px',
          }}
        >
          {dest.tier}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {([
          ['Food',    dest.food],
          ['Night',   dest.night],
          ['Culture', dest.culture],
          ['Nature',  dest.nature],
          ['Value',   dest.value],
        ] as [string, number][]).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#666', minWidth: 44 }}>{label}</span>
            <Stars value={val} />
          </div>
        ))}
      </div>
    </div>
  )
}
