# Codebase Concerns

**Analysis Date:** 2026-10-10

## Tech Debt

**Réglages originaux : sémantiques établies par analyse statique (spike 05-RESEARCH, R2.0.16 ; `src/main.ts` `configFromSettings`, `src/core.ts`):**
- Établi (désassemblage du PE interne de `Zuma.exe`, adresses dans `05-RESEARCH.md`) : cadence 100 Hz (0x433a20, 0x4483ce ; conversions `ticks = maj × 0,6`, `px/s = px/maj × 100`) ; `speed` en px/maj avec rampe +0,005 / −0,1 px/maj² et arrêt du pousseur 40 maj après insertion dans le segment arrière (0x418780–0x4188e6, 0x423ac7, 0x423caa) ; `start` = % de la longueur de courbe, vitesse d'arrivée calculée (0x405060–0x405144), « PARTEZ » à `speed + 0,1` px/maj ou 500 maj (0x402070, 0x428a03) ; `repeat` = `Rand() % 100 <= repeat` → répétition (0x414bd7) ; `single` = seuil de réparation des isolées, 10 = désactivé (0x414bec–0x414c1f, 0x40aa50) ; `partime` en secondes et bonus ACE TIME `100 × (1 + ⌊250 × (1 − t/par)⌋)` compté dans le dialogue STATS 100 maj après l'ouverture, +100 toutes les 10 maj (0x401cb0, 0x440b00) ; `slowfactor` / `slowspeed` / `slowdistance` = zone lente avant la ligne de danger (0x4187ef–0x418832, 0x42ad98) ; `danger` 600 px = ligne de danger et départ de l'alerte, intervalle 4,1 → 0,6 s sans modulation de volume (0x41a9ac, 0x418a74–0x418afd) ; ZUMA : recul `zumaback` et × 0,25 pendant `zumaslow` seulement si la couverture dépasse 50 % (0x40a980–0x40a9a9, 0x4187dd), défauts 300 / 1100 maj ; décompte 60 px / 4 maj / +100 depuis la dernière destruction, départ +20 maj, pop toutes les 10 maj, STATS +50 maj (0x432cd0, 0x421550, 0x419469) ; pièce `max(500, 100 × ⌊score / 600⌋)` (0x4233fb) ; couleurs du dialogue STATS (0x4525f0). Verrouillé par `tests/r216.test.mjs` et `tests/r216-presentation.test.mjs`
- Hypothèses restantes : **A1** `repeat` 50 au 1-1 (attribut dupliqué 40 / 50, le dernier gagne) ; **A2** formule d'arrivée rapide appelée une seule fois au départ du niveau ; **A3** +10 000 par courbe en fin de niveau (`(100 − couverture) × 100`, couverture nulle une fois la courbe vide ; non recoupé par un score de l'original) ; **A4** bannière ZUMA 120 ticks (le binaire arme 224 maj) ; **A5** le `affiché / 1000` passé à `endoflevelpop1` pendant le compte à rebours est une hauteur (1 → 1,5 retenu) ; **A6** `treasurefreq` (défaut 300) en maj — non câblé, D-07 (9–15 s) conservé ; **A7** `defaultParTime = ⌈score × 35 / 1000⌉₅ × 0,95 × courbes` quand `partime` est absent ; question ouverte 3 : arrêt du pousseur à **chaque** insertion arrière (lecture : segment poussé par le pousseur ; sur une chaîne sans trou, chaque tir) ; recul / ralenti ZUMA appliqués à toutes les chaînes d'après la couverture maximale (l'original décide par courbe) ; interligne STATS 18 px (1,65 × hauteur d'encre de « A ») ; couvercle du crâne ouvert sur les 600 px de l'alerte ; compte à rebours sans mode rapide (2 500 par pas du binaire, déclencheur inconnu). Non localisés dans le binaire (décisions conservées) : départ du chronomètre à « PARTEZ » (D-13), rafraîchissement des munitions à chaque tick (D-14), roulement à gain constant (D-17)
- Why: deux points de contexte du désassemblage n'ont pas été suivis jusqu'au bout (A2, A3) et plusieurs sous-systèmes (chronomètre, munitions, roulement, pièces) n'ont pas été localisés dans le temps du spike
- Impact: A3 double potentiellement les scores de fin de niveau par rapport à l'original ; A1 décale la répétition de 10 points au 1-1 ; le reste est cosmétique ou sonore
- Fix approach: relevé vidéo de l'original uniquement pour A3 (score affiché à la fin d'un niveau à une courbe), A1 (part des répétitions au 1-1), la règle de dégagement `dist` et `treasurefreq` (cadence des pièces) ; les autres points se tranchent au ressenti en UAT 5 (`05-UAT.md`) ; `levelBonus` reste configurable (retomber à 1 000 si le score paraît absurde)

**Pièces et fin de niveau (plans 05-02 / 05-04 / 05-05 / 05-06):**
- Vérifié (spike) : `coinPoints` dérivé de `score` (500 au temple 1), décompte 60 px / 4 maj / +100 avec le bonus de niveau par courbe (montant A3 ci-dessus), ACE TIME compté dans le dialogue STATS
- Issue (hypothèses) : règle de dégagement d'un `TreasurePoint` = aucune bille vivante de la courbe à moins de `dist` px (`dist1` retenu, `dist = 0` toujours libre) ; délai d'apparition 9–15 s et 6 s de visibilité (`treasurefreq` non câblé, A6) ; rayon de ramassage 18 px ; série conservée au ramassage
- Why: l'utilisateur ne peut pas lancer l'original (macOS) ; le consommateur de `treasurefreq` et la logique de placement des pièces n'ont pas été analysés
- Impact: fréquence des pièces potentiellement différente de l'original
- Fix approach: relevé vidéo d'un 1-1 original (instant d'apparition et durée de la pièce, point choisi) puis ajuster `coinMinGapTicks` / `coinMaxGapTicks` / `coinVisibleTicks` et la règle `dist` ; verrous dans `tests/r215.test.mjs`

**Recul et poussoir (`moveChain`, `updatePusher`):**
- Issue: l'arrêt du pousseur (24 ticks, redémarrage de 0) et la rampe (50 / 1000 px/s²) sont désormais ceux de l'original ; reste l'interaction entre le recul local (`recoilSpeed` / `recoilTicks`, 8 ticks) et le pousseur : quand un recul repousse la composante 0, le poussoir est bloqué pour le tick — approximation
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

- Musique (`zuma.mo3`), menu principal original, modes Gauntlet/Pratique, sauvegarde de partie, lumière de piste de l'alerte (`SOUND_TRAIL_LIGHT`, effet 0x4157b0), mode rapide du compte à rebours STATS

---

*Concerns audit: 2026-10-10 (R2.0.16)*
