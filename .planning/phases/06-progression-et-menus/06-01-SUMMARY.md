---
phase: 06-progression-et-menus
plan: 01
subsystem: engine + tooling
tags: [pusher-stop-rear-ball, d-09, 0x423a10, difficulty-simulation, sim-difficulty, baseline-2.0.21]

# Dependency graph
requires:
  - doc: 06-CONTEXT.md
    provides: D-06 / D-07 revised by D-09 (original pusher rule, no other acceleration, colours unchanged)
  - doc: 06-RESEARCH.md
    provides: Q5c (0x423a10 → 0x423ac7–0x423ad6 is the end of destruction, not the insertion), research simulation s06sim/sim.mjs
provides:
  - "core.ts: no pusher stop on insertion; processRemovals() stops the pusher (stopTicks = max(stopTicks, 24), speed 0) when the rearmost ball (chain.balls[0], exploding balls included) is removed while playing; JSDoc of pusherStopTicks / Chain.stopTicks / module header corrected; ENGINE_VERSION 2.0.21"
  - "package.json 2.0.21, description « Zuma R2.0.21 — … »"
  - "tools/sim-difficulty.mjs: simulationLevels, simulateLevel ('original' / 'legacy-insert'), formatReport, CLI (--levels --seeds --horizon --shot --miss --compare --pack=<dir>|none)"
  - "tests r221 (10) and r221-sim (7); r216 insertion test flipped and r220-presentation baseline superseded, with « R2.0.21 » comments"
affects: [06-05 (R221 release notes, README / CONCERNS), every later rule change (measure with tools/sim-difficulty.mjs)]

tech-stack:
  added: []
  patterns:
    - "Rule comparison outside the engine: the old rule is emulated after each step from the drained events, so the engine keeps a single rule"
    - "Stop attribution from the counter: after a step, stopTicks === pusherStopTicks can only come from the engine's own pusher stop (updatePusher decrements first, a contact arms ≥ 12)"
    - "Cross-check of an emulation against the previous engine compiled from git archive in the scratchpad"

key-files:
  created: [tests/r221.test.mjs, tests/r221-sim.test.mjs, tools/sim-difficulty.mjs]
  modified: [src/core.ts, package.json, tests/r216.test.mjs, tests/r220-presentation.test.mjs]

decisions:
  - "D-09 applied as written: stop only when the rear ball leaves the chain at the end of its destruction, only in 'playing'; bombs included; value 24 ticks unchanged; no other difficulty change, colours unchanged"
  - "The rear ball is chain.balls[0] at removal time, which may be a queued ball (s < 0) behind the entrance: then nothing stops, as in the original list"
  - "Simulation bot swaps and shoots in the same tick (commands run in order) instead of the research's extra unmeasured step, so no insert event is dropped from the legacy emulation"
  - "simulationLevels: a « P<n> » label is always procedural, « S-L » always a pack level, so --levels=P1 works with or without the pack; CLI default with the pack = first level of every stage"
  - "CLI --pack=none forces the procedural levels (used by the test)"

metrics:
  duration: "~15 min (15:56 → 16:11 UTC)"
  completed: 2026-10-11
  tasks: 3
  commits: 4
  tests: "390/390 + publication guard (was 373; r221 +10, r221-sim +7; the flipped r216 / r220-presentation tests keep their count)"
---

# Phase 6 Plan 01: Original pusher stop (D-09) and difficulty simulation — Summary

The pusher now follows the original rule. An insertion never stops it. It stops for 40 maj (24 ticks) only when the rearmost ball of a chain — the one the pusher pushes — leaves the chain at the end of its destruction, then restarts from 0 at 50 px/s². The research had found that 0x423ac7–0x423ad6 belongs to the end of destruction 0x423a10, not to the insertion (06-RESEARCH Q5c). The game no longer brakes on almost every shot.

Difficulty is now measurable in the repository: `node tools/sim-difficulty.mjs` replays a fixed bot, level by level, with no browser. A deterministic test locks it on the procedural levels. On the private pack, the chain is stopped 3.5–12.7 % of the time with the original rule, against 24–37 % with the R2.0.20 rule. Its average speed is 1.2 to 2.1 times higher.

Baseline 2.0.21, 390 tests green. The standalone is 7 822 709 bytes.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Engine: pusher stop at the removal of the rear ball, never at an insertion (D-09), baseline 2.0.21 | `be4871b` (RED), `e5fe60a` (GREEN) | src/core.ts, package.json, tests/r221.test.mjs, tests/r216.test.mjs, tests/r220-presentation.test.mjs |
| 2 | `tools/sim-difficulty.mjs` (headless deterministic simulation) and its test on the procedural levels | `c11413a` (RED), `0ed27f5` (GREEN) | tools/sim-difficulty.mjs, tests/r221-sim.test.mjs |
| 3 | Measurement on the private pack, check against the research numbers, full verification | — (nothing to fix) | — |

