# Phase 5: Règles originales complètes - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Trois chantiers issus de l'UAT de la phase 4 (voir `../04-point-de-validation-jouable/04-UAT.md`, U10 suite, U12, U13) et du ROADMAP (GAME-01, GAME-03, GAME-04) :
1. Écran STATS reconstruit nativement depuis les ressources du jeu original, avec le temps record par niveau.
2. Pièces (coins) aux TreasurePoints de `levels.xml`.
3. Séquence de fin de niveau : décompte de points de la dernière explosion jusqu'au trou, puis STATS. Séquence de début « Attention / PARTEZ » si le temps le permet.

L'utilisateur ne peut pas lancer le jeu original (macOS) : les décisions ci-dessous s'appuient sur les ressources extraites et sont marquées hypothèse quand le `.exe` ne tranche pas.

</domain>

<decisions>
## Implementation Decisions

### STATS natif (U10)
- **D-01:** Le dialogue est composé à l'exécution dans un canvas 640×480 (puis affiché comme fond de `.zuma-stats`, pas de `url(` en CSS) à partir de : `images/dialogbox.jpg` + `_dialogbox.gif` (243×242, cadre 9-slice : mesurer les bords sur l'image), `images/GodHead.gif` + `_GodHead.gif` (156×140, centré en haut, chevauchant le bord supérieur), `images/DialogButton.jpg` + `_Dialogbutton.gif` (360×48 = 3 états de 120×48 : normal / survol / pressé). Taille et position du dialogue : celles de l'image de référence R2.0.12 (`private_assets/original/extra/stats_bg.png` : cadre ≈ x 17 %–83 %, y 19 %–93 % du 640×480) ; l'image R2.0.12 ne sert plus de fond.
- **D-02:** Polices bitmap PopCap rendues par un module `src/bitmapfont.ts` : parse des `.txt` (`Define CharList/WidthList/RectList/OffsetList/KerningPairs/KerningValues`, `CreateLayer`, `LayerSetImage`, `LayerSetOffset`, `LayerSetColorMult`, `LayerSetAscent`, `SetCharMap`), glyphes découpés dans `<font>.gif` avec masque `_<font>.gif` (si seule la version `_` existe, elle est le masque d'un glyphe blanc à teinter). Titre « STATISTIQUES » en `NativeAlienExtended18` (teinte dorée d'origine du gif), libellés et valeurs en `Cancun12` teintés (libellés jaune `#f5d65b`, valeurs crème, TEMPS/BONUS vert, OBJECTIF orange, mêmes tons que la référence), astuce en `Cancun10` ou `Arial12Bold`. L'importateur copie `fonts/*.gif` et `fonts/*.txt` nécessaires dans le pack.
- **D-03:** Libellés = chaînes originales `default.xml` : STATS, POINTS, COMBOS, COINS (PIÈCES), GAPS (SAUTS), CHAIN_BONUS abrégé « ENCH. MAX. » (pas de chaîne MAX_CHAIN : conserver la convention R2.0.12), MAX_COMBO (COMBO MAX.), YOUR_TIME (TEMPS), ACE_TIME (OBJECTIF), BONUS, BEST_TIME (RECORD), NO_TIME_BONUS (PAS DE BONUS), TIP (ASTUCE), OK. L'importateur extrait ces chaînes de `properties/default.xml` (UTF-16) dans `pack/strings.json`.
- **D-04:** Sémantique de la colonne droite : TEMPS = durée du niveau ; OBJECTIF = `partime` (temps d'expert) ; BONUS = bonus de temps d'expert `+N` quand TEMPS ≤ OBJECTIF (N = 10 × secondes restantes, hypothèse, min 100), sinon « PAS DE BONUS » ; RECORD = **meilleur temps du niveau** persisté (`localStorage` `zuma.best.<levelId>`), affiché même à la première partie (alors égal au temps courant) ; le bonus est ajouté au score avant l'affichage.
- **D-05:** Valeurs gauche : POINTS (score du niveau), COMBOS, PIÈCES (coins touchées), SAUTS, ENCH. MAX. (série max), COMBO MAX. Révélation ligne par ligne (90 ms) et son `pop` par ligne (hypothèse légère), OK sur le bouton natif avec états survol/pressé et son `button1`.
- **D-06:** Repli vectoriel inchangé sans pack ; verrous r211 conservés (un seul `#result-continue`, marqueur `R2.0.11`, pas de `url(`).

### Pièces (U12, GAME-03)
- **D-07:** Source : `graphics.treasure[]` du pack (x, y, curve index, dist). Une pièce apparaît toutes les 9–15 s (RNG du moteur) sur un TreasurePoint tiré au hasard dont la condition de dégagement est remplie : aucune bille de la courbe concernée à moins de `dist` px du point (hypothèse pour `dist1`/`dist2` ; `dist = 0` = toujours libre). Visible 6 s (`coinVisibleTicks`), une seule pièce à la fois.
- **D-08:** Rendu : `COIN.gif` + `_COIN.gif` (36×36, 30 trames, rotation à 20 trames/s) et `sparkle.gif` (280×20 = 14 trames de 20×20) en scintillement périodique. Sons : `jewelappear` à l'apparition, `gemvanishes` à la disparition, `coingrab` au tir.
- **D-09:** Collision projectile–pièce (rayon 18 px) : la pièce disparaît, +`coinPoints` (hypothèse : 100, documentée), **la série (streak) est conservée** et le projectile continue sa course ; événement `coin` avec texte flottant « +100 ». Compteur `stats.coins`.

### Fin de niveau (U13, GAME-04)
- **D-10:** Quand la dernière bille est détruite en mode ZUMA : état `clearing` (plus de tir). Un marqueur part de la position `s` de la dernière explosion et avance vers le crâne par pas d'une bille (`ballSpacing`) toutes les 4 ticks ; à chaque pas : +`cleanupPoints` (hypothèse : 10 par pas), texte flottant « +10 » au point de la piste, son `bonuspop` (`endoflevelpop1`) dont le `rate` monte de 1 à 1,5 sur la longueur. À l'arrivée au trou : bonus de temps d'expert (D-04) avec son `extralife`-like ? Non : son `levelwin` (`chant5`), puis STATS après 60 ticks. Les montants et le pas sont des hypothèses à documenter.
- **D-11:** Séquence de début « Attention / PARTEZ » (`GET_READY` / `GO`) : affichée pendant l'arrivée rapide de la chaîne, « PARTEZ » quand `feeding` passe à faux, son `gamestart` (`chant1`) au début ; police `NativeAlienExtended18`. À planifier dans cette phase si le budget le permet, sinon noter en différé.

### Ajustements UAT 4 (U14–U21)
- **D-12:** Un spike d'analyse statique de `Zuma.exe` (`05-RESEARCH.md`) tranche si possible : cadence de mise à jour et unité de `speed`, sens de `repeat`/`single`, unité de `partime`, montants du décompte et du bonus de temps. À défaut, valeurs de repli : `speed × 60` px/s (au lieu de × 100), `feedSpeed` 300, alerte à 20 % de la longueur de piste (min 320 px), décompte par pas de 2 billes toutes les 6 ticks.
- **D-13:** Le chronomètre du niveau (TEMPS, bonus) démarre à l'événement `go` (« PARTEZ »), pas au chargement.
- **D-14:** Rafraîchissement des munitions immédiat : dès qu'une destruction est marquée, les couleurs des billes en explosion ne comptent plus ; `current` et `next` sont remplacés si absents, à chaque tick ; le projectile en vol garde sa couleur (verrou r206).
- **D-15:** Fin de niveau : après le décompte, annonce à l'écran « BONUS TEMPS +N » (ou rien) en police titre avec son `extralife`-like → non : son `bonuspop` final puis `levelwin` ; le bonus apparaît dans STATS (BONUS) et dans le score.
- **D-16:** Atteinte du ZUMA : bannière « ZUMA ! » (chaîne `STRING_ID_ZUMA` si présente, sinon « ZUMA ! ») en `NativeAlienExtended18` pendant 120 ticks, jauge en pulsation, son `chant4` conservé.
- **D-17:** Roulement : `rolling` à gain constant (0,6) dès que la chaîne avance (> 2 px/s), fondu 150 ms à l'arrêt, hauteur 1 ; pas de modulation par la vitesse.
- **D-18:** STATS : revue de mise en page contre la référence et les polices (interligne 1,65 × hauteur de capitale, valeurs alignées à droite sur la même colonne, titre teinté doré `#f0c040` par multiplication, OK centré) ; vérification des valeurs affichées par un test de bout en bout (fixture connue → chiffres attendus).
- **D-19:** Netteté : composition du STATS et des textes HUD à l'échelle du canvas (plus de canvas intermédiaire 1 ×) ; les atlas de polices, les pièces du dialogue, les boutons et les sprites de billes sont agrandis 2 × par un filtre pixel-art (xBR ou, à défaut, Scale2x/EPX) à l'import en mémoire, puis dessinés avec lissage ; le fond de niveau reste bilinéaire ; le mode « Pixels nets » est conservé tel quel.
- **D-20:** STATS : la colonne droite suit la grille de la colonne gauche (TEMPS/POINTS, OBJECTIF/COMBOS, filet/PIÈCES, BONUS/SAUTS, RECORD/ENCH. MAX.) ; signe et chiffres du bonus de même teinte ; un seul formateur de temps (`m:ss` au-delà de 59 s, `N s` en dessous, identique pour TEMPS, OBJECTIF, RECORD) ; astuce alignée à gauche après l'étiquette, sur deux lignes au plus.
- **D-21:** Décompte du BONUS dans le STATS : pas de 100 toutes les 100 ms tant que le total ≤ 2 000, sinon pas = multiple de 100 ≥ total/20 (durée ≈ 2 s) ; un clic sur le dialogue (hors OK) passe en mode rapide (2 500 par pas comme l'original) ; OK crédite le reste.
- **D-22:** Bonus de brèche : crédité uniquement quand l'insertion à travers une brèche produit une destruction ; montant et texte « BONUS SAUT » selon le spike 02 (`05-RESEARCH-02.md`) ; à défaut, 500 points par brèche réussie et rien pour une brèche sans destruction.

### Claude's Discretion
- Échelle exacte du dialogue, courbes d'animation, volumes.

</decisions>

<specifics>
## Specific Ideas

- Référence de mise en page : `private_assets/original/extra/stats_bg.png` (dialogue R2.0.12) — proportions, deux colonnes, filet horizontal sous le titre, séparateur vertical, encart astuce, bouton OK bas centré.
- Durées des sons : `warning1` 0,37 s, `rolling` 1,19 s, `chant1` 2,49 s, `chant4` 1,13 s ; `endoflevelpop1`, `jewelappear`, `coingrab`, `gemvanishes`, `button1`, `pop` disponibles (voir `SOUND_MAP` dans `tools/import-original.mjs`).
- Formats polices : `Cancun12.txt` (ascent 17, couche Shadow décalée (1,−1) multipliée (0,0,0,0.75)), `NativeAlienExtended18.txt` (ascent 30, `SetCharMap` C H K L M V r → c h k l m v R), `Cancun10.txt` (deux ombres optionnelles, `SetCharMap` minuscules → majuscules).

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/04-point-de-validation-jouable/04-UAT.md`
- `.planning/phases/04-point-de-validation-jouable/04-04-SUMMARY.md` (structure HTML STATS, `formatSeconds`, `Stats.combos`, pièces à retirer : `statsArt`/`cleanStats`/`STATS_LAYOUT`)
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md`
- `private_assets/original/levels/levels.xml` (TreasurePoint), `properties/default.xml` (chaînes), `fonts/*.txt`

</canonical_refs>

<deferred>
## Deferred

- Musique, modes Gauntlet, menu principal : phases 6–7.
</deferred>
