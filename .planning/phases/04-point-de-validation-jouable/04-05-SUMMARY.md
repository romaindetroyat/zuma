---
phase: 04-point-de-validation-jouable
plan: 05
subsystem: presentation-and-audio
tags: [webaudio, pulse, warning, pitcover, sprites, overlays, playwright]

# Dependency graph
requires:
  - plan: 04-03
    provides: AudioManager loops (setLoop/stopLoops), loopLevels, WARNING_DISTANCE, drawHoles, drawOverlays, ?level=S-L
  - plan: 04-06
    provides: baseline 56/56 verte, hud() en points (non touché)
provides:
  - "audio.ts : pulse(key, level) (battement répété à intervalle décroissant), warningLevel(), warningInterval(), warningGain(), WARNING_DISTANCE = 220, loopLevels() sans warning, synthèse de repli 'warning'"
  - "render.ts : RenderAssets.pitcover (feuille 12 × 88×88), Fx.threat, drawHoles(view, fx) + pitCoverFrame(threat, frames), drawOverlays(view) fixe"
  - "main.ts : fx.threat = proximité de la bille de tête, pulse('warning', niveau) coupé hors jeu, pack.sheet('pitcover', 88, '_pitcover')"
  - "tests/r214-presentation.test.mjs : 4 verrous ajoutés (warningLevel, warningInterval/warningGain, pitCoverFrame, drawOverlays statique) ; loopLevels réécrit"
affects: [04-UAT (ré-acceptation U6 alerte, U11 zoom 1-3), phase-7 (musique : LoopKey réduit à 'rolling')]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Battement répété côté AudioManager : setTimeout replanifié à chaque battement avec le niveau le plus récent (intervalle et gain relus), niveau 0 = clearTimeout ; aucune boucle"
    - "Niveau de menace unique (0..1) partagé par le son et le rendu via Fx.threat, calculé dans updateLoops()"
    - "Verrou source sur le code compilé : regex sur le corps de la méthode `drawOverlays(view) {` dans .compiled/render.js"

key-files:
  created: []
  modified:
    - src/audio.ts
    - src/main.ts
    - src/render.ts
    - tests/r214-presentation.test.mjs
    - R214_RELEASE_NOTES.md

key-decisions:
  - "Interpolation linéaire 1,1 s → 0,22 s et 0,35 → 1 (bornes du plan), écrite `far·(1−l) + near·l` pour des extrémités exactes"
  - "Le couvercle suit la proximité de la chaîne même en vidange (état ≠ playing) : il reste ouvert pendant que les billes tombent dans le trou ; seul le battement est coupé hors jeu (D-08)"
  - "stopLoops() arrête aussi les battements (un seul point de coupure pour pause/menu/STATS/changement de niveau)"
  - "Synthèse de repli `warning` (sinus 180 → 110 Hz, 0,14 s) pour le mode sans pack, au lieu du son `insert` par défaut"
  - "tools/import-original.mjs non modifié : pitcover/_pitcover figuraient déjà dans IMAGES (pack 77 images)"

# Metrics
duration: ~25 min
completed: 2026-10-10
tasks: 4
files: 5
---

# Phase 4 Plan 05: Alerte progressive, couvercle du crâne, calques fixes — Summary

