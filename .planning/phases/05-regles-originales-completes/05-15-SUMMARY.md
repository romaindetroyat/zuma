---
phase: 05-regles-originales-completes
plan: 15
subsystem: release + documentation (+ STATS tip fix)
tags: [release-notes-r220, readme-install-per-device, concerns-d42, uat-8-decisions, uat-9-opened, deferred-items, stats-tip-arial, layout-tip-block, standalone-r220, deploy-artefact]

# Dependency graph
requires:
  - plan: 05-14
    provides: R2.0.20 STATS footer OK, generated service worker, --deploy, icons, install guide, iOS items, tests r220-*, evidence under scratchpad/shots-r220
  - doc: 05-RESEARCH-02.md
    provides: addendum Q5 (Dialog::Resize 0x4ac160, insets 0x43ef30)
  - doc: 05-CONTEXT.md
    provides: D-36, D-38, D-42, D-43 (standalone kept; private hosting next)
provides:
  - "statsdialog.ts: layoutTipBlock (two-line column, else three-line run-in in the same font, layoutTip beyond), wrapTextWidths, STATS_LAYOUT.tip.runInLines 3 / runInFirst 336; composeStatsDialog draws the label on the block's baseline"
  - "tests/r220-tip.test.mjs (4): kit tip font = Arial12Bold, layoutTipBlock, composition with the tip font, the seven pack tips complete without ellipsis (skipped without the pack)"
  - "R220_RELEASE_NOTES.md (STATS + tip fix, PWA hors ligne et mises à jour, Installation, iOS / iPadOS, Outils, Tests, Build, Hypothèses)"
  - "README: baseline R2.0.20, « Ouvrir et installer Zuma » (Mac / PC, Android, iPhone / iPad, hors ligne, mises à jour, en local, artefact privé), touch controls, STATS OK and tip, r220 locks, status"
  - "CONCERNS: R2.0.20 choices, service worker caches, legal model D-42, iOS storage, verification limits, fragile areas, missing items, audit R2.0.20"
  - "05-UAT: U39 / U40 / U41 « → livré en 05-14 (…) », « Neuvième session (à remplir) » with an empty findings table"
  - "deferred-items: « Relevés en 05-14 / 05-15 »"
affects: [UAT 9 (user), 05-16 private hosting]

tech-stack:
  added: []
  patterns:
    - "loadStatsKit exercised in Node with a fake pack and a mocked fetch (synthetic PopCap scripts, or the real pack scripts when present)"
    - "composeStatsDialog exercised in Node with a Proxy 2D context and recording fake fonts"

key-files:
  created: [tests/r220-tip.test.mjs, R220_RELEASE_NOTES.md]
  modified: [src/statsdialog.ts, tests/r217-presentation.test.mjs, README.md, .planning/codebase/CONCERNS.md, .planning/phases/05-regles-originales-completes/05-UAT.md, .planning/phases/05-regles-originales-completes/deferred-items.md]

decisions:
  - "Tip regression root cause = layout, not loading: Arial12Bold is the kit's tip font at 1 × and 2 ×, but two 270 px lines hold only 2 of the 7 pack tips, so layoutTip switched to Cancun10 (capitals) and cut with « ... »; the R2.0.19 capture showed a short random tip"
  - "Two lines are impossible in Arial12Bold (the longest tip needs 451 px per line, the frame is 422 px): the requested « at most two lines » test is replaced by « two-line column when it fits, else three-line run-in, always complete in Arial12Bold »"
  - "Run-in paragraph rather than a narrower font: first line after « ASTUCE : », next lines from the label's x (347 px), baselines 336 / 350 / 364, label on the first line"
  - "The notes follow the code for the iOS audio session: 'ambient' (orchestrator decision in 05-14), not D-38's 'playback'"
  - "Orchestrator / user decisions recorded in CONCERNS and UAT: standalone maintained and shipped with every version (D-43); private hosting (05-16) next, documented as not done"

metrics:
  duration: "~70 min (07:52 → 09:05 UTC)"
  completed: 2026-10-11
  tasks: "3 of 3 automated + Job 1 fix (RED → GREEN); human check pending (UAT 9)"
  commits: 5 (+ this summary)
  tests: "284/284 + publication guard (was 280; r220-tip +4)"
---

# Phase 5 Plan 15: Release R2.0.20 — tip fix, notes, README, concerns, UAT 8 decisions, UAT 9 opened — Summary

Baseline 2.0.20 is now documented and ready for the ninth UAT. First, a fix for the STATS tip: it was drawn in Cancun10 capitals and cut with « ... ». It is now always complete in Arial12Bold.

