# Zuma PWA

## What This Is

Reconstruction web/PWA de Zuma Deluxe (PopCap) : le joueur, grenouille au centre du plateau, tire des billes colorées dans une chaîne qui roule vers un crâne et détruit des groupes de trois ou plus. Le dépôt public contient le moteur, le rendu et les outils ; les ressources originales (niveaux, sprites, sons) sont importées localement depuis la copie légale de l'utilisateur et ne sont jamais publiées.

## Core Value

Retrouver les sensations du Zuma original dans un navigateur : même géométrie de niveaux, mêmes règles de chaîne (insertion, attraction, enchaînements, power-ups), même lecture visuelle et sonore.

## Requirements

### Validated

- ✓ Moteur déterministe à pas fixe avec insertion à identifiants stables, destruction persistante 40 ticks, recul local, attraction au contact, couleur de projectile immuable — R2.0.13
- ✓ Quatre power-ups (Bombe, Ralentir, Retour, Visée) avec sons dédiés — R2.0.13
- ✓ Mode ZUMA, bonus saut, séries, perte de vie, victoire, score — R2.0.13
- ✓ Plusieurs chaînes par niveau (plateaux « dual ») — R2.0.13
- ✓ Rendu canvas 640×480 : sprites originaux si pack local, vectoriel sinon ; HUD natif ; panneau STATS — R2.0.13
- ✓ Import des ressources originales : extraction de l'installeur, décodage des courbes `CURV`, `levels.xml`, sons, sprites ; garde-fou de publication — R2.0.13
- ✓ PWA installable (manifeste, service worker, plein écran, tactile) ; build standalone fichier unique — R2.0.13
- ✓ 31 tests de non-régression + CI — R2.0.13

### Active

- [ ] Point de validation jouable avec l'utilisateur et corrections de ressenti (vitesse, recul, visibilité des power-ups, placement de la grenouille)
- [ ] Interprétation complète des réglages originaux (`single`, `zumaslow`, `zumaback`, couleurs par temple, `partime`)
- [ ] Pièces bonus (TreasurePoint / COIN) et textes de bonus associés
- [ ] Séquences de niveau de l'original : « Attention / PARTEZ », fin de niveau (vidange + pop), transition de temple
- [ ] Animations manquantes : langue, clignement, couvercle du trou, scintillement des power-ups
- [ ] Musique de fond (lecture du `zuma.mo3` ou substitution)
- [ ] Sauvegarde de progression et de meilleurs scores, reprise de partie
- [ ] Menu principal, aventure par temples, mode Gauntlet/Pratique
- [ ] Ergonomie mobile (visée tactile, bouton d'échange) et performances

### Out of Scope

- Distribution des médias originaux dans le dépôt ou un hébergement public — propriété de PopCap/EA ; seul le code de reconstruction est public
- Reproduction bit-à-bit du RNG original — non documenté, coût disproportionné ; on vise l'équivalence de ressenti
- Multijoueur, classement en ligne, backend — le produit est local et hors ligne
- Lecture native du format MO3 dans le navigateur — format propriétaire ; passer par une conversion locale (ogg) ou une musique de substitution

## Context

- Historique : R2.0.7 → R2.0.12 n'avaient publié que des notes de version et deux tests ; R2.0.13 (PR #1) a reconstruit l'ensemble.
- Le format des niveaux originaux est décodé (`tools/import-original.mjs`) : 21 plateaux, points de contrôle + polyligne au pixel avec drapeaux de tunnel ; `levels.xml` fournit positions de la grenouille, découpes, réglages de difficulté et progression par temples (13 étages).
- Unités originales : mises à jour à 100 Hz (vitesse en px/update) converties vers 60 Hz dans `configFromSettings`.
- Captures Playwright de validation : niveau « Spirale du destin » avec sprites, repli vectoriel, panneau STATS.
- Codebase map : `.planning/codebase/`.

## Constraints

- **Légal**: aucune ressource originale commitée ou publiée — `npm run guard` et la CI bloquent ; le pack vit dans `private_assets/`
- **Tech stack**: TypeScript strict, zéro dépendance runtime, canvas 2D, Node 22 pour l'outillage — garder le projet léger et auditable
- **Compatibilité**: 640×480 natif mis à l'échelle, souris + tactile, fonctionnement hors ligne
- **Qualité**: toute règle de jeu modifiée est verrouillée par un test dans `tests/`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Moteur sans DOM, événements drainés par la présentation | Testable en Node, déterministe, rejouable | ✓ Good |
| Pack privé importé localement plutôt que ressources embarquées | Respect des droits, dépôt public propre | ✓ Good |
| Repli vectoriel complet quand le pack est absent | Jouable et testable sans l'original, démo publique possible | ✓ Good |
| Réglages originaux convertis 100 Hz → 60 Hz | Garder un pas fixe simple côté web | — Pending (à valider au ressenti) |
| Multi-chaînes dans le moteur dès R2.0.13 | Trois plateaux « dual » dans l'original | — Pending |
| Développement piloté par GSD (`.planning/`) | Demande utilisateur : phases, vérification, traçabilité | — Pending |

---
*Last updated: 2026-10-10 after R2.0.13 baseline and GSD bootstrap*
