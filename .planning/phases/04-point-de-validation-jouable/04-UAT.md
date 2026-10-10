# Phase 4: Point de validation jouable — UAT

**Session:** 2026-10-10, standalone R2.0.13 (+ correctif 261010-bba) ouvert dans un navigateur de bureau, niveau 1-3 (riverbed) atteint, score 6530, 3 vies.
**Verdict utilisateur :** « une sorte de catastrophe sur plein d'aspects ».

## Retours (verbatim condensé)

| # | Constat | Cause identifiée | Statut |
|---|---------|------------------|--------|
| U1 | Affichage : le niveau 1-3 est impossible ; le fond semble pris d'un fichier existant et étiré ; le parcours des billes doit être adapté | `tools/import-original.mjs` copie la vignette `perm_thumbnails/<id>.jpg` (320×240) sous le même nom que le fond `<id>.jpg` (640×480) et l'écrase ; le rendu l'étire ensuite. Les `BackgroundAlpha` (riverbed, serpents) sont découpés dans cette vignette et dessinés par-dessus les billes au lieu de sous elles. Les courbes sont correctes (coordonnées natives). | À corriger (Phase 4) |
| U2 | Les sons ne sont pas respectés alors qu'ils sont dans le `.exe` | Première lecture de chaque son = synthèse (décodage asynchrone) ; `.ogg` non décodable par Safari (`decodeAudioData`) → repli synthèse permanent ; sons de roulement/alerte non câblés | À corriger (Phase 4) |
| U3 | Les billes insérées doivent « faire leur place » dans un mouvement visible, pas apparaître d'un coup | `land()` insère à largeur pleine et pousse instantanément les billes avant | À corriger (Phase 4) |
| U4 | Les écrans de stats ne sont pas ceux d'origine ; coller exactement à ce qui avait été fait avant (R2.0.5/R2.0.12) | La présentation STATS antérieure n'a jamais été commitée ; aucune référence disponible dans le dépôt | Débloqué : standalone R2.0.12 fourni le 2026-10-10 → plan 04-04 |
| U5 | La résolution des graphismes (boules et décors) n'est pas bonne | Décors : vignette 320×240 étirée (U1). Billes : canvas 640×480 mis à l'échelle ×3 par CSS avec lissage bilinéaire ; backing store non ajusté au devicePixelRatio | À corriger (Phase 4) |
| U6 | Sons et animations fidèles pour les tirs dans les brèches, les reculs de la ligne, les bonus ; bruit de fond des billes qui avancent ; animations de recul dépendant de la distance parcourue | `gap` et bonus émettent déjà `gapbonus1` + texte ; roulement (`rolling.ogg`) et alerte (`warning1.ogg`) absents ; recul : la trame de roulement dérive de `s` donc suit la distance, à vérifier et verrouiller | À corriger (Phase 4) |
| U7 | L'utilisateur propose de produire un set complet de graphismes de niveaux si on lui indique le format | Format à documenter (README) | Réponse à fournir |

## Critères de ré-acceptation

1. Niveau 1-3 (riverbed) : fond 640×480 net, mosaïque animée sous les billes, billes sur le tracé.
2. Tous les sons originaux audibles dès la première occurrence (tir, insertion, destruction 1-5, combo, saut, bonus, power-ups), roulement continu de la chaîne, alerte près du crâne, dans Chrome, Firefox et Safari.
3. Insertion : la bille glisse de son point d'impact vers la chaîne qui s'ouvre progressivement (~0,2 s), la destruction n'est évaluée qu'une fois la place faite.
4. Rendu net à l'échelle de l'écran (texte, vecteurs) ; option de mise à l'échelle entière sans lissage.
5. Recul : les billes roulent visiblement en arrière sur la distance du recul.

## Deuxième session (2026-10-10, standalone R2.0.14 vagues 1-2)

| # | Constat | Cause identifiée | Statut |
|---|---------|------------------|--------|
| U8 | Alerte près du trou beaucoup trop rapide et stressante d'un coup ; l'original s'accélère progressivement | `warning1.ogg` est un battement de 0,37 s joué en boucle continue par R2.0.14 ; l'original le répète à un rythme croissant | Plan 04-05 |
| U9 | Trop de billes isolées, pas assez de groupes de couleur dans les premiers niveaux | `repeat`/`single` de `levels.xml` non utilisés ; séries limitées à 2 à l'apparition ; `repeat` pris pour un objectif de billes | Plan 04-06 |
| U10 | Écrans STATS ne correspondent pas à l'original (vu sur la version sans 04-04) ; « creuser dans le .exe » | 04-04 livré depuis l'image R2.0.12 ; les ressources du .exe (dialogbox, GodHead, DialogButton, polices Cancun12 / NativeAlienExtended18, chaînes STATS) permettent une reconstruction native si l'image R2.0.12 n'est pas jugée fidèle | À valider sur le standalone 04-04 ; plan 04-07 si rejeté |
| U11 | Effet de zoom de tout l'écran dans le niveau 1-3 | Oscillation appliquée aux calques BackgroundAlpha quasi plein écran (`drawOverlays`) | Plan 04-05 |

## Troisième session (2026-10-10, standalone R2.0.14 complet, macOS)

Verdict utilisateur : « on approche ». Points restants :

| # | Constat | Décision |
|---|---------|----------|
| U10 (suite) | STATS : se rapprocher encore du vrai écran, ou l'égaler ; **le temps record doit être affiché** (RECORD = meilleur temps du niveau, chaîne originale `BEST_TIME`) | Phase 5 : reconstruction native depuis les briques du `.exe` (dialogbox, GodHead, DialogButton, polices Cancun12 / NativeAlienExtended18, chaînes), record de temps par niveau persisté, bonus « temps d'expert » |
| U12 | Pièces (coins) absentes : elles apparaissent à différents endroits, rapportent des points et maintiennent la série de tirs réussis | Phase 5 (GAME-03) : TreasurePoints de `levels.xml`, sprite `COIN` 30 trames, sons jewelappear / coingrab / gemvanishes |
| U13 | Fin de niveau : série de points attribués depuis la dernière bille explosée jusqu'au trou, animation d'addition, sons associés | Phase 5 (GAME-04) : décompte le long de la piste avec `endoflevelpop1`, puis STATS |

Validés implicitement (aucune remarque) : fonds 1:1, insertion animée, sons originaux au premier clic, groupes de couleurs, alerte progressive, calques fixes. Navigateur : macOS (Safari ou Chrome, à préciser).
