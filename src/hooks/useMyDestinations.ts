import { useCallback, useEffect, useRef, useState } from 'react'
import type { Destination } from '../types'
import { resolveDestinationImage } from '../services/imageSearch'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  destinationToRow,
  rowToDestination,
  DESTINATION_SELECT_COLUMNS,
  type DbDestinationRow,
} from '../lib/destinationMapper'

const STORAGE_KEY = 'outpost-destinations-v2'
const LEGACY_STORAGE_KEY = 'triptier-destinations-v2'
const AUTO_IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85'
export const AUTO_IMAGE_VERSION = 5
const DEFAULT_COUP_DE_COEUR_NAMES = new Set(['Kyoto'])
const SUPABASE_PUSH_DEBOUNCE_MS = 400
const MAX_REMOTE_DESTINATIONS = 200

function hasWeakAutoImage(destination: Destination) {
  return (destination.imageProvider === 'wikipedia' && destination.imageSearchVersion !== AUTO_IMAGE_VERSION)
    || destination.imageProvider === 'wikimedia'
    || destination.imageProvider === 'fallback'
    || (!destination.imageProvider && destination.image === AUTO_IMAGE_FALLBACK)
}

type DestinationNormalizer = (value: unknown) => Destination[] | null

function applySeedMigrations(destinations: Destination[]) {
  return destinations.map(destination => (
    DEFAULT_COUP_DE_COEUR_NAMES.has(destination.name) && destination.coupDeCoeur === undefined
      ? { ...destination, coupDeCoeur: true }
      : destination
  ))
}

function loadFromLocalStorage(normalize: DestinationNormalizer): Destination[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!saved) return null
    const normalized = normalize(JSON.parse(saved))
    if (!normalized) return null
    return applySeedMigrations(normalized)
  } catch {
    return null
  }
}

function clearLocalCache() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function writeLocalCache(destinations: Destination[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
  } catch {
    /* quota / disabled storage */
  }
}

function destinationsEqual(a: Destination, b: Destination): boolean {
  // Comparaison structurelle suffisante : si une seule propriété change on push.
  // Stringify est OK pour < 200 destinations.
  return JSON.stringify(a) === JSON.stringify(b)
}

function indexByName(list: Destination[]): Map<string, Destination> {
  const map = new Map<string, Destination>()
  for (const dest of list) map.set(dest.name, dest)
  return map
}

/**
 * Hook unifié pour le carnet de destinations courant.
 *
 * - **Non connecté** : localStorage (legacy) → cache local, démos OK, perte
 *   acceptée si le navigateur est nettoyé.
 * - **Connecté** : Supabase = source de vérité (RLS par user_id). À la 1ère
 *   connexion, si le carnet distant est vide et que le cache local contient
 *   des modifs, on les migre silencieusement.
 *
 * Chaque mutation de l'état React déclenche un push debouncé vers Supabase
 * (upsert pour les ajouts/maj, delete pour les retraits). Tout est optimiste :
 * l'UI reflète immédiatement le changement, le push se fait en arrière-plan.
 *
 * `error` permet à l'app d'afficher un toast discret si une sync échoue.
 */
