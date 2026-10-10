# Codebase Concerns

**Analysis Date:** 2026-10-10

## Tech Debt

**Réglages originaux interprétés par hypothèse (`src/main.ts` `configFromSettings`, plan 04-06):**
- Issue: depuis R2.0.14, `repeat` = probabilité (%) de répéter la couleur précédente, `single` = probabilité (%) de bille isolée, `score` = points à marquer dans le niveau pour remplir la jauge ZUMA (le bonus de fin de niveau reste fixe à 1000). Ces trois lectures sont des hypothèses : cohérentes avec le texte d'aide original (« Marquez des points pour remplir la barre orange ») et avec le retour utilisateur (groupes de couleurs dès 1-1), mais non mesurées sur l'original. Depuis R2.0.15 (plans 05-02 / 05-04), `zumaslow` et `zumaback` sont interprétés par hypothèse : recul pendant `zumaback` pas puis ralenti pendant `zumaslow` pas au passage en mode ZUMA (pas à 100 Hz × 0,6 → `zumaBackTicks` / `zumaSlowTicks`, un seul niveau `lvl35` les porte) ; `partime` est le temps d'expert : affiché (OBJECTIF) et converti en bonus `max(100, 10 × secondes restantes)` si le niveau est fini dans le temps (formule : hypothèse). Restent ignorés : `mergespeed` (n'a inspiré que `mergeTicks`), `reloaddelay` ; le nombre de couleurs est déduit du temple (4/5/6) quand `colors` est absent. Verrouillé par `tests/r215-presentation.test.mjs` (`configFromSettings`)
- Why: sémantique non documentée dans `levels.xml`
- Impact: difficulté et rythme peuvent s'écarter de l'original (jauge trop rapide ou trop lente, fréquence des billes isolées)
- Fix approach: mesurer sur le jeu original la taille des groupes à l'apparition (niveau 1-1 et un niveau à `single`), le nombre de points au passage en mode ZUMA, puis le comportement de la chaîne en mode ZUMA (`zumaslow`/`zumaback`) ; verrouiller par tests (`tests/r214.test.mjs` fixe déjà la loi actuelle)

**Pièces et fin de niveau (hypothèses, plan 05-02 ; présentation plan 05-04):**
- Issue: les montants et les rythmes ne sont lisibles ni dans `levels.xml` ni dans les ressources : `coinPoints` = 100 par pièce ramassée, `cleanupPoints` = 10 points par bille toutes les 4 ticks (`cleanupStepTicks`) de l'explosion finale au crâne, bonus de temps d'expert `aceTimeBonus = max(100, 10 × floor(partime − secondes))` quand TEMPS ≤ OBJECTIF, règle de dégagement d'un `TreasurePoint` = aucune bille vivante de la courbe à moins de `dist` px (`dist1` retenu, `dist = 0` toujours libre), délai d'apparition 9–15 s et 6 s de visibilité, rayon de ramassage 18 px, série conservée au ramassage, STATS 60 ticks après l'arrivée au crâne
- Why: l'utilisateur ne peut pas lancer l'original (macOS) ; seules les ressources extraites (`COIN.gif`, `sparkle.gif`, `endoflevelpop1`, chaînes `GET_READY` / `GO`) tranchent sur la présentation, pas sur les nombres
- Impact: score de fin de niveau et RECORD de score potentiellement différents de l'original ; fréquence des pièces et rythme du décompte à l'oreille seulement
- Fix approach: mesurer sur le jeu original (capture vidéo d'un niveau 1-1 : instant d'apparition et durée de la pièce, points affichés au ramassage, points par pas du décompte et cadence des pops, bonus affiché sur l'écran STATS pour un temps connu) puis ajuster `CANDIDATE` ; les verrous sont dans `tests/r215.test.mjs` (moteur) et `tests/r215-presentation.test.mjs` (réglages)

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
