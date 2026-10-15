---
phase: 05-regles-originales-completes
plan: 04
subsystem: presentation
tags: [coins, sparkle, end-of-level-tally, get-ready-go, bitmap-fonts, configFromSettings, partime, zumaslow, zumaback, standalone, playwright]

# Dependency graph
requires:
  - plan: 05-02
    provides: engine.setTreasure / coin / cleanup / timeBonus, events coin-appear·coin·coin-vanish·clearing·cleanup·go·won, coinFrame / sparkleFrame, EngineConfig.parTime / zumaBackTicks / zumaSlowTicks
  - plan: 05-03
    provides: native STATS (statsdialog kit, bestTime persistence zuma.best.<id>), OriginalPack.strings()
  - plan: 05-01
    provides: loadBitmapFont / BitmapFont.draw, pack fonts (nativealienextended18, cancun12, cancunfloat14) and strings.json
provides:
  - "render.ts : RenderAssets.coin / sparkle / fonts ; drawCoin (COIN frame + sparkle `lighter`, vector gold disc fallback) between the chains and the projectiles ; floating texts in CancunFloat14 ; HUD messages in NativeAlienExtended18 + Cancun12 when the fonts are loaded"
  - "main.ts : loadAssets loads coin / sparkle / three fonts ; startLevel → engine.setTreasure(graphics.treasure ?? []) ; GET_READY (« Attention ») until the `go` event then GO (« PARTEZ », 45 frames) ; coin → « +100 », cleanup → « +10 » floats ; won message with the time bonus ; STATS 60 ticks after a win ; configFromSettings += parTime, zumaBackTicks, zumaSlowTicks (× 0.6, bounded, T-05-11) ; `?debug=1` → window.__zuma + Game.debugState() (T-05-10)"
  - "original.ts : PackSettings.zumaslow / zumaback ; canvasOf exported (shared with bitmapfont.ts)"
  - "feedback.ts : clamp01 exported (shared with audio.ts)"
  - "tools/build.mjs : standalone strip also removes `export { … } from './x.js';` re-exports"
  - "tests/r215-presentation.test.mjs : configFromSettings locks (GAME-01), coin / GET_READY / go / cleanup / setTreasure source locks, single-file bundle locks (no duplicate top-level identifier, no import/export left, parses with vm.Script)"
  - "README « Réglages originaux » (partime, zumaslow / zumaback, colours, single) + « Pièces et fin de niveau » ; CONCERNS « Pièces et fin de niveau (hypothèses) » ; R215 notes Présentation / Outils / Build / Tests"
