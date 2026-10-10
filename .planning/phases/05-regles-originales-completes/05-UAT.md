# Phase 5: Règles originales complètes — UAT

## Quatrième session (2026-10-10, standalone R2.0.15, macOS)

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
| U14 | Vitesse et enchaînement des séries de couleur : trop dur tout de suite ; « vérifie la logique du jeu original » | `speed` converti en `speed × 100` px/s (hypothèse 100 Hz) ; `repeat` 50 % ; `maxspeed`/`slowspeed` existent dans Zuma.exe sans figurer dans `levels.xml` | Spike d'analyse statique de `Zuma.exe` (unités, cadence, sémantique repeat/single/partime) puis plan 05-05 |
| U15 | Alerte « stress » trop tardive | `WARNING_DISTANCE` 220 px | Plan 05-05 : distance en fonction de la longueur de piste (≈ 20 %), montée plus lente |
| U16 | Bonus de distance en fin de niveau : trop rapide, pas conforme | 1 pas (32 px) toutes les 4 ticks, +10 | Plan 05-05 : cadence et montants revus après spike ; au minimum pas de 2 billes toutes les 6 ticks, montée de hauteur sonore conservée |
| U17 | Bonus de réussite sous le temps objectif non perçu | `partime` 25 s au 1-1 inatteignable tel qu'interprété ; bonus affiché seulement dans STATS | Plan 05-05 : chronomètre démarré à « PARTEZ », unités de `partime` vérifiées par spike, bonus annoncé à l'écran en fin de niveau (« BONUS TEMPS +N ») et ajouté visiblement au score |
| U18 | Son de roulement pas sûr d'être l'original, à adapter | `rolling.ogg` bouclé avec gain proportionnel à la vitesse (quasi inaudible en vitesse de croisière) | Plan 05-06 : gain constant quand la chaîne avance, fondu à l'arrêt, hauteur 1 |
| U19 | STATS : encore plus ressemblant, vérifier les scores, dispositions des textes, polices | Composition native livrée ; positions dérivées de la référence R2.0.12 | Plan 05-06 : revue de la mise en page (alignements, interlignes, tailles), vérification des valeurs (POINTS = points du niveau, COMBOS, SAUTS…), bouton OK, titre teinté comme l'original |
| U20 | Atteinte du ZUMA / jauge pleine pas assez marquée | Message + son `chant4` | Plan 05-06 : bannière « ZUMA ! » en police titre, jauge qui pulse, son conservé |
| U21 | Couleur de la bille à lancer : changer immédiatement quand une couleur disparaît, sans délai, de façon rétroactive | `refreshAmmo` ne s'exécute qu'au retrait logique (40 ticks après l'explosion) | Plan 05-05 : rafraîchissement dès le marquage de destruction (les billes en explosion ne comptent plus), courante et suivante, à chaque tick ; projectile en vol inchangé (verrou r206) |

Navigateur : macOS (à préciser). Validés implicitement : pièces, « Attention / PARTEZ », STATS natif dans son principe, RECORD affiché.
