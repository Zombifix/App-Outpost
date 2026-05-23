import { useEffect, useRef } from 'react'

/**
 * Trap Tab focus inside a container while it is open, and restore focus
 * to the previously-focused element when the container unmounts.
 *
 * Usage: `const ref = useFocusTrap<HTMLDivElement>(open); <div ref={ref}>…</div>`
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null

    const SELECTOR = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    const getFocusable = (): HTMLElement[] => {
      return Array.from(node.querySelectorAll<HTMLElement>(SELECTOR))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
    }

    // Focus the first focusable element if focus is outside the container
    const initial = getFocusable()
    if (initial.length > 0 && !node.contains(document.activeElement)) {
      initial[0].focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = getFocusable()
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (current === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try { previouslyFocused.focus() } catch { /* ignore */ }
      }
    }
  }, [active])

  return ref
}