affects: [05-UAT (U10, U12, U13 verdicts), phase 6 (menu / music reuse RenderAssets.fonts and the debug hook)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentation reads pack-driven engine state (engine.coin, engine.cleanup) and pure frame helpers (coinFrame, sparkleFrame) — no timers in render.ts"
    - "Bitmap fonts are optional per slot (title / text / float): every draw path keeps its vector fallback"
    - "Settings from the pack go through a bounded numeric conversion (`ticks()`, parTime ≥ 0) before reaching EngineConfig (T-05-11)"
    - "Single-file bundle hygiene is locked by tests: one top-level definition per identifier across MODULES, strip leaves no module statement"

key-files:
  created: []
  modified: [src/render.ts, src/main.ts, src/original.ts, src/feedback.ts, src/audio.ts, src/bitmapfont.ts, tools/build.mjs, tests/r215-presentation.test.mjs, README.md, R215_RELEASE_NOTES.md, .planning/codebase/CONCERNS.md]

decisions:
  - "PackSettings gains zumaslow / zumaback (they were absent) instead of going through the `unknown` index signature; configFromSettings still converts with Number() and bounds"
  - "The « Attention » message is armed for 100 000 frames and replaced by the `go` event (the engine owns the end of the fast feed), rather than timed in main.ts"
  - "Floating texts use CancunFloat14 as-is (colour font: the gold of the original, tint ignored) — the per-event colours remain for the vector fallback"
  - "Duplicate helpers (clamp01, canvasOf) are shared through the existing import edges (audio → feedback, bitmapfont → original) rather than renamed, so both the module build and the concatenated build see one definition"
  - "The standalone re-export bug is fixed in the bundler (strip) and locked by reproducing strip from build.mjs source in the test, not by removing the formatSeconds re-export r214 relies on"

metrics:
  duration: "~20 min (11:50 → 12:09 UTC)"
  completed: 2026-10-10
  tasks: 3
  commits: 5
  tests: "100/100 (was 95/95 before the plan; +5 locks)"
---

# Phase 5 Plan 04: Coins, end-of-level tally and « Attention / PARTEZ » presentation ; pack wiring ; phase verification — Summary

Coins now rotate and sparkle on the TreasurePoints of the pack, the end-of-level tally shows « +10 » walking the track with the rising `endoflevelpop1`, each level opens with « Attention » then « PARTEZ » in the original fonts, and `partime` / `zumaslow` / `zumaback` reach the engine through a bounded, test-locked `configFromSettings`. Along the way the single-file build turned out to be unbootable since 05-01 (duplicate identifiers, surviving re-export) and was repaired and locked.

## Tasks

| # | Task | Commit | Files |
| --- | --- | --- | --- |
| 1 | Coins, tally, « Attention / PARTEZ », pack wiring (D-07..D-11) | `c85dfba` | src/render.ts, src/main.ts, src/original.ts |
| 2 | configFromSettings locks (RED) | `0d412dc` | tests/r215-presentation.test.mjs |
| 2 | README / CONCERNS / R215 notes | `5ed73ae` | README.md, .planning/codebase/CONCERNS.md, R215_RELEASE_NOTES.md |
| 3 | Standalone fix + locks (deviation, see below) | `8e58e25` | src/feedback.ts, src/audio.ts, src/original.ts, src/bitmapfont.ts, tools/build.mjs, tests/r215-presentation.test.mjs |
| 3 | Notes `## Build` + UAT hypotheses | `0327944` | R215_RELEASE_NOTES.md |

## What was built

- **`src/render.ts`** — `RenderAssets.coin` (Sheet, 30 frames 36×36 masked by `_COIN`), `sparkle` (raw 280×20 GIF, black background), `fonts { title, text, float }`. `drawCoin(engine)` draws `coinFrame(engine.tick, sheet.frames)` centred on `engine.coin`, then `sparkleFrame(engine.tick)` ≥ 0 → frame `f × 20` of the sparkle at (x + 8, y − 18) with `globalCompositeOperation = 'lighter'`; without the sprite a gold `#f2c230` disc with `#8a5a10` ring (radius 12). Called after the chains, before the projectiles. Floating texts: `fonts.float.draw(ctx, text, x, y + ascent/2, { align: 'center', alpha })` when present, else the former `Trebuchet` path. HUD message: `fonts.title` at baseline 230 and `fonts.text` (cream `#fcf4d0`) at 262 when present, else the vector path unchanged. The rest of the HUD is untouched.
- **`src/main.ts`** — `loadAssets` adds `pack.sheet('coin', 36, '_coin')`, `pack.image('sparkle')`, `loadBitmapFont` × 3 (all null-tolerant; `fonts` is null only when all three fail). `start()` loads `pack.strings()` once. `startLevel`: `engine.setTreasure(level.graphics?.treasure ?? [])`, message `GET_READY ?? 'Attention'` with « *nom* — Niveau *n* » (100 000 frames). Events: `go` → `GO ?? 'PARTEZ'` (45 frames), `coin` → `+points` float (`#ffd45a`), `cleanup` → `+points` float (`#fff1a8`; the rising `bonuspop` already comes from `soundCues`), `won` → « Niveau terminé ! » with « Bonus de temps +N » or « Bonus 1000 ». `checkOutcome`: `endAt = frame + (won ? 60 : 90)`, early return on `clearing` (already there since 05-02). `configFromSettings`: `parTime` (finite, > 0, else 0), `zumaBackTicks` / `zumaSlowTicks` = `round(steps × 0.6)` for finite positive steps else 0. `?debug=1` → `window.__zuma = { game }`; `Game.debugState()` → `{ engine, level }` (read-only). `PackSettings.zumaslow` / `zumaback` declared in `original.ts`.
- **Tests** (`tests/r215-presentation.test.mjs`, +5) — `configFromSettings` on `lvl35` (`parTime 130`, `zumaSlowTicks 300`, `zumaBackTicks 120`, `singleChance 0.08`, `target 4500`, `colors 5`, `speed 60`), defaults (`colors 4`, zeros), bounds (`colors` 3..6, `single` 0..1, negative / NaN / infinite → 0, `undefined` settings) ; source locks (`drawCoin(`, `sparkleFrame(`, `coinFrame(` in render.js ; `GET_READY`, `'go'`, `'cleanup'`, `setTreasure(` in main.js) ; standalone bundle locks (no duplicate top-level identifier across `MODULES`; `strip` reproduced from `build.mjs` source leaves no `import` / `export` / `./x.js` specifier and the concatenation parses with `vm.Script`).
- **Docs** — README: baseline R2.0.15, `?debug=1`, table rows `partime` (OBJECTIF + bonus formula, hypothesis), `zumaslow` / `zumaback` (recul then ralenti, × 0.6, hypothesis locked by test), `colors` (3..6, temple deduction), `single` (locked), `mergespeed` / `reloaddelay` still uninterpreted; new « Pièces et fin de niveau » subsection (TreasurePoints, 9–15 s / 6 s, `dist` rule, 18 px, +100, streak kept, sounds; 10 pts / 4 ticks, `endoflevelpop1` 1 → 1.5, `chant5`, STATS after 60 ticks; « Attention / PARTEZ »); « Statut » lists every remaining hypothesis. CONCERNS: settings paragraph updated (zumaslow / zumaback / partime now interpreted, locked), new « Pièces et fin de niveau (hypothèses) » block with the measurement plan. R215 notes: `## Présentation`, `## Outils`, `## Build` (import counts, standalone 7.35 MiB, single-file fix, UAT hypotheses), `## Tests` completed.

## Verification

- `npm test` → 100/100 (r206, r211, r213, r214*, r215, r215-font, r215-import, r215-presentation) + `publication guard: 477 tracked files, none proprietary` ; `npm run check` clean.
- `node tools/import-original.mjs` → `22 levels, 25 curves, 40 sounds, 40 m4a, 76 images, 5 fonts, 215 strings` (76 images: `stats_bg` dropped in 05-03). `pack.json` already carried `graphics.<id>.treasure[]` (3 points on `spiral`), so no importer change was needed.
- `node tools/build.mjs --local`, `node tools/build.mjs --standalone` → `standalone/zuma-standalone.html` 7 704 768 bytes (7.35 MiB), 3 occurrences of `R2.0.15`.
- Playwright (Chromium, `node tools/serve.mjs` on 8765, `--autoplay-policy=no-user-gesture-required`, hook on `AudioBufferSourceNode.prototype.start`), script `scratchpad/evidence.mjs`, JSON in `scratchpad/evidence.json`. Captures (never in the repo) under `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r215/`:

| Capture | What it shows | Measured |
| --- | --- | --- |
| `start-attention.png` | « ATTENTION » in NativeAlienExtended18, « SPIRALE DU DESTIN — NIVEAU 1-1 » in Cancun12, chain arriving | tick 23, `feeding true`, `game.message.text === 'Attention'` |
| `start-partez.png` | « PARTEZ » the frame after the `go` event | tick 177, `feeding false`, message `'PARTEZ'` |
| `coin-1-1.png` | coin on the top-left TreasurePoint (71, 93) without any shot | appeared 10.3 s after start (tick 692 on a previous run, 634 here), `until = tick + 360` |
| `coin-crop.png` | ×3 crop around the coin on a sparkle frame (tick % 90 in 4..16) | COIN frame + sparkle highlight |
| `cleanup-tally.png` | « +10 » in CancunFloat14 along the spiral during `clearing` (score 110 at step 8/79) | fixture of two balls at s = 200 / 232, `zumaMode = true`, one shot ; `clearing` from tick 277 |
| *(audio)* | 79 non-loop buffer starts of 0.382 s (`endoflevelpop1`) with `playbackRate` 1.006 → 1.5 strictly monotone, then one 2.013 s start at rate 1 (`chant5`) | `won` at tick 561, `timeBonus 150`, score 1970 |
| `stats-record.png` | native STATS: POINTS 1970, TEMPS 10 s, OBJECTIF 25 s, BONUS **+150**, RECORD **10 s** | `localStorage['zuma.best.spiral'] === '10'` |
| `stats-record-replay.png` | replay with `engine.tick += 1800` (TEMPS 40 s): PAS DE BONUS, RECORD still 10 s | `zuma.best.spiral` unchanged `'10'`, `timeBonus 0`, score 1820 |
| `standalone-0504.png` | `file:///…/standalone/zuma-standalone.html?level=1-1&debug=1`: coin on the bottom-right point (574, 403) | badge `R2.0.15 · 2.0.15+20261010T120721 · ressources originales`, assets coin / sparkle / title / text / float all loaded, STATS kit loaded, **console clean** |

- Console on the served build during all steps: empty (no error, no warning).
- `git status --porcelain` contains no `.png`; working tree clean after the last commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Single-file build unbootable: duplicate top-level identifiers**
- **Found during:** Task 3 (standalone check) — `pageerror: Identifier 'clamp01' has already been declared`.
- **Issue:** the standalone concatenates the modules into one module scope. `feedback.ts` (05-02) and `audio.ts` both declared `const clamp01`; `bitmapfont.ts` (05-01) and `original.ts` both declared `function canvasOf` (identical bodies). Both are SyntaxErrors in a module script, so the standalone has been dead since 05-01 (05-02 / 05-03 verified the served build only).
- **Fix:** `feedback.ts` exports `clamp01` and `audio.ts` imports it; `original.ts` exports `canvasOf` and `bitmapfont.ts` imports it (existing import edges, no cycle; the `original.js` no-`bitmapfont` lock still holds). New lock: no top-level identifier declared by two `MODULES`.
- **Files modified:** src/feedback.ts, src/audio.ts, src/original.ts, src/bitmapfont.ts, tests/r215-presentation.test.mjs
- **Commit:** `8e58e25`

**2. [Rule 3 - Blocking] Single-file build fetched a module at runtime (CORS on `file://`)**
- **Found during:** Task 3, right after fix 1 — `Access to script at 'file:///…/standalone/statsdialog.js' … blocked by CORS policy`.
- **Issue:** `tools/build.mjs` `strip` removed `export { a };` but not `export { formatSeconds } from './statsdialog.js';` (re-export added in 05-03 for the r214 lock), leaving a live module specifier in the bundle.
- **Fix:** `strip` now removes `^export \{[^}]*\}[^\n]*\n` (any `export { … }` line, with or without `from`). New lock: `strip` is extracted from `build.mjs` source, applied to the compiled `MODULES`, and the result must contain no `import` / `export` line nor `./x.js` specifier and must parse with `vm.Script`.
- **Files modified:** tools/build.mjs, tests/r215-presentation.test.mjs
- **Commit:** `8e58e25`

**3. [Rule 1 - Bug, in the evidence script only] Audio unlock raced the boot overlay**
- The first evidence run recorded 0 `bonuspop` starts because the unlock click landed on `#boot` (the engine exists before the overlay is hidden). The script now waits for `#boot.hidden` and calls `audio.unlock()` explicitly. No repo change.

### Minor adjustments
- `src/original.ts` was modified in Task 1 (not in `files_modified`): the plan allows adding `zumaslow` / `zumaback` to `PackSettings` « uniquement si absents » — they were absent.
- The `strings` property is private to `Game`; the evidence script reads `game.message.text` (runtime-visible) to prove the GET_READY / GO texts rather than reading the canvas.

## TDD Gate Compliance

Task 2 is `tdd="true"`: a `test(05-04)` commit (`0d412dc`) precedes the `docs(05-04)` commit (`5ed73ae`). The RED step could not fail at the time it was written because the plan has Task 1 (`feat`, `c85dfba`) implement `configFromSettings` before Task 2 locks it; against the pre-Task-1 `configFromSettings` the first two tests fail (`parTime` undefined). Recorded here per the fail-fast rule rather than reordering the plan.

## Known Stubs

None. `fonts` slots are null only without the pack and every draw path keeps its vector fallback (not a stub: the plan's required behaviour).

## Threat Flags

None beyond the plan's register: `?debug=1` (T-05-10, accepted) exposes only the simulation state and no command; `configFromSettings` bounds (T-05-11) implemented and locked; `cleanup` floats are one per step and purged at 70 ticks (T-05-12; 79 steps on `spiral`, ≤ 17 alive at once).

## Pending human check (not run — for the user)

From the plan's `<human-check>`: open `standalone/zuma-standalone.html` on macOS (Safari or Chrome) and record in `05-UAT.md`: (U10) composed STATS dialog, RECORD = best level time, expert BONUS after a fast win; (U12) a coin appears, vanishes after ~6 s, gives +100 on a shot without breaking the streak; (U13) after the last explosion the +10 run to the skull with the rising pop, then the STATS; every level starts with « Attention » then « PARTEZ ». The amounts (100 / 10 / bonus formula / zumaslow·zumaback × 0.6) are hypotheses to confirm.

## Observations (out of scope, not fixed)
- The HUD score (e.g. « 1970 ») is drawn under the GodHead of the native STATS (pre-existing since 05-03; the canvas keeps drawing the HUD while the panel is open). Cosmetic; worth a line in `05-UAT.md`.

## Self-Check: PASSED

Files (12), commits (5) and captures (8) verified on disk / in `git log` on 2026-10-10.
