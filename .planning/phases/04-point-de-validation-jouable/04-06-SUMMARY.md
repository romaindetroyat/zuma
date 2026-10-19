---
phase: 04-point-de-validation-jouable
plan: 06
subsystem: engine-rules
tags: [colour-generation, repeat, single, score-gauge, zuma-mode, levels-xml, tdd]

# Dependency graph
requires:
  - plan: 04-02
    provides: insertion animée (mergeTicks) — budgets de ticks des fixtures de destruction
  - plan: 04-03
    provides: ?level=S-L pour la relecture Playwright, pack local
provides:
  - "core.ts : EngineConfig.repeatChance / singleChance, Chain.forceDifferent, spawnColor piloté par ces probabilités (séries de longueur libre, billes isolées)"
  - "core.ts : ZumaEngine.levelScore, addScore() (tout gain) ; target = objectif de points ; 'zuma' émis une fois ; destroyedCount réservé aux statistiques"
  - "main.ts : configFromSettings — score → target (points), repeat % → repeatChance, single % → singleChance, levelBonus fixe 1000 ; jauge HUD = levelScore / target"
  - "original.ts : PackSettings.single ; levels.ts : objectifs procéduraux en points (×10)"
  - "README : tableau « Réglages originaux » (interprétation + statut vérifié/hypothèse)"
