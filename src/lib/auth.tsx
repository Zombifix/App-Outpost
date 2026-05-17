import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** Envoie un magic link à `email`. Si `inviteToken` fourni, sera consommé après login. */
  signInWithEmail: (email: string, inviteToken?: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string, inviteToken?: string) => {
    if (!supabase) return { error: 'Supabase non configuré' }
    const redirectBase = `${window.location.origin}${window.location.pathname}`
    // Si pas de token explicite, on regarde s'il y en a un dans l'URL courante
    // (cas d'un destinataire d'invitation pas encore inscrit qui se logue depuis
    //  la page sur laquelle il a atterri).
    const tokenFromUrl = inviteToken ?? new URL(window.location.href).searchParams.get('invite') ?? undefined
    const redirectTo = tokenFromUrl ? `${redirectBase}?invite=${encodeURIComponent(tokenFromUrl)}` : redirectBase
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    return error ? { error: error.message } : {}
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
