# Phase 5 : Règles originales complètes — Recherche (spike D-12)

**Recherché le :** 2026-10-10
**Domaine :** règles de simulation de Zuma Deluxe (PopCap, SexyAppFramework) — interprétation des réglages de `levels.xml` et règles d'exécution (cadence, alimentation de la chaîne, décompte de fin de niveau, alerte, ACE TIME, ZUMA)
**Confiance globale :** HAUTE pour les unités et formules lues dans le code ; MOYENNE pour les sémantiques déduites du contexte ; BASSE pour ce qui n'a pas été localisé (chronomètre, munitions, son de roulement).

## Résumé

L'exécutable `private_assets/original/Zuma.exe` est une enveloppe DRM PopCap (`!popcapdrmprotect!`) ; le vrai programme est un second PE i386 non compressé embarqué à l'offset fichier `0x1c51a2` (`.text` 0x401000, `.rdata` 0x54c000, `.data` 0x587000 une fois chargé à 0x400000). Toutes les adresses ci-dessous sont des adresses virtuelles **de ce PE interne**, obtenues avec `objdump -d -M intel` sur une copie extraite dans le scratchpad (rien n'a été copié dans le dépôt).

Faits établis (confiance haute) : le jeu se simule à **100 Hz** (1 mise à jour = 10 ms : le compteur de mises à jour du plateau est converti en millisecondes par ×10 en 0x433a20, et le temps de niveau affiché est `compteur ÷ 100` secondes) ; `speed` est en **pixels par mise à jour** (donc `speed × 100` px/s, ce que fait déjà `configFromSettings`) ; `start` est un **pourcentage de la longueur de la courbe** à remplir par une arrivée rapide dont la vitesse initiale est calculée pour décélérer de 0,1 px/maj² jusqu'à la vitesse nominale ; `repeat` est un pourcentage (`Rand()%100 <= repeat` → même couleur que la dernière bille générée) ; `single` n'est **pas** une probabilité mais un seuil de « réparation des billes isolées » (désactivé par défaut, valeur 10) ; `partime` est en **secondes** et le bonus ACE TIME vaut `100 × (1 + ⌊250 × (1 − t/par)⌋)` (0 si t > par), ajouté au score dans le dialogue STATS par pas de 100 points toutes les 100 ms ; le décompte de fin de niveau avance de **60 px toutes les 4 mises à jour (40 ms)** avec **+100 points** par pas et un `endoflevelpop1` toutes les 10 mises à jour ; l'alerte démarre **600 px** avant le crâne (réglage `danger`, jamais surchargé par `levels.xml`), avec un intervalle qui passe de 4,1 s à 0,6 s. Deux règles importantes que notre moteur ignore : une **zone lente** (`slowdistance` 500 px avant la ligne de danger, interpolation vers `speed / slowfactor`, `slowfactor` par défaut 4) et un **arrêt du pousseur de 40 mises à jour** suivi d'une remontée de vitesse à 0,005 px/maj² (1 s pour revenir à 0,5) après chaque insertion dans le segment arrière.

**Recommandation principale :** garder `speed × 100` px/s mais ajouter la zone lente, l'arrêt/redémarrage du pousseur et l'arrivée rapide calculée ; passer `start` en pourcentage de piste ; remplacer `singleChance` par la règle de réparation ; prendre les montants originaux (ACE TIME, +100 par 60 px, pièce 500) et l'alerte à 600 px avec l'intervalle original.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### STATS natif (U10)
- **D-01:** Le dialogue est composé à l'exécution dans un canvas 640×480 (puis affiché comme fond de `.zuma-stats`, pas de `url(` en CSS) à partir de : `images/dialogbox.jpg` + `_dialogbox.gif` (243×242, cadre 9-slice : mesurer les bords sur l'image), `images/GodHead.gif` + `_GodHead.gif` (156×140, centré en haut, chevauchant le bord supérieur), `images/DialogButton.jpg` + `_Dialogbutton.gif` (360×48 = 3 états de 120×48 : normal / survol / pressé). Taille et position du dialogue : celles de l'image de référence R2.0.12 (`private_assets/original/extra/stats_bg.png` : cadre ≈ x 17 %–83 %, y 19 %–93 % du 640×480) ; l'image R2.0.12 ne sert plus de fond.
- **D-02:** Polices bitmap PopCap rendues par un module `src/bitmapfont.ts` : parse des `.txt` (`Define CharList/WidthList/RectList/OffsetList/KerningPairs/KerningValues`, `CreateLayer`, `LayerSetImage`, `LayerSetOffset`, `LayerSetColorMult`, `LayerSetAscent`, `SetCharMap`), glyphes découpés dans `<font>.gif` avec masque `_<font>.gif` (si seule la version `_` existe, elle est le masque d'un glyphe blanc à teinter). Titre « STATISTIQUES » en `NativeAlienExtended18` (teinte dorée d'origine du gif), libellés et valeurs en `Cancun12` teintés (libellés jaune `#f5d65b`, valeurs crème, TEMPS/BONUS vert, OBJECTIF orange, mêmes tons que la référence), astuce en `Cancun10` ou `Arial12Bold`. L'importateur copie `fonts/*.gif` et `fonts/*.txt` nécessaires dans le pack.
- **D-03:** Libellés = chaînes originales `default.xml` : STATS, POINTS, COMBOS, COINS (PIÈCES), GAPS (SAUTS), CHAIN_BONUS abrégé « ENCH. MAX. » (pas de chaîne MAX_CHAIN : conserver la convention R2.0.12), MAX_COMBO (COMBO MAX.), YOUR_TIME (TEMPS), ACE_TIME (OBJECTIF), BONUS, BEST_TIME (RECORD), NO_TIME_BONUS (PAS DE BONUS), TIP (ASTUCE), OK. L'importateur extrait ces chaînes de `properties/default.xml` (UTF-16) dans `pack/strings.json`.
- **D-04:** Sémantique de la colonne droite : TEMPS = durée du niveau ; OBJECTIF = `partime` (temps d'expert) ; BONUS = bonus de temps d'expert `+N` quand TEMPS ≤ OBJECTIF (N = 10 × secondes restantes, hypothèse, min 100), sinon « PAS DE BONUS » ; RECORD = **meilleur temps du niveau** persisté (`localStorage` `zuma.best.<levelId>`), affiché même à la première partie (alors égal au temps courant) ; le bonus est ajouté au score avant l'affichage.
- **D-05:** Valeurs gauche : POINTS (score du niveau), COMBOS, PIÈCES (coins touchées), SAUTS, ENCH. MAX. (série max), COMBO MAX. Révélation ligne par ligne (90 ms) et son `pop` par ligne (hypothèse légère), OK sur le bouton natif avec états survol/pressé et son `button1`.
- **D-06:** Repli vectoriel inchangé sans pack ; verrous r211 conservés (un seul `#result-continue`, marqueur `R2.0.11`, pas de `url(`).

#### Pièces (U12, GAME-03)
- **D-07:** Source : `graphics.treasure[]` du pack (x, y, curve index, dist). Une pièce apparaît toutes les 9–15 s (RNG du moteur) sur un TreasurePoint tiré au hasard dont la condition de dégagement est remplie : aucune bille de la courbe concernée à moins de `dist` px du point (hypothèse pour `dist1`/`dist2` ; `dist = 0` = toujours libre). Visible 6 s (`coinVisibleTicks`), une seule pièce à la fois.
- **D-08:** Rendu : `COIN.gif` + `_COIN.gif` (36×36, 30 trames, rotation à 20 trames/s) et `sparkle.gif` (280×20 = 14 trames de 20×20) en scintillement périodique. Sons : `jewelappear` à l'apparition, `gemvanishes` à la disparition, `coingrab` au tir.
- **D-09:** Collision projectile–pièce (rayon 18 px) : la pièce disparaît, +`coinPoints` (hypothèse : 100, documentée), **la série (streak) est conservée** et le projectile continue sa course ; événement `coin` avec texte flottant « +100 ». Compteur `stats.coins`.

#### Fin de niveau (U13, GAME-04)
- **D-10:** Quand la dernière bille est détruite en mode ZUMA : état `clearing` (plus de tir). Un marqueur part de la position `s` de la dernière explosion et avance vers le crâne par pas d'une bille (`ballSpacing`) toutes les 4 ticks ; à chaque pas : +`cleanupPoints` (hypothèse : 10 par pas), texte flottant « +10 » au point de la piste, son `bonuspop` (`endoflevelpop1`) dont le `rate` monte de 1 à 1,5 sur la longueur. À l'arrivée au trou : bonus de temps d'expert (D-04) avec son `extralife`-like ? Non : son `levelwin` (`chant5`), puis STATS après 60 ticks. Les montants et le pas sont des hypothèses à documenter.
- **D-11:** Séquence de début « Attention / PARTEZ » (`GET_READY` / `GO`) : affichée pendant l'arrivée rapide de la chaîne, « PARTEZ » quand `feeding` passe à faux, son `gamestart` (`chant1`) au début ; police `NativeAlienExtended18`. À planifier dans cette phase si le budget le permet, sinon noter en différé.

#### Ajustements UAT 4 (U14–U21)
- **D-12:** Un spike d'analyse statique de `Zuma.exe` (`05-RESEARCH.md`) tranche si possible : cadence de mise à jour et unité de `speed`, sens de `repeat`/`single`, unité de `partime`, montants du décompte et du bonus de temps. À défaut, valeurs de repli : `speed × 60` px/s (au lieu de × 100), `feedSpeed` 300, alerte à 20 % de la longueur de piste (min 320 px), décompte par pas de 2 billes toutes les 6 ticks.
- **D-13:** Le chronomètre du niveau (TEMPS, bonus) démarre à l'événement `go` (« PARTEZ »), pas au chargement.
- **D-14:** Rafraîchissement des munitions immédiat : dès qu'une destruction est marquée, les couleurs des billes en explosion ne comptent plus ; `current` et `next` sont remplacés si absents, à chaque tick ; le projectile en vol garde sa couleur (verrou r206).
- **D-15:** Fin de niveau : après le décompte, annonce à l'écran « BONUS TEMPS +N » (ou rien) en police titre avec son `extralife`-like → non : son `bonuspop` final puis `levelwin` ; le bonus apparaît dans STATS (BONUS) et dans le score.
- **D-16:** Atteinte du ZUMA : bannière « ZUMA ! » (chaîne `STRING_ID_ZUMA` si présente, sinon « ZUMA ! ») en `NativeAlienExtended18` pendant 120 ticks, jauge en pulsation, son `chant4` conservé.
- **D-17:** Roulement : `rolling` à gain constant (0,6) dès que la chaîne avance (> 2 px/s), fondu 150 ms à l'arrêt, hauteur 1 ; pas de modulation par la vitesse.
- **D-18:** STATS : revue de mise en page contre la référence et les polices (interligne 1,65 × hauteur de capitale, valeurs alignées à droite sur la même colonne, titre teinté doré `#f0c040` par multiplication, OK centré) ; vérification des valeurs affichées par un test de bout en bout (fixture connue → chiffres attendus).

### Claude's Discretion
- Échelle exacte du dialogue, courbes d'animation, volumes.

### Deferred Ideas (OUT OF SCOPE)
- Musique, modes Gauntlet, menu principal : phases 6–7.
</user_constraints>

## Contraintes du projet (CLAUDE.md)

- Aucune ressource originale commitée : ce document ne cite que des adresses, des nombres et de courtes chaînes ; la copie extraite du PE interne vit dans le scratchpad de session, pas dans le dépôt. `npm run guard` reste la barrière.
- TypeScript strict, zéro dépendance runtime, canvas 2D, Node 22 : aucune bibliothèque n'est recommandée ici — tout est formule et constante.
- Toute règle de jeu modifiée doit être verrouillée par un test dans `tests/r<version>.test.mjs` (baseline `ENGINE_VERSION` == `package.json`, actuellement 2.0.15 → prochains tests dans `tests/r216*.test.mjs`) et notée dans `R<xyz>_RELEASE_NOTES.md`.
- Le moteur ne touche pas au DOM ; tout aléa passe par `engine.rng` ; les assets manquants renvoient `null` (repli), jamais d'exception.
- Modifications uniquement via un flux GSD (`/gsd-execute-phase` pour les plans 05-05 / 05-06).

## Méthode (reproductible)

1. `objdump -h Zuma.exe` → les chaînes de réglages (`speed`, `repeat`…) sont **hors sections** ; un second `MZ`/`PE` à l'offset `0x1c51a2` (après la signature `!popcapdrmprotect!`) est le jeu réel. Extraction par Python (`data[0x1c51a2:]` dans le scratchpad), puis `objdump -d -M intel` complet (462 k lignes).
2. Chaînes de réglages en `.rdata` (0x54d408–0x54d4e0 en ASCII, 0x54d54c–0x54d5f0 en UTF-16) → `push imm32` dans la fonction de chargement de niveau 0x4293d0 → aide 0x40d3e0 (nom, fonction de parse, **offset de champ**) et `swscanf` (0x515fff) avec `L"%d"`/`L"%f"` pour les attributs de niveau.
3. Constructeurs de valeurs par défaut (0x40b070 pour la structure par courbe, 0x41aae0 pour la description de niveau) → consommateurs des offsets via les charges `[obj+0x14]` (pointeur de réglages de la courbe) → fonctions de vitesse (0x418780), de couleur (0x414b20), d'alimentation (0x405060), de fin de niveau (0x421550, 0x432cd0, 0x4283e0), de dialogue STATS (0x4478xx–0x449258), d'alerte (0x418a74).
4. Constantes flottantes lues dans `.rdata` (`struct.unpack`) ; identifiants de sons retrouvés par le motif `push "SOUND_X" … mov ds:0x5a1xxx,eax` puis `resources.xml` (`BONUS_EXPLOSION` = `endoflevelpop1`, `WARNING` = `warning1`, `BAR_FULL` = `chant4`, `ROLLING` = `rolling`).

Durée du spike : ≈ 2 h. Ce qui n'a pas été localisé est listé en « Valeurs de repli ».

## Structure des réglages dans l'exécutable

Chaque niveau charge une `LevelDesc` (constructeur 0x41aae0) contenant **trois** structures de réglages de courbe de 0x7c octets (constructeur 0x40b070, à `LevelDesc+0xac`, une par `curve`/`curve2`/`curve3`). Les attributs des `<Settings>` sont lus **par courbe** par 0x40d3e0 (un attribut `speed` s'applique aux trois ; des suffixes de plage existent dans le code mais `levels.xml` ne les utilise pas).

| Offset | Attribut | Type | Défaut (0x40b070) |
|---|---|---|---|
| 0x1c | `danger` | int | 600 |
| 0x20 | `speed` | float | 0,5 (0x54c85c) |
| 0x24 | `start` | int | 40 |
| 0x28 | `mergespeed` | float | 0,05 (0x54c858) |
| 0x2c | `balls` | int | 0 |
| 0x30 | `repeat` | int | 40 |
| 0x34 | `single` | int | 10 |
| 0x38 | `colors` | int | 4 |
| 0x3c | `slowfactor` | float | 4,0 (0x54c850) |
| 0x40 | `slowspeed` | float | 0 |
| 0x44 | `slowdistance` | int | 500 |
| 0x48 | `accrate` | float | 0 |
| 0x50 | `score` | int | 1000 |
| 0x54 | `skullrot` | int | −1 |
| 0x58 | `zumaback` | int | 300 |
| 0x5c | `zumaslow` | int | 1100 |
| 0x60 | `maxspeed` | float | 100,0 (0x54c854) |
| 0x64–0x70 | `bombfreq`, `slowfreq`, `accfreq`, `backfreq` | int | 3000 (tous recouverts par `powerfreq`, boucle 0x42a1b1) |
| 0x74 | `curvecolor` | hex | −1 |
| 0x78/0x79/0x7a | `drawcurve`, `drawtunnels`, `destroyall` | bool | 0 / 1 / 1 |

Attributs de **niveau** (UTF-16, `LevelDesc`) : `firespeed` (float, défaut 6,0, +0x58), `reloaddelay` (int, 0), `gx`/`gy` (320/240), `bgcolor`, `huerot`, `difficulty` (−1), `treasurefreq` (int, 300, +0x74), `partime` (int, 0, +0x78), `powerfreq` (int → les 4 `*freq` des 3 courbes). Post-traitement 0x42ad8b : si `slowspeed` ≠ 0, `slowfactor = speed / slowspeed`.

## Tableau de synthèse par réglage

| Réglage | Valeur 1-1 (`lvl11`) | Interprétation établie | Preuve (PE interne) | Confiance | Recommandation `configFromSettings` / `CANDIDATE` |
|---|---|---|---|---|---|
| cadence | — | 1 mise à jour = 10 ms (100 Hz) | 0x433130 lit `plateau+0xf0` (compteur de maj) ; 0x433a20 le multiplie par 10 pour obtenir des ms ; temps STATS = compteur ÷ 100 (0x4483ce, 0x447b5a) | haute | Garder `tickHz: 60` et convertir : 1 maj = 10 ms, donc `ticks = round(maj × 0.6)` (déjà fait pour zumaback/zumaslow) |
| `speed` | 0,5 | **px par mise à jour** → 0,5 px/maj = **50 px/s** ; vitesse cible du pousseur, la vitesse effective `mSpeed` (courbe+0x64) y converge : −0,1 px/maj par maj si au-dessus, +0,005 px/maj par maj si en dessous | 0x418796 (`fld [réglages+0x20]`), 0x418914–0x418928 (`bille arrière.pos += mSpeed` à chaque maj), 0x4188b3–0x4188e6 (constantes 0x54c7e0 = 0,1 ; 0x54cb28 = 0,005) | haute | **Conserver `speed × 100` px/s** (notre interprétation est juste) ; ajouter la rampe d'accélération 0,005 px/maj² = 50 px/s² et la décélération 0,1 px/maj² = 1000 px/s² |
| `maxspeed` | — (défaut 100) | plafond de `speed + accumulateur d'accrate` ; inopérant sans `accrate` | 0x4187c6–0x4187d7 | haute | Ignorer (aucun niveau ne définit `accrate`) |
| `slowspeed` / `slowfactor` / `slowdistance` | — / — (défaut 4,0) / — (défaut 500) | **zone lente avant le crâne** : sur les 500 px précédant la ligne de danger, la cible passe linéairement de `v` à `v / slowfactor` ; au-delà de la ligne (600 derniers px) la cible est `v / slowfactor`. Rien à voir avec le power-up RALENTIR | 0x4187ef–0x418832 (interpolation `v·(1−f) + f·v/slowfactor`, `f = (slowdistance − len + pos)/slowdistance`) ; 0x42ad98 (`slowfactor = speed/slowspeed`) | haute | Nouveau : `slowDistance: 500`, `dangerDistance: 600`, `endSlowFactor: s.slowfactor ?? 4` appliqué à la cible dans `moveChain` ; ne plus réutiliser `slowFactor` (power-up) pour ce réglage |
| `danger` | — (défaut 600) | ligne de danger = `longueur − 600` px (clampée à longueur−1) : départ de l'alerte et fin de l'interpolation lente | 0x41a9ac–0x41aa07 (`courbe+0x70 = nbPoints − danger`) | haute | `WARNING_DISTANCE = 600` px (fixe, pas un % de piste) |
| `start` | 35 | **pourcentage de la longueur de la courbe** à remplir par l'arrivée rapide (gauntlet : 50 %) | 0x405060 : `cible = nbPoints × start / 100` (magie ÷100 `0x51eb851f`, `sar 5`) | haute | `startDistance = start/100 × track.length` (en billes : `round(start/100 × length / 32)` ; spirale 2762 px × 35 % = 967 px ≈ 30 billes, proche des 35 actuelles mais faux en principe : `space` 4332 px × 80 % = 108 billes) |
| arrivée rapide (`feedSpeed`) | — | vitesse initiale **calculée** : `V = speed + 0,1·⌊18 + 0,5·(√((speed+20)² + 80·d) − (speed+20))⌋` px/maj avec `d = start% × longueur` (spirale : ≈ 15,2 px/maj = **1520 px/s**), puis décélération 0,1 px/maj² jusqu'à `speed` (≈ 1,5 s, ≈ 1150 px parcourus) | 0x4050e7–0x405144 (constantes 0x54c790 = 20, 0x54c788 = −20, 0x54c550 = 4, 0x54c780 = 0,5, 0x54c770 = 18, 0x54c698 = 0,1) | haute (formule), moyenne (appel unique au départ : fonction atteinte par `jmp` depuis 0x4181c2) | Remplacer `feedSpeed` constant par la formule + décélération ; repli simple : 1500 px/s puis −1000 px/s² jusqu'à la vitesse nominale |
| « PARTEZ » (fin d'arrivée) | — | quand **toutes** les courbes ont `mSpeed − speed ≤ 0,1` px/maj, ou au plus tard 500 maj (5 s) après le début | 0x402070 (test), 0x428a03–0x428a5c | haute | `feeding = false` quand la vitesse ≤ nominale + 10 px/s, garde-fou 5 s |
| `repeat` | 40 **et** 50 (attribut dupliqué) | `Rand() % 100 <= repeat` → la bille générée répète la couleur de la dernière bille générée (probabilité `(repeat+1)/100`) | 0x414bd7–0x414bea | haute (règle) ; moyenne (doublon : le parseur XML de SexyApp écrit `mAttributes[nom] = valeur`, le dernier gagne → 50) | `repeatChance = ((s.repeat ?? 40) + 1) / 100` ; pour `lvl11`/`lvl12` prendre **50** (dernier attribut) |
| `single` | — (défaut 10) | **seuil de réparation des isolées**, actif seulement si `single < 10` : quand le tirage `repeat` échoue et que le groupe à l'entrée est une bille isolée, la nouvelle bille **copie** sa couleur si `single == 0` ou si le nombre de groupes isolés parmi les 10 derniers groupes est ≤ `single` ; sinon couleur différente. Non actif au 1-1 | 0x414bec–0x414c1f ; 0x40aa50 (compte des groupes de taille 1 parmi les n premiers, via 0x402040) | haute | Supprimer `singleChance` (8 % faux) ; implémenter la règle de réparation avec `singleLimit = s.single ?? 10` (10 = désactivé) |
| `colors` | 4 | nombre de couleurs tirées (`Rand() % colors`) | 0x414b63, 0x414c14 | haute | inchangé |
| `score` | 1000 | seuil de jauge : ZUMA quand `score − score au début du niveau ≥ score` ; sert aussi au `partime` par défaut et à la valeur des pièces | 0x428a79–0x428a85 ; 0x42ad1b ; 0x4233fb | haute | inchangé (`target`) |
| `partime` | 25 | **secondes** ; comparé au temps de niveau `maj ÷ 100` ; par défaut (absent) `⌈score × 35/1000⌉₅` (× 0,95 × nb de courbes si > 1, arrondi au multiple de 5 supérieur) | 0x448e9b (affiché via le même formateur que le temps), 0x447b5a–0x447b76, 0x42ad12–0x42ad86 | haute | `parTime = s.partime` en secondes ; repli calculé si absent |
| bonus ACE TIME | — | `t > par ? 0 : 100 × (1 + ⌊250 × (1 − t/par)⌋)` avec `t = ⌊secondes⌋` → 1-1 : 24 s → 1100, 20 s → 5100, 0 s → 25100, 25 s → 100 | 0x401cb0 (constante 0x54c678 = −25000, `_ftol`, ÷100, `1 − x`, ×100) | haute | Remplacer `aceTimeBonus` (10 pts/s, min 100) par cette formule ; mettre à jour le test `r215` |
| `firespeed` | 6 | px par maj du projectile = 600 px/s | 0x429bb4 (`%f`), défaut 6,0 (0x54c6a0) | haute | inchangé (`6 × 100 / 60` = 10 px/tick) |
| `zumaback` / `zumaslow` | — (défauts 300 / 1100) | au ZUMA, **seulement si la tête couvre > 50 % de la piste** : recul pendant `zumaback` maj (3 s) et cible × 0,25 pendant `zumaslow` maj (11 s) | 0x40a980–0x40a9a9 (couverture 0x40a900 > 50), 0x4187dd–0x4187e9 (× 0,25, constante 0x54cb38) | haute | Conversion ×0,6 correcte ; ajouter la condition « > 50 % » et le facteur 0,25 ; valeurs par défaut 300/1100 quand absentes (actuellement 0) |
| `powerfreq` | — (défaut 3000) | recouvre `bombfreq`/`slowfreq`/`accfreq`/`backfreq` des 3 courbes ; consommateurs non analysés | 0x42a1b1–0x42a1f2 | moyenne (unité probable : maj) | inchangé (hypothèse 100 Hz déjà appliquée) |
| `treasurefreq` | — (défaut 300) | fréquence d'apparition des pièces, unité non vérifiée (probablement maj = 3 s) | 0x429d58 (`%d`), défaut 0x12c | basse | garder D-07 (9–15 s) |
| `reloaddelay` | 0 | int (non analysé) | 0x429c2b | basse | ignorer |

## Règles d'exécution

### 1. Cadence et pousseur

- **100 Hz.** Preuve : 0x433a20 = `compteur_plateau × 10` utilisé comme horloge en millisecondes par l'alerte (0x418a80) ; 0x4483ce et 0x448e2c divisent le temps de niveau par 100 pour afficher des secondes. [VERIFIED: désassemblage]
- **Mouvement :** à chaque maj, la bille arrière (tête de liste, celle contre le pousseur) avance de `mSpeed` px (0x418914), puis chaque bille en contact est poussée à `précédente.pos + rayons` (0x4189a4–0x4189fe, son `SOUND_BALLCLICK1` au premier contact).
- **Vitesse cible** (0x418780) : `cible = speed` ; si ZUMA-slow actif : `× 0,25` ; zone lente : voir §4 ; en mode gauntlet seulement (drapeau plateau+0x187) : accélération quand la couverture < 30 %. Puis `mSpeed → cible` : `−0,1` par maj si au-dessus, `+0,005` par maj si en dessous (0x4188b3–0x4188e6).
- **Arrêt après insertion :** dans la gestion des insertions (0x423ac7–0x423ad6), quand le segment concerné est le **segment arrière** (celui que pousse le pousseur), `mSpeed = 0` et le compteur d'arrêt `courbe+0x54` est porté à au moins **40 maj (0,4 s)** ; tant qu'il est > 0 le pousseur n'avance pas (0x418905–0x41890e) ; à son retour à 0, `mSpeed` est remise à 0 (0x423caa) et remonte à 0,005 px/maj² → **1 s** pour retrouver 0,5 px/maj, en ne parcourant que 25 px. [VERIFIED: désassemblage ; condition exacte du segment : MOYENNE]
- **Conséquence pour U14 :** la vitesse de croisière de 50 px/s est correcte, mais l'original « respire » : chaque tir qui touche le segment arrière arrête la chaîne ≈ 0,4 s puis la relance lentement, et la fin de piste est ralentie jusqu'à ÷ 4 (§4). C'est l'absence de ces deux règles, pas l'unité de `speed`, qui rend notre 1-1 trop dur.

Recommandation concrète (`CANDIDATE`, 60 Hz) : `chainAccel: 50` px/s², `chainDecel: 1000` px/s², `pusherStopTicks: 24` (40 maj), `ZUMA slow factor 0.25`.

### 2. Arrivée rapide (`start`) et « PARTEZ »

- `start` est un **pourcentage de la longueur** (0x405088–0x4050a4 : `nbPoints × start / 100`). Vitesse initiale `V` (formule du tableau ; 0x4050e7–0x405144), quantifiée au dixième de px/maj, puis décélération naturelle de 0,1 px/maj² jusqu'à `speed`. Pour la spirale (2762 points) : `V ≈ 15,2 px/maj` (1520 px/s), ≈ 147 maj de décélération, ≈ 1150 px parcourus (≈ 36 billes). [VERIFIED: constantes] — le point d'appel exact n'a pas été suivi (fonction atteinte par `jmp` depuis 0x4181c2) : traiter « appel unique au démarrage » comme MOYEN.
- « PARTEZ » : le plateau quitte l'état d'attente (`plateau+0x182`) quand aucune courbe n'a `mSpeed − speed > 0,1` ou après 500 maj (0x428a03–0x428a5c). Sons `GAME_START` = `chant1`.
- Recommandation : `feedSpeed` dynamique = `V × 100` px/s avec décélération `chainDecel` ; `feeding` → faux quand `v ≤ speed + 10 px/s` ; garde-fou 5 s. Repli si trop coûteux : 1500 px/s constant jusqu'à `start % × longueur`, puis chute linéaire à 1000 px/s².

### 3. Génération des couleurs (`repeat`, `single`, `colors`)

Fonction 0x414b20 (une bille créée à l'entrée) :
1. `prev` = couleur de la dernière bille générée (liste d'attente, sinon bille arrière ; sinon `Rand() % colors`).
2. `r = Rand() % 100` ; si `r <= repeat` → `prev`.
3. Sinon, si `single < 10` **et** le groupe à l'entrée est isolé (0x40aa50(1) == 1) : si `single == 0` → `prev` ; sinon si le nombre de groupes isolés parmi les 10 derniers groupes ≤ `single` → `prev` ; sinon → différente.
4. Sinon → `Rand() % colors` jusqu'à ≠ `prev`.

`Rand()` = LCG MSVC (0x51602b : `×0x343fd + 0x269ec3`, `>>16 & 0x7fff`). Dans notre moteur : `repeatChance = (repeat+1)/100`, suppression de `singleChance`, ajout de `singleLimit` (10 = désactivé) avec la règle 3 (le compte des isolées se fait sur les groupes contigus depuis l'entrée, liste d'attente comprise).

### 4. Zone lente et ligne de danger

- `dangerStart = longueur − danger` (600 par défaut, jamais défini dans `levels.xml`).
- Si `pos_tête ≥ dangerStart − slowdistance` (500) : `f = (pos − (dangerStart − 500)) / 500` ; `cible = v·(1−f) + f·v/slowfactor` ; au-delà de `dangerStart` : `cible = v/slowfactor` (0x4187ef–0x418832). `slowfactor` : 4 par défaut (niveaux sans attribut, dont tout l'étage 1), 3,5 → 1 selon `levels.xml`.
- Au 1-1 : sur les 1100 derniers px la chaîne passe de 50 px/s à 12,5 px/s (≈ 48 s pour parcourir les 600 derniers px). C'est l'« ultime chance » caractéristique de l'original.

### 5. Alerte (`warning1`) et lumière de piste

Dans 0x418a74–0x418afd, à chaque maj quand `pos_tête ≥ dangerStart` **et** `compteur_plateau ≥ courbe+0x74` :
- `délai_ms = 100 + 4000 × (longueur − pos_tête) / danger` ; si `maintenant − dernier ≥ délai_ms` : `PlaySample(SOUND_WARNING)` (volume non modulé), `dernier = maintenant`.
- Puis `courbe+0x74 = compteur + (nbPas + 60)` où une **lumière** court de la tête au crâne par pas de 11 px/maj (0x418640 : `SOUND_TRAIL_LIGHT` par pas, `SOUND_TRAIL_LIGHT_END` à l'arrivée, effet 0x4157b0).
- Intervalle effectif ≈ `max(0,1 + 4·rem/600 s, (rem/11 + 60)/100 s)` : **4,1 s** à l'entrée de la zone (600 px), 2,1 s à 300 px, 0,77 s à 100 px, **0,6 s** au crâne. [VERIFIED: constantes 0xfa0 = 4000, +0x64 = 100, +0x3c = 60, pas 0xb = 11]

Recommandation `src/audio.ts` : `WARNING_DISTANCE = 600` ; `warningInterval(rem) = max(0.1 + 4 × rem/600, (rem/11 + 60)/100)` ; gain constant (supprimer la rampe 0,35 → 1 qui n'existe pas dans l'original) ; la lumière de piste est un effet optionnel (hors D-12).

### 6. ZUMA (jauge pleine)

0x428a69–0x428b09 : quand `score ≥ seuil` et état de niveau normal : `plateau+0x174 = 224` (compteur d'affichage probable : 2,24 s, BASSE), `plateau+0x108 = 50`, son `SOUND_BAR_FULL` (`chant4`), `plateau+0x181 = 1`, puis pour chaque courbe `0x40a980(1)` : arrêt de la génération, liste d'attente vidée, et **si la couverture (position de la tête en % de piste) > 50 %** : recul `zumaback` maj et ralenti × 0,25 pendant `zumaslow` maj. D-16 (bannière 120 ticks = 2 s) reste raisonnable ; 224 maj = 2,24 s si l'on veut coller.

### 7. Fin de niveau : décompte de distance et bonus de niveau

- **Déclenchement** (0x4288e6–0x428923) : toutes les courbes vides sans attente → 0x4283e0(1, 0) : pour chaque courbe `AddScore((100 − couverture) × 100)` (0x428705–0x428712) ; couverture = 0 une fois la courbe vide → **+10 000 par courbe** (la même fonction sert au passage de vague en gauntlet, où la couverture est non nulle). Confiance MOYENNE sur le montant en aventure (le code est clair, l'impact sur les scores connus n'a pas pu être recoupé).
- **Décompte** (objet 0x432cd0 → 0x421550 par courbe) : `délai = 20` maj ; par courbe (`+50` entre deux courbes) : départ à `courbe+0x78` = position de la **dernière destruction** (mis à jour par 0x41aa20 à chaque match), aligné pour que des pas de **60 px** tombent exactement sur le crâne ; à chaque pas : 5 étincelles aléatoires ±10 px (0x4151e0), un texte **« +100 »** jaune (0xffff00, police 0xb) programmé à `délai`, `délai += 4` maj ; les points sont **ajoutés quand le texte apparaît** (0x419469 → AddScore) ; `endoflevelpop1` (`SOUND_BONUS_EXPLOSION`, volume 0,5, hauteur non modulée) programmé **toutes les 10 maj** de `délai_initial + 1` à la fin ; puis `+50` maj et passage à l'état 2 (dialogue STATS).
- Rythme : **60 px / 40 ms = 1500 px/s**, 100 points par pas (spirale depuis mi-piste ≈ 23 pas ≈ 0,9 s, +2300). Nos valeurs actuelles (32 px / 4 ticks, +10) sont trois fois plus lentes en px/s mais dix fois moins généreuses ; la « non-conformité » ressentie (U16) tient surtout aux +10 et au son par pas.

Recommandation `CANDIDATE` : `cleanupStepPx: 60`, `cleanupStepTicks: 2` (≈ 33 ms ; 40 ms exact si l'on passe en temps), `cleanupPoints: 100`, `cleanupStartTicks: 12` (20 maj), `cleanupEndTicks: 30` (50 maj) avant STATS, son toutes les 6 ticks (10 maj) indépendant des pas, `levelBonus: 10000` par courbe (à confirmer en UAT ; marqué hypothèse).

### 8. Dialogue STATS, ACE TIME, record

- Constructeur 0x4478xx : POINTS = `score − score_début_niveau` (`plateau+0xe4 − plateau+0x164`) ; `bonus = 0x401cb0(⌊temps/100⌋, partime)` ; record cherché dans le profil par nom de niveau (0x40f990/0x40d2c0), affiché via `BEST_TIME` si trouvé (`record+0x1c` en secondes, formateur 0x434c40 = minutes:secondes). Astuce : une parmi 12 (`plateau+0x298 % 12`), ou un message spécial pour le dernier niveau.
- Mise à jour 0x440b00 : **100 maj (1 s)** après l'ouverture, toutes les **10 maj**, `affiché += 100` (2500 en mode rapide `plateau+0x186`), `AddScore(100)` et `endoflevelpop1` avec paramètre flottant `affiché / 1000` (vraisemblablement la hauteur : monte avec le total). Le bonus est donc **ajouté pendant STATS**, pas avant (D-04 dit « avant l'affichage » : à ajuster → ajouté visiblement pendant le dialogue, cf. U17).
- Couleurs posées avant chaque ligne (0x4525f0) : `0xffff00` (jaune) avant TEMPS, `0xffa500` (orange) avant OBJECTIF, `0x2aff03` (vert) pour `BONUS` (format `L" %d"` : `BONUS +N` → la chaîne est `STRING_ID_BONUS` suivie de ` %d`), `0x9dcba2` pour `NO_TIME_BONUS`, `0xf8f792` pour la ligne suivante, `0xffff00` avant `TIP`. Confirme D-02/D-18 (TEMPS jaune, OBJECTIF orange, BONUS vert).

### 9. Pièces (complément D-07/D-09)

0x4233fb–0x423445 : valeur = `100 × ⌊score / 600⌋`, **minimum 500** en aventure (200 en gauntlet) ; texte jaune `+N` (police 0xb), son `JEWEL_HIT` (`coingrab`), `AddScore` immédiat. Au 1-1 (score 1000) : **500**, pas 100 (D-09 à corriger ; un guide Xbox cite 500/600/700 par étage, cohérent avec la formule pour les scores de 3600–4199 → 600, 4200+ → 700). `treasurefreq` 300 : unité non vérifiée.

### 10. Munitions et roulement (non tranchés)

- Rafraîchissement des munitions quand une couleur disparaît : **non localisé** dans le temps imparti. D-14 reste la règle.
- Son `rolling` : deux instances créées dans un objet d'effets (0x41969c, 0x4196bb) ; logique de volume/hauteur non analysée. D-17 reste la règle.
- Chronomètre de niveau (`plateau+0x1dc`, premier champ de la structure STATS) : son point de départ (chargement ou PARTEZ) n'a pas été localisé. D-13 reste la règle.

## Recommandations consolidées pour `configFromSettings` / `CANDIDATE`

```ts
// src/main.ts — configFromSettings (valeurs 100 Hz → px/s, maj → ticks ×0.6)
speed: (s.speed ?? 0.5) * 100,                       // inchangé (px/maj × 100)
startFraction: Math.max(0, Math.min(1, (s.start ?? 40) / 100)),   // % de longueur (remplace start en billes)
repeatChance: Math.min(1, ((s.repeat ?? 40) + 1) / 100),          // 50 → 0.51
singleLimit: s.single ?? 10,                          // 10 = réparation désactivée
endSlowFactor: Math.max(1, s.slowfactor ?? 4),        // zone lente (plus slowFactor du power-up)
slowDistance: 500, dangerDistance: 600,
zumaBackTicks: ticks(s.zumaback ?? 300), zumaSlowTicks: ticks(s.zumaslow ?? 1100),
parTime: s.partime ?? defaultParTime(s.score ?? 1000, tracks.length),
projectileSpeed: ((s.firespeed ?? 6) * 100) / 60,     // inchangé
coinPoints: Math.max(500, 100 * Math.floor((s.score ?? 1000) / 600)),
levelBonus: 10000,                                    // par courbe, hypothèse à confirmer en UAT
```

```ts
// src/core.ts — règles (60 Hz)
chainAccel = 50 px/s² (0.005 px/maj²) ; chainDecel = 1000 px/s² (0.1 px/maj²)
pusherStopTicks = 24 (40 maj) après insertion dans le segment arrière, vitesse repart de 0
feed : v0 = 100 × (speed/100 + 0.1·floor(18 + 0.5·(sqrt((speed/100+20)² + 80·d) − (speed/100+20)))) avec d = startFraction × length ; puis chainDecel ; go quand v ≤ speed + 10 ou 5 s
aceTimeBonus(t, par) = t > par ? 0 : 100 * (1 + Math.floor(250 * (1 - Math.floor(t) / par)))
cleanup : pas 60 px, 100 pts, 40 ms/pas, son toutes les 100 ms, départ +200 ms, STATS +500 ms après le dernier pas
warning : 600 px ; intervalle max(0.1 + 4·rem/600, (rem/11 + 60)/100) s ; gain constant
```

## Valeurs de repli (ce qui reste inconnu)

| Sujet | État | Repli |
|---|---|---|
| Appel unique de la formule d'arrivée rapide | MOYEN (non suivi jusqu'au caller) | Si la formule pose problème : 1500 px/s puis −1000 px/s², `feeding` faux à `speed + 10 px/s` |
| Doublon `repeat` 40/50 au `lvl11`/`lvl12` | MOYEN (sémantique `std::map` du parseur XML) | Prendre 50 (dernier) ; sinon 40 |
| Bonus de fin de niveau +10 000 par courbe | MOYEN | Garder `levelBonus` configurable, 10 000 par défaut, à valider en UAT ; retomber à 1000 si le score paraît absurde |
| Bannière ZUMA 224 maj | BAS | D-16 : 120 ticks |
| Départ du chronomètre | non localisé | D-13 : à « PARTEZ » |
| Rafraîchissement des munitions | non localisé | D-14 |
| Son de roulement | non analysé | D-17 |
| `treasurefreq` (300), `reloaddelay`, `powerfreq` consommateurs | non analysés | D-07 (9–15 s), ignorer, hypothèse 100 Hz existante |
| Facteur du power-up RALENTIR | non analysé (distinct de `slowfactor`) | garder `slowFactor: 4` du moteur (le ZUMA-slow original est × 0,25) |
| Hauteur de `endoflevelpop1` dans STATS | paramètre `valeur/1000` de signification non vérifiée | monter le `playbackRate` de 1 à 1,5 comme prévu en D-10 |
| D-12 (repli initial) : `speed × 60`, `feedSpeed` 300, alerte 20 %, pas de 2 billes/6 ticks | **remplacé** par les valeurs établies ci-dessus | n'utiliser le repli D-12 que si l'implémentation des règles 1–2 glisse hors budget |

## Journal des hypothèses

| # | Affirmation | Section | Risque si faux |
|---|---|---|---|
| A1 | Le dernier attribut dupliqué gagne (`repeat` = 50) [ASSUMED] | tableau | 10 points de pourcentage sur la répétition au 1-1 |
| A2 | 0x405060 n'est appelé qu'une fois au démarrage du niveau [ASSUMED] | §2 | arrivée rapide trop longue si rappelé en boucle |
| A3 | Le bonus de fin de niveau (100 − couverture) × 100 s'applique en aventure (+10 000) [ASSUMED] | §7 | scores gonflés ×2 par rapport à l'original |
| A4 | `plateau+0x174 = 224` est la durée d'affichage de la bannière ZUMA [ASSUMED] | §6 | durée de bannière ±0,3 s |
| A5 | Le paramètre flottant `valeur/1000` de `PlaySample` est une hauteur [ASSUMED] | §8 | modulation sonore différente |
| A6 | `treasurefreq` est en mises à jour [ASSUMED] | tableau | cadence des pièces |

## Questions ouvertes

1. **Le +10 000 par courbe en fin de niveau est-il perçu comme conforme ?** Ce que l'on sait : code clair, couverture nulle quand la courbe est vide. Ce qui manque : un relevé de score du jeu original. Recommandation : configurable, validation en UAT.
2. **Quand le chronomètre démarre-t-il ?** Non localisé ; D-13 (PARTEZ) est plausible car l'état d'attente est distinct (`plateau+0x182`).
3. **Le pousseur s'arrête-t-il à toute insertion ou seulement dans le segment arrière ?** Lecture : segment arrière (celui touché par le pousseur). Avec une chaîne sans trou c'est chaque tir ; à vérifier au ressenti.

## Environment Availability

| Dépendance | Requise par | Disponible | Version | Repli |
|---|---|---|---|---|
| `objdump` (binutils, pei-i386) | spike | ✓ | — | `ndisasm` |
| `python3` | spike, extraction | ✓ | 3.x | — |
| Node 22 / npm | build & tests | ✓ | (projet) | — |

Aucune dépendance nouvelle pour les plans 05-05/05-06.

## Validation Architecture

### Test Framework
| Propriété | Valeur |
|---|---|
| Framework | `node:test` + `node:assert/strict` sur `.compiled/` |
| Config | aucune (scripts `package.json`) |
| Exécution rapide | `npx tsc && node --test tests/r216.test.mjs` |
| Suite complète | `npm test` (build + tous les tests + guard) ; `npm run check` (tsc --noEmit) |

### Règles → tests (plan 05-05/05-06, nouveau fichier `tests/r216.test.mjs`)
| Règle | Comportement | Type | Test |
|---|---|---|---|
| cadence/vitesse | 0,5 → 50 px/s en croisière ; rampe +50 px/s² après arrêt | unit | avancer N ticks sur piste droite, comparer `s` |
| arrêt pousseur | insertion dans le segment arrière → pas d'avance pendant 24 ticks puis redémarrage de 0 | unit | fixture r211-like |
| zone lente | cible ÷ `endSlowFactor` au-delà de `length − 600` ; interpolation sur 500 px | unit | positions de tête choisies |
| arrivée rapide | `start` 35 % → tête ≈ 35–42 % de la piste à `go`, vitesse ≤ nominale + 10 | unit | piste droite 2000 px |
| repeat/single | `repeatChance = 0.51` ; réparation des isolées quand `singleLimit < 10` | unit | RNG seedé, histogramme |
| ACE TIME | `aceTimeBonus(24,25) = 1100`, `(20,25) = 5100`, `(25,25) = 100`, `(26,25) = 0` | unit | remplace le test r215 |
| décompte | 60 px/pas, +100, départ à la dernière destruction, STATS après le dernier pas + 30 ticks | unit | fixture ZUMA + dernière destruction |
| alerte | `WARNING_DISTANCE = 600`, `warningInterval(600) ≈ 4.1`, `(0) = 0.6` | unit | presentation test |
| pièces | `coinPoints` 500 au 1-1 | unit | `configFromSettings` |

### Sampling
- Par tâche : `npx tsc && node --test tests/r216.test.mjs`
- Par vague : `npm test`
- Porte de phase : suite verte + `npm run guard`.

### Wave 0
- [ ] `tests/r216.test.mjs` (règles ci-dessus) ; `tests/r216-presentation.test.mjs` (alerte).
- Les tests `r215` (`aceTimeBonus`) et `r214-presentation` (`WARNING_DISTANCE = 220`) devront être mis à jour — règle CLAUDE.md : nouvelle règle = nouveau test + note de version.

## Security Domain

Aucune surface réseau ni entrée utilisateur nouvelle : les valeurs de `levels.xml` restent traitées comme non fiables (T-05-11 : `Number.isFinite`, bornes) ; appliquer les mêmes bornes aux nouveaux champs (`startFraction` ∈ [0,1], `singleLimit` ∈ [0,10], `endSlowFactor` ≥ 1, `slowDistance`/`dangerDistance` ≤ longueur). Pas de cryptographie, pas de session.

## Sources

### Primaires (HAUTE)
- `private_assets/original/Zuma.exe`, PE interne à l'offset 0x1c51a2, désassemblage `objdump -d -M intel` : fonctions 0x4293d0 (chargement de niveau), 0x40b070 / 0x41aae0 (défauts), 0x418780 (vitesse), 0x405060 (arrivée), 0x402070 (test d'arrivée), 0x414b20 / 0x40aa50 / 0x402040 (couleurs), 0x40a900 (couverture %), 0x40a980 (ZUMA), 0x41a9ac (ligne de danger), 0x418a74–0x418afd et 0x418640 (alerte), 0x423ac7 / 0x423c8c (arrêt du pousseur), 0x4283e0 / 0x428923 (fin de niveau), 0x432cd0 / 0x421550 (décompte), 0x419469 (paiement des textes), 0x4478xx–0x449258 (STATS), 0x401cb0 (bonus ACE), 0x440b00 (défilement du bonus), 0x4233fb (pièces), 0x433130 / 0x433a20 (horloge), 0x51602b (Rand).
- `private_assets/original/levels/levels.xml` (valeurs par niveau), `properties/resources.xml` (identifiants de sons → fichiers).

### Secondaires (MOYENNE)
- `private_assets/original/extra/Zuma_R2_0_12_Local_Autonome.html` : seconde opinion (R2 : `feedSpeed` 650, `repeatChance` 0,4, `start` en billes, décompte +100 par jeton toutes les 5 maj, `partime` en secondes) — concorde sur `partime` et les +100, diverge sur `start` et l'arrivée.
- [Wikipedia — Zuma (video game)](https://en.wikipedia.org/wiki/Zuma_(video_game)) : bonus de temps si le niveau est fini sous l'« ace time » (25 s à 4 min) — cohérent avec `partime` 25…240 s.
- [TrueAchievements — Zuma hints](https://www.trueachievements.com/game/Zuma/walkthrough/2) : pièces à 500/600/700 points selon l'étage (version Xbox) — cohérent avec `max(500, 100·⌊score/600⌋)`.

### Tertiaires (BASSE)
- [cyberly.org — Zuma Deluxe cheats](https://www.cyberly.org/game-cheats/pc/zuma-deluxe.html) : `speed` 0.5 → 0.2 ralentit les billes (confirme seulement le sens de `speed`).

## Metadata

**Confiance :**
- Unités et cadence : HAUTE — lues directement dans le code.
- Formules (arrivée, ACE, décompte, alerte, zone lente, couleurs) : HAUTE sur les constantes, MOYENNE sur deux points de contexte (A1–A3).
- Non tranché : chronomètre, munitions, roulement, bannière ZUMA, fréquence des pièces.

**Date :** 2026-10-10 — **Valide :** sans limite (binaire figé).
