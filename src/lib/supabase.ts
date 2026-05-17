/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Singleton client Supabase pour Outpost.
 *
 * Si les env vars ne sont pas configurées, le client reste `null` et le code appelant
 * doit gérer ce cas (fallback mock ou message "configure Supabase pour les amis").
 * Cette tolérance permet à l'app de continuer à tourner en dev sans backend câblé.
 */
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

export const supabaseConfigured = supabase !== null
