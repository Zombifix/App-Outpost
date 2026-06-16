import { t } from '../i18n'

type MapLegendProps = {
  className?: string
  mode?: 'stacked-left' | 'bottom-left' | 'overlay-bottom'
}

const LEGEND_ITEMS = [
  ['S', t('Exceptional', 'Exceptionnel')],
  ['A', t('Great', 'Genial')],
  ['B', t('Decent', 'Correct')],
  ['C', t('Meh', 'Bof')],
  ['D', t('Avoid', 'A eviter')],
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
      {isDocked && <p className="legend-label">{t('Rating', 'Notation')}</p>}
      {LEGEND_ITEMS.map(([tier, label]) => (
        <span key={tier}>
          <i className={`tier-dot tier-${tier.toLowerCase()}`}>{tier}</i>
          {label}
        </span>
      ))}
    </div>
  )
}
