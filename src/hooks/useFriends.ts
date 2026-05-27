import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Friendship, MapVisibility, PublicProfile } from '../types'
import { FAKE_FRIENDS_MODE, FAKE_FRIENDSHIPS } from './_fakeFriends'

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
function useFriendsState() {
  const { user } = useAuth()
  const [friendships, setFriendships] = useState<Friendship[]>(
    FAKE_FRIENDS_MODE ? FAKE_FRIENDSHIPS : []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (FAKE_FRIENDS_MODE) {
      setFriendships(FAKE_FRIENDSHIPS)
      return
    }
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
  // Le provider garde un seul channel actif même si plusieurs composants lisent les amis.
  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase
    const channel = client
      .channel(`friendships:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void refresh()
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [user, refresh])

  // Set d'IDs (handle, userId, email) en cours de traitement pour éviter les doubles requêtes
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set())
  const pendingActionsRef = useRef(pendingActions)
  const updatePendingActions = useCallback((updater: (previous: Set<string>) => Set<string>) => {
    setPendingActions(previous => {
      const next = updater(previous)
      pendingActionsRef.current = next
      return next
    })
  }, [])
  const withPending = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | { ok: false; error: string }> => {
    if (pendingActionsRef.current.has(key)) return { ok: false as const, error: 'Action déjà en cours' }
    updatePendingActions(prev => { const next = new Set(prev); next.add(key); return next })
    try {
      return await fn()
    } finally {
      updatePendingActions(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }, [updatePendingActions])

  const sendRequestByHandle = useCallback(async (handle: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase non configuré' }
    const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '')
    if (!cleanHandle) return { ok: false, error: 'Handle vide' }
    return withPending(`handle:${cleanHandle}`, async () => {
      const { data: targetId, error: lookupErr } = await supabase!.rpc('find_user_by_handle', { target_handle: cleanHandle })
      if (lookupErr) return { ok: false, error: lookupErr.message }
      if (!targetId) return { ok: false, error: 'Aucun utilisateur avec ce handle' }
      const { error: sendErr } = await supabase!.rpc('send_friend_request', { target_user: targetId })
      if (sendErr) return { ok: false, error: sendErr.message }
      await refresh()
      return { ok: true }
    }) as Promise<{ ok: boolean; error?: string }>
  }, [refresh, withPending])

  const sendRequestByUserId = useCallback(async (targetUserId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase non configuré' }
    return withPending(`user:${targetUserId}`, async () => {
      const { error: err } = await supabase!.rpc('send_friend_request', { target_user: targetUserId })
      if (err) return { ok: false, error: err.message }
      await refresh()
      return { ok: true }
    }) as Promise<{ ok: boolean; error?: string }>
  }, [refresh, withPending])

  const acceptRequest = useCallback(async (otherUser: string) => {
    if (!supabase) return { ok: false as const, error: 'Supabase non configuré' }
    return withPending(`accept:${otherUser}`, async () => {
      const { error: err } = await supabase!.rpc('accept_friend_request', { other_user: otherUser })
      if (err) return { ok: false as const, error: err.message }
      await refresh()
      return { ok: true as const }
    }) as Promise<{ ok: true } | { ok: false; error: string }>
  }, [refresh, withPending])

  const removeFriendship = useCallback(async (otherUser: string) => {
    if (!supabase) return { ok: false as const, error: 'Supabase non configuré' }
    return withPending(`remove:${otherUser}`, async () => {
      const { error: err } = await supabase!.rpc('remove_friendship', { other_user: otherUser })
      if (err) return { ok: false as const, error: err.message }
      await refresh()
      return { ok: true as const }
    }) as Promise<{ ok: true } | { ok: false; error: string }>
  }, [refresh, withPending])

  const createEmailInvite = useCallback(async (email: string): Promise<{ token?: string; error?: string }> => {
    if (!supabase) return { error: 'Supabase non configuré' }
    const { data, error: err } = await supabase.rpc('create_email_invite', { target_email: email })
    if (err) return { error: err.message }
    return { token: data as string }
  }, [])

  const searchProfiles = useCallback(async (query: string): Promise<PublicProfile[]> => {
    // Auth requise pour éviter l'énumération anonyme
    if (!supabase || !user) return []
    const q = query.trim().replace(/^@/, '')
    if (q.length < 3) return []
    // Échappe les wildcards SQL ILIKE (% et _) pour éviter les patterns abusifs
    const safe = q.replace(/[\\%_]/g, c => `\\${c}`)
    const { data, error: err } = await supabase
      .from('public_profiles')
      .select('user_id, handle, display_name, avatar_bg, avatar_fg, bio, map_visibility')
      .or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .limit(8)
    if (err || !data) return []
    return data.map(row => ({
      userId: row.user_id,
      handle: row.handle,
      displayName: row.display_name,
      avatarBg: row.avatar_bg,
      avatarFg: row.avatar_fg,
      bio: row.bio ?? undefined,
      mapVisibility: (row.map_visibility as MapVisibility | null) ?? 'friends',
    }))
  }, [user])

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
    pendingActions,
  }
}

type FriendsContextValue = ReturnType<typeof useFriendsState>

const FriendsContext = createContext<FriendsContextValue | null>(null)

export function FriendsProvider({ children }: { children: ReactNode }) {
  const value = useFriendsState()
  return createElement(FriendsContext.Provider, { value }, children)
}

export function useFriends() {
  const context = useContext(FriendsContext)
  if (!context) {
    throw new Error('useFriends must be used within FriendsProvider')
  }
  return context
}
