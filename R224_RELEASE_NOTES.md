# R2.0.24 — recommencer, reprendre, barème des brèches, vitesses des niveaux

Trois retours de jeu traités ensemble. Rapports : `.planning/debug/scoring-audit.md`, `.planning/debug/level-settings-audit.md`.

## Menus (demande de l'utilisateur)

- **Menu du jeu** : bouton « Recommencer » (à côté de « Aide ») → « Recommencer ? — Voulez-vous vraiment recommencer la partie ? » OUI / NON (NON par défaut). OUI repart de 1-1 (score 0, 3 grenouilles, sauvegarde remplacée) ; la partie abandonnée n'entre ni dans les records ni dans les records partagés. NON / Échap : retour au menu, jeu en pause.
- **Écran d'accueil** : dès qu'une partie est sauvegardée, la question originale « CONTINUER ? » s'affiche d'elle-même (lancement, rechargement, retour par « Menu principal »), avec « Niveau S-L » et « Score : N ». « Rejouer » demande « Vraiment ? » OUI / NON avant d'effacer la sauvegarde (textes originaux `ARE_YOU_SURE_?`, `YOUR_GAME_WAS_SAVED_WHEN_YOU_QUIT`).
- Les sessions de revue (`?level=`) n'écrivent toujours rien. Verrous : `tests/r224-menus.test.mjs`.

## Barème (audit de l'exécutable)

- **Tir dans une brèche qui referme la chaîne** : l'enchaînement n'est plus remis à zéro quand la bille se pose face à sa couleur de l'autre côté d'une brèche (bille « en attente », voisins à 42 px ou plus, 0x421d59 / 0x401820) ; le bonus d'enchaînement s'applique aussi au match provoqué par l'attraction (0x42198f). C'était la principale sous-notation.
- **Tir par-dessus une série en train d'exploser** : compté comme une brèche (500 par brèche), comme l'original.
- **Largeur de brèche** mesurée de centre à centre (0x414e19) au lieu de bord à bord ; la brèche où se pose la bille ne compte plus ; détection seulement sans collision. Chaque brèche rapporte un peu moins qu'avant (2 billes manquantes : 440 au lieu de 500). **Décision utilisateur (2026-10-12)** : garder les montants du jeu original (largeur de centre à centre).
- Inchangés et vérifiés : points par bille et combos, pièces, vie tous les 50 000, ACE TIME, décompte de fin de niveau. Verrous : `tests/r224-scoring.test.mjs`.

## Vitesses des niveaux (levels.xml de l'utilisateur)

- Le fichier fourni est identique à celui du pack ; chaque niveau lisait déjà ses réglages (`lvlNM` de `StageProgression`), sans héritage entre `<Settings>` (valeurs par défaut de l'exécutable seulement).
- **Zone lente avant le crâne** : le pousseur descend de 0,1 px/maj sans butée puis remonte de 0,005 px/maj (0x4188a7–0x4188e6). Nos chaînes atteignaient le crâne 2 à 14 % trop tôt (moyenne −4,7 %) ; désormais à −0,7 % en moyenne du modèle de l'original (73 plateaux sur 76 à moins de 2 %). Exemple : 1-1 sans tirer, 78 s → 83 s.
- **Arrivée rapide** : distance comptée en points de courbe (⌊points × start / 100⌋), comme l'original.
- **Couleurs** : fixées par l'étage en aventure (4 / 5 / 6, 0x420021–0x420068), l'attribut `colors` étant ignoré par l'exécutable. Verrous : `tests/r224-settings.test.mjs` (lit le pack privé s'il est présent).

## Version

`ENGINE_VERSION` = `package.json` = 2.0.24 (`tests/r224.test.mjs`).
