---
phase: 05-regles-originales-completes
plan: 14
subsystem: presentation + PWA + build
tags: [stats-ok-footer-rule, dialog-resize-0x4ac160, draw-dialog-button, generated-service-worker, pack-precache, deploy-artefact, update-toast, png-icons, install-guide, ios-touch, rotate-overlay, safe-areas, audio-session-ambient, baseline-2.0.20]

# Dependency graph
requires:
  - plan: 05-12
    provides: R2.0.19 engine / HUD / STATS / menu, evidence-script patterns
  - plan: 05-13
    provides: R2.0.19 release, UAT 8 (U39–U43)
  - doc: 05-CONTEXT.md
    provides: D-36 (STATS OK), D-38 (iPhone / iPad), D-42 (PWA = exact local game, private hosting later, no share, no import)
  - doc: 05-RESEARCH-02.md
    provides: Q4 dialog geometry (partial), method, inner PE in the scratchpad
provides:
  - "statsdialog.ts: STATS_OK_RULE { 29, 29, 25, 48 } (Dialog::Resize 0x4ac160 + 0x43ef30 insets, converted to our opaque frame), statsOkRect, STATS_LAYOUT.ok = { 138, 373, 364, 48 } derived, okLabelBaseline derived, tip box h 51 / baseline 348, drawDialogButton (three DialogButton slices) shared with the menu"
  - "05-RESEARCH-02.md addendum « Q5. Bouton de pied du STATS (05-14) »"
  - "public/sw.js template + tools/swgen.mjs (packFiles, packHash, swSource, deployError): caches zuma-shell-<build> and zuma-assets-<sha256 12>, only missing pack entries downloaded, assets/ cache first, navigation-only index.html fallback, api/ and cdn-cgi/ never intercepted nor cached, skipWaiting on « skip-waiting » only"
  - "tools/build.mjs: MODULES + pwa, generated dist/sw.js, --deploy (implies --local, refused without pack, dist/version.json, « à héberger uniquement en privé »), PNG icons into dist/public, standalone strips the PNG / apple-touch links; npm run deploy"
  - "tools/icons.mjs: crc32, encodePng, renderIcon, ICONS (192 / 512 any, 512 maskable, 180 apple-touch)"
  - "src/pwa.ts: updateReady, registerServiceWorker, applyUpdate, shouldRequestPersist, offlineStatus, formatSize, installGuidance, readInstallEnv, needsRotation, fitArea"
  - "main.ts: update toast, offline size in the help badge, install card (start screen + help view « Installer »), beforeinstallprompt / appinstalled, frog tap → swap, rotate overlay pause, safe-area fit, gesturestart / dblclick prevented, Plein écran offered only with the Fullscreen API"
  - "audio.ts: audioSession 'ambient', bindUnlock (touchend / pointerup / click), resume when visible (suspended / interrupted)"
  - "render.ts: FROG_TAP_RADIUS 32, frogHit; menudialog.ts: MenuOptions { install, fullscreen }, 'install' widget"
  - "index.html: Apple / mobile web-app metadata, apple-touch-icon 180, PNG icon, viewport user-scalable=no, #install-card, #rotate, #update-toast; manifest: id, display_override, categories, dir, PNG icons"
  - "tests r220-presentation (9), r220-pwa (17), r220-ios (7); r215-presentation / r218-presentation / r219 adjusted with « R2.0.20 » comments"
affects: [05-15 (release notes R2.0.20, README, CONCERNS, UAT 9), private hosting plan (Cloudflare Access, D1 scores)]

tech-stack:
  added: []
  patterns:
    - "Generated service worker from a readable template (the r217 lock still reads every module in public/sw.js), filled by pure helpers the tests call on temporary folders"
    - "Service worker behaviour tested by running the generated worker in node:vm over simulated caches / fetch (install, activate, message, fetch routing)"
    - "PNG encoder + rasteriser without dependency; the test decodes the icons with its own CRC table and zlib.inflateSync"
    - "Playwright with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 to count the worker's own requests (pack not re-downloaded on update)"

