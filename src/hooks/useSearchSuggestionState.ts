import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  emptySuggestionHistoryState,
  pushShownSuggestions,
  type SuggestionHistoryState,
} from '../lib/destinationRecommendations'

const STORAGE_KEY = 'outpost-search-suggestion-state-v1'

interface SuggestionStateRow {
  user_id: string
  recent_shown: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeHistoryState(value: unknown): SuggestionHistoryState | null {
  if (!isRecord(value)) return null
  const recentShown = Array.isArray(value.recentShown)
    ? value.recentShown.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
    : null
  return recentShown ? { recentShown } : null
}

function rowToHistoryState(row: SuggestionStateRow): SuggestionHistoryState {
  return {
    recentShown: Array.isArray(row.recent_shown)
      ? row.recent_shown.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
      : [],
  }
}

function loadLocalHistoryState(): SuggestionHistoryState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeHistoryState(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeLocalHistoryState(state: SuggestionHistoryState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage disabled */
  }
}

export function clearLocalSearchSuggestionState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* localStorage disabled */
  }
}

export function useSearchSuggestionState() {
  const { user } = useAuth()
  const [initialLocalState] = useState<SuggestionHistoryState | null>(() => loadLocalHistoryState())
  const [historyState, setHistoryState] = useState<SuggestionHistoryState>(initialLocalState ?? emptySuggestionHistoryState())
  const [hydrated, setHydrated] = useState(Boolean(initialLocalState) || !supabase)

  useEffect(() => {
    let cancelled = false

    if (!user || !supabase) {
      const localState = loadLocalHistoryState() ?? emptySuggestionHistoryState()
      setHistoryState(localState)
      setHydrated(true)
      return
    }

    if (!initialLocalState) setHydrated(false)

    void supabase
      .from('user_search_suggestion_state')
      .select('user_id, recent_shown')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) {
          const remoteState = rowToHistoryState(data as SuggestionStateRow)
          setHistoryState(remoteState)
          writeLocalHistoryState(remoteState)
        }
        setHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [initialLocalState, user])

  const recordShownSuggestions = useCallback((shown: string[]) => {
    setHistoryState(prev => {
      const next = pushShownSuggestions(prev, shown)
      writeLocalHistoryState(next)
      if (supabase && user) {
        void supabase
          .from('user_search_suggestion_state')
          .upsert({ user_id: user.id, recent_shown: next.recentShown }, { onConflict: 'user_id' })
      }
      return next
    })
  }, [user])

  return {
    historyState,
    hydrated,
    recordShownSuggestions,
  }
}
