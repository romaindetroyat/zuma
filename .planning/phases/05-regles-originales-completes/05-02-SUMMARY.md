---
phase: 05-regles-originales-completes
plan: 02
subsystem: engine-rules
tags: [coins, treasure-points, clearing, end-of-level-tally, ace-time-bonus, go, zumaslow, zumaback, feedback-cues, tdd]

# Dependency graph
requires:
  - plan: 04-06
    provides: addScore() / levelScore / target — every coin and tally gain goes through the gauge
  - plan: 04-02
    provides: Ball.width + settle() — tick budgets of the destruction fixtures (landing + 12 + 40)
provides:
  - "core.ts : TreasurePoint / Coin / Cleanup, EngineState 'clearing', EngineConfig coinPoints/coinVisibleTicks/coinMinGapTicks/coinMaxGapTicks/coinRadius/cleanupPoints/cleanupStepTicks/parTime/zumaBackTicks/zumaSlowTicks, Stats.coins"
  - "core.ts : ZumaEngine.setTreasure(), treasure, coin, cleanup, timeBonus, cleanupScore, spawnCoinForTest(); events coin-appear / coin / coin-vanish / clearing / cleanup / go / won {score, levelBonus, timeBonus, seconds}"
  - "core.ts : aceTimeBonus(seconds, parTime) exported ; ENGINE_VERSION 2.0.15"
  - "feedback.ts : cues coin-appear→coinappear, coin→coin, coin-vanish→coinvanish, cleanup→bonuspop (rate 1 → 1.5) ; coinFrame(), sparkleFrame()"
  - "tests/r215.test.mjs : 17 locks ; R215_RELEASE_NOTES.md section Moteur / Présentation feedback / Tests"
