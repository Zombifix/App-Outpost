-- Note communautaire ("note du peuple") : agrégats anonymes par destination.
--
-- Invariants de confidentialité :
--   * aucune fonction n'expose de user_id ;
--   * une destination n'apparaît qu'avec >= 3 votants distincts (en dessous,
--     la "note du peuple" serait la note d'une ou deux personnes identifiables) ;
--   * moyennes arrondies à 1 décimale ;
--   * grants limités au rôle authenticated.
--
-- Limite connue : à exactement 3 votants, deux amis qui comparent leurs cartes
-- peuvent déduire le score du troisième votant — mais pas son identité
-- (n'importe quel compte de l'app). Compromis accepté.
--
-- Échelle : agrégation on-demand (GROUP BY sur destinations). Si la table
-- grossit, chemin d'upgrade : vue matérialisée rafraîchie par pg_cron +
-- index sur destination_community_key(name, country, country_code)
-- (possible car la fonction clé est immutable ; pg_trgm déjà actif pour la recherche).

create extension if not exists unaccent;

-- unaccent() est STABLE (dépend du dictionnaire de session) ; ce wrapper fige
-- le dictionnaire pour obtenir une fonction immutable, indexable.
create or replace function immutable_unaccent(input text)
returns text
language sql immutable strict parallel safe
as $$
  select unaccent('unaccent'::regdictionary, input)
$$;

-- Clé d'identité cross-utilisateurs d'une destination.
-- Miroir SQL de destinationCommunityKey() (src/utils/destinationIdentity.ts) :
-- nom normalisé (minuscules, sans accents, espaces réduits) + '|' + code pays
-- (fallback : nom de pays normalisé pour les lignes legacy sans country_code).
create or replace function destination_community_key(
  dest_name text,
  dest_country text,
  dest_country_code text
)
returns text
language sql immutable parallel safe
as $$
  select lower(regexp_replace(immutable_unaccent(trim(coalesce(dest_name, ''))), '\s+', ' ', 'g'))
         || '|' ||
         coalesce(
           lower(nullif(trim(dest_country_code), '')),
           lower(regexp_replace(immutable_unaccent(trim(coalesce(dest_country, ''))), '\s+', ' ', 'g'))
         )
$$;

-- Lignes éligibles à l'agrégat : vraies destinations notées.
-- Exclut les waypoints de road trip (stop/stage) ; place et zone du même nom
-- fusionnent volontairement (une ville saisie en "zone" par un utilisateur et
-- en "place" par un autre reste la même destination).
create or replace function community_eligible_destinations()
returns table (key text, user_id uuid, score numeric, standout_tags text[], name text, country text, country_code text)
language sql stable
as $$
  select
    destination_community_key(d.name, d.country, d.country_code) as key,
    d.user_id,
    d.score::numeric,
    coalesce(d.standout_tags, '{}'::text[]) as standout_tags,
    d.name,
    d.country,
    d.country_code
  from destinations d
  where d.kind in ('place', 'zone')
    and d.score is not null
$$;

-- Lookup batch pour les badges sur la liste de l'appelant.
-- Tier dérivé avec les mêmes seuils que scoreToTier (src/utils.ts) :
-- S >= 4.3, A >= 3.7, B >= 3.0, C >= 2.2, sinon D.
create or replace function get_community_ratings(keys text[])
returns table (
  key text,
  avg_score numeric,
  tier text,
  rating_count integer,
  top_tags text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select e.key, e.user_id, e.score, e.standout_tags
    from community_eligible_destinations() e
    where e.key = any(keys)
  ),
  -- 1 vote par utilisateur par destination (les revisites/doublons font une moyenne)
  per_user as (
    select key, user_id, avg(score) as score
    from eligible
    group by key, user_id
  ),
  agg as (
    select key, round(avg(score)::numeric, 1) as avg_score, count(*)::int as n
    from per_user
    group by key
    having count(*) >= 3
  ),
  tag_freq as (
    select e.key, tag, count(distinct e.user_id) as users
    from eligible e
    cross join lateral unnest(e.standout_tags) as tag
    group by e.key, tag
  ),
  -- un tag ne remonte que s'il est cité par >= 25 % des votants (minimum 2)
  top_tags as (
    select tf.key, (array_agg(tf.tag order by tf.users desc, tf.tag))[1:3] as tags
    from tag_freq tf
    join agg on agg.key = tf.key
    where tf.users >= greatest(2, ceil(agg.n * 0.25))
    group by tf.key
  )
  select
    agg.key,
    agg.avg_score,
    case
      when agg.avg_score >= 4.3 then 'S'
      when agg.avg_score >= 3.7 then 'A'
      when agg.avg_score >= 3.0 then 'B'
      when agg.avg_score >= 2.2 then 'C'
      else 'D'
    end as tier,
    agg.n as rating_count,
    coalesce(tt.tags, '{}'::text[]) as top_tags
  from agg
  left join top_tags tt on tt.key = agg.key
$$;

grant execute on function get_community_ratings(text[]) to authenticated;

-- Classement global : toutes les destinations >= 3 votants, triées par note.
-- display_name/country : la variante la plus fréquente chez les votants.
create or replace function get_community_leaderboard(
  search text default null,
  max_rows int default 100,
  offset_rows int default 0
)
returns table (
  key text,
  display_name text,
  display_country text,
  country_code text,
  avg_score numeric,
  tier text,
  rating_count integer,
  top_tags text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select * from community_eligible_destinations()
  ),
  per_user as (
    select key, user_id, avg(score) as score
    from eligible
    group by key, user_id
  ),
  agg as (
    select key, round(avg(score)::numeric, 1) as avg_score, count(*)::int as n
    from per_user
    group by key
    having count(*) >= 3
  ),
  display as (
    select
      e.key,
      mode() within group (order by e.name) as display_name,
      mode() within group (order by e.country) as display_country,
      mode() within group (order by e.country_code) as country_code
    from eligible e
    join agg on agg.key = e.key
    group by e.key
  ),
  tag_freq as (
    select e.key, tag, count(distinct e.user_id) as users
    from eligible e
    join agg on agg.key = e.key
    cross join lateral unnest(e.standout_tags) as tag
    group by e.key, tag
  ),
  top_tags as (
    select tf.key, (array_agg(tf.tag order by tf.users desc, tf.tag))[1:3] as tags
    from tag_freq tf
    join agg on agg.key = tf.key
    where tf.users >= greatest(2, ceil(agg.n * 0.25))
    group by tf.key
  )
  select
    agg.key,
    display.display_name,
    display.display_country,
    display.country_code,
    agg.avg_score,
    case
      when agg.avg_score >= 4.3 then 'S'
      when agg.avg_score >= 3.7 then 'A'
      when agg.avg_score >= 3.0 then 'B'
      when agg.avg_score >= 2.2 then 'C'
      else 'D'
    end as tier,
    agg.n as rating_count,
    coalesce(tt.tags, '{}'::text[]) as top_tags
  from agg
  join display on display.key = agg.key
  left join top_tags tt on tt.key = agg.key
  where search is null
     or trim(search) = ''
     or split_part(agg.key, '|', 1) like
        '%' || lower(regexp_replace(immutable_unaccent(trim(search)), '\s+', ' ', 'g')) || '%'
  order by agg.avg_score desc, agg.n desc, agg.key
  limit least(greatest(coalesce(max_rows, 100), 1), 200)
  offset greatest(coalesce(offset_rows, 0), 0)
$$;

grant execute on function get_community_leaderboard(text, int, int) to authenticated;

-- Teaser pour l'empty state : combien de destinations sont à un avis du seuil.
-- Retourne un simple entier — aucun nom, aucune fuite.
create or replace function get_community_teaser_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with per_user as (
    select key, user_id
    from community_eligible_destinations()
    group by key, user_id
  )
  select count(*)::int
  from (
    select key
    from per_user
    group by key
    having count(*) = 2
  ) almost
$$;

grant execute on function get_community_teaser_count() to authenticated;
