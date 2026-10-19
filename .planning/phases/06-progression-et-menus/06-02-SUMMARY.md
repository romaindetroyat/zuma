---
phase: 06-progression-et-menus
plan: 02
subsystem: presentation rules (pure) + build
tags: [adventure-progression, temples, doors, high-scores, profile, saved-run, app-state-machine, platform-name, d-12]

# Dependency graph
requires:
  - doc: 06-CONTEXT.md
    provides: D-01..D-04, D-10, D-11, D-12 (player first name from the host identity, added during execution)
  - doc: 06-RESEARCH.md
    provides: Q2 (adventure screen, doors, door messages, when it appears), Q3 (final stage, ending), Q4 (10 entries per key, profile name, submissions)
provides:
  - "src/progress.ts: afterWin, templeAfter, DOOR_COUNT, doorTemple, doorLetter, DOOR_MESSAGES, GOD_LINES, TEMPLE_NAMES"
  - "src/progress.ts: HighScore, HIGHSCORE_KEY, HIGHSCORE_MAX, defaultScores, insertScore, parseScores, Profile (+ optional source), PROFILE_KEY, sanitizeName, parseProfile, SAVE_KEY, parseSave, StorageLike, readJson, writeJson"
  - "src/progress.ts: AppScreen, AppState, AppEvent (+ 'profile-detected'), AppEffect, initialApp (+ platformName), reduceApp"
  - "tools/build.mjs MODULES with 'progress' before 'main'; public/sw.js shell template lists ./js/progress.js"
  - "tests r221-progress (33); r215-presentation / r218-presentation MODULES locks updated with « R2.0.21 » comments"
affects: [06-03 (welcome screen, name dialog, continue dialog, identity call), 06-04 (adventure screen, god dialogue, ending), 06-05 (release notes), private hosting (api/me)]

tech-stack:
  added: []
  patterns:
    - "Reducer returning effects: the presentation performs start-level / save-* / sound, so every transition is testable under Node"
    - "Injected storage (StorageLike) with every access under try/catch; no storage or DOM global in the module"
    - "Review sessions filter write effects in one place (reduceApp), not in each transition"

key-files:
  created: [src/progress.ts, tests/r221-progress.test.mjs]
  modified: [tools/build.mjs, public/sw.js, tests/r215-presentation.test.mjs, tests/r218-presentation.test.mjs]

decisions:
  - "Planner choices applied: demo entries Zuma 10 000 / Grenouille 5 000 / Têtard 1 000; default name « Joueur »; entry { name, score, stage, level, date }; a new entry goes after equal scores; the save is the run at the start of the current level"
  - "Position bounding: non-finite → 0, finite out of range → clamped (afterWin, doors); parseSave is strict (integers, inside sizes, lives 1..99) and returns null otherwise"
  - "A stage index ≥ 12 or the last stage is final (temple 5); after temple 4 the adventure screen selects stage 12 (13-1), which has no door"
  - "Without stages (procedural): no save-run at all (parseSave is null without sizes), game overs still submit to the table, leave → welcome"
  - "D-12 (coordinator, user request): Profile.source optional — absent = typed on this device (never replaced), 'platform' = host identity, 'default' = « Joueur » fallback; initialApp({ platformName }) and event 'profile-detected' apply the same rule"
  - "save-profile only when maxStage actually rises (replaying an earlier stage writes nothing)"
  - "Temple name fallbacks: TEMPLE DE ZUKULKAN, TEMPLE DE QUETZAL QUATL, TEMPLE DE POPO POYOLLI, TEMPLE SECRET DE ZUMA (the two middle ones are hypotheses, absent from the French pack)"

metrics:
  duration: "~25 min (16:05 → 16:30 UTC)"
  completed: 2026-10-11
  tasks: 3
  commits: 6
  tests: "423/423 + publication guard (was 390 after 06-01; r221-progress +33)"
---

# Phase 6 Plan 02: Pure progression, high scores, profile, save and app state machine — Summary

The core of phase 6 now exists as rules, without any rendering. `src/progress.ts` is a pure module with no DOM, no storage global and no engine, tested under Node. It holds:
- the adventure progression by stages and temples;
- the doors, their messages and the god dialogues;
- the 10-entry high-score table;
- the profile and the saved run;
- the application state machine: welcome → adventure → level → god → ending → welcome.

Each transition returns the effects for the presentation to perform. 06-03 and 06-04 can wire `main.ts` without inventing any rule.

