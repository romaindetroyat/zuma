# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-10)

**Core value:** Retrouver les sensations du Zuma original dans un navigateur.
**Current focus:** Phase 5 — Règles originales complètes (UAT 5 → plan 05-08)

## Current Position

Phase: 5 of 7 (Règles originales complètes)
Plan: 7 of 7 executed (01-07) ; 05-08 à planifier (UAT 5)
Status: UAT 5 received on R2.0.16 (U22–U25) ; spike 02 (bonus de brèche, combos, mode rapide STATS) en cours
Last activity: 2026-10-10 - Plans 05-05..05-07 exécutés (R2.0.16, 142 tests) : règles lues dans Zuma.exe (vitesse, pousseur, zone lente, arrivée, repeat/single, munitions, décompte, ACE TIME, pièces), alerte 600 px, roulement, bannière ZUMA, STATS couleurs/décompte ; standalone envoyé ; UAT 5 : flou, alignement STATS, décompte trop long, bonus de brèche

Progress: [█████░░░░░] 57% (4/7 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (rétro-documentés, hors GSD)
- Average duration: n/a
- Total execution time: n/a

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1-3 | 3 | 1 session | - |

**Recent Trend:**
- Première phase GSD à venir

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- R2.0.13: réglages originaux convertis 100 Hz → 60 Hz dans `configFromSettings` (à valider en Phase 4)
- R2.0.13: grenouille originale dessinée avec offsets empiriques (`front=16`, `back=20`) — à corriger en Phase 4

### Pending Todos

- Vérifier le placement exact de la bouche et de l'écoutille sur `SMALLFROGonPAD`
- Décider de la source musicale (conversion locale `zuma.mo3` → ogg)

### Blockers/Concerns

- Le pack original n'existe que localement : toute session cloud doit relancer `python3 tools/extract_installer.py` + `npm run import` à partir de l'installeur fourni par l'utilisateur
- Les agents GSD sont installés dans `.claude/agents/` (installation locale) ; l'init SDK signale `agents_installed:false` car il regarde `~/.claude/agents`

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261010-bba | Standalone robuste : résolveur d'assets explicite, message de chargement visible sans JavaScript, erreur d'initialisation affichée | 2026-10-10 | 2dc9246 | [261010-bba-standalone-robuste-r-solveur-d-assets-ex](./quick/261010-bba-standalone-robuste-r-solveur-d-assets-ex/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Audio | Musique de fond | Deferred to Phase 7 | v1.0 |
| Gameplay | Pièces bonus | Deferred to Phase 5 | v1.0 |

## Session Continuity

Last session: 2026-10-10 17:30
Stopped at: UAT 5 enregistrée (U22–U25, D-19..D-22) ; prochaine étape : plan 05-08 après `05-RESEARCH-02.md`, exécution, standalone R2.0.17
Resume file: None
