-- Outpost — marqueur "j'ai vécu là-bas".
-- Affichage uniquement : ne rentre pas dans le score, sert à montrer un badge
-- maison (🏠) sur la map à la place du pin classique.

alter table destinations add column if not exists lived_there boolean;
