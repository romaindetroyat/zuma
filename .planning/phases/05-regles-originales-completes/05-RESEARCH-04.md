# Phase 5 : Règles originales complètes — Recherche 04 (spike ciblé : projectile et pièce, son du power-up, compteur de vies, recul et comblement, recul ZUMA)

**Recherché le :** 2026-10-11
**Domaine :** Zuma Deluxe (PopCap) — mise à jour des projectiles, apparition des power-ups, HUD du plateau, cinématique de la chaîne (attraction, rebond au contact, recul ZUMA, sortie par l'entrée)
**Confiance globale :** HAUTE pour ce qui est lu dans le code (adresses et constantes citées) ; MOYENNE pour le sens de deux drapeaux (`plateau+0xf4 == 2`, `plateau+0x178 & 0x10`) ; BASSE uniquement là où c'est dit.
**Complète :** `05-RESEARCH.md`, `05-RESEARCH-02.md`, `05-RESEARCH-03.md` (même PE interne, même méthode). **Corrige** : `destroyTicks` (40 maj et non 40 ticks), le sens des sons `ballclick1` / `ballclick2`, le « recul » au moment d'un match (il n'existe pas dans l'original), la disposition du HUD, et le lecteur du compteur `plateau+0x178` que le spike 03 croyait absent.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (septième session, D-31..D-35)
- **D-31:** Pièce touchée : le projectile n'est pas consommé ; il continue sa trajectoire (insertion ou sortie) ; règle exacte selon le spike 04.
- **D-32:** Apparition d'un power-up sur une bille : son original lu dans l'exécutable (spike 04), distinct de `coinappear`.
- **D-33:** Compteur de vies du HUD : grenouilles jusqu'au seuil original, puis une grenouille et « xN » (spike 04 pour le seuil, la police et la position).
- **D-34:** Recul et comblement de brèches : vitesses et accélérations originales (spike 04) ; à défaut, recul ×2,5 plus rapide et attraction accélérée (0 → 600 px/s).
- **D-35:** Recul ZUMA : distance, vitesse et retrait des billes repassant l'entrée selon l'original (spike 04) ; à défaut recul plafonné et billes revenues avant le début de piste retirées.

### Claude's Discretion
- Échelle exacte du dialogue, courbes d'animation, volumes.

### Deferred Ideas (OUT OF SCOPE)
- Musique, modes Gauntlet, menu principal : phases 6–7.
</user_constraints>

<phase_requirements>
## Constats traités

| ID | Constat (UAT septième session) | Ce que ce spike établit |
|----|------|------|
| U34 / D-31 | Le tir sur une pièce fait disparaître la bille | **L'original consomme le projectile** (supprimé, jamais inséré) : D-31 contredit l'exécutable — décision utilisateur requise (Q1) |
| U35 / D-32 | Son particulier à l'apparition d'un power-up | **Aucun son** n'est joué à l'apparition ni à l'expiration d'un power-up dans ce binaire ; notre `powerup` = `jewelappear` est une invention (Q2) |
| U36 / D-33 | « x4, x5 » au-delà de 3 | Seuil **3 grenouilles de réserve** (vies − 1) ; au-delà **1 grenouille + « x%d »** jaune en `FONT_FLOAT` ; position et clignotement (Q3) — et la disposition de notre HUD diffère de l'original |
| U37 / D-34 | Recul et comblement trop lents | Attraction **accélérée sans plafond** (départ 100 px/s, +100 px/s toutes les 80 ms) après une destruction de **0,4 s** ; rebond **au contact** seulement, 50 ou 150 × profondeur px/s pendant 0,3 s ; aucun recul au moment du match (Q4) |
| U38 / D-35 | ZUMA : recul trop loin, « certaines disparaissent » | Recul **100 px/s pendant 3 s au plus** depuis la tête, arrêté si la tête passe sous 50 px ; **les billes repassant l'entrée (s < 1) sont supprimées** en mode ZUMA (Q5) |
</phase_requirements>

## Résumé

**Q1 (pièce).** La mise à jour d'un projectile (0x423330, appelée pour chaque projectile par 0x423920) teste la pièce **avant** la chaîne : distance centre-à-centre `< 16 + 20 = 36 px`. En cas de prise, après les points, le son et les étincelles, le projectile est **détruit** (`vtable[0](1)`, destructeur) et retiré de la liste des projectiles (0x4236ad–0x4236eb) ; la fonction retourne sans tester la chaîne. L'original **consomme** donc la bille, exactement comme notre moteur. D-31 décrit un comportement que l'exécutable n'a pas.

**Q2 (son du power-up).** L'apparition (0x40ae70 → 0x408e90 → `Ball::SetPower(type, différé = 1)` 0x401430) et l'activation différée (0x401500) ne jouent **aucun son** ; l'inventaire complet des 39 identifiants `SOUND_*` (lectures des globales 0x5a0fac–0x5a12e8) ne laisse aucun appel sur ce chemin. Les sons de power-up (`bombexplode`, `slowdown1`, `reverse1`, `accuracy3`) sont joués **à l'activation** (0x41a7c0). `SOUND_CHORAL1` (`choral1`, volume 0,2) est déclaré dans `resources.xml` mais **jamais lu** par le code.

**Q3 (vies).** HUD 0x40fa90 : `N = vies − 1` (la grenouille en jeu n'est pas comptée). `N ≤ 3` → N icônes `IMAGE_FROG_LIVES` (`ToadLives`, 24 × 23) à `x = 28 + 35·i`, `y = 3` ; `N > 3` → **une** icône à x 28 puis `"x%d"` (N) en **jaune 0xFFFF00**, police **`FONT_FLOAT`** (`cancunfloat14`), à **(67, 22)**. Les vies **clignotent 1,5 s** après une vie supplémentaire (`plateau+0x178 = 150`, masquées quand le bit 0x10 est levé). Ces coordonnées placent les vies dans l'**ovale vert de gauche** de `Menubar.jpg` ; le bouton MENU est à **x 519** (ovale vert de droite), la jauge à **(409, 2)** (ovale rouge de droite), le libellé de niveau centré sur **x 200** (ovale rouge de gauche), le score aligné à droite sur **x 360**. Notre HUD place MENU à gauche, les vies dans l'ovale rouge gauche, le niveau dans l'ovale rouge droit et la jauge à droite.

**Q4 (recul et comblement).** Trois mécanismes, aucun lié à `mergespeed`, `slowspeed` ou `maxspeed` :
1. **Destruction** : 40 maj (**0,4 s**, 0x423a62 `cmp 0x28`) — notre `destroyTicks: 40` vaut 0,67 s.
2. **Attraction** (0x421800) : à la fin de la destruction, si les billes de part et d'autre du trou ont la même couleur, le segment avant reçoit un compteur `v = 10` (0x423a95) ; chaque maj il recule de `⌊v / 8⌋` px puis `v += 1` : **100 px/s au départ, +100 px/s toutes les 8 maj (≈ 1 250 px/s²), sans plafond**. Même mécanisme avec `v = 1` (0,07 s d'immobilité) quand une bille tirée sans match borde un trou de sa couleur (0x421d74, 0x421dae).
3. **Rebond au contact** (0x42196b–0x4219e5, puis 0x40ab60) : son `BALLCLICK1` ; si le contact produit un match de profondeur d, la bille la plus avancée du segment reçoit 30 maj de recul à `max(0,5 ; 1,5 × d)` px/maj (sinon d = 0 → 0,5 px/maj) ; ce recul **pousse toute la chaîne derrière elle** et arrête le pousseur au moins 20 maj. Soit **50 px/s × 0,3 s = 15 px** sans match, **150 × d px/s × 0,3 s = 45 × d px** avec enchaînement. **Aucun recul n'est appliqué au moment du match lui-même** : notre `recoilSpeed 90 px/s × 8 ticks` n'existe pas dans l'original.

**Q5 (ZUMA).** 0x40a980 (par courbe) : si la couverture > 50 %, `zumaback` (300 maj) et `zumaslow` (1 100 maj) démarrent ensemble. Pendant le recul (0x40ab60), la **bille de tête** recule de **1 px/maj (100 px/s)** chaque maj et pousse les billes derrière elle (les trous se referment depuis l'avant, `BALLCLICK1` à chaque contact) ; le pousseur est arrêté (`courbe+0x54 ≥ 20`). Les trois compteurs sont **remis à zéro dès que la tête est à moins de 50 px** du début (0x423c73–0x423cd8). Toute bille dont la position passe **sous 1 px** est retirée de la piste (0x423b60) : hors ZUMA elle retourne dans la file d'attente, **en mode ZUMA elle est supprimée** (0x423970) — ce sont les billes qui « disparaissent ». Recul maximal 300 px en 3 s (notre version : 120 px/s × 3 s = 360 px). La génération est arrêtée et la file d'attente vidée ; aucune explosion (`destroyall` vaut 1 partout).

**Recommandation principale :** garder la consommation du projectile (demander confirmation à l'utilisateur, D-31 étant contraire à l'original) ; supprimer le son d'apparition des power-ups ; HUD : `N = vies − 1`, seuil 3, « xN » jaune `FONT_FLOAT`, clignotement 1,5 s ; chaîne : `destroyTicks 24`, attraction accélérée à partir de la fin de destruction, rebond au contact seulement, plus de recul au match ; ZUMA : 100 px/s depuis la tête, 180 ticks au plus, arrêt sous 50 px, suppression des billes sous 1 px.

## Méthode (reproductible)

1. PE interne réutilisé dans le scratchpad (`exe/inner.exe`, `exe/dis.txt` = `objdump -d -M intel`, extracteur `s03/rng.py`), cf. `05-RESEARCH.md` § Méthode. VMA = offset fichier + 0x400000. Rien n'a été copié dans le dépôt.
2. Constantes lues par `struct.unpack` : 0x54cde8 = 1,5 (double) ; 0x54c85c = 0,5 (float) ; 0x54c690 = 50,0 (double) ; 0x54c674 = 15,0 ; 0x54cb38 = 0,25 ; chaîne 0x54c93c = `"x%d"` ; 0x54ccdc = `L"%s %d"`, 0x54cccc = `"STRING_ID_LVL"`, 0x54ccbc = `L" %d-%d"`.
3. Ressources : `SOUND_*` → globales (`exe/resmap.txt` + `SOUND_BUTTON1` → 0x5a11e4) ; `IMAGE_FROG_LIVES` (0x54e088) → 0x5a1024 ; `IMAGE_MENU_BUTTON` → 0x5a11c8 ; `FONT_FLOAT` (0x54ea60) → 0x5a131c ; `FONT_MONODIGIT` → 0x5a125c ; `FONT_DIALOG` → 0x5a10c4. `resources.xml` : `FROG_LIVES` = `toadlives`, `FLOAT` = `cancunfloat14.txt`, `BALLCLICK1` = `ballclick1` volume 0,80, `BALLCLICK2` = `ballclick2`, `CHORAL1` = `choral1` volume 0,2. Images mesurées : `ToadLives.gif` 24 × 23, `gauge.gif` 62 × 18, `_Menubutton.gif` 297 × 25 (3 états de 99 px), `Menubar.jpg` 640 × 480 (ovales du haut : vert 22–125, rouge 168–230, noir 272–368, rouge 408–470, vert 518–615).
4. Fonctions lues : boucle des projectiles 0x423920 → 0x423330 ; ordre de la mise à jour d'une courbe 0x423c50 (compteurs `+0x54` arrêt du pousseur, `+0x58` zumaslow, `+0x5c` zumaback) → 0x418510 (entrée des billes en attente) → 0x408da0 (`Ball::Update` 0x401500 sur chaque bille) → 0x422090 (insertions) → **0x421800 (attraction)** → 0x418780 (pousseur) → **0x40ab60 (recul / zumaback)** → **0x423b60 (billes repassées sous 1 px)** → **0x423a10 (fin de destruction, déclenchement de l'attraction)** → 0x40ae70 (apparition des power-ups). Appelée une fois par maj et par courbe (0x428c14–0x428c27). Plus : 0x401430 / 0x401500 (power-up d'une bille), 0x41a7c0 (sons d'activation), 0x421240 (match à une jonction), 0x421d20–0x421dd2 (bille tirée sans match), 0x421e10 (impact projectile/chaîne), 0x401c70 (son anti-rafale 250 ms), 0x407400 (positionnement d'une bille), 0x405bc0 (priorité, 0 pour un indice négatif), 0x40a980 (ZUMA), 0x428a69–0x428b27 (déclenchement ZUMA), 0x4184a0 (destruction totale), 0x420398–0x4203c5 (`destroyall`), 0x40ff90 (`Board::Draw`) → 0x40fa90 (HUD), 0x41c9a6–0x41c9bd (bouton MENU), 0x401e35 (décompte de `+0x178`).

Durée : ≈ 1 h 20.

## Q1. Projectile et pièce (U34, D-31)

### Ordre de la mise à jour d'un projectile (0x423330, HAUTE)

1. Déplacement (0x401fa0 : `x += vx`, `y += vy`).
2. **Pièce** (si `plateau+0xc8 ≠ 0`) : `dx = x − pièce.x`, `dy = y − pièce.y` ; prise si `dx² + dy² < (16 + 20)²` (0x4233b6–0x4233e5 : `0x401720()` renvoie le rayon de bille 16, `+0x14` = 20). Alors :
   - compteur PIÈCES `+0x1e4 += 1` ; valeur `max(500, 100 × ⌊(cible − score_départ)/600⌋)` (200 en gauntlet) ; texte jaune `+N` police 0xb (0x423466) ; `AddScore` 0x417380 ; `SOUND_JEWEL_HIT` (`coingrab`) ;
   - animation de prise `+0xdc = 1`, position mémorisée `+0xd4/+0xd8` ; **10 étincelles** à 0°, 36°, … 324° (boucle `edi += 360` jusqu'à 3 600, 0x4235b4–0x423696) ;
   - `plateau+0xc8 = 0` (plus de pièce) ;
   - **`projectile->vtable[0](1)`** (0x4236a9–0x4236af : destructeur avec libération) puis **retrait du nœud** de la liste des projectiles `plateau+0x288` (0x4236e2–0x4236eb) ; `return`.
3. Sinon, pour chaque courbe, `0x421e10(projectile)` (impact et début d'insertion) ; si vrai, le nœud est retiré sans destruction (le projectile passe à la courbe) (0x42374f–0x423871).
4. Sinon, hors écran → `0x401ac0` puis destructeur et retrait (0x4237a9–0x4238fd).

**Conclusion :** une pièce touchée **consomme** le projectile ; il ne poursuit pas sa course et ne s'insère jamais. Le rayon de prise est **36 px** centre-à-centre (notre `coinRadius: 18`).

**Recommandation :** ne pas implémenter D-31 tel qu'écrit. Présenter le constat à l'utilisateur (le comportement actuel est l'original) ; s'il maintient sa demande, la traiter comme **déviation volontaire** documentée dans les notes de version (projectile non détruit, pièce prise au passage). Indépendamment : `coinRadius: 36` (la prise est plus facile dans l'original) — à confirmer avec l'utilisateur car cela rend les pièces plus « gourmandes » vis-à-vis des tirs vers la chaîne.

**Repli si l'utilisateur maintient D-31 :** à la prise, ne pas retirer le projectile ; il continue avec la même vitesse et suit le chemin normal (impact chaîne ou sortie) ; un test `r219` verrouille les deux variantes derrière un drapeau de configuration (`coinConsumesShot`, défaut `true` = original).

## Q2. Son à l'apparition d'un power-up (U35, D-32)

### Chemin d'apparition (HAUTE)

- **0x40ae70** (chaque maj, par courbe, si la chaîne n'est pas vide) : pour chaque type `t = 0..3` (0 bombe, 1 ralentir, 2 précision, 3 recul — correspondance établie par les sons d'activation de 0x41a7c0), `freq = réglages+0x64+4t` (`bombfreq`, `slowfreq`, `accfreq`, `backfreq`, tous = `powerfreq` du niveau, défaut 3 000) ; si `freq > 0`, `Rand() % freq == 0` et `maj − dernier[t] > freq` (`courbe+0x44+4t`) → `0x408e90(t)` puis `dernier[t] = maj`.
- **0x408e90** : une bille tirée au hasard dans la chaîne (`Rand() % n`) ; si elle n'a ni power-up ni power-up en attente (`+0x64 == 4` et `+0x68 == 4`) → `Ball::SetPower(t, différé = 1)`.
- **0x401430** `SetPower(type, différé)` : différé → `+0x68 = type`, `+0x58 = 100` (**1 s d'attente**) ; immédiat → `+0x64 = type`.
- **0x401500** `Ball::Update` : à la fin des 100 maj, `+0x64 = +0x68` et, si c'est un vrai power-up, **durée de vie `+0x54 = 2 000` maj (20 s)** ; à l'expiration, `SetPower(4 = aucun, différé = 1)` → 1 s de transition puis plus rien.

Aucune de ces fonctions, ni leurs appelants (0x408da0, 0x40aecd), ne lit une globale `SOUND_*`. Inventaire des lectures de toutes les globales de sons : `BUTTON1/2` (widgets), `BALLCLICK1` (0x40acc1, 0x418a0d, 0x42196b), `BALLCLICK2` (0x42203c), `BALLFIRE` (0x40c33a), `EXTRA_LIFE`, `JEWEL_*`, `TRAIL_LIGHT*`, `WARNING`, `ROLLING`, `EXPLODE` / `BACKWARDS_BALL` / `SLOWDOWN_BALL` / `ACCURACY_BALL` (activation, 0x41a7fa–0x41a852), `GAP_BONUS`, `CHAIN_BONUS`, `BALLDESTROYED1..5`, `COMBO`, `BONUS_EXPLOSION`, `BAR_FULL`, `EARTHQUAKE`, `FROGLAND`, `GAME_START`, `TEMPLE_COMPLETE`, `POP` / `LOST_LIFE` / `GAME_OVER` (0x431bba–0x431beb), `STAGE_COMPLETE`, `LEVEL_UP`, `UFO` (0x43cd98). **`SOUND_CHORAL1` n'a aucun lecteur.**

**Conclusion [HAUTE sur l'absence d'appel dans ce binaire] :** l'original ne joue **aucun son** quand une bille devient un power-up, ni quand le power-up expire. Notre `power-spawn → powerup` (= `jewelappear`, le son des pièces, `tools/import-original.mjs:25`) explique que l'utilisateur l'entende « comme une pièce ».

**Recommandation :** retirer le son de `power-spawn` (fidèle) et le signaler à l'utilisateur. Ce qu'il a perçu comme un « son particulier » est vraisemblablement le son d'**activation** (`slowdown1`, `reverse1`, `accuracy3`, `bombexplode`) ou la transition visuelle d'une seconde (non analysée).
**Repli [ASSUMED] si l'utilisateur maintient qu'un son existe :** `choral1` (`choral.m4a` du pack, volume 0,2 de `resources.xml`), seul échantillon déclaré et inutilisé ; à jouer au passage de l'attente à l'actif (1 s après l'apparition), pas à l'apparition.

### Constat annexe : modèle d'apparition (hors périmètre, HAUTE)

Notre `maybeSpawnPower` (garde 150 ticks, un seul power-up à la fois, visible 480 ticks = 8 s) diffère de l'original : **un tirage indépendant par type** (`1/powerfreq` par maj, au plus une apparition de ce type tous les `powerfreq` maj), **plusieurs power-ups simultanés** possibles (un par bille), **1 s d'attente** avant d'être actif, **20 s** de vie. À noter pour une phase ultérieure ; pas de changement demandé ici.

## Q3. Compteur de vies du HUD (U36, D-33)

### Dessin (0x40fa90, appelé par `Board::Draw` 0x40ff90 sans translation, HAUTE)

```
police = FONT_DIALOG
si (plateau+0x178 & 0x10) == 0 :                // clignotement après une vie gagnée
    N = vies(+0xec) − 1 ; si état(+0xf4) == 2 : N += 1
    si gauntlet : texte STRING_ID_SURVIVAL centré sur x 74, y 20
    sinon :
        icônes = N ; plus = faux
        si N > 3 : plus = vrai ; icônes = 1
        pour i < icônes : DrawImage(IMAGE_FROG_LIVES, 28 + 35·i, 3)
        si plus : couleur 0xFFFF00 ; police FONT_FLOAT ; DrawString("x%d" % N, 28 + 35 + 4 = 67, 22) ; police FONT_DIALOG
couleur 0xFFFF00 ; DrawString(libellé de niveau +0x224, 200 − largeur/2, 15)      // L"%s %d" ou STRING_ID_LVL + L" %d-%d"
police FONT_MONODIGIT ; DrawString(score +0xe8 formaté, 360 − largeur, 17)
jauge : IMAGE ZUMA_BAR / ZUMA_BAR_DONE en (409, 2), largeur = (+0x16c × w) >> 8 ; clignote pendant le compteur ZUMA (+0x174 & 0x20)
```

Constantes : 0x40fbe7–0x40fc29 (`cmp eax, 3`, `[ebp−0x70] = 0x1c`, `+= 0x23`, `push 3`) ; 0x40fc30–0x40fca2 (0xffff00, `FONT_FLOAT` 0x5a131c, `"x%d"` 0x54c93c, `x + 4`, `push 0x16`) ; bouton MENU `Resize(0x207, 3, 297/3, h)` (0x41c9a6–0x41c9bd) ; `plateau+0x178 = 150` à chaque vie gagnée (0x4173e8), décrémenté chaque maj (0x401e35–0x401e46) → **clignotement 1,5 s**, alternance de 16 maj (0,16 s). Vies initiales 3 en aventure (0x420187 : `2 × (non gauntlet) + 1`).

**Sens de `état == 2` [MOYENNE] :** état du plateau hors jeu (probablement entre deux vies / dialogue) ; la grenouille « en jeu » est alors comptée. En jeu normal : **vies − 1**.

### Écarts avec notre HUD (`src/render.ts` 669–705)

| Élément | Original | Nous |
|---|---|---|
| Grenouilles | `vies − 1`, x 28 + 35·i, y 3, taille native 24 × 23, ovale vert gauche | `vies`, x 172 + 20·i, y 6, réduites à 20 × 19, ovale rouge gauche |
| Au-delà de 3 | 1 grenouille + « x5 » jaune `FONT_FLOAT` en (67, 22) | 3 grenouilles + « +N » |
| Clignotement après vie gagnée | 1,5 s, 0,16 s / 0,16 s | aucun |
| Libellé de niveau | centré x 200 (ovale rouge gauche), jaune | centré x 440 |
| Score | `FONT_MONODIGIT`, aligné à droite x 360, y 17 | aligné à droite x 362, y 18 (conforme) |
| Jauge | (409, 2), ovale rouge droit | (536, 8) |
| Bouton MENU | x 519, y 3, ovale vert droit | centré x 74, ovale vert gauche |

**Recommandation D-33 :** `lifeIcons(lives)` → `reserve = max(0, lives − 1)` ; `reserve ≤ 3` → `reserve` icônes, sinon 1 icône + `x${reserve}` ; couleur `#ffff00`, police `cancunfloat14` (police bitmap du pack si importée, sinon `font(14)`), position relative à la première icône : texte à `iconX + 39`, ligne de base `y = 22` ; icônes espacées de 35 px à leur taille native ; clignotement 1,5 s (`extra-life` → `blinkUntil = tick + 90`, masquer quand `⌊(restant × 100/60)⌋ & 16`). **La position absolue suppose de permuter les ovales du HUD** (vies à gauche, MENU à droite, niveau et jauge échangés) : c'est un changement de mise en page qui dépasse D-33 ; le présenter à l'utilisateur avant de l'exécuter.
**Repli si l'utilisateur garde la disposition actuelle :** dans l'ovale rouge (168–230, 62 px), 3 icônes ne tiennent qu'à l'échelle réduite actuelle ; garder `172 + 20·i` et remplacer « +N » par « xN » après **une** icône (x 172, texte à 172 + 24, jaune, `font(14)`), seuil `vies − 1 > 3`.

## Q4. Recul et comblement des brèches (U37, D-34)

### Réglages cités par l'UAT : sans rapport (HAUTE)

- `mergespeed` (réglages +0x28) → `projectile+0x90` (0x422007–0x42200f), vitesse d'**ouverture de l'insertion** (`+0x8c += +0x90` jusqu'à 1, 0x401fc6–0x401feb) — c'est notre `mergeTicks`.
- `maxspeed` (+0x60) → plafond de `speed + cumul accrate` du pousseur (0x4187a2–0x4187d7).
- `slowspeed` (+0x40) → seulement `slowfactor = speed / slowspeed` au chargement (0x42ad8b, spike 01).

### Champs de bille utiles

`+0xc` position (px le long de la courbe) ; `+0x30` « en contact avec la suivante » ; `+0x38` compteur de destruction ; `+0x3c` compteur d'attraction `v` ; `+0x40` / `+0x44` maj restantes / vitesse de recul (px/maj) ; `+0x48` profondeur d'enchaînement. Liste de la courbe triée de l'arrière (pousseur) vers l'avant (crâne).

### 1. Destruction : 40 maj (0x423a10, HAUTE)

Chaque maj, le compteur `+0x38` des billes en destruction augmente de 1 (0x423b31–0x423b3b) ; à **40** (0x423a62 `cmp eax, 0x28`) la bille est retirée. Notre `destroyTicks: 40` (0,67 s) devrait valoir **24** ticks (0,4 s).

### 2. Attraction (0x423a10 → 0x421800, HAUTE)

- **Déclenchement après un match** (0x423a6b–0x423aa8) : quand une bille détruite atteint 40, si la bille suivante (avant du trou) existe et n'est pas en destruction, si la précédente (arrière du trou) existe et si **les deux ont la même couleur** → `suivante.v = 10`, `suivante.profondeur = détruite.profondeur + 1` (+0x4c recopié). Aucune vérification ultérieure de couleur.
- **Déclenchement après un tir sans match** (0x421d55–0x421dae) : la bille posée borde un trou dont l'autre bord a sa couleur → `v = 1` sur la bille posée (trou derrière) ou sur la suivante (trou devant, si elle n'attire pas déjà).
- **Mouvement** (0x421800, chaque maj) : pour chaque bille de tête de segment avec `v > 0`, le segment entier (elle et les suivantes en contact) recule de `⌊v / 8⌋` px, puis `v += 1`. **Pas de plafond.**
- **Contact** (0x421928–0x4219f1) : quand `bille_arrière_du_trou.pos ≥ tête_du_segment.pos − 32`, la bille arrière est placée au contact, `BALLCLICK1` (anti-rafale 250 ms, 0x401c70), `v = 0`, test de match à la jonction (0x421240). Sans match, la profondeur est remise à 0.

Profil (départ `v = 10`, 1 maj = 10 ms) :

| Trou | Durée | Vitesse finale |
|---|---|---|
| 32 px (1 bille) | 180 ms | 300 px/s |
| 64 px | 270 ms | 400 px/s |
| 96 px (3 billes) | 340 ms | 500 px/s |
| 128 px | 400 ms | 600 px/s |
| 160 px | 450 ms | 600 px/s |
| 320 px | 660 ms | 900 px/s |

Avec `v = 1` (tir sans match) : 260 ms pour 32 px, 430 ms pour 96 px. Notre attraction : 240 px/s constants, **démarrée dès le match** (les billes en destruction sont exclues de `alive()`), donc pendant la destruction.

### 3. Rebond au contact (0x4219a0–0x4219e5 puis 0x40ab60, HAUTE)

Au contact, si la bille **la plus avancée du segment arrivé** n'a pas déjà un recul (`+0x40 == 0`) : `+0x40 = 30` maj, `+0x44 = max(0,5 ; 1,5 × profondeur)` px/maj (0x54cde8 = 1,5 ; 0x54c85c = 0,5). Puis chaque maj (0x40ab60), de l'avant vers l'arrière : la bille recule de `+0x44` ; les billes derrière elle **en contact** reculent du même pas ; celles qui ne l'étaient pas mais sont rattrapées sont poussées au contact (`BALLCLICK1`, `+0x30 = 1`). Si quelque chose a bougé : `courbe+0x6c = 1`, **arrêt du pousseur ≥ 20 maj** (`courbe+0x54`, 0x40ad04–0x40ad15) ; à son retour à 0 la vitesse du pousseur repart de 0 (0x423caa, rampe 0,005 px/maj²).

| Contact | Vitesse | Durée | Recul de toute la chaîne |
|---|---|---|---|
| sans match (2 billes de même couleur) | 50 px/s | 0,3 s | 15 px |
| enchaînement de profondeur 1 | 150 px/s | 0,3 s | 45 px |
| profondeur 2 | 300 px/s | 0,3 s | 90 px |
| profondeur 3 | 450 px/s | 0,3 s | 135 px |

`+0x40` n'est écrit qu'en 0x4219a6 (30) et 0x40abde (1, ZUMA) : **il n'y a pas de recul au moment d'un match**. La « secousse » de l'original vient du contact.

### Son de contact et son d'impact (HAUTE — corrige notre correspondance)

- **Contact** (pousseur qui rattrape un segment 0x418a0d, attraction 0x42196b, poussée du recul 0x40acc1) : `SOUND_BALLCLICK1` = **`ballclick1`**, volume 0,80, **au plus un toutes les 250 ms** (0x401c70 : horloge en ms − `plateau+0x114` ≥ 250).
- **Impact d'un projectile sur la chaîne** (0x421e10, 0x42203c) : `SOUND_BALLCLICK2` = **`ballclick2`**, sans anti-rafale.
- Notre `tools/import-original.mjs:21` fait l'inverse (`insert: 'ballclick1'`, `merge: 'ballclick2'`).

### Recommandation D-34 (60 Hz, 1 tick = 5/3 maj)

```ts
destroyTicks: 24,                 // 40 maj (0x423a62)
// attractSpeed supprimé → attraction par segment, compteur en maj :
attractStartAfterMatch: 10,       // v initial (0x423a95)
attractStartAfterShot: 1,         // v initial (0x421d74 / 0x421dae)
// chaque tick : majClock += 100/60 ; tant que majClock ≥ 1 : d += Math.floor(v / 8) ; v++ ; majClock--
// (équivalent continu : vitesse = 100 × ⌊v/8⌋ px/s, v(t) = v0 + 100·t)
// recoilSpeed / recoilTicks au match : supprimés
contactRecoilTicks: 18,           // 30 maj
contactRecoilMin: 50,             // px/s (0,5 px/maj)
contactRecoilPerDepth: 150,       // px/s par niveau d'enchaînement (1,5 px/maj)
contactPusherStopTicks: 12,       // 20 maj, vitesse du pousseur remise à 0 ensuite
```

- L'attraction démarre **à la fin de la destruction** (pas au match) et seulement si les deux bords du trou ont la même couleur à cet instant ; elle continue jusqu'au contact sans revérifier la couleur.
- Le rebond s'applique à la bille la plus avancée du segment arrivé et pousse toute la chaîne derrière ; le pousseur est bloqué pendant le rebond et 12 ticks après.
- Sons : `insert` → `ballclick2`, `merge` (contact) → `ballclick1` gain 0,8, anti-rafale 250 ms.
- Tests `r219` : profil d'attraction (32 px en 11 ticks ± 1, 96 px en 20–21 ticks), pas de mouvement arrière au tick du match, rebond 45 px pour une profondeur 1, `destroyTicks` 24.

**Repli (si le modèle par segment est trop invasif) :** attraction à vitesse `125 + 1 250·t` px/s depuis la fin de destruction (t en s), rebond 18 ticks à `max(50, 150·d)` px/s sur la chaîne entière ; c'est déjà plus proche que le repli de D-34 (×2,5 / 0 → 600 px/s), qu'il remplace.

## Q5. Recul ZUMA en fin de niveau (U38, D-35)

### Déclenchement (0x428a69–0x428b27, HAUTE)

Quand la jauge est pleine (`+0x16c == 0x100`) et `score ≥ cible` : compteur d'affichage `+0x174 = 224`, `+0x108 = 50`, `SOUND_BAR_FULL` (`chant4`), `plateau+0x181 = 1`, puis pour chaque courbe `0x40a980(1)` ; si `plateau+0x180 == 0`, toutes les billes explosent (0x4184a0) avec `SOUND_EXPLODE`. `plateau+0x180` vaut 0 seulement si une courbe a `destroyall = 0` (0x420398–0x4203c5, octet de réglages +0x7a, défaut 1) ; **aucun niveau de `levels.xml` ne le définit** → pas d'explosion en aventure.

### Par courbe (0x40a980, HAUTE)

- Si la couverture (tête en % de la piste, 0x40a900) **> 50** : `courbe+0x5c = zumaback` (300), `courbe+0x58 = zumaslow` (1 100) — les deux démarrent **au même instant**.
- `courbe+0x7d = 1` : plus de génération (0x41852c) ; la file d'attente (billes pas encore entrées, liste +0x38) est **vidée** (0x40a9b3–0x40aa20).

### Recul (0x40ab60, HAUTE)

Tant que `courbe+0x5c > 0` (décrémenté chaque maj, 0x423cc7) : la **bille de tête** (la plus avancée) reçoit `+0x44 = 1,0`, `+0x40 = 1` → recul de **1 px/maj = 100 px/s**, vitesse constante ; elle pousse les billes derrière (même pas si en contact, mise au contact sinon, `BALLCLICK1`) : un trou se referme par l'avant avant que le segment arrière ne bouge. Pousseur arrêté (`+0x54 ≥ 20`). Ralenti `× 0,25` (0x4187dd) pendant `zumaslow` maj, recul compris.

### Arrêt anticipé (0x423c50–0x423cd8, HAUTE)

Si la tête est à **moins de 50 px** du début de la piste (0x54c690 = 50,0), ou si la courbe est vide, les compteurs `+0x54`, `+0x58` et `+0x5c` sont **remis à 0** : fin du recul, du ralenti et de l'arrêt du pousseur.

### Billes repassant l'entrée (0x423b60 → 0x423970, HAUTE)

Chaque maj, depuis la bille arrière et tant que sa position est **< 1 px** : la bille est retirée de la piste (0x40d240, 0x4087a0) et du décompte de couleurs (0x4174e0(bille, 0)) ; puis :
- si elle était en destruction **ou si la courbe est en mode ZUMA (`+0x7d`)** → **supprimée** (0x423970 : fin des insertions qui la visent, `vtable[0](1)`) — sans points, sans effet, sans son ;
- sinon (recul du power-up RECUL, rebond) → remise **en tête de la file d'attente** ; elle rentrera plus tard (0x418510).

C'est l'explication de « certaines disparaissent » : en fin de niveau, les billes que le recul fait sortir par l'entrée sont perdues. Les billes à position négative ne sont jamais dessinées longtemps (0x407400 extrapole avant le premier point, priorité 0) puisqu'elles sont retirées dès `< 1`.

### Bilan chiffré

Recul maximal **300 px en 3 s** (moins si la tête atteint 50 px), à 100 px/s ; nous : 120 px/s × 180 ticks = 360 px pour toute la chaîne d'un bloc, billes conservées sous l'entrée. L'utilisateur trouve notre recul « trop loin » (cohérent : 360 > 300 et nos billes reviennent) mais aussi « plus rapide » dans l'original : les chiffres de l'exécutable ne le confirment pas (100 < 120 px/s) — l'impression peut venir du rebond et de l'attraction plus vifs (Q4) ; à vérifier en UAT.

### Recommandation D-35

```ts
zumaBackTicks: 180,          // 300 maj, inchangé
zumaBackSpeed: 100,          // px/s, distinct de backwardsSpeed (power-up)
zumaBackMinHead: 50,         // px : sous ce seuil, fin du recul, du ralenti et de l'arrêt du pousseur
// pendant le recul : la tête recule de 100 px/s et pousse les billes derrière (contacts) ; pousseur bloqué
// mode ZUMA : toute bille vivante dont s < 1 est supprimée (pas de score, pas d'événement de destruction ; éventuellement 'ball-lost' pour l'audio : aucun son dans l'original)
// hors ZUMA : comportement actuel (billes à s < 0 conservées) — équivalent à la file d'attente de l'original
```

Tests `r219` : recul de 100 px/s depuis la tête, durée 180 ticks au plus, arrêt quand la tête < 50 px, suppression des billes passées sous 1 px en mode ZUMA et pas hors ZUMA, pas de recul ni de ralenti si couverture ≤ 50 %.

**Repli :** recul de toute la chaîne d'un bloc à 100 px/s (sans fermeture des trous par l'avant), plafonné à 180 ticks, arrêt sous 50 px, suppression des billes passées sous 0 en mode ZUMA.

## Non établi / replis

| Point | Statut | Repli |
|---|---|---|
| Effet visuel de la seconde d'attente d'un power-up (`+0x58`) | non analysé (dessin de la bille) | garder notre apparition actuelle |
| Sens exact de `plateau+0xf4 == 2` dans le compte des vies | MOYENNE (état hors jeu) | afficher `vies − 1` en jeu |
| Police bitmap `cancunfloat14` disponible dans le pack | non vérifié côté importateur | `font(14)` jaune |
| Pourquoi l'utilisateur entend un son à l'apparition d'un power-up | aucun appel dans ce binaire | supprimer le son ; `choral1` à 0,2 si l'utilisateur insiste [ASSUMED] |
| Contradiction D-31 / exécutable | établi (consommation) | décision utilisateur ; drapeau `coinConsumesShot` |
| Impression « recul ZUMA plus rapide » | non confirmée (100 px/s) | UAT après Q4 |

## Assumptions Log

| # | Hypothèse | Section | Risque si faux |
|---|---|---|---|
| A1 | `vtable[0](1)` du projectile = destructeur avec libération (motif MSVC, même appel que pour une sortie d'écran) | Q1 | très faible : le nœud est de toute façon retiré de la liste des projectiles |
| A2 | Le « son particulier » perçu par l'utilisateur n'est pas un son d'apparition | Q2 | l'utilisateur pourrait se souvenir d'une autre version (Xbox, Zuma's Revenge) |
| A3 | `choral1` comme repli de son d'apparition | Q2 | son inadapté ; repli seulement sur demande |
| A4 | `état == 2` = plateau hors jeu (la grenouille en jeu est comptée) | Q3 | décalage d'une icône dans un état transitoire |
| A5 | Permuter les ovales du HUD est souhaité par l'utilisateur | Q3 | changement visible non demandé : à confirmer avant exécution |

## Validation Architecture

| Propriété | Valeur |
|---|---|
| Framework | `node:test` + `node:assert/strict` sur `.compiled/` |
| Commande rapide | `node tools/build.mjs && node --test tests/r219.test.mjs` |
| Suite complète | `npm test` (build, tous les `tests/*.test.mjs`, `guard`) |

| Décision | Comportement | Type | Fichier |
|---|---|---|---|
| D-31 | projectile consommé à la prise (ou drapeau) ; rayon 36 px | unitaire moteur | `tests/r219.test.mjs` ❌ Wave 0 |
| D-32 | `power-spawn` ne mappe plus aucun son ; `insert` → `ballclick2`, `merge` → `ballclick1` | unitaire `feedback` | `tests/r219-presentation.test.mjs` ❌ Wave 0 |
| D-33 | `lifeIcons` : `vies − 1`, seuil 3, « xN » | unitaire `render` (fonction pure) | `tests/r219-presentation.test.mjs` ❌ Wave 0 |
| D-34 | `destroyTicks` 24 ; attraction accélérée depuis la fin de destruction ; pas de recul au match ; rebond au contact | unitaire moteur (fixtures de chaîne) | `tests/r219.test.mjs` ❌ Wave 0 |
| D-35 | recul 100 px/s depuis la tête, arrêt < 50 px, suppression des billes < 1 px en ZUMA | unitaire moteur | `tests/r219.test.mjs` ❌ Wave 0 |

Les tests existants qui fixent `recoilSpeed`, `attractSpeed`, `destroyTicks: 40` ou le mapping `ballclick*` devront être mis à jour (rechercher ces noms dans `tests/`).

## Security Domain

Pas de surface nouvelle : changements internes au moteur et au rendu, aucune entrée externe, aucune ressource originale ajoutée au dépôt (`npm run guard` inchangé).

## Sources

### Primaires (HAUTE)
- PE interne de `private_assets/original/Zuma.exe` (offset 0x1c51a2), désassemblage `objdump -d -M intel` : fonctions et plages citées en § Méthode et dans chaque question.
- `private_assets/original/properties/resources.xml` (identifiants, chemins et volumes des sons, polices, images).
- `private_assets/original/images/Menubar.jpg`, `ToadLives.gif`, `gauge.gif`, `_Menubutton.gif` (dimensions et ovales mesurés).
- `private_assets/original/levels/levels.xml` (UTF-16 : aucun attribut `destroyall`).

### Code du projet comparé
- `src/core.ts` (config 405–446, `moveChain` 1027–1100, `destroyRun` 1182–1190, `maybeSpawnPower` 1274–1290), `src/render.ts` (HUD 669–705, `lifeIcons` 880), `src/feedback.ts` 18–35, `tools/import-original.mjs` 21–25.

## Metadata

**Confiance :** Q1 HAUTE ; Q2 HAUTE (absence d'appel), BASSE (origine du souvenir de l'utilisateur) ; Q3 HAUTE (coordonnées, police, seuil), MOYENNE (`état == 2`) ; Q4 HAUTE ; Q5 HAUTE.
**Date :** 2026-10-11 — **valide** tant que l'exécutable de référence ne change pas.
