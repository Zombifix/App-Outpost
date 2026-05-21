-- Outpost — ajout des axes de notation "ease" (facilité sur place) et
-- "memorability" (souvenir laissé). Optionnels : les destinations existantes
-- restent valides avec null sur ces colonnes, et la review côté UI les masque
-- tant qu'elles ne sont pas renseignées.

alter table destinations add column if not exists ease numeric
  check (ease is null or (ease >= 1 and ease <= 5));
alter table destinations add column if not exists memorability numeric
  check (memorability is null or (memorability >= 1 and memorability <= 5));
