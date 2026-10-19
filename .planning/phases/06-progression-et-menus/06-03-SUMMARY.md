---
phase: 06-progression-et-menus
plan: 03
subsystem: presentation (main menu) + wiring of the application state machine
tags: [main-menu, welcome-screen, mmscreen, ufo, choral1, name-dialog, continue-dialog, options-out-of-game, d-01, d-05, d-11, d-12, api-me]

# Dependency graph
requires:
  - doc: 06-CONTEXT.md
    provides: D-01 (original main screen, no level before the choice), D-05 (canvas, 2 x path, pack fonts and strings), D-11 (Aventure / Options active, three stones disabled, animations and sounds, name typed once), D-12 (first name from the host identity)
  - doc: 06-RESEARCH.md
    provides: Q1 (composition 0x43d1a0, eyes 0x43c050 / 0x43c270 / 0x43c430, stones 0x434d10 / 0x43cf60, hover 0x43ed30, UFO 0x43c550 / 0x43d880, OPTIONS out of game 0x445310)
  - plan: 06-02
    provides: initialApp / reduceApp / effects, readJson / writeJson, parseProfile / parseSave / parseScores, sanitizeName, profile-detected
provides:
  - "tools/import-original.mjs: menu, adventure and ending pictures (mmsky … happyending, no mmhat) and the fonts NativeAlienExtended16, NativeAlien48, Cancun8; local pack re-imported"
  - "src/welcome.ts: MM, mmSkyOffset, mmGlow, mmEyes, mmUfo, mmHoverSequence, welcomeHit, welcomeLine, welcomeLineWidth, WelcomeKit (loadWelcomeKit, upscaleWelcomeKit), drawWelcome (+ vector fallback), WELCOME_DIALOG, nameDialogWidgets, continueDialogWidgets, welcomePromptLayout, drawNameDialog, drawContinueDialog"
  - "src/render.ts: Renderer.drawScene(paint)"
  - "src/menudialog.ts: MenuOptions.inGame (false = OPTIONS out of game: title OPTIONS, no BACK_TO_MAIN_MENU, footer DONE)"
  - "src/audio.ts: LOOP_KEYS / LoopKey 'rolling' | 'ufo', UFO_GAIN 0.8, rampPlan(previous, target, gain)"
  - "src/bitmapfont.ts: one shared pen per character across layers (ImageFont::DrawStringEx)"
  - "src/main.ts: boot through initialApp, dispatch → reduceApp → effects, welcome loop, inputs (pointer, touch, keyboard), name / continue dialogs with an invisible input, OPTIONS out of game, api/me (D-12), level end through won / retry / gameover / leave"
  - "tools/build.mjs MODULES and the public/sw.js shell template list welcome.js after progress.js"
  - "tests/r221-welcome.test.mjs (25 tests); locks updated in r215-import, r215-presentation, r217-presentation, r218-presentation, r221-progress"
affects: [06-04 (adventure screen, god dialogue, ending: replace the pass-through in Game.dispatch, reuse drawScene / dialog kit / WELCOME_DIALOG), 06-05 (release notes, README, CONCERNS), private hosting (api/me endpoint)]

tech-stack:
  added: []
  patterns:
    - "Screen loop: off the level screen the loop paints Renderer.drawScene(ctx => drawWelcome(...) + dialog) and steps no engine"
    - "Recording Canvas 2D stand-in (Proxy) in the Node tests: draw order, source rectangles and composite modes are locked without a canvas"
    - "Transitional pass-through of screens that are not drawn yet, in one place (Game.dispatch)"
    - "Invisible same-size <input> over the canvas field: native keyboard (mobile included), value read through sanitizeName only, the name never written into the DOM"

key-files:
  created: [src/welcome.ts, tests/r221-welcome.test.mjs]
  modified: [tools/import-original.mjs, tools/build.mjs, public/sw.js, src/main.ts, src/menudialog.ts, src/render.ts, src/audio.ts, src/bitmapfont.ts, tests/r215-import.test.mjs, tests/r215-presentation.test.mjs, tests/r217-presentation.test.mjs, tests/r218-presentation.test.mjs, tests/r221-progress.test.mjs]

