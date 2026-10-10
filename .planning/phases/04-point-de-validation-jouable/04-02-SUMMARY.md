---
phase: 04-point-de-validation-jouable
plan: 02
subsystem: engine
tags: [typescript, zuma-engine, insertion, mergeTicks, muzzleOffset, rollFrame, node-test, tdd]

# Dependency graph
requires:
  - phase: 03 (R2.0.13 baseline)
    provides: ZumaEngine (land/insert/moveChain/runAround), feedback.ts pure module, r206/r211/r213 suites
provides:
  - Ball.width (0..1) + Ball.enterFrom, EngineConfig.mergeTicks (12) + muzzleOffset (16)
  - Progressive insertion (insertGrowing) with width-weighted spacing (gap(a, b)) and deferred run check (settle)
  - rollFrame(s, frames, circumference) + BALL_CIRCUMFERENCE exported from feedback.ts
  - tests/r214.test.mjs (6 locks), r213 two tick budgets adjusted
  - Baseline R2.0.14 (ENGINE_VERSION, package.json, R214_RELEASE_NOTES.md, README)
affects: [04-03 (render interpolation enterFrom/width, rollFrame wiring in render.ts, muzzleOffset from frog sprite), phase-5 bonus coins, phase-7 audio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Width-weighted spacing: every neighbour constraint goes through gap(a, b) = ballSpacing * (a.width + b.width) / 2"
    - "Deferred rule evaluation: land() only inserts; settle() evaluates the run when width reaches 1 at the end of moveChain"
    - "Pure presentation helpers in feedback.ts locked by tests (rollFrame), render.ts consumes them"

key-files:
  created: [tests/r214.test.mjs, R214_RELEASE_NOTES.md]
  modified: [src/core.ts, src/feedback.ts, tests/r213.test.mjs, package.json, README.md]

key-decisions:
  - "A landing ball sits half a spacing from the hit ball (hit.s +/- ballSpacing/2) with width 0, so the geometry is symmetric ahead/behind and no neighbour moves on the landing tick"
  - "Growing balls are excluded from runs on both paths (runAround stops at width < 1; onJunction emits merge and returns) so a match is only ever evaluated once in settle()"
  - "settle() runs at the very end of moveChain and re-checks destroyingUntil/indexOf so a ball destroyed by a junction in the same tick is never evaluated twice"
  - "rollFrame returns 0 for frames <= 1 or a non-positive circumference instead of NaN (defensive, no behaviour change for the render formula)"

patterns-established:
  - "Rule change = r<version> test + release-notes line (CLAUDE.md), r213 touched only for tick budgets with an inline R2.0.14 comment"

requirements-completed: [GAME-02, GAME-05]

# Metrics
duration: 7min
completed: 2026-10-10
---

# Phase 4 Plan 02: Insertion animée, tir depuis la bouche, trame de roulement — Summary

**Progressive insertion in ZumaEngine (Ball.width grows over mergeTicks = 12, spacing weighted by width, run check deferred to settle()), configurable muzzleOffset for the projectile start, pure monotone rollFrame() in feedback.ts, all locked by tests/r214.test.mjs; baseline bumped to R2.0.14**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-10T09:36:05Z
- **Completed:** 2026-10-10T09:43:30Z
- **Tasks:** 3 (2 TDD, 1 docs/version)
- **Files modified:** 7

## Accomplishments
- UAT U3 engine side: a shot ball lands with `width = 0` half a spacing from the hit ball and opens its slot over 12 ticks (~0.2 s); the balls ahead slide progressively (`352 → 368 → 384` in the test) instead of jumping one slot. The `destroy` event now fires exactly `landing + mergeTicks`.
- `insert()` (test API) is untouched in behaviour: `width = 1`, immediate push — r206 and r211 pass unchanged; r213 only needed two tick budgets raised (20 → 24 and 20 → 30), assertions untouched.
- ROADMAP SC2 engine side: `EngineConfig.muzzleOffset` (default 16 = ballRadius, so the current start point is preserved) replaces the hard-coded `ballRadius` in `shoot()`; 04-03 can wire it to the measured mouth offset.
- UAT U6 / D-12: `rollFrame(s, frames, circumference = BALL_CIRCUMFERENCE)` is exported from `feedback.ts`, deterministic and monotone; the recoil test on the r213 "local recoil" fixture proves the frame decreases while the rear ball rolls back.
- Baseline R2.0.14: `ENGINE_VERSION === package.json.version`, `R214_RELEASE_NOTES.md` (Moteur, Présentation feedback, Tests; "Présentation, audio et outils" left to 04-03), README with the user-provided level graphics format (U7) verified against the real pack structure (`graphics.<id>.background/thumbnail/cutouts/layers/overlays/curveFiles/frog`, curve JSON `{version, controls, points[x, y, flags]}`).

## Task Commits

Each task was committed atomically (TDD tasks have a RED test commit then a GREEN feat commit):

1. **Task 1: Insertion progressive, détection différée et muzzleOffset** — `5835767` (test, RED) → `7e7110c` (feat, GREEN)
2. **Task 2: rollFrame pur + verrou du recul inverse** — `340615a` (test, RED) → `e1b63d0` (feat, GREEN)
3. **Task 3: Baseline R2.0.14 — version, notes, README** — `515150e` (chore)

**Plan metadata:** committed by the orchestrator (SUMMARY not committed by this executor, per instructions).

## Files Created/Modified
- `src/core.ts` — `Ball.width`/`enterFrom`, `EngineConfig.mergeTicks`/`muzzleOffset` (+ CANDIDATE 12/16), `insertGrowing()`, `gap(a, b)` used in `componentIds`/`resolveForward`/`resolveBackward`/attraction/`runAround`, per-tick growth in `moveChain()`, `settle()`, `onJunction` guard for growing balls, `shoot()` muzzleOffset, slimmed `land()`, `ENGINE_VERSION = '2.0.14'`, header comment.
- `src/feedback.ts` — `BALL_CIRCUMFERENCE`, `rollFrame()`.
- `tests/r214.test.mjs` — 6 locks: slot opening over mergeTicks, deferred run detection, instantaneous `insert()`, muzzleOffset, rollFrame monotonicity/wrap/coverage, forward roll vs reverse recoil.
- `tests/r213.test.mjs` — two `run(g, …)` budgets raised with the `// R2.0.14: landing + mergeTicks (12) before the run is evaluated` comment (diff = 2 insertions, 2 deletions).
- `package.json` — version/description 2.0.14.
- `R214_RELEASE_NOTES.md` — new.
- `README.md` — baseline R2.0.14, "tests de non-régression", three new locks, « Pixels nets » in the controls line, section « Fournir ses propres graphismes de niveau ».

## Decisions Made
- Landing position `hit.s ± ballSpacing / 2` for a zero-width ball: with `gap = 16` on both sides nothing moves on the landing tick and the geometry is identical ahead/behind (the plan only specified the ahead case explicitly; the behind case mirrors it).
- `settle()` guards against a ball already destroyed by an `onJunction` in the same tick (`destroyingUntil` + `indexOf` checks) and the settled list is processed after junctions, so hits/streak are counted once.
- `onJunction` deletes `comboDepth` before the growing-ball early return (same order as before) — a junction touching a growing ball still emits `merge` but never evaluates a run; the later `settle()` evaluates with depth 1.
- `rollFrame` guards `frames <= 1` and `circumference <= 0` (returns 0) rather than returning NaN.

## Deviations from Plan

None in the engine/feedback code — plan executed as written.

One test-side correction during Task 2 (RED → GREEN): my first assertion `rollFrame(20, 50, 200) === rollFrame(10, 50)` was wrong (200 px is not exactly 2 × BALL_CIRCUMFERENCE ≈ 100.53, so frames 5 vs 4 differ legitimately); corrected to `rollFrame(20, 50, 2 * c)` in the GREEN commit `e1b63d0`. The implementation was not changed to make the test pass.

## Issues Encountered
- Parallel executor (plan 04-01) commits interleave in `git log` (`3d0904d` between my Task 1 commits) and `npm test` now runs its `r214-import` tests too — all 39 tests and the guard pass; no build collision occurred.

## TDD Gate Compliance
- Task 1: `test(04-02)` `5835767` (RED verified: 4/4 failing) → `feat(04-02)` `7e7110c` (GREEN: 35/35 across r214/r213/r206/r211).
- Task 2: `test(04-02)` `340615a` (RED verified: import failure on missing export) → `feat(04-02)` `e1b63d0` (GREEN: 37/37).
- No refactor commits needed.

## Known Stubs
None — no placeholder values or unwired data.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04-03 can now: interpolate a growing ball between `ball.enterFrom` and its track position by `ball.width` (D-11); replace the inline roll formula in `render.ts` with `rollFrame(ball.s, sheet.frames)`; set `muzzleOffset` from the measured frog mouth (D-13); append its entries under "Présentation, audio et outils" in `R214_RELEASE_NOTES.md`.
- Verification: `npm test` → 39/39, publication guard clean, `tsc --noEmit` clean.

## Self-Check: PASSED
- Files: src/core.ts, src/feedback.ts, tests/r214.test.mjs, tests/r213.test.mjs, package.json, R214_RELEASE_NOTES.md, README.md — all present.
- Commits: 5835767, 7e7110c, 340615a, e1b63d0, 515150e — all in history.
- Stub scan (TODO/FIXME/placeholder): 0 hits in files touched.

---
*Phase: 04-point-de-validation-jouable*
*Completed: 2026-10-10*
