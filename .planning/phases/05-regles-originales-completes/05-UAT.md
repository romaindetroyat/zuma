# Phase 5: Règles originales complètes — UAT

## Quatrième session (2026-10-10, standalone R2.0.15, macOS)

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
| U14 | Vitesse et enchaînement des séries de couleur : trop dur tout de suite ; « vérifie la logique du jeu original » | `speed` converti en `speed × 100` px/s (hypothèse 100 Hz) ; `repeat` 50 % ; `maxspeed`/`slowspeed` existent dans Zuma.exe sans figurer dans `levels.xml` | Spike d'analyse statique de `Zuma.exe` (unités, cadence, sémantique repeat/single/partime) puis plan 05-05 → livré en 05-05 (arrêt du pousseur 24 ticks, zone lente de fin de piste ÷ 4 sur 1100 px, rampe 50 / 1000 px/s², `repeat` 0,51, `single` = seuil de réparation ; `speed × 100` px/s confirmé) |
| U15 | Alerte « stress » trop tardive | `WARNING_DISTANCE` 220 px | Plan 05-05 : distance établie par le spike → livré en 05-06 (600 px, le réglage `danger` ; intervalle 4,1 → 0,6 s ; gain constant) |
| U16 | Bonus de distance en fin de niveau : trop rapide, pas conforme | 1 pas (32 px) toutes les 4 ticks, +10 | Plan 05-05 : cadence et montants revus après spike → livré en 05-05 / 05-06 (60 px / 4 maj / +100 depuis la dernière destruction, premier pas +20 maj, pops toutes les 10 maj à hauteur fixe et gain 0,5, STATS 50 maj après le dernier pas ; « +100 » jaune avec étincelles) |
| U17 | Bonus de réussite sous le temps objectif non perçu | `partime` 25 s au 1-1 inatteignable tel qu'interprété ; bonus affiché seulement dans STATS | Plan 05-05 : chronomètre démarré à « PARTEZ », unités de `partime` vérifiées par spike → livré en 05-05 / 05-06 (chronomètre à PARTEZ, `partime` en secondes, formule ACE TIME originale `100 × (1 + ⌊250 × (1 − t/par)⌋)`, bonus compté dans l'écran STATS +100 toutes les 100 ms avec POINTS et le score du HUD qui suivent ; l'annonce « BONUS TEMPS +N » de D-15 est remplacée par ce compte à rebours, conforme à l'original) |
| U18 | Son de roulement pas sûr d'être l'original, à adapter | `rolling.ogg` bouclé avec gain proportionnel à la vitesse (quasi inaudible en vitesse de croisière) | Plan 05-06 : gain constant quand la chaîne avance, fondu à l'arrêt, hauteur 1 → livré en 05-06 (gain 0,6 dès 2 px/s de déplacement mesuré, fondu 150 ms, hauteur 1, muet pendant le décompte) |
| U19 | STATS : encore plus ressemblant, vérifier les scores, dispositions des textes, polices | Composition native livrée ; positions dérivées de la référence R2.0.12 | Plan 05-06 : revue de la mise en page (alignements, interlignes, tailles), vérification des valeurs (POINTS = points du niveau, COMBOS, SAUTS…), bouton OK, titre teinté comme l'original → livré en 05-06 (couleurs lues dans l'exécutable : TEMPS jaune, OBJECTIF orange, BONUS vert, « PAS DE BONUS » gris-vert ; interligne 1,65 × hauteur de capitale = 18 px ; titre doré par multiplication ; valeurs alignées à droite ; test de bout en bout sur une fixture connue) |
| U20 | Atteinte du ZUMA / jauge pleine pas assez marquée | Message + son `chant4` | Plan 05-06 : bannière « ZUMA ! » en police titre, jauge qui pulse, son conservé → livré en 05-06 (bannière 120 ticks en `NativeAlienExtended18`, jauge pulsante, `chant4`) |
| U21 | Couleur de la bille à lancer : changer immédiatement quand une couleur disparaît, sans délai, de façon rétroactive | `refreshAmmo` ne s'exécute qu'au retrait logique (40 ticks après l'explosion) | Plan 05-05 : rafraîchissement dès le marquage de destruction (les billes en explosion ne comptent plus), courante et suivante, à chaque tick ; projectile en vol inchangé (verrou r206) → livré en 05-05 |

Navigateur : macOS (à préciser). Validés implicitement : pièces, « Attention / PARTEZ », STATS natif dans son principe, RECORD affiché.

## Cinquième session (à remplir)

Standalone R2.0.16 (`standalone/zuma-standalone.html`, macOS, Safari ou Chrome), niveau 1-1 puis un niveau à plusieurs courbes. Notes de version : `R216_RELEASE_NOTES.md`.

### Points à vérifier (U14–U21)

- U14 — la chaîne arrive vite puis « PARTEZ » (≈ 1,5 s) ; chaque tir dans la chaîne arrière la stoppe ≈ 0,4 s puis elle repart doucement ; en fin de piste elle ralentit jusqu'à ÷ 4 ; les séries de couleurs restent fréquentes (`repeat` 51 %).
- U15 — l'alerte commence loin du crâne (600 px) et s'accélère de ~4 s à ~0,6 s sans monter en volume ; le couvercle du crâne s'ouvre sur la même distance.
- U18 — le roulement est audible à volume constant dès que la chaîne bouge et s'éteint à l'arrêt.
- U20 — « ZUMA ! » en grande police avec la jauge qui pulse.
- U16 — après la dernière bille, les « +100 » défilent avec étincelles et pops réguliers, puis l'écran STATS s'ouvre aussitôt.
- U17 — dans le STATS, BONUS monte de 100 en 100 avec un pop montant et POINTS (et le score du HUD) suivent ; OK crédite le reste.
- U19 — TEMPS jaune, OBJECTIF orange, BONUS vert, titre doré, valeurs alignées à droite, interligne 18 px.
- U21 — la bille à lancer change dès l'explosion.

### Hypothèses à confirmer au ressenti

- +10 000 par courbe en fin de niveau (A3) : le score paraît-il gonflé ?
- Arrêt du pousseur à chaque insertion arrière (question ouverte 3).
- `repeat` 50 au 1-1 (A1) : part des répétitions.
- Appel unique de l'arrivée rapide (A2) : durée de l'arrivée.
- Bannière ZUMA 120 ticks (A4) contre 224 maj.
- Hauteur du pop du compte à rebours (A5).
- `defaultParTime` (A7) : objectif par défaut des niveaux sans `partime` et des niveaux procéduraux.
- Recul / ralenti ZUMA appliqués à toutes les chaînes d'après la couverture maximale.
- Interligne STATS 18 px (hauteur de capitale mesurée).
- Couvercle du crâne ouvert dès 600 px.
- Compte à rebours sans mode rapide (un bonus de ≈ 24 000 compte ≈ 24 s ; le reste est crédité sur OK).
- `levelwin` (`chant5`) qui se chevauche avec les `pop` du dialogue.
- Fondu du roulement à l'arrêt : décroissance quasi exponentielle d'≈ 0,4 s (rampe relancée à chaque image) plutôt que 150 ms linéaires — acceptable à l'oreille ? (voir `deferred-items.md`).

### Observation reportée (cosmétique, 05-04)

- Le score du HUD est dessiné sous la tête du STATS natif (le canvas continue de dessiner le HUD pendant que le panneau est ouvert) — toujours cosmétique.

### Constats

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
| | | | |
