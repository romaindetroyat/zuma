---
phase: 05-regles-originales-completes
plan: 11
subsystem: documentation + release
tags: [release-notes, r2.0.18, readme, concerns, uat-7, standalone, playwright-evidence]

# Dependency graph
requires:
  - plan: 05-10
    provides: R2.0.18 code (CURV tunnel / priority, draw passes, native in-game menu, whole-window input, fitScale, extra lives, coin cadence, rolling fade, simultaneous tally), 42 evidence files, hypotheses list C1–C4 / D-24 / D-26 / D-27 / D-29 / D-30
  - doc: 05-RESEARCH-03.md
    provides: addresses and hypotheses log (C1–C4) quoted by the notes and CONCERNS
provides:
  - "R218_RELEASE_NOTES.md (structure of R217: engine, render, in-game menu, input and window, audio and HUD, tools, tests, build, UAT hypotheses)"
  - "README: baseline R2.0.18, controls table, « Tunnels et calques », coin cadence and simultaneous tally (D-30), « Vies », « Menu de jeu », « Pixels nets » in device pixels, `treasurefreq` row, r218 locks, status"
  - "CONCERNS: spike 03 semantics, C1–C4 and the menu / rolling unknowns, deliberate deviation D-30 beside D-21, 05-10 presentation choices, R2.0.18 fixes, fragile areas, missing items, audit R2.0.18"
  - "05-UAT: U26–U33 « livré en 05-10 (…) », « Septième session (à remplir) » with an empty findings table"
  - "deferred-items: « Relevés en 05-10 », « Relevés en 05-11 »"
  - "standalone R2.0.18 rebuilt (7 806 137 bytes, untracked) and booted from file://; 8 new evidence files in scratchpad/shots-r218/"
