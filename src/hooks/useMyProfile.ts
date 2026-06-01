import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { MapVisibility, PublicProfile } from '../types'

interface ProfileRow {
  user_id: string
  handle: string
  display_name: string
  avatar_bg: string
  avatar_fg: string
  avatar_url: string | null
  bio: string | null
  map_visibility: MapVisibility | null
}

function rowToProfile(row: ProfileRow): PublicProfile {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarBg: row.avatar_bg,
    avatarFg: row.avatar_fg,
    avatarUrl: row.avatar_url ?? undefined,
    bio: row.bio ?? undefined,
    mapVisibility: row.map_visibility ?? 'friends',
  }
}

/**
 * Profil public de l'utilisateur courant.
 * - `profile` est `null` si non chargé OU si la ligne n'existe pas encore (premier login).
 * - `needsSetup` permet à App.tsx d'afficher le ProfileSetupModal de force.
 * - `upsert` insère ou met à jour le profil et retourne ok/error.
 * - `checkHandleAvailable` interroge la table pour valider l'unicité avant submit.
 */
export function useMyProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null)
      setLoaded(true)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('public_profiles')
      .select('user_id, handle, display_name, avatar_bg, avatar_fg, avatar_url, bio, map_visibility')
      .eq('user_id', user.id)
      .maybeSingle()
    setProfile(data ? rowToProfile(data as ProfileRow) : null)
    setLoading(false)
    setLoaded(true)
  }, [user])

  useEffect(() => {
    setLoaded(false)
    void refresh()
  }, [refresh])

  const upsert = useCallback(async (input: {
    handle: string
    displayName: string
    avatarBg?: string
    avatarFg?: string
    avatarUrl?: string
    bio?: string
    mapVisibility?: MapVisibility
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase || !user) return { ok: false, error: 'Non connecté' }
    const handle = input.handle.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (handle.length < 2 || handle.length > 32) return { ok: false, error: 'Handle entre 2 et 32 caractères' }
    const displayName = input.displayName.trim()
    if (!displayName) return { ok: false, error: 'Nom requis' }
    const { error } = await supabase
      .from('public_profiles')
      .upsert({
        user_id: user.id,
        handle,
        display_name: displayName,
        avatar_bg: input.avatarBg ?? randomAvatarBg(handle),
        avatar_fg: input.avatarFg ?? '#ffffff',
        avatar_url: input.avatarUrl ?? null,
        bio: input.bio ?? null,
        map_visibility: input.mapVisibility ?? profile?.mapVisibility ?? 'friends',
      })
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'Ce handle est déjà pris' }
      return { ok: false, error: error.message }
    }
    await refresh()
    return { ok: true }
  }, [user, refresh, profile?.mapVisibility])

  const updateMapVisibility = useCallback(async (mapVisibility: MapVisibility): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase || !user) return { ok: false, error: 'Non connecté' }
    const { error } = await supabase
      .from('public_profiles')
      .update({ map_visibility: mapVisibility })
      .eq('user_id', user.id)
    if (error) return { ok: false, error: error.message }
    await refresh()
    return { ok: true }
  }, [user, refresh])

  const checkHandleAvailable = useCallback(async (handle: string): Promise<boolean> => {
    if (!supabase) return false
    const cleaned = handle.trim().toLowerCase()
    if (!cleaned) return false
    const { data, error } = await supabase
      .from('public_profiles')
      .select('user_id')
      .eq('handle', cleaned)
      .maybeSingle()
    if (error) return false
    // Disponible si pas de ligne, ou si c'est nous-mêmes
    return !data || (user !== null && (data as { user_id: string }).user_id === user.id)
  }, [user])

  return {
    profile,
    loading,
    loaded,
    needsSetup: loaded && !!user && !profile,
    refresh,
    upsert,
    updateMapVisibility,
    checkHandleAvailable,
  }
}

const AVATAR_COLORS = ['#7087fc', '#f97316', '#10b981', '#ec4899', '#a855f7', '#06b6d4', '#eab308', '#ef4444']

function randomAvatarBg(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
