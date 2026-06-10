const DEFAULT_HERO_WIDTH = 900

/**
 * Rewrites known image-CDN URLs to request an appropriately sized variant
 * instead of the full-resolution original. Unknown hosts are returned as-is.
 */
export function optimizedImageUrl(url: string, width = DEFAULT_HERO_WIDTH): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'images.unsplash.com') {
      parsed.searchParams.set('auto', 'format')
      parsed.searchParams.set('fit', 'crop')
      parsed.searchParams.set('w', String(width))
      if (!parsed.searchParams.has('q')) parsed.searchParams.set('q', '80')
      return parsed.toString()
    }
    if (parsed.hostname === 'images.pexels.com') {
      parsed.searchParams.set('auto', 'compress')
      parsed.searchParams.set('cs', 'tinysrgb')
      parsed.searchParams.set('w', String(width))
      return parsed.toString()
    }
    return url
  } catch {
    return url
  }
}