key-files:
  created: [src/pwa.ts, tools/swgen.mjs, tools/icons.mjs, tests/r220-presentation.test.mjs, tests/r220-pwa.test.mjs, tests/r220-ios.test.mjs]
  modified: [package.json, src/core.ts, src/statsdialog.ts, src/menudialog.ts, src/main.ts, src/render.ts, src/audio.ts, public/style.css, public/sw.js, public/manifest.webmanifest, index.html, tools/build.mjs, tests/r215-presentation.test.mjs, tests/r218-presentation.test.mjs, tests/r219.test.mjs, .planning/phases/05-regles-originales-completes/05-RESEARCH-02.md]

decisions:
  - "D-36 resolved by the executable (not the fallback): STATS_OK_RULE 29 / 29 / 25 / 48 — box insets 36 / 36 / 36 (0x43ef30) minus the dialogbox mask margins 11 / 3 / 11, horizontal asymmetry shared because our frame and the original box are both centred on 320; our measured frame is kept (read box: 460 px wide from y 90)"
  - "Menu footer unchanged (R2.0.18 30 / 30 / 22): the plan locks it; 1 px / 3 px from the STATS rule"
  - "Tip inset keeps its top (r216 lock: rows above it for every line height) and ends 2 px above the OK (h 60 → 51), baseline 350 → 348, instead of moving the whole box up"
  - "Orchestrator: navigator.audioSession.type = 'ambient' (silent switch respected), hypothesis for UAT 9"
  - "Coordinator: index.html fallback for navigations only; api/ and cdn-cgi/ (paths at the root or under the worker's folder) never intercepted nor cached; same-origin GET only"
  - "Old worker reads its own caches only (shell / assets by name, not caches.match over all caches): no mix of versions while an update waits"
  - "A failed pack entry does not abort the install; it is fetched and kept at its first request"
  - "storage.persist() not requested in Firefox (it prompts there): persisted() read instead"
  - "Install card: « × » remembers (zuma.install.hidden) on the start screen, « Jouer » continues for this launch only; « Installer » in the help view whenever there is an instruction"
  - "No install guide outside http(s): the file:// standalone cannot be added to a home screen (found in verification)"
  - "A level that starts under « Tournez votre appareil » stays paused (the pause belongs to the overlay)"

metrics:
  duration: "~40 min (07:10 → 07:50 UTC, plus summary)"
  completed: 2026-10-11
  tasks: 5
  commits: 11
  tests: "280/280 + publication guard (was 247; r220-presentation +9, r220-pwa +17, r220-ios +7; replaced locks keep their count)"
---

# Phase 5 Plan 14: STATS footer OK, offline installable PWA, iPhone / iPad — Summary

The STATS OK is now the footer button of the original `Dialog`, read in `Zuma.exe` rather than guessed (U39, D-36). `Dialog::Resize` (0x4ac160) places a single footer button at background + content insets with the full inner width, glued to the inner bottom edge, at the `DialogButton` height (48). The STATS insets are background 0 / 80 / 0 / 0 and content 36 / 52 / 36 / 36 (0x43ef30). Converted to our opaque frame (the mask leaves 11 / 3 / 11 px), the OK is 138, 373, 364 × 48. It is drawn in three slices like the menu buttons, with its click zone exactly on the drawn rectangle.

The PWA is exactly the `--local` game (U40, D-42). A generated service worker precaches the shell and the whole pack (269 files). The game reloads and plays offline after the first visit. An update downloads only the shell (22 requests, 0 under `assets/`) and activates only on « Mettre à jour ». `node tools/build.mjs --deploy` produces the private artefact: 291 files, 5.7 MiB, pack db5c071e6a40. Nothing was deployed.

Installation (D-38):
- PNG icons are generated at build, and the manifest and Apple metadata are complete; Chromium reports no installability error.
- Each platform gets its own install guide, and there is no share button.

