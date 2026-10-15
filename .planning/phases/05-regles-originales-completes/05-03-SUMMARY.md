---
phase: 05-regles-originales-completes
plan: 03
subsystem: stats-screen
tags: [stats, native-dialog, 9-slice, bitmap-font, strings, best-time, localStorage, tdd]

# Dependency graph
requires:
  - plan: 05-01
    provides: bitmapfont.ts (BitmapFont.draw / measure, loadBitmapFont), pack.fonts, pack.strings → strings.json
  - plan: 05-02
    provides: engine.stats.coins, engine.timeBonus, engine.levelScore, 'clearing' state
  - plan: 04-04
    provides: index.html STATS structure (ids, one #result-continue), formatSeconds, Stats.combos
provides:
  - "src/statsdialog.ts : STATS_LAYOUT, STATS_COLORS, STATS_ORDER, TIP_KEYS, statsValues(), bestTime(), bestTimeKey(), formatSeconds(), wrapText(), loadStatsKit(), composeStatsDialog(), drawNineSlice()"
  - "src/original.ts : PackFont, PackData.fonts/strings, PackGraphics.treasure?, OriginalPack.strings(), bitmapUrl() exported (synchronous) ; statsArt/cleanStats/StatsLayout/StatsSlot/StatsArt/LayoutRect removed"
  - "src/main.ts : native openStats (composition, reveal + pop, three-state OK + button sound), best time per level under zuma.best.<id>, ResolvedLevel.id"
  - "tests/r215-presentation.test.mjs : 10 locks (layout, colours, values, best time, key, wrapText, picture-mode removal, importer, main.js source)"
affects: [05-04 (configFromSettings / setTreasure: PackGraphics.treasure is optional until the importer emits it), phase-7 (dialogs reuse drawNineSlice / StatsKit pieces)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dialog composed at run time on a 640×480 canvas from the original pieces (9-slice frame, head, button sheet, bitmap fonts) and laid as the inline background of the DOM panel; the stylesheet never references a picture"
    - "Synchronous canvas encode (toDataURL → Uint8Array → Blob → object URL) instead of toBlob; monotonic application of encoded frames, preload via Image before the swap, previous URL revoked after"
    - "Pure layout/value functions (STATS_LAYOUT, statsValues, bestTime, bestTimeKey, wrapText with injected measurer) locked in Node on .compiled/"

key-files:
  created: [src/statsdialog.ts, tests/r215-presentation.test.mjs]
  modified: [src/original.ts, src/main.ts, index.html, public/style.css, tools/import-original.mjs, tools/build.mjs, tests/r214-presentation.test.mjs, README.md, R215_RELEASE_NOTES.md]
  deleted: [tools/import-r212-stats.mjs]

key-decisions:
  - "9-slice source = the opaque sub-rectangle of dialogbox (x 11–239, y 0–230; the gif mask leaves transparent margins left and bottom), corner inset 36 px (carved corner blocks ≈ 34 px)"
  - "bitmapUrl is synchronous: toDataURL takes ~10 ms for a 640×480 PNG where toBlob's asynchronous encoder took ~1.1 s per frame in software-rendered Chromium (measured in-page); bytes rewrapped in a Blob so the style attribute carries only a blob: URL"
  - "A value too wide to sit beside its label (« PAS DE BONUS ») replaces the label on its row when revealed, as the original's NO_TIME_BONUS string does; no smaller font is loaded for it"
  - "PackGraphics.treasure declared optional (the importer does not emit it yet); 05-04 must write graphics.treasure ?? [] — a required field would have lied to tsc and crashed setTreasure(undefined)"
  - "Title drawn with the gif's own beige-stone tint (D-02 as written); a colour-multiply option on colour fonts would be needed for a golden title like the R2.0.12 picture"
  - "#results-title is always strings.STATS / « STATISTIQUES » (plan); the vector OK label still says Niveau suivant / Réessayer / Nouvelle partie / OK"
  - "The score record zuma.best (04-04) is no longer read or written: RECORD is a time (D-04)"

requirements-completed: [GAME-03, GAME-04]

# Metrics
duration: ~45 min
completed: 2026-10-10
tasks: 3
commits: 5
tests: "86 → 95 (r215-presentation 10 locks added, 1 r214-presentation lock removed), guard clean (476 tracked files), tsc --noEmit clean"
---

# Phase 5 Plan 03: Écran STATS natif composé depuis les ressources originales — Summary

**With the pack, the STATS screen is now composed at run time on a 640×480 canvas from `dialogbox` (9-slice), `GodHead`, the three-state `DialogButton`, the PopCap bitmap fonts (`NativeAlienExtended18`, `Cancun12`, `Arial12Bold`) and the original `strings.json` labels, laid as the inline background of `.zuma-stats` — ten live values revealed line by line with `pop`, a painted OK with hover/pressed states and `button1`, TEMPS / OBJECTIF / BONUS (expert time bonus) / RECORD (best time per level persisted under `zuma.best.<id>`, shown from the first game); the R2.0.12 picture mode (tool, loader methods, importer block, CSS, test) is gone and the vector fallback with its r211 locks is intact.**

## Task Commits

| # | Task | Commits | Files |
|---|------|---------|-------|
| 1 | Picture mode removed, STATS kit + composition (TDD) | `943e816` (test, RED: `.compiled/statsdialog.js` missing) → `7a88b5e` (feat, GREEN 33/33 on r215-presentation / r214-presentation / r211 / r215-import) | src/statsdialog.ts, src/original.ts, src/main.ts, tools/import-original.mjs, tools/build.mjs, tools/import-r212-stats.mjs (deleted), tests/r214-presentation.test.mjs, tests/r215-presentation.test.mjs |
| 2 | Native openStats presentation (D-04, D-05, D-06) | `71ac18f` (feat: index.html + style.css) | index.html, public/style.css |
| — | Browser-verification fixes | `ccc3e5d` (fix: synchronous encode, monotonic swap, label replacement, tip leading) | src/original.ts, src/main.ts, src/statsdialog.ts |
| 3 | Captures, README, notes R2.0.15, source lock | `fa45764` (docs) | README.md, R215_RELEASE_NOTES.md, tests/r215-presentation.test.mjs |

SUMMARY left uncommitted as instructed; STATE.md / ROADMAP.md untouched.

## What was built

- **`src/statsdialog.ts`** — `STATS_LAYOUT` (frame 109/91/422/355, 9-slice `source` 11/0/229/231 + `inset` 36, head (242, 8), title baseline 174 at x 320, rule y 188 x 150–490, separator x 321 y 200–312, left labels x 135 / values right 299 / baselines 219…313, right labels x 335 / values right 489 / TEMPS 219 / OBJECTIF 238 / rule 250 / BONUS 269 / RECORD 293, tip band 133/320/374/60 with label at 150 and lines centred at 363 (270 px, 14 px leading, 4 lines max), OK 260/382/120/48, OK label baseline 412), `STATS_COLORS` (D-02 values, `title: null`), `STATS_ORDER`, `TIP_KEYS`; pure `formatSeconds` (moved from main.ts, re-exported there), `statsValues`, `bestTimeKey` (`zuma.best.` + lower-cased id with every character outside `[a-z0-9-]` → `-`), `bestTime`, `wrapText` (`&cr;` → space, injected measurer). `loadStatsKit(pack)` loads frame, head, button, three fonts (+ `cancun10` fallback for the tip) and strings in parallel, `null` when frame / button / a main font / strings are missing (never throws). `composeStatsDialog(kit, values, { revealed, button, tip }, canvas?)`: clear, `drawNineSlice` (corners unscaled, edges stretched in one dimension, centre both), head, title (`align: 'center'`, no tint), carved 1 px rules, the ten rows (label yellow; value right-aligned, colour per row, drawn only for the first `revealed` rows; a value too wide for its row replaces the label), tip band + « ASTUCE : » + wrapped lines in `Arial12Bold`, the painted button state (source x 0 / 120 / 240) with the OK label (+1,+1 when pressed). No DOM access at module load.
- **`src/original.ts`** — `PackFont`, `PackData.fonts` / `strings`, `PackGraphics.treasure?` (`TreasurePoint` from core), `OriginalPack.strings()` (cached promise, `null` on any error), `bitmapUrl` exported and **synchronous** (see decisions). Removed: `LayoutRect`, `StatsSlot`, `StatsLayout`, `StatsArt`, `PackData.statsLayout`, `statsArt()`, `cleanStats()`. No import of `bitmapfont.ts` (locked: no cycle).
- **`src/main.ts`** — `statsKit` loaded in the background after the sprites; `ResolvedLevel.id` (`graphics.id` or `proc-N`); `openStats` computes seconds, reads `zuma.best.<id>` (NaN / ≤ 0 → null, try/catch), `bestTime`, writes on a win when changed, fills the ten `strong#result-*` via `textContent`, title = `strings.STATS`, tip from the seven original tip strings (or `TIPS` without kit), toggles `stats-original`, composes and reveals (10 timers × 90 ms, `pop` gain 0.8); `renderStats` composes → `bitmapUrl` → `preload` (Image decode) → applies if newer than the displayed sequence → revokes the previous URL; OK listeners (`mouseenter` / `mouseleave` / `mousedown` / `mouseup` / `touchstart` / `touchend`) switch the painted state; `button` sound before `closeStats`, which purges timers, clears the background and revokes the URL. `this.best` / `zuma.best` (score) removed.
- **`index.html` / `public/style.css`** — BONUS default « PAS DE BONUS »; native block: `.zuma-stats` full stage with `background-size: 100% 100%`, every structure text (`h2`, `span`, `strong`, `.stats-tip`, `.stats-rule`, `.stats-gap`, `.stats-idol`) `opacity: 0; pointer-events: none`, transparent `#result-continue` at 40.625 % / 79.58 % / 18.75 % / 10 % with hover/active/focus backgrounds transparent (states are painted); 04-04 positioned-`strong` / `stats-reveal` / `cqh` / `backdrop-filter` rules removed; R2.0.11 block intact; no `url(` anywhere (including comments — a first draft mentioned it in a comment and tripped the lock).
- **Tools / tests** — `tools/import-r212-stats.mjs` deleted (`git rm`); importer without the `extra/` + `stats_layout.json` block and `pack.statsLayout`; `statsdialog` in `MODULES` after `bitmapfont` (standalone verified: `composeStatsDialog` present in `standalone/zuma-standalone.html`); r214-presentation without the picture-tool lock and its fixtures (`os` / `path` imports dropped); r215-presentation: 10 tests.
- **Docs** — README « Écran STATS d'origine » rewritten (composition, pieces, fonts, strings, column semantics, reveal / sounds, synchronous encode, fallback; `import-r212-stats` command and `stats_layout.json` schema removed; locks line updated); R2.0.15 notes « Écran STATS » section + Tests section completed.

## Verification

- `npm test`: **95/95** (build + node:test + guard « 476 tracked files, none proprietary »). `npm run check`: clean. Task 1 / Task 2 automated verifications (test lists, `! -f tools/import-r212-stats.mjs`, no `cleanStats|statsArt|statsLayout` in `.compiled/original.js`, no `url(` in CSS, one `result-continue`, no `statsArt|STATS_SLOT_IDS|'zuma.best'` in main.ts) all pass.
- Browser (Playwright Chromium, `dist/` built with `--local`, `tools/serve.mjs` on :8095, 1280×960 at dpr 2, service workers blocked so the vector run cannot be served from cache) — scripts `scratchpad/stats-r215.mjs`, `probe*-r215.mjs`, `timing*-r215.mjs`; captures only under `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r215/`:

| File | Content | Findings |
|------|---------|----------|
| `stats-native.png`, `stats-native-crop.png` | `?level=1-1`, six shots, STATS at (598, 462), `zuma.best.spiral = 17` seeded | composed dialog: 9-slice frame without corner deformation, GodHead overlapping the top edge, title in the gif's stone tint, yellow labels, cream / green / orange / gold values (POINTS 170, TEMPS 6 s, OBJECTIF 25 s, « PAS DE BONUS » in place of the BONUS label, RECORD 17 s), two-line tip, painted OK. DOM: `#stats.stats-original`, `.zuma-stats` `backgroundImage = url("blob:…")`, `h2` opacity `0`, one `#result-continue`, console clean (only Playwright's SW-blocked warning). Background set within the first 100 ms after the click (probe `111111111111`). |
| `stats-native-hover.png`, `stats-native-pressed.png` | mouse over the OK, then `mouse.down()` | painted state changes; mean RGB of the 260–380 × 382–430 zone: normal (106, 128, 87) green, hover (126, 88, 127) magenta, pressed (128, 93, 129) darker magenta — three distinct states |
| `stats-record.png` | not produced: no win hook exists and playing to a win is out of scope (left to 05-04 as the plan allows). RECORD persistence is covered by the seeded key above (17 s displayed, `localStorage` unchanged on a live opening) and by the `bestTime` / `bestTimeKey` locks. |
| `stats-vector.png` | `pack.json` aborted (new context, SW blocked), STATS at the vector HUD button (594, 22) | vector panel, badge « rendu vectoriel », « PAS DE BONUS », OBJECTIF « — », one OK, no `stats-original`, no page errors |
| `stats-compare.png`, `stats-blend.png` | R2.0.12 reference (`private_assets/original/extra/stats_bg.png` → 640×480) beside / blended with the composition | frame edges, title baseline, rows, right-column rule, tip band and OK coincide within ± 4 px; the title is narrower than the reference's (real glyph widths of `NativeAlienExtended18`), the « Q » is the font's own stone glyph |

- Layout adjustments after the comparison (recorded as requested): tip band 326/50 → 320/60 with 13 → 14 px leading and 270 px lines (4 lines max instead of 3: the longest original tip is 115 characters), label replacement for « PAS DE BONUS » (the Cancun12 string is ~130 px wide; neither it nor `Arial12Bold` fits beside « BONUS » in a 154 px column). No change to the frame, rows or button positions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `main.ts` converted in Task 1's commit**
- **Found during:** Task 1
- **Issue:** removing `StatsArt` / `statsArt()` from `original.ts` broke `main.ts` compilation, and Task 1's verification requires `npm run check`. A commit that does not compile was not acceptable.
- **Fix:** the native `openStats` rewrite planned for Task 2 landed in the Task 1 commit (`7a88b5e`); Task 2's commit (`71ac18f`) carries `index.html` and `public/style.css`.

**2. [Rule 1 - Bug] Dialog blank for ~1–2 s after opening (and hover state missing its frame)**
- **Found during:** Task 3 browser verification
- **Issue:** `canvas.toBlob('image/png')` took ~1.1 s per 640×480 frame in software-rendered Chromium (measured in-page; `toDataURL` 9 ms, compose 3–12 ms). With the planned « latest composition wins » guard, every reveal frame was discarded as stale and nothing was shown until the last encode finished.
- **Fix:** `bitmapUrl` now encodes synchronously (`toDataURL` → bytes → `Blob` → object URL, data URL fallback); `renderStats` applies any frame newer than the displayed one, preloads it with `Image` before the swap, and revokes the previous URL afterwards. Background set within 100 ms; three button states captured distinctly.
- **Files modified:** src/original.ts, src/main.ts — **Commit:** `ccc3e5d`

**3. [Rule 1 - Bug] « PAS DE BONUS » overlapping its label**
- **Found during:** Task 3 browser verification
- **Issue:** the no-bonus string cannot fit beside « BONUS » in the 154 px right column in any available font.
- **Fix:** a row whose value cannot sit beside its label draws the value in place of the label when revealed (as the original's `NO_TIME_BONUS` replaces the line).
- **Files modified:** src/statsdialog.ts — **Commit:** `ccc3e5d`

**4. [Rule 1 - Test] Own test expectation corrected**
- **Found during:** Task 1 GREEN
- **Issue:** my RED test expected `bestTimeKey('Été/1') === 'zuma.best.-t-1'`; the plan's per-character rule gives `-t--1`.
- **Fix:** expectation corrected (`-t--1`), function unchanged. — **Commit:** `7a88b5e`

### Interpretation choices (within the plan's wording)
- `PackGraphics.treasure` declared **optional**: the importer does not emit it yet; a required field would crash `engine.setTreasure(undefined)` in 05-04 without a tsc warning. 05-04 should use `graphics.treasure ?? []` (or make it required once the importer writes it).
- `STATS_LAYOUT` carries a few extra fields beyond the plan's interface (`source` rect for the 9-slice, `tip.labelX` / `tip.maxLines` / `tip.box`), all locked indirectly by the layout test.
- The tip band (darker rounded inset behind « ASTUCE ») is drawn with plain fills, echoing the reference; not an original asset (Claude's discretion on the dialog's look).
- `stats-record.png` not produced (no win hook; allowed by the plan).

## Authentication Gates

None.

## TDD Gate Compliance

- Task 1: `test(05-03)` `943e816` (RED verified: suite fails at import of `.compiled/statsdialog.js`) → `feat(05-03)` `7a88b5e` (GREEN 33/33). No refactor commit needed.

## Known Stubs

None — no placeholder values or unwired data (stub scan of the touched files: 0 hits). `result-coins` is now wired to `engine.stats.coins` (the 04-04 stub is resolved).

## Threat Flags

None beyond the plan's register. T-05-07: strings and tips go through `textContent` and canvas text only. T-05-08: `bestTimeKey` reduces the id to `[a-z0-9-]`, the stored value is converted with `Number` and rejected unless finite and > 0. T-05-09: 11 compositions per opening accepted; each encode is ~15 ms synchronous now, previous object URL revoked after the next frame is decoded.

## Observations for 05-04 / later

- `drawNineSlice`, `StatsKit` pieces and `OriginalPack.strings()` are reusable for other dialogs (menus, « Attention / PARTEZ » texts via `loadBitmapFont`).
- The golden title of the R2.0.12 picture cannot be obtained from the beige `NativeAlienExtended18.gif` by tinting (D-02 locks the gif's tint); a `colorMult` draw option on colour fonts would be the hook if wanted.
- `OriginalPack.statsArt()` consumers are gone; `pack.json` still contains an obsolete `statsLayout` key and `images/stats_bg.png` until `npm run import` is re-run (both ignored by the loader; the private pack is not in Git).

## Self-Check: PASSED

- FOUND: src/statsdialog.ts, src/original.ts, src/main.ts, index.html, public/style.css, tools/build.mjs, tools/import-original.mjs, tests/r215-presentation.test.mjs, tests/r214-presentation.test.mjs, README.md, R215_RELEASE_NOTES.md; REMOVED: tools/import-r212-stats.mjs.
- FOUND commits: 943e816, 7a88b5e, 71ac18f, ccc3e5d, fa45764 (the only deletion in the plan's commits is the intended tool).
- `dist/` rebuilt with `--local` at the end; the evidence server was stopped; `git status`: only this SUMMARY untracked, no media.

---
*Phase: 05-regles-originales-completes*
*Completed: 2026-10-10*
