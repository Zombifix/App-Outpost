import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ActivityEvent, ActivityKind } from '../types'

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
}

/**
 * Charge les événements d'activité visibles (les miens + ceux de mes amis acceptés via RLS).
 * S'abonne au realtime pour insérer les nouveaux events live.
 *
 * Enrichit chaque event avec le profil public de l'acteur pour affichage direct.
 */
export function useActivityFeed(limit = 30) {
  const { user } = useAuth()
  const [events, setEvents] = useState<EnrichedActivity[]>([])
  const [loading, setLoading] = useState(false)

  const fetchProfiles = useCallback(async (actorIds: string[]) => {
    if (!supabase || actorIds.length === 0) return new Map<string, { handle: string; displayName: string; avatarBg: string; avatarFg: string }>()
    const { data } = await supabase
      .from('public_profiles')
      .select('user_id, handle, display_name, avatar_bg, avatar_fg')
      .in('user_id', actorIds)
    const map = new Map<string, { handle: string; displayName: string; avatarBg: string; avatarFg: string }>()
    for (const row of (data ?? []) as Array<{ user_id: string; handle: string; display_name: string; avatar_bg: string; avatar_fg: string }>) {
      map.set(row.user_id, {
        handle: row.handle, displayName: row.display_name,
        avatarBg: row.avatar_bg, avatarFg: row.avatar_fg,
      })
    }
    return map
  }, [])

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setEvents([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('activities')
      .select('id, actor, kind, payload, created_at')
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
    setEvents(rows.map(r => {
      const profile = profiles.get(r.actor)
      return {
        id: r.id,
        actor: r.actor,
        kind: r.kind,
        payload: r.payload,
        createdAt: r.created_at,
        actorHandle: profile?.handle,
        actorDisplayName: profile?.displayName,
        actorAvatarBg: profile?.avatarBg,
        actorAvatarFg: profile?.avatarFg,
      }
    }))
    setLoading(false)
  }, [user, limit, fetchProfiles])

  useEffect(() => { void refresh() }, [refresh])

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