Touch:
- A tap on the frog swaps the balls.
- « Tournez votre appareil » pauses a phone held in portrait.
- The stage stays inside the safe areas.
- « Plein écran » is hidden without the Fullscreen API.
- iOS audio is unlocked on touchend / pointerup / click and resumed when the page is visible again.

Baseline 2.0.20, 280 tests green. The standalone (7 807 110 bytes) still boots from `file://` with a clean console.

## Tasks

| # | Task | Commits | Files |
| --- | --- | --- | --- |
| 1 | STATS OK from the Dialog footer rule (D-36), Q5 addendum, baseline 2.0.20 | `320b35e` (RED), `fa8b794` (GREEN) | src/statsdialog.ts, src/menudialog.ts, public/style.css, src/core.ts, package.json, tests/r220-presentation.test.mjs, tests/r215-presentation.test.mjs, tests/r219.test.mjs, 05-RESEARCH-02.md |
| 2 | Versioned service worker (shell + pack), `--deploy`, « Nouvelle version disponible » (D-42, PWA-02) | `a4582a1` (RED), `0d1335e` (GREEN) | tools/swgen.mjs, public/sw.js, tools/build.mjs, package.json, src/pwa.ts, src/main.ts, index.html, public/style.css, tests/r220-pwa.test.mjs, tests/r215-presentation.test.mjs, tests/r218-presentation.test.mjs |
| 3 | Installability: PNG icons, manifest, Apple metadata, install guide (D-38 §1–3) | `f41788f` (RED), `3050f3d` (GREEN) | tools/icons.mjs, tools/build.mjs, public/manifest.webmanifest, index.html, public/style.css, src/pwa.ts, src/main.ts, src/menudialog.ts, tests/r220-pwa.test.mjs, tests/r220-presentation.test.mjs |
| 4 | iOS / iPadOS: safe areas, full touch, frog swap, conditional fullscreen, rotation, audio (D-38 §3–6) | `76fbc0d` (RED), `8aaf15a` (GREEN) | src/render.ts, src/main.ts, src/menudialog.ts, src/audio.ts, src/pwa.ts, index.html, public/style.css, tests/r220-ios.test.mjs |
| 5 | Verification: suite, builds, offline, update, installability, emulation; fix found: no install guide on `file://` | `19511ff` (RED), `1ab52ac` (GREEN) | tests/r220-pwa.test.mjs, src/pwa.ts |