- **Release notes.** `R220_RELEASE_NOTES.md` cites each rule with its source and its lock:
  - the Q5 footer rule of the STATS OK;
  - the generated service worker with its two caches and confirmed updates;
  - installation (PNG icons, manifest, Apple metadata, guide per platform);
  - iOS / iPadOS (safe areas, frog tap, rotation, `audioSession` « ambient »);
  - `--deploy`;
  - the 05-15 tip fix.
- **README.** It explains how to open and install the game on each device, offline use, updates, local use and the private artefact. It gives no hosting step.
- **CONCERNS, UAT, deferred items.**
  - `CONCERNS.md` records the D-42 legal model, iOS storage and the limits of an emulated verification.
  - `05-UAT.md` marks U39–U41 as delivered and opens « Neuvième session (à remplir) ».
  - `deferred-items.md` lists what 05-14 / 05-15 left out.

284 tests are green. The standalone is 7 809 949 bytes and boots from `file://` with the complete tip. The `--deploy` artefact has 291 files (5.7 MiB). Nothing was deployed.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 0 | Job 1 — STATS tip complete in Arial12Bold (regression fix, RED → GREEN) | `0035e15` (RED), `ff03a19` (GREEN) | tests/r220-tip.test.mjs, src/statsdialog.ts, tests/r217-presentation.test.mjs |
| 1 | Release notes R2.0.20 and README | `d68735d` | R220_RELEASE_NOTES.md, README.md |
| 2 | CONCERNS, UAT 8 decisions, ninth session, deferred items | `120117e` | .planning/codebase/CONCERNS.md, 05-UAT.md, deferred-items.md |
| 3 | Final verification, standalone, `--deploy`, evidence, Build section | `a99a9a6` | R220_RELEASE_NOTES.md |
| — | Human check (UAT 9) | pending | — |

## The tip regression (Job 1)

**What was reported.** On the R2.0.20 capture (`shots-r220/stats-ok-3-3-dpr2.png`), « ASTUCE » showed « FAITES TRAVERSER UN ESPACE VIDE OU PLUS À UNE BALLE POUR OBTENIR UN... » in uppercase Cancun10, cut. The user's R2.0.19 screenshot showed « Appuyez sur la barre d'espace / pour mettre le jeu en pause. » in Arial12Bold on two lines.

**Root cause.** The font was never lost. The cause is the D-20 layout, which has not changed since R2.0.17 (05-08):

- Playwright in the served `--local` build, at DPR 2 and DPR 1, shows `statsKit.fonts.tip` = `arial12bold` (pixelScale 2) and `fonts.tipSmall` = `cancun10`.
- `layoutTip` wraps the tip on two 270 px lines after « ASTUCE : ». With the real pack scripts, only **2 of the 7** tips fit there in Arial12Bold: « Tirez sur les pièces… » and « Appuyez sur la barre d'espace… ».
- For the other five, `layoutTip` switched to the smaller font, Cancun10. Its charmap maps lowercase to capitals. It still did not fit, so the tip was cut with « ... ».
- The tip is picked at random (`pickTip`). The R2.0.19 capture happened to show a short tip; the R2.0.20 capture showed a long one.

**Ruled out.** None of these changed the tip's width or its font:

- the 05-14 changes (`fa8b794`: tip box height `STATS_OK.y − 2 − 320` = 51, baseline 348; only the vertical changed);
- `upscaleStatsKit`;
- font memoisation;
- the service worker / `--deploy` asset list;
- served vs standalone.

**Why not two lines.** In Arial12Bold the longest tip (CREATE_COMBOS…) needs **451 px per line** to fit on two lines. That is more than the whole frame (422 px) and far more than the 270 px column. Fitting every tip on two lines would need a font about 0.6 × the size: an unreadable 7 px.

**Fix (`ff03a19`).** `layoutTipBlock`:

1. Keep the R2.0.19 two-line column when the tip fits in it.
2. Otherwise lay out a run-in paragraph on up to three lines in the **same font**. The first line goes after the label. The next lines start at the label's x and are 347 px wide. Baselines are 336 / 350 / 364, and the label sits on the first one.
3. Use `layoutTip` (smaller font, ellipsis) only beyond three lines. No pack tip reaches that.

`composeStatsDialog` draws the label on the block's label baseline. `wrapTextWidths` is the wrap with a width per line.

**Locks (`tests/r220-tip.test.mjs`):**

