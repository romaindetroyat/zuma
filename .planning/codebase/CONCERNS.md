# Codebase Concerns

**Analysis Date:** 2026-10-10

## Tech Debt

**Réglages originaux : sémantiques établies par analyse statique (spike 05-RESEARCH, R2.0.16 ; `src/main.ts` `configFromSettings`, `src/core.ts`):**
- Établi (désassemblage du PE interne de `Zuma.exe`, adresses dans `05-RESEARCH.md`) : cadence 100 Hz (0x433a20, 0x4483ce ; conversions `ticks = maj × 0,6`, `px/s = px/maj × 100`) ; `speed` en px/maj avec rampe +0,005 / −0,1 px/maj² et arrêt du pousseur 40 maj après insertion dans le segment arrière (0x418780–0x4188e6, 0x423ac7, 0x423caa) ; `start` = % de la longueur de courbe, vitesse d'arrivée calculée (0x405060–0x405144), « PARTEZ » à `speed + 0,1` px/maj ou 500 maj (0x402070, 0x428a03) ; `repeat` = `Rand() % 100 <= repeat` → répétition (0x414bd7) ; `single` = seuil de réparation des isolées, 10 = désactivé (0x414bec–0x414c1f, 0x40aa50) ; `partime` en secondes et bonus ACE TIME `100 × (1 + ⌊250 × (1 − t/par)⌋)` compté dans le dialogue STATS 100 maj après l'ouverture, +100 toutes les 10 maj (0x401cb0, 0x440b00) ; `slowfactor` / `slowspeed` / `slowdistance` = zone lente avant la ligne de danger (0x4187ef–0x418832, 0x42ad98) ; `danger` 600 px = ligne de danger et départ de l'alerte, intervalle 4,1 → 0,6 s sans modulation de volume (0x41a9ac, 0x418a74–0x418afd) ; ZUMA : recul `zumaback` et × 0,25 pendant `zumaslow` seulement si la couverture dépasse 50 % (0x40a980–0x40a9a9, 0x4187dd), défauts 300 / 1100 maj ; décompte 60 px / 4 maj / +100 depuis la dernière destruction, départ +20 maj, pop toutes les 10 maj, STATS +50 maj (0x432cd0, 0x421550, 0x419469) ; pièce `max(500, 100 × ⌊score / 600⌋)` (0x4233fb) ; couleurs du dialogue STATS (0x4525f0). Verrouillé par `tests/r216.test.mjs` et `tests/r216-presentation.test.mjs`
- Établi par le spike 02 (`05-RESEARCH-02.md`, R2.0.17) : score d'un match `10 × n + 100 × combo + saut` (+ `(chain + 5) × 10` dès le 5ᵉ tir réussi consécutif, match direct seulement) avec textes « +N » / « COMBO x{combo + 1} » / « BONUS … SAUT » sans montant / « ENCHAÎNEMENT x{chain} » (0x420b80–0x421231) ; match d'un groupe = somme des bonus de saut des billes, max du nombre de brèches, une ligne COMBOS / SAUTS par match (0x421240) ; bonus de saut calculé à l'insertion `max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀) × brèches` sur la largeur minimale des brèches (0x421cac–0x421d2b, 0x40a810), armé sur la bille, payé par le match, gardé par une bille posée contre sa couleur, effacé sinon (0x421d59, 0x421dbc) ; sons `gapbonus1` à 0 / 15 / 30 maj à 0 / +2 / +3 demi-tons, `chain1` à `chain − 5` (0x415350) ; compte à rebours STATS +100 toutes les 10 maj **sans accélération en aventure** (`plateau+0x186` = drapeau de mode de jeu ; solde instantané 0x440ac0 seulement à la sauvegarde) (0x440b00) ; libellés droits du STATS à `x0 + 200` (0x447dd5–0x447dea). Verrouillé par `tests/r217.test.mjs` et `tests/r217-presentation.test.mjs`
- Hypothèses restantes : **A1** `repeat` 50 au 1-1 (attribut dupliqué 40 / 50, le dernier gagne) ; **A2** formule d'arrivée rapide appelée une seule fois au départ du niveau ; **A3** +10 000 par courbe en fin de niveau (`(100 − couverture) × 100`, couverture nulle une fois la courbe vide ; non recoupé par un score de l'original) ; **A4** bannière ZUMA 120 ticks (le binaire arme 224 maj) ; **A5** le `affiché / 1000` passé à `endoflevelpop1` pendant le compte à rebours est une hauteur (1 → 1,5 retenu) ; **A6** `treasurefreq` (défaut 300) en maj — non câblé, D-07 (9–15 s) conservé ; **A7** `defaultParTime = ⌈score × 35 / 1000⌉₅ × 0,95 × courbes` quand `partime` est absent ; question ouverte 3 : arrêt du pousseur à **chaque** insertion arrière (lecture : segment poussé par le pousseur ; sur une chaîne sans trou, chaque tir) ; recul / ralenti ZUMA appliqués à toutes les chaînes d'après la couverture maximale (l'original décide par courbe) ; interligne STATS 18 px (1,65 × hauteur d'encre de « A ») ; couvercle du crâne ouvert sur les 600 px de l'alerte. Spike 02 (R2.0.17) : **B1** la largeur de brèche `w` (0x40a810) est prise en px de piste (`next.s − prev.s − ballSpacing`), la fonction qui remplit la liste des brèches n'ayant pas été lue — barème de saut trop ou pas assez généreux si faux ; **B3** alignement de la primitive 0x45a430 et `y` exacts des lignes du STATS non lus (repli : grille commune, valeurs alignées à droite dans leur colonne) ; **B4** garde `courbe+0x7c` des sons de match (pas de `BALLDESTROYED` / `chime1` quand le groupe a déclenché un power-up) non implémentée, prédicat `0x4015c0 ≠ 4` supposé ; couleur du « +N » = couleur de la bille rendue (table 0x587408 non extraite) ; bille en attente (posée contre sa couleur) qui garde son bonus de saut mais n'entretient pas l'enchaînement (règle `+0x32` non implémentée). **Déviation volontaire D-21** : le compte à rebours du STATS est borné à ≤ 20 pas (multiple de 100 ≥ total / 20 au-delà de 2 000) et un clic sur le dialogue passe à 2 500 par pas, alors que l'original ne connaît aucune accélération en aventure (demandé en UAT 5, U24). Non localisés dans le binaire (décisions conservées) : départ du chronomètre à « PARTEZ » (D-13), rafraîchissement des munitions à chaque tick (D-14), roulement à gain constant (D-17)
- Why: deux points de contexte du désassemblage n'ont pas été suivis jusqu'au bout (A2, A3), plusieurs sous-systèmes (chronomètre, munitions, roulement, pièces) n'ont pas été localisés dans le temps du premier spike, et le second n'a pas lu la fonction de mesure des brèches ni la fonction de dessin complète du STATS (B1, B3)
- Impact: A3 double potentiellement les scores de fin de niveau par rapport à l'original ; A1 décale la répétition de 10 points au 1-1 ; B1 décale le barème de saut (500 … 10 par brèche) ; le reste est cosmétique ou sonore
- Fix approach: relevé vidéo de l'original uniquement pour A3 (score affiché à la fin d'un niveau à une courbe), A1 (part des répétitions au 1-1), B1 (« +N » d'un tir à travers une brèche serrée puis large), la règle de dégagement `dist` et `treasurefreq` (cadence des pièces) ; les autres points se tranchent au ressenti en UAT 6 (`05-UAT.md`) ; `levelBonus` reste configurable (retomber à 1 000 si le score paraît absurde) ; D-21 se retire en ramenant `bonusCountStep` à 100 et en retirant l'écouteur `pointerdown` si l'utilisateur préfère la fidélité

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

Aucun bug reproductible connu à la date d'analyse. Corrigés en R2.0.17 : fondu du roulement relancé à chaque image (`setLoop` → `rampPlan`, rampe armée une seule fois par changement de cible, 0,6 → 0 linéaire en 150 ms) ; signe « + » du bonus plus pâle que les chiffres (masque `Cancun12` du « + » à alpha 187, `normalizeGlyphAlpha`) ; ellipse d'astuce invisible (aucune police du pack ne définit U+2026, repli « ... ») ; `bitmapfont.js` et `statsdialog.js` absents du précache du service worker. Points à surveiller : chevauchement visuel chaîne/explosion pendant les 40 ticks (voulu), spawn immédiat après `backwards` ramenant des billes sous `s<0`.

## Security Considerations

- Aucune donnée utilisateur hors meilleur score local
- Les ressources originales sont propriétaires : ne jamais les publier ; `tools/guard.mjs` + CI bloquent les extensions et dossiers sensibles

## Performance

- `Track.nearest` est O(points) par projectile et par tick (≈3000 points sur les pistes originales) : acceptable (< 5 projectiles), à indexer si besoin
- Composition alpha des feuilles de sprites faite une fois au chargement
- Écran STATS composé à l'échelle du magasin de pixels dans un canvas enfant (≈ 2 000 × 1 500 à 3,1 ×, borné à 4 ×) et recomposé à chaque ligne révélée, chaque pas du compte à rebours (100 ms) et chaque état du bouton : 0,8–1,6 ms par composition mesurés à 3,125 × avec le kit 2 × (1,5–2,2 ms en 1 ×, plan 05-08) — sans PNG intermédiaire depuis R2.0.17
- Actifs 2 × EPX (polices, pièces du dialogue, bouton, billes, ombre, icônes, barre de menu) construits une seule fois dès que l'échelle atteint 1,5 et jamais en « Pixels nets » : 40 images, 16,26 Mio mesurés avec le pack (barre de menu 4,69 Mio en pleine 640 × 480, six feuilles de billes 4,4 Mio) ; la bascule 1 × ↔ 2 × ne reconstruit rien. Réduction possible : recadrer la barre de menu sur ses lignes opaques, partager une ombre entre les feuilles

## Fragile Areas

- `tests/r211` vérifie la CSS après le dernier marqueur littéral `R2.0.11` : conserver ce marqueur et les sélecteurs compacts
- `tools/build.mjs --standalone` dépend du dépouillage regex des `import/export` : éviter `export { … }` et les `export default` ; `src/upscale.ts` doit rester une feuille (seul `original.ts` l'importe à l'exécution) pour que l'ordre de concaténation `MODULES` tienne
- Le dialogue STATS est un `<canvas class="stats-picture">` enfant de `.zuma-stats` : les verrous D-01 (aucun `url(` dans la CSS, un seul bouton OK) et `r215-presentation` lisent cette structure ; `loadBitmapFont` est mémoïsé par (pack, clé) et le HUD partage ses polices avec le kit STATS — un `upscaled()` ou une teinte en cache est donc partagé aussi

## Missing / Not yet built

- Musique (`zuma.mo3`), menu principal original, modes Gauntlet/Pratique, sauvegarde de partie, lumière de piste de l'alerte (`SOUND_TRAIL_LIGHT`, effet 0x4157b0), garde B4 des sons de match (power-up déclenché ⇒ silence), règle de la bille en attente qui entretient l'enchaînement (`+0x32`), filtre xBR (non retenu : EPX suffit, zéro dépendance), base 250 du bonus de saut en mode gauntlet (`plateau+0x187`)

---

*Concerns audit: 2026-10-10 (R2.0.17)*
