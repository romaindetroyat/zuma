---
phase: 05-regles-originales-completes
plan: 13
subsystem: release + documentation
tags: [release-notes-r219, readme, concerns, uat-7-decisions, uat-8-opened, deferred-items, standalone-r219, single-lost-event]

# Dependency graph
requires:
  - plan: 05-12
    provides: R2.0.19 engine / audio / HUD, tests r219 and r219-presentation, Playwright evidence under scratchpad/shots-r219
  - doc: 05-RESEARCH-04.md
    provides: addresses, constants and assumptions log A1–A5 (spike 04)
provides:
  - "R219_RELEASE_NOTES.md (Moteur, Audio, HUD, Outils, Tests, Build, Hypothèses à confirmer en UAT), one bullet per rule with address, conversion and lock"
  - "README: baseline R2.0.19, « Chaîne : comblement et rebond », ZUMA per chain in the settings table, coin at 36 px consuming the shot, three frogs / reserve / « xN » / blink / top bar, r219 locks, status"
  - "CONCERNS: spike 04 semantics, D-31 / D-32, R2.0.19 choices, bugs fixed, fragile areas, missing items, audit 2026-10-11 (R2.0.19)"
  - "05-UAT: U34–U38 « → livré en 05-12 (…) », « Huitième session (à remplir) » with checks, hypotheses and an empty findings table"
  - "deferred-items: « Relevés en 05-12 »"
  - "core.ts: a single `lost` event per loss (end of drain emits `gameover` only) — r219 +1 test"
  - "standalone/zuma-standalone.html R2.0.19 rebuilt (untracked), 7 780 058 bytes"
affects: [UAT 8 (user), phase 5 closure]

tech-stack:
  added: []
  patterns: []

key-files:
  created: [R219_RELEASE_NOTES.md]
  modified: [README.md, .planning/codebase/CONCERNS.md, .planning/phases/05-regles-originales-completes/05-UAT.md, .planning/phases/05-regles-originales-completes/deferred-items.md, src/core.ts, tests/r219.test.mjs]

decisions:
  - "Double `lost` fixed in the engine (src/core.ts checkEnd), not in main.ts: the end of the drain emits `gameover` only; the state still becomes `lost` / `gameover` (checkOutcome reads the state, not the event)"
  - "README powerfreq row: status notes that spike 04 read the original spawn model (one draw per type, several at once, 1 s pending, 20 s life) without implementing it"
  - "CONCERNS: spike 04 assumptions named « A1–A5 (spike 04) » to avoid the clash with A1–A7 of spike 01; A4 recorded as lifted by 0x428391"

metrics:
  duration: "~10 min (06:36 → 06:46 UTC)"
  completed: 2026-10-11
  tasks: 3 (+ 1 approved fix)
  commits: 5 (+ this summary)
  tests: "247/247 + publication guard (was 246; r219 +1)"
---

# Phase 5 Plan 13: Release R2.0.19 — notes, README, concerns, UAT 7 decisions, UAT 8 opened — Summary

