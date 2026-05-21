-- Outpost — alignement schéma destinations avec le type TS
-- 1) Assouplir la contrainte image_provider (le code utilise 'wikivoyage' et 'wikipedia')
-- 2) Ajouter les colonnes manquantes pour permettre la sync bidirectionnelle complète

-- 1) image_provider : ajouter les valeurs manquantes
alter table destinations drop constraint if exists destinations_image_provider_check;
alter table destinations add constraint destinations_image_provider_check
  check (image_provider is null or image_provider in ('pexels','wikivoyage','wikipedia','wikimedia','fallback'));

-- 2) Colonnes manquantes pour aligner la table sur le type Destination côté TS
alter table destinations add column if not exists image_search_version int;
alter table destinations add column if not exists trip_year int;
alter table destinations add column if not exists trip_days int;
alter table destinations add column if not exists companions text
  check (companions is null or companions in ('solo','couple','amis','famille','travail'));
alter table destinations add column if not exists personal_budget numeric;
alter table destinations add column if not exists standout text;
