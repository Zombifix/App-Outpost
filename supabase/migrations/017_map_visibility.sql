-- MVP privacy: visibilité de la carte par profil.
-- Valeur par défaut prudente pour les profils existants: friends.

alter table public_profiles
  add column if not exists map_visibility text;

update public_profiles
set map_visibility = 'friends'
where map_visibility is null;

alter table public_profiles
  alter column map_visibility set default 'friends';

alter table public_profiles
  alter column map_visibility set not null;

do $$ begin
  alter table public_profiles
    add constraint public_profiles_map_visibility_check
    check (map_visibility in ('public', 'friends', 'private'));
exception when duplicate_object then null; end $$;

create or replace function get_map_access_context(target_user_id uuid)
returns table (
  allowed boolean,
  visibility text,
  reason text,
  is_owner boolean,
  is_friend boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with profile as (
    select
      p.user_id,
      coalesce(p.map_visibility, 'friends') as map_visibility
    from public_profiles p
    where p.user_id = target_user_id
    limit 1
  ),
  rel as (
    select exists (
      select 1
      from friendships f
      where f.status = 'accepted'
        and f.user_low = least(target_user_id, auth.uid())
        and f.user_high = greatest(target_user_id, auth.uid())
    ) as is_friend
  )
  select
    case
      when auth.uid() = target_user_id then true
      when profile.map_visibility = 'public' then true
      when profile.map_visibility = 'friends' and coalesce(rel.is_friend, false) then true
      else false
    end as allowed,
    coalesce(profile.map_visibility, 'friends') as visibility,
    case
      when auth.uid() = target_user_id then null
      when profile.map_visibility = 'friends' and not coalesce(rel.is_friend, false) then 'friends_only'
      when profile.map_visibility = 'private' then 'private'
      else null
    end as reason,
    auth.uid() = target_user_id as is_owner,
    coalesce(rel.is_friend, false) as is_friend
  from profile
  left join rel on true;
$$;

grant execute on function get_map_access_context(uuid) to anon, authenticated;

create or replace function get_public_destinations(target_user_id uuid)
returns setof destinations
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from destinations d
  join get_map_access_context(target_user_id) ctx on ctx.allowed
  where d.user_id = target_user_id
  limit 200;
$$;

grant execute on function get_public_destinations(uuid) to anon, authenticated;