La baseline 2.0.19 est rendue auditable : `R219_RELEASE_NOTES.md` décrit chaque règle du spike 04 avec son adresse, sa conversion en ticks et son verrou (destruction 40 maj = 24 ticks, attraction ⌊v/8⌋ px par maj sans plafond, rebond au contact 18 ticks à max(50, 150 × profondeur) px/s, recul ZUMA par chaîne depuis la tête à 100 px/s avec arrêt sous 50 px et billes perdues par l'entrée, pièce à 36 px qui consomme le tir, trois grenouilles, sons du contact et de l'impact, réserve de grenouilles et barre recalée) ; le README, `CONCERNS.md`, `05-UAT.md` et `deferred-items.md` suivent, D-31 (tir consommé contre le souvenir de l'utilisateur) et D-32 (aucun son à l'apparition d'un power-up) sont consignés, et la huitième session d'UAT est ouverte. Correction approuvée en plus : le moteur émettait `lost` deux fois par perte (« Perdu… » deux fois) ; un seul `lost` désormais, verrouillé par `r219`. 247 tests verts, standalone 7 780 058 octets qui démarre sans erreur depuis `file://`.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 0 | Approved fix: one `lost` event per loss (deviation, RED → GREEN) | `cd4329c` (RED), `f056738` (GREEN) | tests/r219.test.mjs, src/core.ts |
| 1 | Release notes R2.0.19 and README | `944a5fb` | R219_RELEASE_NOTES.md, README.md |
| 2 | CONCERNS, UAT 7 decisions, eighth session, deferred items | `82f6a56` | .planning/codebase/CONCERNS.md, 05-UAT.md, deferred-items.md |
| 3 | Final verification, standalone R2.0.19, evidence, Build section | `db1a310` | R219_RELEASE_NOTES.md |

## Cause of the double « Perdu… »

`ZumaEngine.checkEnd` emitted `lost { lives, chain }` at the loss (state → `draining`), then, once every chain was empty, `this.emit(this.state)` with the new state — `lost` again for any loss that leaves frogs (and `gameover` for the last one). `main.ts` shows « Perdu… » on every `lost` event and `soundCues` maps `lost` → `lose`, so the message and the sound came twice. Fix (`src/core.ts`): the end of the drain sets the state as before and emits only `gameover`; the outcome flow (`checkOutcome`) reads the state, not the event, so the STATS still open 90 frames after the loss. Lock: `r219` « one `lost` event per loss: emitted at the loss, not again at the end of the drain (« Perdu… » once) » (lives 3 → one `lost` with lives 2, no `gameover`; lives 1 → one `lost` then one `gameover`). RED failed with `2 !== 1`; GREEN 247/247. Browser check on the final standalone: a forced loss gives one `lost`/`gameover` emission and one « Perdu… » (« La chaîne a atteint le crâne », lives 3 → 2).

## Verification

- `npm test` → **247/247** + `publication guard: 515 tracked files, none proprietary`; `npm run check` clean; `node tools/guard.mjs` green; each task `<verify>` gate passed (Task 1 grep set, Task 2 grep set with 5 « livré en 05-12 », Task 3 full chain).
- `node tools/build.mjs --local` then `--standalone` → `standalone/zuma-standalone.html` **7 780 058 bytes** (+176 vs the 05-12 build sent to the user, −26 079 vs R2.0.18); `R2.0.19` once as a literal (badge composed from `ENGINE_VERSION`); `tests/r215-presentation.test.mjs` 15/15.
- Nothing from `standalone/`, `dist/`, `private_assets/` or any `.png` tracked (`git status --porcelain` clean after the commits); no model identifier in the committed documents.

### Evidence (all under `scratchpad/shots-r219/`, none in Git)

| Evidence | Source | Measurements |
| --- | --- | --- |
| `standalone-r219.log`, `standalone-r219.png`, `standalone-r219-go.png` | **refreshed in 05-13** (`scratchpad/standalone-r219-final.mjs`, final build) | `file://…?level=1-1&debug=1`: `spiral` 1-1, « PARTEZ » (go tick 89), 38 balls, scale 3.125, assets / STATS kit / menu kit 2 ×, `MenuButton` loaded; top bar: 2 reserve frogs in the left green oval, « 1-1 » yellow in the left red oval, score in the black oval, gauge in the right red oval, MENU picture in the right green oval; Escape → menu, help view badge `R2.0.19 · 2.0.19+20261011T064334 · ressources originales`; console clean |
| `standalone-r219-loss.png` + `loss` block of `standalone-r219.log` | **added in 05-13** | forced loss (head placed on the skull): state `lost`, lives 2, **1** `lost`/`gameover` emission, **1** « Perdu… » (« La chaîne a atteint le crâne ») |
| `gap-close.log` / `.png` | 05-12 | destroy 136, still 137–159, removal 160 (v = 10), contact R + 20, recoil 15.00 px in 18 ticks; chain reaction: contact R + 21, recoil 45.00 px; pusher 0 for 12 ticks then 0.833 px/s |
| `zuma-pushback.log` / `.png` | 05-12 | 1-5, coverage 0.634 / ≈ 0.30 → chain 0 only; head −16.7 px / 10 ticks (100 px/s), 180 → 0; chain 1 at 60 px/s; 9 `ball-exit`, 50 → 41 balls; gap closed from the front; 0 destroy |
| `coin-grab.log` | 05-12 | `coin { points 500, shotId 41 }`, 0 projectiles at once, no insert / miss, streak 3 kept |
| `lives.log`, `lives-loss-{1,2,3}.png` | 05-12 | 3 → lost (2), 2 → lost (1), 1 → gameover (0); reserve 2 / 1 / 0 |
| `hud-before*.png`, `hud-after*.png`, `hud-lives-{3,4,5,6,13}*.png`, `hud-lives.log` | 05-12 | 2 frogs, 3 frogs, 1 frog + « X4 », « X5 », « X12 » |
| `hud-blink.log` | 05-12 | extra life at 50 000: flips every 0.160 s, visible from +90 ticks |
| `hud-measure.log`, `menubar-x4.png`, `menubutton*-x4.png` | 05-12 | ovals green 24–125, red 168–230, black 272–366, red 409–470, green 519–616; every `HUD_LAYOUT` slot inside its oval; « MENU » painted in the picture |
| `sounds.log` | 05-12 | insert 1; insert, destroy1, combo 0.4, merge 0.8; merges at 0 / 0 / +100 / +400 ms → 2 plays; power-spawn → none |
| `reimport.log`, `reimport-run.log` | 05-12 | 22 levels, 25 curves, 39 sounds / 39 m4a, 82 images; insert = ballclick2, merge = ballclick1; only powerup.* gone |
| `coin-geometry.log` | 05-12 | 44 of 61 coin spots without track behind the coin on the frog's line |

## Deviations from Plan

### Auto-fixed Issues / approved additions

**1. [Rule 1 - Bug, approved by the orchestrator] Double `lost` event per loss**
- **Found during:** 05-12 (open points), fixed before the documentation tasks.
- **Issue:** `checkEnd` emitted `lost` at the loss and again at the end of the drain → « Perdu… » and `lose` twice.
- **Fix:** the end of the drain emits `gameover` only (state unchanged); RED → GREEN pair in `tests/r219.test.mjs` / `src/core.ts`.
- **Files modified:** src/core.ts, tests/r219.test.mjs. **Commits:** `cd4329c`, `f056738`.

### Plan adjustments (documented)

- The release notes, README and deferred items mention the fix (Moteur bullet, test count 23 in `r219`, « Perdu… » once in the UAT 8 checks, deferred item marked « Corrigé en 05-13 »).
- README beyond the plan's list: the `powerfreq` row now states that spike 04 read the original spawn model without implementing it; « Commandes (R2.0.18) » → « (R2.0.19) » (bindings unchanged); the coin cadence paragraph mentions the R2.0.19 grab. « Fournir ses propres graphismes » untouched (the stale `flags` sentence noted in 05-11 stays deferred).
- CONCERNS: the « Choix de présentation de R2.0.18 » bullet about three frogs then « +N » is struck through with a pointer to the R2.0.19 rule rather than deleted; « UAT 7 » follow-ups re-pointed to UAT 8.
- Evidence: the plan asked to re-run the 05-12 standalone section; a copy of that script (`standalone-r219-final.mjs`) also forces one loss to check the fix in the browser (`standalone-r219-loss.png`).

## Known Stubs

None added (the inert music slider of 05-10 is unchanged).

## Threat Flags

None. T-05-42: the documents carry addresses, numbers and short strings only (`npm run guard` green, 515 tracked files). T-05-43: captures, logs and the re-imported pack stay in the scratchpad / `private_assets/` (ignored); no `.png` tracked.

## Not verifiable here

- UAT 8 (human check): feel of the gap closing and contact recoil, ZUMA pushback speed, coin consumption vs the user's memory, frogs and top bar on a Retina Mac with Safari / Chrome, power-up silence, click sounds — left to the user in `05-UAT.md` « Huitième session (à remplir) » with an empty findings table.
- Audio is verified through the hooked `audio.play` calls (05-12 `sounds.log`), not by listening.

## Self-Check: PASSED

Files: `R219_RELEASE_NOTES.md` (created), README.md, CONCERNS.md, 05-UAT.md, deferred-items.md, src/core.ts, tests/r219.test.mjs present and committed; commits `cd4329c`, `f056738`, `944a5fb`, `82f6a56`, `db1a310` in `git log`; 247/247 + guard; `standalone/zuma-standalone.html` 7 780 058 bytes (untracked); `shots-r219/standalone-r219.png`, `standalone-r219-loss.png`, `gap-close.log`, `zuma-pushback.log` on disk; STATE.md / ROADMAP.md untouched by instruction.
