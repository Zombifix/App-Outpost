# Protocole de test — Group 2 (à valider avant commit)

Objectif : vérifier les 16 améliorations « useful » appliquées localement avant un éventuel commit. Aucun changement n'a été poussé. La sauvegarde reste intacte dans `../App-Outpost-backup-2026-05-23`.

> Légende statut : ✅ OK · ⚠️ à corriger · ⏭️ non testable / non applicable

Configuration matérielle conseillée :
- **Desktop** : navigateur en 1440 × 900 (DevTools → Toggle device toolbar → Responsive)
- **Mobile** : iPhone 14 Pro (390 × 844) via DevTools, ou un vrai téléphone branché
- Recharger entre chaque test (Ctrl/Cmd + R) pour éliminer les états en mémoire

Pour ouvrir l'app : `npm run dev` puis l'URL Vite affichée (par défaut `http://localhost:5173`).

---

## A. Carte & écrans vides

### A1. (2.5) Carnet vide → CTA visible
1. Vider le carnet : ouvrir Compte → « Vider mon carnet » (ou démarrer en mode déconnecté avec localStorage vide).
2. Sur la vue Carte, vérifier qu'apparaît au centre une carte « **Ton carnet est vide** » avec bouton « + Ajouter ma première destination ».
3. Cliquer sur le bouton → wizard d'ajout s'ouvre.
- [ ] Statut : ___

### A2. (2.4) Filtre sans résultat → CTA reset
1. Avoir au moins 2–3 destinations.
2. Topbar / Filtres → cocher « < 300 € » + « Récent » + Durée « Court » pour forcer 0 résultat.
3. Vérifier qu'apparaît la carte « **Aucun résultat pour ces filtres** » avec bouton **Réinitialiser les filtres**.
4. Cliquer reset → les destinations réapparaissent.
- [ ] Statut : ___

