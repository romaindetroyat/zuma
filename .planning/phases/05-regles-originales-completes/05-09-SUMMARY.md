---
phase: 05-regles-originales-completes
plan: 09
subsystem: documentation
tags: [release-notes, readme, concerns, uat, standalone, playwright-evidence, baseline-2.0.17, hypotheses-b1-b4, deviation-d21]

# Dependency graph
requires:
  - plan: 05-08
    provides: engine score rules (gap bonus paid by the match, 10n + 100·combo, (chain + 5) × 10), score texts and delayed cues, STATS grid / « + » fix / layoutTip, bounded count-up with fast mode, rampPlan, upscale2x and the 2 × assets, r217*.test.mjs, hypotheses B1 / B3 / B4 + D-21 carried into the code, sharp-before / sharp-after captures
  - plan: 05-07
    provides: R216_RELEASE_NOTES.md structure, README « Réglages originaux » / « Pièces et fin de niveau » / « Écran STATS » sections, CONCERNS layout, 05-UAT.md fifth session, deferred-items.md, evidence-r216.mjs script pattern
  - doc: 05-RESEARCH-02.md
    provides: addresses and formulas of the gap bonus (Q1), match / combo / chain score (Q2), count-up without fast mode (Q3), dialog geometry (Q4), hypothesis journal B1–B4
provides:
  - "R217_RELEASE_NOTES.md : Moteur / Présentation / Écran STATS / Netteté / Outils / Tests / Build / Hypothèses à confirmer en UAT — one bullet per rule with the original value (address), the conversion and the locking test; D-21 documented as a deliberate deviation"
  - "README.md : baseline R2.0.17, « Score (règles originales) » table (match, combo, enchaînement, bonus de saut, pièce, bonus de niveau, ACE TIME with a status each), STATS composed in a child canvas on the D-20 grid with the bounded count-up, « Netteté » section (2 × EPX from 1.5 ×, memory), lock line r217, « Statut » with B1 / B3 / B4 and D-21"
  - ".planning/codebase/CONCERNS.md : spike 02 semantics with addresses, hypotheses B1 / B3 / B4 + « +N » colour + waiting ball, deliberate deviation D-21, fixed bugs (rolling fade, « + », ellipsis, precache), STATS canvas and 2 × assets cost, missing (B4 guard, waiting-ball rule, xBR, gauntlet base), audit R2.0.17"
  - "05-UAT.md : U22–U25 Décision cells point to 05-08 with the delivered values; the two superseded fifth-session hypotheses marked delivered; « Sixième session (à remplir) » with checks, hypotheses, the cosmetic note and an empty findings table"
  - "deferred-items.md : rolling fade marked fixed in 05-08 (rampPlan); « Relevés en 05-08 » (B4 guard, waiting ball and chain, xBR, 2 × memory, gauntlet base, HUD score under the head)"
  - "standalone/zuma-standalone.html R2.0.17 (untracked, 7 751 313 bytes); scratchpad/evidence-r217.mjs and 21 captures + 14 logs under scratchpad/shots-r217/ (never in Git)"
