---
phase: 05-regles-originales-completes
plan: 10
subsystem: engine + presentation
tags: [curv-tunnel, draw-priority, extra-lives, coin-cadence, multi-chain-tally, in-game-menu, options-dialog, window-input, device-pixel-scaling, rolling-fade, stereo-pan, baseline-2.0.18]

# Dependency graph
requires:
  - plan: 05-08
    provides: StatsKit / composeStatsDialog / drawNineSlice / upscaleStatsKit (the menu reuses the kit), applyHd 1 × / 2 × selection, rampPlan, SoundCue.delay / clampDelay, buildHdAssets
  - plan: 05-09
    provides: evidence-script patterns (scratchpad), STATS child-canvas pattern, standalone boot script
  - doc: 05-RESEARCH-03.md
    provides: CURV layout and byte semantics (Q1), OPTIONS dialog in game mode (Q2), AddScore lives (Q3), coin object 0x417580 (Q4), rolling channel (Q5)
provides:
  - "core.ts : Track.tunnelAt / priorityAt / ballPriority(s, 16) (0x405c10), nearest(p, skipTunnel) (0x414d6e), tunnel balls not touchable (0x408f52), extraLifeEvery 50 000 with `extra-life { lives, count }` from addScore and creditBonus (0x417380), coins coinVisibleTicks 600 / coinFirstTicks 180 / coinRetryTicks 780 / coinChance 1/180 and dist in % (0x417580, 0x40a900), CleanupMarker / Cleanup.markers (one marker per chain, lastDestroy per chain), cleanup event carries `s`, ENGINE_VERSION 2.0.18"
  - "tools/import-original.mjs : parseCurve aligned on the CURV layout (x, y, A, B then dx, dy, A, B), flags = A | min(3, B) << 1, `trailing` (warned); slidertrack / sliderthumb / checkbutton (+ masks) copied into the pack"
  - "render.ts : drawPasses (five passes L = 0..4: cutouts, bursts, balls, explosions of priority L), no ball skipped, vector tunnels on bit 0, stagePoint, fitScale, lifeIcons"
  - "original.ts : DrawableLayer.priority, layerPriority (pack priority, default 1, bounded 0..4)"
  - "menudialog.ts (new) : MENU_LAYOUT, menuWidgets (menu / help / confirm), hitMenu, sliderValue, CONTROLS_HELP, MenuState, MenuKit, loadMenuKit, upscaleMenuKit, composeMenuDialog (pack kit or vector fallback on canvas)"
  - "audio.ts : ROLLING_GAIN 0.35, ROLLING_ATTACK_SECONDS 0.05, ROLLING_FADE_SECONDS 0.5, clampPan, StereoPannerNode routing (guarded), volume / setVolume (master 0.8 × volume)"
  - "feedback.ts : SoundCue.pan, extra-life → extralife × 3 at 0 / 0.3 / 0.6 s, coinappear 0.40 / coinvanish 1 panned (x − 320) / 320 × 0.3, ColorBurst.layer"
  - "main.ts : canvas MENU (child of #menu, 1 × / 2 × kit, pause under it, pointer + keyboard), whole-window pointer input, keys Space / Enter / Escape / Tab / P / M, applyScaling through fitScale (--k in both modes), burst / sparkle layers, events drained after creditBonus"
  - "shell : #menu emptied, .menu-panel CSS removed, .menu-picture and .stage.sized rules, MODULES + sw.js precache gain menudialog"
  - "tests/r218.test.mjs (16 tests, 374 lines) and tests/r218-presentation.test.mjs (20 tests, 378 lines); r213 / r214-presentation / r215 / r215-presentation / r216 / r216-presentation / r217 / r217-presentation adjusted with « R2.0.18 » comments"
