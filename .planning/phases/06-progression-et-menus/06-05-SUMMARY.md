---
phase: 06-progression-et-menus
plan: 05
status: tasks-1-3-complete-checkpoint-pending
subsystem: release (documentation, verification, delivery)
tags: [release-r2.0.21, release-notes, readme, concerns, uat, standalone, deploy-artefact, dry-run, d-12-players]

requires:
  - plan: 06-01
    provides: D-09 pusher rule, tools/sim-difficulty.mjs and its simulation table
  - plan: 06-02
    provides: progress.ts (progression, scores, profile, save, state machine)
  - plan: 06-03
    provides: original main menu, wiring, api/me client (D-12)
  - plan: 06-04
    provides: adventure screen, god dialogue, ending, routing after a level
  - commit: c0ca85b
    provides: worker route api/me from the private players table (D-12, worker side)
provides:
  - "R221_RELEASE_NOTES.md: difficulty, main menu, profile and resume, adventure and temples, ending and high scores, tools (importer, sim-difficulty, api/me), tests (483), build, hypotheses"
  - "README: baseline R2.0.21, « Parcours de jeu », review without writes, « Difficulté » (sim-difficulty), hosting: players table, « Ajouter un joueur », D1 worker, installed game playable without time limit"
  - ".planning/codebase/CONCERNS.md: D-09, phase 6 hypotheses, local storage, api/me, fragile areas; audit R2.0.21"
  - ".planning/phases/06-progression-et-menus/06-UAT.md: first session to fill"
  - "standalone/zuma-standalone.html and dist/ (--deploy) built, untracked"