affects: [UAT 6 (user), phase 6 (notes structure, deferred B4 / waiting-ball rule, memory of the 2 × assets)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence fixtures on the real spiral: a ray from the frog is scanned for its crossings with the track (sign flips of the perpendicular distance, tunnel-free, near-perpendicular tangent); the nearest crossing hosts the gap balls (± 48 px of track = 64 px free width), the next one the run to complete — no synthetic track needed in the browser"
    - "Fixture gaps must not face same-coloured balls across the gap: the engine's attraction pulls the front segment back and changes the measured width (first double-gap run paid 920 instead of 1 000 for that reason — fixture bug, not engine bug)"
    - "Pixel evidence on the 3.125 × composed STATS uses a luminance criterion for glyph bottoms (tint-tolerance bands miss the anti-aliased bottom row of thin single glyphs and read 1 logical px too high)"
    - "Audio evidence hooks game.audio.play (cue key / rate / delay) in addition to AudioBufferSourceNode.start (actual start(when) offset)"

key-files:
  created: [R217_RELEASE_NOTES.md]
  modified: [README.md, .planning/codebase/CONCERNS.md, .planning/phases/05-regles-originales-completes/05-UAT.md, .planning/phases/05-regles-originales-completes/deferred-items.md]

decisions:
  - "The count-up evidence uses parTime 2 500 and 1 413 s of level time to obtain exactly 10 900 (unreachable with parTime 25 and integer seconds); the STATS grid evidence keeps the 05-07 recipe (21 s added, bonus 3 100)"
  - "The « + » tint check is reported as « both glyphs reach the full #2aff03 (max green 255) » rather than equal means: the thin 2 px strokes of the « + » are blended more by the 1.56 × bilinear draw of the 2 × atlas, so its mean is lower by construction; the 05-08 before-state (max alpha 224) is the comparison point"
  - "STATE.md / ROADMAP.md / REQUIREMENTS.md untouched (orchestrator instruction); the final human check (UAT 6) is left to the user with « Sixième session (à remplir) » empty"

metrics:
  duration: "~25 min (18:37 → 19:02 UTC)"
  completed: 2026-10-10
  tasks: 3
  commits: 3
  tests: "176/176 + publication guard (498 tracked files, none proprietary), unchanged by this plan"
---

# Phase 5 Plan 09: Notes R2.0.17, README, CONCERNS, décisions UAT 5, standalone et preuves — Summary

Baseline 2.0.17 is auditable end to end: `R217_RELEASE_NOTES.md` mirrors R216 and ties every rule of spike 02 (gap bonus `max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀) × gaps` paid by the match, `10 × n + 100 × combo`, `(chain + 5) × 10`, texts and delayed `gapbonus1`, the STATS grid and « + » fix, the bounded count-up documented as the deliberate deviation D-21, the EPX sharpness mechanism and its 16.3 MiB) to its `r217*` lock; the README gets a « Score (règles originales) » table and a « Netteté » section; CONCERNS lists what spike 02 settled and the hypotheses B1 / B3 / B4 (+ « +N » colour, waiting ball) that remain; `05-UAT.md` points U22–U25 to 05-08 and opens an empty sixth session; the rebuilt standalone (7 751 313 bytes, `R2.0.17`, clean console on `file://`) and 21 Playwright captures (including the 05-08 sharpness and glyph crops) with 14 logs in the scratchpad show the gap bonus paid at the match tick (530 / 500, 1 030 / 1 000 with the second cue at +150 ms), nothing on a miss, « COMBO x2 » and « ENCHAÎNEMENT x5 / x6 », a STATS right column sitting exactly on the left grid at DPR 2, the 19 × 600 count-up done at 2.8 s (2 500 per step after a click), and the linear 150 ms rolling fade.

## Tasks

| # | Task | Commit | Files |
| --- | --- | --- | --- |
| 1 | Notes de version R2.0.17 et README | `0f3aeab` | R217_RELEASE_NOTES.md, README.md |
| 2 | CONCERNS.md, décisions UAT 5, points différés | `7c38986` | .planning/codebase/CONCERNS.md, 05-UAT.md, deferred-items.md |
| 3 | Vérification finale — suite, standalone R2.0.17, preuves Playwright, section Build | `30eb5b0` | R217_RELEASE_NOTES.md |

## What was built

- **`R217_RELEASE_NOTES.md`** (85 lines) — intro (UAT 5 + spike 02); `## Moteur` (gap bonus formula and table, B1, arming / payment / forfeit with addresses, match score without the n − 3 premium, chain bonus from the 5th direct hit and the unimplemented `+0x32` refinement, events, version lock); `## Présentation` (texts in the ball colour, COMBO x / BONUS … SAUT / ENCHAÎNEMENT x, delayed cues via `SoundCue.delay` and `clampDelay`, `chain1`, match sounds confirmed with the B4 guard not implemented, `rampPlan`); `## Écran STATS` (grid D-20 with the Q4 columns and the B3 fallback, « + » cause measured — mask alpha 187 vs 255 — and `normalizeGlyphAlpha`, single `formatSeconds`, `layoutTip` with the « ... » fallback, bounded count-up and `BONUS_FAST_STEP` with the explicit statement that the original never accelerates in adventure — deliberate deviation D-21); `## Netteté` (composition at the backing-store scale in a child canvas and its measured cost, `upscale2x` with xBR rejected, the 2 × asset sets from `HD_MIN_SCALE` 1.5, `applyHd` switch, memoised fonts, 16.26 MiB breakdown); `## Outils` (`MODULES` + `upscale`, precache completed, `.stats-picture` rule, importer unchanged); `## Tests` (r217 and r217-presentation sections, every adjusted legacy file with its reason, total 176); `## Build` (commands, counts, standalone size / occurrences / badge / boot / console / precache, the measured evidence in prose); `## Hypothèses à confirmer en UAT` (A1–A7, pusher stop, ZUMA coverage, 18 px, lid 600 px, levelwin / pops and the non-localised subjects carried over; « no fast mode » and « rolling fade » removed as delivered; B1, B3 / Q4, D-21, waiting ball without chain, B4, « +N » colour, EPX vs xBR, child canvas added).
- **`README.md`** — baseline R2.0.17; « Pixels nets » sentence notes it disables the 2 × copies; new « Score (règles originales) » table (match `10 × n`, combo `+100 × combo` with « COMBO x{combo + 1} », enchaînement `(chain + 5) × 10` with « ENCHAÎNEMENT x{chain} », bonus de saut with the full scale × gaps / paid at the match / kept against its colour, coin, level bonus A3, ACE TIME — each with « vérifié par analyse statique » or « hypothèse Bn ») plus the B4 note; « Écran STATS d'origine » rewritten for the child canvas at the canvas scale, the shared grid, the « + » normalisation, the two-line tip, the single formatter, the bounded count-up and click-to-fast flagged as a documented deviation, no PNG; new « Netteté » section; lock line for r217; « Statut » lists the newly verified rules, B1 / B3 / B4, the « +N » colour, the waiting ball and D-21. « Fournir ses propres graphismes » untouched.
- **`CONCERNS.md`** — second « Établi » bullet with the spike 02 addresses (0x420b80, 0x421240, 0x421cac–0x421d2b, 0x40a810, 0x421d59 / 0x421dbc, 0x415350, 0x440b00, 0x447dd5); hypotheses bullet gains B1, B3, B4, « +N » colour, waiting ball and the deliberate deviation D-21, loses « compte à rebours sans mode rapide »; why / impact / fix updated (B1 by video, D-21 reversible); Known Bugs lists the four R2.0.17 fixes (rolling fade, « + », ellipsis, precache); Performance gains the STATS canvas cost and the 2 × asset memory; Fragile Areas gains the `upscale.ts` leaf constraint and the shared memoised fonts; Missing gains the B4 guard, the `+0x32` rule, xBR, the gauntlet base; audit date R2.0.17.
- **`05-UAT.md`** — U22 → 05-08 (child canvas, 2 × EPX sets from 1.5 ×, bilinear background, « Pixels nets » unchanged, 16.3 MiB); U23 → 05-08 (grid, « + » cause 187 vs 255 normalised, `formatSeconds`, two-line tip, B3); U24 → 05-08 (bounded step, click 2 500, OK, original never accelerates — deliberate deviation); U25 → 05-08 (payment at the match, scale, waiting ball, score, chain, labels, « +N » colour, cues, B1). Fifth-session hypotheses « sans mode rapide » and « fondu » marked delivered. New « Sixième session (à remplir) »: standalone R2.0.17, checks U22–U25, hypotheses (B1, B3, D-21, waiting ball, B4, « +N » colour, EPX, child canvas, carried-over A-list), cosmetic note, empty findings table. Earlier sessions untouched.
- **`deferred-items.md`** — rolling fade item closed (« Corrigé en 05-08 », `rampPlan`, lock named); « Relevés en 05-08 » with the B4 guard, the waiting ball / chain rule, xBR, the 2 × memory (16.26 MiB vs the plan's < 12 Mo, structural), the gauntlet base 250, the HUD score cosmetic.
- **Build and evidence** — see Verification.

## Verification

- `npm test` → 176/176 + `publication guard: 498 tracked files, none proprietary` (497 before `R217_RELEASE_NOTES.md`); `npm run check` clean; `node tools/build.mjs --local` and `--standalone` pass; `node --test tests/r215-presentation.test.mjs` 15/15; `dist/js/upscale.js` present; `dist/sw.js` precaches `upscale.js`, `bitmapfont.js`, `statsdialog.js`; every plan `<verify>` gate passes for the three tasks; `git status --porcelain` contains no `.png`; no model identifier in any committed file.
- Standalone: 7 751 313 bytes (7.4 MiB, +22 878 vs R2.0.16), two literal `R2.0.17` (CSS and JS version comments), badge composed at runtime `R2.0.17 · 2.0.17+20261010T185125 · ressources originales`, `ENGINE_VERSION = '2.0.17'`; boots on `file://` with `?level=1-1&debug=1` (Chromium 1.56 headless, 1 000 × 750 CSS, DPR 2): « Attention » at tick 0, `go` at tick 89, « PARTEZ », 38 balls, scale 3.125, `pixelScale` 2, kit 2 ×, STATS opened from the HUD button into a 2 000 × 1 500 child canvas (compose 2.1 ms), tip from the pack on two lines with « ... », **console clean**.
- Playwright evidence (Chromium from `/opt/pw-browsers`, `tools/serve.mjs` on 8140, script `scratchpad/evidence-r217.mjs`, JSON `shots-r217/evidence-r217-run1.json` (full run) and `evidence-r217.json` (rerun of the gap and STATS steps after the fixture fix); nothing in the repo):

| Capture / log | What it shows | Measured |
| --- | --- | --- |
| `gap-bonus.png` + `.log` | shot from the frog (angle 0) through a 64 px gap on the inner loop (s 2 365 / 2 461) into a 1 0 0 2 run on the next loop (s 1 437–1 533); « +530 » in the ball colour and « BONUS SAUT » over the explosion | `insert` tick 102 with **no point, no event, no SAUTS**; `destroy { points 530, gapPoints 500, gapCount 1, count 3, depth 1 }` and `gap { count 1, points 500 }` at the **same tick 114**; one `gapbonus1` immediate (rate 1, delay 0); score = gauge = 530, SAUTS 1; floats `+530` `#1980ff` (colour 0) and `BONUS SAUT` |
| `gap-double.log` | three crossings: 64 px gap, 100 px gap (s 1 435 / 1 567), run at s 210–306 | `destroy { points 1030, gapPoints 1000, gapCount 2 }`, `gap { count 2, points 1000 }` (500 × 2, the narrowest, not 500 + 440); floats `+1030`, `BONUS DOUBLE SAUT`; two `gapbonus1`: second with `delay 0.15` and `start(now + 0.15)` at rate **1.1225** (+2 semitones) |
| `gap-miss.log` | same single-gap fixture, colour 3 (no neighbour of its colour) | `insert` only (tick 193); score unchanged (1 560 → 1 560); inserted ball `gapBonus` / `gapCount` absent; no float, no `gap` cue; `streak` 0 |
| `combo-chain.png` + `.log` | 1 1 0 0 1 run: « +30 », then « +130 » (yellow, colour 1) and « COMBO x2 » | `destroy depth 1 (30)` at tick 109, `destroy depth 2 (130, chainBonus 0)` at tick 136; cues `destroy1` + `combo` (0.4, rate 1) then `merge`, `destroy2` + `combo` (0.6, rate **1.1225**); six consecutive direct matches: 30 × 4 (streak 1–4, no `streak` event), 5th → `{ points 130, chainBonus 100, streak 5 }` + `streak { 5, 100 }`, float `ENCHAÎNEMENT x5`, `chain1` rate **1**; 6th → 140 / 110 / `ENCHAÎNEMENT x6`, rate **1.0595** |
| `stats-grid-dpr2.png` + `.log` | STATS at 1 000 × 750 CSS, DPR 2, level won at 22 s (POINTS 17 430, TEMPS 22 s, OBJECTIF 25 s, BONUS +3100, RECORD 22 s) | scale 3.125, child canvas **2 000 × 1 500** first child of `.zuma-stats`, `statsKit.pixelScale` **2**; luminance bottoms (px physical) left values 680 / 736 / 793 / 849 / 905 / 961 vs TEMPS **680**, OBJECTIF **736**, BONUS **849**, RECORD **905** → **0 px** difference on the four shared rows (labels: left 680 / 737 / 793 / 849 / 905 / 962, right 680 / 737 / 849 / 905); bonus glyphs: « + » max green **255**, digits max green **255** (05-08 before-state: « + » peaked at 224), « + » 282 px with mean (47, 185, 22), digits 2 362 px with mean (44, 217, 13) — the thin « + » blends more; tip **2 lines**, left edges 713 / 716 px physical = 228.2 / 229.1 logical (common edge within glyph side bearing), second line ends with « ... »; count-up 16 steps done at 2.7 s, 33 `bonuspop` |
| `countup.log` | bonus **10 900** (`parTime` 2 500, 1 413 s) three times | normal: 19 steps of **600** at 1 005, 1 120, … 2 718 ms then +100 at **2 809 ms** (≈ 2.8 s after the opening, 1.8 s after the start), `credited === timeBonus`, POINTS 25 230; fast: `pointerdown` on the dialog at ≈ 1.2 s → 600 / 1 200 / 1 800 then **2 500** per step (4 300, 6 800, 9 300, 10 900 at **1 619 ms**); OK at 1.2 s (shown 1 800) → score **25 230** at once (remainder credited, next level loaded) |
| `rolling-fade.log` | cruise then `chain.stopTicks = 180`, read every 25 ms | gain **0.6** constant at 50 px/s; 0.554 @ 25 ms, 0.438 @ 51, 0.321 @ 78, 0.24 @ 103, 0.112 @ 129, 0.031 @ 154, **0 @ 179** — linear 0.6 → 0 over 150 ms (≈ 0.3 at 75 ms); `playbackRate` 1 |
| `sharp-before-*.png` / `sharp-after-*.png` + 4 × crops + logs (05-08) | HUD and STATS at 3.125 × with bilinear 1 × assets vs 2 × EPX | before: `pixelScale` null, ball sheets 32 × 1 504, menubar 640 × 480, compose 1.5–2.2 ms; after: `pixelScale` 2, sheets 64 × 3 008, menubar 1 280 × 960, kit 2 ×, compose 0.8–1.6 ms, 40 pictures / 16.26 MiB; toggle to « Pixels nets » and back without reload (see 05-08) |
| `sharp-pixelated.png` + `.log` | « Pixels nets » on at DPR 2 (level 1-2 after OK) | `pixelated` true, scale **1**, store 640 × 480, `pixelScale` **1**, kit **1** |
| `sharp-dpr1.png` + `.log` | 640 × 480 viewport, DPR 1 | scale 1, `pixelScale` 1, `hdAssets` **null**, `statsKitHd` **null** (no 2 × asset built) |
| `standalone-0509.png` + `.log` | `file://` standalone, STATS opened from the HUD at « PARTEZ » | see above; console empty |

- Console on the served build during all steps: empty (no error, no warning).

## Deviations from Plan

### Auto-fixed Issues

None in the repository — the plan modifies documentation only and every automated gate passed first time.

### Plan adjustments (documented)

- **Spiral instead of the r217 rectangle:** the browser cannot swap the level track, so the fixtures are placed on the real 1-1 spiral along a ray from the frog (crossings at s 2 413 / 1 501 / 274, 98 / 145 / 194 px away): the gap balls sit ± 48 px of track around the nearest crossing (64 px free), the run on the next loop. Same rule coverage as the rectangle fixture (500 paid at the match, 1 000 for 64 / 100 px, nothing on a miss).
- **Double-gap fixture colours:** the first run paid 920 (count 2) because the second gap's outer ball shared the colour of the first gap's inner ball and the engine's attraction pulled that segment back (2 365 → 2 005) while the projectile crossed (measured width 88 at the crossing); the colours were changed and the step rerun → 1 000. Fixture error, no engine issue.
- **Baseline measurement:** tint-tolerance bands read the single-digit left values 3 px (1 logical px) higher than the right ones because the anti-aliased bottom row of a thin « 0 » / « 1 » falls outside the tolerance; a per-glyph probe (all digits and « S » share the same bottom) and a luminance criterion show the bottoms are identical (0 px) on every shared row, as the label bottoms already did.
- **Bonus 10 900:** unreachable with `parTime` 25 and integer seconds (`100 × (1 + 10 × (25 − t))`); obtained with `parTime` 2 500 and 1 412 s added to `engine.tick` (t 1 413 → `⌊(2 500 − 1 413) / 10⌋ = 108` → 10 900).
- **OK mid-count-up:** the dialog closes and the next level loads, so `timeBonusCredited` reads 0 on the new engine; the evidence is the score (25 230 = 14 330 + 10 900 credited at once).
- **Standalone `R2.0.17` occurrences:** two (version comments in the bundled CSS and JS) instead of 05-08's one — the badge is still composed at runtime.

## Hypotheses listed for UAT 6

B1 (gap width in px of track — scale too generous?) · B3 / Q4 (value alignment and exact y of the STATS) · D-21 (bounded count-up and click-to-fast = deliberate deviation; ≈ 2 s feel) · waiting ball keeps its gap bonus but not the chain · B4 (match sounds despite a power-up) · « +N » colour = rendered ball colour · EPX vs xBR glyph legibility · STATS child canvas (resize, hover) · carried over: A3, pusher stop on every rear insertion, A1, A2, A4, A5, A7, ZUMA max coverage, 18 px rows, lid 600 px, `levelwin` / pops.

## Deferred Issues

- `deferred-items.md` « Relevés en 05-08 »: B4 guard, waiting-ball chain rule (`+0x32`), xBR, 2 × memory (16.26 MiB: menubar crop / shared shadow possible), gauntlet base 250, HUD score under the GodHead (cosmetic).

## Pending human check (not run — for the user)

The plan's `<human-check>` (UAT 6 on the standalone, macOS Retina, level 1-1): (U22) HUD, chain and STATS sharp at the window size, compared with « Pixels nets »; (U23) TEMPS on POINTS, OBJECTIF on COMBOS, rule on PIÈCES, BONUS on SAUTS, RECORD on ENCH. MAX., « + » as green as its digits, « 34 s » / « 1:00 » consistent, two-line left tip; (U24) BONUS counted in ≈ 2 s, a click accelerates, OK credits the rest; (U25) « BONUS SAUT » and a fat « +N » on a gap shot that explodes, nothing on a gap shot that does not, « COMBO x2 » on a reaction, « ENCHAÎNEMENT x5 » on the fifth consecutive hit; plus the hypotheses above. Verdict to be written in `05-UAT.md` « Sixième session ».

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-05-26 (notes and README cite addresses, constants and short strings only — no binary excerpt, no picture of the game; guard in `npm test`), T-05-27 (captures under the scratchpad, `git status --porcelain` without `.png` verified by the gate), T-05-SC (no package installed; Playwright from the global install).

## Self-Check: PASSED

Files (1 created / 4 modified + the untracked standalone), the 3 commits above and the 21 captures + 14 logs under `scratchpad/shots-r217/` verified on disk / in `git log` on 2026-10-10; no model identifier in any committed file; no `.png` tracked; STATE.md / ROADMAP.md untouched by instruction.
