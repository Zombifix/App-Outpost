import type { Destination } from '../types'

export function normalizeDestinationName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function destinationNameKey(destination: Pick<Destination, 'name'> | string): string {
  return normalizeDestinationName(typeof destination === 'string' ? destination : destination.name)
}

export function destinationNameSet(destinations: Array<Pick<Destination, 'name'>>): Set<string> {
  return new Set(destinations.map(destinationNameKey))
}

/**
 * Clé d'identité cross-utilisateurs pour la note communautaire.
 * Miroir TS de destination_community_key() (migration 021) — les deux doivent
 * produire la même chaîne pour qu'un badge retrouve son agrégat.
 */
export function destinationCommunityKey(
  destination: Pick<Destination, 'name' | 'country' | 'countryCode'>,
): string {
  const countryPart = destination.countryCode?.trim()
    ? destination.countryCode.trim().toLowerCase()
    : normalizeDestinationName(destination.country ?? '')
  return `${normalizeDestinationName(destination.name)}|${countryPart}`
}
