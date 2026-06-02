import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string, inviteToken?: string) => Promise<{ error?: string }>
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>
  signUpWithPassword: (email: string, password: string) => Promise<{ error?: string; needsConfirmation?: boolean }>
  signInWithGoogle: () => Promise<{ error?: string }>
  resetPassword: (email: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const MAGIC_LINK_COOLDOWN_MS = 60_000
const magicLinkAttempts = new Map<string, number>()

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('email rate limit')) {
    return 'Too many requests. Wait at least 1 minute before trying again; if the project email limit is reached, you may need to wait up to 1 hour. Always use the latest email received.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many attempts in a short time. Wait a minute before requesting a new link.'
  }
  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email or password.'
  }
  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
    return 'This account exists but is waiting for email confirmation. To test without SMTP, disable "Confirm email" in Supabase then confirm or recreate the user.'
  }
  if (normalized.includes('signups not allowed') || normalized.includes('signup is disabled')) {
    return 'Sign-ups are disabled in Supabase. Enable "Allow new users" / "Enable sign ups" under Authentication > Sign In / Providers > Email.'
  }
  if (normalized.includes('user already registered') || normalized.includes('already registered')) {
    return 'An account already exists with this email. Try signing in instead.'
  }
  if (normalized.includes('password should be at least') || normalized.includes('weak password')) {
    return 'Password too short. Use at least 6 characters.'
  }
  return message
}

function getAuthRedirectTo() {
  const redirectBase = `${window.location.origin}${window.location.pathname}`
  const tokenFromUrl = new URL(window.location.href).searchParams.get('invite') ?? undefined
  return tokenFromUrl ? `${redirectBase}?invite=${encodeURIComponent(tokenFromUrl)}` : redirectBase
}

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
    const key = email.trim().toLowerCase()
    const lastAttempt = magicLinkAttempts.get(key)
    if (lastAttempt) {
      const remaining = Math.ceil((MAGIC_LINK_COOLDOWN_MS - (Date.now() - lastAttempt)) / 1000)
      if (remaining > 0) {
        return { error: `Wait ${remaining}s before requesting a new link for this email.` }
      }
    }

    const redirectBase = `${window.location.origin}${window.location.pathname}`
    // Si pas de token explicite, on regarde s'il y en a un dans l'URL courante
    // (cas d'un destinataire d'invitation pas encore inscrit qui se logue depuis
    //  la page sur laquelle il a atterri).
    const tokenFromUrl = inviteToken ?? new URL(window.location.href).searchParams.get('invite') ?? undefined
    const redirectTo = tokenFromUrl ? `${redirectBase}?invite=${encodeURIComponent(tokenFromUrl)}` : redirectBase
    magicLinkAttempts.set(key, Date.now())
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    return error ? { error: friendlyAuthError(error.message) } : {}
  }

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase non configuré' }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    return error ? { error: friendlyAuthError(error.message) } : {}
  }

  const signUpWithPassword = async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase non configuré' }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: getAuthRedirectTo() },
    })
    if (error) return { error: friendlyAuthError(error.message) }
    return { needsConfirmation: !data.session }
  }

  const signInWithGoogle = async () => {
    if (!supabase) return { error: 'Supabase non configuré' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthRedirectTo() },
    })
    return error ? { error: friendlyAuthError(error.message) } : {}
  }

  const resetPassword = async (email: string) => {
    if (!supabase) return { error: 'Supabase not configured' }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    })
    return error ? { error: friendlyAuthError(error.message) } : {}
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    try {
      localStorage.removeItem('outpost-destinations-v2')
      localStorage.removeItem('triptier-destinations-v2')
      localStorage.removeItem('outpost-public-id')
    } catch {
      /* ignore */
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithEmail, signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
