# Codebase Concerns

**Analysis Date:** 2026-10-10

## Tech Debt

**Réglages originaux interprétés par hypothèse (`src/main.ts` `configFromSettings`, plan 04-06):**
- Issue: depuis R2.0.14, `repeat` = probabilité (%) de répéter la couleur précédente, `single` = probabilité (%) de bille isolée, `score` = points à marquer dans le niveau pour remplir la jauge ZUMA (le bonus de fin de niveau reste fixe à 1000). Ces trois lectures sont des hypothèses : cohérentes avec le texte d'aide original (« Marquez des points pour remplir la barre orange ») et avec le retour utilisateur (groupes de couleurs dès 1-1), mais non mesurées sur l'original. Restent ignorés : `zumaslow`, `zumaback` (vraisemblablement vitesse/recul en mode ZUMA), `mergespeed` (n'a inspiré que `mergeTicks`), `reloaddelay` ; le nombre de couleurs est déduit du temple (4/5/6) quand `colors` est absent
- Why: sémantique non documentée dans `levels.xml`
- Impact: difficulté et rythme peuvent s'écarter de l'original (jauge trop rapide ou trop lente, fréquence des billes isolées)
- Fix approach: mesurer sur le jeu original la taille des groupes à l'apparition (niveau 1-1 et un niveau à `single`), le nombre de points au passage en mode ZUMA, puis le comportement de la chaîne en mode ZUMA (`zumaslow`/`zumaback`) ; verrouiller par tests (`tests/r214.test.mjs` fixe déjà la loi actuelle)

**Recul et poussoir (`moveChain`):**
- Issue: quand un recul repousse la composante 0, le poussoir est bloqué pour le tick ; approximation du comportement original
- Impact: micro-saccade possible pendant 8 ticks
- Fix approach: mesurer sur l'original ; ajuster `recoilSpeed`/`recoilTicks`

**Visibilité des power-ups:**
- Issue: `powerGuardTicks`/`powerVisibleTicks`/`powerChance` sont des hypothèses ; la loi RNG exacte reste à documenter (déjà noté dans les notes de version historiques)

**Placement de la grenouille sur le sprite original:**
- Issue: offsets `front=16`/`back=20` choisis à l'œil ; langue et clignement non animés

**Service worker:**
- Issue: cache-first sur tout GET même origine ; une mise à jour d'assets du pack nécessite un nouveau build (version dans le nom du cache)

## Known Bugs

Aucun bug reproductible connu à la date d'analyse. Points à surveiller : chevauchement visuel chaîne/explosion pendant les 40 ticks (voulu), spawn immédiat après `backwards` ramenant des billes sous `s<0`.

## Security Considerations

- Aucune donnée utilisateur hors meilleur score local
- Les ressources originales sont propriétaires : ne jamais les publier ; `tools/guard.mjs` + CI bloquent les extensions et dossiers sensibles

## Performance

- `Track.nearest` est O(points) par projectile et par tick (≈3000 points sur les pistes originales) : acceptable (< 5 projectiles), à indexer si besoin
- Composition alpha des feuilles de sprites faite une fois au chargement

## Fragile Areas

- `tests/r211` vérifie la CSS après le dernier marqueur littéral `R2.0.11` : conserver ce marqueur et les sélecteurs compacts
- `tools/build.mjs --standalone` dépend du dépouillage regex des `import/export` : éviter `export { … }` et les `export default`

## Missing / Not yet built

- Pièces bonus (TreasurePoint / COIN), écran « Attention / PARTEZ », musique (`zuma.mo3`), menu principal original, modes Gauntlet/Pratique, sauvegarde de partie

---

*Concerns audit: 2026-10-10*