decisions:
  - "Hover sequence: a skip resets the expectation (to 1 when the skip lands on stone 0) and keeps the laps; it counts entries into a stone different from the last stone entered, so crossing the empty sky between two stones is not a new entry; three laps launch the UFO and reset the counter"
  - "UFO: the research formula is applied literally (hover y = 210 − 15 cos a), so the UFO arrives at (300, 210) and its hover starts 15 px higher; positions are the frame's top-left corner (hypothesis)"
  - "Stone hit test on the one-state box (no alpha mask); disabled stones are located (for the hover sequence) but have no hover, sound or click"
  - "The pointer hover clears the keyboard focus (one lit stone at a time); a modal dialog clears the stones' hover / press / focus"
  - "Name and continue dialogs reuse the OPTIONS frame (MENU_LAYOUT.frame, GodHead, title, rule, footer); rename starts with an empty field and an empty OK keeps the name; first-launch empty OK → « Joueur » (06-02 rule)"
  - "Escape on the continue question closes it without any change (presentation-only, the save stays)"
  - "Transitional until 06-04: adventure → play (from Aventure / Rejouer / a finished stage) or → main-menu (from leave); temple → temple-done; ending → ending-done"
  - "D-12: api/me is asked only when the pack is present and the host is not loopback; boot waits ≤ 1.5 s, the request is aborted after 8 s, a later answer is dispatched as profile-detected"
  - "Welcome pictures and font use the 2 × EPX copies above HD_MIN_SCALE, as the plan says (checked at DPR 2: crisp stones and text, no visible artefact on the painted backgrounds)"
  - "Vector STATS OK label after a game over: « Menu principal » (it now leads to the main menu)"

metrics:
  duration: "~45 min (16:02 → 16:48 UTC)"
  completed: 2026-10-11
  tasks: 5
  commits: 14
  tests: "448/448 + publication guard (was 423 after 06-02; r221-welcome +25)"
---

# Phase 6 Plan 03: Original main menu (welcome screen) and the state machine wiring — Summary

The app now opens on the main screen of Zuma Deluxe, composed on the canvas from the pack:
- the sky scrolls behind `mmscreen`, holed by its mask, at 12.5 px/s;
- the sun has its additive glow, rotating and pulsing;
- the frog idol's pupils sit under the eyelids cut from `mmscreen`;
- the five stones carry their baked French labels: AVENTURE, GANTELET, OPTIONS, PLUS DE JEUX, QUITTER;
- the welcome line « Bienvenue dans Zuma, <nom>! » is drawn in NativeAlienExtended16;
- the UFO easter egg flies in after three ordered laps over the stones.

No engine exists before « Aventure ». The first launch asks for the name once, in a native dialog. « Aventure » offers to continue a saved run. « Options » opens the native dialog out of game (OPTIONS, Aide, « Terminé »). Gantelet, Plus de jeux and Quitter are drawn but inert. `?level=S-L` still opens a level directly.

`main.ts` now runs on the plan 06-02 machine: boot with `initialApp`, every transition through `reduceApp`, and effects performed in one place. The end of a level dispatches `won` / `retry` / `gameover` / `leave`. As a result:
- the saved run follows every level start;
- 13-1 no longer wraps to 1-1;
- a game over records the score and returns to the main menu.

The screens 06-04 will draw (adventure, temple, ending) are passed through in `Game.dispatch`.

