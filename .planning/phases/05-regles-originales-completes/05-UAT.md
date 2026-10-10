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

## Cinquième session (2026-10-10, standalone R2.0.16, macOS)

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
- Compte à rebours sans mode rapide (un bonus de ≈ 24 000 compte ≈ 24 s ; le reste est crédité sur OK) — livré en 05-08 : remplacé par le pas borné et le clic de D-21 (U24).
- `levelwin` (`chant5`) qui se chevauche avec les `pop` du dialogue.
- Fondu du roulement à l'arrêt : décroissance quasi exponentielle d'≈ 0,4 s (rampe relancée à chaque image) plutôt que 150 ms linéaires — acceptable à l'oreille ? (voir `deferred-items.md`) — livré en 05-08 : rampe linéaire de 150 ms armée une seule fois par changement de cible (`rampPlan`).

### Observation reportée (cosmétique, 05-04)

- Le score du HUD est dessiné sous la tête du STATS natif (le canvas continue de dessiner le HUD pendant que le panneau est ouvert) — toujours cosmétique.

### Constats

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
| U22 | « Les écrans sont flous » (captures 2000 × 1500 : canvas ≈ 1000 px CSS sur Retina, soit ≈ 3,1 × le 640 × 480) | Tout est composé en 640 × 480 avec les bitmaps d'origine (fond, polices, cadre) puis rééchantillonné ; le STATS est composé à 1 × puis étiré une seconde fois ; R2.0.12 dessinait les textes en polices vectorielles (Georgia), nettes à toute échelle | Plan 05-08 : composition du STATS et des textes HUD à l'échelle du canvas (un seul rééchantillonnage) ; agrandissement pixel-art 2 × (xBR/Scale2x) des polices, du cadre, des boutons et des sprites de billes avant affichage ; le fond de niveau reste bilinéaire (D-19) → livré en 05-08 (STATS composé à l'échelle du canvas dans un canvas enfant `.stats-picture`, plus de PNG intermédiaire ; polices HUD et STATS, cadre, tête, bouton, billes, ombre, icônes de power-up et barre de menu agrandis 2 × EPX dès 1,5 pixel physique par pixel logique ; fond, découpes, grenouille, pièce, jauge et explosions bilinéaires ; « Pixels nets » inchangé ; 16,3 Mio d'images 2 × mesurés, bascule sans rechargement) |
| U23 | « Textes mal alignés » (STATS) | Sur la capture : BONUS entre PIÈCES et SAUTS au lieu d'être sur la ligne SAUTS, RECORD sur ENCH. MAX. ; « + » du bonus teinté autrement que les chiffres ; OBJECTIF « 1:00 » contre TEMPS « 34 s » ; astuce centrée sur 3 lignes, collée à l'étiquette | Plan 05-08 : colonne droite calée sur la grille de gauche (TEMPS = POINTS, OBJECTIF = COMBOS, filet = PIÈCES, BONUS = SAUTS, RECORD = ENCH. MAX.), signe et chiffres de même teinte, formateur unique minutes:secondes, astuce alignée à gauche à côté de l'étiquette avec césure sur 2 lignes (D-20) ; géométrie vérifiée contre le constructeur du dialogue si le spike 02 la livre → livré en 05-08 (grille D-20 : TEMPS = POINTS, OBJECTIF = COMBOS, filet sur PIÈCES, BONUS = SAUTS, RECORD = ENCH. MAX., libellés droits à `x0 + 200` comme dans la fonction de dessin originale ; signe « + » : le masque `Cancun12` du « + » culmine à l'alpha 187 contre 255 pour les chiffres, normalisé par glyphe (`normalizeGlyphAlpha`), même teinte mesurée ; `formatSeconds` unique « N s » / « m:ss » ; astuce sur 2 lignes à gauche après « ASTUCE : », police réduite puis « ... » ; `y` exacts et alignement des valeurs non lus : hypothèse B3) |
| U24 | « Le comptage du bonus est trop long » (10 900 → 11 s) | +100 toutes les 100 ms sans mode rapide ; l'original a un mode rapide (2 500 par pas, déclencheur recherché par le spike 02) | Plan 05-08 : durée plafonnée à ≈ 2 s (pas = multiple de 100 ≥ total/20), un clic sur le dialogue crédite le reste aussitôt ; déclencheur original repris si le spike le livre (D-21) → livré en 05-08 (pas = 100 jusqu'à 2 000, sinon multiple de 100 ≥ total / 20, ≤ 20 pas soit ≈ 2 s ; clic sur le dialogue hors OK → 2 500 par pas ; OK crédite le reste ; le spike 02 a établi que l'original n'accélère jamais en aventure — le « 2 500 » est un drapeau de mode de jeu : déviation volontaire documentée) |
| U25 | « Les tirs dans les brèches doivent rapporter plus de points quand ils sont des succès » | Moteur : +100 par brèche traversée à l'insertion, réussie ou non | Spike 02 (bonus de brèche, barème des combos) puis plan 05-08 : bonus crédité seulement si l'insertion produit une destruction, montant original (D-22) → livré en 05-08 (bonus payé au match seulement, barème 500 / 440 / 350 / 270 / 190 / 100 / 10 selon la largeur minimale de brèche ≤ 64 … ≥ 364 px × nombre de brèches, gardé par une bille posée contre sa couleur, perdu sinon ; score `10n + 100·combo`, enchaînement `(chain + 5) × 10` dès le 5ᵉ tir réussi ; libellés COMBO / ENCHAÎNEMENT remis à l'endroit, « +N » dans la couleur de la bille, `gapbonus1` à 0 / 150 / 300 ms ; unité de la largeur = hypothèse B1) |

Validés implicitement : arrivée rapide, couleurs, alerte, roulement, bannière ZUMA, décompte « +100 », couleurs du STATS, record. Le +10 000 par courbe n'a pas été relevé (16 260 points au 1-1 affichés sans remarque) : conservé jusqu'à avis contraire.

## Sixième session (2026-10-10, standalone R2.0.17, macOS)

Standalone R2.0.17 (`standalone/zuma-standalone.html`, macOS, Safari ou Chrome, écran Retina), niveau 1-1. Notes de version : `R217_RELEASE_NOTES.md`.

### Points à vérifier (U22–U25)

- U22 — à la taille de la fenêtre sur un écran Retina, le HUD (score, niveau, barre de menu), la chaîne et l'écran STATS (titre, libellés, cadre, bouton OK) sont nets ; comparer avec « Pixels nets » (échelle entière sans lissage, actifs 1 ×) ; aucune différence attendue sur le fond de niveau, qui reste bilinéaire.
- U23 — STATS : TEMPS sur la ligne POINTS, OBJECTIF sur COMBOS, filet sur PIÈCES, BONUS sur SAUTS, RECORD sur ENCH. MAX. ; le « + » du bonus de la même couleur que ses chiffres ; « 34 s » / « 1:00 » cohérents entre TEMPS, OBJECTIF et RECORD ; astuce à gauche après « ASTUCE : », deux lignes au plus, terminée par « ... » si elle est coupée.
- U24 — le BONUS se compte en ≈ 2 s quel que soit le montant (20 pas au plus) ; un clic sur le dialogue (hors OK) l'accélère (2 500 par pas) ; OK crédite le reste d'un coup, POINTS et le score du HUD suivent.
- U25 — un tir à travers une brèche qui fait exploser : « BONUS SAUT » et un « +N » gonflé (500 pour une brèche serrée, moins pour une large), son `gapbonus1` ; un tir à travers une brèche sans explosion : rien, ni texte ni points ; une réaction en chaîne : « COMBO x2 » et +100 ; cinq tirs réussis de suite : « ENCHAÎNEMENT x5 » et +100 dans le « +N » du match, son `chain1` ; un tir raté remet l'enchaînement à zéro.

### Hypothèses à confirmer au ressenti

- B1 — barème de saut (largeur de brèche en px de piste) : trop généreux (500 trop souvent) ou pas assez ?
- B3 — alignement des valeurs du STATS (à droite dans leur colonne) et hauteur des lignes.
- D-21 — le pas du compte à rebours (≈ 2 s au total) se lit-il encore comme un compte à rebours ? Le clic est-il naturel ?
- Bille en attente sans enchaînement : une bille posée contre sa couleur garde son bonus de saut mais l'enchaînement retombe à zéro — trop difficile à tenir ?
- B4 — les sons de match jouent même quand le groupe déclenche un power-up.
- Couleur du « +N » = couleur de la bille rendue.
- EPX (plutôt que xBR) : lisibilité des glyphes 2 × et des bords des billes ; léger escalier possible sur les courbes des grandes lettres.
- Canvas enfant du STATS : redimensionnement de la fenêtre pendant le dialogue, survol et pression du bouton OK.
- Reportées de la cinquième session (non tranchées) : A3 (+10 000 par courbe), arrêt du pousseur à chaque insertion arrière, A1, A2, A4, A5, A7, recul ZUMA sur toutes les chaînes, interligne 18 px, couvercle du crâne à 600 px, `levelwin` / pops.

### Observation reportée (cosmétique, 05-04)

- Le score du HUD est dessiné sous la tête du STATS natif — toujours cosmétique.

### Constats

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
| U26 | Niveau 2-2 : « les boules disparaissent, la gestion des dessus-dessous n'est pas bonne » (billes tronquées à gauche et en haut à droite) | `Track` lit un octet de calque par point (bit 1 = sous une découpe, bit 2 = caché) et `render.ts` saute les billes « cachées » au lieu de dessiner la découpe du décor par-dessus ; sémantique de l'octet CURV et découpes du 2-2 à vérifier | Spike 03 (format CURV, rendu des tunnels dans l'original) puis plan 05-10 : billes toujours dessinées, découpes (`layers` du pack) peintes au-dessus là où la courbe passe dessous, ordre de dessin par calque (D-23) → livré en 05-10 (spike 03 : octet A = tunnel injouable — un projectile traverse une bille en tunnel —, octet B = priorité de dessin 0..3, priorité d'une bille = max aux deux bords ± 16 ; cinq passes de dessin, découpes (toutes priorité 1) entre les billes de priorité 0 et celles de priorité ≥ 1 ; **aucune bille omise** ; importateur réaligné sur la disposition CURV et pack réimporté ; 2-2 : 32 billes non dessinées sur 58 avant, 58 sur 58 après, 11 en tunnel) |
| U27 | « Le menu est dégueulasse, il faut qu'il soit conforme à l'original » | Panneau DOM générique (titre « ZUMA PWA », boutons CSS) | Plan 05-10 : menu de jeu composé comme le STATS (dialogbox 9-slice, DialogButton, polices, chaînes du pack `MENU` / `BACK_TO_GAME` / `OPTIONS` / `HELP` / `BACK_TO_MAIN_MENU` / `QUIT`), options (son, pixels nets, plein écran) dans un sous-dialogue de même facture ; structure vérifiée par le spike 03 (D-24) → livré en 05-10 (le menu en jeu de l'original est le dialogue OPTIONS en mode « en jeu » : titre MENU, Musique grisé (pas de musique avant les phases 6–7), Sons (volume persisté), Plein écran, Pixels nets, Aide (commandes, astuces, version), Retour au menu principal avec confirmation → nouvelle partie, Retour à la partie ; jeu en pause dessous ; composé sur canvas à l'échelle de l'écran avec le kit du STATS et les images `slidertrack` / `sliderthumb` / `checkbutton` du pack, repli vectoriel ; plus de panneau DOM) |
| U28 | « La taille de l'écran doit être un peu plus grande en mode fenêtre », OK en plein écran | En « Pixels nets » l'échelle CSS est un entier (`floor(1000/640)` = 1 → 640 px) ; sans ce mode le canvas remplit la fenêtre | Plan 05-10 : la fenêtre est toujours remplie en 4:3 ; « Pixels nets » arrondit à l'entier en pixels d'appareil (DPR 2 → pas de 0,5 CSS) au lieu de l'entier CSS (D-25) → livré en 05-10 (`fitScale` : fenêtre remplie en 4:3 dans les deux modes ; « Pixels nets » = `max(1, ⌊ajustement × dpr⌋) / dpr`, entier en pixels d'appareil : 960 × 720 CSS au lieu de 640 × 480 dans une fenêtre de 1 000 × 750 à DPR 2) |
| U29 | « La visée doit se faire aussi quand la souris passe sur les bords du cadre » ; « le menu doit être Entrée ou Espace, pas un clic de souris » | La visée ne suit que `pointermove` sur le canvas ; un clic sur MENU / STATS du HUD ouvre le panneau et un clic dans la bande du HUD ne tire pas | Plan 05-10 : visée suivie sur `window` (coordonnées ramenées au canvas, bornées), tout clic tire y compris sur le cadre ; les boutons du HUD ne réagissent plus au clic ; menu sur Entrée et Échap ; Espace reste l'échange (clic droit / Espace dans l'original, vérifié par le spike) ; STATS sur Tab (D-26) → livré en 05-10 (visée sur toute la fenêtre, coordonnées bornées au plateau ; clic gauche = tir partout, barre du HUD comprise ; boutons MENU / STATS du HUD au toucher seulement ; Espace / Entrée / Échap = menu ; **clic droit = échange** ; Tab = STATS ; P = pause — l'analyse disait « Espace reste l'échange » : le spike 03 a montré qu'Espace met en pause dans l'original, remplacé par D-26 révisée, échange au clic droit seulement, hypothèse C1) |
| U30 | « On gagne des vies tous les 100 000 points, matérialisées par les grenouilles ; un bruit à l'obtention » | Chaîne du pack `GET_AN_EXTRA_FROG` : « une grenouille supplémentaire tous les 50 000 points » ; son `extralife` présent ; aucune vie gagnée dans le moteur | Spike 03 (seuil dans `AddScore`, texte `EXTRA_LIFE_BONUS`) puis plan 05-10 : vie à chaque multiple de 50 000, événement `extra-life`, son `extralife`, texte « BONUS VIE SUPP. », grenouille ajoutée au HUD (D-27) → livré en 05-10 (une vie à chaque multiple de **50 000** points — et non 100 000 —, plusieurs d'un coup, sans plafond, aussi pendant le compte à rebours du STATS ; `extralife` joué trois fois à 0 / 0,3 / 0,6 s ; **aucun texte en jeu**, contrairement à la première décision : l'original ne dessine `EXTRA_LIFE_BONUS` que dans le STATS d'un autre mode ; grenouille ajoutée au HUD : trois icônes puis « +N ») |
| U31 | Son d'apparition de pièce « joué trop souvent » | `coinappear` à chaque apparition ; cadence 9–15 s (D-07) et `treasurefreq` 300 non vérifiés (A6) | Spike 03 (compteur de pièces dans l'exécutable) puis plan 05-10 : cadence originale ; à défaut, intervalle doublé (18–30 s) et son seulement si la pièce est visible (D-28) → livré en 05-10 (cadence originale : 10 s visibles, première tentative à 3 s, puis 1/180 par tick à partir de 13 s après l'apparition précédente, ≈ 16 s en moyenne ; rien une fois la jauge ZUMA pleine ; `dist` en pourcentage de progression de la chaîne ; `coinappear` à 0,40 avec panoramique selon x ; le repli 18–30 s est inutile) |
| U32 | Grondement du roulement « un peu trop présent », arrêt « un peu trop franc » | Gain 0,6 constant, fondu linéaire 150 ms (05-08) | Plan 05-10 : gain 0,35, fondu 400 ms à l'arrêt, montée 100 ms (D-29) → livré en 05-10 (gain 0,35, attaque 50 ms, fondu linéaire 500 ms au lieu des 400 ms / 100 ms de la première décision, d'après le spike : l'original retire 0,02 par maj, ≈ 0,5 s ; coupé en pause et sous les dialogues ; un seul canal pour toutes les chaînes) |
| U33 | Niveaux à deux entrées : « on gagne des bonus de distance entre la dernière boule et le trou sur les deux pistes, pas seulement la dernière, et l'animation se fait en même temps sur les deux » | `startClearing` ne pose qu'un marqueur, sur la chaîne de la dernière destruction ; la recherche §7 lit un décompte par courbe (avec +50 maj entre deux courbes) | Plan 05-10 : un marqueur par chaîne, chacun depuis la dernière destruction de sa chaîne (sinon depuis le départ de la piste), pas et « +100 » simultanés sur toutes les chaînes, pops partagés, fin quand le dernier marqueur atteint son crâne (D-30) → livré en 05-10 (un marqueur par chaîne depuis sa dernière destruction ou le début de sa piste, pas simultanés de 60 px toutes les 2,4 ticks à +100 chacun avec « +100 » et étincelles sur chaque piste, pops partagés, `won` 30 ticks après le dernier pas du plus long — **déviation volontaire D-30** : l'original décompte courbe par courbe) |

Validés implicitement : netteté (plus de remarque), STATS (grille, décompte), barème des brèches.

## Septième session (à remplir)

Standalone R2.0.18 (`standalone/zuma-standalone.html`, macOS, Safari ou Chrome, écran Retina). Notes de version : `R218_RELEASE_NOTES.md`. Le pack doit avoir été réimporté (`npm run import`) pour les tunnels et les images du menu ; le standalone livré l'embarque déjà.

### Points à vérifier (U26–U33)

- U26 — niveau 2-2 (`?level=2-2`) : plus aucune bille qui disparaît ; les billes de la boucle extérieure passent **sous** les découpes à gauche et en haut à droite (visibles seulement à travers leurs trous), la spirale intérieure passe **par-dessus** ; un tir sur une bille cachée sous une découpe la traverse sans s'y poser.
- U27 — Espace, Entrée ou Échap : le menu a l'aspect des dialogues du jeu (cadre de pierre, tête de divinité, titre MENU doré, curseur Musique grisé, curseur Sons qui règle le volume, cases Plein écran et Pixels nets, Aide, Retour au menu principal avec confirmation, Retour à la partie) ; le jeu est en pause dessous ; survol et pression des boutons ; clavier Haut / Bas / Gauche / Droite / Entrée / Échap.
- U28 — taille de la fenêtre avec et sans « Pixels nets » : sans, le jeu remplit la fenêtre en 4:3 ; avec, il est net et nettement plus grand qu'en R2.0.17 (par exemple 960 × 720 au lieu de 640 × 480 dans une fenêtre de 1 000 × 750).
- U29 — la visée suit la souris dans les marges et au-dessus de la barre du haut ; un clic dans la marge ou sur la barre (y compris sur MENU / STATS) tire ; le clic droit échange ; Espace / Entrée / Échap ouvrent et ferment le menu ; Tab ouvre et ferme les statistiques ; P met en pause.
- U30 — au passage de 50 000 points : une grenouille de plus dans la barre (trois icônes puis « +N ») et trois `extralife` rapprochés ; aucun texte.
- U31 — pièces moins fréquentes et plus discrètes (10 s visibles, ≈ 16 s entre deux en moyenne, son d'apparition plus bas et placé à gauche / à droite selon la pièce) ; plus aucune pièce une fois ZUMA atteint.
- U32 — roulement plus discret, fin progressive (≈ 0,5 s) quand la chaîne s'arrête ; silence en pause et sous le menu.
- U33 — niveau à deux entrées (par exemple 1-5) : les « +100 » et les étincelles défilent sur les deux pistes en même temps, puis le STATS s'ouvre après le plus long.

### Hypothèses à confirmer au ressenti

- C1 — clic droit = échange (non localisé dans l'original ; Espace y met en pause).
- Espace = menu (l'original : pause) ; Échap / Entrée / Tab / P sans équivalent original.
- C2 — découpes = pochoirs du fond ; C3 — force du panoramique des pièces ; C4 — police des libellés du menu (`Cancun12` à la place de la police système).
- Tête de divinité au-dessus du menu et marges du dialogue (proportions du STATS) ; moitiés de l'image des cases.
- D-30 — décompte simultané sur toutes les chaînes (déviation volontaire : l'original décompte courbe par courbe).
- Gain 0,35 du roulement (l'original : 1,0) et un seul canal pour toutes les chaînes.
- Curseur Musique inerte ; « Retour au menu principal » → nouvelle partie ; boutons du HUD actifs au toucher seulement ; trois grenouilles affichées au plus puis « +N ».
- Reportées de la sixième session (non tranchées) : B1, B3, D-21, bille en attente sans enchaînement, B4, couleur du « +N », EPX, canvas enfant du STATS, A1–A5, A7, arrêt du pousseur à chaque insertion arrière, recul ZUMA sur toutes les chaînes, interligne 18 px, couvercle du crâne à 600 px, `levelwin` / pops.

### Observation reportée (cosmétique, 05-04)

- Le score du HUD est dessiné sous la tête du STATS natif (et sous celle du menu) — toujours cosmétique.

### Constats

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