affects: [phase-5 (pièces bonus : passer par addScore), audit comportemental sur l'original (CONCERNS)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Génération de couleurs à deux états par chaîne (normal / forceDifferent) : single → différente + arme l'état forcé ; repeat → répète ; sinon différente aléatoire"
    - "Tout gain de points passe par addScore() : un seul point de décision pour la jauge et l'événement zuma"
    - "Test statistique sur 4000 tirages déterministes (graine fixe) avec bornes larges plutôt qu'une valeur exacte"

key-files:
  created: []
  modified:
    - src/core.ts
    - src/main.ts
    - src/original.ts
    - src/levels.ts
    - tests/r214.test.mjs
    - tests/r213.test.mjs
    - README.md
    - R214_RELEASE_NOTES.md
    - .planning/codebase/CONCERNS.md

key-decisions:
  - "`repeat` = probabilité (%) de répéter la couleur précédente, sans plafond de série (l'ancien `spawnRun < 2` limitait les groupes à 2 et expliquait le constat utilisateur)"
  - "`single` = probabilité (%) de bille isolée : différente de la précédente et de la suivante (état `forceDifferent` sur la chaîne)"
  - "`score` = objectif de points du niveau (jauge ZUMA) ; le bonus de fin de niveau reste fixe à 1000"
  - "Le score reporté des niveaux précédents n'entre pas dans la jauge (`levelScore` séparé de `score`) ; le bonus de niveau est compté dans levelScore sans effet (zumaMode déjà actif)"
  - "L'événement `destroy` précède toujours `zuma` dans le même tick (addScore appelé après l'émission)"
  - "CANDIDATE.target 40 billes → 400 points ; niveaux procéduraux ×10 (≈ 10 points par bille) pour garder la même durée de niveau"

metrics:
  duration: "~35 min"
  completed: 2026-10-10
  tasks: 3
  commits: 5
  tests: "49 → 56 (toutes vertes), tsc --noEmit propre"
---

# Phase 4 Plan 06: Couleurs repeat/single et jauge en points Summary

Génération des couleurs alignée sur `repeat`/`single` de `levels.xml` (séries de 3–4 dès le niveau 1-1, billes isolées dans les niveaux avancés) et jauge ZUMA remplie par les points du niveau jusqu'à `score`, avec les hypothèses documentées.

## What was built

### Task 1 — Génération des couleurs (commits 6877024 RED, 6cba36a GREEN)
- `EngineConfig.repeatChance` (0,5) et `singleChance` (0) ; `Chain.forceDifferent` remplace `spawnRun`.
- `spawnColor` : première bille aléatoire ; état forcé → différente de la précédente ; `rng < singleChance` → différente et arme l'état forcé ; `rng < repeatChance` → répète ; sinon différente aléatoire. Plus de plafond de deux billes identiques.
- Tests r214 : part de répétitions immédiates dans [0,46 ; 0,54] sur 4000 billes (mesuré 0,50), séries ≥ 3 présentes ; `repeatChance 0` → 0 répétition ; `singleChance 1` → 0 voisine identique ; mélange `repeat 0,9 / single 0,5` → part ≈ 0,30 (chaîne de Markov à deux états, 2/3 × 0,5 × 0,9) ; déterminisme par graine ; série ≥ 3 parmi les 30 premières billes sur trois graines (réglages 1-1).

### Task 2 — Jauge en points (commits 368defb RED, 5f53f6e GREEN)
- `ZumaEngine.levelScore` ; `addScore(points)` pour destruction, série, bombe, bonus saut et bonus de niveau ; `zumaMode = levelScore >= target` émet `zuma` une seule fois ; `registerDestroyed` ne fait que compter.
- `main.ts` : `progress = min(1, levelScore / target)` ; `configFromSettings` : `target: s.score ?? 1000`, `repeatChance: (s.repeat ?? 50)/100`, `singleChance: (s.single ?? 0)/100` (bornés 0..1), `levelBonus: 1000` fixe.
- Test r214 : score reporté 5000 exclu ; 2 × 30 points < 100 → pas de ZUMA, `destroyedCount = 6` ; saut (100) + run de 4 (50) → 210 points, `zuma` émis une fois, `score = 5210`.
- Test r213 « ZUMA mode stops the feed… » : `target: 3` → `30`, assertions inchangées.

### Task 3 — Documentation (commit efb0e42)
- README : section « Réglages originaux (`levels.xml` → `configFromSettings`) » avec le tableau `score`, `repeat`, `single`, `start`, `speed`, `slowfactor`, `firespeed`, `powerfreq`, `partime`, `colors`, et les réglages non interprétés ; statut vérifié / hypothèse par ligne. Paragraphe « Statut » mis à jour.
- R214_RELEASE_NOTES : lignes « Génération des couleurs » et « Jauge en points » (Moteur) ; tests r214/r213 (plan 04-06).
- CONCERNS.md : paragraphe des réglages remplacé par l'hypothèse actuelle et ce qui reste à mesurer sur l'original (`zumaslow`, `zumaback`, `mergespeed`, `reloaddelay`, couleurs par temple).

## Verification

- `npm test` : 56/56 (build + node:test + guard « 461 tracked files, none proprietary »). r206, r211, r214-import, r214-presentation inchangés et verts.
- `npm run check` (tsc --noEmit) : propre.
- Critère visuel : `node tools/build.mjs --local`, serveur local, Playwright `?level=1-1`, capture après 10 s sur trois chargements (graines `Date.now()` distinctes) → `scratchpad/shots-r214/0406-level-1-1-seed{1,2,3}.png` (hors dépôt). Chaque capture montre au moins une série ≥ 3 parmi les billes visibles (ex. quatre jaunes et trois verts sur la graine 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Attente de test mal dérivée (mélange repeat/single)**
- **Found during:** Task 1 (GREEN)
- **Issue:** le test « singleChance injects isolated balls » attendait une part de répétitions ≈ 0,9 × 0,5 ; la vraie valeur stationnaire est 2/3 × 0,5 × 0,9 = 0,30 (mesuré 0,314).
- **Fix:** bornes [0,26 ; 0,34] et commentaire expliquant la chaîne à deux états ; assertion d'existence de billes isolées ajoutée.
- **Files modified:** tests/r214.test.mjs — **Commit:** 6cba36a

**2. [Rule 3 - Blocking] Objectifs des niveaux procéduraux et `CANDIDATE.target` convertis en points**
- **Found during:** Task 2
- **Issue:** `levels.ts` (36…68) et `CANDIDATE.target` (40) étaient des nombres de billes ; conservés tels quels, les niveaux procéduraux seraient passés en mode ZUMA après 4 destructions.
- **Fix:** `levels.ts` ×10 (360…680, +80 par tour) avec doc ; `CANDIDATE.target = 400`. `src/levels.ts` n'était pas dans `files_modified` du plan.
- **Files modified:** src/levels.ts, src/core.ts — **Commit:** 5f53f6e

**3. [Rule 2 - Missing] `PackSettings.single` déclaré**
- **Found during:** Task 2
- **Issue:** `s.single` n'existait pas dans l'interface (seulement via l'index signature `unknown`), d'où une erreur de type dans `configFromSettings`.
- **Fix:** champ `single?: number` ajouté dans `src/original.ts` (hors `files_modified`).
- **Commit:** 5f53f6e

**4. Ordre des événements conservé**
- `addScore` est appelé après `emit('destroy')` dans `destroyRun` pour que `destroy` précède toujours `zuma` dans le même tick, comme avant (sinon la présentation aurait joué le son ZUMA avant l'explosion).

## Known Stubs

Aucun.

## Threat Flags

Aucune nouvelle surface (aucun réseau, aucune E/S fichier, aucun changement de schéma).

## Self-Check: PASSED

- Commits présents : 6877024, 6cba36a, 368defb, 5f53f6e, efb0e42.
- Fichiers modifiés présents : src/core.ts, src/main.ts, src/original.ts, src/levels.ts, tests/r214.test.mjs, tests/r213.test.mjs, README.md, R214_RELEASE_NOTES.md, .planning/codebase/CONCERNS.md.
- `grep -n levelScore src/core.ts src/main.ts` : 5 occurrences (déclaration, addScore, jauge HUD).
