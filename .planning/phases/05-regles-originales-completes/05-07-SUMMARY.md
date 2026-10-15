---
phase: 05-regles-originales-completes
plan: 07
subsystem: documentation
tags: [release-notes, readme, concerns, uat, standalone, playwright-evidence, baseline-2.0.16, hypotheses-a1-a7]

# Dependency graph
requires:
  - plan: 05-05
    provides: engine rules of the spike (pusher, slow zone, feed, colours, tally, ACE TIME, defaultParTime, coin 500), configFromSettings, r216.test.mjs, hypotheses A1–A3 / A7 + the ones carried into the code
  - plan: 05-06
    provides: alert 600 px, rolling 0.6, ZUMA banner, « +100 » + sparks, STATS colours / capHeight / count-up, r216-presentation.test.mjs, hypotheses A5 + 18 px rows / lid 600 px / no fast mode / levelwin overlap
  - plan: 05-04
    provides: evidence script pattern (scratchpad/evidence.mjs), single-file locks, HUD-score-under-GodHead observation
  - doc: 05-RESEARCH.md
    provides: addresses, formulas, hypothesis journal A1–A6, open questions 1–3
provides:
  - "R216_RELEASE_NOTES.md : Moteur / Présentation / Écran STATS / Outils / Tests / Build / Hypothèses à confirmer en UAT, one bullet per rule with the original value, the conversion and the locking test"
  - "README.md : baseline R2.0.16, « Réglages originaux » rewritten with a status per setting (vérifié par analyse statique / hypothèse An), « Pièces et fin de niveau » (coin 500, +10 000 A3, 60 px / 4 maj / +100, STATS at won, clock from PARTEZ, alert 600 px, rolling, ZUMA banner), « Écran STATS » (0x4525f0 colours, gold multiply, 18 px rows, count-up), lock line, « Statut » revised"
  - ".planning/codebase/CONCERNS.md : established semantics with addresses, remaining hypotheses A1–A7 + open question 3 + ZUMA max coverage + non-localised subjects, coins block split verified / hypotheses, pusher paragraph updated, audit R2.0.16"
  - "05-UAT.md : U14–U21 Décision cells point to 05-05 / 05-06 with the established values ; « Cinquième session (à remplir) » with the checks, the hypotheses and an empty findings table"
  - "deferred-items.md : rolling fade re-armed every frame (out of scope), HUD score under the GodHead (cosmetic)"
  - "standalone/zuma-standalone.html R2.0.16 (untracked) ; nine captures + logs under scratchpad/shots-r216/ (never in Git)"
