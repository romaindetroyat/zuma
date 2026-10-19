---
phase: 04-point-de-validation-jouable
plan: 03
subsystem: presentation-and-audio
tags: [canvas, sprites, frog, tongue, eyeblink, webaudio, canPlayType, preload, loops, playwright, tdd]

# Dependency graph
requires:
  - plan: 04-01
    provides: manifest.json format 2 (ogg + m4a), Renderer.resize/DPR, « Pixels nets », fond 1:1 + overlays
  - plan: 04-02
    provides: Ball.width/enterFrom, EngineConfig.mergeTicks/muzzleOffset, rollFrame()/BALL_CIRCUMFERENCE
provides:
  - "feedback.insertionPose(width, from, to) → { x, y, scale } (ease-out, grossissement ≤ 15 %)"
  - "render: drawChain interpolé (bille en insertion dessinée en dernier), drawBall via rollFrame(), FROG_FRONT = 24 / FROG_BACK = 26, langue au tir, clignement périodique, RenderAssets.eyeblink, Fx.tongueStart"
  - "original.keyed(key) : transparence par couleur de coin pour les sprites sans masque (EYEBLINK)"
  - "audio: pickFormat(), manifest format 2 + legacy, préchargement parallèle à unlock(), setLoop()/stopLoops(), loopLevels(), WARNING_DISTANCE = 160"
  - "main: muzzleOffset = FROG_FRONT avec le sprite, mesure de vitesse par bille → boucles rolling/warning, ?level=S-L"
  - "tests/r214-presentation.test.mjs (6 verrous), R214_RELEASE_NOTES.md complétées, README (?level=)"