## What was built

### Engine (D-09)

- **`land()`.** The arming block is gone. In its place a single line: « No pusher stop on insertion: 0x423ac7–0x423ad6 belongs to the end of destruction (0x423a10), see processRemovals ». The `insert` event and the gap bonus are unchanged. `componentIds` stays (attraction / contacts use it).
- **`processRemovals()`.** Before filtering a chain, if `state === 'playing'` and `list[0]` (the rearmost ball, exploding balls included) is among the removed balls:
  - `chain.stopTicks = max(stopTicks, pusherStopTicks)`;
  - `chain.speed = 0`.

  `updatePusher` is unchanged: it holds speed 0 for 24 ticks, then ramps at `chainAccel` from 0 (0x423ca4–0x423caa). The comment cites 0x423a10, 0x423abc–0x423ac7 and 0x423ac9–0x423ad6.
- **JSDoc.** Updated in four places:
  - `pusherStopTicks`: « rearmost ball … removed at the end of its destruction … 40 maj × 0.6 = 24. Never armed by an insertion. »
  - `Chain.stopTicks`: rear removal ≥ 40 maj, or recoil contact ≥ 20 maj.
  - The module header has a new R2.0.21 paragraph.
  - The `processRemovals` JSDoc.
- **Version.** `ENGINE_VERSION = '2.0.21'`; `package.json` version 2.0.21, description « Zuma R2.0.21 — … ». `package-lock.json` still says 2.0.7, as it did before; it never tracked the version.

### Tests

- **r221** (10 tests):
  - Source lock: `land(` in `.compiled/core.js` no longer mentions `stopTicks`, and `processRemovals(` does mention `pusherStopTicks`.
  - Insertion into the rear segment: `stopTicks` 0 and `speed` 50 on the insert tick and for 24 ticks; the head advances like the witness up to the opening slot. No stop later either.
  - Rear removal:
    - no stop while the ball is exploding (stopTicks 0, speed 50 for the 23 ticks);
    - 24 / speed 0 on the removal tick (destroyTicks after the match), then 24 ticks at 0;
    - first tick after the stop at 50/60 px/s, 25 px/s after 30 ticks, 50 ± 1 after 60.
  - A block removed in the middle stops nothing.
  - A bomb blast that takes the rear ball stops the pusher at the removal.
  - No stop in `draining` or `clearing`: the state is forced while the ball explodes, because clearing cannot overlap a pending removal naturally.
  - Two chains: only the stopped chain's pusher.
  - Baseline 2.0.21.
- **r216.** « pusher stop: an insertion into the rear segment halts the pusher 24 ticks … » became « R2.0.21 (D-09): an insertion no longer stops the pusher » (comment citing 0x423a10):
  - assertions 24 / 0 → 0 / 50;
  - head lag against the witness < 20 px;
  - still 50 px/s 60 ticks later;
  - the « front segment » and `insert()` hook assertions are kept as they were.
- **r220-presentation.** The « baseline 2.0.20 » test became « superseded »: `ENGINE_VERSION > '2.0.20'`, equal to `package.json`, and the description follows the version.
- **No other test** assumed the insertion stop: r217 and r219 stayed green without any change.

### `tools/sim-difficulty.mjs`

- The research script ported to a module with no dependency.
- It loads `.compiled/core.js`, `main.js` (`configFromSettings`) and `levels.js` through `import()` in `loadEngine()`. Without `.compiled/` the CLI prints « lancez d'abord node tools/build.mjs » and exits 1.
- **Levels.**
  - Pack: read only from `private_assets/pack/pack.json` and the curve files, `configFromSettings(settings, stage, curves)` + `lives: 3`, labels « S-L ».
  - Procedural: `LEVELS` with the `resolveLevel` fields, labels « P<n> ».
  - A missing pack falls back to the procedural levels, never an exception.
- **Bot.** Same as the research: most advanced ball of its colour, pairs first, free line of fire, swap when the next ball makes a pair, one shot every `shotTicks`, `missRate` shots on another colour. It has its own LCG; the engine gets the same seed. Measures run until ZUMA or the first life lost.
- **Measures.**
  - `stoppedRatio`: chain-ticks with `stopTicks > 0` — rear removals, recoil contacts and, in the legacy variant, insertions.
  - `speedRatio`: mean `speed` / nominal `speed`, so the slow zone lowers it too.
  - `rearStops` / `insertStops`: attributed from `stopTicks === 24` right after the step.
  - `outcome` ∈ zuma / won / lost / running.
