---
phase: 05-regles-originales-completes
plan: 12
subsystem: engine + presentation
tags: [destroy-24-ticks, attraction-counter, contact-recoil, zuma-pushback-per-chain, ball-exit, coin-consumes-shot, three-frogs, reserve-frogs-hud, top-bar-realigned, contact-sound-guard, baseline-2.0.19]

# Dependency graph
requires:
  - plan: 05-10
    provides: R2.0.18 engine (coins, extra lives, tally), HUD lifeIcons / ORIGINAL_BUTTONS, evidence-script patterns
  - plan: 05-11
    provides: R2.0.18 release, UAT 7 (U34–U38)
  - doc: 05-RESEARCH-04.md
    provides: coin 0x423330 (Q1), power-up spawn without sound (Q2), HUD 0x40fa90 (Q3), destruction / attraction / contact recoil 0x423a10 / 0x421800 / 0x40ab60 (Q4), ZUMA 0x40a980 / 0x423b60 (Q5)
provides:
  - "core.ts : destroyTicks 24; Ball.attract (v, ⌊v/8⌋ px per whole maj then v + 1, majClock); attractStartAfterMatch 10 at the end of a destruction between two same-colour curve neighbours, attractStartAfterShot 1 after a shot without a match against a gap of its colour; contact recoil { id, ticks 18, speed max(50, 150 × depth) } pushing every ball behind (exploding included), contactPusherStopTicks 12; no recoil at match time (attractSpeed / recoilSpeed / recoilTicks removed)"
  - "core.ts : Chain.zumaBackLeft / zumaSlowLeft armed only on chains covering > 50 %, head pushback zumaBackSpeed 100 px/s pushing the balls behind, pusher stopped, reset under zumaBackMinHead 50 px; ZumaEngine.zumaSlowLeft removed; zuma event { coverage, pushback, chains }; ball-exit { chain, id, color } below s = 1 in ZUMA mode; coinRadius 36 + coinConsumesShot (default true), coin event shotId; game over at lives ≤ 0; ENGINE_VERSION 2.0.19"
  - "feedback.ts : power-spawn silent, merge at 0.8, CUE_GUARD_MS { merge: 250 }, cueAllowed"
  - "import-original.mjs : SOUND_MAP insert → ballclick2, merge → ballclick1, no powerup (pack re-imported locally)"
  - "render.ts : HUD_LAYOUT, lifeIcons(lives, dying) → { icons, count, label }, livesHidden(left), MenuButton picture at (519, 3), RenderAssets.menuButton, HudState.dying / livesBlink; explosion frames counted in maj"
  - "main.ts : playCue (cueAllowed before audio.play), menubutton loaded, hud() dying / livesBlink, extra-life → 90-tick blink, loss message on lives > 0"
  - "tests/r219.test.mjs (22 tests) and tests/r219-presentation.test.mjs (12 tests); r213 / r214 / r215 / r216 / r216-presentation / r218 / r218-presentation adjusted with « R2.0.19 » comments"
