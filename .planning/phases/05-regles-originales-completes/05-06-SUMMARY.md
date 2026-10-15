---
phase: 05-regles-originales-completes
plan: 06
subsystem: presentation
tags: [warning-beat, rolling-loop, zuma-banner, end-of-level-tally, sparks, stats-dialog, ace-time-countup, bitmap-font-multiply, capHeight, level-clock]

# Dependency graph
requires:
  - plan: 05-05
    provides: engine.levelTicks / timeBonus / timeBonusCredited / creditBonus, events zuma { coverage, pushback } · clearing · cleanup { step } · cleanup-pop · won, Chain.speed
  - plan: 05-04
    provides: RenderAssets.fonts (title / text / float), floating texts, STATS at the end of a level, configFromSettings
  - plan: 05-03
    provides: native STATS dialog (statsdialog kit, composeStatsDialog, statsValues, STATS_LAYOUT), BitmapFont
  - doc: 05-RESEARCH.md
    provides: §5 warning interval, §6 ZUMA, §7 tally presentation, §8 STATS colours / count-up / pop pitch
provides:
  - "audio.ts : WARNING_DISTANCE 600 (danger), warningIntervalAt(rem) = max(0.1 + 4·rem/600, (rem/11 + 60)/100) s, warningInterval(level), WARNING_GAIN 1 / warningGain() constant, FAR / NEAR constants removed ; ROLLING_GAIN 0.6, ROLLING_MIN_SPEED 2, ROLLING_FADE_SECONDS 0.15, loopLevels({ speed, playing }) → rolling 0 | 1 ; setLoop ramps linearly (50 ms in, 150 ms out) at pitch 1"
  - "feedback.ts : soundCues cleanup → [], cleanup-pop → bonuspop gain 0.5 rate 1 ; makeSparks(x, y, step, tick) = 5 white sparkles ± 10 px seeded from (step, tick)"
  - "bitmapfont.ts : DrawOptions.multiply (colour font × colour, cached atlas `|mult|`), BitmapFont.capHeight (ink rows of 'A', then rect height, then ascent)"
  - "statsdialog.ts : STATS_COLORS (time #ffff00, objective #ffa500, bonus #2aff03, noBonus #9dcba2, title #f0c040), STATS_LINE_RATIO 1.65 (+ STATS_LINE_FALLBACK 19 / MIN 16 / MAX 20), statsRows(lineHeight, first), bonusCountUp(total, ms), bonusPopRate(shown, total), StatsInput.timeBonusShown ; composeStatsDialog draws the title multiplied by gold, rows from the capital height, « PAS DE BONUS » tinted noBonus"
  - "main.ts : « ZUMA ! » banner 120 ticks (strings.ZUMA fallback), yellow « +100 » + makeSparks per cleanup, no won message, STATS at won, TEMPS = ⌊levelTicks / tickHz⌋, ACE TIME count-up in the dialog (statsBonus, scheduleBonusCountUp, bonusStep → engine.creditBonus, refreshStatsValues), remainder credited once in closeStats"
  - "render.ts : the full gauge pulses 0.55 + 0.45·sin(frame / 4) in ZUMA mode (pack and vector HUD)"
  - "tests/r216-presentation.test.mjs (16 tests, 281 lines) : every table above, cues, sparks, end-to-end STATS literals of a known fixture, source locks ; r214-presentation / r215-presentation / r215 adjusted with « R2.0.16 » comments"
