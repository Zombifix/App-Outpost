-- Migration 016 : persistance de vibeBoost et retourBonus
-- Ces deux champs entrent dans le calcul du score final d'une destination
-- mais n'étaient pas stockés en base. Sans eux, le score était recalculé
-- de façon différente après rechargement ou connexion sur un autre appareil,
-- provoquant des incohérences de tier (ex. Prague B → C).

ALTER TABLE destinations
  ADD COLUMN IF NOT EXISTS vibe_boost   smallint,  -- null = non répondu (neutre = 3 dans le calcul)
  ADD COLUMN IF NOT EXISTS retour_bonus real;       -- null = 0 dans le calcul
