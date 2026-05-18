-- 007 — Sécurité / robustesse :
--   * UNIQUE (inviter, lower(email)) sur friend_invites quand l'invite n'est pas consommée
--     → empêche un user de spammer la même adresse avec N tokens
--   * Serialisation via pg_advisory_xact_lock dans send_friend_request → tue la race
--     "deux envois croisés A↔B en même temps" qui dupliquait les activités
--   * consume_invite : insert d'activités conditionnel (only si la friendship vient
--     d'être créée) → idempotent même si l'invité clique le lien deux fois
--
-- ⚠️ Si la DB de prod a déjà des doublons inviter+email non consommés,
-- l'index unique partial échouera. Nettoyer avec :
--    delete from friend_invites a using friend_invites b
--      where a.consumed_at is null and b.consumed_at is null
--        and a.inviter = b.inviter and lower(a.email) = lower(b.email)
--        and a.created_at < b.created_at;

-- Empêche les invites doublons non-consommés (partiel pour ne pas bloquer la réinvitation
-- après expiration / consommation)
create unique index if not exists friend_invites_open_unique_idx
  on friend_invites (inviter, lower(email))
  where consumed_at is null;

-- ───────────────────────────────────────────────────────────────────────────────
-- send_friend_request : ajout d'un advisory lock sur la paire ordonnée
-- ───────────────────────────────────────────────────────────────────────────────
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

  -- Serialise les opérations sur cette paire jusqu'à la fin de la transaction.
  -- hashtextextended a un meilleur spread que hashtext sur les uuids.
  perform pg_advisory_xact_lock(
    hashtextextended(low_u::text, 0),
    hashtextextended(high_u::text, 0)
  );

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

-- ───────────────────────────────────────────────────────────────────────────────
-- consume_invite : insert des activités seulement si la friendship vient d'être créée
-- → si l'invité reclique le lien (race ou double-tab), pas de doublons d'activité.
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function consume_invite(invite_token uuid)
returns uuid
language plpgsql security definer as $$
declare
  me uuid := auth.uid();
  inviter_id uuid;
  low_u uuid;
  high_u uuid;
  was_inserted boolean;
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

  -- Lock la paire pour serialiser avec un éventuel send_friend_request concurrent
  perform pg_advisory_xact_lock(
    hashtextextended(low_u::text, 0),
    hashtextextended(high_u::text, 0)
  );

  -- xmax = 0 ⇒ ligne réellement insérée (pas update via on conflict)
  with upsert as (
    insert into friendships (user_low, user_high, initiator, status, accepted_at)
      values (low_u, high_u, inviter_id, 'accepted', now())
      on conflict (user_low, user_high) do update
        set status = 'accepted', accepted_at = now()
        where friendships.status = 'pending'
      returning (xmax = 0) as inserted
  )
  select coalesce(bool_or(inserted), false) into was_inserted from upsert;

  if was_inserted then
    insert into activities (actor, kind, payload) values
      (me, 'friendship_accepted', jsonb_build_object('friend', inviter_id)),
      (inviter_id, 'friendship_accepted', jsonb_build_object('friend', me));
  end if;

  return inviter_id;
end$$;

grant execute on function consume_invite(uuid) to authenticated;
