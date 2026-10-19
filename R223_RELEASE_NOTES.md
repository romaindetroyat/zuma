# R2.0.23 — billes qui apparaissent subitement

Correctif du retour de jeu « certaines boules apparaissent subitement ». Un détecteur automatique (moteur réel et pack, tous les niveaux, 304 parties simulées de 4 minutes avec tirs aléatoires) a trouvé quatre causes indépendantes, confirmées dans Chromium avec le rendu réel ; les quatre sont corrigées et verrouillées par `tests/r223-appear.test.mjs`. Rapport : `.planning/debug/balls-appear-suddenly.md`.

## Corrections

1. **Nouveau niveau dessiné sur l'ancien plateau** (`src/main.ts`, `startLevel`) : pendant le chargement des images d'un niveau, les chaînes du nouveau niveau avançaient déjà et étaient dessinées sur le décor du niveau précédent, puis le plateau changeait d'un coup avec une chaîne déjà avancée. Les images sont désormais chargées d'abord ; niveau, moteur et rendu basculent ensemble.
2. **Remplissage d'un coup au milieu de la piste** (`src/core.ts`, `spawnBalls`) : quand les billes arrière (y compris celle en attente à l'entrée) étaient détruites, toute la portion entre l'entrée et la bille suivante était remplie en une image (jusqu'à 25 billes sur 2-5). Comme dans l'original (`0x418510`), une nouvelle bille n'entre plus qu'à l'entrée de la piste ; l'arrivée rapide du début de niveau reste continue.
3. **Chaîne arrière qui saute en arrière au contact** (`src/core.ts`, `pushBehind`) : un recul réglait en une seule image les chevauchements laissés par des billes roulées dans des billes en train d'exploser (saut jusqu'à ~100 px). Une bille poussée ne recule plus davantage que celle qui la pousse.
4. **Billes dessinées avant le début de la piste** (`src/render.ts`) : sur la spirale inversée (9-7, 12-7), le départ est au milieu du plateau sous le crâne et chaque bille entrante surgissait au-dessus. Les billes ne sont plus dessinées avant un départ situé sur le plateau ; les autres plateaux sont inchangés.

## Mesures (même échantillon, avant → après)

| Mesure | Avant | Après |
| --- | --- | --- |
| Remplissages en cours de partie | 10 | 0 |
| Sauts de plus de 30 px | 6 | 0 |
| Disparitions au milieu de la piste | 13 | 0 |
| Plus grand déplacement en une image | 99,1 px | 40,7 px (arrivée rapide du début seulement) |
| Images incohérentes au changement de niveau | 25 (400 ms de latence) | 0 |

## Hypothèses et points ouverts

- Les billes pas encore sur la piste (avant l'entrée) peuvent encore faire partie d'une explosion ou d'une bombe ; sans effet visible désormais.
- Le comportement de l'original quand des billes vivantes chevauchent des billes en train d'exploser n'est pas établi.
- À confirmer sur l'appareil de l'utilisateur.

## Version

`ENGINE_VERSION` = `package.json` = 2.0.23 (`tests/r223.test.mjs`) ; 579 tests.