448 tests green + guard, `check` clean. The standalone boots on `file://` onto the welcome screen with a clean console at DPR 1 and 2.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Importer: menu / adventure / ending pictures, 3 fonts; local re-import | `c345981` (RED), `808a8bf` (GREEN) | tools/import-original.mjs, tests/r221-welcome.test.mjs, tests/r215-import.test.mjs |
| 2 | `src/welcome.ts` pure geometry and animations; MODULES / worker shell | `4020b3e` (RED), `80b5826` (GREEN) | src/welcome.ts, tools/build.mjs, public/sw.js, tests (r221-welcome, r215-presentation, r218-presentation, r221-progress) |
| 3 | Welcome composition, name / continue dialogs, HD path, vector fallback, OPTIONS out of game, `drawScene` | `10985e8` (RED), `053597b` (GREEN) | src/welcome.ts, src/menudialog.ts, src/render.ts, tests/r221-welcome.test.mjs |
| 4 | `main.ts` wiring: state machine, boot on the welcome, inputs, sounds, UFO, profile, continue, OPTIONS, api/me | `4e85b54` (RED), `2ae257f` (GREEN) | src/main.ts, src/audio.ts, tests/r221-welcome.test.mjs, tests/r217-presentation.test.mjs |
| 5 | Playwright evidence (DPR 1 / 2) and full verification; fixes found on the captures | `8005156` (RED) + `cd5804b`, `6a18ad0` (RED) + `7f8851e`, `bc079b7`, `8929227` | src/bitmapfont.ts, src/main.ts, src/audio.ts, tests/r221-welcome.test.mjs |

## What was built

### Importer and pack (Task 1)

- `IMAGES` gains the main menu set (`mmsky`, `_mmscreen`, sun and glow, pupils and eye mask, `mmUFO`, the five stones with masks). It also gains the adventure set (`advsky`, `advback`, `advmiddle`, temples incl. `2v` / `3v`, the 12 doors with masks, `advTitle`, `advHighscore`, `advstage`, `advplaybutton`, `advmainmenubutton`) and `happyending`. `mmhat` is never imported.
- `FONTS` gains NativeAlienExtended16, NativeAlien48 and Cancun8.
- **Local re-import.** The pack was backed up to `scratchpad/pack-before-r221` before `npm run import`:
  - no file was lost and 81 files were added;
  - every pre-existing non-m4a file is byte-identical;
  - the log is `shots-r221/reimport.log` (file names only);
  - nothing under `private_assets/` is tracked.

### Main menu module (Tasks 2–3, `src/welcome.ts`)

- **Pure rules:**
  - `MM`: every position and size of research Q1;
  - `mmSkyOffset`: `(c >> 3) mod 520`;
  - `mmGlow`: alpha 75 → 150 → 75 over 500 maj, 0.3° per maj, exact degrees;
  - `mmEyes`: A8 fallback, 4 px towards the target inside the 6 × 4 ellipse;
  - `mmUfo`: in / hover / out / wait / idle phases, inclusive leg ends, long jumps walked;
  - `mmHoverSequence`, `welcomeHit` and `welcomeLine`.
- **Drawing:** `drawWelcome` follows the 0x43d1a0 order: black, sky ×3, holed screen, pupils, lids, additive rotating glow, sun, welcome line, stones, UFO. A 2 × kit is cut at 2 × and drawn at its logical size. `kit === null` gives a vector welcome with the same zones.
- **Kit:** `loadWelcomeKit` returns null without `mmscreen`; each other piece may be missing. `upscaleWelcomeKit` is all-or-nothing, like `buildHdAssets`.
- **Dialogs:** they use the OPTIONS frame and the STATS kit (dialogbox 9-slice, GodHead, NativeAlienExtended18 title, Cancun12 text, DialogButton), or a vector stand-in.
  - Name dialog: NEW_USER / RENAME_USER, the wrapped profile text, the field with the typed name and a blinking caret, and OK.
  - Continue dialog: « CONTINUER ? », the question without its `&cr;`, « Continuer » / « Rejouer ».
- `menuWidgets(view, strings, { inGame: false })` gives OPTIONS without « Retour au menu principal », with the footer « Terminé ». `composeMenuDialog` titles it OPTIONS. The default is unchanged.
- `Renderer.drawScene(paint)` saves, applies `setTransform(storeScale)` with smoothing, calls `paint`, then restores.

### Wiring (Task 4, `src/main.ts`)

- **Boot.**
  - `parseProfile` / `parseSave` / `parseScores` read through `readJson(storage, …)`.
  - The stage sizes come from the pack.
  - `requestedRun()` returns a `RunState | null` for `?level=`.
  - `initialApp({ …, platformName })` builds the state, then `enterScreen` runs and the effects are applied.
  - The STATS kit and the welcome kit are awaited before the first screen; the in-game menu kit still loads in the background.
