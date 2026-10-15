---
phase: 05-regles-originales-completes
plan: 08
subsystem: engine + presentation
tags: [gap-bonus, match-score, chain-bonus, floating-texts, stats-dialog, count-up, rolling-ramp, epx-upscale, hd-assets, sharpness]

# Dependency graph
requires:
  - plan: 05-05
    provides: engine events (destroy / gap / streak), stats, levelScore gauge, timeBonus / creditBonus
  - plan: 05-06
    provides: statsRows / STATS_LAYOUT / composeStatsDialog, bonusCountUp / bonusPopRate, setLoop ramps, BitmapFont.capHeight
  - plan: 05-07
    provides: deferred-items.md (rolling fade re-armed every frame), Playwright evidence scripts in the scratchpad
  - doc: 05-RESEARCH-02.md
    provides: gap bonus formula and payment (Q1), match / combo / chain score (Q2), STATS count-up without fast mode (Q3), dialog geometry (Q4)
provides:
  - "core.ts : gapBonusPoints(minWidth, gaps) (pure, exported), Projectile.gapMinWidth, Ball.gapBonus / gapCount armed by land() and paid by destroyRun (kept on a waiting ball, cleared otherwise), points = 10 × n + 100 × (depth − 1) + gap + chainBonus, chainBonus = (chain + 5) × 10 from the 5th consecutive direct hit, events destroy { points, gapPoints, gapCount, chainBonus, streak } / gap { count, points } (with the match) / streak { streak, points }, stats.gaps per match, ENGINE_VERSION 2.0.17"
  - "feedback.ts : SoundCue.delay, gap cues at 0 / 0.15 / 0.3 s (+0 / +2 / +3 semitones), ballCss(color)"
  - "audio.ts : clampDelay, play() starts at now + delay (synth envelope shifted), rampPlan(previous, target), Loop.target — ramp armed once per target change"
  - "main.ts : « +N » in the ball colour, « COMBO x{depth} », « BONUS SAUT / DOUBLE / TRIPLE » without amount, « ENCHAÎNEMENT x{chain} » (pack strings first); count-up timer chain with bonusCountStep / BONUS_FAST_STEP and the pointerdown fast mode; STATS shown as a child canvas composed at renderer.scale; baseAssets / hdAssets / statsKitBase / statsKitHd and applyHd()"
  - "statsdialog.ts : statsRows on one grid (TEMPS / POINTS … RECORD / ENCH. MAX., rule in the PIÈCES row), layoutTip(text, maxWidth, measure, measureSmall, ellipsis), StatsKit.fonts.tipSmall, bonusCountStep, BONUS_FAST_STEP, bonusCountUp(total, ms, step), composeStatsDialog(kit, values, options, canvas, scale), drawNineSlice(…, sourceScale), StatsKit.pixelScale, upscaleStatsKit"
  - "bitmapfont.ts : normalizeGlyphAlpha (pure, exported) applied per rect by luminanceToAlpha, BitmapFont.pixelScale / upscaled() / 2 × glyph cut, loadBitmapFont memoised per pack and key"
  - "upscale.ts (new) : RawImage, upscale2x (Scale2x / EPX, pure, DOM-free), upscaleBitmap (memoised per source, null when unreadable)"
  - "original.ts : upscaleSheet(sheet, image) ; render.ts : HD_MIN_SCALE 1.5, RenderAssets.pixelScale, Renderer.scale, shadow / icons / menubar drawn at their logical size"
  - "tools/build.mjs MODULES with upscale, public/sw.js precaches upscale.js + bitmapfont.js + statsdialog.js, public/style.css .stats-picture rule"
  - "tests/r217.test.mjs (11 tests, 300 lines) and tests/r217-presentation.test.mjs (22 tests, 496 lines) ; r213 / r214 / r215-presentation / r216 / r216-presentation adjusted with « R2.0.17 » comments"
