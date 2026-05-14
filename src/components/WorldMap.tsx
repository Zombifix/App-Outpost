import { useEffect, useRef, useState } from 'react'
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
  const [dimensions, setDimensions] = useState({ width: 900, height: 520 })
  const [worldData, setWorldData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [projectionReady, setProjectionReady] = useState(false)
  const [zoomTransform, setZoomTransform] = useState(d3.zoomIdentity)

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return

    const update = () => {
      const rect = element.getBoundingClientRect()
      setDimensions({
        width: Math.max(320, rect.width),
        height: Math.max(260, rect.height),
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    fetch(WORLD_ATLAS_URL)
      .then(response => response.json())
      .then((topo: Topology) => {
        const countries = feature(topo, topo.objects.countries as GeometryCollection)
        setWorldData(countries as GeoJSON.FeatureCollection)
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
        countries.attr('transform', String(event.transform))
        // TODO: throttle or move pin updates outside React to make pan/zoom smoother.
        setZoomTransform(event.transform)
      })

    zoomRef.current = zoom
    svg.call(zoom)
    setZoomTransform(d3.zoomIdentity)
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
    d3.select(svgRef.current)
      .transition()
      .duration(260)
      .call(zoomRef.current.scaleBy, factor)
  }

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current)
      .transition()
      .duration(360)
      .call(zoomRef.current.transform, d3.zoomIdentity)
  }

  return (
    <section className="map-area" ref={wrapperRef} aria-label="Carte des destinations">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="world-map"
      >
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
        <g className="pins-transform">
          {projectionReady && destinations.map(destination => (
            <Pin
              destination={destination}
              key={destination.name}
              projection={projectionRef.current!}
              zoomTransform={zoomTransform}
              selected={destination.name === selectedName}
              onSelect={onSelect}
            />
          ))}
        </g>
      </svg>

      <div className="map-controls" aria-label="Controles de carte">
        <button aria-label="Zoomer" onClick={() => zoomBy(1.35)}>+</button>
        <button aria-label="Dezoomer" onClick={() => zoomBy(0.75)}>-</button>
        <button aria-label="Centrer" onClick={resetZoom}>
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="legend">
        {[
          ['S', 'Exceptionnel'],
          ['A', 'Genial'],
          ['B', 'Tres bien'],
          ['C', 'Correct'],
          ['D', 'Decouvrant'],
        ].map(([tier, label]) => (
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
  zoomTransform: d3.ZoomTransform
  selected: boolean
  onSelect: (name: string) => void
}

function Pin({ destination, projection, zoomTransform, selected, onSelect }: PinProps) {
  const projected = projection([destination.lng, destination.lat])
  if (!projected) return null

  const [cx, cy] = zoomTransform.apply(projected)
  const color = TIER_COLORS[destination.tier].pin
  const pinScale = Math.min(1.62, Math.max(0.82, 0.72 + zoomTransform.k * 0.22))
  const score = (destination.score ?? (destination.food + destination.night + destination.culture + destination.nature + destination.value) / 5)
    .toFixed(1)
    .replace('.', ',')

  return (
    <g transform={`translate(${cx}, ${cy})`} className={selected ? 'pin-selected' : undefined}>
      <foreignObject className="pin-foreign-object" x="-82" y="-148" width="164" height="168">
        <div className="pin-stage">
          <button
            className="map-pin"
            onClick={() => onSelect(destination.name)}
            style={{ '--pin-color': color, '--pin-scale': pinScale } as CSSProperties}
          >
            <span>{destination.tier}</span>
            <strong>{destination.name}</strong>
            <small>{score}</small>
          </button>
        </div>
      </foreignObject>
    </g>
  )
}
