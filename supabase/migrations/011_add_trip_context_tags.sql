-- Outpost — tags optionnels du contexte de séjour.
-- Ils n'entrent pas dans le calcul de score : ils servent uniquement à mieux
-- qualifier l'expérience affichée sur les cartes/reviews.

alter table destinations add column if not exists trip_types text[];
alter table destinations add column if not exists standout_tags text[];
