---
phase: 06-progression-et-menus
plan: 04
subsystem: presentation (adventure screen, god dialogue, ending) + routing after a level
tags: [adventure-screen, temples, doors, arrival-animation, earthquake, god-dialogue, ending, happyending, high-scores, routing, d-02, d-03, d-04, d-05, d-10, prog-01, prog-02]

# Dependency graph
requires:
  - doc: 06-CONTEXT.md
    provides: D-02 (original adventure screen; « Retour au menu principal » leads to it), D-03 / D-10 (happyending, « Félicitations », final score, top-10 table with the run's rank, back to the welcome, no credits), D-04 (game over in the table), D-05 (canvas, 2 × path, pack fonts and strings)
  - doc: 06-RESEARCH.md
    provides: Q2 (AdventureScreen composition, doors, door messages, when it appears), Q3 (final stage, ending)
  - plan: 06-02
    provides: reduceApp / AppState (adventure, temple, ending screens), DOOR_MESSAGES, GOD_LINES, TEMPLE_NAMES, insertScore ranks
  - plan: 06-03
    provides: Game.dispatch / enterScreen / drawScene loop, welcome dialog frame and button helpers, level end through won / retry / gameover / leave
provides:
  - "src/adventure.ts: ADV, advSkyOffset, advTemples, doorCel, doorAt, advButtonAt, scoreRows, revealTemple, revealProgress, advArrivalMaj, advShakeStep, advLines, advHint"
  - "src/adventure.ts: AdventureKit (loadAdventureKit, upscaleAdventureKit, advDoorOpaque, advDoorSizes), drawAdventure (+ vector fallback), godPages, godDialogWidgets, drawGodDialog, ADV_ENDING, endingWidgets, drawEnding"
  - "src/main.ts: adventure / temple / ending screens drawn and driven (pointer, touch, keyboard), arrival reveal with earthquake and shake, game over submitted by checkOutcome, review sessions write nothing"
  - "src/welcome.ts: mmDialogFrame / mmDialogButton / mmDialogBody / MmButtonState exported (shared with the god dialogue)"
  - "src/progress.ts: TEMPLE_NAMES fallbacks = literals of the executable (« QUETZAL QUATL », « POPO POYOLLI »)"
  - "tools/build.mjs MODULES and the public/sw.js shell list adventure.js after welcome.js"
  - "tests/r221-adventure.test.mjs (30 tests); MODULES locks updated in r215-presentation, r218-presentation, r221-progress, r221-welcome"
affects: [06-05 (release notes R2.0.21, README, CONCERNS), phase 7 (music positions 32 / 0 / 39 on these screens)]

tech-stack:
  added: []
  patterns:
    - "Off-level screens routed in one place (screenMove / screenDown / screenUp / screenKey) by app.screen"
    - "The god dialogue paints over the last board kept (engine not dropped on the temple screen, never stepped)"
    - "Per-pixel door hit test from cel-0 alpha masks computed once at kit load (rectangle only when the pixels cannot be read)"
    - "Outlined « !program » fonts as the pack bitmap font drawn 8 times in black at 1 px, then in colour"

key-files:
  created: [src/adventure.ts, tests/r221-adventure.test.mjs]
  modified: [src/main.ts, src/welcome.ts, src/progress.ts, tools/build.mjs, public/sw.js, tests/r215-presentation.test.mjs, tests/r218-presentation.test.mjs, tests/r221-progress.test.mjs, tests/r221-welcome.test.mjs]

decisions:
  - "Geometry and timings taken from the executable where they contradict the plan context (adventure-measure.log): plaque = 3 scores, scores left-aligned at 575, names clipped at 567; line 1 = temple name (centre 326, baseline 422), line 2 = door message (outlined 0xffea01, 456); hint box (20, 60, 150 × 100) UNCOVER_THE_SECRET_TEMPLES / CLICK_ON_A_DOORWAY; buttons « Menu principal » (0, 438) and « Jouer » (542, 441)"
  - "Arrival after a finished stage: 75 maj delay, crossfade of temple 2 / 3 over 100 maj, temple 4 rising (300 − n)² / 300 over 300 maj with earthquake at n = 1 and a ±(10 − n / 30) px x shake every 4 maj; doors locked during the arrival (175 / 375 maj), as +0x204 does"
  - "Veiled temples carry no door; a door is selected silently; a press on the selected door plays it (0x440e06) without the button sound; buttons play button1 on release"
  - "The « Espace » stage (selected 12 after temple 4) shows STAGE 13 with the texts of door 12 and every door open"
  - "God dialogue: OPTIONS frame + GodHead, temple name as title (none for the final dialogue), page text wrapped on 340 px, one reply button « <RIBBIT…> <translation> » that turns the pages then sends temple-done"
  - "Ending: happyending, « FÉLICITATIONS ! » NativeAlien48 (baseline 74), advHighscore plaque over the dialogbox table of the 10 best (rank, name, score; the run's row in 0xffff4c), « Score : N » under the table, OK → welcome; no credits, no PopCap name"
  - "Game over submitted when the engine reaches gameover (checkOutcome, once per level), not when the STATS open; the game-over STATS reads OK and leads to the adventure screen"
  - "Review sessions (?level=) write no best time either: localStorage unchanged across a won review level"

metrics:
  duration: "~45 min (16:35 → 17:20 UTC)"
  completed: 2026-10-11
  tasks: 5
  commits: 9 (+ this summary)
  tests: "478/478 + publication guard (was 448 after 06-03; r221-adventure +30)"
---

# Phase 6 Plan 04: Adventure screen, god dialogue, ending and the routing after a level — Summary

The game now follows the original adventure from end to end:
- **« Aventure »** (or « Rejouer ») opens the original adventure screen, composed from the pack: scrolling sky, temples, the 12 doors with their four cels, the RECORDS plaque with the top three scores, the STAGE plaque, the temple name and the door message, the hint box and the two carved buttons.
- **Inside a stage** the next level follows directly. **At the end of a stage** the adventure screen comes back with the next door selected, after the god dialogue when the stage closes a temple (`chant6`), and the opening temple is revealed (crossfade of temple 2 / 3, rise of temple 4 with `earthquake` and the shake).
- **After 13-1** the run stops: STATS, final god dialogue, then the ending screen with `happyending`, « FÉLICITATIONS ! », the 10-row table with the run's row highlighted and the final score; OK returns to the welcome screen with the save cleared.
- **Game over**: the score enters the table when the last life is lost; the STATS OK leads to the adventure screen.
- **« Retour au menu principal »** (confirmed) saves the run at the start of its level and shows the adventure screen; after a reload « Aventure » offers to continue it.

The 06-03 pass-through is gone from `Game.dispatch`. 478 tests green + guard, `check` clean; the standalone runs the flow on `file://` with a clean console.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | Pure geometry read in the executable; MODULES / worker shell | `64cc484` (RED), `c0f44f4` (GREEN) | src/adventure.ts, src/progress.ts, tools/build.mjs, public/sw.js, tests (r221-adventure, r215-presentation, r218-presentation, r221-progress, r221-welcome) |
| 2 | Composition: adventure screen, god dialogue, ending (1 × / 2 ×, vector fallbacks) | `1ecb0e3` (RED), `7053c87` (GREEN) | src/adventure.ts, src/welcome.ts, tests/r221-adventure.test.mjs |
| 3 | main.ts: adventure screen driven, temple / ending screens, pass-through removed | `94e32e5` (RED), `6da24b7` (GREEN) | src/main.ts, tests/r221-adventure.test.mjs, tests/r221-welcome.test.mjs |
| 4 | Routing after a level: game over by checkOutcome, STATS label, review without writes | `a984c76` (RED), `53fdaf0` (GREEN) | src/main.ts, tests/r221-adventure.test.mjs |
| 5 | Playwright evidence DPR 2 / 1 of the whole flow; fix found on the captures | `8d8b445` | src/adventure.ts |

## What was built

### Step 0: reading of the executable (`scratchpad/shots-r221/adventure-measure.log`)

Confirmed from the context:
- the temple positions;
- the veiled variants `advtemple2v` / `advtemple3v` while maxStage < 3 / < 6, and temple 4 from maxStage ≥ 9 (advmiddle always drawn over it);
- the door positions and anchors, and the door cels (3 selected, 2 hovered, 1 unlocked, 0 locked);
- the draw order of 0x441b50: sky ×3 before `advback`.

Read for the first time:
- **Buttons.** Resize 0x4414f0 places « Menu principal » at (0, 438) (125 × 42 per state) and « Jouer » at (542, 441) (97 × 39).
- **Door hit test (0x440c90).** Doors 0..maxStage, the cel rectangle, then the alpha of the pixel in cel 0.
- **Clicks (0x440db0).** A click on another door selects it, with no sound. A click on the selected door is « Jouer » (ButtonDepress(1)). Doors ignore the pointer during the arrival (+0x204).
- **Arrival (0x43e3f0(75, maxStage / 3 + 1), update 0x43e470).** A 75 maj delay, then:
  - temples 2 / 3 crossfade over 100 maj (alpha n × 255 / 100), their doors fading with them;
  - temple 4 rises over 300 maj (offset (300 − n)² / 300), with SOUND_EARTHQUAKE at n = 1 and a random x shake of the four temples every 4 maj within ±(10 − n × 10 / 300).
- **Texts (0x442648–0x442c9e).**
  - Line 1 is the temple name of the selected door (FONT_BROWNTITLE, white, centred on 326, baseline 422).
  - Line 2 is its door message (FONT_MAIN10OUTLINE2, 0xffea01, centred on 326, baseline 456).
  - The hint is word-wrapped in (20, 60, 150 × 100) in FONT_MAIN8OUTLINE 0xffff4c: UNCOVER_THE_SECRET_TEMPLES, or CLICK_ON_A_DOORWAY while another door is hovered.
- **Scores (0x44286b).** Only three entries. Scores « %d » are left-aligned at 575; vtable +0x34 / +0x38 are DrawString for a wide or a narrow string, not an alignment. Names are drawn at 470, clipped at 567. Baselines are 70 + i × line spacing.
- **Temple names.** Fallback literals « QUETZAL QUATL » (0x550504) and « POPO POYOLLI » (0x5504d0).

### `src/adventure.ts`

- **Pure functions.**
  - `advTemples(maxStage, reveal, shake)` gives the pieces back to front, each with its doors and offsets.
  - `doorAt` takes an optional cel-local alpha callback.
  - `revealTemple(opening)`: 3 → 2, 6 → 3, 9 → 4.
  - `revealProgress(maj, temple)`, `advArrivalMaj`, `advShakeStep(offsets, n, rand)`.
  - `scoreRows` (3 rows), `advLines` / `advHint`.
- **Kit.**
  - `loadAdventureKit` returns null without `advback`.
  - Doors keep their 4 cels, and cel-0 alpha masks are computed once.
  - Fonts: NativeAlienExtended16, Cancun10, Cancun8, NativeAlien48, NativeAlienExtended18, plus the STATS text font for the stage number.
  - `upscaleAdventureKit` is all or nothing, like the welcome kit.
- **`drawAdventure`.**
  - It follows the order of 0x441b50; the outlined program fonts are drawn as 8 black 1 px copies, then the colour.
  - A missing piece is skipped. `kit` null gives a vector screen with the same zones.
- **God dialogue.** `godPages`, `godDialogWidgets` and `drawGodDialog` use the shared OPTIONS frame with the GodHead (welcome helpers now exported).
- **Ending.** `ADV_ENDING`, `endingWidgets` and `drawEnding`.

### `src/main.ts`

- **Kit.** The adventure kit loads in parallel with the welcome kit, after the STATS kit; the 2 × copy is used from `HD_MIN_SCALE`.
- **Screens.** `loop()` paints each screen through `drawScene`: `drawAdventureFrame`, `drawTempleFrame` (the frozen board via `renderer.draw`, then the dialogue), `drawEndingFrame`, `drawWelcomeFrame`.
- **Inputs.** `screenMove` / `screenDown` / `screenUp` / `screenKey` route the pointer, touch and keyboard by screen.
  - Adventure screen: Left / Right walk the open doors, Enter / Space = Jouer, Escape = Menu principal.
  - God dialogue: Enter / Space = reply.
  - Ending: Enter / Space / Escape = OK.
- **Arrival.** `freshAdventureUi()` arms the arrival from `app.opening`. The earthquake plays once, and the shake is a seeded walk (`SeededRandom`).
- **Engine on the temple screen.** `enterScreen` keeps the engine for the temple screen only.
- **Level end.**
  - `checkOutcome` sends `gameover` once per level (`gameoverSent`, re-armed in `startLevel`).
  - `openStats` no longer submits the game over.
  - The vector OK label of the game-over STATS is « OK ».
  - The best time is not written in review sessions.

## Evidence (`scratchpad/shots-r221/`, nothing in the repository)

Script: `scratchpad/evidence-r221-flow.mjs`. It runs in Chromium at 1000 × 750, at DPR 2 unless noted, against `node tools/serve.mjs` serving `dist/` built with `--local`. Outcomes are forced through `?debug=1`: a win empties the chain in ZUMA mode, a loss puts one ball at the skull.

| # | Capture / log | Result |
| --- | --- | --- |
| 1 | `adventure-first.png`, `adventure-dpr1.png`, `adventure.log` | Fresh profile at both DPRs (2 × kit at renderer scales 3.125 and 1.5625):<br>- veiled temples 2 / 3, door 1 selected (glowing), STAGE 1;<br>- « TEMPLE DE ZUKULKAN » on the steps and « ENTRER DANS LES RUINES ANCIENNES ? » in the panel;<br>- the three demonstration scores, and the hint « Découvrez les temples secrets de Zuma ! ». |
| 1 | `adventure-hover.png`, `adventure-hover-play.png` | maxStage 4: door 2 hovered (cel 2, hand cursor), door 5 selected, hint « Cliquez sur une porte… », « QUETZAL QUATL » title; « Jouer » hover state. |
| 2 | `flow-stage.log`, `adventure-after-stage1.png` | 1-1 → 1-2 → 1-3 → 1-4 → 1-5 directly, the save rewritten at each level start. Won 1-5 → adventure screen, door 2 selected, opening 1, profile maxStage 1. |
| 3 | `temple-1.png`, `temple.log`, `adventure-reveal-2.png`, `adventure-revealed-2.png` | Continue at 3-5 → win → STATS → god dialogue over the frozen board:<br>- `templecomplete` (chant6) played;<br>- text INTERLOPER_OF_PUNY, button « Coâ-coâ. (Je proteste). ».<br>Reply → adventure screen with opening 3: doors locked at c = 19 maj, capture at mid-fade (c = 117), save of 4-1, maxStage 3. |
| 3b | `temple-3.png`, `temple-4-rise.png`, `temple-4-risen.png`, `rise.log` | End of stage 9 → temple 3 dialogue → arrival temple 4 (lock 375). At c = 241 temple 4 is half risen behind advmiddle, with the shake [1, 0, −1, 0] and « UN TEMPLE EN RUINES JAILLIT DU SOL. ». Exactly one `earthquake`, and the shake is back to 0 after the rise. |
| 4 | `ending.png`, `ending-dpr1.png`, `temple-final.png`, `ending.log` | 13-1 seeded at 60 000 with a 10-entry table, won with 102 400:<br>- the final god dialogue (no title, « Coâ-coâ ! (Bizarre) ! »), `templecomplete`, save null, scores saved;<br>- the ending with rank 3 = 4th row highlighted (matches the stored list), « Score : 102400 », still on the ending 1.5 s later with no engine (no restart);<br>- OK → welcome, save null, profile maxStage 12. |
| 5 | `gameover.log`, `gameover-adventure.png` | Three losses at 2-1: retry twice (save lives 3 → 2 → 1). At the game over the entry is already in `zuma.highscores.v1` and the save is cleared while the STATS are not open yet. OK → adventure screen with « ROMAIN 12345 » in the plaque. |
| 6 | `leave-resume.log`, `leave-adventure.png` | In 2-3 (score 15 500): Escape → menu → « Retour au menu principal » → confirm → adventure screen, save kept at the level start (12 000 / 2 lives). Reload → welcome → Aventure → continue prompt → Continuer → 2-3 at 12 000, 2 lives. |
| 7 | `review.log` | `?level=4-2` → level directly; win → 4-3; localStorage identical before / after (no best time, save, profile or score write). |
| 8 | `adventure-touch.log`, `adventure-touch.png`, `adventure-keyboard.log` | Touch: tap Aventure → adventure screen; tap door 3 → selected with no hover; tap Jouer → 3-1. Keyboard: Down + Enter → adventure screen; Right wraps 4 → 0; Left ×2 → 3; Escape → welcome; Enter ×2, Right, Enter → 1-1. |
| 9 | `standalone-r221-flow.png`, `standalone-r221-flow.log` | `file://…/zuma-standalone.html`: welcome → Aventure → adventure screen (2 × kit, 12 door masks readable) → Jouer → 1-1; console clean. |

All console logs are clean, except Playwright's own « Service Worker registration blocked » warning in the server runs.

**Visual verdict (DPR 2, checked on the captures):**
- **Adventure screen.** It is the original screen, not a DOM panel: jungle sky and waterfall, the four temples with their pictures, the doors lit by state, AVENTURE / RECORDS titles, the STAGE plaque on the steps, the temple name in NativeAlienExtended16, the outlined yellow texts, and the carved « Menu principal » / « Jouer » buttons in their slots.
- **God dialogue.** It is the native dialog: dialogbox, GodHead, gold title, Cancun12 text, green DialogButton.
- **Ending.** `happyending` with the NativeAlien48 title, the RECORDS plaque over the dialogbox table with the highlighted row, and a native OK.

## Deviations from Plan

### Values taken from the executable instead of the context (Step 0, plan rule)

- **Plaque:** three scores, not ten; scores left-aligned at 575; names clipped at 567. `scoreRows` returns 3 rows (the plan test said 10 rows for 12 entries).
- **Texts:**
  - Line 1 (422) is the temple name and line 2 (456) the door message, both centred on 326.
  - CLICK_ON_A_DOORWAY / UNCOVER_THE_SECRET_TEMPLES go in the hint box at the top left, not on line 2.
  - « RUINED_TEMPLE_RISES » during the rise needs no special case: it is the message of door 10, which is selected after stage 9.
- **Arrival:**
  - 75 maj is the delay. The fade lasts 100 maj, and the rise 300 maj with amplitude 300 px and a quadratic curve. At mid-rise the offset is 75 px, not half the amplitude.
  - `revealProgress(maj, temple)` takes the temple; `advArrivalMaj` is new.
- **Doors:**
  - Veiled temples draw no doors.
  - The door hit test also checks the alpha.
  - Selecting a door is silent; clicking the selected door plays it. The plan said « clic = button1 »; button1 stays on the two buttons.
- **`ADV` shape:** `scores: { nameX, nameClip, scoreX, top, rows, color }`, `hint`, `reveal: { delayMaj, fadeMaj, riseMaj, rise, shakeMax }` instead of `scoreRight` / `revealMaj`.

### Auto-fixed issues

**1. [Rule 2 - Correctness] Temple and ending screens wired in Task 3, not Task 4**
- **Issue:** removing the pass-through (Task 3) without drawing the temple and ending screens would have left a run stuck on an empty screen after any temple. The r221-welcome lock still expected `temple-done` / `ending-done` in main.js.
- **Fix:** the god dialogue and the ending, with their inputs, went into the Task 3 GREEN commit. Task 4 kept the routing changes, and its RED locks failed on those.
- **Commit:** `6da24b7`.

**2. [Rule 2 - Correctness] Review sessions wrote the best time**
- **Issue:** `openStats` stored `zuma.best.<id>` after a won review level, so `review.log` would not have shown an unchanged storage.
- **Fix:** guarded by `!this.app.review`.
- **Commit:** `53fdaf0`.

**3. [Rule 1 - Bug, found on the DPR 2 capture] Ending title cut at the top, score unreadable**
- **Issue:** NativeAlien48 has an 81 px ascent, so the accent of « FÉLICITATIONS ! » left the screen. « Score : N » in brown NativeAlienExtended16 was lost on the golden medallion.
- **Fix:** title baseline 74; the score line moved into the frame under the rows, in the STATS label gold.
- **Commit:** `8d8b445`.

**4. [Plan adjustment] Game-over submission moved from `openStats` to `checkOutcome`**
- Per the plan lock. It now fires when the engine reaches `gameover`, about 90 frames earlier than before.

### Test adjustments (own tests, in their GREEN commit)

- `adventureButton(id)` → `adventureButton(id, sound = true)`: the method signature lock, plus the door path `adventureButton('play', false)` (silent like 0x440e06). Commit `6da24b7`.
- The compiled `closeStats` puts a newline before `this.dispatch`, so the regex now allows whitespace there (RED commit).
- The wrap-around lock was narrowed to `this.progress = { … }` (the class field initialiser is not a restart).
- The STATS label lock now matches the simplified `outcome === 'lost' ? 'Réessayer' : 'OK'`.
- The r221-welcome comment on the old pass-through became « R2.0.21 (D-02/D-03) … ».
- MODULES locks updated with « R2.0.21 (D-02/D-03): adventure after welcome (plan 06-04) »: r215-presentation ×2, r218-presentation, r221-progress, r221-welcome (build and worker shell).

## Hypotheses carried into the code (for 06-05 / UAT)

| # | Hypothesis / choice | Where |
| --- | --- | --- |
| FONT | « !program » fonts approximated: MAIN10OUTLINE2 = Cancun10 + 1 px black outline, MAIN8OUTLINE(SCORE) = Cancun8 + outline, FONT_DIALOG = the STATS Cancun12 | `advWrite`, `AdventureKit.fonts` |
| HINT | First hint baseline = rect top + font ascent (Sexy WriteWordWrapped not read) | `advTexts` |
| SHAKE | Shake walk seeded per arrival (SeededRandom), the original uses rand() | `freshAdventureUi` |
| ESPACE | After temple 4 the screen shows STAGE 13 with the texts of door 12 (the original clamps to door 12 / STAGE 12) | `advLines`, `advTexts` |
| GOD | God dialogue layout = the OPTIONS frame; no title for the final dialogue; text left-aligned | `drawGodDialog` |
| END | Ending layout (title 74, plaque 84, frame 118–472, rows from 178, score 374, OK 400) designed for D-10, no original counterpart | `ADV_ENDING` |
| KEYS | The original adventure screen has no keyboard; Left / Right / Enter / Escape added | `adventureKey` |

## Open points for 06-05

- **R221_RELEASE_NOTES / README.** Describe:
  - the adventure screen and its arrival animations;
  - the god dialogue;
  - the ending (no credits by D-10);
  - the routing table (next level, stage → adventure screen, temple → god → adventure, 13-1 → god → ending → welcome, game over → adventure, leave → adventure);
  - review sessions with no storage write;
  - the evidence table above.
- **CONCERNS.**
  - The frozen board under the god dialogue still shows the HUD's frozen « +100 » floats and the touch STATS button (cosmetic).
  - The commas of Cancun12 render small (pre-existing font, visible in long god texts).
- **Phase 7 (music).** Positions 32 (adventure), 0 (ending), 39 (game over) are not played.
- **Not done (out of scope / D-10).** Credits scrolling, the UFO → credits link, and the `IMAGE_CONGRATULATIONS` generated text picture (the pack string is used instead).

## Known Stubs

None. Every screen of the state machine is drawn and driven; the vector fallbacks are complete screens.

## Threat Flags

None beyond the plan's register:
- **T-06-13:** names are drawn with bitmap fonts on the canvas only; no `innerHTML` (locked).
- **T-06-14:** the game over is sent once per level through `gameoverSent`, and the final score only by `reduceApp` on the last `won`. `gameover.log` / `ending.log` show one entry each.
- **T-06-15:** `loadAdventureKit` returns null without `advback` and skips missing pieces; the vector screens are tested.

## Self-Check: PASSED

Verified on disk and in `git log` on 2026-10-11:
- **Files:**
  - created: `src/adventure.ts`, `tests/r221-adventure.test.mjs`;
  - modified: `src/main.ts`, `src/welcome.ts`, `src/progress.ts`, `tools/build.mjs`, `public/sw.js`, plus the four test files with MODULES locks.
- **Commits:** `64cc484`, `c0f44f4`, `1ecb0e3`, `7053c87`, `94e32e5`, `6da24b7`, `a984c76`, `53fdaf0`, `8d8b445`.
- **Checks:**
  - `npm test` → 478/478 + `publication guard: 566 tracked files, none proprietary`;
  - `npm run check` clean;
  - `node tools/build.mjs --standalone` OK;
  - every evidence file of the plan's Task 5 list is present.
- **Repository state:**
  - `git status` clean: no PNG, `dist/`, `standalone/` or `private_assets/` tracked;
  - no model identifier and no PopCap staff name in committed files;
  - STATE.md and ROADMAP.md untouched.
