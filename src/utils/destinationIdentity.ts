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