- the kit's tip font is Arial12Bold when the pack provides it, with Cancun10 only as fallback. Fake pack plus mocked fetch; the test passed before the fix too, which confirms the kit was not the cause;
- `layoutTipBlock` column and run-in geometry;
- the composition draws a long tip complete with the tip font;
- with the pack present, all seven tips of `strings.json` are complete in Arial12Bold inside the inset, without ellipsis. The test also asserts that two lines cannot hold the longest tip even across the frame.

The `r217-presentation` lock now expects `layoutTipBlock(`, which falls back on `layoutTip(`.

**Evidence** (`scratchpad/shots-r220/`, script `scratchpad/tip-r220.mjs`):

- **Before:** `tip-before-dpr{1,2}-sheet.png` and `-full.png` show 5 of 7 tips in Cancun10 capitals with « ... ».
- **After:** `tip-after-dpr{1,2}-sheet.png` and `-full.png` show 7 of 7 complete and mixed-case: 2 in the column, 5 on three lines.
- **Logs:** `tip-before.log` and `tip-after.log` contain the font identities.
- **Looked at:** every line sits inside the inset with a 2–5 px margin. The 14 px leading is tight; descenders almost touch the next line's capitals. This is listed for UAT 9.
- **Standalone:** `standalone-tip-dpr{1,2}-{random,longest}.png`, `standalone-tip-crops.png`, `standalone-tip.log`. Boots on `file://` at DPR 2 and 1, the tip font is `arial12bold`, the longest tip is complete on three lines, console clean.

## Verification

- **Suite and checks.** `npm test` → **284/284** + `publication guard: 529 tracked files, none proprietary`. `npm run check` clean. `node tools/guard.mjs` green.
- **Task gates.** Task 1 grep set OK (no « wrangler » or « github pages » in the README). Task 2 grep set OK (3 « livré en 05-14 »). Task 3 full chain OK.
- **Standalone.** `node tools/build.mjs --standalone` → **7 809 949 bytes**, 22 `R2.0.20` literals (code comments included). `tests/r215-presentation.test.mjs` 15/15.
- **`--deploy` artefact.** `node tools/build.mjs --deploy` → 291 files, 5.7 MiB (5 969 088 bytes), pack db5c071e6a40, `dist/version.json` (2.0.20, assets 269).
- **Git.** No `.png`, `dist/`, `standalone/` or `private_assets/` tracked; `git status` clean after each commit.

### Evidence (`scratchpad/shots-r220/`, none in Git)

| Evidence | Source | Measurements |
| --- | --- | --- |
| `offline.log`, `offline-1-1.png` | **refreshed in 05-15** on the final `--deploy` artefact | first visit: 291 worker requests (269 under `assets/`); caches `zuma-shell-<build>` 21, `zuma-assets-db5c071e6a40` 269 / 269; 6 077 289 B; offline reload: pack loaded, « Spirale du destin », 40 balls, badge « … hors ligne : 6,0 Mo », console clean |
| `installable.log` | **refreshed in 05-15** | `getInstallabilityErrors` `[]`, manifest errors `[]`, id `./`, start_url `../index.html`, scope `../`, icons 192 / 512 / maskable 512 PNG at size; `getAppId` `{}` (headless) |
| `tip-before-*`, `tip-after-*`, `standalone-tip-*` | **05-15** (Job 1) | see above |
| `stats-ok.log`, `stats-ok-3-3-dpr2.png`, `stats-ok-hover-crop.png`, `menu-footer-dpr2.png` | 05-14 | `#result-continue` = layout rectangle within 0.05 px; insets STATS 29 / 29 / 25, menu 30 / 30 / 22; hover inside the corner only |
| `update-keeps-assets.log`, `update-toast.png` | 05-14 | same fingerprint after a rebuild; 22 worker requests, all shell, 0 under `assets/`; « Mettre à jour » → new stamp, old shell cache gone, pack cache kept |
| `install-prompt.log`, `install-prompt-card.png`, `install-installed-mode.png` | 05-14 | synthetic `beforeinstallprompt` → « Installer Zuma », one `prompt()`; installed mode → no card |
| `iphone.log` + 6 captures | 05-14 | iPhone 15 emulated: overlay in portrait and pause, stage 457 × 343, frog tap swaps without shooting, slider by finger, no card when `navigator.standalone` |
| `ipad.log` + 3 captures | 05-14 | iPad Pro 11 emulated: iOS line, portrait with bands (834 × 625.5), landscape 1112 × 834 |
| `standalone-r220.log` + 2 captures | 05-14 | `file://` desktop and iPhone UA boot, no worker / manifest / PNG links / install card |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] STATS tip in Cancun10 capitals cut by « ... » for 5 of the 7 pack tips (Job 1, orchestrator request)**
- **Found during:** orchestrator review of the R2.0.20 capture, before Task 1.
- **Issue:** the two-line column of D-20 could not hold the long tips in Arial12Bold, so `layoutTip` fell back to Cancun10 and the ellipsis.
- **Fix:** `layoutTipBlock`: two-line column when it fits, else a three-line run-in in the same font; ellipsis only beyond.
- **Files modified:** src/statsdialog.ts, tests/r220-tip.test.mjs, tests/r217-presentation.test.mjs.
- **Commits:** `0035e15` (RED), `ff03a19` (GREEN). Recorded in the release notes (« Astuce »), CONCERNS, UAT 9 and deferred items.