affects: [real private deployment (orchestrator, after the user's consent), phase 6 UAT]

tech-stack:
  added: []
  patterns: []

key-files:
  created: [R221_RELEASE_NOTES.md, .planning/phases/06-progression-et-menus/06-UAT.md]
  modified: [README.md, .planning/codebase/CONCERNS.md]

decisions:
  - "README hosting section brought up to date beyond the plan: D1 worker (05-17) as the default method, D1 : Edit permission, players table and the add-a-player procedure (players entry + Access policy rule, then --plan and deploy)"
  - "Access session « un mois par appareil » rephrased: the connection only delivers the game and its updates; the installed game stays playable without time limit offline (user decision on install e-mails)"
  - "Only example.org placeholders in the repository; no real address or first name"

metrics:
  duration: "~10 min (17:22 → 17:33 UTC)"
  completed: 2026-10-11 (tasks 1–3; Task 4 = private deployment and UAT, pending the user's consent)
  tasks: "3 of 4 (Task 4 checkpoint:human-verify)"
  commits: 3 (+ this summary)
  tests: "483/483 + publication guard (570 tracked files)"
---

# Phase 6 Plan 05: Release R2.0.21 — Summary

Baseline 2.0.21 is documented, verified and ready for the private deployment. The release notes, the README, CONCERNS and the phase 6 UAT sheet describe the game flow (welcome → adventure → levels → ending), the profile, the resume dialog, the 10-entry local high-score table, review sessions that write nothing, the original pusher rule (D-09) and how to measure difficulty with `node tools/sim-difficulty.mjs`. The D-12 worker side (commit `c0ca85b`, `api/me` from the private `players` table) is documented in the notes and in the README hosting section, with the procedure to add a player.

The suite is green (483 tests + guard), `check` is clean. The standalone (9 407 484 bytes) boots on `file://` onto the main menu and plays 1-1. The `--deploy` artefact works offline and the deployment dry run passes. **Nothing was deployed.** Task 4 (real deployment by the orchestrator, then the first UAT session) waits for the user.

## Tasks

| # | Task | Commit | Files |
| --- | --- | --- | --- |
| 1 | R2.0.21 release notes and README | `35e220b` | R221_RELEASE_NOTES.md, README.md |
| 2 | CONCERNS and the phase 6 UAT sheet | `626045a` | .planning/codebase/CONCERNS.md, .planning/phases/06-progression-et-menus/06-UAT.md |
| 3 | Final verification, Build section | `668d37f` | R221_RELEASE_NOTES.md |
| 4 | Private deployment by the orchestrator, then UAT | **checkpoint, pending** | — |

## Verification (Task 3)

- `npm test` → 483/483 + `publication guard: 570 tracked files, none proprietary`; `npm run check` clean; `node tools/guard.mjs` green.
- `node tools/build.mjs --standalone` → `standalone/zuma-standalone.html`, 9 407 484 bytes, « R2.0.21 » ×14; `node --test tests/r215-presentation.test.mjs` 15/15.
- `node tools/build.mjs --deploy` → 375 files, 6.9 MiB, pack `1668c4fa9c7f`, `dist/version.json` 2.0.21 with 350 assets; `dist/js/{progress,welcome,adventure}.js` present.
- `node tools/deploy.mjs --dry-run` → exit 0; Access read back unchanged; 16 planned writes (D1 database, table, 12 `INSERT OR IGNORE` batches for 373 contents, `ASSETS_DB` binding, worker of 69 587 bytes deployed on `main`); second plan « actions prévues : 0 ». Log `shots-r221/deploy-dry-run.log` holds no address, token or identifier.
- `git status` clean: no PNG, `dist/`, `standalone/` or `private_assets/` tracked.

## Evidence (scratchpad `shots-r221/`, nothing in the repository)

Script `scratchpad/evidence-r221-final.mjs`, Chromium 1 000 × 750, DPR 2 (renderer scale 3.125), `node tools/serve.mjs` on `dist/` built with `--deploy`.

| Capture / log | Result |
| --- | --- |
| `final-welcome.png`, `final-welcome.log` | Main menu (sky, sun, idol, five stones, « BIENVENUE DANS ZUMA, ROMAIN! »), no engine, no prompt; Aventure → adventure screen (2 × kit), door 5 selected; Jouer → 5-1. Console clean. |
| `final-adventure.png` | Original adventure screen on the artefact. |
| `final-ending.png`, `final-ending.log` | Save at 13-1 → « CONTINUER ? » → Continuer → 13-1 at 60 000 → win → STATS → temple 5 dialogue (save cleared) → Enter → ending: « FÉLICITATIONS ! », RECORDS, 10 rows, rank 4 highlighted, « SCORE : 102400 »; 1.5 s later still on the ending with no engine; OK → welcome. Console clean. |
| `final-offline.log`, `final-offline.png` | First visit: worker in control, caches `zuma-shell-<build>` 24 and `zuma-assets-1668c4fa9c7f` 350. Offline reload: welcome screen with the original kit; `welcome.js`, `adventure.js`, `progress.js` 200 from the service worker; Aventure → adventure screen. Console clean. |
| `standalone-r221.png`, `standalone-r221.log` | `file://…/zuma-standalone.html` → welcome (no engine) → Aventure → adventure screen (2 × kit) → Jouer → 1-1 playing, 3 lives. Console clean. |
| `deploy-dry-run.log` | See Verification. |

Evidence carried over from the earlier plans of the phase (same folder):

| Plan | Evidence | Result |
| --- | --- | --- |
| 06-01 | `sim-difficulty.log`, `sim-r220-engine.log`, `research-sim-rerun.log` | Pack: 3.5–12.7 % stopped instead of 24–37 %, mean speed × 1.2 to 2.1; `legacy-insert` matches the R2.0.20 engine compiled from `be4871b`. |
| 06-03 | `welcome-*.png`, `hover-sounds.log`, `ufo.log`, `continue.log`, `identity.log`, `standalone-r221-welcome.*` | Original main menu at DPR 1 / 2; choral hover sounds (Aventure, Options only); OPTIONS out of game; UFO after three laps; continue / replay; api/me name skips the prompt; standalone boots on the welcome. |
| 06-04 | `adventure-*.png`, `flow-stage.log`, `temple.log`, `rise.log`, `ending.log`, `gameover.log`, `leave-resume.log`, `review.log`, `adventure-touch.log`, `adventure-keyboard.log`, `standalone-r221-flow.*` | Stages chained, adventure screen between stages, god dialogue with `chant6`, temple 2 fade and temple 4 rise with one earthquake, ending with the rank highlighted, game over into the table, leave and resume, review without writes, touch and keyboard, standalone flow. |

## Deviations from Plan

### Scope added by the coordinator (documented, no code change)

- **D-12 worker side** (`c0ca85b`, outside the plans) folded into the release notes (« Outils ») and the README (« Ajouter un joueur »): `players` table, SHA-256 hashes only, every `players` address allowed, 404 / 403 / 405 answers, `tests/r221-api-me.test.mjs` (5) counted in the 483.
- **Offline wording**: the README said « la session dure un mois par appareil ». It now says the connection lasts a month and only serves to receive the game and its updates; the installed game stays playable without time limit offline from the service-worker cache.

### Auto-fixed documentation (Rule 1 — stale facts in the files of this plan)

- **README hosting section**: still described the pre-05-17 method (« l'envoi des fichiers y est impossible … depuis le Mac ») and an « hébergement privé à venir ». Updated: D1 worker as the default method, `--dry-run`, `--direct` from the Mac only, *D1 : Edit* permission, artefact section pointing to the hosting section.
- **Adding a player needs the Access policy rule too**: `planProvision` reports any difference in « Zuma — joueurs » as a conflict and never rewrites it, so the README procedure lists the policy rule before `--plan`.
- **README**: `speed` row, « Menu de jeu » and « Statut » no longer describe the insertion stop or « Retour au menu principal » → new game.
- **CONCERNS**: the insertion-stop reading, the open question 3, the « nouvelle partie » choice, « contenu à envoyer depuis le Mac » and the « Missing » list (main menu, save) marked as resolved or updated.

None of these change code or tests.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-06-16 (documentation without PopCap names, percentages only, guard green), T-06-17 (`dist/` and the standalone untracked, dry run only), T-06-18 (dry-run log through `redact`, in the scratchpad, no address).

## Checkpoint (Task 4) — for the orchestrator and the user

- **Deployment, only after the user's explicit consent**: `node tools/deploy.mjs --plan`, then `node tools/deploy.mjs`, then `node tools/deploy.mjs --verify`. Expected writes (dry run, from the 05-16 state): D1 database `zuma-assets` and table `blobs` if absent, missing content rows, `ASSETS_DB` binding, worker deployment on `main`. On the real account the rows of files unchanged since the last deployment probably exist already (content-addressed `INSERT OR IGNORE`), so fewer rows should be written; `--plan` gives the real count.
- **Standalone**: `/home/user/zuma/standalone/zuma-standalone.html` (9 407 484 bytes).
- **UAT**: `.planning/phases/06-progression-et-menus/06-UAT.md`, « Première session (à remplir) ».

## Self-Check: PASSED

Verified on disk and in `git log` on 2026-10-11:
- Files: `R221_RELEASE_NOTES.md`, `README.md`, `.planning/codebase/CONCERNS.md`, `.planning/phases/06-progression-et-menus/06-UAT.md` present; `standalone/zuma-standalone.html`, `dist/version.json` built (untracked).
- Commits: `35e220b`, `626045a`, `668d37f`.
- Evidence: `final-welcome.png`, `final-adventure.png`, `final-ending.png`, `final-offline.log`, `standalone-r221.png`, `deploy-dry-run.log` under `scratchpad/shots-r221/`.
- STATE.md and ROADMAP.md untouched (plan rule).
