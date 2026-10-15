---
phase: 05-regles-originales-completes
plan: 05
subsystem: engine
tags: [pusher-kinematics, slow-zone, fast-feed, partez, level-clock, repeat-single, ammo-refresh, zuma-coverage, end-of-level-tally, ace-time, defaultParTime, creditBonus, configFromSettings, baseline-2.0.16]

# Dependency graph
requires:
  - plan: 05-04
    provides: configFromSettings (parTime, zuma* ×0.6), PackSettings.zumaslow / zumaback, r215-presentation locks
  - plan: 05-02
    provides: coins, clearing / cleanup / won events, aceTimeBonus, go event, zumaBackTicks / zumaSlowTicks
  - doc: 05-RESEARCH.md (spike D-12)
    provides: the rules transcribed here (§1 pusher, §2 feed, §3 colours, §4 slow zone, §6 ZUMA, §7 tally, §8 ACE TIME, §9 coin) and hypotheses A1–A3, A7
provides:
  - "core.ts : Chain.speed / stopTicks ; updatePusher + pusherTarget (lazy v0, 24-tick stop, ±50 / 1000 px/s² ramp, SLOW power-up, ZUMA ×0.25, endZoneFactor) ; endZoneFactor / feedSpeed / aceTimeBonus (0x401cb0) / defaultParTime exported ; checkGo (speed + goMargin or feedMaxTicks) ; goTick / clearTick / levelTicks ; spawnColor = 0x414b20 (repeatChance, singleLimit repair) ; refreshAmmo every tick (D-14) ; addScore → zuma { coverage, pushback } with zumaSlowLeft ; startClearing credits levelBonus × chains and aligns the 60 px marker ; tickCleanup 2.4 ticks / +100 / +12 / cleanup-pop every 6 / won +30 ; creditBonus / timeBonusCredited ; ENGINE_VERSION 2.0.16"
  - "EngineConfig : startFraction, feedMaxTicks, goMargin, chainAccel, chainDecel, pusherStopTicks, slowDistance, dangerDistance, endSlowFactor, zumaCoverage, zumaSlowFactor, singleLimit, cleanupStepPx / StartTicks / EndTicks / PopTicks, levelBonus 10000, coinPoints 500, zumaBackTicks 180, zumaSlowTicks 660 — start / feedSpeed / singleChance removed"
  - "main.ts : configFromSettings(settings, stage, curves) bounded (T-05-13) : startFraction, repeatChance (repeat + 1) / 100, singleLimit, endSlowFactor (slowfactor or speed / slowspeed), danger / slowdistance, zuma defaults 300 / 1100 maj, parTime or defaultParTime, coinPoints = max(500, 100 × ⌊score / 600⌋), levelBonus 10000 ; resolveLevel passes tracks.length and shows the default par time"
  - "levels.ts : LevelDef.startFraction (0.35 → 0.45) replaces the ball count"
  - "tests/r216.test.mjs (28 tests, 647 lines) : every rule above ; r213 / r214 / r215 / r215-presentation / r211 adjusted with « R2.0.16 » comments"