(`32c294e` and `b06e0e5`, interleaved in the log, are another agent's research 05 commits.)

## What was built

### STATS OK (D-36, spike 02 Q5)

- **The reading.** The STATS constructor 0x446ec0 calls 0x43ef30 with button mode 3 (`BUTTONS_FOOTER`, one button) and the head flag. That function sets `mBackgroundInsets` (0, 80, 0, 0) and `mContentInsets` (36, 52, 36, 36). `mButtonHeight` is the button image height (0x4b34b2) = 48. `Dialog::Resize` is vtable slot 25 = 0x4ac160; the STATS jumps to it from 0x440a60. The dialog is sized by 0x434540: width max(460, header + insets + 20), centred x = (640 − W) / 2, y = 10, so the drawn box starts at y 90 and is 460 px wide. Details in `05-RESEARCH-02.md` § Q5. Confidence: HIGH for the rule, MEDIUM for the mask-margin conversion.
- **The rule.** `STATS_OK_RULE` = left 29, right 29, bottom 25, height 48, applied to our measured frame (109, 91, 422 × 355) by `statsOkRect`. `STATS_LAYOUT.ok` = 138, 373, 364 × 48 (was 260, 382, 120 × 48). `okLabelBaseline` = ok.y + 30. The tip inset now ends 2 px above the OK (box h 51, baseline 348).
- **Drawing and click zone.** `drawDialogButton(ctx, image, state, rect, sourceScale, edge = 22)` replaces the single 120 px `drawImage`; `MenuPainter.button` uses the same helper (identical rendering). The CSS rule `#stats.stats-original .stats-ok` is now left 21.5625 %, top 77.7083 %, width 56.875 %, height 10 %.

### Service worker and `--deploy` (D-42, PWA-02)

- **Template and caches.** `public/sw.js` is a template: `SHELL_CACHE = 'zuma-shell-' + VERSION`, `ASSETS_CACHE = 'zuma-assets-<pack hash>'`. The literal `SHELL` stays in the template (so the r217 lock can still read it); `ASSETS` is filled at build.
- **Install and activate.** `install` caches the shell with `addAll`, then fetches only the pack entries missing from the pack cache, in batches of 8; a failed entry is retried at its first request. `message` `skip-waiting` → `skipWaiting()`. `activate` keeps only the two caches, then `clients.claim()`.
- **Fetch routing** (same-origin GET only):
  - `api/` and `cdn-cgi/` (at the root or under the worker's folder) are never intercepted.
  - Navigations are served from this build's shell (`ignoreSearch`), then the network, then the cached `index.html`.
  - `assets/` is served from the pack cache first; a network answer is copied in when `ok`.
  - Anything else comes from this build's shell, then the network; a failure stays a failure (never `index.html`).
- **`tools/swgen.mjs`.** `packFiles(dir)`; `packHash(dir)` = sha256 over (path, size, content), 12 hex digits, null without files; `swSource(template, …)`; `deployError(packDir)` returns the French refusal.
- **`tools/build.mjs`.** `pwa` added to MODULES after `original`. The shell list = `./`, `./index.html`, every file of `dist/public` (icons included), every module. `--deploy` implies `--local`, exits 1 without the pack, writes `dist/version.json` and logs « artefact de déploiement : dist/ (N fichiers, X Mio, empreinte du pack h) — à héberger uniquement en privé ». The CI is unchanged (public copy only).
- **`src/pwa.ts`.** `registerServiceWorker` (http(s) only, `updateViaCache: 'none'`, `updatefound` / `statechange`, `update()` when visible), `updateReady`, `applyUpdate` (posts `skip-waiting`, reloads once on `controllerchange`), `offlineStatus` (persist + estimate after `ready`), `formatSize`.
- **`main.ts`.** Shows `#update-toast` (« Nouvelle version disponible », « Mettre à jour », « Plus tard »; 44 px buttons). The help badge gains « · hors ligne : 6,0 Mo ».

### Installability (D-38 §1–3)

- **Icons.** `tools/icons.mjs` rasterises `icon.svg` with 4 × 4 supersampling into icon-192, icon-512 (transparent corners), icon-maskable-512 and apple-touch-icon 180 (opaque #120c06, design at 80 % inside the safe zone). The PNG encoder uses its own CRC-32 table.
- **Manifest.** Relative `id: "./"`, `start_url` and `scope` (any hosting path works), fullscreen + `display_override`, landscape, `categories`, `dir`, PNG icons, SVG kept.
- **`<head>`.** apple-touch-icon 180, PNG icon, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, black-translucent status bar, title « Zuma », viewport `viewport-fit=cover, user-scalable=no`.
- **Install card** (`#install-card`):
  - « Installer Zuma » button, shown when a `beforeinstallprompt` event was kept.
  - iOS line with the share glyph: « Touchez [glyph] Partager puis « Sur l'écran d'accueil » ».
  - macOS Safari line: « Fichier › Ajouter au Dock ».
  - Offline note, then « Jouer » and « × ».
- **`installGuidance(env)`** returns, in order: installed / served = false → nothing; kept prompt → prompt; iPhone / iPod / iPad UA, or an iPadOS « Mac » with more than one touch point → `ios-share`; macOS Safari → `mac-safari-dock`; anything else → nothing.
- **Where the card appears.** On the start screen before the first game, unless closed for good with « × ». From the help view of the menu, through « Installer » (no original string; left button, confirm-view geometry), over the paused menu. `appinstalled` closes it. There is no share button anywhere.

### iPhone / iPad (D-38 §3–6)

- **Touch on the frog.** `frogHit(p, frog, 32)`: a touch tap on the frog swaps (no aim, no shot); the mouse keeps the right click.
- **Safe areas and zoom.**
  - The body pads `--safe-*` = `env(safe-area-inset-*, 0px)`.
  - `applyScaling` fits the stage into `fitArea(innerWidth, innerHeight, safeInsets())`, read from the body's computed padding.
  - `.stage, #game` get `touch-action: none`, no selection, no callout, no tap highlight.
  - `gesturestart` and `dblclick` are prevented on the stage.
- **Rotation.** `needsRotation` (portrait, coarse pointer, short screen side < 600) opens `#rotate` « Tournez votre appareil ». It pauses a running game; back in landscape it lifts only its own pause. A level that starts under the overlay stays paused. Input is blocked while it shows.
- **Fullscreen.** `MenuOptions.fullscreen = document.fullscreenEnabled && requestFullscreen`; when false the check disappears and « Pixels nets » keeps its place.
- **Audio.** `audioSession.type = 'ambient'` before the context is created. `bindUnlock` adds `touchend` / `pointerup` / `click`. `visibilitychange` resumes a `suspended` or `interrupted` context. The m4a fallback is unchanged.

## Verification

- **Suite and builds.**
  - `npm test` → **280/280** + `publication guard: 525 tracked files, none proprietary`; `npm run check` clean.
  - Builds produced: public, `--standalone` (+ `r215-presentation` 15/15), `--deploy` (`dist/version.json`, sw with `./assets/pack.json`).
  - No `.png`, `dist/`, `standalone/` or `private_assets/` tracked; no model identifier in any committed file.
- **STATS OK** (`stats-ok.log`, `stats-ok-3-3-dpr2.png`, `stats-ok-hover-crop.png`, `menu-footer-dpr2.png`; 1280 × 960, DPR 2):
  - `#result-continue` = 552, 1492, 1456 × 192 device px, equal to the layout rectangle; logical 138, 373, 364 × 48 within 0.05 px.
  - Hover inside the corner lights the painted state; 3 px to the left does not.
  - Insets from the opaque frame: STATS 29 / 29 / 25, menu 30 / 30 / 22.
- **Offline** (`offline.log`, `offline-1-1.png`):
  - The first visit installs the worker with 291 worker requests (269 under `assets/`).
  - Caches after it: `zuma-shell-<build>` 21 entries, `zuma-assets-db5c071e6a40` 269 / 269 entries; storage 6 074 436 B.
  - `setOffline(true)` + reload: original pack loaded, level « Spirale du destin », 40 balls, badge « … ressources originales · hors ligne : 6,0 Mo », console clean.
- **Update keeps the pack** (`update-keeps-assets.log`, `update-toast.png`):
  - Rebuilt `--deploy`: new stamp (074722 → 074747), same fingerprint.
  - `registration.update()` → toast shown. The worker made **22 requests, all shell, 0 under `assets/`**.
  - « Mettre à jour » → reload: the new stamp is in the badge, the old `zuma-shell-…` is gone, the pack cache is kept.
- **Installability** (`installable.log`):
  - `Page.getInstallabilityErrors` → `[]`; `Page.getAppManifest` errors `[]`.
  - id `./`, start_url `../index.html`, scope `../`.
  - Icons 192 / 512 / maskable 512 load as PNG at their sizes.
- **Install prompt** (`install-prompt.log`, `install-prompt-card.png`, `install-installed-mode.png`):
  - With a synthetic `beforeinstallprompt`, the card shows « Installer Zuma » and `prompt()` is called once.
  - With display-mode fullscreen simulated: no card, `install: false`.
- **iPhone 15 emulated** (`iphone.log` + six captures):
  - Portrait at start: overlay shown (coarse pointer, screen 393 × 852), iOS line shown.
  - In landscape « Jouer » starts the game. Back in portrait: overlay, paused, tick 121 → 121 in 0.5 s. Landscape again: resumed.
  - Stage 457 × 343 in 734 × 343, no scrolling.
  - Frog tap: current / next 0 / 1 → 1 / 0, no projectile, no shot. A tap elsewhere shoots.
  - MENU tapped with `fullscreenEnabled` forced false: widgets without `fullscreen`.
  - « Sons » dragged by finger (CDP touch): 1 → 0.293, stored.
  - `navigator.standalone` simulated: no card.
- **iPad Pro 11 emulated** (`ipad.log` + three captures): iOS line shown; portrait without overlay, stage 834 × 625.5 with 284 px bands; landscape 1112 × 834.
- **Standalone** (`standalone-r220.log`, two captures): `file://`, desktop and iPhone UA both boot (level 1-1, 38 balls, original assets). No worker, no manifest, no PNG links, no install card, console clean.
- **Not emulated by Chromium (UAT 9):** safe-area insets (env() = 0 here), the separate storage of home-screen apps, `navigator.audioSession`, Safari's real « Sur l'écran d'accueil » and Dock install, WebKit itself. **Nothing was deployed** (no wrangler, no Pages).

### STATS: visual verdict

On `stats-ok-3-3-dpr2.png` the OK is a full-width green pill:
- It spans the green field from just inside the left stone pillar to just inside the right one.
- It sits close above the bottom stone border, under the tip inset — the same look as « Retour à la partie » in `menu-footer-dpr2.png` (1 px narrower inset, 3 px higher).
- The « OK » label is centred.
- The tip inset ends just above the OK, and its two lines sit centred in it.
- On hover (`stats-ok-hover-crop.png`) the whole painted button turns purple: the transparent control covers exactly the drawn button.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Install guide shown in the `file://` standalone**
- **Found during:** Task 5 (standalone boot with an iPhone UA).
- **Issue:** `installGuidance` gave the « Sur l'écran d'accueil » instruction, which is impossible for a local file.
- **Fix:** `InstallEnv.served` (http(s)); `served === false` → `none`; locked by r220-pwa.
- **Files modified:** src/pwa.ts, tests/r220-pwa.test.mjs. **Commits:** `19511ff`, `1ab52ac`.

**2. [Rule 2 - Correctness] Each worker version reads only its own caches**
- The template uses `caches.open(SHELL_CACHE / ASSETS_CACHE).match` instead of the global `caches.match`. Otherwise the old worker could serve files of a new shell installed and waiting. Part of `0d1335e`.

**3. [Rule 2 - Correctness] Pause and input under the rotate overlay**
- `startLevel` resets `paused`, so a level starting under the overlay would have run behind it; the overlay's pause is re-applied there. Taps and keys are ignored while the overlay is shown (otherwise a tap would lift the pause). Part of `8aaf15a`.

### Plan adjustments (documented, no rule weakened)

- **Tip box:** keeps its top, height 60 → 51, baseline 350 → 348, instead of moving up by the OK's 9 px. Moving it would break the r216 / r217 lock (rows above the box for line heights up to 20).
- **r215-presentation l. 31** (the old `{ 260, 382, 120, 48 }` equality) replaced by « h = 48 » with a « R2.0.20 » comment. Its centring lock (l. 32) and r216 l. 172 are unchanged and green.
- **Coordinator routing rule** added to Task 2: `api/` and `cdn-cgi/` passed through and never cached, locked by a vm test.
- **Own RED tests fixed in GREEN:**
  - r220-pwa: the offline asset is identified by URL plus « no network attempt » (the mock labels precached responses `network`).
  - r220-ios: the compiled `frogHit` → `swap` window widened 200 → 400 characters (indentation).
- **Typography:** French typographic apostrophes in the new card (« l’écran d’accueil », « l’app »).
- **`storage.persist()`** not called in Firefox (it prompts there); `persisted()` is read instead.
- **Card buttons:** « Jouer » does not remember the choice; « × » does (start screen only).

## Hypotheses carried into the code (for 05-15 / UAT 9)

| # | Hypothesis / choice | Where |
| --- | --- | --- |
| D-36 / Q5 | The 11 / 3 / 11 px margins of `_dialogbox` are transparent in the original box drawing (else the rule would be 36 / 36 / 36 from our frame: OK 145, 362, 350 × 48) | `STATS_OK_RULE` JSDoc, Q5 « Non établi » |
| D-36 | Menu footer kept at the R2.0.18 30 / 30 / 22 (OPTIONS insets not re-read) | `MENU_LAYOUT` |
| D-38 §6 | `audioSession.type = 'ambient'` (silent switch respected) rather than `playback` (orchestrator) | `setAudioSession` JSDoc |
| D-38 §6 | iOS unlocks the audio on `touchend` / `click` (first touch) — to check on a device | `bindUnlock` |
| D-38 §3 | Safe areas read from the body padding (Chromium reports 0) | `safeInsets` |
| D-38 §5 | Phone = coarse pointer and short screen side < 600 px | `needsRotation` |
| D-42 | The relative manifest / worker paths work under the future private host (root or sub-path) | manifest, `BASE` in sw.js |

## Open points for 05-15

- **Release documentation:**
  - `R220_RELEASE_NOTES.md` covering the OK rule with addresses, the worker / caches / update flow, `--deploy`, icons and manifest, the install guide, touch / rotation / safe areas / audio, and the 33 new tests.
  - README: `npm run deploy`, private hosting only; the offline behaviour.
  - CONCERNS: the hypotheses above.
- **UAT 9 checks:**
  - STATS OK placement.
  - Install from Chrome / Edge, iPhone and iPad Safari, macOS Safari.
  - Offline after the first visit (airplane mode).
  - Update toast.
  - Safe areas on a notched iPhone.
  - Audio with the silent switch, and after a call or a lock.
  - Frog tap and rotation.
- **Not done here (D-42):** private hosting (Cloudflare Pages + Access), score sync (D1), any deployment. The `api/` / `cdn-cgi/` pass-through is ready for them.
- **Noticed, not changed:**
  - After a dismissed browser prompt, « Installer » disappears from the help view until Chromium fires a new `beforeinstallprompt`.
  - `Page.getAppId` returns `{}` in headless Chromium (manifest `id` present).
  - `storage.persisted()` stays false in headless Chromium.
  - The untracked `05-16-PLAN.md` and `05-RESEARCH-05.md` belong to other agents; left untouched.

## Known Stubs

None added. (The inert music slider of 05-10 is unchanged.)

## Threat Flags

None beyond the plan's register:
- **T-05-44:** `dist/` stays ignored, the guard and the CI are unchanged, nothing is deployed, `--deploy` logs « à héberger uniquement en privé ».
- **T-05-45:** caches named by build stamp and pack sha256, two caches kept, `skipWaiting` on message only, same-origin GET only, no HTML fallback for sub-resources — locked by the vm tests in r220-pwa.
- **T-05-46:** only missing entries are fetched, in batches; failures are tolerated and retried at runtime; `persist` is requested.
- **T-05-47:** `pwa.js` has no write or share API (r220-pwa source lock).
- **T-05-48:** only addresses, constants and formulas in Q5.

The `api/` and `cdn-cgi/` pass-through reduces the future surface (Access cookies and score calls are never cached).

## Self-Check: PASSED

Verified on disk / in `git log` on 2026-10-11:
- Files: 6 created and 16 modified.
- The 11 commits above: `320b35e`, `fa8b794`, `a4582a1`, `0d1335e`, `f41788f`, `3050f3d`, `76fbc0d`, `8aaf15a`, `19511ff`, `1ab52ac`, plus this summary.
- Tests: 280/280 + guard.
- Evidence: 7 section logs + `standalone-r220.log` and 19 captures under `scratchpad/shots-r220/`.
- Nothing proprietary, no capture and no build output tracked.
- STATE.md / ROADMAP.md / README / release notes untouched, as instructed.
