-- Ajoute avatar_url à public_profiles
-- NULL = fallback initiales (comportement existant)
-- URL = photo réelle (Google OAuth ou DiceBear)

alter table public_profiles
  add column if not exists avatar_url text;

-- Met à jour la RPC my_friendships pour retourner avatar_url
create or replace function my_friendships()
returns table (
  other_user uuid,
  handle text,
  display_name text,
  avatar_bg text,
  avatar_fg text,
  avatar_url text,
  status friendship_status,
  initiator uuid,
  created_at timestamptz,
  accepted_at timestamptz
)
language sql stable security definer as $$
  select
    case when f.user_low = auth.uid() then f.user_high else f.user_low end as other_user,
    p.handle,
    p.display_name,
    p.avatar_bg,
    p.avatar_fg,
    p.avatar_url,
    f.status,
    f.initiator,
    f.created_at,
    f.accepted_at
  from friendships f
  join public_profiles p
    on p.user_id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
  where f.user_low = auth.uid() or f.user_high = auth.uid();
$$;

grant execute on function my_friendships() to authenticated;