affects: [05-07 (R216 release notes, README « Réglages originaux » / audio, 05-UAT verdicts U15–U20, CONCERNS hypotheses below), phase 6 (menu / music reuse DrawOptions.multiply and capHeight)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentation schedules (count-up, warning interval) are pure exported functions locked by tables; the DOM timers only evaluate them at their deadline so the real code and the tested function coincide"
    - "Presentation randomness goes through a SeededRandom derived from (step, tick) — never engine.rng — and the compiled body is locked against Math.random"
    - "Font metrics that matter to the layout are measured on the glyph pixels at load time (capHeight) with deterministic fallbacks and a bounded consumer (T-05-18)"
    - "Engine credit from the presentation is bounded by what the engine still owes (timeBonus − timeBonusCredited), stepped, and settled once on close (T-05-15)"

key-files:
  created: [tests/r216-presentation.test.mjs]
  modified: [src/audio.ts, src/feedback.ts, src/render.ts, src/main.ts, src/statsdialog.ts, src/bitmapfont.ts, tests/r214-presentation.test.mjs, tests/r215-presentation.test.mjs, tests/r215.test.mjs]

decisions:
  - "D-15 replaced by the in-dialog count-up: the original adds the ACE TIME bonus during the STATS dialog (100 updates after the opening, +100 every 10 updates, endoflevelpop1), so the « Niveau terminé ! / Bonus de temps +N » message of 05-04 is removed, the STATS open at `won` (the engine already waited 50 updates) and the BONUS line counts up from +0 while POINTS and the HUD score follow; OK credits the remainder at once"
  - "capHeight is the ink height of the glyph 'A' (11 px for Cancun12), not the atlas rect height (21 px): the rect is the cell, and 1.65 × 21 would push the rows under the tip box; fallbacks rect height then ascent, and composeStatsDialog bounds the line height to 16..20 px (fallback 19) — the real dialog uses 18 px lines"
  - "The pit cover keeps following fx.threat, now computed over 600 px like the beat (one source of truth): the lid opens earlier than before (220 px)"
  - "The rolling loop is driven by the measured displacement of the fastest ball (> 2 px/s) rather than Chain.speed, so recoil, rollback and the fast feed are heard the same way; it stops during the tally (state clearing)"
  - "The count-up pitch follows hypothesis A5 (bonusPopRate 1 → 1.5 with the shown share); the original passes shown / 1000 to the sample, whose meaning was not readable in the spike"

metrics:
  duration: "~11 min (17:04 → 17:15 UTC)"
  completed: 2026-10-10
  tasks: 4
  commits: 8
  tests: "142/142 (was 126/126; r216-presentation +16)"
---

# Phase 5 Plan 06: Original presentation of the alert, rolling, ZUMA, tally and STATS — Summary

The rules landed in 05-05 are now audible and visible the original way: `warning1` beats from 600 px with the decompiled interval (4.1 s down to 0.6 s) at a constant volume, the rolling loop plays at a constant 0.6 whenever the chain moves and fades out in 150 ms, « ZUMA ! » shows for 120 ticks over a pulsing gauge, each tally step drops a yellow « +100 » with five sparkles while `endoflevelpop1` plays every 6 ticks at 0.5, the STATS dialog opens at `won` with the original colours, a gold-multiplied title and rows spaced from the capital height, and the ACE TIME bonus is counted into the score inside the dialog (+100 every 100 ms from 1 s, rising pop, remainder on OK). TEMPS reads the level clock started at « PARTEZ ». 142 tests green, headless smoke on level 1-1 clean.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Warning at 600 px with the original interval, constant-gain rolling (U15, U18, §5, D-17) | `09910e0` (RED), `672d65a` (GREEN) | src/audio.ts, src/main.ts, tests/r216-presentation.test.mjs, tests/r214-presentation.test.mjs |
| 2 | ZUMA banner, tally presentation, STATS at `won`, level clock (U16, U20, D-16, D-13) | `5658adc` (RED), `77bb68d` (GREEN) | src/feedback.ts, src/render.ts, src/main.ts, tests/r215.test.mjs |
| 3 | STATS colours, gold title, 1.65 × capital line height, count-up helpers (D-18, §8) | `3f06716` (RED), `d54681d` (GREEN) | src/statsdialog.ts, src/bitmapfont.ts, tests/r215-presentation.test.mjs |
| 4 | Bonus count-up in the STATS dialog, end-to-end values, green suite (U17, U19) | `886524a` (RED), `02d628a` (GREEN) | src/main.ts, tests/r216-presentation.test.mjs |

## What was built

- **Alert (`audio.ts`)** — `WARNING_DISTANCE = 600` (the `danger` setting, 0x41a9ac). `warningIntervalAt(rem)` clamps `rem` to 0..600 (non-finite → 0) and returns `max(0.1 + 4·rem/600, (rem/11 + 60)/100)`: 4.1 s on entering the zone, 2.1 s at 300 px, ≈ 0.77 s at 100 px, 0.6 s at the skull (the trail-light term wins under ≈ 73 px). `warningInterval(level)` maps the threat level back to a distance; `warningGain()` returns `WARNING_GAIN = 1`; the four FAR / NEAR constants are gone. `beat()` is unchanged and re-reads both at every beat.
- **Rolling (`audio.ts`, `main.ts`)** — `loopLevels({ speed, playing })` is binary above `ROLLING_MIN_SPEED` (2 px/s). `setLoop` cancels the scheduled values, pins the current gain and ramps linearly to `level × ROLLING_GAIN` (0.6) in 50 ms or to 0 in `ROLLING_FADE_SECONDS` (0.15); the source keeps `playbackRate` 1; the 2 s idle stop is kept. `updateLoops` feeds the measured displacement only (`feedSpeed` removed from `main.js`).
- **ZUMA and tally (`feedback.ts`, `main.ts`, `render.ts`)** — `zuma` → `showMessage(strings.ZUMA ?? 'ZUMA !', null, 120)`; the full gauge pulses with amplitude 0.45 in both HUD branches. `cleanup` → yellow `#ffff00` « +100 » (CancunFloat14 gold with the pack) and `makeSparks(x, y, step, tick)` pushed into `fx.bursts` (5 particles, ± 10 px, size 1 or 2, colour 5, seeded from `(step + 1) × 0x9e3779b1 ^ tick × 0x85ebca6b`). `soundCues`: `cleanup` → `[]`, `cleanup-pop` → `bonuspop` gain 0.5 rate 1. No `won` message; `checkOutcome` opens the STATS at once on `won` (90 frames after a loss, unchanged). `openStats` reads `Math.floor(engine.levelTicks / engine.config.tickHz)`.
- **Fonts (`bitmapfont.ts`)** — `DrawOptions.multiply`: for a colour font, `sourceFor(layer, tint, multiply)` returns `multipliedAtlas(base, rgb)` composed with the layer's `LayerSetColorMult`, cached under `${image}|mult|${rgb}` (mask fonts: `|tint|`, unchanged behaviour). `capHeight`: ink rows of the `'A'` rect in the first layer that defines it (red channel for a mask picture, alpha for a composed one, threshold 32, via a scratch canvas in a try/catch), else the rect height, else `ascent`.
- **STATS (`statsdialog.ts`, `main.ts`)** — `STATS_COLORS` per 0x4525f0 and D-18; `STATS_LINE_RATIO = 1.65`; `statsRows(lh, first = 219)` (left rows `first + i·lh`; right: `time = first`, `objective = first + lh`, `rule = objective + round(0.63 lh)`, `bonus = objective + round(1.63 lh)`, `record = bonus + round(1.26 lh)` — the R2.0.12 proportions at 19 px); `STATS_LAYOUT.left/right.baselines` replaced by `first`. `composeStatsDialog`: title drawn with `multiply: C.title`, `lineHeight = clamp(round(1.65 × capHeight), 16, 20)` (19 when the font gives nothing), BONUS value without a leading « + » tinted `C.noBonus`. `bonusCountUp(total, ms)` = 0 before 1000 ms then `min(total, 100 × (⌊(ms − 1000)/100⌋ + 1))`; `bonusPopRate(shown, total) = 1 + 0.5 × clamp01(shown / total)`. `StatsInput.timeBonusShown` → BONUS « +shown ». In `main.ts`: `statsBonus = { total: timeBonus − timeBonusCredited, shown: 0 }` on a win, `statsInput` kept; `scheduleBonusCountUp` arms one timer per step at `1000 + 100 (k − 1)` ms (in `statsTimers`) whose callback credits `bonusCountUp(total, at) − shown` through `engine.creditBonus`, plays `bonuspop` at 0.5 / `bonusPopRate`, and refreshes POINTS / BONUS in the vector panel and the composed picture; `closeStats` credits `total − shown` once, then clears `statsBonus`. The HUD score climbs live behind the dialog.
- **Tests** — `tests/r216-presentation.test.mjs` (16): warning tables (level, interval at distance / level, monotone in the remaining distance, constant gain, removed exports), rolling table and `setLoop` / `main.js` locks, cues, `makeSparks` (bounds, determinism, no `Math.random`), `main.js` / `render.js` locks (banner, sparks, no won message, level clock, STATS at won, gauge pulse ×2), `STATS_COLORS`, `statsRows` tables and tip-box bound for `lh ≤ 20`, `bonusCountUp` / `bonusPopRate` tables, `statsValues` with `timeBonusShown`, `statsdialog.js` / `bitmapfont.js` locks, end-to-end literal values of the r215 cleared level (`points '3330'`, `time '1 s'`, `bonus '+24100'`, `record '1 s'`, 62 level ticks, 28 steps) then `creditBonus`, count-up locks in `main.js`. r214-presentation (3 tests rewritten), r215-presentation (colours, `statsRows(19)` instead of static baselines), r215 (cleanup cues) carry « R2.0.16 » comments; r215-font untouched and green.

## Verification

- `npm test` → 142/142 + `publication guard: 486 tracked files, none proprietary`; `npm run check` clean; every plan `<verify>` grep passes (`WARNING_DISTANCE = 600`, no `WARNING_GAIN_FAR`, `ROLLING_FADE_SECONDS`, no `feedSpeed` in main.js, `makeSparks(`, `'ZUMA !'`, no `Niveau terminé`, `levelTicks`, `0.55 + 0.45 * Math.sin` in render.js, `multiply: C.title`, `capHeight`, `bonusCountUp`, `creditBonus(`, `bonusPopRate(`, `timeBonusShown`); `node tools/build.mjs --local` passes.
- Headless smoke (Playwright 1.56 / Chromium from `/opt/pw-browsers`, `tools/serve.mjs` on port 8123, scratchpad script and screenshots only — nothing in the repo): level 1-1 boots (`go` at tick 89, 40 balls), the live STATS open from the HUD button with the composed picture (« PAS DE BONUS » tinted, gold title, 18 px rows), a forced cleared level shows the « ZUMA ! » banner, the « +100 » texts and sparkles along the spiral (34 steps, +10 000 at clearing), the STATS open at `won` with BONUS +0, the count-up reaches +1000 at ≈ 1.8 s and +3100 at ≈ 3.8 s (POINTS 16530, HUD score following), and `closeStats` credits the rest exactly once (`timeBonusCredited` 3300 → 23100 = `timeBonus`), then « claw » loads. No console error, no page error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `capHeight` from the glyph ink, not the atlas rect**
- **Found during:** Task 3 (measured on the pack: the `'A'` rect of Cancun12 is the 21 px cell, the letter occupies rows 5–15 = 11 px; `1.65 × 21 = 35` would send the sixth row to y ≈ 394, under the tip box).
- **Fix:** `BitmapFont.capHeight` measures the ink rows of `'A'` (mask: red channel; colour font: alpha) through a scratch canvas, falling back to the rect height then `ascent`; `composeStatsDialog` bounds the line height to 16..20 px with 19 as fallback (T-05-18). Result on the real dialog: 18 px rows (plan expected ≈ 19).
- **Files modified:** src/bitmapfont.ts, src/statsdialog.ts. **Commit:** `d54681d`.

**2. [Rule 1 - Test bug] Monotonicity direction in the `warningIntervalAt` table**
- **Found during:** Task 1 GREEN (the RED test iterated the remaining distance upwards while asserting a decrease; the interval shrinks with the *threat*, i.e. grows with the distance).
- **Fix:** the loop asserts non-decreasing in `rem` (0..600 by 10) and bounds [0.6, 4.1]; `warningInterval(level)` is still checked strictly decreasing in r214-presentation. **Commit:** `672d65a`.

### Plan adjustments (documented, no rule weakened)

- **Cache key of the multiplied atlas:** written literally as `${image}|mult|${rgb}` for colour fonts and `${image}|tint|${rgb}` for mask fonts (the plan's lock expects the literal `|mult|`); mask-font behaviour unchanged (r215-font green).
- **Extra exports** `STATS_LINE_FALLBACK` / `STATS_LINE_MIN` / `STATS_LINE_MAX` next to `STATS_LINE_RATIO` (bounds of deviation 1), and `StatsRows` type.
- **`closeStats`** marks `shown = total` before dropping `statsBonus` (idempotent if ever re-entered); `bonusStep` ignores a step once the dialog is closed or the total is reached.
- **End-to-end fixture:** the last destruction sits at s = 352 (not 336 as the plan's derivation assumed) — `steps = ⌈(2000 − 352)/60⌉ = 28`, same count; `levelTicks = 62` → « 1 s », bonus 24100 pinned.
- **Vector HUD pulse:** applied through `globalAlpha` on the filled gauge (the plan said « même amplitude sur la couleur de remplissage »).

## Hypotheses carried into the code (for 05-07 / UAT)

| # | Hypothesis | Where |
| --- | --- | --- |
| A5 | Count-up pop pitch 1 → 1.5 with the shown share (original: `shown / 1000` passed to the sample) | `bonusPopRate` JSDoc |
| new | STATS line height = 1.65 × capital ink height → 18 px with Cancun12 (reference picture: 19 / 18 alternating) | `composeStatsDialog`, `capHeight` |
| new | Pit cover opens over the 600 px of the alert (one `fx.threat`), instead of the former 220 px | `updateLoops` JSDoc |
| new | Rolling heard above 2 px/s of measured displacement (recoil / rollback included), silent during the tally | `loopLevels`, `updateLoops` |
| new | The count-up has no « fast mode » (the original's 2500-per-step mode, `plateau+0x186`, trigger unknown); OK settles the remainder | `closeStats` |

## Open points for 05-07

- Release notes R216 / README: D-15 → count-up (decision above), warning 600 px with the formula, rolling constant 0.6 / fade 150 ms, `cleanup-pop` at 0.5, STATS colours and gold title, `capHeight` measurement and the 18 px rows, TEMPS from « PARTEZ »; UAT verdicts U15–U20 to update with the smoke observations.
- A long ACE TIME bonus (≈ 24 000 on a fast 1-1) counts for ≈ 24 s; the original's fast mode is not reproduced — UAT may want OK or a click to accelerate instead of settling at once.
- The lid now opens from 600 px: check in UAT that the early opening is acceptable (the original's lid animation threshold was not read in the spike).
- The `levelwin` chant and the dialog `pop` sounds now overlap (STATS at `won`), as in the original's state 2 transition; to confirm by ear.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-05-15 (count-up bounded by `timeBonus − timeBonusCredited`, settled once, timers purged), T-05-16 (5 particles per step, bursts purged at 40 ticks), T-05-17 (interval within [0.6, 4.1] s, gain ≤ 0.6, single ramped node) and T-05-18 (line height bounded, rows under the tip box by test) implemented and locked in r216-presentation.

## Self-Check: PASSED

Files (10 modified / created) and the 8 commits above verified on disk / in `git log` on 2026-10-10.