affects: [UAT 5 (user), phase 6 (notes structure to mirror, deferred rolling fade)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence scripts hook AudioNode.prototype.connect + AudioBufferSourceNode.prototype.start to read the gain / rate / duration of every one-shot and loop, and wrap engine.drainEvents to timestamp events in engine ticks (events are drained after every tick)"
    - "Release notes cite only addresses, constants and short strings from the spike (T-05-19); captures and logs stay under the session scratchpad and the gate greps `git status --porcelain` for `.png` (T-05-20)"

key-files:
  created: [R216_RELEASE_NOTES.md, .planning/phases/05-regles-originales-completes/deferred-items.md]
  modified: [README.md, .planning/codebase/CONCERNS.md, .planning/phases/05-regles-originales-completes/05-UAT.md]

decisions:
  - "The rolling fade re-arm (setLoop called every frame restarts its 150 ms ramp → exponential-like decay, ≈ 0.4 s audible) is logged in deferred-items.md and listed as a UAT 5 point rather than fixed: pre-existing in src/audio.ts, outside this plan's files, no test broken (scope boundary)"
  - "The warning-beat fixture runs at 60 px/s instead of the plan's 300 px/s so the full 4.1 → 0.6 s interval decay is observable over the 600 px (at 300 px/s only two beats fit); the rolling fade is isolated by a forced chain.stopTicks = 180 instead of a shot (an insertion keeps balls moving for the 12 merge ticks, which would mask the fade)"
  - "The level win used for the STATS evidence adds 21 s to engine.tick before the fixture (TEMPS 22 s, bonus 3 100) so the count-up ends in 4 s; a fresh 1-1 would count ≈ 24 000 for ≈ 24 s (listed as a UAT hypothesis: no fast mode)"
  - "The standalone counts one `R2.0.16` occurrence (the badge is composed from ENGINE_VERSION at runtime); R2.0.15's « 3 occurrences » came from the CSS / notes markers of that version, not from a change in the bundler"

metrics:
  duration: "~15 min (17:16 → 17:31 UTC)"
  completed: 2026-10-10
  tasks: 3
  commits: 3
  tests: "142/142 + publication guard (488 tracked files, none proprietary), unchanged"
---

# Phase 5 Plan 07: Notes R2.0.16, README, CONCERNS, décisions UAT, standalone et preuves — Summary

Baseline 2.0.16 is now auditable end to end: `R216_RELEASE_NOTES.md` mirrors R215 and ties every rule of the spike (addresses, original value, 60 Hz conversion) to its `r216*` lock, the README table says for each `levels.xml` setting what the engine does with it and whether that is verified by static analysis or still one of the hypotheses A1–A7, CONCERNS lists what the spike settled and what remains, `05-UAT.md` points U14–U21 to the plan that delivered them and opens an empty fifth session, and the rebuilt standalone (7.4 MiB, `R2.0.16`, clean console) plus nine Playwright captures in the scratchpad show the fast feed at 1 520 px/s, the 24-tick pusher stop, the 4.09 → 0.66 s warning beats at constant gain, the +100 tally with pops every 6 ticks, and the STATS count-up at +100 / 100 ms with the original colours.

## Tasks

| # | Task | Commit | Files |
| --- | --- | --- | --- |
| 1 | Notes de version R2.0.16 et README | `d687c90` | R216_RELEASE_NOTES.md, README.md |
| 2 | CONCERNS.md et décisions UAT | `c8478cc` | .planning/codebase/CONCERNS.md, 05-UAT.md |
| 3 | Vérification finale — suite, standalone, preuves Playwright, section Build | `b1859c4` | R216_RELEASE_NOTES.md, 05-UAT.md, deferred-items.md |

## What was built

- **`R216_RELEASE_NOTES.md`** (68 lines) — intro (UAT 4 + spike D-12, 100 Hz → 60 Hz conversions); `## Moteur` (cadence, target speed and ramp 50 / 1000 px/s², pusher stop 24 ticks on component 0, slow zone `endZoneFactor` distinct from the SLOW power-up, fast feed `feedSpeed` + `go` at `speed + 10` or 300 ticks, level clock, colours `(repeat + 1) / 100` + `singleLimit` repair + RNG sequence change, ammo D-14, ZUMA `coverage > 0.5` with 180 / 660 defaults and × 0.25, tally 10 000 × curves / 60 px / 2.4 ticks / +100 / +12 / pops every 6 / won +30, ACE TIME formula credited through `creditBonus`, `defaultParTime`, coin `max(500, …)`, EngineConfig fields added / removed, version); `## Présentation` (alert 600 px with the interval formula and constant gain, lid over 600 px, rolling binary 0.6 / 150 ms, ZUMA banner + gauge pulse, « +100 » + `makeSparks`, `cleanup-pop` at 0.5, STATS at `won` replacing D-15 with the §8 motivation, TEMPS from PARTEZ, full `configFromSettings` mapping); `## Écran STATS` (0x4525f0 colours, gold multiply, `capHeight` × 1.65 bounded 16..20 → 18 px, `bonusCountUp` / `bonusPopRate` / `timeBonusShown`, count-up wiring, end-to-end literals); `## Outils` (unchanged, pack already carries `repeat 50`); `## Tests` (r216 and r216-presentation sections, every updated legacy file with its reason, total 142); `## Build` (commands, pack counts, standalone size / badge / console, the measured evidence table in prose); `## Hypothèses à confirmer en UAT` (A3, pusher stop on every rear insertion, A1, A2, A4, A5, A7, ZUMA max coverage, 18 px rows, lid 600 px, no fast mode, rolling fade, levelwin overlap, non-localised subjects).
- **`README.md`** — baseline R2.0.16; the settings table now has rows `score`, `repeat`, `single` (repair threshold, not a probability), `start` (fraction, computed feed), `speed` (ramp + stop), `slowfactor` / `slowspeed` (end-of-track slow zone, not the SLOW ball), `danger` / `slowdistance`, `firespeed`, `powerfreq`, `partime` (seconds, formula, `defaultParTime`), `zumaslow` / `zumaback` (> 50 %, × 0.25, defaults), `colors`, and the uninterpreted `mergespeed` / `reloaddelay` / `treasurefreq` / `maxspeed` / `accrate`, each with a status; « Pièces et fin de niveau » rewritten (coin 500 verified, +10 000 A3, 60 px / 4 maj / +100 with sparks, pops every 10 maj, STATS at once, clock from PARTEZ, alert / lid / slow zone / rolling / ZUMA banner); « Écran STATS » colours, gold multiply, 18 px rows, right-aligned values, count-up paragraph; lock list + « arrêt du pousseur et zone lente de fin de piste ; décompte original ; bonus ACE TIME » ; « Statut » lists what is verified and the remaining hypotheses. « Fournir ses propres graphismes » untouched.
- **`CONCERNS.md`** — « Réglages originaux : sémantiques établies par analyse statique » with the spike addresses per subject, then « Hypothèses restantes » A1–A7, open question 3, ZUMA max coverage, 18 px rows, lid, no fast mode, and the non-localised D-13 / D-14 / D-17; why / impact / fix approach (video of the original only for A3, A1, `dist`, `treasurefreq`); coins block split verified vs hypotheses; « Recul et poussoir » notes the stop and ramp are now original; « Missing » updated (coins and GET_READY delivered; trail light and fast mode listed); audit date R2.0.16.
- **`05-UAT.md`** — U14 → 05-05 (stop, slow zone, ramp, `repeat` 0.51, `single` threshold, `speed × 100` confirmed); U15 → 05-06 (600 px, 4.1 → 0.6 s, constant gain — the « ≈ 20 % » wording replaced); U16 → 05-05 / 05-06; U17 → 05-05 / 05-06 (D-15 replaced by the count-up); U18, U19, U20 → 05-06; U21 → 05-05. New « Cinquième session (à remplir) »: checks U14–U21, hypotheses to confirm (A3, pusher stop, A1, A2, A4, A5, A7, ZUMA coverage, 18 px, lid 600 px, no fast mode, levelwin overlap, rolling fade), the 05-04 HUD-score observation, empty findings table. Earlier sessions untouched.
- **`deferred-items.md`** (new) — the rolling fade re-arm and the HUD-score cosmetic point.

## Verification

- `npm test` → 142/142 + `publication guard: 488 tracked files, none proprietary`; `npm run check` clean; `node tools/build.mjs --local` and `--standalone` pass; `node --test tests/r215-presentation.test.mjs` 15/15; every plan `<verify>` grep passes for the three tasks; `git status --porcelain` contains no `.png`, working tree clean after the last commit.
- Pack not re-imported: `pack.json` (12:11 UTC) is newer than every file of `private_assets/original`; it carries 22 levels, 25 curves, 40 sounds, 5 fonts, 215 strings and `settings.lvl11.repeat === 50`.
- Standalone: 7 728 435 bytes (7.4 MiB), one `R2.0.16` occurrence (badge composed at runtime, `ENGINE_VERSION = '2.0.16'` in the bundle), boots on `file://` with `?level=1-1&debug=1`: badge `R2.0.16 · 2.0.16+20261010T172723 · ressources originales`, « Attention » at tick 0, `go` at tick 89, « PARTEZ », 38 balls at 50 px/s, coin / sparkle / three fonts / STATS kit loaded, config `speed 50, repeatChance 0.51, coinPoints 500, parTime 25`, **console clean**.
- Playwright evidence (Chromium 1.56 from `/opt/pw-browsers`, `tools/serve.mjs` on 8124, script `scratchpad/evidence-r216.mjs`, JSON `shots-r216/evidence-r216.json`; nothing in the repo):

| Capture / log | What it shows | Measured |
| --- | --- | --- |
| `start-feed.png` + `.log` | chain arriving at tick 37, « Attention » | first sample tick 3 at 1 486.7 px/s → implied v0 **1 520** = `feedSpeed(50, 0.35 × 2 773.9)`; `go` at tick **89**, head **42.1 %**, 38 balls, 53.3 px/s; config `startFraction 0.35, repeatChance 0.51, singleLimit 10, endSlowFactor 4, parTime 25, coinPoints 500, zuma 180 / 660, levelBonus 10 000` |
| `pusher-stop.log` | shot into component 0 (s 271, 220 px from the frog, non-matching colour) | `insert` at tick 106 → `stopTicks` **24**, speed **0**; +24 → 0 / 0; +25 → 0.83; +54 → **25**; +84 → **50** (ramp 2.5 px/s per 3 ticks = 50 px/s²) |
| `warning-beats.log` | single ball at `length − 650`, speed 60, `endSlowFactor` 1 | first beat at **599 px**; intervals **4.094, 2.460, 1.473, 0.887, 0.659 s**; gain **1** on every beat, rate 1; side sounds identified: `coinappear` (1.245 s, coin at ≈ 10 s), `coinvanish` and `lose` at the skull |
| `rolling.log` | cruise then forced stop (`stopTicks` 180) | cruise gain **0.6** constant over 450 ms at 50 px/s, `playbackRate` 1, loop 1.209 s; after the stop 0.46 / 0.32 / 0.22 at 50 / 100 / 150 ms, 0.08 at 300 ms, 0.02 at 500 ms (exponential-like: see deferred items) |
| `zuma-banner.png` + `.log` | « ZUMA ! » in NativeAlienExtended18 over the pulsing gauge, « +70 » float, explosion sparks | `target = 1`, pair at s 161 shot with its colour; event `zuma { coverage 0.438, pushback false }` at tick 121, `zumaSlowLeft 0`, `backwardsTicks 0` (head below 50 %: no rollback, as designed); `chant4` ×1 |
| `cleanup-tally.png` + `.log` | yellow « +100 » texts with sparkles along the spiral, score 10 630 at step 6/43 | `clearing` at 1 421 with `levelBonus 10 000`; first `cleanup` at **1 433 (+12)**, 43 steps at 2–3 ticks (2.4); `cleanup-pop` ticks 1 434 … 1 530 every **6**; `won` at **1 564 = 1 534 + 30**, `timeBonus 3 100` (22.2 s), score 14 330 = 30 + 10 000 + 4 300; audio: 17 `bonuspop` (0.382 s) at **gain 0.5 / rate 1** on the pop ticks, `chant5` (2.013 s) at 1 564 |
| `stats-countup-mid.png` | STATS at 1.5 s: BONUS **+600** green, POINTS 14 930, HUD 14 930 | `credited 600` |
| `stats-countup-end.png` + `stats-countup.log` | BONUS **+3100**, POINTS 17 430, RECORD 22 s | count-up done at 3 997 ms; 31 `bonuspop` at **100 ms** intervals, rates 1.016 → **1.5**, gain 0.5; canvas pixels TEMPS `#ffff00` 71, OBJECTIF `#ffa500` 76, BONUS `#2aff03` 126, title dominated by (179, 139, 41) with 2 797 gold pixels in the title band (`title-pixels.mjs`) |
| `stats-nobonus.png` + `.log` | replay with `tick += 3 600`: TEMPS 1:01, « PAS DE BONUS », RECORD 22 s | `#9dcba2` 358 px, `timeBonus 0`, `zuma.best.spiral` still `'22'` |
| `standalone-0507.png` + `.log` | `file://` standalone at « PARTEZ » | see above; console empty |

- Console on the served build during all steps: empty (no error, no warning).

## Deviations from Plan

### Auto-fixed Issues

None in the repository — the plan modifies documentation only and every automated gate passed first time.

### Plan adjustments (documented)

- **Warning fixture speed:** 60 px/s instead of the plan's 300 px/s so that the interval decay 4.1 → 0.6 s is observable (six beats instead of two); `endSlowFactor` 1 as planned.
- **Rolling fade isolation:** measured after a forced `chain.stopTicks = 180` rather than after a shot (an insertion keeps the balls moving during the 12 merge ticks and the 24-tick stop would be masked); the shot case is in `pusher-stop.log`.
- **ZUMA pushback:** the plan asked to record `{ coverage, pushback }` and `zumaSlowLeft`; on a quick 1-1 the head sits at 44 % so `pushback` is `false` and `zumaSlowLeft` 0 — the correct behaviour (the > 50 % branch is locked by r216 on a 640 px fixture).
- **STATS count-up length:** 21 s added to `engine.tick` before the win (bonus 3 100, 4 s of count-up) instead of a raw 1-1 win (≈ 24 000, ≈ 24 s).
- **Title colour check:** the first heuristic (r ≥ 190) returned 0 because the multiplied font is darker than `#f0c040`; a second script (`title-pixels.mjs`) reads the histogram of the title band: dominant (179, 139, 41), 2 797 / 7 200 gold pixels.

## Hypotheses listed for UAT 5

+10 000 per curve (A3) · pusher stop on every rear insertion · `repeat` 50 at 1-1 (A1) · single feed call (A2) · ZUMA banner 120 ticks (A4) · count-up pitch (A5) · `defaultParTime` (A7) · ZUMA rollback from the maximum coverage · 18 px STATS rows · pit cover opening at 600 px · no fast mode for the count-up (remainder on OK) · `levelwin` overlapping the dialog pops · rolling fade ≈ 0.4 s.

## Deferred Issues

- `deferred-items.md`: rolling fade re-armed every frame (`src/audio.ts` `setLoop`, out of scope), HUD score drawn under the GodHead (cosmetic).

## Pending human check (not run — for the user)

The plan's `<human-check>` (UAT 5 on the standalone, macOS): U14 fast feed then « PARTEZ », stop ≈ 0.4 s per rear insertion, ÷ 4 at the end of the track, frequent colour runs; U15 alert from 600 px accelerating without a volume rise; U18 rolling at constant volume; U20 « ZUMA ! » with the pulsing gauge; U16 « +100 » with sparks and regular pops then STATS; U17 BONUS counting up with POINTS following; U19 colours / gold title / right-aligned values; U21 ammo changes at the explosion; plus the hypotheses above. Verdict to be written in `05-UAT.md` « Cinquième session ».

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-05-19 (notes cite addresses, constants and short strings only — no binary excerpt, no picture of the game; guard in `npm test`), T-05-20 (captures under the scratchpad, `git status --porcelain` without `.png` verified by the gate), T-05-SC (no package installed; Playwright from the global install).

## Self-Check: PASSED

Files (5 created / modified + the untracked standalone), the 3 commits above and the 7 captures + 9 logs under `scratchpad/shots-r216/` verified on disk / in `git log` on 2026-10-10; no model identifier in any committed file; no `.png` tracked.