affects: [05-06 (consumes levelTicks, creditBonus, zuma { coverage, pushback }, clearing { levelBonus }, cleanup-pop, won { timeBonus }), 05-07 (README « Réglages originaux », R216 notes, CONCERNS hypotheses A1–A3 / A7 and the ones listed below)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every constant converted from the original carries its unit comment (maj × 0.6 = ticks, px/maj × 100 = px/s, px/maj² × 10 000 = px/s²) next to its CANDIDATE value and its JSDoc"
    - "Pure exported helpers (endZoneFactor, feedSpeed, aceTimeBonus, defaultParTime) locked by tables; engine behaviour locked by straight-track fixtures (640 px fixtures that measure travel pass endSlowFactor 1, 2000 px fixtures keep the zone)"
    - "Tally deadlines are fractional ticks computed from clearTick (no accumulation drift) and compared with a 1e-9 epsilon"
    - "Rules replaced by the spike are updated in the old lock file with a « R2.0.16: … » comment; nothing weakened, fixtures adapted (track length, present colours) when the new rule made the old fixture meaningless"

key-files:
  created: [tests/r216.test.mjs]
  modified: [src/core.ts, src/main.ts, src/levels.ts, package.json, tests/r211.test.mjs, tests/r213.test.mjs, tests/r214.test.mjs, tests/r215.test.mjs, tests/r215-presentation.test.mjs]

decisions:
  - "Pusher speed order per tick: lazy init (v0 or target, used as-is for the first move) → stop counter → ramp → move; the original moves then converges — same trajectory one tick apart, and `Chain.speed` reports the speed of the move just made"
  - "ZUMA coverage is measured on every ball of the chain, exploding ones included (the run that triggers the ZUMA is still on the track); the maximum over the chains drives the rollback / slowdown of all chains"
  - "The `clearing` event carries the aligned start of the marker (length − steps × 60), where the first « +100 » will appear, rather than the raw explosion point"
  - "`cleanup-pop` runs from clearTick + 12.6 every 6 ticks while the deadline is ≤ the nominal tick of the last step (plan wording); the original's exact end bound (délai after the loop vs last text) was not readable in the spike"
  - "aceTimeBonus computes ⌊250 × (par − t) / par⌋ instead of ⌊250 × (1 − t / par)⌋ so that exact fractions stay exact in IEEE doubles (20 / 25 gave 4999.99…)"
  - "The r216 colour helper streams at exactly 32 px/tick on a track long enough to keep every ball (the `single` rule reads the real rear groups); the r214 helper that empties the chain each tick keeps covering `repeat` only"
  - "openStats still reads engine.tick for TEMPS: 05-06 switches it to levelTicks (its plan already says so); the engine side (won.seconds, timeBonus) already uses the level clock"

metrics:
  duration: "~15 min (16:45 → 17:00 UTC)"
  completed: 2026-10-10
  tasks: 5
  commits: 10
  tests: "126/126 (was 100/100; r216 +28, r214 −2 singleChance locks)"
---

# Phase 5 Plan 05: Original execution rules in the engine (spike D-12) — Summary

The engine now plays the rules read in `Zuma.exe`: the pusher ramps at 50 / 1000 px/s², stops 24 ticks after every insertion into the segment it pushes, slows to a quarter over the last 1100 px of the track, and rolls back on a ZUMA only when the head is past half the track; the chain arrives at the speed computed from `start` % (1520 px/s on the spiral) and « PARTEZ » fires when it has settled, starting the level clock; colours follow `repeat` / `single` as the original generates them; ammo is replaced the tick a colour starts exploding; the end of level pays 10 000 per curve at clearing, then 60 px / 2.4 ticks / +100 up to the skull with a pop every 6 ticks, and the original ACE TIME bonus is computed for the STATS count-up; `configFromSettings` maps every setting with bounds. Baseline 2.0.16, 126 tests green.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Pusher kinematics, slow zone, conditional ZUMA (§1, §4, §6) | `8a1c6f9` (RED), `90b010a` (GREEN) | src/core.ts, tests/r216.test.mjs, tests/r211 / r213 / r215 |
| 2 | Computed fast feed, « PARTEZ », level clock (§2, D-13) | `444040b` (RED), `0eade8f` (GREEN) | src/core.ts, src/levels.ts, src/main.ts, tests/r215, r215-presentation |
| 3 | `repeat` / `single` colours, immediate ammo refresh (§3, D-14) | `5a27f92` (RED), `38387c5` (GREEN) | src/core.ts, src/main.ts, tests/r214, r213, r215-presentation |
| 4 | Tally, level bonus per curve, ACE TIME, defaultParTime, creditBonus, coin 500 (§7–§9, D-09) | `6075d3a` (RED), `12e5c9e` (GREEN) | src/core.ts, tests/r215 |
| 5 | Complete `configFromSettings`, baseline 2.0.16 | `f64d026` (RED), `777148a` (GREEN) | src/main.ts, src/core.ts, package.json, tests/r215, r215-presentation |

## What was built

- **Pusher (`core.ts`)** — `Chain.speed` (null until the first move) and `Chain.stopTicks`. `pusherTarget` = `speed` × `zumaSlowFactor` (while `zumaSlowLeft` > 0) ÷ `slowFactor` (SLOW power-up) × `endZoneFactor(head, length, 500, 600, endSlowFactor)`. `updatePusher`: lazy v0 (`feedSpeed(speed, startFraction × length)` when feeding, else the target), `stopTicks` holds the speed at 0, otherwise `max(target, v − 1000 dt)` / `min(target, v + 50 dt)`; always computed, even during a rollback or a recoil. `land()` arms `stopTicks = max(stopTicks, 24)` and zeroes the speed when the inserted ball belongs to component 0 (`componentIds`); `insert()` (test hook) arms nothing. `addScore` on entering ZUMA mode: `coverage = max over chains of head / length` (all balls), `pushback = coverage > 0.5` → `backwardsTicks` / `zumaSlowLeft` (max with running values), `slowTicks` untouched, event `zuma { coverage, pushback }`.
- **Fast feed and clock** — `feedSpeed()` (formula 0x4050e7, ≥ `speed`, bad distance → 0). `spawnBalls` no longer counts balls; `checkGo()` runs after the chains move: `feeding` ends when every chain has `speed ≤ speed + goMargin` or at `feedMaxTicks` (300), sets `goTick`, emits `go`. `clearTick` set at clearing; `levelTicks = (clearTick ?? tick) − goTick`; `won.seconds` from it. `LevelDef.startFraction` (0.35 … 0.45).
- **Colours and ammo** — `spawnColor` transcribes 0x414b20: first ball random; `rng.next() < repeatChance` → previous colour; else if `singleLimit < 10` and the rear group is a single ball: repaired when `singleLimit === 0` or `isolatedGroups(10) ≤ singleLimit`, else a different colour; else different. `colourRuns` follows the alive list (gaps ignored). `refreshAmmo()` every playing tick after `processRemovals` (exploding balls are already excluded from `presentColors`); draws only on a replacement.
- **End of level** — `startClearing`: `levelBonus × chains.length` credited through `addScore`, `steps = ⌈(length − sLast) / 60⌉`, marker start `length − 60 × steps`, deadlines `nextTick = clearTick + 12`, `popNext = clearTick + 12.6`, `lastStepTick = clearTick + 12 + 2.4 (steps − 1)`, `endTick` set now when `steps = 0`; event `clearing { x, y, chain, levelBonus }`. `tickCleanup`: step k at the first tick ≥ `clearTick + 12 + 2.4 (k − 1)` (deadlines recomputed from `clearTick`, no drift), `+100` via `addScore`, `cleanup { …, points, step, steps, progress }`; `cleanup-pop { index, progress }` every 6 ticks while `popNext ≤ lastStepTick`; `won` at last step + 30 with `timeBonus = aceTimeBonus(levelTicks / 60, parTime)` **not** added to the score; `creditBonus(points)` adds to `score` / `levelScore` / `timeBonusCredited`, ignores non-finite or ≤ 0 (T-05-15). `aceTimeBonus` (0x401cb0), `defaultParTime` (0x42ad12, A7). Cadence guarded (`stepPx ≥ 1`, `stepTicks` / `popTicks ≥ 0.5`, T-05-14).
- **`configFromSettings(settings, stage, curves)`** — see the table of the plan; every value through `num()` / `clamp()` / `ticks(v, fallback)` / `nonNeg()`; writes no `slowFactor`, `start`, `feedSpeed`, `singleChance`. `resolveLevel` passes `tracks.length` and reads `parTime` from the config (OBJECTIF shows the default par time on procedural / partime-less levels). Interim in `updateLoops`: `loopLevels` gets `engine.config.speed` instead of the removed `feedSpeed` (05-06 rewrites the rolling loop, D-17).
- **Tests** — `tests/r216.test.mjs` (28): constants with conversions, cruise / ramp / stop (with a witness engine) / non-rear insertion / hook, `endZoneFactor` table + engine, ZUMA 640 vs 2000 px, slowdown cumulated with SLOW, `feedSpeed` table, `go` (one chain, two chains, guard), level clock (none, playing, frozen), colours (repeat 0.51 share on 4000 balls, single 0 / 3 / 10, entrance threshold cases incl. physical gaps, determinism), ammo (destroy tick, flying projectile, every tick, empty chain), `aceTimeBonus` / `defaultParTime` tables, tally (positions, ticks +12 / +15 / +17 / +20 / +22 / +24, pops, won +30, bonus not credited, `creditBonus`), two curves, emptied board, `configFromSettings` ×3, baseline.

## Verification

- `npm test` → 126/126 + `publication guard: 484 tracked files, none proprietary`; `npm run check` clean; every plan `<verify>` grep passes (`endZoneFactor(` ×2 in core.js, `stopTicks`, `zumaSlowLeft`, `feedSpeed(`, `startFraction` in levels.js, no `feedSpeed:` there, `singleLimit` / no `singleChance` / no `forceDifferent`, `creditBonus(`, `'cleanup-pop'`, `defaultParTime` in core.js and main.js, version lock).
- Headless level 1-1 on the real spiral (private pack, scratchpad script, nothing in the repo): track 2773.9 px; config `speed 50, startFraction 0.35, repeatChance 0.51, singleLimit 10, endSlowFactor 4, parTime 25, coinPoints 500, zuma 180 / 660`; v0 = `feedSpeed` = **1520 px/s**; `go` at tick 89 (1.48 s) with the head at **42.1 %** of the track, 38 balls, speed 53.3 px/s; without any shot the slow zone starts at 11.6 s, the danger line at 30.1 s and the skull at **78.1 s** (48 s for the last 600 px — the §4 « ultime chance »).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `aceTimeBonus` floating-point: `1 − 20/25` × 250 = 49.999…**
- **Found during:** Task 4 (planning the table: `(20, 25)` would give 5000, not 5100).
- **Fix:** computed as `⌊250 × (par − t) / par⌋` — identical for every integer case, exact where the original's integer-ish inputs are exact. Locked by the table.
- **Commit:** `12e5c9e`.

**2. [Rule 3 - Blocking] Projectiles die at the canvas margin (x > 704)**
- **Found during:** Task 1 (the « non-rear segment » fixture put the front segment at s = 900 on a 2000 px track: the projectile never got there).
- **Fix:** test fixture only — the front segment sits at 600 / 632 px (inside the canvas). No engine change.

**3. [Rule 3 - Blocking] A straight-up « miss » shot crosses the track**
- **Found during:** Task 3 (the second colour-1 projectile meant to keep flying landed on the ball at s = 300).
- **Fix:** test fixture only — it is fired horizontally away from the track.

### Plan adjustments (documented, no rule weakened)

- **Task ordering / compile safety:** the plan removes `start` / `feedSpeed` / `singleChance` in Task 1 while their replacements come in Tasks 2 and 3; to keep every commit compiling and the suite as green as possible, each field was removed in the task that replaces it (Task 1 kept the constant `feedSpeed` as interim v0, Task 2 replaced it by the formula; `singleChance` / `forceDifferent` left in Task 3). The `'feedSpeed' in CANDIDATE === false` / `'start' in CANDIDATE === false` locks therefore live in the Task 2 section of r216. Likewise `won.seconds` from the level clock was done in Task 2 (one line) since its test belongs to D-13.
- **`endZoneFactor(10, 640, 500, 600, 4)`:** the plan's example (0.25, « length ≤ dangerDistance ») is inconsistent with its own formula (640 > 600 → danger line at 40 px, f = 0.94 → 0.295). The formula of the `<action>` (the original's) was kept; r216 locks `(10, 600, …) = 0.25`, `(40, 640, …) = 0.25` and `(10, 640, …) ≈ 0.295`.
- **ZUMA coverage of the r215 fixture:** the plan quotes 0.55 (352 / 640); at the `zuma` tick the run has opened its slot (head at 384 → 0.6). r216 asserts `coverage = headS / length` and 0.5 < coverage < 0.65.
- **r216 colour helper:** the plan's « copie de r214 sur 2000 px » cannot stream 4000 balls nor exercise `single` (that helper empties the chain each tick); r216 streams at 32 px/tick on a `32 n + 1000` px track instead (see decisions). The `singleLimit 3` statistical case is weak by construction (with `repeat 0` every isolated rear ball is repaired before a second single can exist), so the threshold is locked by deterministic entrance fixtures with six isolated groups (`single` 0 / 3 / 6 / 8 / 10).
- **Legacy fixtures adapted to replaced rules (all commented « R2.0.16 »):** r213 `swap` has both colours on the chain (D-14 would otherwise replace the swapped-in absent colour the same tick — the rule now under test); r213 / r215 `speed: 600` fixtures and r211 `make` pass `endSlowFactor: 1`; r215 `streamed` and `clearedLevel` move to 2000 px; r215 ZUMA lock reads `zumaSlowLeft` and the new defaults; r215 coin +500, tally cadence, emptied board +42; r214 `singleChance` tests removed; r215 baseline → `atLeast('2.0.15')`.
- **RNG sequences changed once** (Task 3): the `singleChance` draw is gone and `refreshAmmo` may draw at a different tick; property tests on seeds 1–3 (r214 « run of three among the first 30 balls ») still pass unchanged. To note in the R216 release notes (05-07).

