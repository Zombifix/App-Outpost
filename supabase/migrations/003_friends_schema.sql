-- Système d'amis Outpost — schéma
-- Modèle : amitié symétrique avec demande pending/accepted/blocked.
-- Une seule ligne par paire d'utilisateurs (user_low, user_high) où user_low < user_high.

-- Profil public — ce qu'un ami (ou un visiteur via ?u=handle) peut voir
create table if not exists public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9-]{2,32}$'),
  display_name text not null,
  avatar_bg text default '#e5e5e5',      -- couleur de fond des initiales
  avatar_fg text default '#1a1a1a',      -- couleur du texte des initiales
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists public_profiles_handle_trgm_idx
  on public_profiles using gin (handle gin_trgm_ops);
create index if not exists public_profiles_displayname_trgm_idx
  on public_profiles using gin (display_name gin_trgm_ops);

drop trigger if exists public_profiles_updated_at on public_profiles;
create trigger public_profiles_updated_at before update on public_profiles
  for each row execute function set_updated_at();

-- Amitiés symétriques
do $$ begin
  create type friendship_status as enum ('pending', 'accepted', 'blocked');
exception when duplicate_object then null; end $$;

create table if not exists friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  initiator uuid not null references auth.users(id) on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz default now(),
  accepted_at timestamptz,
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (initiator = user_low or initiator = user_high)
);
create index if not exists friendships_user_low_idx on friendships(user_low) where status = 'accepted';
create index if not exists friendships_user_high_idx on friendships(user_high) where status = 'accepted';

-- Invitations par email pour des inconnus pas encore inscrits
create table if not exists friend_invites (
  token uuid primary key default gen_random_uuid(),
  inviter uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id)
);
create index if not exists friend_invites_email_open_idx
  on friend_invites(lower(email)) where consumed_at is null;
create index if not exists friend_invites_inviter_idx on friend_invites(inviter);

-- Feed d'activité
do $$ begin
  create type activity_kind as enum (
    'destination_added','tier_changed','coup_de_coeur_set',
    'roadtrip_created','roadtrip_stop_added','friendship_accepted',
    'reaction_received','mutual_destination','milestone'
  );
exception when duplicate_object then null; end $$;

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  kind activity_kind not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists activities_actor_created_idx on activities(actor, created_at desc);
create index if not exists activities_created_idx on activities(created_at desc);

-- Réactions sur les destinations d'un ami
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references destinations(id) on delete cascade,
  kind text not null check (kind in ('clap','idea','want')),
  created_at timestamptz default now(),
  unique (user_id, destination_id, kind)
);
create index if not exists reactions_dest_idx on reactions(destination_id);
