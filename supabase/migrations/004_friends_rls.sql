-- RLS du système d'amis

alter table public_profiles enable row level security;
alter table friendships enable row level security;
alter table friend_invites enable row level security;
alter table activities enable row level security;
alter table reactions enable row level security;

-- public_profiles : lecture publique (un handle est une identité publique), écriture pour soi
drop policy if exists "profiles_read_all" on public_profiles;
create policy "profiles_read_all" on public_profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public_profiles;
create policy "profiles_insert_own" on public_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public_profiles;
create policy "profiles_update_own" on public_profiles
  for update using (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public_profiles;
create policy "profiles_delete_own" on public_profiles
  for delete using (auth.uid() = user_id);

-- friendships : visibles par les 2 parties; modifiables via RPC (security definer)
drop policy if exists "friendships_visible_to_pair" on friendships;
create policy "friendships_visible_to_pair" on friendships
  for select using (auth.uid() = user_low or auth.uid() = user_high);

-- pas de write direct: tout passe par RPC (voir 005)
revoke insert, update, delete on friendships from authenticated;

-- friend_invites : lisible/modifiable par l'inviteur uniquement; consommation par RPC
drop policy if exists "invites_owner_all" on friend_invites;
create policy "invites_owner_all" on friend_invites
  for all using (auth.uid() = inviter)
  with check (auth.uid() = inviter);

-- activities : visibles si je suis l'acteur OU si je suis ami accepté avec l'acteur
drop policy if exists "activities_visible_self_or_friend" on activities;
create policy "activities_visible_self_or_friend" on activities
  for select using (
    actor = auth.uid()
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and f.user_low = least(actor, auth.uid())
        and f.user_high = greatest(actor, auth.uid())
    )
  );

-- insertions d'activités: seulement par soi-même (triggers utilisent security definer)
drop policy if exists "activities_insert_own" on activities;
create policy "activities_insert_own" on activities
  for insert with check (actor = auth.uid());

-- reactions : un utilisateur peut créer/supprimer ses propres réactions sur destinations d'amis
drop policy if exists "reactions_read_visible" on reactions;
create policy "reactions_read_visible" on reactions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from destinations d
      join friendships f on (
        f.status = 'accepted'
        and f.user_low = least(d.user_id, auth.uid())
        and f.user_high = greatest(d.user_id, auth.uid())
      )
      where d.id = reactions.destination_id
    )
  );

drop policy if exists "reactions_write_own" on reactions;
create policy "reactions_write_own" on reactions
  for insert with check (user_id = auth.uid());

drop policy if exists "reactions_delete_own" on reactions;
create policy "reactions_delete_own" on reactions
  for delete using (user_id = auth.uid());

-- destinations : ouvre une lecture pour les amis acceptés
drop policy if exists "destinations_friend_read" on destinations;
create policy "destinations_friend_read" on destinations
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and f.user_low = least(user_id, auth.uid())
        and f.user_high = greatest(user_id, auth.uid())
    )
  );
