# Roadmap: Zuma PWA

## Milestones

- ✅ **v1.0 Baseline R2.0.13** - Phases 1-3 (shipped 2026-10-10, PR #1)
- 🚧 **v1.1 Fidélité & progression** - Phases 4-7 (planned)
- 📋 **v2.0 Modes & éditeur** - à définir

## Phases

<details>
<summary>✅ v1.0 Baseline R2.0.13 (Phases 1-3) - SHIPPED 2026-10-10</summary>

### Phase 1: Moteur de simulation
**Goal**: Règles de chaîne verrouillées par tests
**Requirements**: ENG-01..ENG-08
**Plans**: 1 plan (rétro-documenté)

Plans:
- [x] 01-01: `src/core.ts` + `tests/r206`, `r211`, `r213`

### Phase 2: Présentation
**Goal**: Rendu canvas, HUD, STATS, audio
**Requirements**: UI-01..UI-04
**Plans**: 1 plan (rétro-documenté)

Plans:
- [x] 02-01: `src/render.ts`, `src/audio.ts`, `src/feedback.ts`, `index.html`, `public/style.css`

### Phase 3: Ressources, outillage et PWA
**Goal**: Import des ressources originales, garde-fou, PWA, CI
**Requirements**: AST-01, AST-02, PWA-01
**Plans**: 1 plan (rétro-documenté)

Plans:
- [x] 03-01: `tools/`, `src/original.ts`, `public/sw.js`, `.github/workflows/ci.yml`

</details>

### 🚧 v1.1 Fidélité & progression (Planned)

**Milestone Goal:** Le jeu se joue comme l'original sur les temples 1 à 3 et conserve la progression du joueur.

#### Phase 4: Point de validation jouable
**Goal**: Jouer R2.0.13 avec les ressources originales, recueillir le ressenti et corriger les écarts évidents
**Depends on**: Phase 3
**Requirements**: GAME-02, GAME-05
**Success Criteria** (what must be TRUE):
  1. L'utilisateur a joué au moins 3 niveaux originaux (standalone ou `npm run dev`) et ses retours sont consignés dans `.planning/phases/04-*/UAT.md`
  2. La grenouille originale tient la bille en bouche et la suivante dans l'écoutille, avec un tir partant de la bouche
  3. Vitesse de chaîne, recul et power-ups ne provoquent plus de remarque bloquante
  4. `npm test` reste vert et chaque correction de règle ajoute un test
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — Importateur corrigé (fond 640×480, thumb.jpg, extensions image, .m4a), fond 1:1 + overlays sous les billes, DPR et option « Pixels nets »
- [x] 04-02-PLAN.md — Moteur : insertion progressive (width/mergeTicks), détection différée, muzzleOffset, rollFrame ; verrous r214 ; baseline R2.0.14
- [x] 04-03-PLAN.md — Rendu de l'insertion, grenouille fidèle (bouche/écoutille/langue/clignement), audio original (formats, préchargement, boucles rolling/warning), vérification de bout en bout

#### Phase 5: Règles originales complètes
**Goal**: Interpréter tous les réglages de `levels.xml` et ajouter les éléments de niveau manquants
**Depends on**: Phase 4
**Requirements**: GAME-01, GAME-03, GAME-04
**Success Criteria** (what must be TRUE):
  1. `configFromSettings` couvre `single`, `zumaslow`, `zumaback`, couleurs par temple et `partime`, documentés dans le README et testés
  2. Les pièces bonus apparaissent aux TreasurePoints, disparaissent après délai et rapportent des points avec leur son
  3. Chaque niveau démarre par « Attention / PARTEZ » et se termine par la vidange, le pop et le bonus de temps
**Plans:** 13 plans

Plans:
- [x] 05-01-PLAN.md — Importateur (polices bitmap, strings.json, sons pièces/pop, garde) + `src/bitmapfont.ts` (parseur/mise en page PopCap testés en Node)
- [x] 05-02-PLAN.md — Moteur : pièces aux TreasurePoints, état `clearing` + décompte, bonus de temps d'expert, `go`, zumaslow/zumaback, R2.0.15
- [x] 05-03-PLAN.md — STATS natif composé depuis dialogbox/GodHead/DialogButton + polices, record de temps par niveau, retrait du mode image R2.0.12
- [x] 05-04-PLAN.md — Rendu pièces/décompte/« Attention · PARTEZ », câblage partime/zumaslow/zumaback, documentation des hypothèses, vérification finale
- [x] 05-05-PLAN.md — Moteur conforme à Zuma.exe : rampe de vitesse, arrêt du pousseur, zone lente, arrivée rapide (`start` %), repeat/single originaux, munitions immédiates, décompte 60 px/+100, ACE TIME, pièces 500, R2.0.16
- [x] 05-06-PLAN.md — Présentation : alerte à 600 px (4,1 s → 0,6 s), roulement à gain constant, bannière ZUMA, « +100 » du décompte, STATS (couleurs, interlignes, décompte du BONUS dans le dialogue)
- [x] 05-07-PLAN.md — Notes R2.0.16, README, CONCERNS, UAT, standalone et preuves Playwright, vérification finale
- [x] 05-08-PLAN.md — UAT 5 : bonus de saut et score originaux (spike 02), libellés COMBO / ENCHAÎNEMENT, grille du STATS (D-20), compte à rebours borné + mode rapide (D-21), fondu du roulement, netteté 2 × EPX et STATS à l'échelle du canvas (D-19), R2.0.17
- [x] 05-09-PLAN.md — Notes R2.0.17, README (score, netteté), CONCERNS, UAT (U22–U25, sixième session), standalone et preuves Playwright, vérification finale
- [x] 05-10-PLAN.md — UAT 6 : tunnels et priorités CURV (D-23), menu de jeu natif = dialogue OPTIONS en jeu (D-24), fenêtre et « Pixels nets » en pixels d'appareil (D-25), entrées (D-26), vies tous les 50 000 (D-27), cadence originale des pièces (D-28), roulement adouci (D-29), décompte simultané multi-chaînes (D-30), R2.0.18
- [x] 05-11-PLAN.md — Notes R2.0.18, README (commandes, tunnels, vies, pièces, menu), CONCERNS (C1–C4, déviation D-30), UAT (U26–U33, septième session), standalone et preuves Playwright, vérification finale
- [x] 05-12-PLAN.md — UAT 7 : destruction 0,4 s, attraction accélérée et rebond au contact (D-34), recul ZUMA par chaîne et billes perdues par l'entrée (D-35), pièce à 36 px qui consomme le tir (D-31), trois grenouilles et barre du haut recalée (D-33), sons du power-up / contact / impact (D-32), R2.0.19
- [x] 05-13-PLAN.md — Notes R2.0.19, README, CONCERNS (D-31 gardé contre le souvenir de l'utilisateur, D-32 sans son, points ouverts du spike 04), UAT (U34–U38, huitième session), standalone, vérification finale

#### Phase 6: Progression et menus
**Goal**: Aventure par temples, sauvegarde et menu principal
**Depends on**: Phase 5
**Requirements**: PROG-01, PROG-02, PROG-03
**Success Criteria** (what must be TRUE):
  1. La partie suit `StageProgression` avec un écran de transition entre temples
  2. Fermer puis rouvrir la PWA propose de reprendre la partie au niveau atteint, avec score et vies
  3. Un menu principal donne accès à Aventure, options et aide
**Plans**: TBD

#### Phase 7: Finitions audio, visuelles et mobiles
**Goal**: Musique, animations secondaires, ergonomie tactile, captures automatisées
**Depends on**: Phase 6
**Requirements**: AV-01, AV-02, AV-03, QA-01
**Success Criteria** (what must be TRUE):
  1. Une musique de fond joue quand le pack contient une piste convertie, silence propre sinon
  2. Couvercle de trou, scintillement des power-ups et trainée de visée sont animés
  3. Sur mobile en paysage, on vise et on tire au doigt et on échange via un bouton visible
  4. La CI produit des captures du mode vectoriel et échoue si le rendu lève une erreur
**Plans**: TBD

### 📋 v2.0 Modes & éditeur (Planned)

**Milestone Goal:** Modes Gauntlet/Pratique/Survie et éditeur de courbes (MODE-01, MODE-02, PWA-02).

## Progress

**Execution Order:** 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Moteur de simulation | v1.0 | 1/1 | Complete | 2026-10-10 |
| 2. Présentation | v1.0 | 1/1 | Complete | 2026-10-10 |
| 3. Ressources, outillage et PWA | v1.0 | 1/1 | Complete | 2026-10-10 |
| 4. Point de validation jouable | v1.1 | 6/6 | Complete (UAT partielle : STATS natif reporté en phase 5) | 2026-10-10 |
| 5. Règles originales complètes | v1.1 | 13/13 | In progress (UAT 8) | - |
| 6. Progression et menus | v1.1 | 0/TBD | Not started | - |
| 7. Finitions audio, visuelles et mobiles | v1.1 | 0/TBD | Not started | - |
