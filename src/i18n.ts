/**
 * Lightweight i18n — no external library.
 * Usage: import { t, lang } from './i18n'
 *        t('My journal', 'Mon carnet de voyages')
 *
 * Language stored in localStorage. Changing language reloads the page.
 */

const LANG_KEY = 'outpost-lang'

export type Lang = 'en' | 'fr'

export function getLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language) : ''
  return nav?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function setLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l)
  } catch { /* ignore */ }
  window.location.reload()
}

/** Current language — read once at module load so it's stable per page lifecycle. */
export const lang: Lang = getLang()

/**
 * Return `en` string or `fr` string based on current language.
 * Both arguments are required so every string has an explicit translation.
 */
export function t(en: string, fr: string): string {
  return lang === 'fr' ? fr : en
}
