import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

type SegmentedLayout = 'fill' | 'hug' | 'scrollable'
type SegmentedSize = 'sm' | 'md'
type SegmentedRole = 'tablist' | 'radiogroup'
type SegmentedTone = 'default' | 'tinted'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  accentColor?: string
  ariaLabel?: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  layout?: SegmentedLayout
  size?: SegmentedSize
  role?: SegmentedRole
  tone?: SegmentedTone
  className?: string
}

interface IndicatorState {
  left: number
  width: number
  accent: string
  ready: boolean
}

const DEFAULT_ACCENT = '#1B5FE8'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  layout = 'fill',
  size = 'md',
  role = 'radiogroup',
  tone = 'default',
  className = '',
}: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef(new Map<T, HTMLButtonElement | null>())
  const [indicator, setIndicator] = useState<IndicatorState>({
    left: 0,
    width: 0,
    accent: DEFAULT_ACCENT,
    ready: false,
  })

  const enabledOptions = useMemo(() => options.filter(option => !option.disabled), [options])
  const activeIndex = useMemo(() => enabledOptions.findIndex(option => option.value === value), [enabledOptions, value])

  const measureActive = useCallback(() => {
    const activeButton = buttonRefs.current.get(value)
    if (!activeButton) return

    setIndicator(current => ({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
      accent: activeButton.dataset.segmentAccent || DEFAULT_ACCENT,
      ready: current.ready || activeButton.offsetWidth > 0,
    }))
  }, [value])

  useLayoutEffect(() => {
    measureActive()
  }, [measureActive, options, value, layout])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const handleResize = () => measureActive()
    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureActive())
      resizeObserver.observe(list)
      buttonRefs.current.forEach(button => {
        if (button) resizeObserver?.observe(button)
      })
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [measureActive, options])

  const moveSelection = useCallback((direction: 1 | -1) => {
    if (enabledOptions.length === 0) return

    const fallbackIndex = activeIndex >= 0 ? activeIndex : 0
    const nextIndex = (fallbackIndex + direction + enabledOptions.length) % enabledOptions.length
    const nextOption = enabledOptions[nextIndex]
    onChange(nextOption.value)
    buttonRefs.current.get(nextOption.value)?.focus()
  }, [activeIndex, enabledOptions, onChange])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (enabledOptions.length === 0) return

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1)
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      const first = enabledOptions[0]
      onChange(first.value)
      buttonRefs.current.get(first.value)?.focus()
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      const last = enabledOptions[enabledOptions.length - 1]
      onChange(last.value)
      buttonRefs.current.get(last.value)?.focus()
    }
  }

  const rootClassName = [
    'segmented-control',
    `segmented-control--${layout}`,
    `segmented-control--${size}`,
    `segmented-control--${tone}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      <div
        ref={listRef}
        className="segmented-control__list"
        role={role}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        <span
          aria-hidden="true"
          className="segmented-control__indicator"
          style={{
            '--segment-indicator-left': `${indicator.left}px`,
            '--segment-indicator-width': `${indicator.width}px`,
            '--segment-accent': indicator.accent,
            opacity: indicator.ready ? 1 : 0,
          } as CSSProperties}
        />
        {options.map(option => {
          const active = option.value === value
          const controlProps = role === 'tablist'
            ? { 'aria-selected': active }
            : { 'aria-checked': active }

          return (
            <button
              key={option.value}
              ref={node => { buttonRefs.current.set(option.value, node) }}
              type="button"
              role={role === 'tablist' ? 'tab' : 'radio'}
              tabIndex={active ? 0 : -1}
              className={`segmented-control__button${active ? ' is-active' : ''}`}
              data-segment-accent={option.accentColor ?? DEFAULT_ACCENT}
              style={{
                '--segment-accent': option.accentColor ?? DEFAULT_ACCENT,
              } as CSSProperties}
              aria-label={option.ariaLabel}
              disabled={option.disabled}
              onClick={() => {
                if (!option.disabled) onChange(option.value)
              }}
              {...controlProps}
            >
              {option.icon && (
                <span className="segmented-control__icon" aria-hidden="true">
                  {option.icon}
                </span>
              )}
              <span className="segmented-control__label">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
