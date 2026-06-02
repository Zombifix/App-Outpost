type MapLegendProps = {
  className?: string
  mode?: 'stacked-left' | 'bottom-left' | 'overlay-bottom'
}

const LEGEND_ITEMS = [
  ['S', 'Exceptionnel'],
  ['A', 'Genial'],
  ['B', 'Correct'],
  ['C', 'Bof'],
  ['D', 'A eviter'],
] as const

export default function MapLegend({ className = '', mode = 'overlay-bottom' }: MapLegendProps) {
  const modeClass = mode === 'stacked-left'
    ? ' legend--stacked-left'
    : mode === 'bottom-left'
      ? ' legend--bottom-left'
      : ''

  const isDocked = mode === 'stacked-left' || mode === 'bottom-left'

  return (
    <div className={`legend${className ? ` ${className}` : ''}${modeClass}`}>
      {isDocked && <p className="legend-label">Notation</p>}
      {LEGEND_ITEMS.map(([tier, label]) => (
        <span key={tier}>
          <i className={`tier-dot tier-${tier.toLowerCase()}`}>{tier}</i>
          {label}
        </span>
      ))}
    </div>
  )
}