affects: [UAT 7 (user), phase 6 (main menu, music)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence by hand-stepped engine inside the page (game paused, `engine.step()` loop, `moveChain` stubbed on the instance) for long statistical runs and single-ball collision checks"

key-files:
  created: [R218_RELEASE_NOTES.md]
  modified: [README.md, .planning/codebase/CONCERNS.md, .planning/phases/05-regles-originales-completes/05-UAT.md, .planning/phases/05-regles-originales-completes/deferred-items.md]

decisions:
  - "D-30 recorded as a deliberate deviation beside D-21 (why / impact / way back) in the notes, the README and CONCERNS"
  - "A6 (`treasurefreq`, coin cadence) and the `dist` clearance rule are withdrawn from the open hypotheses: settled by spike 03 and delivered in 05-10"
  - "README « Fournir ses propres graphismes » left untouched as the plan requires, its stale flags sentence logged in deferred-items"

metrics:
  duration: "~11 min (20:45 → 20:56 UTC, plus summary)"
  completed: 2026-10-10
  tasks: 3
  commits: 3
  tests: "212/212 + publication guard (507 tracked files)"
---

# Phase 5 Plan 11: Release R2.0.18 — Summary

Documentation and delivery of the R2.0.18 baseline: `R218_RELEASE_NOTES.md` mirrors R217 and ties every rule of 05-10 to its address in `Zuma.exe` (spike 03) and to the `r218` / `r218-presentation` test that locks it; the README now has a controls table (left click shoots anywhere, right click swaps, Space / Enter / Escape = menu, Tab = STATS, P, M), sections on tunnels and draw layers, lives, the in-game menu, the original coin cadence and the simultaneous tally (deviation D-30); CONCERNS carries the spike 03 semantics, hypotheses C1–C4 and D-30 beside D-21; the UAT file closes U26–U33 and opens the seventh session; the standalone is rebuilt (7 806 137 bytes, console clean from `file://`) and eight new Playwright evidence files complete the 42 of 05-10.

## Tasks

| # | Task | Commit | Files |
| --- | --- | --- | --- |
| 1 | R2.0.18 release notes and README | `a0a8b26` | R218_RELEASE_NOTES.md, README.md |
| 2 | CONCERNS, UAT 6 decisions, UAT 7 section, deferred items | `c4ea05c` | .planning/codebase/CONCERNS.md, 05-UAT.md, deferred-items.md |
| 3 | Final verification: suite, standalone, Playwright evidence, Build section | `62915c5` | R218_RELEASE_NOTES.md |

## Verification

- `npm test` → **212/212** + `publication guard: 507 tracked files, none proprietary`; `npm run check` clean; `node tools/build.mjs --local` and `--standalone` → `standalone/zuma-standalone.html` **7 806 137 bytes** (identical to the 05-10 build), 4 literal `R2.0.18`; `node --test tests/r215-presentation.test.mjs` 15/15; `dist/js/menudialog.js` present (21 165 bytes) and precached by `dist/sw.js`. Every task `<verify>` gate passed (Task 3 gate run in full). `git status --porcelain` clean, no `.png`, `dist/`, `standalone/` or `private_assets/` tracked; no model identifier in any committed file.

### Evidence (`scratchpad/shots-r218/`, never in Git)

| Plan item | File(s) | Origin | Measure |
| --- | --- | --- | --- |
| 1 Tunnels 2-2 | `tunnel-before-2-2[-late].png`, `tunnel-after-2-2[-late].png`, 8 × `*-left-x4.png` / `*-right-x4.png`, `tunnel-{before,after}-2-2.log` | 05-10 | before: 32 of 58 balls not drawn (tick 348), 40 of 66 (tick 886); after: 58 / 58 (26 P0, 32 P1, 11 in tunnels), 66 / 66 |
| 1 Tunnel hit | `tunnel-hit.log` | **05-11** | tunnels at s 156–294 / 560–764 px; shot at a lone ball in a tunnel (s 225, (452, 80)): passes 0.3 px from its centre, no `insert`, `miss`; ball outside (s 414): `insert` 7 ticks after the shot |
| 2 Menu | `menu-dpr2.png`, `menu-help.png`, `menu-confirm.png`, `menu-hover[-crop].png`, `menu-pressed[-crop].png`, `menu-slider.png`, `menu-pixelated.png`, `menu-vector.png`, `menu-pack.log`, `menu-vector.log` | 05-10 | child canvas 2 000 × 1 500, kits 2 ×, compose 0.5–1.1 ms, tick frozen |
| 2 Menu keys | `menu-keys.log` | **05-11** | Space opens (focus « Retour à la partie »), tick frozen at 96; Down: sfx → fullscreen → pixels → help → main-menu → back (music skipped); Left, Left, Right → volume / `zuma.sfx` 0.9 / 0.8 / 0.9; Enter on Aide → help view, Escape → menu view (still open); Enter on back closes, engine runs (106 → 138 in 0.5 s); Escape and Enter also open / close |
| 3 Input / size | `aim-edge.log`, `window-sizes.log`, `pixels-1440x900-dpr2.png`, `smooth-1440x900-dpr2.png`, `window-1000x750-dpr2[-pixels].png` | 05-10 | margin (20, 450) → aim (0, 240); 1 000 × 750 « Pixels nets » → 960 × 720 CSS |
| 4 Lives | `extralife.log`, `extralife-hud.png` | 05-10 | 49 999 + match → `extra-life` at the destroy tick, three cues 0 / 0.3 / 0.6 s, three frogs + « +1 » |
| 4 Life in STATS | `extralife-stats.log` | **05-11** | score set to 49 950 at `won`, ACE TIME 25 100 counted by 1 300: `extra-life { lives 4, count 1 }` at the first step (≈ 1 s after the STATS opened, score 51 250), lives 3 → 4, three `extralife` cues (delays 0 / 0.3 / 0.6, sources started +0 / +0.3 / +0.6 s), no text |
| 5 Coin cadence | `coin-cadence.log` | **05-11** | 1-1, 20 000 ticks by `engine.step()` (chain held at 42 %, cadence restarted by `setTreasure`): first coin at tick 507, 11 coins in 10 000 ticks, intervals 781–1 121 (mean 932, expected ≈ 960), each visible exactly 600 ticks, points 3 / 4 / 4; ZUMA forced at 10 000 → 0 coins over the next 10 000 ticks |
| 5 Coin audio | `coin-audio.log` | 05-10 | `coinappear` gain 0.4, pan 0.24 at x 576 |
| 6 Rolling | `rolling-fade.log` | 05-10 | 0.35 constant, linear to 0 at 521 ms, released at once by P |
| 7 Two-chain tally | `tally-dual.png`, `tally-dual.log` (+ `tally-two-chains.png` / `.log` of 05-10) | **05-11** | 1-5 `blackswirley`, both chains emptied by `loadFixture`, last explosions at 60 % / 30 %: markers 17 / 30 steps, both chains at the same ticks (+12, +15, +17, +20, +22 …), +100 per step, 12 pops 6 ticks apart, `won` 112 ticks after clearing and 30 after the last step; the picture shows both trails of « +100 » and sparkles at once |
| 8 Standalone | `standalone-r218.png`, `standalone-r218-go.png`, `standalone-r218.log` (re-run on the new build), `standalone-r218-late.png` / `.log` | 05-10 script, **re-run** + **05-11** | `file://…?level=2-2`: « PARTEZ » (go 103), scale 3.125, assets / STATS / menu kits 2 ×, Escape → menu, help view badge `R2.0.18 · 2.0.18+20261010T205058 · ressources originales`, console clean; at tick 344: 58 balls on the track all drawn (26 P0, 32 P1, 10 in tunnels), outer balls under the cutouts, inner spiral over them |
| — | `reimport.log` | 05-10 | pack re-import (22 levels, 25 curves, 82 images) |

Evidence total: 50 files (42 from 05-10, 8 new: `tunnel-hit.log`, `menu-keys.log`, `extralife-stats.log`, `coin-cadence.log`, `tally-dual.png`, `tally-dual.log`, `standalone-r218-late.png`, `standalone-r218-late.log`; `standalone-r218*.png/.log` refreshed). Script: `scratchpad/evidence-r218.mjs` (sections `tunnel`, `menu`, `extralife`, `coins`, `tally`, `standalone`).

## Deviations from Plan

### Plan adjustments (documented, no rule weakened)

- **`tally-dual` uses forced last-explosion points** (60 % / 30 %, as 05-10's `tally-two-chains`): the plan asks for chains emptied by `loadFixture` then ZUMA, which is done, but with no destruction both markers would walk their whole track from the start; forcing `lastDestroy` shows two markers of different lengths.
- **Coin cadence measured with the chain held still** (`moveChain` stubbed on the instance, `stream` off) and the cadence restarted by `setTreasure` at the start of the run, so the 20 000 ticks stay in `playing`; the first appearance is therefore counted from that call (≥ 180 holds).
- **README « Fournir ses propres graphismes » untouched** as the plan requires, although its sentence « `flags` bit 1 = la bille passe sous une découpe, bit 2 = bille cachée » describes the old decoding; logged in `deferred-items.md` (« Relevés en 05-11 »).
- **README extras**: the module table gains `src/menudialog.ts`, the settings table a verified `treasurefreq` row (it was listed as « non interprété »), and the « Fin de piste » paragraph the new rolling values — needed for consistency with R2.0.18.
- **CONCERNS**: A6 withdrawn from the open hypotheses (settled by spike 03) and D-17 (constant rolling gain) marked as confirmed by the spike.

### Auto-fixed Issues

- **Evidence script** read `cue.name` instead of `SoundCue.key` on the first run of the `extralife` section (no cues logged); fixed and re-run. Scratchpad only.

## Not verifiable here

- The `<human-check>` of Task 3 (UAT 7 on macOS, Retina, Safari / Chrome) is for the user: `05-UAT.md` « Septième session (à remplir) » has its checks and hypotheses and an **empty** findings table.
- Hypotheses that only the original game or the user's ear can settle: C1 (right click = swap), C2, C3 (pan strength), C4, GodHead / margins of the menu, D-30 feel, rolling gain 0.35, Space = menu.
- Audio was observed through Web Audio hooks (cue lists, `AudioBufferSourceNode.start` offsets, gain values), not listened to.

## Known Stubs

- `music` slider intentionally inert and greyed (no music before phases 6–7) — unchanged from 05-10, documented in the notes, README and CONCERNS.

## Threat Flags

None. T-05-35: the notes, README and CONCERNS carry addresses, numbers and short strings only (no binary excerpt, image or curve data); `npm run guard` green. T-05-36: captures and the re-imported pack stay in the scratchpad / `private_assets/`; `git status --porcelain` shows no `.png`.

## Self-Check: PASSED

`R218_RELEASE_NOTES.md`, README, CONCERNS, `05-UAT.md`, `deferred-items.md` present on disk; commits `a0a8b26`, `c4ea05c`, `62915c5` in `git log`; 212/212 + guard; 50 files under `scratchpad/shots-r218/`; STATE.md / ROADMAP.md untouched by instruction.