**Le battement original `warning1` (0,37 s) remplace la boucle d'alerte : rejoué à un intervalle qui se resserre de 1,1 s à 0,22 s (gain 0,35 → 1) selon la proximité de la bille de tête (zone 220 px) ; le couvercle du crâne `pitcover` (12 trames) s'ouvre avec la même menace ; les calques BackgroundAlpha sont dessinés fixes (plus d'effet de zoom en 1-3).**

## Performance

- **Duration:** ~25 min
- **Tasks:** 4 (1, 2, 2b, 3)
- **Files modified:** 5

## Task Commits

| # | Tâche | Commit | Fichiers |
|---|-------|--------|----------|
| 1 | Battement d'alerte progressif (`pulse`, `warningLevel/Interval/Gain`, `WARNING_DISTANCE` 220) | `e3c7912` | src/audio.ts, src/main.ts, tests/r214-presentation.test.mjs |
| 2 | Couvercle du crâne (`pitcover`, `Fx.threat`, `pitCoverFrame`) | `7109f70` | src/render.ts, src/main.ts, tests/r214-presentation.test.mjs |
| 2b | Calques BackgroundAlpha fixes (suppression de l'oscillation) | `eee25b9` | src/render.ts, tests/r214-presentation.test.mjs |
| 3 | Notes de version, importateur, standalone | `4f41f48` | R214_RELEASE_NOTES.md |

Le SUMMARY n'est pas commité par l'exécuteur (consigne de l'orchestrateur) ; STATE.md et ROADMAP.md non modifiés.

## Ce qui a été fait

### Task 1 — alerte progressive
- `audio.ts` : `WARNING_DISTANCE = 220` ; `warningLevel(headDistance, playing) = clamp(1 − d / 220)` (0 hors zone, vidange ou sans bille) ; `warningInterval(level)` = 1,1 s → 0,22 s et `warningGain(level)` = 0,35 → 1 (linéaires, bornées, NaN → 0) ; `pulse(key, level)` joue `warning` immédiatement si silencieux puis replanifie (`window.setTimeout`) à `warningInterval(level)` ; le niveau est relu à chaque battement, `level = 0` annule le timer (le battement en cours finit) ; `stopLoops()` arrête boucles et battements ; `LoopKey = 'rolling'`, `loopLevels()` ne renvoie plus que `rolling` ; synthèse de repli `warning` ajoutée.
- `main.ts` : `updateLoops` calcule la distance de la bille de tête (min sur les chaînes) → `pulse('warning', level)` ; branche pause/menu/STATS → `pulse('warning', 0)` ; `stopLoops()` déjà appelé à chaque changement de panneau/niveau.
- Mesure Playwright (`warning-beats.mjs`, `?level=1-1` sans tir, hook sur `AudioBufferSourceNode.start`) : 8 battements de 0,366 s, intervalles **1098 → 881 → 706 → 561 → 451 → 361 → 288 ms**, une seule source en boucle (rolling, 1,21 s), console propre.

### Task 2 — couvercle du crâne
- `render.ts` : `RenderAssets.pitcover: Sheet | null` ; `Fx.threat` ; `drawHoles(view, fx)` dessine après `hole` la trame `pitCoverFrame(fx.threat, frames)` (= `floor(t × 11)`, bornée) centrée sur l'extrémité de piste avec la rotation du crâne ; `pitCoverFrame` exporté. Sans pack : rien.
- `main.ts` : `pack.sheet('pitcover', 88, '_pitcover')` dans `loadAssets` ; `fx.threat = warningLevel(d, true)` (le couvercle reste ouvert en vidange), `pulse('warning', playing ? threat : 0)`.
- Captures (`pitcover-shots.mjs`) : `pitcover-far.png` (4 s, trame 0 : couvercle fermé, tête de mort dorée), `pitcover-near.png` (intervalle < 450 ms, trame ≥ 9 : seules les dents du haut restent), `pitcover-drain.png` (trou ouvert, bille en train de tomber) ; `pitcover-crops.png` = les trois zones du crâne côte à côte (×3).

### Task 2b — calques fixes (U11)
- `render.ts` : `drawOverlays(view)` dessine chaque calque à `(o.x, o.y)` ; plus de `Math.sin`, de paramètre `frame`, ni de vecteur `(vx, vy)` appliqué (conservé dans les données).
- Test : lecture de `.compiled/render.js`, corps de `drawOverlays(view) {` → `drawCutouts(` sans `Math.sin|cos`, `wobble|phase|frame`, `vx|vy`, `scale(` et avec `drawImage(o.image, o.x, o.y)`.
- Mesure (`overlay-static.mjs`, `?level=1-3` à 0,5 s et 3 s) : diff par cellules 40×40 (seuil 8/255) = **0 sur toutes les zones de mosaïque** ; seules les billes, le titre du niveau qui s'efface et les yeux de la grenouille diffèrent (`overlay-1-3-diff.png`).

### Task 3 — notes, importateur, standalone
- `R214_RELEASE_NOTES.md` : lignes « Calques fixes » et « Couvercle du crâne » (Présentation), « Alerte progressive » (Audio, la ligne « Boucles » corrigée : `rolling` seule), ligne Tests complétée.
- `node tools/import-original.mjs` : `22 levels, 25 curves, 37 sounds, 37 m4a, 77 images`.
- `node tools/build.mjs --standalone` : `standalone/zuma-standalone.html` = 10,4 MiB (10 927 400 octets).
- `npm test` : **60/60** (56 + 4), garde « 462 tracked files, none proprietary » ; `npm run check` propre.
- Standalone (`standalone-0405.mjs`, `file://…?level=1-1`) : badge `R2.0.14 · 2.0.14+20261010T103933 · ressources originales`, `images/pitcover.gif` + `images/_pitcover.gif` et `sounds/warning.{ogg,m4a}` embarqués, battements 1098 → 361 ms, console propre (erreurs et avertissements) ; `standalone-0405-far.png` / `-near.png` / `-crops.png`.

## Preuves (captures hors dépôt, jamais commitées)

Dossier : `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r214/`

| Fichier | Contenu |
|---------|---------|
| `pitcover-far.png`, `pitcover-near.png`, `pitcover-drain.png`, `pitcover-crops.png` | niveau 1-1 servi : couvercle fermé / presque ouvert / trou ouvert en vidange |
| `overlay-1-3-t05.png`, `overlay-1-3-t3.png`, `overlay-1-3-diff.png` | niveau 1-3 à 0,5 s et 3 s, masque des pixels différents (billes + titre uniquement) |
| `standalone-0405-far.png`, `standalone-0405-near.png`, `standalone-0405-crops.png` | même contrôle sur le standalone |

Scripts (scratchpad) : `warning-beats.mjs`, `pitcover-shots.mjs`, `overlay-static.mjs`, `standalone-0405.mjs`, `pit/pitcover-sheet.png` (planche des 12 trames + masque, pour vérifier que la trame 0 est fermée).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Couvercle refermé pendant la vidange**
- **Found during:** Task 2 (capture « near » prise après la perte : le couvercle était revenu à la trame 0 alors que les billes tombaient dans le trou)
- **Issue:** `fx.threat` reprenait le niveau audio, nul dès que `engine.state ≠ 'playing'`.
- **Fix:** `fx.threat = warningLevel(d, true)` (proximité pure) ; le battement reste `playing ? threat : 0` (D-08 inchangé pour le son).
- **Files modified:** src/main.ts — **Commit:** `7109f70`

**2. [Rule 1 - Bug] Extrémités inexactes de l'interpolation**
- **Found during:** Task 1 (test `warningInterval(1)` → 0,21999999999999997)
- **Fix:** `far·(1 − l) + near·l` au lieu de `far + (near − far)·l`.
- **Commit:** `e3c7912`

**3. Verrou source : ancrage sur la définition de méthode**
- **Found during:** Task 2b (le test attrapait l'appel `this.drawOverlays(view)` de `draw()` au lieu de la méthode)
- **Fix:** `src.search(/\n\s*drawOverlays\(view\) \{/)`.
- **Commit:** `eee25b9`

### Hors plan
- `tools/import-original.mjs` (listé dans `files_modified`) n'a pas eu besoin de changement : `pitcover`/`_pitcover` étaient déjà dans `IMAGES` et dans le pack.
- Les lignes existantes des notes décrivant la boucle `warning` (160 px) et la dérive des calques ont été corrigées en plus des deux lignes ajoutées, pour que les notes décrivent l'état réel de R2.0.14.
- Note d'exploitation : `npm test` rebâtit `dist/` **sans** le pack ; une capture Playwright lancée juste après tombe en mode vectoriel (constaté une fois, capture refaite après `build --local`). `dist/` a été rebâti avec `--local` en fin d'exécution.

## Auth gates
Aucune.

## Known Stubs
Aucun : `pitcover` et `warning` sont câblés sur les ressources du pack, avec repli (rien / synthèse) sans pack.

## Threat Flags
Aucune surface nouvelle : `pulse()` ne crée qu'un `setTimeout` par clé, annulé à `level = 0` et par `stopLoops()` ; niveaux bornés 0..1 et NaN → 0 (T-04-12 étendu aux battements).

## Human check (en attente — ne bloque pas ce plan)
À réaliser par l'utilisateur sur `standalone/zuma-standalone.html` : (U6) l'alerte près du crâne est un battement qui s'accélère progressivement, sans à-coup ; le couvercle du crâne s'ouvre à l'approche ; (U11) plus aucun effet de zoom/respiration en 1-3. Consigner dans `04-UAT.md`.

## Next Phase Readiness
- Phase 7 (musique) : `LoopKey` ne contient plus que `'rolling'` ; `PulseKey` = `'warning'`. Élargir `LoopKey` pour une boucle musicale.
- `WARNING_DISTANCE` (220) et les bornes 1,1 s / 0,22 s sont des constantes exportées : ajustables après la ré-acceptation sans toucher au câblage.

## Self-Check: PASSED
- Commits présents dans `git log` : e3c7912, 7109f70, eee25b9, 4f41f48.
- Fichiers présents : src/audio.ts, src/main.ts, src/render.ts, tests/r214-presentation.test.mjs, R214_RELEASE_NOTES.md, standalone/zuma-standalone.html, ce SUMMARY.
- Aucun TODO/FIXME/placeholder dans les sources touchées ; `git status` : seul le SUMMARY est non suivi, aucun `.png` dans le dépôt ; captures présentes dans le scratchpad (10 fichiers `pitcover-*`, `overlay-1-3-*`, `standalone-0405-*`).
