// Supabase Edge Function : envoie un magic-link d'invitation d'ami par email.
//
// Déploiement :
//   supabase functions deploy invite-friend
//
// Secrets requis (à configurer côté Supabase) :
//   SUPABASE_URL                — URL du projet (présent par défaut)
//   SUPABASE_SERVICE_ROLE_KEY   — clé service-role (présent par défaut sur Supabase)
//
// Body JSON: { email: string, inviteToken: string }
// Header:   Authorization: Bearer <user_jwt>  (l'utilisateur connecté qui invite)
//
// Réponse: { ok: true } ou { error: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InviteBody {
  email?: string
  inviteToken?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: InviteBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const inviteToken = (body.inviteToken ?? '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400)
  if (!inviteToken) return json({ error: 'missing_token' }, 400)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Valide le user qui invite
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  // Envoie un magic-link à l'invité avec redirection contenant le token
  const admin = createClient(supabaseUrl, serviceKey)
  const origin = req.headers.get('Origin') ?? ''
  const redirectTo = origin ? `${origin}/?invite=${encodeURIComponent(inviteToken)}` : undefined

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { inviter_user_id: userData.user.id, invite_token: inviteToken },
  })

  if (inviteErr) {
    // Si l'user existe déjà, on tombe sur un magic-link OTP standard
    const { error: otpErr } = await admin.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (otpErr) return json({ error: otpErr.message }, 400)
  }

  return json({ ok: true })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
