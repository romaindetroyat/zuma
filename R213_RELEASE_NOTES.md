# R2.0.13

Le dépôt public ne contenait que des notes de version, un module `feedback.ts` cassé et deux tests pointant vers un moteur absent. R2.0.13 reconstruit l'ensemble et le rend jouable.

## Moteur (`src/core.ts`)
- `Track` polyligne paramétrée par abscisse curviligne, avec drapeaux de couche (tunnels) et extrapolation aux extrémités.
- `ZumaEngine` à pas fixe (60 Hz) : file de commandes, flux d'entrée rapide puis vitesse de croisière, composantes de chaîne, poussée avant propagée, recul local arrière propagé, attraction limitée au contact, jonctions avec réaction en chaîne (profondeur de combo), bonus saut, série, mode ZUMA, vidange et perte de vie, victoire.
- Power-ups : Bombe (rayon euclidien), Ralentir (facteur), Retour (toutes les composantes), Visée (rayon de visée et projectile accéléré) ; apparition gardée par intervalle minimal et durée de visibilité.
- Plusieurs chaînes par niveau (plateaux « dual » de l'original) ; la première reste exposée via `balls`, `removals`, `track` pour les fixtures.

## Présentation
- `feedback.ts` réparé (en-tête corrompu) et étendu : sons de défaite, fin de partie, apparition de power-up.
- Rendu canvas 640×480 avec deux modes : sprites et fonds originaux si un pack local est présent, rendu vectoriel sinon.
- HUD natif : menu, vies, score, niveau, jauge ZUMA ; bouton STATS unique ; panneau STATS monolithique (titre, données, astuce, OK dynamique).
- PWA : manifeste, icône, service worker « app shell », plein écran, tactile.
- Audio : ressources originales si disponibles, synthèse WebAudio sinon.

## Outils
- `tools/build.mjs` (dist/, `--local`, `--standalone` fichier unique), `tools/serve.mjs`, `tools/guard.mjs`.
- `tools/extract_installer.py` : extraction du CAB LZX de l'installeur PopCap.
- `tools/import-original.mjs` : décodage `CURV`, `levels.xml`, copie des sons et sprites vers `private_assets/pack` (ignoré par Git).

## Validation
- 31/31 tests `node --test`, garde-fou de publication, CI GitHub Actions (Node 22).
- Captures locales vérifiées : niveau original « Spirale du destin » avec sprites, rendu vectoriel, panneau STATS.