- **`dispatch(event)`** calls `reduceApp`, enters the new screen, applies the effects and syncs the dialogs:
  - `enterScreen` stops the loops and, off the level, drops the engine and resets the welcome state;
  - the effects are `start-level` → `beginRun`, `save-run` / `save-profile` / `save-scores` through `writeJson` (scores stored as `{ adventure: scores }`), and `sound`.
- **Lifecycle.**
  - The STATS `won` / `lost` close dispatches `won` / `retry`.
  - The `gameover` STATS dispatches `gameover` when it opens and `leave` when it closes.
  - « Retour au menu principal » dispatches `leave`.
  - `nextLevel` / `retryLevel` / `newGame` are gone.
- **Inputs on the welcome:**
  - Hover on an enabled stone plays `{ key: 'choral', gain: 0.2, rate: 2 ** (n / 12) }` once per entry.
  - Click is a press, and a release over the same zone activates it with `button` at 1.
  - Touch has no hover: the press is the pressed state, and a release inside activates.
  - A frog click toggles « eyes follow ». The welcome line reopens the name dialog (rename).
  - Keyboard: Up / Down / Tab move between Aventure and Options, Enter / Space activate. In the dialogs, Enter = OK, Escape closes a rename or the continue question, and Left / Right / Tab switch Continuer ↔ Rejouer.
- **UFO.** After three ordered laps the UFO flies. Its `ufo1` loop plays at `UFO_GAIN` 0.8 while it flies and waits, is cut under the OPTIONS dialog, and stops at every screen change (`stopLoops`).
- **Name field.** An invisible `<input>` sits over the field (`maxLength` 16, `autocapitalize`, `enterkeyhint`, font-size 16 px against the iOS zoom). Its value is read only by `sanitizeName`. It always opens empty, so the stored name is never written into the DOM.
- **D-12 (`fetchPlatformName`).**
  - It calls `fetch('api/me', { credentials: 'same-origin', cache: 'no-store', … })` and accepts only a JSON `{ name }` string.
  - It is skipped on `file:`, without the pack, and on loopback hosts.
  - Boot waits until the answer or 1.5 s, whichever comes first. The request aborts at 8 s, and an answer in between arrives as `profile-detected`, which closes a pending name prompt.

## Evidence (scratchpad `shots-r221/`, nothing in the repository)

Script `scratchpad/evidence-r221-welcome.mjs`, Chromium, 1000 × 750, DPR 2 (renderer scale 3.125) and DPR 1 (1.5625), with `node tools/serve.mjs` on `dist/` built with `--local`.