affects: [05-13 (release notes R2.0.19, README, CONCERNS, UAT 8)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fractional maj clock: the engine integrates original per-maj integer rules (⌊v/8⌋) exactly at 60 Hz by running ⌊majClock⌋ whole maj steps per tick (5 per 3 ticks)"
    - "Reference model inside the test (majProfile / attractTicks) fed with the engine's clock phase, so tick-exact contact times are asserted without hard-coding the phase"
    - "Fixtures with the frog straight below the insertion point (shot at (x, 240) lands at s = x) instead of slanted shots"

key-files:
  created: [tests/r219.test.mjs, tests/r219-presentation.test.mjs]
  modified: [src/core.ts, src/render.ts, src/main.ts, src/feedback.ts, src/audio.ts, tools/import-original.mjs, package.json, tests/r213.test.mjs, tests/r214.test.mjs, tests/r215.test.mjs, tests/r216.test.mjs, tests/r216-presentation.test.mjs, tests/r218.test.mjs, tests/r218-presentation.test.mjs]

decisions:
  - "D-31 (orchestrator): coinConsumesShot defaults to true (original 0x4236a9–0x4236eb); r215 « flies on » lock flipped, the fly-on variant kept behind false; coinRadius 36"
  - "D-33 (orchestrator): three frogs per game — lives − 1 at a loss, game over at ≤ 0 (0x428383–0x4283a5); the HUD shows lives − 1 in reserve (lives while dying)"
  - "D-34 (orchestrator): the contact recoil pushes the exploding balls too (they keep their place until removed)"
  - "D-33 MENU word (task 4 step 0): the pack's MenuButton picture already carries « MENU » in its three states → only the picture is drawn"
  - "D-35 early stop applied only while a pushback or a ZUMA slowdown runs (an ordinary pusher stop near the entrance is left alone)"
  - "End-of-destruction attraction armed from the curve neighbours of each removed block (0x423a6b reads list neighbours) — also after a bomb; identical to leftId / rightId for a match"

metrics:
  duration: "~32 min (06:02 → 06:34 UTC, plus summary)"
  completed: 2026-10-11
  tasks: 5
  commits: 8
  tests: "246/246 + publication guard (was 212/212; r219 +22, r219-presentation +12; replaced locks keep their count)"
---

# Phase 5 Plan 12: Chain kinematics, per-chain ZUMA pushback, coin, three frogs, top bar and sounds (UAT 7) — Summary

The five findings of UAT 7 are delivered with the rules spike 04 read in `Zuma.exe`. A destroyed ball now stays 24 ticks (40 maj) and nothing moves meanwhile; when it is removed between two balls of one colour the front segment is attracted back by the original counter v (⌊v/8⌋ px per maj, then v + 1, no cap — 96 px close in 20–21 ticks, 32 px in 11), a shot ball without a match against a gap of its colour arms v = 1, and only the contact of an attraction makes the chain recoil, 15 px without a match and 45 px for a depth-1 chain reaction, pushing the whole chain and stopping the pusher (U37, D-34). At ZUMA only the chains whose head covers more than half of their track roll back, from the head at 100 px/s for 180 ticks at most, closing gaps from the front and deleting the balls that pass below the entrance (U38, D-35). A coin is grabbed within 36 px and consumes the shot (U34, D-31). A game has three frogs, the top bar shows lives − 1 reserve frogs (one frog and « xN » beyond three, a 1.5 s blink after an extra life) and every slot sits on its oval of `Menubar.jpg` (U36, D-33). The power-up spawn is silent, the contact plays `ballclick1` at 0.8 at most every 250 ms and the impact `ballclick2` (U35, D-32 / D-34). Baseline 2.0.19, 246 tests green, standalone 7 779 882 bytes booting from `file://`.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Engine A: 24-tick destruction, attraction counter after it, contact recoil only (D-34) | `f90ba33` (RED), `62bdd63` (GREEN) | src/core.ts, src/render.ts, tests/r219.test.mjs, tests/r213.test.mjs, tests/r214.test.mjs, tests/r216-presentation.test.mjs |
| 2 | Engine B: per-chain ZUMA pushback, exit below 1 px, coin 36 px consuming the shot, three frogs, baseline 2.0.19 (D-31, D-33, D-35) | `1714db0` (RED), `1fe55a7` (GREEN) | src/core.ts, src/main.ts, package.json, tests/r219.test.mjs, tests/r213.test.mjs, tests/r215.test.mjs, tests/r216.test.mjs, tests/r218.test.mjs |
| 3 | Sounds: silent power-up spawn, contact / impact, 250 ms guard, local re-import (D-32, D-34) | `f62f651` (RED), `51bce6c` (GREEN) | src/feedback.ts, src/audio.ts, src/main.ts, tools/import-original.mjs, tests/r219-presentation.test.mjs, tests/r213.test.mjs |
| 4 | HUD: reserve frogs, « xN », blink, top bar realigned (D-33) | `0fc482e` (RED), `e488149` (GREEN) | src/render.ts, src/main.ts, tests/r219-presentation.test.mjs, tests/r218-presentation.test.mjs |
| 5 | Full verification, builds, browser evidence | — (no fix needed) | — |

## What was built

- **Destruction and attraction (`core.ts`, 0x423a10 / 0x421800)** — `destroyTicks: 24` (40 maj × 0.6). `majClock` += 100 / tickHz at the start of each step; the tick runs ⌊majClock⌋ whole maj steps (1 or 2, five per three ticks). `processRemovals` removes the due balls and, for every block of removed balls whose two curve neighbours are alive, not exploding and of one colour, gives the front one `attract = attractStartAfterMatch` (10). `settle` without a match (0x421d55–0x421dae): a gap behind the shot ball with its colour behind → `attract = 1` on the ball itself; a gap ahead → on the next ball unless it attracts already. `attractSegments`: per maj, the rear ball of each segment carrying v pulls its segment ⌊v/8⌋ px back, bounded by the exact contact, then v + 1; a counter that leads no segment with an alive ball behind is dropped (T-05-37).
- **Contact recoil (`core.ts`, 0x4219a0 / 0x40ab60)** — `onJunction` emits `merge` as before; when `right.attract` was set it clears it, takes the arrived segment before the junction match (`junctionMatch` split out), and pushes `{ id, ticks: contactRecoilTicks, speed: max(contactRecoilMin, contactRecoilPerDepth × d) }` for its most advanced ball not destroyed (d = edge depth when the junction destroys, else 0; a ball that recoils already keeps its entry). `applyRecoils` (front to back over `chain.balls`, exploding balls included) moves the ball `speed / tickHz` and `pushBehind` the overlapping balls, then `stopPusher` (stop ≥ 12 ticks, speed 0). The pusher does not advance on a tick where a recoil moves balls. `destroyRun` no longer pushes recoils; `resolveBackward` removed.
- **ZUMA (`core.ts`, 0x40a980 / 0x40ab60 / 0x423c73)** — `addScore` arms `zumaBackLeft = max(…, 180)` / `zumaSlowLeft = max(…, 660)` on each chain whose coverage > `zumaCoverage`; `backwardsTicks` stays the RECUL power-up's; `zuma { coverage (max), pushback, chains }`. `moveChain`: while `zumaBackLeft > 0` the most advanced alive ball moves back `zumaBackSpeed / tickHz` and pushes the balls behind it (`zumaPushback`, pusher stopped, recoils only count down); both counters decrement once per tick before the junctions / settle; `zumaEarlyStop` resets pushback, slowdown and stop when the chain is empty or its head is under 50 px (only while a ZUMA phase runs). `pusherTarget` reads `chain.zumaSlowLeft`. `exitBalls` (after `tickCoin`, before the tally / removals): in ZUMA mode every ball with s < 1 is deleted with its removal ids and recoil, `ball-exit { chain, id, color }`; an emptied board starts `clearing` through `checkEnd`.
- **Coin and lives (`core.ts`)** — `coinRadius: 36`, `coinConsumesShot: true`; the `coin` event carries `shotId` and the projectile is dropped (no insert, no miss, streak kept). `checkEnd`: `lives <= 0 ? 'gameover' : 'lost'`. `ENGINE_VERSION` / `package.json` 2.0.19.
- **Sounds** — `SIMPLE_CUES` without `power-spawn` and `merge`; `merge` → `{ key: 'merge', gain: 0.8 }`; `CUE_GUARD_MS { merge: 250 }`, `cueAllowed(last, key, nowMs)` (non-finite clock → allowed, nothing recorded). `main.ts` `playCue` = `cueAllowed(this.cueLast, key, performance.now())` then `audio.play`; `handleEvents` uses it (the events drained after `creditBonus` go through `handleEvents` too). `audio.ts` loses the `powerup` synth. `SOUND_MAP` `insert: 'ballclick2'`, `merge: 'ballclick1'`, no `powerup`.
- **HUD (`render.ts`, `main.ts`)** — `HUD_LAYOUT` (lives 28 + 35 i / 3, max 3, label (67, 22); level centre 200 / baseline 15; score right 360 / baseline 17; gauge (409, 2); menu (519, 3, 99 × 25)); `ORIGINAL_BUTTONS.menu` follows it (touch zone). `lifeIcons(lives, dying)` and `livesHidden(left)` as specified; the menubar HUD draws the frogs at 24 × 23, « xN » in CancunFloat14 with `tint` / `multiply` `#ffff00` (fallback bold 14 px yellow `fillText`), the level label yellow, the score white, the gauge and its ZUMA pulse at (409, 2), and frame 0 of `MenuButton` (word included; text fallback without the picture). The vector HUD keeps its positions with the same `lifeIcons` / `livesHidden` rules (yellow « xN »). `main.ts` loads `pack.masked('menubutton')`, passes `dying` (`draining` / `lost` / `gameover`) and `livesBlink = max(0, livesBlinkUntil − tick)`; `case 'extra-life'` arms `livesBlinkUntil = tick + 90` (no text); reset at each new engine.

## Verification

- `npm test` → **246/246** + `publication guard: 513 tracked files, none proprietary`; `npm run check` clean; every task `<verify>` gate passed. `node tools/build.mjs --local` and `--standalone` → `standalone/zuma-standalone.html` **7 779 882 bytes** (−26 255 vs R2.0.18; the literal `R2.0.19` once — the badge is composed from `ENGINE_VERSION`); `tests/r215-presentation.test.mjs`, `r219`, `r219-presentation` 49/49. No `.png`, `private_assets/`, `dist/` or `standalone/` tracked; no model identifier in any committed file.
- **Re-import** (`shots-r219/reimport.log`, backup `scratchpad/pack-before-r219`): 22 levels, 25 curves, **39 sounds / 39 m4a** (was 40), 82 images, 5 fonts, 215 strings; `insert.ogg` / `insert.m4a` byte-identical to the old `merge.*` and vice versa; `insert.ogg` = original `ballclick2.ogg`, `merge.ogg` = `ballclick1.ogg`; only `powerup.ogg` / `powerup.m4a` gone; changed besides: `pack.json`, `sounds/manifest.json` (no `powerup` key).
- **Gap closing** (`gap-close.log`, `gap-close.png`, level 1-1 hand-stepped, fixture at s 900): plain « 2 / 2 »: destroy 136, nothing moves 137–159, removal 160 (v = 10), contact **R + 20**, recoil **15.00 px** in 18 ticks for head and rear; chain reaction: contact **R + 21**, depth-2 destroy at the contact, recoil **45.00 px** for head and rear; with the pusher at 50 px/s: last recoil tick 638, speed **0 through +12**, restart at **0.833 px/s** (= 50 px/s² × 1/60).
- **ZUMA pushback** (`zuma-pushback.log`, `zuma-pushback.png`, level 1-5 `blackswirley`, two chains): coverage 0.634 / ≈ 0.30 → `chains [0]`; chain 0 head −16.7 px every 10 ticks (100 px/s), `zumaBackLeft` 180 → 0, `zumaSlowLeft` counting; chain 1 untouched (0 / 0, 60 px/s); the queued ball at s −40 exits at the passage tick, then 8 more one by one (19–20 ticks apart), 50 → 41 balls; the 64 px gap closed from the front (one `merge`); **0** destroy events.
- **Coin** (`coin-grab.log`): vertical shot 30 px beside a coin → `coin { points 500, shotId 41 }` at tick 120, **0 projectiles** at once and at the next tick, no `insert`, no `miss`, `stats.misses` 0, streak 3 kept.
- **Lives** (`lives.log`, `lives-loss-*.png`, real retry flow): 3 → `lost` (2), 2 → `lost` (1), 1 → **`gameover` (0)**; reserve icons 2 / 1 / 0 at the start of each life, the frog in play counted while draining. HUD captures `hud-lives-{3,4,5,6,13}.png` + band crops: 2 frogs, 3 frogs, 1 frog + « X4 », « X5 », « X12 ».
- **Blink** (`hud-blink.log`): score 49 990 + a real match → `extra-life` (lives 4), visibility flips at +4, +14, +23, +33, +43, +52, +62, +71, +81 ticks (**0.160 s** apart), visible from +90.
- **Sounds** (`sounds.log`, `audio.play` hooked after the guard): a shot into the chain → `insert` gain 1; match then attraction contact → `insert`, `destroy1`, `combo` 0.4, then **`merge` 0.8**; merges at 0 / 0 / +100 / +400 ms → **2 plays** (0 and +400); a `power-spawn` (backwards) → **no play**. Console clean everywhere.
- **Standalone** (`standalone-r219.log` / `.png` / `-go.png`): `file://…/zuma-standalone.html?level=1-1&debug=1` → level `spiral` 1-1, « PARTEZ » (go tick 89), 38 balls, assets / STATS kit / menu kit 2 ×, menu by Escape, help view badge `R2.0.19 · 2.0.19+20261011T063433 · ressources originales`, **console clean**.

### Top bar: measurements and visual verdict

`hud-measure.log`: `Menubar.jpg` 640 × 480, ovals read on the 4 × crop: green **24–125**, red **168–230**, black **272–366**, red **409–470**, green **519–616** (y ≈ 2–27) — the spike's values. `MenuButton` 297 × 25, three 99 px states (green normal, purple hover / pressed), **« MENU » painted in the picture**. Every `HUD_LAYOUT` coordinate fits its oval (frogs 28–122, gauge 409–471 ±1, MENU 519–618 ±3); no slot had to be kept. Pictures looked at (`hud-before-band-x4.png` → `hud-after-band-x4.png`, `hud-lives-*-band-x4.png`, `standalone-r219-go.png`): before, MENU text sat in the left green oval, three shrunken frogs in the left red oval, « 1-1 » in the right red oval and the gauge in the right green oval; after, the reserve frogs at native size (or one frog and « X4 ») fill the left green oval, the yellow level label is centred in the left red oval, the score sits right-aligned in the black oval, the gauge fills the right red oval and the original green MENU button fills the right green oval — nothing overflows or overlaps.

### Coin « disappearance » in R2.0.18 (orchestrator question)

Not a presentation bug: `drawProjectiles` draws every projectile unconditionally, and the R2.0.18 engine kept the ball flying straight after a grab — but **44 of the pack's 61 treasure points have no track at all past the coin on the frog → coin line** (`coin-geometry.log`; the coins sit near the board edges and corners, the chain is crossed before the coin, not after). A ball that took a coin (it had to pass within 18 px of the centre) therefore left the board a few ticks later at 12 px/tick and counted as a `miss` — « la boule disparaît et ne s'insère pas ». With R2.0.19 the shot is consumed at the grab, as in the original, so the visible outcome is the same but now on purpose; no extra fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explosion cut at frame 8 of 13 by the 24-tick destruction**
- **Found during:** Task 1 (render reads `destroyTicks`).
- **Issue:** the 13 × 3 explosion frames (39 = the original 40-maj counter) were indexed by the tick counter; with 24 ticks the animation stopped at frame 7.
- **Fix:** `drawExplosions` converts the counter to maj (`ticks × 100 / tickHz`) before `explosionFrame` (unchanged, r213 lock intact), so the whole explosion plays within the destruction.
- **Files modified:** src/render.ts. **Commit:** `62bdd63`.

**2. [Rule 1 - Bug] Loss message after the lives rule change** — with game over at 0 the last loss emits `lost` with lives 0; the message test moved to `engine.lives > 0` in Task 2 (with the rule) rather than Task 4. **Commit:** `1fe55a7`.

### Plan adjustments (documented, no rule weakened)

- **r216-presentation end-to-end STATS literals** (not in the plan's file list): the run is removed 24 ticks after the match, so `levelTicks` 62 → **46**, TEMPS « 1 s » → « 0 s », bonus `aceTimeBonus(0, 25)` = **+25100** (count-up step still 1 300); comment « R2.0.19 (D-34) ».
- **Attraction trigger** read from the curve neighbours of each removed block (0x423a6b), not only `leftId` / `rightId`: identical for a match, and a bomb gap between two balls of one colour attracts too, as in the original.
- **Early stop under 50 px** only while a pushback or a ZUMA slowdown runs (the spike reads it unconditionally; applying it always would cancel an insertion stop whenever the head is under 50 px, e.g. a level start).
- **Pusher stop timing:** the recoil / pushback stop is armed after `updatePusher`, so the speed stays 0 for 12 full ticks after the last moving tick (the test asserts ≥ 12).
- **During the ZUMA pushback** contact recoils only count down (the original overrides the head's recoil each maj; other balls' recoils were not modelled).
- **Fixtures:** the frog sits straight below the insertion point (`below(x)`); the early-stop head is at **121** px (not 120) so the head does not land exactly on 50.0 in floating point; the two-chain coverage is 0.77 / 0.34 (the shot pushes the head forward); the « exit » fixture counts 11 exits (10 pushed + the queued ball).
- **Own RED regexes fixed in GREEN:** the compiled `for … of soundCues(e)` loop is emitted as a block (`[\s{]*`).
- **Pack test** in r219-presentation compares `insert.ogg` / `merge.ogg` with the original `ballclick2` / `ballclick1` (skipped without the pack) instead of the scratchpad backup (the backup comparison is in `reimport.log`).

## Hypotheses carried into the code (for 05-13)

| # | Hypothesis / choice | Where |
| --- | --- | --- |
| D-31 | Coin consumes the shot (original), contrary to the user's U34 memory; `coinConsumesShot: false` gives the R2.0.18 fly-on | `EngineConfig.coinConsumesShot` JSDoc |
| D-32 | No sound at power-up spawn (no `choral1` fallback) | `SIMPLE_CUES` JSDoc |
| D-33 | Three frogs per game (0x428383, rule change); `state == 2` read as « dying » (A4, MEDIUM) | `checkEnd`, `lifeIcons`, `hud()` |
| D-33 | « MENU » word not drawn: it is in the `MenuButton` picture | `drawHud` |
| D-34 | Exploding balls pushed by the recoil; attraction integrated on a fractional maj clock | `applyRecoils`, `majClock` JSDoc |
| D-35 | Early stop gated on a running ZUMA phase; recoils frozen during the pushback | `zumaEarlyStop`, `zumaPushback` |
| — | Spike 04 open points: power-up 1 s wait visual, per-type power-up spawn model (independent draws, several at once, 20 s life) | not implemented |

## Open points for 05-13

- `R219_RELEASE_NOTES.md`, README (coin consumed, three frogs, reserve frogs / « xN » / blink, top bar layout, sounds, ZUMA pushback per chain and exits, attraction / recoil numbers), CONCERNS (hypotheses above), UAT 8 checks for U34–U38 (gap closing feel, ZUMA « some disappear », coin, frogs and bar, power-up silence).
- Pre-existing, noticed: `checkEnd` emits `lost` twice for one loss (at the loss with `lives`, again at the end of the drain without payload) — the « Perdu… » message is shown twice; harmless, not changed.
- Cosmetic: the HUD score and level label still use the system font (the original uses `FONT_MONODIGIT` / `FONT_DIALOG`); CancunFloat14 draws the « x » of « xN » as a capital-looking glyph (« X4 »); the empty gauge picture reads as a full yellow pill at 0 points (unchanged from R2.0.18).
- Not implemented (out of scope): the original power-up spawn model and its 1 s pending state (spike 04 Q2 annex).

## Known Stubs

None added. (The inert music slider of 05-10 is unchanged.)

## Threat Flags

None beyond the plan's register: T-05-37 (attract bounded at the exact contact, cleared at the contact / when it leads no segment, ≤ 2 maj steps per tick — r219), T-05-38 (recoil 18 ticks, pushback 180 ticks, early stop, one recoil per ball, one backward pass over the curve list), T-05-39 (exits only in ZUMA mode, removals / recoils cleaned, no score — r219), T-05-40 (`cueAllowed` guard, non-finite clock → allowed without state — r219-presentation), T-05-41 (`lifeIcons` / `livesHidden` non-finite or negative → nothing / visible, ≤ 3 icons — r219-presentation).

## Self-Check: PASSED

Files (2 created / 14 modified) and the 8 commits above (`f90ba33`, `62bdd63`, `1714db0`, `1fe55a7`, `f62f651`, `51bce6c`, `0fc482e`, `e488149`) verified on disk / in `git log` on 2026-10-11; 246/246 + guard; 36 captures / logs under `scratchpad/shots-r219/`; nothing proprietary, no capture, no build output tracked; STATE.md / ROADMAP.md / README / release notes untouched by instruction.
