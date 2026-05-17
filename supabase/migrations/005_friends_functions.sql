-- RPC pour le système d'amis (security definer = bypass RLS de façon contrôlée)

-- Envoyer une demande d'amitié à un user_id
create or replace function send_friend_request(target_user uuid)
returns friendship_status
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
  low_u uuid;
  high_u uuid;
  existing_status friendship_status;
  existing_initiator uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target_user = me then raise exception 'cannot friend self'; end if;

  low_u := least(me, target_user);
  high_u := greatest(me, target_user);

  select status, initiator into existing_status, existing_initiator
    from friendships where user_low = low_u and user_high = high_u
    for update;

  -- Si l'autre m'avait déjà invité : on accepte directement
  if existing_status = 'pending' and existing_initiator = target_user then
    update friendships set status='accepted', accepted_at=now()
      where user_low = low_u and user_high = high_u;
    insert into activities (actor, kind, payload) values
      (me, 'friendship_accepted', jsonb_build_object('friend', target_user)),
      (target_user, 'friendship_accepted', jsonb_build_object('friend', me));
    return 'accepted';
  end if;

  if existing_status is null then
    insert into friendships (user_low, user_high, initiator, status)
      values (low_u, high_u, me, 'pending');
    return 'pending';
  end if;

  -- Déjà accepted ou blocked : on ne change rien
  return existing_status;
end$$;

grant execute on function send_friend_request(uuid) to authenticated;

-- Accepter une demande
create or replace function accept_friend_request(other_user uuid)
returns boolean
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
  low_u uuid := least(me, other_user);
  high_u uuid := greatest(me, other_user);
  ok boolean := false;
begin
  if me is null then raise exception 'not authenticated'; end if;

  update friendships
    set status = 'accepted', accepted_at = now()
    where user_low = low_u and user_high = high_u
      and status = 'pending'
      and initiator = other_user
  returning true into ok;

  if ok then
    insert into activities (actor, kind, payload) values
      (me, 'friendship_accepted', jsonb_build_object('friend', other_user)),
      (other_user, 'friendship_accepted', jsonb_build_object('friend', me));
  end if;
  return coalesce(ok, false);
end$$;

grant execute on function accept_friend_request(uuid) to authenticated;

-- Refuser / supprimer (symétrique : on enlève la ligne)
create or replace function remove_friendship(other_user uuid)
returns boolean
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
  low_u uuid := least(me, other_user);
  high_u uuid := greatest(me, other_user);
  removed integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from friendships where user_low = low_u and user_high = high_u;
  get diagnostics removed = row_count;
  return removed > 0;
end$$;

grant execute on function remove_friendship(uuid) to authenticated;

-- Trouver un utilisateur par handle (retourne user_id ou null)
create or replace function find_user_by_handle(target_handle text)
returns uuid
language sql stable as $$
  select user_id from public_profiles where handle = lower(target_handle) limit 1;
$$;

grant execute on function find_user_by_handle(text) to authenticated;

-- Créer une invitation par email — retourne le token à mettre dans le lien
create or replace function create_email_invite(target_email text)
returns uuid
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
  new_token uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into friend_invites (inviter, email)
    values (me, lower(target_email))
    returning token into new_token;
  return new_token;
end$$;

grant execute on function create_email_invite(text) to authenticated;

-- Consommer un token d'invitation (appelé après que l'invité s'est connecté)
create or replace function consume_invite(invite_token uuid)
returns uuid
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
  inviter_id uuid;
  low_u uuid;
  high_u uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select inviter into inviter_id from friend_invites
    where token = invite_token and consumed_at is null and expires_at > now()
    for update;

  if inviter_id is null then return null; end if;
  if inviter_id = me then return inviter_id; end if;

  update friend_invites
    set consumed_at = now(), consumed_by = me
    where token = invite_token;

  low_u := least(me, inviter_id);
  high_u := greatest(me, inviter_id);

  insert into friendships (user_low, user_high, initiator, status, accepted_at)
    values (low_u, high_u, inviter_id, 'accepted', now())
    on conflict (user_low, user_high) do update
      set status = 'accepted', accepted_at = now()
      where friendships.status = 'pending';

  insert into activities (actor, kind, payload) values
    (me, 'friendship_accepted', jsonb_build_object('friend', inviter_id)),
    (inviter_id, 'friendship_accepted', jsonb_build_object('friend', me));

  return inviter_id;
end$$;

grant execute on function consume_invite(uuid) to authenticated;

-- Liste enrichie de mes amitiés (avec profils joints) — pratique pour le hook
create or replace function my_friendships()
returns table (
  other_user uuid,
  handle text,
  display_name text,
  avatar_bg text,
  avatar_fg text,
  status friendship_status,
  initiator uuid,
  created_at timestamptz,
  accepted_at timestamptz
)
language sql stable security definer as $$
  select
    case when f.user_low = auth.uid() then f.user_high else f.user_low end as other_user,
    p.handle, p.display_name, p.avatar_bg, p.avatar_fg,
    f.status, f.initiator, f.created_at, f.accepted_at
  from friendships f
  join public_profiles p
    on p.user_id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
  where f.user_low = auth.uid() or f.user_high = auth.uid();
$$;

grant execute on function my_friendships() to authenticated;