| # | Capture / log | Result |
| --- | --- | --- |
| 1 | `welcome-first.png`, `welcome-first-typed.png`, `crop-name-field.png`, `welcome.log` | First launch: NOUVEL UTILISATEUR dialog, focus in the field; « Romain » typed shows on the canvas. Enter → profile `{"name":"Romain","maxStage":0}` stored, `debugState().engine === null`. The reload does not ask again. |
| 1 | `welcome-dpr2.png`, `welcome-dpr1.png`, `crop-line-dpr2.png`, `crop-eyes-dpr2.png` | Original main screen at both DPRs (welcome kit 2 × in both: scale ≥ 1.5). Sky measured at 12.32–12.47 px/s. Glow alpha / angle logged from `mmGlow` (99/255 at 125.7°, 111/255 at 186°). Pupils under the lids. |
| 1 | `glow-compare.png` (none / trough / peak) | Additive glow visible around the sun. Mean RGB of the sun box: 166/112/46 without glow, 181/129/63 at the trough, 191/143/78 at the peak. |
| 2 | `welcome-hover.png`, `hover-sounds.log` | Aventure hovered = column 1 (purple stone). Cues: `choral` 0.2 × 2 (Aventure) and × 1.7818 = 2^(10/12) (Options). Buffer starts at playbackRate 2 / 1.7818. Nothing on Gantelet, Plus de jeux or Quitter. `button` 1 × 1 on the click. |
| 3 | `welcome-options.png`, `welcome-keyboard-options.png` | Title OPTIONS, sliders, checks, « Aide », footer « Terminé », no « Retour au menu principal ». « Terminé » goes back to the welcome with no engine. |
| 4 | `welcome-continue.png`, `welcome-continue-level.png`, `continue.log` | Save `{stage:1, level:2, score:12000, lives:2}` + Aventure → CONTINUER ? dialog. Escape changes nothing. « Continuer » → level 2-3, score 12 000, 2 lives. Retour au menu principal → welcome, save kept. « Rejouer » → 1-1, save reset to the new run. |
| 5 | `welcome-ufo.png`, `ufo.log`, `welcome-eyes.png` | Three laps → launched at c0 = 250. c0 + 150 ≈ (131, 84) "in"; c0 + 300 → hover; c0 + 800 hover. Pupils turned towards the UFO. `ufo` loop 0 → 1 → 0, one looping buffer. Idle at c0 + 1 460. Frog click → follow, pointer right → left pupil (223, 368). |
| 6 | `welcome-touch.png`, `welcome-touch.log` | A tap on Aventure (touch) starts 1-1 with no hover sound. |
| 6 | `welcome-keyboard.log` | Down → adventure, Down → options, Tab → adventure, Up → options; Enter opens OPTIONS (`inGame: false`); Escape closes it; Up + Space → 1-1. |
| 7 | `standalone-r221-welcome.png`, `standalone-r221-review.png`, `standalone-r221-welcome.log` | `file://…/zuma-standalone.html` → welcome screen, engine null, console **clean** at DPR 2 and 1. `?level=1-1` → level directly, console clean. No install card. |
| 8 | `welcome-vector.png`, `welcome-vector-name.png`, `welcome-vector.log` | Public build without the pack → vector welcome (name dialog, title, frog with moving pupils, Aventure / Options lit, the others greyed). Aventure → procedural level 1. Console: only the pre-existing 404s of `pack.json` / the sound manifest probes. |
| + | `identity.log`, `welcome-identity.png` | `api/me` routed on a non-loopback host (`zuma.test`). Answered `{name:"Sophie"}` → no prompt, profile `source: platform`, boot 383 ms. 404 → normal prompt. Late (3 s) → boot after 1.56 s with the prompt, then `profile-detected` closes it and stores Sophie. |
| + | `lifecycle.log` | won 1-1 → 1-2 with the save updated. retry → same level, start score kept. Winning 13-1 → welcome (pass-through), save cleared, score in the table. game over + leave → welcome, score in the table. |

**Visual verdict:** at DPR 2 and 1 the welcome screen is the original main screen, not a DOM panel. It has the sky, the sun with its pulsing glow, the idol and the frog with pupils under the lids, and the five stone buttons with their baked labels. The positions match research Q1 (stones at 452/436/418/406/394, eyes at 219/368 and 276/355, sun at 0/2). The dialogs are native (dialogbox, GodHead, DialogButton, pack fonts and strings).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bitmap font layers drifted apart (welcome line ghosting)**
- **Found during:** Task 5. The DPR 2 capture showed « ZUMAA, RROMAINN ».
- **Issue:** `layoutText` kept one pen per layer. NativeAlienExtended16's Shadow layer has a 15 px space against 11 px for Main, so the shadow slid 4 px further right after each space.
- **Fix:** one shared pen per character that advances by the widest layer (Sexy `ImageFont::DrawStringEx`). The other pack fonts have equal layer widths and lay out exactly as before (r215-font green).
- **Files:** src/bitmapfont.ts. **Commits:** `8005156` (RED), `cd5804b`.

**2. [Rule 2 - Correctness] Level end through the state machine (not « unchanged until 06-04 »)**
- **Issue:** keeping `nextLevel` / `newGame` would have frozen the saved run at the first level of a session, so « Continuer » would resume the wrong level. It would also have kept the 13-1 → 1-1 wrap. Plan 06-02's open points already asked for `won` / `retry` / `gameover` / `leave`.
- **Fix:** see the lifecycle bullet under Wiring. The adventure, temple and ending screens are passed through in `Game.dispatch`: `leave` → main-menu, everything else → play / temple-done / ending-done.
- **Commit:** `2ae257f`.