affects: [05-11 (release notes R2.0.18, README controls / menu / coins / lives / tally, CONCERNS hypotheses, UAT 7), phase 6 (main menu behind « Retour au menu principal », music slider)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Draw order as a pure function (drawPasses) over generic items with a priority, so the render order is locked by a Node test without a canvas"
    - "Dialog painters: one layout (menuWidgets / MENU_LAYOUT) consumed by two painters (pack kit / vector) behind a small interface; the composition is checked on a Proxy-recorded 2D context"
    - "Glyph-aware text: pack fonts lack « · » (and the tip font's « / » is blank), so separators are substituted at drawing time while the source strings stay canonical"
    - "Evidence hooks at run time: handleEvents and audio.play wrapped from page.evaluate, AudioBufferSourceNode.start / createStereoPanner wrapped by an init script"

key-files:
  created: [src/menudialog.ts, tests/r218.test.mjs, tests/r218-presentation.test.mjs]
  modified: [src/core.ts, src/render.ts, src/original.ts, src/main.ts, src/audio.ts, src/feedback.ts, tools/import-original.mjs, tools/build.mjs, index.html, public/style.css, public/sw.js, package.json, tests/r213.test.mjs, tests/r214-presentation.test.mjs, tests/r215.test.mjs, tests/r215-presentation.test.mjs, tests/r216.test.mjs, tests/r216-presentation.test.mjs, tests/r217.test.mjs, tests/r217-presentation.test.mjs]

decisions:
  - "D-23: CURV byte A = tunnel (no projectile contact, skipped by the nearest-point search), byte B = draw priority 0..3; a ball's priority = max(priority at s − 16, s + 16); the board is drawn in five passes, cutouts (all pri 1 in the pack) between the priority-0 and priority-1 balls; nothing is ever skipped"
  - "D-27: one life per multiple of 50 000 crossed, several at once, no cap, also through the STATS count-up (creditBonus); `extralife` three times at 0 / 0.3 / 0.6 s; no in-game text; HUD shows three frogs then « +N »"
  - "D-28: coin visible 600 ticks; first attempt at 180 ticks, then attempts 780 ticks after the previous appearance (grabbed or not) at 1/180 per tick; none once the ZUMA gauge is full; dist = % of the curve passed by the chain head"
  - "D-30 (user choice, deviation from research §7's sequential +50 maj): one marker per chain from its own last explosion (else its track start), all stepping together, shared pops, won 30 ticks after the longest"
  - "D-24 with the orchestrator-approved choices: music slider greyed and inert; « Retour au menu principal » → LEAVE_GAME_? / QUIT_THE_GAME_? confirmation → new game; help = controls + pack tips + build badge; the game is paused under the menu"
  - "D-26 with the approved touch exception: mouse clicks on the HUD MENU / STATS shoot; a touch on them still opens them; right click swaps (C1), Space / Enter / Escape toggle the menu, Tab the STATS, P pause"
  - "D-25: --k = fitScale(window, dpr, « Pixels nets ») in both modes; « Pixels nets » = max(1, ⌊fit × dpr⌋) / dpr on a 640 × 480 store"
  - "D-29: rolling 0.35, 50 ms attack, 500 ms linear fade, cut by stopLoops under pause / menu / STATS; one loop for all chains (the original has one per curve)"

metrics:
  duration: "~31 min (20:11 → 20:42 UTC)"
  completed: 2026-10-10
  tasks: 6
  commits: 12
  tests: "212/212 + publication guard (was 176/176; r218 +16, r218-presentation +20)"
---

# Phase 5 Plan 10: Tunnels, native in-game menu, whole-window input, lives, coin cadence, rolling and multi-chain tally — Summary

The eight findings of UAT 6 are delivered with the rules spike 03 read in `Zuma.exe`: the CURV importer now decodes byte A as a tunnel and byte B as a draw priority (aligned on the real layout), the board is drawn in five priority passes so no ball is ever skipped and the 2-2 balls visibly dive under the `left` / `right` cutouts while the inner spiral passes over them, and a projectile flies through tunnel balls (U26, D-23); the in-game MENU is the original OPTIONS dialog in game mode, composed on canvas with the STATS kit plus the pack's slider and check-box pictures, the game paused under it (U27, D-24); the stage fills the window in 4:3 and « Pixels nets » lands on whole device pixels — 960 × 720 CSS instead of 640 × 480 at 1000 × 750 DPR 2 (U28, D-25); aim and shots cover the whole window, right click swaps, Space / Enter / Escape open the menu, Tab the STATS (U29, D-26); every 50 000 points give a frog with a triple `extralife` (U30, D-27); coins follow the original cadence with `coinappear` at 0.40 and panned (U31, D-28); the rolling loop plays at 0.35 with a 500 ms linear fade (U32, D-29); and the end-of-level tally walks one marker per chain, all together (U33, D-30). Baseline 2.0.18, 212 tests green, standalone 7 806 137 bytes booting from `file://`.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Engine A: CURV tunnel / priority, Track, tunnel collision, importer + local re-import, extra lives, baseline 2.0.18 (D-23, D-27) | `6a0d6c9` (RED), `4a76a71` (GREEN) | src/core.ts, tools/import-original.mjs, package.json, tests/r218.test.mjs, tests/r213.test.mjs, tests/r217.test.mjs |
| 2 | Engine B: original coin cadence, simultaneous multi-chain tally (D-28, D-30) | `b6b18f6` (RED), `f8da1bd` (GREEN) | src/core.ts, tests/r218.test.mjs, tests/r215.test.mjs, tests/r216.test.mjs |
| 3 | Priority draw passes, no ball skipped, per-chain sparkles, 2-2 before / after evidence (D-23, D-30) | `351bdfa` (RED), `8b53519` (GREEN) | src/render.ts, src/original.ts, src/main.ts, src/feedback.ts, src/core.ts, tests/r218-presentation.test.mjs |
| 4 | Native in-game MENU (OPTIONS in game mode) on canvas, DOM panel removed (D-24, U27) | `cc6843c` (RED), `a9a5893` (GREEN) | src/menudialog.ts, src/main.ts, src/audio.ts, index.html, public/style.css, public/sw.js, tools/build.mjs, tests/r218-presentation.test.mjs, tests/r215-presentation.test.mjs |
| 5 | Whole-window input and device-pixel window scaling (D-25, D-26, U28, U29) | `34a6a4a` (RED), `ac81cfe` (GREEN) | src/main.ts, src/render.ts, public/style.css, tests/r218-presentation.test.mjs |
| 6 | Audio and HUD: rolling fade, coin pan, triple extralife, HUD frogs, full verification (D-27, D-28, D-29) | `4f40d90` (RED), `fe7f9e9` (GREEN) | src/audio.ts, src/feedback.ts, src/render.ts, src/main.ts, tests/r218-presentation.test.mjs, tests/r214-presentation.test.mjs, tests/r216-presentation.test.mjs, tests/r217-presentation.test.mjs |

## What was built

- **CURV and Track (`import-original.mjs`, `core.ts`)** — `parseCurve` reads `count, float x, float y, uint8 A, uint8 B` then `(count − 1) × { int8 dx, int8 dy, uint8 A, uint8 B }` (dx, dy in 1/100 px, 0x417b5e–0x417c2b); flags = `(A ? 1 : 0) | (min(3, B) << 1)`; returns `trailing` (0 on all 25 curves; the importer warns otherwise and writes the same JSON shape). `TrackPoint` JSDoc, `tunnelAt` (bit 0), `priorityAt` (bits 1–2, 0 outside), `ballPriority(s, radius = 16)` = max of the two edges (not a window), `nearest(p, skipTunnel)` ignores segments whose two vertices are tunnel points (`{ s: 0, dist: Infinity }` when nothing is left). `moveProjectiles` skips balls with `tunnelAt(b.s)` (0x408f52); `trackGap` uses `nearest(p, true)`.
- **Extra lives (`core.ts`)** — private `grantLives(old)`: `⌊score / every⌋ − ⌊old / every⌋` lives, `emit('extra-life', { lives, count })`, called by `addScore` and `creditBonus` (the STATS count-up goes through AddScore in the original, 0x440b00); `CANDIDATE.extraLifeEvery = 50 000`, 0 disables; no cap.
- **Coins (`core.ts`)** — `lastCoinTick` (init `coinFirstTicks − coinRetryTicks`, reset by `setTreasure`, set by `placeCoin` only); `tickCoin`: vanish at `until`; otherwise, outside ZUMA and `tick − lastCoinTick ≥ 780`, one draw `rng.next() < 1/180`, then up to `2 n` `rng.int(n)` point draws, the first free point gets the coin. `treasureFree`: dist 0 → free, else `⌊100 × head / length⌋ ≥ dist` with head = most advanced ball of the chain, no ball → not free. `setTreasure` bounds dist to 0..100. `coinMinGapTicks` / `coinMaxGapTicks` / `scheduleCoin` removed; an empty list still never draws.
- **Tally (`core.ts`)** — `lastDestroy: Array<number | null>` per chain (`destroyRun`: middle of the run; bomb: most advanced victim of each chain) + `lastDestroyChain`; `startClearing` builds `CleanupMarker { chain, s, step, steps }` per chain (`from = lastDestroy ?? 0`, `steps = ⌈(length − from) / 60⌉`, `s0 = length − steps × 60`), `Cleanup.steps` = longest; `clearing` carries `markers: [{ chain, x, y, steps }]` and the point of the last explosion's marker; `tickCleanup` advances every marker with steps left at each shared step (+100 each, `cleanup` per marker with `s` added for the sparkle layer), one shared pop clock, `won` 30 ticks after the longest marker's last step.
- **Render (`render.ts`, `original.ts`)** — `drawPasses(balls, cutouts)` (pure, generic, priorities truncated and bounded 0..4, non-finite → 0); `draw()`: background → overlays → holes → for L = 0..4: cutouts of L, bursts of layer L (no layer → 4), balls of L of every chain (settled, then growing), explosions of L → coin → projectiles → frog → floats → HUD. `drawChain` / `drawEffects` split into `boardBalls`, `drawBoardBall`, `drawExplosions`, `drawBursts`, `drawFloats`; `drawBall` unchanged. Vector board lids on `layers[i] & 1`. `DrawableLayer.priority` via `layerPriority` (overlays 0).
- **Menu (`menudialog.ts`, `main.ts`, shell)** — final layout (logical px): frame `{120, 84, 400 × 390}`, GodHead at `(242, 1)` (frame.y − 83), title baseline 162, rule y 172 (x 150–490); `music` `{280, 178, 205 × 33}` (disabled, 45 % opacity), `sfx` `{280, 214, 205 × 33}`, `fullscreen` `{150, 250, 160 × 46}`, `pixels` `{320, 250, 160 × 46}`, `help` `{150, 300, 340 × 48}`, `main-menu` `{150, 350, 340 × 48}`, `back` `{150, 404, 340 × 48}`; help view: text area x 146–494 / y 186–396, `help-done` on the footer rect; confirm view: body baselines 282 / 302, `leave` `{150, 404, 164 × 48}`, `cancel` `{326, 404, 164 × 48}`. Pack drawing: dialogbox 9-slice, GodHead, NativeAlienExtended18 title × gold, Cancun12 labels (yellow, white when lit), `slidertrack` / `sliderthumb` at their logical size (thumb at `x + v × (w − thumb)`), `checkbutton` left half = checked (purple tick) / right half = unchecked (green) — measured on the pack picture, `DialogButton` in three slices (22 px edges) with its normal / hover / pressed states and the STATS label baseline. Vector fallback on the same canvas and rectangles. `main.ts`: `loadMenuKit` after the STATS kit, `upscaleMenuKit` in `applyHd`, `openMenu` (refused with the STATS or while loading; `stopLoops`, focus `back`), `closeMenu`, `renderMenu` (child `canvas.menu-picture` of `#menu` at `renderer.scale`, recomposed on resize / fullscreenchange / state change), pointer hover (focus follows it) / press / slider drag with capture / activation on release, `menuKey` (Escape, Enter / Space, Up / Down over enabled widgets, Left / Right ± 0.1 on Sons), `setSfx` persisted `zuma.sfx`, `menuActivate` (fullscreen guarded, pixels, help, confirm, leave → `newGame()`, back). `#build` removed (badge in the help view). `index.html` `#menu` empty; `.menu-panel` rules gone, `#menu { background: transparent }` and `.menu-picture` added; `MODULES` and `sw.js` gain `menudialog` after `render`.
- **Input and scaling (`render.ts`, `main.ts`, `style.css`)** — `stagePoint(clientX, clientY, rect)` (multiply-then-divide, clamped, degenerate → centre); `fitScale(w, h, dpr, pixelated)`; `bindInput`: `contextmenu` / `pointermove` / `pointerdown` on `window` (ignored under the dialogs and while loading), button 2 → swap, touch-only `hitTest`, left click → shoot anywhere (resume when paused); keydown: menu → `menuKey`; live STATS → Tab / Enter / Space / Escape close it like OK; else Space / Enter / NumpadEnter / Escape → `toggleMenu`, Tab → `openStats('live')`, P → pause, M → mute. `applyScaling`: `--k` + class `sized` in both modes, `renderer.resize(640 k, dpr, pixelated)`. CSS: `.stage.sized` sized by `--k`, 4:3 fallback before, `image-rendering: pixelated` only in « Pixels nets ». The built-in tip about Space swapping now says right click.
- **Audio and HUD (`audio.ts`, `feedback.ts`, `render.ts`, `main.ts`)** — constants and `rampPlan` with `ROLLING_ATTACK_SECONDS`; `clampPan`; `output(pan)` = a `StereoPannerNode` feeding the master when panned and `createStereoPanner` exists, else the master; `play` / `synth` routed through it; synth entries for `extralife`, `coinappear`, `coinvanish`. `soundCues`: `extra-life` → three `extralife` (delays 0 / 0.3 / 0.6), `coin-appear` 0.4 and `coin-vanish` 1 with `pan = clamp(±0.3)((x − 320) / 320 × 0.3)`. `lifeIcons(lives, cap = 3)` for the menubar (3) and the vector HUD (6, « +N » now drawn there too). `bonusStep` and `closeStats` call `handleEvents(engine.drainEvents(), engine)` right after `creditBonus`; no `extra-life` text.

## Verification

- `npm test` → **212/212** + `publication guard: 505 tracked files, none proprietary`; `npm run check` clean; every task `<verify>` gate passed (Task 1 greps + node check of `underover.json`; Task 2 greps; Task 3 `drawPasses` / `ballPriority` greps + both captures; Task 4 greps + `dist/js/menudialog.js` + no DOM panel; Task 5 greps + logs; Task 6 `--local` / `--standalone` / `R2.0.18` / r215-presentation / guard). No `.png`, `private_assets/`, `dist/` or `standalone/` in Git; no model identifier in any committed file.
- **Re-import** (`npm run import`, backup `scratchpad/pack-before-r218`, `shots-r218/reimport.log`): 22 levels, 25 curves, 40 sounds, 40 m4a, 82 images (+6: `slidertrack`, `_slidertrack`, `sliderthumb`, `_sliderthumb`, `checkbutton`, `_checkbutton`), 5 fonts, 215 strings; no file lost; changed: `pack.json` (`generatedAt`, the six image keys) and the ten curves that have flags. `underover.json`: A on points **155–292** and **557–760**, B on **0–123** and **960–2665** (0-based; the spike's 156–293 / 558–761 / 1–124 / 961–2665 came from the old one-point-shifted reader); `points[200]` = 1, `[600]` = 1, `[400]` = 0, `[2000] >> 1` = 1, `[50] >> 1` = 1. **No level has B ≥ 2** (max B = 1 everywhere). Curves with flags: coaster, groovefest, inversespiral, loopy, overunder, serpents-1/-2, spaceinvaders, tunnellevel, underover.
- **2-2 before / after** (`scratchpad/tunnel-evidence.mjs`, Chromium 1000 × 750 CSS, DPR 2, scale 3.125, `?level=2-2&debug=1`, `go` at tick 103): before (R2.0.17 renderer, old pack) at tick 348: 59 alive, 58 on the track, **32 skipped** (`layerAt & 2`), 11 with bit 0; at tick 886: 66 on the track, **40 skipped**. After at tick 347: 58 on the track, **58 drawn** — 26 in pass 0, 32 in pass 1, 11 in tunnels; at tick 878: 66 drawn (26 / 40), 11 in tunnels; console clean. Files: `tunnel-before-2-2[-late].png`, `tunnel-after-2-2[-late].png`, 4 × crops `*-left-x4.png` (x 0–140, y 118–330) and `*-right-x4.png` (x 311–640, y 0–110), logs `tunnel-{before,after}-2-2.log`.
- **2-2 visual verdict (pictures looked at)** — before: the whole inner spiral is missing (bottom, right side, top), balls look truncated at the top right and at the left. After: the chain is continuous; at the top right the outer balls of 155–292 show only through the holes of the `right` stencil (they pass under the scenery) while the inner spiral's big blue balls cross over the same zone; on the left the outer balls of 557–760 show through the `left` stencil holes and the inner spiral (priority 1) passes fully drawn over the cutout. No ball vanishes anywhere else.
- **Menu** (`scratchpad/menu-evidence.mjs`, 1000 × 750 DPR 2, level 1-1): `renderer.scale` 3.125, child canvas **2000 × 1500** (CSS 1000 × 750), menu kit and STATS kit `pixelScale` **2**, compose 0.5–1.1 ms; `engine.tick` 125 → **125** after 2 s open (paused); hover « Aide » → hover state (purple) and focus follows; click → help view; Escape → back to the menu view (still open); « Retour au menu principal » → confirm view; ANNULER → menu; Sons dragged to 0.3 → `audio.volume` 0.3, `zuma.sfx` "0.3"; Down cycles fullscreen → pixels → help → main-menu → back → sfx (music skipped); Enter on back closes, the engine runs again; Pixels nets clicked in the menu → recomposed at scale 1 (640 × 480 canvas, kit 1 ×); console clean. Vector run (dist without the pack): same layout drawn on the canvas; the only console lines are the expected 404s of `assets/pack.json` / `sounds/manifest.json`. Files: `menu-dpr2.png`, `menu-hover.png` (+ crop), `menu-pressed.png` (+ crop), `menu-help.png`, `menu-confirm.png`, `menu-slider.png`, `menu-pixelated.png`, `menu-vector.png`, logs `menu-pack.log`, `menu-vector.log`.
- **Menu visual verdict** — it reads as a native Zuma dialog: carved stone 9-slice frame with the GodHead on top, gold NativeAlien title « MENU », Cancun labels, the original stone slider track with the purple thumb, the round check buttons, green pill DialogButtons turning purple on hover / focus; Musique visibly greyed; the help view lists the controls on three lines, three pack tips and the build badge inside the frame; the confirm view shows « QUITTER LA PARTIE ? », the two-line question and Quitter / ANNULER. The vector fallback is a dark rounded panel with the same widgets — no DOM panel in either case.
- **Input** (`scratchpad/input-evidence.mjs`, 1440 × 900 DPR 2, `aim-edge.log`): canvas at x 120–1320; mouse in the left margin (20, 450) → aim (0, 240); (20, 10) → (0, 5.33) (above the HUD band); (1430, 890) → (640, 474.67); click in the margin → `fire`; right click → `swap`; click on the menubar MENU button → `fire`, menu stays closed; Space / Enter / Escape each open then close the menu; Tab opens then closes the live STATS; P pauses then resumes; no swap by keyboard; console clean.
- **Window sizes** (`window-sizes.log`, DPR 2): 1440 × 900 « Pixels nets » → `--k` **1.5**, canvas CSS **960 × 720**, store 640 × 480, `image-rendering: pixelated`, assets 1 ×; smooth → `--k` **1.875**, CSS **1200 × 900**, store 2400 × 1800 (scale 3.75), assets 2 ×. **1000 × 750** « Pixels nets » → `--k` **1.5**, CSS **960 × 720** (3 device px per logical px; R2.0.17 gave 640 × 480), store 640 × 480; smooth → `--k` **1.5625**, CSS **1000 × 750**, store 2000 × 1500 (scale 3.125), assets 2 ×. Visual verdict: with « Pixels nets » the playfield now fills the 1000 × 750 window except a 20 px band on each side and 15 px top / bottom, crisp; without it the window is filled. Files: `pixels-1440x900-dpr2.png`, `smooth-1440x900-dpr2.png`, `window-1000x750-dpr2.png`, `window-1000x750-dpr2-pixels.png`.
- **Audio / lives** (`scratchpad/audio-evidence.mjs`, autoplay allowed, level 1-1): `extralife.log` — score set to 49 999 then a real match (30 points) at tick 486: `extra-life { lives 4, count 1 }` at the **same tick** as `destroy`, lives 3 → 4, HUD lives 4; cues `extralife` gain 1 rate 1 delays **0 / 0.3 / 0.6**, `AudioBufferSourceNode.start` offsets **+0 / +0.3 / +0.6 s**; `extralife-hud.png` shows three frogs + « +1 ». `coin-audio.log` — coin at x 576: cue `coinappear` gain **0.4**, pan **0.24**, `StereoPannerNode.pan` **0.24**. `rolling-fade.log` — cruise gain **0.35** constant; after `stopTicks = 180`: 0.307 @ 58 ms, 0.265 @ 113, 0.224 @ 177, 0.181 @ 237, 0.118 @ 321, 0.062 @ 407, 0.021 @ 466, **0 @ 521** (linear 0.35 → 0 in ≈ 500 ms); rolling again at 0.35 three seconds later; P → loop released at once (`loops.size` 0). Console clean.
- **Two-chain tally** (`scratchpad/tally-evidence.mjs`, level 1-5 `blackswirley`, last explosions forced at 60 % / 30 %): markers 17 and 30 steps; step k of both chains at the same tick (+12, +15, +17, +20 …); 17 / 30 `cleanup` events; `won` 112 ticks after clearing (= ⌈12 + 2.4 × 29⌉ + 30); `tally-two-chains.png` shows both trails of « +100 » and sparkles advancing together.
- **Standalone** — `node tools/build.mjs --standalone` → `standalone/zuma-standalone.html` **7 806 137 bytes** (7.4 MiB, +54 824 vs R2.0.17), 4 literal `R2.0.18`; `scratchpad/standalone-r218.mjs` boots it from `file://` on `?level=2-2&debug=1`: level `underover` 2-2, « PARTEZ » (go tick 103), 52 balls, scale 3.125, assets / STATS kit / menu kit 2 ×, menu opened by Escape, help view with badge `R2.0.18 · 2.0.18+20261010T204025 · ressources originales`, **console clean** (`standalone-r218.png`, `standalone-r218-go.png`, `standalone-r218.log`). `dist/js/menudialog.js` present, `dist/sw.js` precaches it, r215-presentation bundle locks (no duplicate top-level identifier, single-script parse) green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pack fonts have no « · » and a blank « / » in the help view**
- **Found during:** Task 4 (looking at `menu-help.png`).
- **Issue:** the separators of `CONTROLS_HELP` and of the badge vanished (`measure('·') = 0` in all five fonts; Arial12Bold's « / » draws nothing) and the badge overflowed the frame.
- **Fix:** controls drawn binding by binding on as few lines as fit, joined by wide spaces, « / » → « , »; badge « · » → « - », wrapped in the smallest font and bottom-aligned inside the frame. `CONTROLS_HELP` itself is unchanged (locked).
- **Files modified:** src/menudialog.ts. **Commit:** `a9a5893`.

**2. [Rule 1 - Bug] Two lit buttons on hover**
- **Found during:** Task 4 (`menu-hover.png`: « Aide » hovered and « Retour à la partie » focused were both purple).
- **Fix:** the keyboard focus follows the pointer hover. **Files:** src/main.ts. **Commit:** `a9a5893`.

**3. [Rule 3 - Blocking] r217 count-up lock read the first compiled `addEventListener('pointerdown'`**
- **Found during:** Task 5 (the new window handler came first in `main.js`).
- **Fix:** `bindInput` is now defined after `bindPanels` (pure reordering), the lock is untouched.
- **Files modified:** src/main.ts. **Commit:** `ac81cfe`.

**4. [Rule 1 - Bug] `stagePoint` rounding** — `(300 − 50) / 960 × 480` gave 125.00000000000001; computed as `(Δ × 480) / height`. **Commit:** `ac81cfe`.

### Plan adjustments (documented, no rule weakened)

- **Coin after a grab:** the plan's « pas avant t + 780 » (t = grab tick) contradicts D-28 « 780 ticks depuis la dernière apparition (même ramassée) » and the spike (the deadline is not moved by a grab); locked as: next coin exactly at appearance + 780 with `coinChance 1`, also when grabbed 20 ticks after the spawn.
- **`cleanup` event carries `s`** (core.ts, Task 3) so the sparkle layer is `ballPriority(s)` without a nearest-point search (which would pick the wrong crossing on self-intersecting curves like 2-2).
- **`parseCurve` returns `trailing`**; the importer strips it from the JSON and warns when it is not 0 (0 on every curve).
- **`setTreasure` arms the first attempt relative to its call tick** (`tick + 180 − 780`); `main.ts` calls it at the level start, so « 180 ticks after the level start » holds.
- **r214-presentation `ROLLING_GAIN` lock** (not in the plan's file list) updated to 0.35 with an « R2.0.18 (D-29) » comment — the rule it locked is replaced.
- **Own RED test fixed in GREEN:** the StereoPanner guard regex accepted only `=== 'function'`; it now accepts the negated form used by the code (same intent).
- **Confirm view** uses the menu frame (same size) rather than a smaller dialog; buttons side by side on the footer row.
- **Help view** shows as many pack tips as fit (3 of 7 at the tip font) — the font that shows the most tips is chosen among Arial12Bold / Cancun10 / Cancun12.
- **`#menu` overlay without dimming** (`background: transparent`), like the original STATS overlay.
- **Enter / Space on a focused slider** do nothing (sliders move by pointer or Left / Right).
- **Synth fallbacks** added for `extralife`, `coinappear`, `coinvanish`; the vector HUD now writes « +N » beyond six frogs.
- **Evidence:** `extralife.log` uses score 49 999 (any match crosses) rather than 49 990; the match is a real shot at a same-colour pair.

## Hypotheses carried into the code (for 05-11)

| # | Hypothesis | Where |
| --- | --- | --- |
| C1 | Right click = swap (not located in the original; Space pauses there) | `bindInput` JSDoc, `CONTROLS_HELP` |
| C2 | Cutouts are stencils of the background (only `_left.gif` / `_right.gif` masks exist) | `levelArt` comment |
| C3 | Pan unit of 0x401d40 = DirectSound ±10 000 → ±0.3 | `soundCues` comment |
| C4 | `FONT_DIALOG` (system font) replaced by Cancun12 for the labels | menudialog.ts |
| new | GodHead above the MENU like the STATS; `LAY_*` margins not decoded (proportions of the STATS) | `MENU_LAYOUT` JSDoc |
| new | Checkbutton halves: left = checked, right = unchecked (measured on the picture) | `NativeMenuPainter.check` |
| D-24 | Music slider inert (no music before phases 6–7); « Retour au menu principal » → confirmation → new game (no main menu before phase 6) | `menuWidgets`, `menuActivate` |
| D-26 | HUD MENU / STATS answer touch only (keyboard-less devices) | `bindInput` |
| D-29 | One rolling loop for all chains (the original has one per curve) | `ROLLING_GAIN` JSDoc |
| D-30 | Simultaneous markers (research §7 reads a sequential tally with +50 maj between curves) | `startClearing` JSDoc |
| D-27 | Display cap of three frogs in the menubar (+N beyond); the engine has no cap | `lifeIcons` JSDoc |
| — | `Ball::Draw` skipping tunnel balls not verified (no effect: the cutout covers them) | spike 03 |

## Open points for 05-11

- `R218_RELEASE_NOTES.md`, README (controls table, menu, « Pixels nets » in device pixels, coins, lives, tally), CONCERNS (hypotheses above, the plan adjustments, B ≤ 1 in every pack curve), `05-UAT.md` seventh session with U26–U33 checks (2-2 tunnels left / top right, menu look and keys, window size at 1000 × 750 with « Pixels nets », extra frog sound, coin frequency / volume / pan, rolling fade, two-chain tally on 1-5).
- Cosmetic, not fixed: the menubar « +N » overlaps the third frog by ~3 px; the GodHead of the MENU / STATS covers the HUD score (already noted in deferred-items); the tally « +100 » in CancunFloat14 keeps its own colours (tint ignored by colour fonts, pre-existing).
- Not implemented (out of scope): the original hides the balls while paused (0x42db5a); help paging for the four remaining tips; music slider (phases 6–7).

## Known Stubs

- `music` slider is intentionally inert and greyed (orchestrator-approved; no music before phases 6–7) — `src/menudialog.ts` `menuWidgets`, `src/main.ts` `menuActivate` default branch.

## Threat Flags

None beyond the plan's register: T-05-28 (B bounded to 3 at import, priority on 2 bits, passes bounded 0..4 / non-finite → 0 — r218 + r218-presentation), T-05-29 (one attempt draw per tick, ≤ 2 n point draws, no draw without TreasurePoints, dist 0..100), T-05-31 (`setVolume` bounded, non-finite → 1, storage in try/catch), T-05-32 (preventDefault only on handled keys, fullscreen only from pointerup / keydown and guarded, menu and STATS exclusive), T-05-33 (pack strings drawn by the bitmap font or `fillText` on canvas, never `innerHTML`), T-05-34 (`clampPan` −1..1, `clampDelay` 0..1, three cues per `extra-life`).

## Self-Check: PASSED

Files (3 created / 20 modified) and the 12 commits above verified on disk / in `git log` on 2026-10-10; 212/212 + guard; 42 captures / logs under `scratchpad/shots-r218/`; nothing proprietary, no capture, no build output tracked; STATE.md / ROADMAP.md / README / release notes untouched by instruction.