affects: [05-09 (release notes R2.0.17, README, CONCERNS hypotheses, UAT verdicts U22–U25), phase 6 (HD assets and the upscale filter reusable for the menu)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deferred payment of a bonus: computed at the event that earns it, armed on the entity (Ball.gapBonus), paid by the event that consumes it (destroyRun), cleared by the rule that forfeits it (settle) — every step locked by a fixture"
    - "Presentation schedules stay pure functions (bonusCountStep / bonusCountUp / rampPlan) evaluated by a single live timer or by the audio clock; the DOM only decides when"
    - "HD assets are a second, lazily built RenderAssets / StatsKit (all or nothing per set) selected by one function (applyHd) from the backing-store scale; drawing code only divides by assets.pixelScale"
    - "Pure pixel filters (normalizeGlyphAlpha, upscale2x) are exported and locked on synthetic Uint8ClampedArray pictures; the canvas wrappers return null on failure"

key-files:
  created: [src/upscale.ts, tests/r217.test.mjs, tests/r217-presentation.test.mjs]
  modified: [src/core.ts, src/feedback.ts, src/audio.ts, src/main.ts, src/statsdialog.ts, src/bitmapfont.ts, src/original.ts, src/render.ts, public/style.css, public/sw.js, tools/build.mjs, package.json, tests/r213.test.mjs, tests/r214.test.mjs, tests/r215-presentation.test.mjs, tests/r216.test.mjs, tests/r216-presentation.test.mjs]

decisions:
  - "D-22 implemented from the spike: the gap bonus is a property of the inserted ball (gapBonusPoints of the narrowest gap × gaps), paid only by a match; a ball landed against its colour keeps it, any other ball loses it; the « waiting ball keeps the chain alive » refinement (+0x32) is NOT implemented (chain resets without a match)"
  - "Match score 10 × n + 100 × combo + gap (+ (chain + 5) × 10 on a direct match from the 5th hit): the +10 × (n − 3) and 50 × (streak − 4) rules of R2.0.14 are gone; the gauge keeps receiving every point"
  - "D-21 as a deliberate deviation: the original counts +100 every 10 updates with no acceleration; the step is bounded (multiple of 100 ≥ total / 20 above 2 000) and a press on the dialog outside OK switches to the original's 2 500-per-step gauntlet value"
  - "D-19: the STATS is composed once at the backing-store scale into a child <canvas class=stats-picture> of .zuma-stats (no PNG, no inline background — D-01's « no url( in CSS, one OK » preserved); from scale 1.5 outside « Pixels nets » the fonts, dialog pieces, button, ball sheets, shadow, power icons and menubar are 2 × EPX copies drawn at their logical size; level art, holes, lid, frog, coin, gauge and explosions stay 1 × bilinear"
  - "The « + » tint bug (U23) had cause (a) of the plan: the Cancun12 mask peaks at alpha 187 for « + » (digits 255); fixed by normalizeGlyphAlpha per rect inside luminanceToAlpha — layer order and char map were correct"
  - "Tip ellipsis: no pack font defines U+2026 (skipped by the layout), so composeStatsDialog passes « ... » when « … » cannot be measured"
  - "loadBitmapFont is memoised per pack and key so the HUD and the STATS kit share one BitmapFont (and its 2 × pictures / tint atlases): 18.5 → 16.3 MiB of 2 × pictures"

metrics:
  duration: "~28 min of commits (18:08 → 18:33 UTC, after ≈ 20 min of reading and diagnosis)"
  completed: 2026-10-10
  tasks: 6
  commits: 12
  tests: "176/176 (was 142/142; r217 +11, r217-presentation +22, r216 baseline test kept)"
---

# Phase 5 Plan 08: Original score, STATS grid, bounded count-up and sharpness — Summary

The four findings of UAT 5 are delivered with the rules read in `Zuma.exe` by spike 02: the gap bonus is now computed at the insertion from the narrowest gap crossed (500 down to 10 points per gap, × 2 / × 3), armed on the ball and paid only by the match that destroys it (U25, D-22); a match scores `10 × n + 100 × combo + gap`, plus `(chain + 5) × 10` from the 5th consecutive direct hit, with the original texts « +N » in the ball colour, « COMBO x », « BONUS … SAUT » and « ENCHAÎNEMENT x » and `gapbonus1` repeated at 150 / 300 ms; the STATS right column sits on the left grid with a bonus sign as bright as its digits and a two-line left-aligned tip (U23, D-20); the ACE TIME count-up takes ≈ 2 s at most, 2 500 per step after a press on the dialog, OK settling the rest (U24, D-21); the rolling fade is a clean 150 ms ramp armed once per target change (deferred item of 05-07); and above a 1.5 × backing-store scale the dialog is composed once at the canvas scale while fonts, dialog pieces, button, balls, shadow, icons and menubar are 2 × EPX copies drawn with smoothing (U22, D-19). Baseline 2.0.17, 176 tests green, standalone 7.4 MiB booting from `file://`.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Engine: gap bonus paid by the match, original match / chain score, baseline 2.0.17 (D-22, Q1–Q2) | `9607040` (RED), `31c1c62` (GREEN) | src/core.ts, package.json, tests/r217.test.mjs, tests/r213.test.mjs, tests/r214.test.mjs, tests/r216.test.mjs |
| 2 | Score presentation: original labels, « +N » in the ball colour, delayed gap cues | `890cd15` (RED), `64e8796` (GREEN) | src/feedback.ts, src/audio.ts, src/main.ts, tests/r217-presentation.test.mjs |
| 3 | STATS grid, bonus sign tint, single formatter, two-line tip (D-20, U23) | `2d35796` (RED), `ab95aa4` (GREEN) | src/statsdialog.ts, src/bitmapfont.ts, tests/r215-presentation.test.mjs, tests/r216-presentation.test.mjs |
| 4 | Bounded count-up with fast mode, rolling ramp once per target (D-21, U24, deferred) | `4259656` (RED), `9bf8c2c` (GREEN) | src/statsdialog.ts, src/main.ts, src/audio.ts, tests/r216-presentation.test.mjs |
| 5 | Sharpness 1/2: `upscale2x`, STATS composed at the canvas scale in a child canvas, bundle / precache (D-19) | `d250b8e` (RED), `bff5a66` (GREEN) | src/upscale.ts, src/statsdialog.ts, src/render.ts, src/main.ts, tools/build.mjs, public/sw.js, public/style.css, tests/r215-presentation.test.mjs |
| 6 | Sharpness 2/2: 2 × fonts, pieces, button, balls, icons, menubar from scale 1.5; before / after evidence (D-19) | `52d43de` (RED), `2676027` (GREEN) | src/bitmapfont.ts, src/original.ts, src/statsdialog.ts, src/render.ts, src/main.ts, src/upscale.ts |

## What was built

- **Engine (`core.ts`)** — `gapBonusPoints(minWidth, gaps)` = `max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀) × gaps` (0 when `gaps` < 1; NaN / negative width → 0 → 500; +∞ → 10). `trackGap` records `Projectile.gapMinWidth = min(next.s − prev.s − ballSpacing)` (hypothesis B1: px of track). `land()` arms `ball.gapBonus` / `gapCount` with no score, event or statistic. `settle()`: a match passes `chainBonus = streak ≥ 5 ? (streak + 5) × 10 : 0` to `destroyRun` and emits `streak { streak, points }`; without a match a ball in contact with its colour keeps the bonus (waiting ball), any other ball loses it; the chain resets in both cases. `destroyRun(…, chainBonus = 0)` sums the run's `gapBonus`, takes the max `gapCount`, clears both, scores `10 × n + 100 × (depth − 1) + gapPoints + chainBonus`, counts one SAUTS per match, emits `destroy { points, gapPoints, gapCount, chainBonus, streak, … }` then `gap { count, points }` at the same tick. `ENGINE_VERSION = '2.0.17'`.
- **Score presentation (`feedback.ts`, `audio.ts`, `main.ts`)** — `SoundCue.delay`; gap cues at 0 / 0.15 / 0.3 s (15 / 30 maj) with +0 / +2 / +3 semitones; `clampDelay` (0..1 s, T-05-24); `play()` starts the buffer at `now + delay`, the synth envelope is shifted by the same delay. `ballCss(color)` = `#rrggbb` of `PARTICLE_RGB`. `handleEvents`: « +points » tinted by the ball colour, « COMBO x{depth} » at −16 for a reaction, « BONUS SAUT / BONUS DOUBLE SAUT / BONUS TRIPLE SAUT » at −32 without amount, « ENCHAÎNEMENT x{chain} » at −48 — `strings.json` keys `COMBO`, `GAP_BONUS`, `DOUBLE_GAP_BONUS`, `TRIPLE_GAP_BONUS`, `CHAIN_BONUS` first.
- **STATS layout (`statsdialog.ts`, `bitmapfont.ts`)** — `statsRows`: `right.time = left[0]`, `objective = left[1]`, `rule = left[2] − round(0.35 lh)`, `bonus = left[3]`, `record = left[4]`. `layoutTip` wraps, retries with the smaller font (Cancun10 when Arial12Bold is the tip font — `StatsKit.fonts.tipSmall`), then cuts the second line word by word before the ellipsis; `STATS_LAYOUT.tip` = `{ labelX 150, gap 6, maxLines 2, align 'left', … }`, the text starts after « ASTUCE : » and uses the room left in the box (capped by `maxWidth`). `normalizeGlyphAlpha(data, width, rects)` raises each glyph whose alpha peaks under 255 proportionally; `luminanceToAlpha` applies it over the rects of the layers sharing the mask. One `formatSeconds` for TEMPS / OBJECTIF / RECORD (locked: one `padStart` in statsdialog.js, none in main.js).
- **Count-up and rolling (`statsdialog.ts`, `main.ts`, `audio.ts`)** — `bonusCountStep(total)` = 100 up to 2 000, else `ceil(total / 20 / 100) × 100`; `BONUS_FAST_STEP = 2500`; `bonusCountUp(total, ms, step = bonusCountStep(total))`. `main.ts` arms one timer at a time (`countTimers`, k-th step due `1000 + 100 k` ms after the opening) applying `min(total, shown + step)` with `bonusStep` (credit, `bonuspop`, refresh); a `pointerdown` on `.zuma-stats` outside `#result-continue` sets `statsBonus.fast`; `closeStats` still credits the remainder once. `rampPlan(previous, target)` returns null when the target is unchanged, else `{ to: target × ROLLING_GAIN, 0.05 s }` or `{ 0, ROLLING_FADE_SECONDS }`; `setLoop` cancels / ramps only when a plan exists and stores `loop.target`; the idle stop runs on every call.
- **Sharpness (`upscale.ts`, `statsdialog.ts`, `bitmapfont.ts`, `original.ts`, `render.ts`, `main.ts`, shell)** — `upscale2x` (EPX on `Uint32` views, input untouched, neighbours outside the picture = P); `upscaleBitmap` memoised per source picture, null when unreadable. `composeStatsDialog(kit, values, options, canvas, scale)` sizes the canvas `round(640 s) × round(480 s)` (`s` bounded 1..4) and draws in logical units after `setTransform(s)`; `main.ts` keeps the composed canvas as `<canvas class="stats-picture">` prepended to `.zuma-stats` (removed on close, recomposed on resize) — `preload` / `revokeUrl` / `backgroundImage` / `bitmapUrl` usage gone (`bitmapUrl` stays exported). `BitmapFont(script, images, maskOnly, pixelScale = 1, metrics?)`, `upscaled()` (all or nothing), glyphs cut at `g.* × k` and drawn at `g.sw × g.sh`; `upscaleSheet`; `StatsKit.pixelScale` + `upscaleStatsKit` (all or nothing); `drawNineSlice(…, sourceScale)`; head and button cut at `k`. `HD_MIN_SCALE = 1.5`, `RenderAssets.pixelScale`, `Renderer.scale`; shadow, power icons and menubar drawn at `size / k`. `buildHdAssets(base)` upscales exactly `balls`, `ballShadow`, `powers`, `menubar`, `fonts`; `applyHd()` (from `applyScaling`, after `loadAssets`, after the kit loads) selects `hdAssets` / `statsKitHd` when `!pixelated && renderer.scale ≥ HD_MIN_SCALE`. `MODULES` gains `upscale` before `original`; `sw.js` precaches `upscale.js`, `bitmapfont.js`, `statsdialog.js`; `.stats-picture` rule in `style.css` (no `url(`).
- **Tests** — `r217.test.mjs` (11): `gapBonusPoints` table and monotonicity, rectangle fixture (500 paid with the match, nothing at the insertion, waiting ball keeps 500 and the later match pays 1 000 as one gap, lost bonus on a foreign colour), double gap (64 / 100 px → 1 000, count 2), `gapMinWidth` / `insert()` hook, `10 × n` for runs of 3 / 4 / 5, depth 1 / 2 / 3 → 30 / 130 / 230, chain bonus 100 / 110 from the 5th hit with the `streak` event, reset by a miss, none on a reaction, baseline locks. `r217-presentation.test.mjs` (22): cue tables and delays, `clampDelay` and `play` locks, `ballCss`, `main.js` label locks, `statsRows` grid for lh 16..20 and the Q4 cross-checks, `formatSeconds` table and single-formatter locks, `layoutTip` (wrap, small font, ellipsis, `&cr;`, empty), `normalizeGlyphAlpha` on a synthetic picture, tip / mask locks, `bonusCountStep` / `bonusCountUp` / `BONUS_FAST_STEP` tables (every total 2 100..60 000 done by 2.9 s), count-up `main.js` locks, `rampPlan` table and `setLoop` locks, `upscale2x` (flat, edges, dot, diagonal vs nearest, alpha, no DOM), composition / child-canvas locks, bundle / precache / CSS, HD locks, `drawNineSlice` on a fake context, `upscaleSheet` in Node, ellipsis fallback, `loadBitmapFont` memoisation. Adjusted with « R2.0.17 » comments: r213 (gap fixture now matches, `gap.points === 40`), r214 (gap + four balls = 80 → `levelScore` 140 / 170), r215-presentation (labels 200 px apart, values inside their columns, tip 2 lines left, `upscale` in the module lists), r216 (baseline test now checks `> 2.0.16` and manifest agreement), r216-presentation (`statsRows` grid, `setLoop` → `rampPlan`, `bonusCountUp(24100, 1000)` → `+1300`, schedule lock on `bonusCountStep`).

## Verification

- `npm test` → 176/176 + `publication guard: 496 tracked files, none proprietary`; `npm run check` clean; every plan `<verify>` gate passes (Task 1 greps, Task 2 greps, `statsRows(18, 219)` node check, Task 4 greps, Task 5 greps + standalone + r215-presentation, Task 6 greps + standalone + capture files + no `.png` in `git status`).
- **« + » diagnosis (Task 3, `scratchpad/plus-glyph.mjs`, `shots-r217/plus-glyph-before.log`)** — Cancun12 layers: Shadow (baseOrder −1, offset (1, −1), mult (0, 0, 0, 0.75)) then Main; both map « + » to rect (754, 0, 8, 21) and « 1 » to (545, 0, 3, 21); `charMap` has no « + » entry. Mask red channel inside the « + » rect: max 187, mean of the 28 non-zero pixels 129 (24 in 64–127, 4 in 128–191, none at 255); « 1 »: max 255, mean 196 (16 pixels at 255). Drawn through `font.draw` with the BONUS tint `#2aff03`: « + » max alpha 224, mean alpha 134, 0 solid pixels, mean RGB (25, 149, 1); « 1 » max 255, mean 185, 16 solid, (27, 166, 2). After `normalizeGlyphAlpha`: « + » max alpha 255, mean 174, 4 solid, mean RGB (26, 157, 2); « 1 » unchanged (255 / 185 / 16 / (27, 166, 2)); crops `plus1234-crop-before.png` / `plus1234-crop-after.png`.
- **Sharpness evidence (Task 6, `scratchpad/sharp-evidence.mjs before|after`, Chromium 1.56 headless, viewport 1000 × 750 CSS, DPR 2, level 1-1)** — `renderer.scale` 3.125, canvas store 2000 × 1500; before: `assets.pixelScale` undefined, ball sheets 32 × 1504, menubar 640 × 480, STATS child canvas 2000 × 1500 (first child), `composeStatsDialog` 1.5–2.2 ms; after: `assets.pixelScale` 2, `fonts.text.pixelScale` 2, ball sheets 64 × 3008 (frames 64 × 64), menubar 1280 × 960, `statsKit.pixelScale` 2, frame 486 × 484, compose 0.8–1.6 ms (≈ 2 ms once) at 3.125 ×; « Pixels nets » on → scale 1 / `pixelScale` 1, off → 3.125 / 2 without reload; 2 × pictures: 40 pictures, 17 050 592 bytes = 16.26 MiB (menubar 4.69, six ball sheets 4.4, NativeAlienExtended18 2.22, Cancun12 1.53, dialogbox 0.90, CancunFloat14 0.63, Arial12Bold 0.38, GodHead 0.33, Cancun10 0.28, button 0.26, shadow + 24 icons ≈ 0.5); console clean. Files: `shots-r217/sharp-before-hud.png`, `sharp-before-stats.png`, `sharp-after-hud.png`, `sharp-after-stats.png` and the 4 × crops `*-hud-crop.png` / `*-stats-crop.png`, logs `sharp-before-evidence.log` / `sharp-after-evidence.log`.
- **Visual verdict (pictures looked at)** — the EPX « after » STATS is visibly crisper than the bilinear « before »: the labels, the title, the tip, the carved frame, the OK button and the balls have defined edges where the before was uniformly soft; at the 4 × crop the EPX glyph contours show a slight staircase on curves that is not visible at the real 1000 px size; nothing reads worse than bilinear, so EPX is kept as planned. The HUD score and level label are canvas vector text (already crisp); the menubar artwork gains slightly sharper spirals. The tip now ends with « ... ».
- **Standalone** — `node tools/build.mjs --standalone` → `standalone/zuma-standalone.html` 7 751 313 bytes (7.4 MiB), r215-presentation bundle locks green; `scratchpad/standalone-r217.mjs` boots it from `file://` headless: badge « R2.0.17 · … · ressources originales », level `spiral`, `go` at tick 89, 38 balls, scale 3.125, `pixelScale` 2, kit 2, console clean (`shots-r217/standalone-r217.png`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invisible tip ellipsis**
- **Found during:** Task 6 step 0 (the « before » STATS capture showed the second tip line cut with no « … »).
- **Issue:** no pack font defines U+2026 (`grep` on the five `.txt`): `layoutText` skips unknown characters, so the ellipsis chosen by `layoutTip` drew nothing.
- **Fix:** `layoutTip(…, ellipsis = '…')` parameter; `composeStatsDialog` passes `tipFont.measure('…') > 0 ? '…' : '...'`. Locked by « layoutTip ellipsis » in r217-presentation.
- **Files modified:** src/statsdialog.ts. **Commit:** `2676027`.

**2. [Rule 2 - Memory bound] `loadBitmapFont` memoised per pack and key**
- **Found during:** Task 6 evidence: 18.48 MiB of 2 × pictures (41) against the plan's « < 12 Mo » expectation; the HUD and the STATS kit each loaded their own `BitmapFont` for NativeAlienExtended18 / Cancun12, and a colour font's composed picture is a fresh canvas per load, so the 2.22 MiB title atlas was upscaled twice.
- **Fix:** `loadBitmapFont` returns one promise per `(pack, key)` (`WeakMap`); both consumers share the instance, its pictures and tint atlases → 40 pictures, 16.26 MiB. The remaining gap to 12 MB is structural: the menubar is a full 640 × 480 picture (4.69 MiB at 2 ×) and the six ball sheets are 32 × 1504 each (4.4 MiB) — see open points.
- **Files modified:** src/bitmapfont.ts. **Commit:** `2676027`.

### Plan adjustments (documented, no rule weakened)

- **`gapBonusPoints` and non-finite widths:** the plan's behaviour table wants `(NaN, 1) === 500` and `(Infinity, 1) === 10` while its prose says « non finie → 0 »; implemented as NaN / negative → 0 (→ 500) and +∞ → floor 10 (the table wins; `gaps < 1` → 0 makes the +∞ case unreachable from `land()`).
- **`STATS_LAYOUT.tip.maxWidth` kept** as a cap (`min(maxWidth, box room after the label)`) so the r215-presentation lock « tip fits inside the frame » keeps its meaning; `x` removed, `gap` / `align` added as planned.
- **`upscale.ts` is a leaf module** (own `blankCanvas` instead of importing `canvasOf` from `original.ts`), so `original.ts` → `upscale.ts` is the only runtime edge (the `Bitmap` import is type-only); no cycle, standalone concatenation unchanged.
- **r216-presentation locks re-pointed:** the `setLoop` body lock now expects `rampPlan(` and finds `ROLLING_GAIN` / `ROLLING_FADE_SECONDS` in `rampPlan`; the count-up lock expects `bonusCountStep(` in main.js (the timer chain applies `shown + step`, `bonusCountUp` stays the pure model); `bonusCountUp(24100, 1000)` → `+1300`.
- **r216 baseline test** (`ENGINE_VERSION === '2.0.16'`, not listed by the plan) kept as « superseded »: asserts `> '2.0.16'` and manifest agreement.
- **`buildHdAssets` completeness** is tracked by a flag set by each helper rather than compared afterwards; the test lock reads the block from `function buildHdAssets(base)`.
- **STATS kit 2 × is built by `applyHd()`** as soon as the base kit is loaded in HD (once, kept), not at the first opening — same cost, simpler single selection point.
- **No `debugState()` change was needed** for the « + » diagnosis: `window.__zuma.game.statsKit` is reachable at run time.

## Hypotheses carried into the code (for 05-09)

| # | Hypothesis | Where |
| --- | --- | --- |
| B1 | Gap width `w` of 0x40a810 is in px of track = free length between the two balls' edges (`next.s − prev.s − ballSpacing`) | `gapBonusPoints` JSDoc, `trackGap` |
| new | A waiting ball (landed against its colour) keeps its gap bonus but does **not** keep the chain alive (`+0x32` refinement not implemented): the chain resets on every shot without a match | `settle` JSDoc |
| B4 | Match sounds are not muted when the group triggered a power-up (`curve+0x7c` guard not implemented) | `soundCues` comment |
| new | « +N » colour = the ball colour as rendered (`PARTICLE_RGB`), the original table 0x587408 not extracted | `ballCss` JSDoc |
| B3 | STATS values right-aligned inside their column (0x45a430 alignment unknown); shared grid for both columns (exact y not read, Q4) | `statsRows` JSDoc, r215-presentation |
| D-21 | Bounded count-up step and click-to-fast are a deliberate deviation (the original never accelerates in adventure, Q3) | `bonusCountStep` JSDoc, `bindPanels` comment |
| new | `HD_MIN_SCALE` 1.5: below it the bilinear 1 × pictures are kept | `render.ts` |

## Open points for 05-09

- Release notes R2.0.17 / README « Réglages originaux » / CONCERNS: the seven rows above, the D-22 scoring tables (gap 500…10 per gap, combo +100 × depth, chain (chain + 5) × 10), the removed R2.0.14 rules (+10 × (n − 3), 50 × (streak − 4), 100 per gap at the insertion), the count-up deviation, the sharpness mechanism and its memory (16.3 MiB of 2 × pictures at scale ≥ 1.5).
- UAT verdicts U22–U25 to confirm by eye / ear on macOS Retina: EPX crispness (the staircase on curved glyphs at 4 × is not visible at 1 ×), gap bonus generosity (hypothesis B1), the 150 / 300 ms `gapbonus1` echoes, the ≈ 2 s count-up and the click-to-fast.
- Memory: the menubar 2 × copy (4.69 MiB) could be cropped to its opaque rows and the ball sheets could share one shadow; not done (D-19 did not ask for it, T-05-22 bound documented at 16.3 MiB).
- `deferred-items.md`: the rolling-fade item is resolved (`rampPlan`); the « HUD score under the STATS head » cosmetic note still stands.
- `05-UAT.md` fifth session: hypothesis « Compte à rebours sans mode rapide » is superseded by D-21.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-05-21 (non-finite / negative width → 0, `gaps` from distinct `gapKeys`, bonus cleared unless waiting — r217), T-05-22 (only the five asset groups are upscaled, built once, `getImageData` in try/catch → 1 × fallback, scale bounded 1..4, fonts memoised — r217-presentation), T-05-23 (each step bounded by `total − shown`, remainder credited once), T-05-24 (`clampDelay` 0..1 s, at most three gap cues) implemented and locked.

## Self-Check: PASSED

Files (3 created / 17 modified) and the 12 commits above verified on disk / in `git log` on 2026-10-10.
