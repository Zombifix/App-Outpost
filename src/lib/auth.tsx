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
const MAGIC_LINK_COOLDOWN_MS = 60_000
const magicLinkAttempts = new Map<string, number>()

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('email rate limit')) {
    return 'Trop de liens demandés pour l\'instant. Attends au moins 1 minute avant de réessayer ; si la limite email du projet est atteinte, il faudra attendre jusqu\'à 1 heure. Utilise toujours le dernier email reçu.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Trop de tentatives rapprochées. Attends une minute avant de demander un nouveau lien.'
  }
  return message
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
        return { error: `Attends encore ${remaining} s avant de demander un nouveau lien pour cet email.` }
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

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    // Nettoyage explicite : éviter qu'un autre user qui se connecte sur ce
    // navigateur voie les destinations / pseudo du précédent. La sync
    // bidirectionnelle (useMyDestinations) garantit que rien n'est perdu :
    // les destinations sont en sécurité côté Supabase.
    try {
      localStorage.removeItem('outpost-destinations-v2')
      localStorage.removeItem('triptier-destinations-v2')
      localStorage.removeItem('outpost-public-id')
    } catch {
      /* ignore */
    }
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
