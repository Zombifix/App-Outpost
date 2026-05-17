-- Triggers qui alimentent automatiquement la table activities
-- quand une destination/réaction/etc est créée ou modifiée.

create or replace function activity_on_destination_change()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into activities (actor, kind, payload) values (
      new.user_id, 'destination_added',
      jsonb_build_object(
        'destination_id', new.id, 'name', new.name, 'country', new.country,
        'tier', new.tier, 'lat', new.lat, 'lng', new.lng
      )
    );
  elsif TG_OP = 'UPDATE' then
    if new.tier is distinct from old.tier then
      insert into activities (actor, kind, payload) values (
        new.user_id, 'tier_changed',
        jsonb_build_object(
          'destination_id', new.id, 'name', new.name,
          'from', old.tier, 'to', new.tier
        )
      );
    end if;
    if new.coup_de_coeur is true and (old.coup_de_coeur is distinct from new.coup_de_coeur) then
      insert into activities (actor, kind, payload) values (
        new.user_id, 'coup_de_coeur_set',
        jsonb_build_object('destination_id', new.id, 'name', new.name)
      );
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_activity_destination on destinations;
create trigger trg_activity_destination
  after insert or update on destinations
  for each row execute function activity_on_destination_change();

create or replace function activity_on_reaction_insert()
returns trigger language plpgsql security definer as $$
declare
  dest_owner uuid;
  dest_name text;
begin
  select user_id, name into dest_owner, dest_name from destinations where id = new.destination_id;
  if dest_owner is null or dest_owner = new.user_id then return new; end if;
  insert into activities (actor, kind, payload) values (
    dest_owner, 'reaction_received',
    jsonb_build_object(
      'destination_id', new.destination_id, 'destination_name', dest_name,
      'reactor', new.user_id, 'kind', new.kind
    )
  );
  return new;
end$$;

drop trigger if exists trg_activity_reaction on reactions;
create trigger trg_activity_reaction
  after insert on reactions
  for each row execute function activity_on_reaction_insert();
