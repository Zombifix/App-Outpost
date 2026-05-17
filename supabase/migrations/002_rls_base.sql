-- RLS de base : un utilisateur ne voit/modifie que ses destinations,
-- sauf en lecture publique pour les profils consultables via lien partagé.

alter table destinations enable row level security;

drop policy if exists "destinations_owner_all" on destinations;
create policy "destinations_owner_all" on destinations
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lecture publique des destinations d'un utilisateur qui a un public_profile (consulté via ?u=handle)
-- Sera activée après création de la table public_profiles dans 003.