**3. [Rule 2] Console noise of the identity request**
- **Issue:** a 404 on `api/me` logs « Failed to load resource » at every boot of a local or public build.
- **Fix:** the request is skipped without the pack and on loopback hosts. The private host always ships the pack.
- **Commits:** `6a18ad0` (RED), `7f8851e`.

**4. [Rule 1] A stone stayed lit after the pointer left**
- **Issue:** the hover was copied into the keyboard focus.
- **Fix:** the hover now clears the focus, and a dialog clears the stone hover, press and focus.
- **Commit:** `bc079b7`.

**5. [Rule 3] `grep "'ufo'" .compiled/audio.js` (plan check)**
- **Issue:** the `LoopKey` union is erased at compile time, so the plan's check found nothing.
- **Fix:** loop keys are now a runtime `LOOP_KEYS` list, and the type derives from it.
- **Commit:** `8929227`.

### Test adjustments (own RED tests, before GREEN)

- The glow alpha at c = 16 is `mmGlow(16)` (79/255), not 75/255 (`053597b`).
- The loop lock moved from « `drawScene` in `loop()` » to « `loop()` calls `drawWelcomeFrame`, which paints through `drawScene` ».
- The wrap-around regex was narrowed to `this.progress = { stage: 0, level: 0 }`; the field initialiser matched the broad one (`2ae257f`).
- Updated existing locks, each with an « R2.0.21 » comment:
  - r215-import: FONTS;
  - r215-presentation, r218-presentation, r221-progress: MODULES with welcome;
  - r217-presentation: `rampPlan(loop.target, target, LOOP_GAINS[key])`.

### Plan adjustments (documented, no rule weakened)

- **Gauntlet label:** the pack picture reads « GANTELET » (French), so the vector fallback's « GAUNTLET » applies only without the pack.
- **`mmscreen` mask:** `_mmscreen` is in the plan list and is imported. `pack.masked('mmscreen')` uses it automatically.
- **Rename:** the field starts empty, so the stored name never goes into the DOM, and an empty OK keeps the name. The plan said nothing on this.
- **Continue dialog Escape:** the reducer has no « dismiss » event. `main.ts` closes the question with a shallow copy (`prompt: null`) and changes nothing else.
- **Debug view:** `debugState()` also returns `app` (read-only, `?debug=1` only).
- **Pre-existing console 404s:** in the pack-less public build, the 404s of `assets/pack.json` / `sounds/manifest.json` existed before. Out of scope, not fixed.

## Hypotheses carried into the code (for 06-04 / 06-05 / UAT)