- **`legacy-insert`.** After each step, every drained `insert` in component 0 of its chain (`engine.componentIds`, private in TS) arms 24 ticks and speed 0. It runs the same tick as the old rule in `land()`; only `processRemovals` / `checkEnd` run in between.
- **CLI.** `--levels`, `--seeds`, `--horizon`, `--shot`, `--miss`, `--compare`, `--pack=<dir>|none`. Seeds are `k × 7919`. An unknown argument or level exits 1 with the name in the message. No file is written; there is no npm script.

## Difficulty measurement (private pack)

Settings: 6 seeds, horizon 240 s, one shot every 40 ticks, 40 % misses. « Arrêt » is the stopped-time ratio of the pusher, « vitesse » the mean speed over nominal, « arrêts » the stops per game. Old = the R2.0.20 rule emulated (`legacy-insert`); new = the R2.0.21 engine (`original`). Percentages and counters only; the log is `scratchpad/shots-r221/sim-difficulty.log`.

| Level | Arrêt old → new | Vitesse old → new | Insertion stops old → new | Rear stops (new) | ZUMA / lost (old → new) |
| --- | --- | --- | --- | --- | --- |
| 1-1 | 36.6 % → 12.7 % | 35.4 % → 75.1 % | 19.5 → 0 | 0.0 | 6/0 → 6/0 |
| 1-2 | 31.9 % → 12.4 % | 41.3 % → 72.8 % | 10.8 → 0 | 0.0 | 6/0 → 6/0 |
| 2-1 | 35.4 % → 9.0 % | 31.3 % → 53.9 % | 51.7 → 0 | 0.0 | 6/0 → 6/0 |
| 2-3 | 31.1 % → 11.1 % | 29.4 % → 47.6 % | 20.7 → 0 | 0.0 | 6/0 → 6/0 |
| 3-1 | 28.6 % → 10.7 % | 26.0 % → 36.1 % | 35.0 → 0 | 0.0 | 5/1 → 6/0 |
| 4-1 | 25.0 % → 9.3 % | 45.3 % → 61.8 % | 24.7 → 0 | 0.0 | 6/0 → 5/1 |
| 5-1 | 30.4 % → 10.3 % | 36.2 % → 55.6 % | 40.0 → 0 | 1.0 | 6/0 → 6/0 |
| 6-1 | 28.1 % → 10.2 % | 31.0 % → 50.0 % | 47.2 → 0 | 0.0 | 6/0 → 5/1 |
| 7-1 | 24.3 % → 5.9 % | 31.9 % → 50.2 % | 18.3 → 0 | 0.0 | 6/0 → 6/0 |
| 8-1 | 24.9 % → 8.3 % | 28.6 % → 38.0 % | 31.3 → 0 | 0.5 | 6/0 → 6/0 |
| 9-1 | 25.1 % → 3.5 % | 24.0 % → 29.6 % | 43.8 → 0 | 0.2 | 6/0 → 0/6 |
| 9-3 | 25.9 % → 6.7 % | 22.1 % → 29.2 % | 40.0 → 0 | 0.0 | 6/0 → 4/2 |
| 10-1 | 26.8 % → 7.2 % | 30.9 % → 41.0 % | 55.2 → 0 | 0.0 | 6/0 → 5/1 |
| 11-1 | 25.2 % → 6.2 % | 21.2 % → 27.7 % | 44.7 → 0 | 0.5 | 5/1 → 5/1 |
| 12-1 | 28.8 % → 4.3 % | 17.9 % → 32.0 % | 32.8 → 0 | 0.0 | 4/2 → 0/6 |
| 13-1 | 30.6 % → 5.7 % | 29.6 % → 59.0 % | 121.2 → 0 | 0.0 | 1/4 (1 running) → 1/5 |

