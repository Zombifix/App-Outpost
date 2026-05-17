import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Friendship, PublicProfile } from '../types'

interface FriendshipRow {
  other_user: string
  handle: string
  display_name: string
  avatar_bg: string
  avatar_fg: string
  status: Friendship['status']
  initiator: string
  created_at: string
  accepted_at: string | null
}

function rowToFriendship(row: FriendshipRow, myUserId: string): Friendship {
  return {
    otherUser: row.other_user,
    handle: row.handle,
    displayName: row.display_name,
    avatarBg: row.avatar_bg,
    avatarFg: row.avatar_fg,
    status: row.status,
    initiator: row.initiator === myUserId ? 'me' : 'them',
    createdAt: row.created_at,
    acceptedAt: row.accepted_at ?? undefined,
  }
}

/**
 * Hook central pour le système d'amis.
 * Charge mes amitiés via RPC `my_friendships`, s'abonne au realtime sur la table
 * `friendships`, et expose les actions pending/accept/remove + ajout par handle/email.
 */
export function useFriends() {
  const { user } = useAuth()
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setFriendships([])
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase.rpc('my_friendships')
    if (err) {
      setError(err.message)
      setFriendships([])
    } else {
      setError(null)
      setFriendships((data as FriendshipRow[]).map(row => rowToFriendship(row, user.id)))
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Realtime : refetch dès qu'une ligne friendships impliquant moi change.
  // Suffixe random pour qu'il n'y ait pas de collision quand plusieurs composants
  // appellent useFriends() en parallèle (sinon supabase-js réutilise le channel
  // déjà subscribed et .on() après .subscribe() crashe).
  const channelIdRef = useRef<string>(Math.random().toString(36).slice(2, 10))
  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const channel = client
      .channel(`friendships:${user.id}:${channelIdRef.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void refresh()
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [user, refresh])

  const sendRequestByHandle = useCallback(async (handle: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase non configuré' }
    const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '')
    if (!cleanHandle) return { ok: false, error: 'Handle vide' }
    const { data: targetId, error: lookupErr } = await supabase.rpc('find_user_by_handle', { target_handle: cleanHandle })
    if (lookupErr) return { ok: false, error: lookupErr.message }
    if (!targetId) return { ok: false, error: 'Aucun utilisateur avec ce handle' }
    const { error: sendErr } = await supabase.rpc('send_friend_request', { target_user: targetId })
    if (sendErr) return { ok: false, error: sendErr.message }
    await refresh()
    return { ok: true }
  }, [refresh])

  const sendRequestByUserId = useCallback(async (targetUserId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase non configuré' }
    const { error: err } = await supabase.rpc('send_friend_request', { target_user: targetUserId })
    if (err) return { ok: false, error: err.message }
    await refresh()
    return { ok: true }
  }, [refresh])

  const acceptRequest = useCallback(async (otherUser: string) => {
    if (!supabase) return { ok: false as const, error: 'Supabase non configuré' }
    const { error: err } = await supabase.rpc('accept_friend_request', { other_user: otherUser })
    if (err) return { ok: false as const, error: err.message }
    await refresh()
    return { ok: true as const }
  }, [refresh])

  const removeFriendship = useCallback(async (otherUser: string) => {
    if (!supabase) return { ok: false as const, error: 'Supabase non configuré' }
    const { error: err } = await supabase.rpc('remove_friendship', { other_user: otherUser })
    if (err) return { ok: false as const, error: err.message }
    await refresh()
    return { ok: true as const }
  }, [refresh])

  const createEmailInvite = useCallback(async (email: string): Promise<{ token?: string; error?: string }> => {
    if (!supabase) return { error: 'Supabase non configuré' }
    const { data, error: err } = await supabase.rpc('create_email_invite', { target_email: email })
    if (err) return { error: err.message }
    return { token: data as string }
  }, [])

  const searchProfiles = useCallback(async (query: string): Promise<PublicProfile[]> => {
    if (!supabase) return []
    const q = query.trim().replace(/^@/, '')
    if (q.length < 2) return []
    const { data, error: err } = await supabase
      .from('public_profiles')
      .select('user_id, handle, display_name, avatar_bg, avatar_fg, bio')
      .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(8)
    if (err || !data) return []
    return data.map(row => ({
      userId: row.user_id,
      handle: row.handle,
      displayName: row.display_name,
      avatarBg: row.avatar_bg,
      avatarFg: row.avatar_fg,
      bio: row.bio ?? undefined,
    }))
  }, [])

  const accepted = useMemo(() => friendships.filter(f => f.status === 'accepted'), [friendships])
  const incoming = useMemo(() => friendships.filter(f => f.status === 'pending' && f.initiator === 'them'), [friendships])
  const outgoing = useMemo(() => friendships.filter(f => f.status === 'pending' && f.initiator === 'me'), [friendships])

  return {
    friendships,
    accepted,
    incoming,
    outgoing,
    loading,
    error,
    refresh,
    sendRequestByHandle,
    sendRequestByUserId,
    acceptRequest,
    removeFriendship,
    createEmailInvite,
    searchProfiles,
  }
}
