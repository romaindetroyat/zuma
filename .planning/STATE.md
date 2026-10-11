# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-10)

**Core value:** Retrouver les sensations du Zuma original dans un navigateur.
**Current focus:** Phase 5 — Règles originales complètes (UAT 5 → plan 05-08)

## Current Position

Phase: 5 of 7 (Règles originales complètes)
Plan: 17 plans ; 05-16 et 05-17 exécutés jusqu'au point de contrôle humain (UAT 9)
Status: Jeu hébergé en privé sur https://zuma-49c.pages.dev (Cloudflare Pages + D1 + Access, worker vérifiant le JWT Access) ; procédure d'installation envoyée par e-mail ; en attente de l'UAT 9 (navigation privée, Mac, PC, iPhone, iPad)
Last activity: 2026-10-11 - Plans 05-14/05-15 exécutés (R2.0.20, 284 tests) : OK du STATS en bouton de pied d'origine, PWA hors ligne (shell + pack), icônes, installation Mac/PC/iPhone/iPad, toucher la grenouille, rotation, astuce complète sur trois lignes ; décisions D-42/D-43 (hébergement privé Cloudflare, standalone maintenu). Avant : plans 05-12/05-13 exécutés (R2.0.19, 247 tests) : comblement des brèches et rebond au contact de l'original, recul ZUMA par chaîne avec billes retirées à l'entrée, pièce qui consomme le tir (rayon 36), 3 grenouilles, HUD recalé (réserve, « xN », clignotement), apparition des power-ups silencieuse, clics de billes corrigés, « Perdu… » unique ; standalone envoyé. Avant : plans 05-10/05-11 exécutés (R2.0.18, 212 tests) : tunnels (octets CURV tunnel/priorité, dessin en passes), menu natif, entrées sur toute la fenêtre, taille de fenêtre, vies tous les 50 000, cadence des pièces, roulement, décompte sur toutes les chaînes ; standalone envoyé. Avant : plans 05-08/05-09 exécutés (R2.0.17, 176 tests) : barème original (brèches, combos, enchaînements), STATS sur grille, décompte borné, netteté EPX 2× ; standalone envoyé. Avant : plans 05-05..05-07 exécutés (R2.0.16, 142 tests) : règles lues dans Zuma.exe (vitesse, pousseur, zone lente, arrivée, repeat/single, munitions, décompte, ACE TIME, pièces), alerte 600 px, roulement, bannière ZUMA, STATS couleurs/décompte ; standalone envoyé ; UAT 5 : flou, alignement STATS, décompte trop long, bonus de brèche

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

Last session: 2026-10-11 09:30
Stopped at: déploiement privé en ligne (D1 « zuma-assets », 289 contenus, worker avec contrôle JWT), mail de procédure expédié ; ensuite UAT 9 puis synchronisation des scores (D-39/D-42)
Resume file: None