| # | Hypothesis / choice | Where |
| --- | --- | --- |
| A8 | Pupil orbit: rest + 4 px towards the target inside a 6 × 4 ellipse | `mmEyes` |
| UFO-1 | UFO positions are the frame's top-left; the hover formula is literal (15 px above the arrival point at a = 0) | `MM.ufo`, `mmUfo` |
| UFO-2 | Frame `(c >> 1) mod 5` (6 frames in the picture, 5 used, as read) | `mmUfo` |
| SEQ | Skip handling of the hover counter (expectation reset, laps kept, entries de-duplicated by last stone) | `mmHoverSequence`, `Game.hoverStone` |
| ORDER | Stones drawn after the welcome line, the UFO last (widgets above the screen's Draw; 0x43be00 as an overlay) | `drawWelcome` |
| GLOW | Glow colour = white additive with the alpha (the « colorisation » colour was not read) | `drawWelcome` |
| GAIN | `ufo1` loop gain 0.8 (plan choice; the original level was not read) | `UFO_GAIN` |
| LINE | « Bienvenue dans Zuma, Romain! »: original concatenation, no space before « ! » | `welcomeLine` |

## Open points for 06-04

- **Replace the pass-through** in `Game.dispatch` (the three `else if` lines after `syncPrompt()`) with the real screens:
  - `adventure`: draw it, with `select` / `play` / `main-menu` from its widgets;
  - `temple`: the god dialogue, then `temple-done`;
  - `ending`: `happyending`, the score and the table, then `ending-done`.
  - `drawWelcomeFrame` is the model: `Renderer.drawScene(ctx => …)`, the counter from `screenT0`, inputs routed when `app.screen !== 'level'`.
  - The welcome input handlers (`welcomeMove` / `welcomeDown` / `welcomeUp` / `welcomeKey`) are welcome-specific. 06-04 should branch on `app.screen` there (in `bindInput` the branch is `this.app.screen !== 'level'`).
- **« Retour au menu principal »** currently returns to the welcome, because `leave` → adventure → `main-menu` in the pass-through. With the adventure screen drawn it will stop on the adventure screen (0x44f180(0, 0)), as the reducer says.
- **« Rejouer » / Aventure without a save** start the stage `progressDefaultStage` (the highest unlocked door) because of the pass-through. The adventure screen restores the door choice.
- **Assets ready in the local pack:** `advsky`, `advback`, `advmiddle`, temples, 12 doors, `advTitle`, `advHighscore`, `advstage`, `advplaybutton`, `advmainmenubutton`, `happyending`, and the fonts NativeAlien48 and Cancun8. The `upscaleWelcomeKit` pattern (all-or-nothing EPX) can be reused.
- **Dialog kit:** `WELCOME_DIALOG`, `welcomePromptLayout` and the private `mmDialogFrame` / `mmDialogButton` helpers (welcome.ts) can be generalised for the god dialogue if it uses the same frame.
- **Vector STATS after a game over** shows « Menu principal ». With 06-04 it should become the adventure screen label if that is the destination.
- **06-05 notes:**
  - the shared-pen font fix;
  - the api/me scope (pack + non-loopback);
  - the UFO / A8 hypotheses above;
  - `debugState().app`;
  - the welcome evidence table.

## Known Stubs

- **Transitional pass-through of the adventure, temple and ending screens** (`Game.dispatch`). It is intentional and documented in the code comment and in the plan context. 06-04 Task 3 replaces it. It does not block this plan's goal: the welcome screen, profile, continue and options all work end to end.

## Threat Flags

| Flag | File | Description |
| --- | --- | --- |
| threat_flag: network | src/main.ts | New same-origin request `GET api/me` (D-12, coordinator scope). The answer is untrusted: only a JSON `name` string is accepted, it goes through `sanitizeName` in the reducer and is drawn on the canvas only. Skipped on `file:`, without the pack and on loopback. Aborted at 8 s. No credentials beyond the same-origin cookie. |

The plan's register otherwise holds:
- **T-06-08:** the input value is read only through `sanitizeName`, never through `innerHTML` / `textContent`, and is source-locked.
- **T-06-09:** the import goes to `private_assets/` only, with the guard and the `git status` gate.
- **T-06-10:** bounded pure animations, and `stopLoops` at every screen change.
- **T-06-11:** `parseSave` is bounded by the stage sizes.

## Self-Check: PASSED

Verified on disk and in `git log` on 2026-10-11:
- **Files:**
  - created: `src/welcome.ts`, `tests/r221-welcome.test.mjs`;
  - modified: `tools/import-original.mjs`, `tools/build.mjs`, `public/sw.js`, `src/main.ts`, `src/menudialog.ts`, `src/render.ts`, `src/audio.ts`, `src/bitmapfont.ts`, and the five test files listed above.
- **Commits:** `c345981`, `808a8bf`, `4020b3e`, `80b5826`, `10985e8`, `053597b`, `4e85b54`, `2ae257f`, `8005156`, `cd5804b`, `6a18ad0`, `7f8851e`, `bc079b7`, `8929227`.
- **Checks:**
  - `npm test` → 448/448 + `publication guard: 563 tracked files, none proprietary`;
  - `npm run check` clean;
  - `node tools/build.mjs --standalone` boots on `file://` onto the welcome screen with a clean console.
- **Repository state:**
  - `git status` clean: no PNG, `dist/`, `standalone/` or `private_assets/` tracked;
  - no model identifier and no PopCap staff name in committed files;
  - STATE.md and ROADMAP.md untouched.