## Hypotheses carried into the code (for 05-07 / UAT)

| # | Hypothesis | Where |
| --- | --- | --- |
| A1 | `repeat` 50 at 1-1 (last duplicated attribute) | `configFromSettings` JSDoc |
| A2 | `feedSpeed` called once at level start, natural deceleration after | `updatePusher` JSDoc |
| A3 | +10 000 per curve credited at clearing | `startClearing`, `CANDIDATE.levelBonus` |
| A7 | `defaultParTime` × 0.95 × curves factor | `defaultParTime` JSDoc |
| new | ZUMA rollback / slowdown of all chains from the maximum coverage (original: per curve) | `addScore` JSDoc |
| new | Pusher stop = insertion into component 0 of `componentIds` (original: « rear segment », condition read as MOYENNE) | `land()` comment |
| new | `cleanup-pop` end bound = nominal tick of the last step | `tickCleanup` |
| new | `clearing { x, y }` = aligned marker start | `startClearing` |

## Open points for 05-06

- `openStats` still uses `engine.tick / tickHz` for TEMPS; switch to `Math.floor(engine.levelTicks / tickHz)` (already in the 05-06 plan). `engine.timeBonus` is no longer in `engine.score` at `won`: the STATS count-up must call `engine.creditBonus()` (bounded by `timeBonus − timeBonusCredited`).
- `loopLevels` is fed `engine.config.speed` as `feedSpeed` meanwhile (rolling gain = 1 at cruise); D-17 rewrite pending. `Chain.speed` (px/s) is now available for a speed-driven presentation if wanted.
- `soundCues({ kind: 'cleanup' })` still returns `bonuspop` with a rising rate (r215 lines ~311-314 left green as instructed); 05-06 moves the pop to `cleanup-pop` at gain 0.5.
- `main.ts` `won` handler still shows « Bonus de temps +N » (D-15 replaced in 05-06); the `zuma` event now carries `{ coverage, pushback }` for the banner.
- The HUD `GET_READY` message is replaced by the `go` event, which now arrives on the speed condition (1.5 s on the spiral) instead of a ball count.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-05-13 (bounds) and T-05-15 (`creditBonus`) implemented and locked in r216; T-05-14 (`steps` bounded, `stepTicks` / `popTicks` ≥ 0.5, `feedSpeed` bounded, `feedMaxTicks`) implemented and locked (`chainDecel: 1` guard test, bad-distance table).

## Self-Check: PASSED

Files (10 modified / created) and the 10 commits above verified on disk / in `git log` on 2026-10-10.
