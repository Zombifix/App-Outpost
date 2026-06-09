-- Historique prive des suggestions de recherche affichees dans le wizard.
-- Sert a eviter les repetitions et a garder une rotation coherente entre appareils.

create table if not exists user_search_suggestion_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recent_shown jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_search_suggestion_state_updated_at on user_search_suggestion_state;
create trigger user_search_suggestion_state_updated_at before update on user_search_suggestion_state
  for each row execute function set_updated_at();

alter table user_search_suggestion_state enable row level security;

drop policy if exists "search_suggestion_state_owner_all" on user_search_suggestion_state;
create policy "search_suggestion_state_owner_all" on user_search_suggestion_state
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
