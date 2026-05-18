import { useEffect, useState } from 'react'
import type { Destination } from '../types'
import { DESTINATIONS } from '../data'
import { resolveDestinationImage } from '../services/imageSearch'

const STORAGE_KEY = 'outpost-destinations-v2'
const LEGACY_STORAGE_KEY = 'triptier-destinations-v2'
const AUTO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
export const AUTO_IMAGE_VERSION = 5

function hasWeakAutoImage(destination: Destination) {
  return (destination.imageProvider === 'wikipedia' && destination.imageSearchVersion !== AUTO_IMAGE_VERSION)
    || destination.imageProvider === 'wikimedia'
    || destination.imageProvider === 'fallback'
    || (!destination.imageProvider && destination.image === AUTO_IMAGE_FALLBACK)
}

type DestinationNormalizer = (value: unknown) => Destination[] | null

function loadDestinations(normalize: DestinationNormalizer): Destination[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (saved) {
      const normalized = normalize(JSON.parse(saved))
      if (normalized) return normalized
    }
  } catch {
    /* ignore */
  }
  return DESTINATIONS
}

/**
 * Store des destinations : load initial depuis localStorage, persist automatique,
 * et background refresh des images "faibles" (wikimedia/fallback).
 *
 * Le refresh d'images vérifie `cancelled` après CHAQUE await pour éviter de
 * setState après unmount (stale closure fix).
 */
export function useDestinationsStore(normalize: DestinationNormalizer) {
  const [destinations, setDestinations] = useState<Destination[]>(() => loadDestinations(normalize))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
    } catch {
      /* quota / disabled storage */
    }
  }, [destinations])

  useEffect(() => {
    const refreshTargets = destinations.filter(hasWeakAutoImage)
    if (!refreshTargets.length) return

    let cancelled = false
    void (async () => {
      const results = await Promise.all(refreshTargets.map(async destination => {
        const imageResult = await resolveDestinationImage({
          name: destination.name,
          country: destination.country,
          kind: destination.kind,
          stops: destination.stops,
          fallbackImage: destination.image ?? AUTO_IMAGE_FALLBACK,
        })
        if (cancelled) return null
        if (imageResult.imageProvider === 'fallback' || imageResult.imageProvider === 'wikimedia') return null
        return { name: destination.name, imageResult }
      }))
      if (cancelled) return
      const upgrades = results.filter((result): result is NonNullable<typeof result> => result !== null)
      if (!upgrades.length) return
      setDestinations(previous => previous.map(destination => {
        const upgrade = upgrades.find(item => item.name === destination.name)
        return upgrade
          ? {
              ...destination,
              image: upgrade.imageResult.image,
              imageProvider: upgrade.imageResult.imageProvider,
              imageAuthor: upgrade.imageResult.imageAuthor,
              imageSourceUrl: upgrade.imageResult.imageSourceUrl,
              imageQuery: upgrade.imageResult.imageQuery,
              imageSearchVersion: AUTO_IMAGE_VERSION,
            }
          : destination
      }))
    })().catch(() => { /* garder les images stockées */ })

    return () => { cancelled = true }
  }, [destinations])

  return [destinations, setDestinations] as const
}