export function useMyDestinations(normalize: DestinationNormalizer) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // État initial : optimiste depuis localStorage (évite un flash vide pendant le
  // fetch Supabase). Sera remplacé par les données distantes au mount si connecté.
  // Si rien en cache → carnet vide. Pas de seed démo : un nouvel utilisateur
  // doit voir un carnet vraiment vide, pas le carnet de démonstration.
  const [destinations, setDestinationsState] = useState<Destination[]>(() => {
    return loadFromLocalStorage(normalize) ?? []
  })
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Snapshot précédent indexé par name : permet de diff pour ne pousser que
  // ce qui a changé (évite de réécrire 200 lignes à chaque toggle).
  const prevByNameRef = useRef<Map<string, Destination>>(indexByName(destinations))
  // Timers de debounce par name (upsert) + set de noms à supprimer pendant la fenêtre.
  const pendingUpsertTimers = useRef<Map<string, number>>(new Map())
  const pendingDeleteTimers = useRef<Map<string, number>>(new Map())
  // Empêche le push initial juste après hydratation depuis Supabase (les données
  // viennent déjà du serveur, inutile de les renvoyer).
  const suppressNextSyncRef = useRef(false)

  // ---- Push helpers --------------------------------------------------------

  const pushUpsert = useCallback((destination: Destination) => {
    if (!supabase || !userId) return
    const client = supabase
    const row = destinationToRow(destination, userId)
    void client
      .from('destinations')
      .upsert(row, { onConflict: 'user_id,name' })
      .then(({ error: err }) => {
        if (err) {
          console.error('[useMyDestinations] upsert failed', destination.name, err)
          setError(err.message)
        }
      })
  }, [userId])

  const pushDelete = useCallback((name: string) => {
    if (!supabase || !userId) return
    const client = supabase
    void client
      .from('destinations')
      .delete()
      .eq('user_id', userId)
      .eq('name', name)
      .then(({ error: err }) => {
        if (err) {
          console.error('[useMyDestinations] delete failed', name, err)
          setError(err.message)
        }
      })
  }, [userId])

  const scheduleUpsert = useCallback((destination: Destination) => {
    const name = destination.name
    // Si un delete était pending pour le même nom, on l'annule (add-after-delete).
    const deleteTimer = pendingDeleteTimers.current.get(name)
    if (deleteTimer !== undefined) {
      window.clearTimeout(deleteTimer)
      pendingDeleteTimers.current.delete(name)
    }
    const existing = pendingUpsertTimers.current.get(name)
    if (existing !== undefined) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      pendingUpsertTimers.current.delete(name)
      pushUpsert(destination)
    }, SUPABASE_PUSH_DEBOUNCE_MS)
    pendingUpsertTimers.current.set(name, timer)
  }, [pushUpsert])

  const scheduleDelete = useCallback((name: string) => {
    const upsertTimer = pendingUpsertTimers.current.get(name)
    if (upsertTimer !== undefined) {
      window.clearTimeout(upsertTimer)
      pendingUpsertTimers.current.delete(name)
    }
    const existing = pendingDeleteTimers.current.get(name)
    if (existing !== undefined) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      pendingDeleteTimers.current.delete(name)
      pushDelete(name)
    }, SUPABASE_PUSH_DEBOUNCE_MS)
    pendingDeleteTimers.current.set(name, timer)
  }, [pushDelete])

  // ---- Hydratation (Supabase fetch + migration locale) ---------------------

  useEffect(() => {
    let cancelled = false

    // Pas d'utilisateur : on garde le cache local. Si on vient juste de signOut,
    // auth.tsx a déjà vidé le cache et l'app sera réinitialisée au prochain login.
    if (!userId || !supabase) {
      const cached = loadFromLocalStorage(normalize) ?? []
      suppressNextSyncRef.current = true
      setDestinationsState(cached)
      prevByNameRef.current = indexByName(cached)
      setHydrated(true)
      return
    }

    setHydrated(false)
    const client = supabase
    void (async () => {
      const { data, error: err } = await client
        .from('destinations')
        .select(DESTINATION_SELECT_COLUMNS)
        .eq('user_id', userId)
        .limit(MAX_REMOTE_DESTINATIONS)

      if (cancelled) return

      if (err) {
        console.error('[useMyDestinations] fetch failed', err)
        setError(err.message)
        setHydrated(true)
        return
      }

      const remoteList = (data as DbDestinationRow[]).map(rowToDestination)
      const localList = loadFromLocalStorage(normalize)
      const localHasUserData = !!localList && localList.length > 0

      if (remoteList.length === 0 && localHasUserData) {
        // Migration douce : on uploade le cache local puis on le purge.
        const client2 = supabase!
        const rows = localList!.map(d => destinationToRow(d, userId))
        const { error: upErr } = await client2.from('destinations').upsert(rows, { onConflict: 'user_id,name' })
        if (cancelled) return
        if (upErr) {
          console.error('[useMyDestinations] initial migration failed', upErr)
          setError(upErr.message)
          // On garde le local quand même en mémoire pour ne pas perdre l'affichage.
          suppressNextSyncRef.current = true
          setDestinationsState(localList!)
          prevByNameRef.current = indexByName(localList!)
        } else {
          suppressNextSyncRef.current = true
          setDestinationsState(localList!)
          prevByNameRef.current = indexByName(localList!)
          clearLocalCache()
        }
      } else {
        // Supabase fait foi. On efface le cache local pour qu'il ne pollue
        // jamais une autre session/un autre compte sur ce navigateur.
        suppressNextSyncRef.current = true
        const next = remoteList.length ? remoteList : []
        setDestinationsState(next)
        prevByNameRef.current = indexByName(next)
        clearLocalCache()
      }
      setHydrated(true)
    })()

    return () => { cancelled = true }
  }, [userId, normalize])

  // ---- Diff & push à chaque changement d'état -----------------------------

  useEffect(() => {
    if (suppressNextSyncRef.current) {
      suppressNextSyncRef.current = false
      prevByNameRef.current = indexByName(destinations)
      return
    }

    // Mode anonyme : on persiste en localStorage uniquement.
    if (!userId || !supabase) {
      writeLocalCache(destinations)
      prevByNameRef.current = indexByName(destinations)
      return
    }

    // Mode connecté : diff vs précédent → schedule upserts/deletes.
    const prev = prevByNameRef.current
    const nextIndex = indexByName(destinations)

    for (const [name, dest] of nextIndex) {
      const previous = prev.get(name)
      if (!previous || !destinationsEqual(previous, dest)) {
        scheduleUpsert(dest)
      }
    }
    for (const name of prev.keys()) {
      if (!nextIndex.has(name)) scheduleDelete(name)
    }

    prevByNameRef.current = nextIndex
  }, [destinations, userId, scheduleUpsert, scheduleDelete])

  // ---- Refresh d'images "faibles" en arrière-plan (existant conservé) -----

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
      setDestinationsState(previous => previous.map(destination => {
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

  // ---- Cleanup au unmount : flush des timers en attente -------------------

  useEffect(() => {
    return () => {
      pendingUpsertTimers.current.forEach(t => window.clearTimeout(t))
      pendingDeleteTimers.current.forEach(t => window.clearTimeout(t))
      pendingUpsertTimers.current.clear()
      pendingDeleteTimers.current.clear()
    }
  }, [])

  return [destinations, setDestinationsState, { hydrated, error }] as const
}