affects: [05-03 (STATS : stats.coins, timeBonus, won.seconds), 05-04 (render coins/tally/« PARTEZ », configFromSettings partime/zumaslow/zumaback/treasure)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RNG draws gated by data presence: scheduleCoin() only runs when treasure.length > 0 so colour-determinism tests stay valid"
    - "Terminal sequence as an engine state ('clearing') with a bounded marker (steps = ceil((length − s) / spacing), s clamped) rather than a presentation timer"
    - "Pure frame helpers in feedback.ts (coinFrame, sparkleFrame) locked by tests, consumed later by render.ts"

key-files:
  created: [tests/r215.test.mjs, R215_RELEASE_NOTES.md]
  modified: [src/core.ts, src/feedback.ts, src/main.ts, tests/r213.test.mjs, package.json]

key-decisions:
  - "A coin grab never touches `streak` and never removes the projectile (D-09); it is checked after the off-screen test and before the ball hit search"
  - "`won` fires on the same tick as the last `cleanup` step (and on the first tick after `clearing` when steps === 0); the 60-tick pause before STATS belongs to the presentation"
  - "The tally origin is the centre ball of the last run (destroyRun) or the most advanced victim of the last bomb (blast); without any explosion it starts at the skull"
  - "zumaBackTicks / zumaSlowTicks are armed with max() at the zuma tick, both counted from that tick (hypothesis GAME-01, documented in JSDoc and notes)"
  - "main.ts checkOutcome treats 'clearing' like 'playing' (Rule 1) so the integrated app does not open STATS as a loss during the tally"

requirements-completed: [GAME-01, GAME-03, GAME-04]

# Metrics
duration: 7min
completed: 2026-10-10
tasks: 3
commits: 5
tests: "60 → 86 with plan 05-01 running in parallel (17 new r215 locks), guard clean, tsc --noEmit clean"
---

# Phase 5 Plan 02: Pièces, décompte de fin de niveau, bonus de temps, « PARTEZ », zumaslow/zumaback — Summary

**Coins on the pack's TreasurePoints (one at a time, 9–15 s apart, 6 s visible, clearance by `dist`, grabbed by a projectile for +100 without breaking the streak), a `clearing` engine state whose marker walks from the last explosion to the skull scoring +10 per ball slot every 4 ticks before the expert time bonus (`aceTimeBonus`) and the level bonus, a `go` event when the fast intro ends, and `zumaslow`/`zumaback` armed when ZUMA mode starts — all DOM-free, RNG-neutral without treasure, locked by 17 tests in `tests/r215.test.mjs`; baseline R2.0.15.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-10T11:14:47Z
- **Completed:** 2026-10-10T11:22:00Z
- **Tasks:** 3 (2 TDD, 1 version/docs)
- **Files modified:** 7

## Accomplishments

- **GAME-03 / D-07 / D-09 — coins.** `setTreasure()` sanitises the pack points (T-05-04: `curve` clamped to an existing chain, `dist` non-finite or negative → 0, non-numeric points dropped) and schedules the first coin; `tickCoin()` (after `moveProjectiles`, before `processRemovals`) handles timeout → `coin-vanish` → reschedule, and appearance on a random free point (`rng.int`) — a point is free when no alive ball of its chain within `[0, length]` lies closer than `dist`; with no candidate it retries next tick without a draw. A projectile within `coinRadius` grabs the coin: `stats.coins++`, `addScore(coinPoints)` (so the ZUMA gauge benefits), `coin {id, x, y, points}`, streak untouched, projectile kept. The coin is dropped on `lost` and on entering `clearing`.
- **GAME-04 / D-10 / D-04 — end of level.** `checkEnd` now calls `startClearing()` when the board is empty in ZUMA mode: state `clearing`, projectiles and recoils cleared, coin dropped, marker at `lastDestroy.s` (centre ball of the last run, most advanced victim of the last bomb, or the skull if nothing exploded), `steps = ceil((length − s) / spacing)` with `s` clamped (T-05-05). `tickCleanup()` advances one slot per `cleanupStepTicks`, emits `cleanup {x, y, points, step, steps, progress, chain}` and accumulates `cleanupScore`; after the last step it grants `aceTimeBonus(tick / tickHz, parTime)` then `levelBonus`, sets `won` and emits `won {score, levelBonus, timeBonus, seconds}`. All input guards (`shoot`, `swap`, `spawnBalls`, `moveChain`, `maybeSpawnPower`, `tickCoin`) already test `state !== 'playing'` and are now covered by a test during `clearing` (T-05-06: no `fire`/`swap`, no projectile, no new ball).
- **D-11 — `go`.** Emitted once in `spawnBalls` the tick `feeding` flips to false.
- **GAME-01 — `zumaslow` / `zumaback`.** `addScore` arms `backwardsTicks = max(…, zumaBackTicks)` and `slowTicks = max(…, zumaSlowTicks)` when ZUMA mode starts; defaults 0 keep r213/r214 byte-identical.
- **feedback.ts.** Three simple cues, `cleanup → bonuspop` with `rate = 1 + 0.5 × clamp01(progress)`, `coinFrame()` (30 frames, 3 ticks each) and `sparkleFrame()` (14 frames over 28 ticks once per 90 ticks, −1 otherwise), pure and RNG-free.
- **R2.0.15.** `ENGINE_VERSION`, `package.json`, header comment of `core.ts`, `R215_RELEASE_NOTES.md` with Moteur / Présentation (feedback) / Tests sections; the STATS / tools sections are left to 05-01, 05-03 and 05-04.

## Task Commits

1. **Task 1: Pièces aux TreasurePoints (D-07, D-09)** — `cfb2447` (test, RED 7/7 failing) → `4cd14bb` (feat, GREEN 51/51 on r215/r214/r213/r206/r211)
2. **Task 2: Fin de niveau `clearing` + bonus de temps, `go`, zumaslow/zumaback, cues** — `3badb78` (test, RED: r215 import failure on `aceTimeBonus`, r213 `clearing` assertion) → `a75b860` (feat, GREEN 73/73 incl. r214-presentation)
3. **Task 3: Version R2.0.15 et notes de version** — `8dc8755` (chore)

**Plan metadata:** SUMMARY left uncommitted per orchestrator instructions; STATE.md / ROADMAP.md untouched.

## Files Created/Modified

- `src/core.ts` — types `TreasurePoint`/`Coin`/`Cleanup`, `EngineState` + `'clearing'`, 10 new `EngineConfig` fields with `CANDIDATE` defaults, `Stats.coins`, `aceTimeBonus()`, engine fields `treasure`/`coin`/`cleanup`/`timeBonus`/`cleanupScore` (+ private `nextCoinTick`, `lastDestroy`), `setTreasure()`, `spawnCoinForTest()`, `scheduleCoin()`/`placeCoin()`/`dropCoin()`/`treasureFree()`/`tickCoin()`, coin grab in `moveProjectiles()`, `go` in `spawnBalls()`, zuma* arming in `addScore()`, `lastDestroy` in `destroyRun()`/`blast()`, `startClearing()`/`tickCleanup()`, `ENGINE_VERSION = '2.0.15'`, header comment.
- `src/feedback.ts` — `SIMPLE_CUES` coin entries, `clamp01`, `cleanup` branch, `coinFrame()`, `sparkleFrame()`.
- `src/main.ts` — one-line guard: `checkOutcome` returns while `engine.state === 'clearing'`.
- `tests/r215.test.mjs` — 17 locks (version, 7 coins, aceTimeBonus, 4 clearing, go, zuma*, feedback).
- `tests/r213.test.mjs` — ZUMA fixture budget `run(g, 60)` → `run(g, 30)` + `assert.equal(g.state, 'clearing')` + `run(g, 120)` with R2.0.15 comments; `won`/`score ≥ 500` assertions unchanged.
- `package.json` — version/description 2.0.15 (`package-lock.json` untouched as instructed).
- `R215_RELEASE_NOTES.md` — new.

## Verification

- `npm test`: 86/86 (build + node:test + guard « 472 tracked files, none proprietary »). The count includes plan 05-01's new suites (r215-font*/r215-import*) that landed in parallel; r206, r211, r214, r214-import and r214-presentation pass unmodified, r213 differs only by the documented budget.
- `npm run check` (`tsc --noEmit`): clean.
- `grep -c "2.0.15" package.json src/core.ts R215_RELEASE_NOTES.md` → 2 / 1 / 2.
- RNG neutrality: test « without treasure points nothing happens and the colour sequence is untouched » compares the streamed colours of two engines (with and without `setTreasure([])`) — identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `main.ts` would open STATS as « VIE PERDUE » during the tally**
- **Found during:** Task 2 (before implementing `clearing`)
- **Issue:** `Game.checkOutcome()` returned only for `playing`/`draining`; any other state opened the STATS panel after 90 frames with outcome `'lost'`. Adding the `clearing` state would have broken every level win in the integrated app until 05-04.
- **Fix:** `clearing` added to the early-return condition (one line). Full presentation of the tally/coins/« PARTEZ » remains 05-04's job.
- **Files modified:** `src/main.ts` (not in the plan's `files_modified`) — **Commit:** `a75b860`

**2. Test expectation corrected (not an engine change)**
- **Found during:** Task 1 GREEN
- **Issue:** my RED test assumed 30 balls would be streamed in 400 ticks at `speed: 60`; only 17 are (the fast intro stops after `start: 5`).
- **Fix:** assertion relaxed to `≥ 15` balls; the determinism comparison itself was unchanged and passed.
- **Commit:** `4cd14bb`

### Interpretation choices (within the plan's wording)
- `won` is emitted on the same tick as the final `cleanup` step (the plan: « une fois step ≥ steps (après le dernier cleanup ou immédiatement si steps === 0) »); the r215 test only requires `won.tick ≥ last cleanup tick`.
- `setTreasure()` also resets `coin` and `nextCoinTick` so calling it again for a new level never keeps a stale coin.

## Authentication Gates

None.

## TDD Gate Compliance

- Task 1: `test(05-02)` `cfb2447` (RED verified: 7/7 failing) → `feat(05-02)` `4cd14bb` (GREEN).
- Task 2: `test(05-02)` `3badb78` (RED verified: r215 import failure + r213 `clearing` assertion failing) → `feat(05-02)` `a75b860` (GREEN).
- No refactor commits needed.

## Known Stubs

None — no placeholder values or unwired data (stub scan of the touched files: 0 hits).

## Threat Flags

None beyond the plan's register: no network, file or schema surface added. T-05-04 (sanitised `setTreasure`), T-05-05 (bounded `steps`, clamped `s`) and T-05-06 (no `fire`/`swap` in `clearing`) are each covered by an r215 assertion.

## Next Phase Readiness

- 05-03 (STATS): `engine.stats.coins`, `engine.timeBonus`, `won.seconds` / `won.timeBonus` are available; `aceTimeBonus` is exported for the « BONUS / PAS DE BONUS » line.
- 05-04 (presentation): drain `coin-appear` / `coin` / `coin-vanish` / `clearing` / `cleanup` / `go`; `coinFrame(tick)` and `sparkleFrame(tick)` for `COIN.gif` / `sparkle.gif`; `configFromSettings` must map `partime` → `parTime`, `zumaslow × 0.6` → `zumaSlowTicks`, `zumaback × 0.6` → `zumaBackTicks`, and call `engine.setTreasure(graphics.treasure)`; `render.ts` still hides the frog's ball when `state !== 'playing'` (cosmetic during `clearing`).

## Self-Check: PASSED

- Files present: src/core.ts, src/feedback.ts, src/main.ts, tests/r215.test.mjs, tests/r213.test.mjs, package.json, R215_RELEASE_NOTES.md.
- Commits in history: cfb2447, 4cd14bb, 3badb78, a75b860, 8dc8755.
- No file deletions in the plan's commits.

---
*Phase: 05-regles-originales-completes*
*Completed: 2026-10-10*
