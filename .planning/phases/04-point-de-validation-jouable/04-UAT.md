# Phase 4: Point de validation jouable — UAT

**Session:** 2026-10-10, standalone R2.0.13 (+ correctif 261010-bba) ouvert dans un navigateur de bureau, niveau 1-3 (riverbed) atteint, score 6530, 3 vies.
**Verdict utilisateur :** « une sorte de catastrophe sur plein d'aspects ».

## Retours (verbatim condensé)

| # | Constat | Cause identifiée | Statut |
|---|---------|------------------|--------|
| U1 | Affichage : le niveau 1-3 est impossible ; le fond semble pris d'un fichier existant et étiré ; le parcours des billes doit être adapté | `tools/import-original.mjs` copie la vignette `perm_thumbnails/<id>.jpg` (320×240) sous le même nom que le fond `<id>.jpg` (640×480) et l'écrase ; le rendu l'étire ensuite. Les `BackgroundAlpha` (riverbed, serpents) sont découpés dans cette vignette et dessinés par-dessus les billes au lieu de sous elles. Les courbes sont correctes (coordonnées natives). | À corriger (Phase 4) |
| U2 | Les sons ne sont pas respectés alors qu'ils sont dans le `.exe` | Première lecture de chaque son = synthèse (décodage asynchrone) ; `.ogg` non décodable par Safari (`decodeAudioData`) → repli synthèse permanent ; sons de roulement/alerte non câblés | À corriger (Phase 4) |
| U3 | Les billes insérées doivent « faire leur place » dans un mouvement visible, pas apparaître d'un coup | `land()` insère à largeur pleine et pousse instantanément les billes avant | À corriger (Phase 4) |
| U4 | Les écrans de stats ne sont pas ceux d'origine ; coller exactement à ce qui avait été fait avant (R2.0.5/R2.0.12) | La présentation STATS antérieure n'a jamais été commitée ; aucune référence disponible dans le dépôt | **Bloqué** : demander à l'utilisateur le standalone R2.0.12 ou des captures |
| U5 | La résolution des graphismes (boules et décors) n'est pas bonne | Décors : vignette 320×240 étirée (U1). Billes : canvas 640×480 mis à l'échelle ×3 par CSS avec lissage bilinéaire ; backing store non ajusté au devicePixelRatio | À corriger (Phase 4) |
| U6 | Sons et animations fidèles pour les tirs dans les brèches, les reculs de la ligne, les bonus ; bruit de fond des billes qui avancent ; animations de recul dépendant de la distance parcourue | `gap` et bonus émettent déjà `gapbonus1` + texte ; roulement (`rolling.ogg`) et alerte (`warning1.ogg`) absents ; recul : la trame de roulement dérive de `s` donc suit la distance, à vérifier et verrouiller | À corriger (Phase 4) |
| U7 | L'utilisateur propose de produire un set complet de graphismes de niveaux si on lui indique le format | Format à documenter (README) | Réponse à fournir |

## Critères de ré-acceptation

1. Niveau 1-3 (riverbed) : fond 640×480 net, mosaïque animée sous les billes, billes sur le tracé.
2. Tous les sons originaux audibles dès la première occurrence (tir, insertion, destruction 1-5, combo, saut, bonus, power-ups), roulement continu de la chaîne, alerte près du crâne, dans Chrome, Firefox et Safari.
3. Insertion : la bille glisse de son point d'impact vers la chaîne qui s'ouvre progressivement (~0,2 s), la destruction n'est évaluée qu'une fois la place faite.
4. Rendu net à l'échelle de l'écran (texte, vecteurs) ; option de mise à l'échelle entière sans lissage.
5. Recul : les billes roulent visiblement en arrière sur la distance du recul.