- **Direction.** It holds on every level: the new rule is less stopped and faster, with no insertion stop. The rear-ball stop is rare (0 to 1 per game), as the research found.
- **Emulation fidelity.** The R2.0.20 engine, compiled from `be4871b` with `git archive` in the scratchpad, gives the same figures as `legacy-insert` with no emulation at all (`sim-r220-engine.log`): for example 1-1 36.4 % / 35.4 %, 13-1 30.6 % / 29.6 %, insertion stops 19.5 / 121.2. The only differences are 1-1 and 5-1, by the rare rear stop.
- **Against the research.** The research reported 3–9 % stopped and +15 to +45 % speed. We measure 3.5–12.7 % stopped and +23 to +112 % speed. Rerunning `s06sim/sim.mjs` unchanged on the R2.0.20 build shows why (`research-sim-rerun.log`). Its « original » variant only set `pusherStopTicks = 0`, but the R2.0.20 `land()` still wrote `speed = 0` at every rear insertion. Its chains therefore restarted from 0 after each shot: 1-1 speed 48 % instead of 75 %. At 40 % misses its stopped ratio (1-1 11.9 %, 2-3 12.4 %, 5-1 7.4 %, 13-1 5.7 %) matches ours. The remaining stopped time of the new rule comes mostly from recoil contacts (≥ 12 ticks each), which are original.
- **Early levels.** 1-1 to 6-1 sit at 9–13 % stopped, a little above the « ≈ 3–10 % » of the plan, for the reasons above. This is the same order of magnitude and the same direction, so it is not a regression.

## Verification

- `npm test` → **390/390** + `publication guard: 557 tracked files, none proprietary`; `npm run check` clean.
- `node --test tests/r221.test.mjs tests/r216.test.mjs` 38/38; `tests/r215-presentation.test.mjs tests/r221.test.mjs tests/r221-sim.test.mjs` 32/32; the r221-sim suite runs in about 1.2 s.
- Builds:
  - `node tools/build.mjs --local` → `build 2.0.21+…`;
  - `--standalone` → `standalone/zuma-standalone.html` 7 822 709 bytes, containing « R2.0.21 ».
- Compiled source lock: the body of `land(` has no `pusherStopTicks`.
- The CLI exits 1 without `.compiled/`, checked on a copy of the tool in the scratchpad.
- Nothing from `dist/`, `standalone/` or `private_assets/` is tracked. The simulation logs stay in the scratchpad. No model identifier is in any committed file.

## Deviations from Plan

### Auto-fixed Issues

None — no regression was found; Task 3 needed no fix commit.

### Plan adjustments (documented, no rule weakened)

- **Swap and shot in the same tick** in the bot, instead of the research's extra `step()`. Otherwise an `insert` event of that tick would be lost to the legacy emulation and the tick would go unmeasured.
- **`--pack=<dir>|none`** added to the CLI. Labels « P<n> » always resolve to procedural levels, so the plan's `--levels=P1` verify works with the pack present.
- **Without `--levels`**, the CLI takes the first level of every stage when the pack is there, and all procedural levels otherwise.
- **Pack runs use `--compare`** for both runs, to give the before / after the caller asked for. The plan had `--compare` on the first run only.
- **The r221 « outside play » case forces `state`** to `draining` / `clearing` during the destruction. `startClearing` requires every removal to be done, and a loss during a destruction cannot be reached naturally because nothing moves while a ball explodes.
- **`package-lock.json`** was not bumped. It already said 2.0.7, and the baseline lock (r213) reads `package.json` only.

## Hypotheses carried into the code (for 06-05 / UAT)

| # | Hypothesis / choice | Where |
| --- | --- | --- |
| D-09 | The rear ball is the first node of the chain list including queued balls behind the entrance (s < 0) — a removal while the queue is still feeding stops nothing | `processRemovals` |
| A7 | The bot measures relative effects only; absolute stopped / speed figures depend on its miss rate and cadence | `tools/sim-difficulty.mjs` header |
| Q5b | `colors` fallback 4 / 5 / 6 unchanged (open question 1 of the research) | `configFromSettings` |

## Open points

- **06-05.** R221 release notes:
  - the rule (0x423a10, 0x423abc–0x423ad6, 0x423ca4), the table above, the r221 / r221-sim tests;
  - `tools/sim-difficulty.mjs` in the README tools list;
  - CONCERNS: the bot hypothesis A7 and the queued-rear-ball reading.
- **UAT.** Ask the user whether the game now feels like the original. The late levels (9-1, 12-1) became much harder for the bot: 0/6 and 0/6 ZUMA where the old rule gave 6/6 and 4/6.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register:
- **T-06-01:** the pack is read only, the tool writes no file, and the report holds percentages and counters; logs are in the scratchpad.
- **T-06-02:** the stop is bounded by `max(…, 24)` and armed only while `playing`; locked by r221.
- **T-06-03:** both flipped tests carry « R2.0.21 ».

## Self-Check: PASSED

Verified on disk and in `git log` on 2026-10-11:
- Files: 3 created and 4 modified.
- Commits: `be4871b`, `e5fe60a`, `c11413a`, `0ed27f5`.
- Tests: 390/390 + guard.
- Logs: `sim-difficulty.log`, `sim-r220-engine.log` and `research-sim-rerun.log` under `scratchpad/shots-r221/`.
- STATE.md / ROADMAP.md untouched.