### A3. (2.7) Map shimmer pendant le chargement
1. DevTools → Network → throttle « Slow 3G ».
2. Recharger (Ctrl + Shift + R pour bypass cache).
3. Pendant que les tuiles MapTiler chargent, observer un dégradé beige animé sur la zone carte (au lieu d'un beige plat figé).
4. Une fois les tuiles affichées, le shimmer disparaît.
- [ ] Statut : ___

---

## B. Fiche destination (mobile)

### B1. (2.1) Bottom sheet n'apparaît qu'≤ 900 px
1. Desktop 1440 px : sélectionner une destination → carte latérale **à droite**, pas de sheet bas.
2. Réduire la fenêtre à 1024 px (laptop) → toujours la carte latérale (250 px de large).
3. Réduire à 800 px → toujours la carte latérale étroite.
4. Réduire à 700 px → **bottom sheet** apparaît à la place.
5. Inverse : en mode mobile (390 × 844 DevTools), c'est bien la bottom sheet.
- [ ] Statut : ___

### B2. (2.2) Sheet peek ne couvre plus que ~45 % de l'écran
1. Sur mobile 390 × 844, ouvrir une destination.
2. En position « peek » (à l'ouverture), la carte est visible **au-dessus** sur environ 55 % de la hauteur de l'écran (avant : ~40 %).
3. Le hero image de la fiche est partiellement visible en bas.
- [ ] Statut : ___

### B3. (2.3) Drag depuis le hero, pas seulement la poignée
1. Sur mobile, ouvrir une destination en peek.
2. **Glisser depuis l'image de hero vers le haut** → la sheet doit s'agrandir.
3. **Glisser depuis l'image de hero vers le bas** → la sheet doit se rétracter / fermer.
4. **Glisser depuis le contenu sous le hero (notes, boutons)** → la sheet **ne** doit **pas** bouger (le scroll interne fonctionne).
- [ ] Statut : ___

### B4. (2.15) Bouton « Coup de cœur » toujours visible
1. Ouvrir une destination qui n'est **pas** coup de cœur, et avec moins de 2 coups de cœur déjà actifs dans le carnet.
2. Dans le hero, vérifier la présence d'un bouton blanc/transparent **🤍 Coup de cœur** (avant : invisible).
3. Cliquer dessus → bouton devient ❤️ rouge « Coup de cœur » (état actif).
4. Cliquer à nouveau → retire le coup de cœur.
5. Si déjà 2 coups de cœur dans le carnet, le bouton ne s'affiche **pas** sur une 3ᵉ destination non favorite (limite respectée).
- [ ] Statut : ___

---

## C. Road trip

### C1. (2.8) « Voir le trajet » déplie réellement la route
1. Avoir un road trip (kind zone avec stops) — ex. créer un road trip « Test » avec 2–3 étapes via le wizard.
2. Ouvrir la fiche du road trip.
3. Cliquer **Voir le trajet** : la carte zoome **et** la ligne du trajet apparaît avec les pastilles d'étapes (avant : zoom seulement, pas de ligne).
4. Cliquer ailleurs sur la carte → ligne disparaît.
- [ ] Statut : ___

---

## D. Accessibilité

### D1. (2.10) Contraste du texte secondaire
1. DevTools → Inspecter un sous-titre topbar « *X destinations notées* » → couleur computed ≈ `rgb(90, 106, 132)` (était `#7d8aa3`).
2. Lighthouse → Accessibility → contraste : le score sur ces éléments doit s'améliorer (pas de violation AA sur les sous-titres principaux).
3. Lire « Aucune activité pour l'instant » dans la sidebar : doit rester lisible sans plisser les yeux.
- [ ] Statut : ___

### D2. (2.11) Cibles tactiles ≥ 44 px mobile
1. Mobile 390 × 844 DevTools.
2. Inspecter les boutons « + Ajouter mon premier ami », « Voir sur la carte », bouton ❤️ : `height` computed ≥ 44 px.
3. Tap test (Pointer mode) sur ces boutons depuis un coin → activation correcte.
- [ ] Statut : ___

### D3. (2.9) Focus trap dans les modaux
1. Ouvrir le panel « Mon compte » (badge utilisateur en haut à droite).
2. Tab répété → le focus circule uniquement entre les boutons/inputs du panel, **ne sort jamais** dans l'app derrière.
3. Shift+Tab inverse, idem.
4. Fermer le panel (X) → le focus revient sur le badge utilisateur (élément qui avait le focus avant ouverture).
5. Refaire pour : « Ajouter un ami », « Gestion des amis » (icône Amis en bottom-nav mobile / topbar desktop), « Profil setup » (au premier login, ou simuler en signOut + signUp).
- [ ] Statut : ___

---

## E. Carte mobile

### E1. (2.13) Contrôles « Recadrer » au-dessus du tier board
1. Mobile 390 × 844.
2. **Tier list pliée** : bouton « Recadrer » visible juste au-dessus de la poignée du tier board.
3. **Tier list dépliée** : bouton « Recadrer » remonte automatiquement au-dessus de la nouvelle hauteur du tier board (n'est pas masqué).
4. Cliquer le bouton dans les deux états → la carte se recadre.
- [ ] Statut : ___

### E2. (2.14) Header mobile ne masque pas la zone de tap
- **Note** : non corrigé dans ce lot (fix architectural — voir « limitations » plus bas). Vérifier visuellement que rien ne s'est dégradé : header mobile en haut, pins de la carte cliquables sous l'avatar de droite ne déclenchent **pas** le panel compte.
- [ ] Statut : ___

---

## F. Polish & UX

### F1. (2.12) Section Explorer ne ment plus
1. Onglet Explorer.
2. Vérifier le chip « **Aperçu — IA bientôt connectée** » (avant : « IA bientot connectee »).
3. Le compteur « X destinations fortes détectées dans ta tier list » a disparu (pour ne plus faire croire à de la personnalisation).
4. Cliquer une suggestion « Voir un exemple sur la carte » → ouvre la bonne ville (Seoul → Seoul, Porto → Porto, Osaka → Osaka, **pas Kyoto** — fix 1.1 group 1).
- [ ] Statut : ___

### F2. (2.16) Erreur Supabase non configurée → message user-friendly
1. Mode local sans `.env.local` (ou déconnecté avec Supabase HS).
2. Aller sur l'onglet Amis → page indique simplement « **Cette fonctionnalité n'est pas encore disponible.** » (plus de bloc `<code>` raw avec commandes CLI visibles).
3. Console (DevTools) : la note technique apparaît en `console.info` (en mode dev uniquement).
- [ ] Statut : ___

### F3. (2.17) Plus de `window.prompt` / `window.confirm`
1. **Copier un lien de partage** depuis le compte ou le modal « Ajouter un ami » : aucun popup natif ne s'ouvre, juste un toast/feedback « Lien copié ».
2. (Cas dégradé) si le navigateur bloque le clipboard, le code log un warning console au lieu d'ouvrir un prompt.
3. **Retirer un ami** depuis la vue Amis : clic sur « Retirer » → le bouton devient « **Annuler** » + un bouton « **Confirmer** » apparaît à côté (pas de popup `confirm()` natif). Annuler revient à l'état initial.
4. Idem dans le mini-panel « Gestion des amis » : icône X → ligne affiche « Retirer X ? » avec ✓ confirmer / × annuler.
- [ ] Statut : ___

---

## G. Tests de non-régression (déjà OK Group 1 — re-vérifier)

- [ ] Bouton « Coup de cœur » dans le hero limite toujours à 2 max.
- [ ] Compteur de la tier list correct (exclut les `stop`).
- [ ] Topbar h1 affiche « Amis » sur l'onglet Amis.
- [ ] Carnet stats activable par clavier (Enter + Espace).
- [ ] Bannière d'erreur Supabase (en haut, fond rouge pâle) apparaît si sync échoue.
- [ ] Aucune erreur dans la console (DevTools → Console → niveau Errors only).

---

## Limitations connues (non corrigées dans ce lot)

| # | Description | Raison du skip |
|---|---|---|
| 2.6 | Pins de la carte non navigables au clavier | Effort élevé (L) — refactor des handlers SVG MapLibre, à planifier séparément. |
| 2.14 | Padding map vs mobile-header | `getMapFitPadding` gère déjà l'inset via `visibleRect('.mobile-header')`. Pas d'évidence de régression observée — re-checker avec un vrai téléphone si nécessaire. |

---

## Si quelque chose casse

1. Aucun commit n'a été fait → `git stash` ou `git checkout -- .` restaure tout.
2. Sauvegarde complète intacte : `C:\Users\theop\OneDrive\Documents\GitHub\App-Outpost-backup-2026-05-23`.
3. Pour comparer un fichier : `git diff src/components/DestinationSheet.tsx` (ou autre).