During execution the coordinator relayed a user request (D-12). On the hosted version the player's first name comes from the platform identity. The machine therefore accepts a platform name at boot (`platformName`) or later (`profile-detected`). It skips the name prompt and replaces the « Joueur » fallback, but never a name typed on the device.

423 tests green, `check` clean. `progress` is in MODULES, in `dist/js`, in the worker shell and in the standalone, with no residual import.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Pure adventure progression (stages, temples, doors, texts) and module registration | `44bd31d` (RED), `b6c01cb` (GREEN) | src/progress.ts, tools/build.mjs, public/sw.js, tests/r221-progress.test.mjs, tests/r215-presentation.test.mjs, tests/r218-presentation.test.mjs |
| 2 | High scores, profile, save: defensive reads and injected storage | `ba1546c` (RED), `4242bc3` (GREEN) | src/progress.ts, tests/r221-progress.test.mjs |
| 3 | Application state machine with effects, plus the D-12 platform name hook | `9fb15be` (RED), `142235a` (GREEN) | src/progress.ts, tests/r221-progress.test.mjs |

(`2f6c0da`, interleaved in the log, is the coordinator's D-12 context commit.)

## What was built

### Progression (Q2 / Q3)

- **`afterWin(run, score, lives, sizes)`** has three outcomes:
  - **Next level of the same stage**, with no screen (the board chains them).
  - **`stage-done`**: the run moves to the first level of the next stage, with `completed` and `temple` = `templeAfter(completed)`.
  - **`final`** (`temple: 5`) when the stage is the last one or has an index ≥ 12 (0x44f530). Never back to 1-1.

  Bounds and special case:
  - Positions are bounded: non-finite → 0, finite out of range → clamped.
  - Without stages, the levels follow one another endlessly.
- **`templeAfter`**: 2 → 1, 5 → 2, 8 → 3, 11 → 4 (0x4317ec–0x43180e); the last stage (or index ≥ 12) → 5; otherwise null.
- **Doors.** `DOOR_COUNT` 12; `doorTemple` = ⌊s / 3⌋ + 1 and `doorLetter` = 'ABC'[s % 3], both bounded to 0..11.
- **Texts.**
  - `DOOR_MESSAGES` holds the 12 keys in the push order of 0x4422a0–0x442400 (A2).
  - `GOD_LINES` covers temples 1..5, with the reply pairs used as button labels (A3).
  - `TEMPLE_NAMES` gives each temple a key and a French fallback.
  - Every key exists in the pack's `strings.json` except `QUETZAL_QUATL` / `POPO_POYOLLI` (Pitfall 9).

### High scores, profile, save (Q4, PROG-02)

- **`defaultScores()`**: Zuma 10 000, Grenouille 5 000, Têtard 1 000 — the thresholds of 0x426f20, not its names. Returns a fresh copy each call.
- **`insertScore`**: sorted insertion after equal scores, truncated to 10 (0x416bc0 / 0x415010 / 0x427d60). Returns a 0-based rank, or null when the entry fell out. Never mutates its input.
- **`parseScores`** reads the stored form `{ adventure: HighScore[] }` (0x428170 key):
  - null, corrupt data or the wrong shape → the defaults; a stored `[]` stays empty;
  - entries need a string name and a safe non-negative integer score (negative, `1e309`, `null` and string scores are dropped);
  - `stage` / `level` are clamped to 0..99; a date longer than 10 characters becomes '';
  - the result is sorted (stable) and holds 10 entries at most.
- **`sanitizeName`**: whitespace runs become one space, characters outside `\p{L}\p{M}\p{N}\p{P}\p{S}` + space are dropped (controls, format characters such as U+200B / U+202E), then trimmed and cut to 16 code points (never a broken surrogate). Empty or not a string → null.
- **`parseProfile`**: needs a valid name; `maxStage` is clamped to 0..12 (non-finite → 0); `source` is kept when it is 'platform' or 'default'.
- **`parseSave(raw, sizes)`**: strict. Integers only, the stage / level must exist in `sizes`, lives 1..99, safe non-negative score; anything else → null, and always null without stages.
- **Storage.** `readJson` / `writeJson` take an injected `StorageLike`. Every call is under try/catch: no storage or a throwing storage → null / false. `null` removes the key.

### State machine (D-01..D-04, D-10, D-11)

**Boot.** `initialApp` opens the welcome screen. There is never a level before the player chooses; the name prompt shows when there is no profile. A review run (`?level=`) opens the level directly with one `start-level`.

**Screen by screen (`reduceApp`):**

| Screen | Event | Result |
| --- | --- | --- |
| welcome | `name` | Profile saved; an empty name → « Joueur » with `source: 'default'`; a rename keeps `maxStage` and makes the name typed. |
| welcome | `adventure` | Blocked while a prompt is open. With a saved run → the `continue` prompt. Otherwise the adventure screen on `maxStage`. Without stages: level 0-0 directly (D-02 fallback). |
| continue prompt | `continue` | Saves the run, then starts it. |
| continue prompt | `new-game` | Clears the save → adventure screen. |
| adventure | `select` | Only an unlocked door: integer, < 12, ≤ `maxStage`, inside `sizes`. |
| adventure | `play` | Resumes the run of the selected stage, otherwise starts a new run there (score 0, starting lives). |
| adventure | `main-menu` | Back to the welcome screen. |
| level | `won` | Next level: save + start. Stage done: save of the next stage, `maxStage` raised (`save-profile` only when it rises), then the adventure screen with `opening = selected = next`, or the `temple` screen with `sound templecomplete`. Final: `save-scores` with the rank kept in `ending`, `save-run null`, temple 5 + sound. |
| level | `retry` | Lives 1..99: same level, score of the level start, saved. |
| level | `gameover` | `save-scores` (profile name or « Joueur »), `save-run null`, run cleared; the screen stays on the STATS. |
| level | `leave` | Run in progress → adventure screen on its stage with `save-run`. After a game over → adventure screen on `maxStage`. Without stages → welcome. |
| temple | `temple-done` | Temples 1..4 → adventure screen opening the next door; temple 5 → ending. |
| ending | `ending-done` | Welcome screen; run and ending cleared. |

**Common rules:**
- Out-of-place events return the same object with no effect.
- The state received is never mutated (checked with `structuredClone` over a scripted session).
- In review, `save-run`, `save-profile` and `save-scores` are filtered out once, in `reduceApp`.

### D-12: platform-provided first name (coordinator request during execution)

- **What it is.** `Profile.source?: 'platform' | 'default'`. Absent means typed on this device.
- **When it is used.** The platform name is used (sanitised) and persisted like a typed name when:
  - there is no profile;
  - the stored name is the « Joueur » fallback;
  - the stored name is an older platform name.

  A typed name is never replaced. The same name writes nothing.
- **At boot.** `initialApp({ …, platformName })` applies the rule and skips the name prompt. When the name is absent, empty or not a string, the boot behaves as planned (name prompt).
- **Later.** The identity call answers asynchronously, so the event `{ kind: 'profile-detected', name }` applies the same rule on any screen and closes a pending name prompt. Later scores carry that name.
- **Other paths.**
  - Renaming by hand turns the name into a typed one.
  - In review, the state is updated but nothing is written.
- **Not done here** (as instructed): no network call and no worker. 06-03 (or the hosting plan) calls `api/me` and dispatches the event.

## Verification

- `npm test` → **423/423** + `publication guard: 560 tracked files, none proprietary`; `npm run check` clean.
- `node --test tests/r221-progress.test.mjs tests/r215-presentation.test.mjs tests/r218-presentation.test.mjs` green. `dist/js/progress.js` is produced. `.compiled/progress.js` exports `reduceApp` / `initialApp` and has no import.
- `src/progress.ts` contains no `localStorage`, `window.` or `document.`.
- The standalone (`--standalone`) contains `function reduceApp` once and no `from './progress.js'`. The r215 locks hold: no top-level name is shared between modules, and the stripped bundle parses as one script.
- `git status` is clean. No model identifier is in any committed file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `public/sw.js` template lists the modules literally**
- **Found during:** Task 1 GREEN — r217-presentation (« every MODULES entry precached ») and r220-pwa (« shell = MODULES exactly ») failed.
- **Fix:** `./js/progress.js` added to the `SHELL` literal of the template, between `menudialog` and `main`; the generated `dist/sw.js` lists it.
- **Files modified:** public/sw.js. **Commit:** `b6c01cb`.

**2. [Own test] Comment wording**
- A JSDoc comment named the storage global and tripped the plan's own `! grep localStorage` lock. It was reworded in Task 2 GREEN (`4242bc3`).

### Scope added by the coordinator (D-12)

- `Profile.source`, `initialApp({ platformName })`, the `profile-detected` event and four tests:
  - boot with a platform name or without one;
  - the replacement rules;
  - the event;
  - `parseProfile` keeping the source.
- No network code. Recorded in `2f6c0da` (06-CONTEXT D-12, coordinator) and implemented in `9fb15be` / `142235a`.

### Plan adjustments (documented, no rule weakened)

- **`Profile` stays `{ name, maxStage }`** for typed names. `source` is optional, so the planned interface and the Task 2 tests are unchanged.
- **Without stages, no `save-run` is written** (a save could never be parsed back without `sizes`). `save-run null` is still emitted at a game over, which is harmless.
- **`select` of the stage already selected** returns the same object (no change).
- **`AppEffect` `sound 'button'`** stays in the type but is never emitted. The presentation plays click sounds itself.

## Hypotheses carried into the code (for 06-03 / 06-04 / UAT)

| # | Hypothesis / choice | Where |
| --- | --- | --- |
| A1 | Adventure screen only after a full stage (plateau+0x186) | `afterWin` |
| A2 | Door message order = push order | `DOOR_MESSAGES` |
| A3 | God text ↔ temple mapping by string order | `GOD_LINES` |
| A4 | Final: god dialogue (temple 5), then ending; the score is submitted at the `won` of the last level (after its STATS) | `reduceApp` 'won' final |
| A5 | Unlocked doors are clickable and « Jouer » starts the selected stage | 'select' / 'play' |
| Pitfall 9 | « TEMPLE DE QUETZAL QUATL » / « TEMPLE DE POPO POYOLLI » fallbacks | `TEMPLE_NAMES` |
| D-12 | A profile without `source` is typed (never replaced); stored « Joueur » profiles written before this plan do not exist | `platformProfile`, `parseProfile` |

## Open points for 06-03 / 06-04

- **06-03, wiring.**
  - Read the profile, save and scores with `readJson(localStorage …)` under try/catch, `parseProfile` / `parseSave(raw, sizes)` / `parseScores`.
  - Build `initialApp` with `sizes = pack.data.stages.map(s => s.levels.length)` (or `[]`), `startLives = CANDIDATE.lives`, and `review` from `?level=`.
  - Perform the effects: `writeJson(storage, SAVE_KEY, run)`, `PROFILE_KEY`, `HIGHSCORE_KEY` with `{ adventure: scores }`.
- **06-03, timing of the name prompt (D-12).** On the hosted build the `api/me` answer arrives after boot. To avoid flashing the name dialog, the welcome screen should wait briefly (or until the answer / an error) before showing `prompt 'name'`. The alternative is to await the call and pass `platformName` to `initialApp`. When an unknown address returns nothing, keep the planned prompt.
- **06-03 / 06-04, `main.ts` lifecycle.**
  - `nextLevel()` / `newGame()` / game over currently restart at `{0,0}` (Pitfalls 5–6): they must dispatch `won` / `retry` / `gameover` / `leave` instead.
  - « Retour au menu principal » = `leave`.
- **06-04, after temple 4.** The adventure screen gets `selected = opening = 12` (13-1, « Espace »), which has no door (`doorTemple` / `doorLetter` clamp to door 11). Decide how 06-04 shows the last stage (for example all doors open, with the « Jouer » button active).
- **06-04, ending.** `state.ending = { score, rank }` feeds the high-score table with the line highlighted; `scores` is already the updated list.

## Known Stubs

None. The module is complete but not wired yet; that is planned in 06-03 / 06-04, not a stub.

## Threat Flags

None beyond the plan's register:
- **T-06-04:** defensive parsing, bounded numbers, 10 entries, saves checked against `sizes`.
- **T-06-05:** printable names, 16 characters at most, drawn on the canvas only.
- **T-06-06:** storage access under try/catch.
- **T-06-07:** no PopCap name.

The D-12 platform name goes through the same `sanitizeName` and is never injected into the DOM.

## Self-Check: PASSED

Verified on disk and in `git log` on 2026-10-11:
- Files: `src/progress.ts` and `tests/r221-progress.test.mjs` created; `tools/build.mjs`, `public/sw.js`, `tests/r215-presentation.test.mjs` and `tests/r218-presentation.test.mjs` modified.
- Commits: `44bd31d`, `b6c01cb`, `ba1546c`, `4242bc3`, `9fb15be`, `142235a`.
- Tests: 423/423 + guard.
- `main.ts`, STATE.md and ROADMAP.md untouched.
