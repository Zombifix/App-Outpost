-- Accès public aux profils partagés (visiteurs anonymes via ?u=handle)

-- Permettre aux anonymes de résoudre un handle en user_id
grant execute on function find_user_by_handle(text) to anon;

-- Lecture des destinations d'un profil partagé, accessible sans authentification
create or replace function get_public_destinations(target_user_id uuid)
returns setof destinations
language sql
stable
security definer
set search_path = public
as $$
  select * from destinations where user_id = target_user_id limit 200;
$$;

grant execute on function get_public_destinations(uuid) to anon, authenticated;