affects: [04-04 (STATS : index.html / style.css / partie STATS de main.ts non touchés), phase-5, phase-7 (musique : AudioManager a maintenant des boucles)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helpers de présentation purs dans feedback.ts/audio.ts (insertionPose, loopLevels, pickFormat) verrouillés par node:test ; render/main ne font que les câbler"
    - "Décodage audio : Promise.all sur toutes les clés à la création du contexte, échec isolé par clé (available.delete) → synthèse pour cette clé seulement"
    - "Mesure de la vitesse de chaîne côté présentation : max |Δs| par bille entre deux images / (steps / tickHz), sans toucher au moteur"
    - "Captures Playwright déterministes : requestAnimationFrame remplacé par une file et avancé à la main (1 image = 1 tick)"

key-files:
  created:
    - tests/r214-presentation.test.mjs
  modified:
    - src/feedback.ts
    - src/render.ts
    - src/original.ts
    - src/audio.ts
    - src/main.ts
    - R214_RELEASE_NOTES.md
    - README.md

key-decisions:
  - "FROG_FRONT = 24 / FROG_BACK = 26 conservés tels que mesurés (aucun ajustement ±2 nécessaire : la capture montre la bille courante sur la bande de la bouche et la suivante sur le cercle sombre)"
  - "EYEBLINK est une feuille de deux trames 58×20 (mi-closes, closes) et non une trame 58×40 ; elle se place en local (−29, −12) sur les yeux (mesuré par corrélation avec le sprite), pas en (−29, +1)"
  - "Une clé du pack encore en cours de décodage reste muette plutôt que de déclencher la synthèse (pas de double son) ; la synthèse ne sert qu'aux clés absentes ou dont le décodage a échoué"
  - "Volumes des boucles : rolling 0,5 × niveau, warning 0,8 × niveau, rampe setTargetAtTime 50 ms ; libération après 2 s à zéro (horloge ctx.currentTime)"
  - "?level=S-L est relu à chaque newGame() (donc aussi après une partie terminée) : paramètre de relecture, documenté comme tel"

# Metrics
duration: ~15 min
completed: 2026-10-10
tasks: 3
files: 8
---

# Phase 4 Plan 03: Présentation et audio fidèles — Summary

**Insertion animée rendue (glissement + grossissement via `insertionPose`), roulement inverse par `rollFrame`, grenouille mesurée (bouche 24 px, écoutille 26 px, tir depuis la bouche, langue, clignement), audio original immédiat sur Chrome/Firefox/Safari (`canPlayType`, préchargement parallèle au premier geste) avec boucles de roulement et d'alerte ; preuves Playwright du niveau 1-3 en dist servi et en standalone.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 (2 TDD, 1 vérification/notes)
- **Files modified:** 8 (7 source/doc + 1 test créé)

## Task Commits

| # | Tâche | Commits | Fichiers |
|---|-------|---------|----------|
| 1 | Rendu de l'insertion, rollFrame, grenouille fidèle (bouche, écoutille, tir, langue, clignement) | `9f7483b` (test, RED) → `cfffb92` (feat, GREEN) | src/feedback.ts, src/render.ts, src/original.ts, src/main.ts, tests/r214-presentation.test.mjs |
| 2 | AudioManager — formats par navigateur, préchargement parallèle, boucles rolling/warning, `?level=` | `79a0125` (test, RED) → `cf2dcba` (feat, GREEN) | src/audio.ts, src/main.ts, README.md, tests/r214-presentation.test.mjs |
| 3 | Vérification de bout en bout, captures, notes de version | `d854ad3` (docs) | R214_RELEASE_NOTES.md |

Le SUMMARY n'est pas commité par l'exécuteur (consigne de l'orchestrateur) ; STATE.md et ROADMAP.md non modifiés.

## Ce qui a été fait

### Task 1 — présentation
- `insertionPose(width, from, to)` dans `feedback.ts` : `w` borné à 0..1, ease-out `1 − (1 − w)²`, `scale = 1 + 0,15·sin(πw)`.
- `render.ts` : `drawChain` dessine une bille `width < 1` à `insertionPose(ball.width, ball.enterFrom, p)` (échelle multipliée), après toutes les autres billes de la chaîne ; `drawBall` utilise `rollFrame(roll, sheet.frames)` ; `FROG_FRONT = 24`, `FROG_BACK = 26` exportés et utilisés pour la bille courante/suivante ; `drawFrog(engine, view, fx, frame)` dessine la langue (`Tongue` 32×55, pointe vers +y = direction de visée, `translate(0, FROG_FRONT − 6)` + `scale(1, sin(πt/10))`, 10 ticks après `fire`) puis le clignement (`frame % 240 < 8`, trames 0/1/1/1/1/0 de `EYEBLINK`).
- `original.ts` : `keyed(key)` (couleur du pixel (0,0) → alpha 0, tolérance 0, `null` en cas d'échec).
- `main.ts` : `pack.keyed('eyeblink')` dans `loadAssets`, `fx.tongueStart` (−∞ par défaut, = `engine.tick` sur `fire`), `muzzleOffset: this.renderer.assets?.frogPad ? FROG_FRONT : CANDIDATE.muzzleOffset`.

### Task 2 — audio
- `audio.ts` : `MIME` ogg/m4a, `pickFormat()`, `parseManifest()` (format 2 + tableau legacy), `probe()` (`<audio>.canPlayType`, repli « ogg » sans DOM), `unlock()` → `preload()` = `Promise.all(load(key))`, `play()` muet pendant le décodage d'une clé disponible, `setLoop()`/`stopLoops()` (`loop = true`, gain 0 → `setTargetAtTime(level × base, 50 ms)`, arrêt après 2 s à zéro), `loopLevels()`, `WARNING_DISTANCE`.
- `main.ts` : `lastPositions` (id → s) ; `updateLoops(engine, steps)` après les pas de simulation (vitesse = max |Δs| / (steps / tickHz), `headDistance` = min sur les chaînes de `track.length − max s`) ; niveau 0 quand la boucle est suspendue ; `stopLoops()` dans `startLevel`, `openStats`, ouverture du menu, mise en pause ; `requestedProgress()` pour `?level=S-L` (regex `^\d+-\d+$`, bornes du pack).
- README : ligne « Relecture : `?level=1-3` … ».

### Task 3 — vérification
- `npm test` : **45/45** (r206, r211, r213, r214, r214-import, r214-presentation) + garde « 456 tracked files, none proprietary » ; `npm run check` vert.
- `node tools/import-original.mjs` : `22 levels, 25 curves, 37 sounds, 37 m4a, 76 images` ; `manifest.json` format 2.
- `node tools/build.mjs --standalone` : `standalone/zuma-standalone.html` = **7,0 MiB** (7 303 436 octets ; 5,2 MiB avant l'ajout des `.m4a`).
- Notes R2.0.14 complétées (sections Présentation, Audio, Outils, Tests).

## Preuves (captures hors dépôt, jamais commitées)

Dossier : `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r214/`

| Fichier | Contenu | Constat |
|---------|---------|---------|
| `frog-crop.png` | niveau 1-1 (spirale), clip ±70 px autour de (327, 233), dpr 2, visée vers la droite | bille courante sur la bande de la bouche entre les yeux, suivante (×0,55) dans le cercle sombre du dos → 24/26 validés sans ajustement |
| `frog-crop-tongue.png` / `frog-crop-tongue-after.png` | même clip, rAF piloté à la main : 4 ticks puis 12 ticks après le tir | langue visible entre la bouche et le projectile à t = 4, rétractée à t = 12 |
| `level-1-3-start.png` | `http://localhost:8080/?level=1-3`, viewport 1280×960, dpr 2, 2 s après le clic de déverrouillage | « Mosaïque de réverbération · Niveau 1-3 », fond riverbed 640×480 net (pas de vignette étirée), mosaïque visible sous les billes, billes sur le tracé, HUD net |
| `level-1-3-shots.png` | après 5 tirs | insertions et destructions (« ENCHAÎNEMENT x2 +130 »), aucune erreur console |
| `level-1-3-frog.png` | clip ±70 px autour de (274, 264) | bille courante sur la bouche, suivante dans l'écoutille |
| `standalone-level-1-3.png` | `file:///home/user/zuma/standalone/zuma-standalone.html?level=1-3` | même niveau, badge `R2.0.14 · … · ressources originales`, 74 fichiers son embarqués (37 ogg + 37 m4a), console propre |
| `dpr2.png`, `pixelated.png` | plan 04-01 | inchangés |

Mesures Playwright (`r214-evidence.mjs`, dist servi) :
- (a) badge `#build` = `R2.0.14 · 2.0.14+20261010T095616 · ressources originales` ✔
- (b) ressources `sounds/*.ogg|m4a` chargées après le premier clic : **37** (≥ 30) ✔ — Chromium a choisi `ogg` pour chaque clé
- (c) `#game.width` = **2560** (×1920) à dpr 2 ✔

Mesure du clignement (`frog-anim.mjs`, pixel du blanc de l'œil gauche échantillonné sur 260 images pilotées) : 4 images consécutives assombries (trames « closes » du clignement de 8 images), une fois par période de 240.

Scripts utilisés (scratchpad) : `measure-eyeblink.mjs` (corrélation EYEBLINK/frog), `frog-crop.mjs`, `frog-anim.mjs`, `r214-evidence.mjs`, `standalone-r214.mjs`.

## Deviations from Plan

### Corrections de mesure (Rule 1 — la valeur du plan aurait produit un rendu faux)

**1. Placement et format d'EYEBLINK**
- **Found during:** Task 1 (rendu des sprites agrandis + corrélation pixel à pixel avec `SMALLFROGonPAD`)
- **Issue:** le plan décrit `EYEBLINK.gif` comme « une trame » 58×40 à dessiner en (−29, +1) avec les yeux en (23, 75)/(83, 75). Sur le sprite réel les yeux sont en y ≈ 42–62 (le y = 75 est la bouche) et EYEBLINK contient deux trames 58×20 (paupières mi-closes, closes). La meilleure corrélation de la trame 0 avec le sprite est au coin (25, 42) → local (−29, −12).
- **Fix:** `drawFrog` dessine la trame `0/1/1/1/1/0` (hauteur = `eyeblink.height / 2`) en (−29, −12) ; `RenderAssets.eyeblink` reste un `Bitmap | null` comme prévu.
- **Files:** src/render.ts — **Commit:** `cfffb92`

**2. Attente avant la capture rapprochée de la grenouille**
- **Found during:** Task 3 (le titre du niveau, 150 images, recouvrait encore la grenouille 4,5 s après le démarrage : le rAF headless tourne sous 60 fps à 2560×1920)
- **Fix:** `r214-evidence.mjs` attend 5 s de plus avant `level-1-3-frog.png` (script de preuve uniquement, aucun changement de code).

### Hors plan, non corrigé
- Aucun écart visuel imputable aux plans 04-01/04-02 n'a été constaté sur les captures.

## Auth gates
Aucune.

## Known Stubs
Aucun : la langue, le clignement, les boucles et le paramètre `?level=` sont câblés sur des données réelles (pack).

## Threat Flags
Aucune surface nouvelle au-delà du registre : `?level=` validé par regex et bornes (T-04-10) ; préchargement avec échec isolé par clé (T-04-11) ; `stopLoops()` à chaque changement de panneau/niveau + libération après 2 s (T-04-12) ; captures hors dépôt, `git status` sans `.png` (T-04-13) ; `keyed()` en try/catch → `null` (T-04-14).

## TDD Gate Compliance
- Task 1 : `test(04-03)` `9f7483b` (RED vérifié : import de `FROG_BACK` absent) → `feat(04-03)` `cfffb92` (GREEN : 29/29 sur presentation/r214/r213).
- Task 2 : `test(04-03)` `79a0125` (RED vérifié : import de `WARNING_DISTANCE` absent) → `feat(04-03)` `cf2dcba` (GREEN : 33/33 sur presentation/r213/r211).
- Pas de commit refactor nécessaire.

## Human check (en attente — ne bloque pas ce plan)
`<human-check>` de la Task 3 à réaliser par l'utilisateur : ouvrir `standalone/zuma-standalone.html?level=1-3` dans Chrome, Firefox et Safari ; vérifier fond net + mosaïque animée sous les billes, sons originaux dès le premier clic (tir, insertion, destruction, bonus saut), roulement continu, alerte près du crâne, glissement de la bille vers la chaîne (~0,2 s), recul = roulement inverse, option « Pixels nets ». Consigner le verdict dans `04-UAT.md` (ré-acceptation). **Statut : PENDING.**

## Next Phase Readiness
- Plan 04-04 (STATS) peut démarrer : `index.html`, `public/style.css` et la partie STATS de `main.ts` n'ont pas été touchés (seul `openStats()` reçoit un appel `this.audio.stopLoops()` en tête).
- Phase 7 (musique) : `AudioManager.setLoop` est spécialisé `rolling | warning` ; une boucle musicale demandera d'élargir `LoopKey`.

## Self-Check: PASSED
- 9 fichiers présents (5 sources, test, notes, README, standalone) ; commits 9f7483b, cfffb92, 79a0125, cf2dcba, d854ad3 présents dans `git log`.
- `tests/r214-presentation.test.mjs` = 69 lignes (≥ 40) ; aucun TODO/FIXME/placeholder dans les fichiers touchés ; `git status` : seul le SUMMARY est non suivi, aucun `.png`.
