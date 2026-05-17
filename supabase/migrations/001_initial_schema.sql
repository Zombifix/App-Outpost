-- Outpost — schéma de base
-- À exécuter une seule fois dans le SQL Editor Supabase

create extension if not exists pg_trgm;

-- Destinations d'un utilisateur (miroir de Destination côté TS)
create table if not exists destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  country text not null default 'Inconnu',
  lat double precision not null,
  lng double precision not null,
  tier text check (tier in ('S','A','B','C','D')),
  kind text check (kind in ('place','zone','stop','stage')),
  intent text check (intent in ('city-trip','tourisme','sorties','gastro','nature','travail')),
  food numeric default 3,
  night numeric default 3,
  culture numeric default 3,
  nature numeric default 3,
  value numeric default 3,
  score numeric,
  notes numeric,
  stops jsonb,
  extent double precision[],
  geojson jsonb,
  state text,
  osm_value text,
  image text,
  image_provider text check (image_provider in ('pexels','wikimedia','fallback')),
  image_author text,
  image_source_url text,
  image_query text,
  summary text,
  trip_name text,
  coup_de_coeur boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);
create index if not exists destinations_user_idx on destinations(user_id);
create index if not exists destinations_user_coords_idx on destinations(user_id, lat, lng);

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists destinations_updated_at on destinations;
create trigger destinations_updated_at before update on destinations
  for each row execute function set_updated_at();