### Plan / request adjustments

- **« At most two lines » test replaced.** The requested test (« every tip fits in at most two lines in that font at the tip width without ellipsis ») cannot pass with any layout inside the frame: two lines need 451 px, the frame is 422 px.
  - The lock now asserts that each tip is complete in Arial12Bold, never in the small font, with no ellipsis, at most three lines, inside the inset, and that the short tips keep the two-line column.
  - It also records why two lines are impossible.
  - This departs from D-20 (« deux lignes au plus ») and is listed as a hypothesis for UAT 9.
- **The RED commit's kit test passed before the fix.** This is intentional: it documents that the kit was not the cause. The other three tests failed, at import, because `layoutTipBlock` did not exist yet.
- **`audioSession` in the notes is « ambient »**, as in the code (orchestrator decision in 05-14), whereas the plan's text says « playback ». The notes present « playback » as the alternative to decide in UAT 9.
- **U41** also got its « → livré en 05-14 » decision, along with U39 and U40, with real-device verification deferred to UAT 9. U42 and U43 are left as they were: private hosting and scores are 05-16.
- **Tests that 05-14 did not write.** `applyUpdate` and `shouldRequestPersist` have no dedicated test. The notes cite only the tests that exist (`updateReady`, `activate` / `skip-waiting`, `formatSize`, the toast lock).
- **What was not refreshed.** Only the `offline` and `installable` sections of `evidence-r220.mjs` were rerun, as the plan asks. The other 05-14 evidence is referenced unchanged.

## Not verifiable here

- Real iPhone / iPad: install via « Sur l'écran d'accueil », isolated storage and first online launch, eviction, real safe areas, `audioSession` behaviour with the silent switch, audio unlock and resume after a call or lock. WebKit is not available, and a real install needs HTTPS, which waits on 05-16.
- Safari macOS « Ajouter au Dock », Edge, Android: not exercised (Chromium only).
- The user's judgement of the three-line tip and its 14 px leading.

## Known Stubs

None added.

## Threat Flags

None beyond the plan's register:
- **T-05-53:** the documents contain addresses, numbers and procedures only, with no pack data and no Cloudflare token or identifier. The guard ran in `npm test`.
- **T-05-54:** `dist/` and `standalone/` stay ignored, the captures stay in the scratchpad, `git status` is clean, and nothing was deployed.

## Awaiting

The human check of Task 3 (UAT 9), to be recorded in `05-UAT.md` « Neuvième session »:

1. **Mac.** Run `npm run dev`, open `http://localhost:8080/` in Chrome and use « Installer Zuma ». Launch the installed app at level 1-1. Cut the network and relaunch: the game should start. In Safari, use « Fichier › Ajouter au Dock ». Rebuild with the app open: « Nouvelle version disponible » → « Mettre à jour ».
2. **STATS at level 3-3.** The OK spans the inner width at the bottom, like « Retour à la partie » in the menu. The tip is complete and in lowercase (open the STATS several times).
3. **Touch.** A tap on the frog swaps; MENU and the sliders work by finger.
4. **iPhone and iPad.** Deferred until the private HTTPS hosting exists (05-16).

STATE.md, ROADMAP.md and 05-16-PLAN.md were not touched, as instructed.

## Self-Check: PASSED

Verified on disk and in `git log` on 2026-10-11:
- Files: `tests/r220-tip.test.mjs`, `R220_RELEASE_NOTES.md`, the README / CONCERNS / UAT / deferred edits, and this summary are present.
- Commits: `0035e15`, `ff03a19`, `d68735d`, `120117e`, `a99a9a6` are present.
- Tests: 284/284 + guard.
- Evidence logs: `tip-before.log`, `tip-after.log`, `standalone-tip.log`, `offline.log`, `installable.log` are present in `scratchpad/shots-r220/`.
