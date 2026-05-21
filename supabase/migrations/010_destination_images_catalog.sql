-- Outpost - catalogue global des images de destinations

alter table destinations add column if not exists destination_key text;
alter table destinations add column if not exists osm_id bigint;
alter table destinations add column if not exists osm_type text;
alter table destinations add column if not exists country_code text;

alter table destinations drop constraint if exists destinations_image_provider_check;
alter table destinations add constraint destinations_image_provider_check
  check (image_provider is null or image_provider in ('unsplash','pexels','wikivoyage','wikipedia','wikimedia','fallback'));

alter table destinations drop constraint if exists destinations_osm_type_check;
alter table destinations add constraint destinations_osm_type_check
  check (osm_type is null or osm_type in ('N','W','R','node','way','relation'));

create index if not exists destinations_destination_key_idx on destinations(destination_key);

create table if not exists destination_images (
  destination_key text primary key,
  image_url text not null,
  image_source text not null,
  provider_image_id text,
  photographer_name text,
  photographer_url text,
  source_url text,
  alt text,
  width int,
  height int,
  score numeric,
  status text not null default 'active',
  is_manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_validated_at timestamptz,
  constraint destination_images_source_check
    check (image_source in ('unsplash','pexels','wikivoyage','wikipedia','wikimedia','fallback')),
  constraint destination_images_status_check
    check (status in ('active','resolving','failed','disabled')),
  constraint destination_images_dimensions_check
    check ((width is null or width > 0) and (height is null or height > 0))
);

create index if not exists destination_images_status_idx on destination_images(status);
create index if not exists destination_images_updated_idx on destination_images(updated_at desc);

drop trigger if exists destination_images_updated_at on destination_images;
create trigger destination_images_updated_at before update on destination_images
  for each row execute function set_updated_at();

alter table destination_images enable row level security;

drop policy if exists "destination_images_public_active_read" on destination_images;
create policy "destination_images_public_active_read" on destination_images
  for select using (status = 'active');

update destinations
set destination_key = case
  when osm_type is not null and osm_id is not null then
    'osm_' ||
    case lower(osm_type)
      when 'n' then 'node'
      when 'w' then 'way'
      when 'r' then 'relation'
      else lower(osm_type)
    end || '_' || osm_id::text
  else
    'slug_' || trim(both '_' from regexp_replace(
      lower(coalesce(kind, 'place') || '_' || coalesce(name, '') || '_' || coalesce(country, '') || '_' ||
        round(lat::numeric, 3)::text || '_' || round(lng::numeric, 3)::text),
      '[^a-z0-9]+',
      '_',
      'g'
    ))
end
where destination_key is null;

insert into destination_images (
  destination_key,
  image_url,
  image_source,
  photographer_name,
  source_url,
  score,
  status,
  is_manual_override,
  created_at,
  updated_at,
  last_validated_at
)
select distinct on (d.destination_key)
  d.destination_key,
  d.image,
  d.image_provider,
  d.image_author,
  d.image_source_url,
  0,
  'active',
  false,
  now(),
  now(),
  now()
from destinations d
where d.destination_key is not null
  and d.image is not null
  and d.image_provider in ('pexels','wikipedia','wikivoyage','wikimedia')
  and d.image_provider <> 'fallback'
  and d.image_source_url is not null
order by
  d.destination_key,
  case d.image_provider
    when 'pexels' then 1
    when 'wikipedia' then 2
    when 'wikivoyage' then 3
    when 'wikimedia' then 4
    else 9
  end,
  d.updated_at desc
on conflict (destination_key) do nothing;
