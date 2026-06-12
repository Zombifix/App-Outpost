-- Migration 022 : restreindre get_public_destinations aux colonnes réellement
-- consommées par les vues amis (overlay map, comparaison tier list, profil
-- voyageur). L'ancienne version faisait `select d.*` et exposait donc au
-- navigateur de l'ami (ou de n'importe qui en map publique) des colonnes
-- jamais utilisées côté client : notes, memorability (legacy), state,
-- osm_value, métadonnées d'image internes (author/source_url/query/version),
-- id, user_id, created_at, updated_at.
--
-- Colonnes conservées car affichées ou utilisées par les vues amis :
--   - identité & géo : destination_key, name, country, country_code, lat, lng,
--     kind, extent, geojson, osm_id, osm_type (réparation de géométrie de zone),
--     stops, trip_name (road trips sur la carte)
--   - scoring : tier, intent, food, night, culture, nature, value, ease, score,
--     vibe_boost, retour_bonus, coup_de_coeur (withRecalculatedScore côté client)
--   - image : image, image_provider (fallback catalogue)
--   - contexte voyage (affiché dans la preview compare + profil voyageur) :
--     summary, visit_count, trip_year, trip_days, companions, personal_budget,
--     trip_types, standout, standout_tags, lived_there
--
-- NB : summary, standout et personal_budget restent exposés car la preview
-- compare ("💸 Spent") et le profil voyageur ami (médiane budget) les
-- affichent volontairement. Les retirer est une décision produit, pas un
-- simple correctif de fuite.

-- Le type de retour change (setof destinations → table explicite) :
-- create or replace ne suffit pas, il faut drop d'abord.
drop function if exists get_public_destinations(uuid);

create function get_public_destinations(target_user_id uuid)
returns table (
  destination_key text,
  name text,
  country text,
  lat double precision,
  lng double precision,
  tier text,
  kind text,
  intent text,
  food numeric,
  night numeric,
  culture numeric,
  nature numeric,
  value numeric,
  ease numeric,
  score numeric,
  stops jsonb,
  extent double precision[],
  geojson jsonb,
  osm_id bigint,
  osm_type text,
  country_code text,
  image text,
  image_provider text,
  summary text,
  trip_name text,
  visit_count int,
  trip_year int,
  trip_days int,
  companions text,
  personal_budget numeric,
  trip_types text[],
  standout text,
  standout_tags text[],
  coup_de_coeur boolean,
  lived_there boolean,
  vibe_boost smallint,
  retour_bonus real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.destination_key,
    d.name,
    d.country,
    d.lat,
    d.lng,
    d.tier,
    d.kind,
    d.intent,
    d.food,
    d.night,
    d.culture,
    d.nature,
    d.value,
    d.ease,
    d.score,
    d.stops,
    d.extent,
    d.geojson,
    d.osm_id,
    d.osm_type,
    d.country_code,
    d.image,
    d.image_provider,
    d.summary,
    d.trip_name,
    d.visit_count,
    d.trip_year,
    d.trip_days,
    d.companions,
    d.personal_budget,
    d.trip_types,
    d.standout,
    d.standout_tags,
    d.coup_de_coeur,
    d.lived_there,
    d.vibe_boost,
    d.retour_bonus
  from destinations d
  join get_map_access_context(target_user_id) ctx on ctx.allowed
  where d.user_id = target_user_id
  limit 200;
$$;

grant execute on function get_public_destinations(uuid) to anon, authenticated;
