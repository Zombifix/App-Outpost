-- Le trigger d'activité ne stockait pas l'image dans le payload, donc les
-- vignettes du widget "Activité récente" restaient vides côté friends feed.
-- On ajoute `image` dans le payload pour les nouveaux events destination_added.
create or replace function activity_on_destination_change()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into activities (actor, kind, payload) values (
      new.user_id, 'destination_added',
      jsonb_build_object(
        'destination_id', new.id, 'name', new.name, 'country', new.country,
        'tier', new.tier, 'lat', new.lat, 'lng', new.lng, 'image', new.image
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
