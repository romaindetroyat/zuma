# R2.0.14

Première baseline issue d'une session de jeu réelle sur R2.0.13 (phase 4, « Point de validation jouable »). Elle corrige les écarts de sensation signalés par l'utilisateur : une bille tirée doit « faire sa place dans un mouvement visible », le tir doit partir de la bouche de la grenouille et le recul doit faire rouler les billes en arrière.

## Moteur (`src/core.ts`)
- Insertion progressive : nouveau champ `Ball.width` (0..1). Une bille tirée atterrit avec `width = 0` à une demi-case de la bille touchée, mémorise son point d'arrivée dans `Ball.enterFrom`, puis grandit de `1 / mergeTicks` par tick ; les billes devant elle sont poussées un peu plus à chaque tick au lieu de sauter d'une case. `CANDIDATE.mergeTicks = 12` (0,2 s à 60 Hz, dérivé du `mergespeed 0.05` de l'original à 100 Hz). Toutes les autres créations de billes (`loadFixture`, flux d'entrée, `insert()`) restent à `width = 1`.
- Contrainte d'espacement pondérée : la distance exigée entre deux voisines devient `ballSpacing × (w[i-1] + w[i]) / 2` (`gap(a, b)`) dans les composantes, `resolveForward`, `resolveBackward`, l'attraction et la détection de contact. Le flux d'entrée et la détection de brèche gardent `ballSpacing` (billes pleines).
- Détection de run différée : `land()` n'évalue plus la destruction. La bille est évaluée par `settle()` au tick où `width` atteint 1 (`enterFrom` est alors effacé) : hits, série et bonus de série y sont comptés comme avant. L'événement `destroy` survient donc exactement `mergeTicks` ticks après l'atterrissage. Le bonus saut (`gap`) reste immédiat.
- Une bille en croissance ne participe à aucun run : `runAround` s'arrête sur une voisine dont `width < 1` et une jonction qui la touche n'émet que `merge`.
- `insert()` (API de test) est inchangée : `width = 1`, poussée immédiate.
- `EngineConfig.muzzleOffset` (`CANDIDATE` : 16, égal à `ballRadius`) : le projectile part de `frog + muzzleOffset × direction`. La présentation pourra le câbler sur l'offset de bouche mesuré sur le sprite.
- `ENGINE_VERSION = '2.0.14'`.

## Présentation (`src/feedback.ts`)
- `rollFrame(s, frames, circumference = BALL_CIRCUMFERENCE)` : fonction pure et déterministe donnant la trame de roulement d'un sprite pour l'abscisse `s` (enroulement sur la circonférence, `frames ≤ 1` → 0). Elle est monotone en `s` : un recul fait décroître la trame, donc rouler visiblement les billes en arrière. Le remplacement de la formule inline de `render.ts` par cet appel relève du plan 04-03.

## Tests
- `tests/r214.test.mjs` (nouveau) : insertion progressive (largeur 0 → 0,5 → 1 sur 12 ticks, bille devant poussée progressivement puis exactement d'une case, aucune destruction pour une couleur absente) ; détection différée (`destroy` à `atterrissage + mergeTicks`, `hits` compté à ce moment seulement) ; `insert()` instantané ; `muzzleOffset` (position du projectile après un tick, valeur par défaut égale à `ballRadius`, `mergeTicks = 12`) ; `rollFrame` (monotonie avant/arrière, couverture des 50 trames, enroulement, circonférence personnalisée) ; recul inverse sur la fixture « local recoil » de r213 (trame décroissante).
- `tests/r213.test.mjs` : deux budgets de ticks relevés, assertions inchangées — « matching neighbours attract across the gap… » (`run(g, 20)` → `run(g, 24)`) et « ZUMA mode stops the feed… » (`run(g, 20)` → `run(g, 30)`). Dans les deux cas le projectile atterrit au tick 10 et la destruction n'est plus évaluée qu'au tick 22 (atterrissage + `mergeTicks`), donc après l'ancien budget de 20 ticks. r206 et r211 passent sans modification.

## Présentation, audio et outils
- Complétée par le plan 04-03 (vague 2).
