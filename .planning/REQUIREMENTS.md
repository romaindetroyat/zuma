# Requirements: Zuma PWA

**Defined:** 2026-10-10
**Core Value:** Retrouver les sensations du Zuma original dans un navigateur.

## v1.0 Requirements (shipped in R2.0.13)

### Engine

- [x] **ENG-01**: Insertion d'une bille sans remplacement ni recoloration des billes existantes
- [x] **ENG-02**: Billes détruites conservées 40 ticks puis retirées logiquement
- [x] **ENG-03**: Recul local du segment arrière propagé aux segments en contact
- [x] **ENG-04**: Attraction des couleurs identiques avec reconnexion uniquement au contact
- [x] **ENG-05**: Couleur de projectile immuable en vol ; munitions filtrées sur les couleurs présentes
- [x] **ENG-06**: Power-ups Bombe, Ralentir, Retour, Visée
- [x] **ENG-07**: Mode ZUMA, bonus saut, séries, perte de vie, victoire, score
- [x] **ENG-08**: Plusieurs chaînes par niveau

### Presentation

- [x] **UI-01**: Rendu canvas 640×480 avec HUD natif (menu, vies, score, niveau, jauge ZUMA)
- [x] **UI-02**: Panneau STATS monolithique avec bouton OK unique
- [x] **UI-03**: Sprites et fonds originaux quand le pack local existe, rendu vectoriel sinon
- [x] **UI-04**: Sons originaux ou synthèse WebAudio

### Assets & Tooling

- [x] **AST-01**: Extraction de l'installeur original et import en pack privé (courbes, niveaux, sons, sprites)
- [x] **AST-02**: Garde-fou de publication et CI
- [x] **PWA-01**: Manifeste, service worker, plein écran, tactile, build standalone

## v1.1 Requirements

### Gameplay fidelity

- [ ] **GAME-01**: Les réglages originaux `single`, `zumaslow`, `zumaback`, couleurs par temple et `partime` sont interprétés et documentés
- [ ] **GAME-02**: Le ressenti (vitesse de chaîne, recul, fréquence et durée des power-ups) est validé par l'utilisateur contre l'original sur au moins 3 niveaux
- [ ] **GAME-03**: Pièces bonus (TreasurePoint) apparaissent et rapportent des points quand elles sont touchées
- [ ] **GAME-04**: Séquence de début de niveau « Attention / PARTEZ » et séquence de fin (vidange, pop, bonus de temps)
- [ ] **GAME-05**: Placement de la grenouille sur le sprite original fidèle (bille en bouche, suivante dans l'écoutille), langue et clignement animés

### Progression

- [ ] **PROG-01**: Aventure par temples suivant `StageProgression` avec écran de transition
- [ ] **PROG-02**: Sauvegarde locale de la progression, reprise de partie, meilleurs scores
- [ ] **PROG-03**: Menu principal (aventure, options son/plein écran, aide)

### Audio & Visual polish

- [ ] **AV-01**: Musique de fond via conversion locale du `zuma.mo3` en ogg dans le pack, avec repli silencieux
- [ ] **AV-02**: Animations du couvercle de trou, scintillement des power-ups, trainée de visée
- [ ] **AV-03**: Ergonomie mobile : visée au doigt, bouton d'échange à l'écran, mise à l'échelle sans débordement

### Quality

- [ ] **QA-01**: Tests de `configFromSettings` et des nouvelles règles ; captures Playwright automatisées dans la CI (mode vectoriel)

## v2 Requirements

- **MODE-01**: Mode Gauntlet / Pratique / Survie
- **MODE-02**: Niveaux personnalisés via un éditeur de courbes
- **PWA-02**: Mise à jour automatique du service worker avec notification

## Out of Scope

| Feature | Reason |
|---------|--------|
| Publication des médias originaux | Droits PopCap/EA |
| RNG bit-à-bit | Non documenté, coût disproportionné |
| Multijoueur / backend | Produit local hors ligne |
| Décodeur MO3 navigateur | Format propriétaire ; conversion locale suffit |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01..08 | Phase 1 | Complete |
| UI-01..04 | Phase 2 | Complete |
| AST-01..02, PWA-01 | Phase 3 | Complete |
| GAME-02, GAME-05 | Phase 4 | Pending |
| GAME-01, GAME-03, GAME-04 | Phase 5 | Pending |
| PROG-01, PROG-02, PROG-03 | Phase 6 | Pending |
| AV-01, AV-02, AV-03 | Phase 7 | Pending |
| QA-01 | Phase 4 → 7 (transverse) | Pending |

**Coverage:**
- v1.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-10*
*Last updated: 2026-10-10 after GSD bootstrap*
