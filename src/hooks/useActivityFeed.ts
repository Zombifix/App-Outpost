import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ActivityEvent, ActivityKind } from '../types'
import { FAKE_FRIENDS_MODE, FAKE_ACTIVITY, subscribeFakeLive } from './_fakeFriends'

interface ActivityRow {
  id: string
  actor: string
  kind: ActivityKind
  payload: Record<string, unknown>
  created_at: string
}

interface EnrichedActivity extends ActivityEvent {
  actorHandle?: string
  actorDisplayName?: string
  actorAvatarBg?: string
  actorAvatarFg?: string
  actorAvatarUrl?: string
}

/**
 * Charge les événements d'activité visibles (les miens + ceux de mes amis acceptés via RLS).
 * S'abonne au realtime pour insérer les nouveaux events live.
 *
 * Enrichit chaque event avec le profil public de l'acteur pour affichage direct.
 */
export function useActivityFeed(limit = 30) {
  const { user } = useAuth()
  const [events, setEvents] = useState<EnrichedActivity[]>(
    FAKE_FRIENDS_MODE ? (FAKE_ACTIVITY.slice(0, limit) as EnrichedActivity[]) : []
  )
  const [loading, setLoading] = useState(false)

  const fetchProfiles = useCallback(async (actorIds: string[]) => {
    if (!supabase || actorIds.length === 0) return new Map<string, { handle: string; displayName: string; avatarBg: string; avatarFg: string; avatarUrl?: string }>()
    const { data } = await supabase
      .from('public_profiles')
      .select('user_id, handle, display_name, avatar_bg, avatar_fg, avatar_url')
      .in('user_id', actorIds)
    const map = new Map<string, { handle: string; displayName: string; avatarBg: string; avatarFg: string; avatarUrl?: string }>()
    for (const row of (data ?? []) as Array<{ user_id: string; handle: string; display_name: string; avatar_bg: string; avatar_fg: string; avatar_url: string | null }>) {
      map.set(row.user_id, {
        handle: row.handle, displayName: row.display_name,
        avatarBg: row.avatar_bg, avatarFg: row.avatar_fg,
        avatarUrl: row.avatar_url ?? undefined,
      })
    }
    return map
  }, [])

  const refresh = useCallback(async () => {
    if (FAKE_FRIENDS_MODE) {
      setEvents(FAKE_ACTIVITY.slice(0, limit) as EnrichedActivity[])
      return
    }
    if (!supabase || !user) {
      setEvents([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('activities')
      .select('id, actor, kind, payload, created_at')
      .neq('actor', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      setEvents([])
      setLoading(false)
      return
    }
    const rows = (data ?? []) as ActivityRow[]
    const actors = Array.from(new Set(rows.map(r => r.actor)))
    const profiles = await fetchProfiles(actors)

    // Enrichit les events destination_added avec image/tier courants
    // (les anciens events n'avaient pas l'image en payload, on la récupère depuis destinations).
    const destIds = Array.from(new Set(
      rows
        .filter(r => typeof r.payload?.destination_id === 'string' && (!r.payload?.image || !r.payload?.tier))
        .map(r => r.payload.destination_id as string)
    ))
    const destMap = new Map<string, { image?: string; tier?: string }>()
    if (destIds.length > 0) {
      const { data: destData } = await supabase
        .from('destinations')
        .select('id, image, tier')
        .in('id', destIds)
      for (const d of (destData ?? []) as Array<{ id: string; image: string | null; tier: string | null }>) {
        destMap.set(d.id, { image: d.image ?? undefined, tier: d.tier ?? undefined })
      }
    }

    setEvents(rows.map(r => {
      const profile = profiles.get(r.actor)
      const destId = typeof r.payload?.destination_id === 'string' ? r.payload.destination_id : undefined
      const destExtra = destId ? destMap.get(destId) : undefined
      const payload = destExtra
        ? {
            ...r.payload,
            image: r.payload.image ?? destExtra.image,
            tier: r.payload.tier ?? destExtra.tier,
          }
        : r.payload
      return {
        id: r.id,
        actor: r.actor,
        kind: r.kind,
        payload,
        createdAt: r.created_at,
        actorHandle: profile?.handle,
        actorDisplayName: profile?.displayName,
        actorAvatarBg: profile?.avatarBg,
        actorAvatarFg: profile?.avatarFg,
        actorAvatarUrl: profile?.avatarUrl,
      }
    }))
    setLoading(false)
  }, [user, limit, fetchProfiles])

  useEffect(() => { void refresh() }, [refresh])

  // Abonnement au "live ticker" du mode fake : chaque tick prepend un event
  // au feed pour simuler la liveness (la sidebar et le pulse 'Live' réagissent).
  useEffect(() => {
    if (!FAKE_FRIENDS_MODE) return
    const off = subscribeFakeLive(event => {
      setEvents(prev => [event, ...prev].slice(0, limit))
    })
    return off
  }, [limit])

  // Suffixe random pour éviter les collisions de channel name entre plusieurs
  // instances de useActivityFeed (cf. même commentaire dans useFriends).
  const channelIdRef = useRef<string>(Math.random().toString(36).slice(2, 10))
  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const channel = client
      .channel(`activities:${user.id}:${channelIdRef.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, () => {
        void refresh()
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [user, refresh])

  return { events, loading, refresh }
}
