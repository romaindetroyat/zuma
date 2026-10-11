# Phase 5 : Règles originales complètes — Recherche 02 (spike ciblé : bonus de saut, score des matches, STATS)

**Recherché le :** 2026-10-10
**Domaine :** scoring de Zuma Deluxe (PopCap) — bonus de saut (gap), points par match, combo (réaction en chaîne), enchaînement (tirs réussis consécutifs), décompte du bonus dans le dialogue STATS, géométrie du dialogue
**Confiance globale :** HAUTE pour les formules et constantes lues dans le code (adresses citées) ; MOYENNE pour l'unité de la largeur de trou et la sémantique du drapeau « mode » ; BASSE pour la géométrie du dialogue (fonction de dessin lue partiellement).
**Complète :** `05-RESEARCH.md` (même méthode, même PE interne). Ne remplace rien ; les sections 7–8 du premier document restent valables, sauf la lecture du « mode rapide » (corrigée en Q3).

## Résumé

Le bonus de saut n'est **pas** un montant fixe par insertion : il est calculé à l'insertion (0x421cac–0x421d2b) à partir de la **largeur minimale des trous traversés** (0x40a810), stocké sur la bille (`bille+0x5c` points, `bille+0x5e` nombre de trous) et **payé seulement si cette bille participe à un match** (0x421240 additionne `bille+0x5c` sur toutes les billes du groupe, 0x420b80 l'ajoute au score). Formule : `max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀) × nTrous` (base 250 au lieu de 500 quand le drapeau `plateau+0x187` est levé — mode gauntlet). Un tir à travers un trou **sans match** ne rapporte rien (0x421dbc : le bonus est remis à 0), sauf si la bille se pose contre une bille de même couleur : le bonus reste armé et sera payé si un match l'emporte plus tard.

Le score d'un match (0x420b80) = `10 × nBilles + 100 × combo + bonusSaut` (+ `(chain + 5) × 10` si `chain ≥ 5` et `combo = 0`), avec `combo` = profondeur de réaction en chaîne (0 pour le tir direct) et `chain` = nombre de tirs réussis consécutifs. Les textes : « +N » dans la couleur de la bille (montant total), « COMBO x{combo+1} », « BONUS SAUT / BONUS DOUBLE SAUT / BONUS TRIPLE SAUT » (sans montant), « ENCHAÎNEMENT x{chain} ». **Nos libellés sont inversés** par rapport à l'original (`main.ts` affiche « ENCHAÎNEMENT » pour la réaction en chaîne et « COMBO » pour les tirs consécutifs).

Le « mode rapide » du STATS (2 500 par pas) n'est **pas** déclenché par un clic, une touche ou le temps : `plateau+0x186` est un drapeau de mode de jeu (persisté dans la sauvegarde, jamais levé en aventure). En aventure le décompte est toujours +100 toutes les 10 maj ; la seule « accélération » est l'appel `0x440ac0` (solde instantané du bonus) depuis la routine de sauvegarde 0x41d2b0 (quitter pendant le STATS).

**Recommandation principale :** remplacer `100 × gaps` à l'insertion par le calcul original (largeur min → points, ×nTrous), stocké sur la bille et crédité au match ; aligner `destroyRun`/`settle` sur `10n + 100·combo + saut (+ enchaînement)` ; intervertir les libellés COMBO/ENCHAÎNEMENT ; ne pas implémenter d'accélération du décompte STATS.

## Méthode (reproductible)

1. PE interne réutilisé dans le scratchpad (`inner.exe`, `dis.txt` = `objdump -d -M intel`), cf. `05-RESEARCH.md` § Méthode. Rien n'a été copié dans le dépôt.
2. Chaînes `.rdata` : `STRING_ID_CHAIN_BONUS` 0x54cd4c, `STRING_ID_GAP_BONUS` 0x54cd64, `STRING_ID_DOUBLE_GAP_BONUS` 0x54cd78, `STRING_ID_TRIPLE_GAP_BONUS` 0x54cd94, `STRING_ID_COMBO` 0x54cdc4, formats `L" x%d"` 0x54cdb8 et `L"+%d"` 0x54cdd4, flottants 2,0 (0x54cdb4), 3,0 (0x54cdb0), doubles 0,4 (0x54cde0), 0,2 (0x54c728), 1,5 (0x54cde8). Identifiants de sons : `SOUND_GAP_BONUS` → `ds:0x5a12e4`, `SOUND_CHAIN_BONUS` → `0x5a12e8`, `SOUND_COMBO` → `0x5a1074` ; `resources.xml` : `GAP_BONUS` = `gapbonus1`, `CHAIN_BONUS` = `chain1`, `COMBO` = `chime1`.
3. Fonctions : insertion/test de match 0x421c00–0x421dff ; match d'un groupe 0x421240 (appelle 0x41aa20 par bille, puis 0x420b80) ; score + textes + sons de bonus 0x420b80–0x421231 ; remise à zéro de l'enchaînement 0x401ac0 ; `AddScore` 0x417380 ; largeur minimale des trous 0x40a810 ; dialogue STATS : mise à jour 0x440b00, solde 0x440ac0, constructeur 0x4478xx (lignes 0x44795f–0x447cd4), dessin 0x447d40–0x449258.
4. Chaînes françaises lues dans `private_assets/pack/strings.json` (`COMBO` = « COMBO », `CHAIN_BONUS` = « ENCHAÎNEMENT », `GAP_BONUS` = « BONUS SAUT », `DOUBLE_GAP_BONUS` = « BONUS DOUBLE SAUT », `TRIPLE_GAP_BONUS` = « BONUS TRIPLE SAUT », `BONUS` = « BONUS », `WINNING_TOTALS` = « TOTAL DES VICTOIRES »).

Durée : ≈ 1 h. Ce qui n'a pas été établi est listé en « Non établi / replis ».

## Q1. Bonus de saut (gap)

### Calcul à l'insertion (0x421cac–0x421d2b, HAUTE)

```
w      = 0x40a810(projectile)             ; largeur MINIMALE parmi les trous traversés (liste projectile+0x94, nœud+0xc), 0 si aucun trou
nTrous = projectile+0x9c                  ; taille de cette liste
si w > 0 :
    w'   = max(0, w − 64)                 ; 0x421cb3 : sub eax,0x40 ; jns / sinon 0
    base = (plateau+0x187 ≠ 0) ? 250 : 500   ; 0x421cc2–0x421cdc (0x1f4 − 0xfa)
    pts  = base × (300 − w') / 300        ; 0x421ccd (0x12c), division par 300 (magique 0x1b4e81b5 >> 5)
    pts  = ⌊pts / 10⌋ × 10                ; 0x421cf6–0x421d0a
    si pts < 10 : pts = 10                ; 0x421d0c–0x421d16 (couvre aussi w' > 300 → négatif → 10)
    si nTrous > 1 : pts ×= nTrous         ; 0x421d1c–0x421d24
    bille+0x5c = pts ; bille+0x5e = nTrous   ; 0x421d27–0x421d2b (mots 16 bits)
```

Barème résultant (aventure, base 500), **par trou** avant multiplication :

| Largeur min du trou w (px) | ≤ 64 | 100 | 150 | 200 | 250 | 300 | 364 et plus |
|---|---|---|---|---|---|---|---|
| points | 500 | 440 | 350 | 270 | 190 | 100 | 10 |

Puis × 2 pour un double saut, × 3 pour un triple (le multiplicateur s'applique au score du trou **le plus étroit**, pas à la somme).

Unité de `w` : MOYENNE. Le code ne la convertit pas ; les seuils 64 (≈ 2 diamètres de bille de 32 px) et 300 sont cohérents avec des pixels le long de la courbe, comme toutes les autres distances lues dans `05-RESEARCH.md` (`danger` 600, `slowdistance` 500). La fonction qui remplit la liste des trous (largeur à `nœud+0xc`, clé courbe à `nœud+0x10`, suppression par courbe 0x40a770) n'a pas été localisée dans le temps imparti : on sait seulement que `0x40a810` prend le **minimum** des largeurs (0x40a852–0x40a861).

### Quand le bonus est payé (HAUTE)

- Après l'insertion, `plateau+0x188` (enchaînement) est incrémenté puis 0x421240 teste le match (0x421d2f–0x421d43).
- **Match** : 0x421240 parcourt le groupe, somme `bille+0x5c` de toutes ses billes (0x4212f0–0x4212f8, `[ebp-0x8]`), garde le **max** de `bille+0x5e` (nombre de trous, 0x4212f4–0x4212ff), remet les deux champs à 0, puis appelle `0x420b80(bille, nBilles, combo, sommeSaut, maxTrous)`.
- **Pas de match, bille posée contre une bille de même couleur** (0x421d59–0x421d81, 0x421d8b–0x421db9) : `bille+0x32 = 1` (bille « en attente »), `+0x3c = 1`, l'enchaînement n'est pas remis à zéro et **`bille+0x5c` est conservé** : si cette bille est détruite plus tard par une réaction en chaîne ou un match ultérieur, son bonus de saut est payé à ce moment-là (et son `+0x32` fait `+1` sur l'enchaînement, 0x4212d4–0x4212e1).
- **Pas de match, aucun voisin de même couleur** (0x421dbc–0x421dd2) : `0x401ac0` (enchaînement → 0, après enregistrement du record `+0x1f8/+0x1fc`) puis `bille+0x5c = bille+0x5e = 0` : **un tir à travers un trou qui ne fait rien ne rapporte rien**.

### Affichage et sons dans 0x420b80 (HAUTE)

Arguments : `[ebp+0x8]` bille, `[ebp+0xc]` nBilles, `[ebp+0x10]` combo, `[ebp+0x14]` points de saut, `[ebp+0x18]` nombre de trous.

- Total = `10 × (nBilles + 10 × combo) + saut` (0x420bc3–0x420bdc) ; `+ (chain + 5) × 10` si `plateau+0x188 > 4` **et** `combo = 0` (0x420bcf–0x420c08, aussi ajouté à `+0x18c`, cumul enchaînement). `plateau+0x26c += total` (cumul de la réaction en chaîne), `AddScore(total)` (0x420c19).
- Statistiques : `+0x1ec += 1` si combo > 0 (ligne COMBOS du STATS), `+0x1e8 += 1` si saut > 0 (ligne SAUTS) — **un** par match, pas par trou (0x420c1f–0x420c3a).
- Textes (tous police 0xb, couleur = table `0x587408[couleur de la bille]`, empilés par 0x412b10 puis attachés à l'effet d'explosion 0x41daa0 à la position de la bille) :
  1. « +{total} » (format 0x54cdd4) — toujours ; le montant **inclut** saut et enchaînement.
  2. « COMBO x{combo+1} » si combo > 0 (0x420ca0–0x420ce0, `STRING_ID_COMBO` + `L" x%d"`).
  3. Si saut > 0 : « BONUS TRIPLE SAUT » si trous > 2, « BONUS DOUBLE SAUT » si trous = 2, « BONUS SAUT » sinon (0x420da8–0x420ec4). **Aucun montant** dans ce texte (le `+%d` de 0x54cdba n'est pas utilisé ici ; le gain est dans le « +N »).
  4. « ENCHAÎNEMENT x{chain} » si le bonus d'enchaînement a été appliqué (0x420f12–0x420f5a, `STRING_ID_CHAIN_BONUS` + `L" x%d"`, valeur `plateau+0x188`).
- Sons de saut (0x420db1–0x420f10) : toujours `SOUND_GAP_BONUS` (`gapbonus1`) immédiat, hauteur normale ; si trous ≥ 2 : un second `gapbonus1` programmé à **15 maj (150 ms)** avec hauteur **+2** (0x415350(son, 0xf, 0, 2,0)) ; si trous ≥ 3 : un troisième à **30 maj (300 ms)**, hauteur **+3**. Signature de 0x415350 : `(son, délai en maj, 0, hauteur en demi-tons)` ; délai 0 = lecture immédiate (0x415366–0x415374).
- Son d'enchaînement : `SOUND_CHAIN_BONUS` (`chain1`) immédiat, hauteur `chain − 5` demi-tons (0x42101d–0x421042 : `fild (chain − 5)`).

### Notre moteur aujourd'hui (`src/core.ts` 1336–1340, `src/main.ts` 402–405, `src/feedback.ts` 49–51)

| Aspect | Original | Moteur actuel |
|---|---|---|
| Moment | au match (bonus armé sur la bille) | à l'insertion, match ou non |
| Montant | `max(10, ⌊500(300 − max(0, w − 64))/300⌋₁₀) × nTrous` (10 … 500 par trou) | `100 × gaps` |
| Tir raté | 0 (bonus effacé), sauf bille collée à sa couleur (différé) | 100 × gaps quand même |
| Texte | « BONUS SAUT / DOUBLE / TRIPLE » sans montant, montant dans « +N » | idem (libellés déjà corrects) |
| Son | 1 / 2 / 3 lectures de `gapbonus1` à 0 / 150 / 300 ms, hauteurs 0 / +2 / +3 | 1–3 lectures simultanées, hauteurs 0 / +2 / +3 |
| Stat SAUTS | +1 par match avec saut | `stats.gaps += p.gaps` par insertion |

Recommandation : conserver `p.gaps` (compte) et ajouter `p.gapMinWidth` (plus petit trou traversé, en px de piste) dans `trackGap` ; à l'insertion, poser `ball.gapBonus = pts`, `ball.gapCount = n` ; dans `settle`/`destroyRun` (et pour les billes « en attente » détruites par réaction), sommer `gapBonus` du groupe et prendre le max de `gapCount` ; émettre `gap` à ce moment-là avec `{count, points}` ; `stats.gaps++` par match. Les deux cues supplémentaires de `feedback.ts` doivent être retardées de 150/300 ms (9/18 ticks à 60 Hz) au lieu d'être simultanées. Base 250 = mode gauntlet uniquement (`plateau+0x187`, posé par 0x44bba0 au lancement d'un gauntlet) : ignorer.

## Q2. Score des matches, combo, enchaînement

### Original (HAUTE)

- **Par bille** : 0x41aa20 incrémente `plateau+0x1e0` (billes détruites) et `plateau+0x25c` (nBilles du match) — **10 points par bille**, sans prime au-delà de 3 (`10 × nBilles` dans 0x420b80).
- **Combo** (réaction en chaîne) : `bille+0x48`. Tir direct : 0. Quand une destruction rapproche deux segments et que les billes qui se touchent sont de même couleur (0x423a83–0x423aa8), la bille reçoit `combo = combo_voisin + 1` et un délai `+0x3c = 10` maj avant le test de match. Le match issu d'une réaction ajoute **100 × combo** (0x420bc6–0x420bc9) et affiche « COMBO x{combo+1} » : première réaction = « COMBO x2 » = +100, deuxième = « COMBO x3 » = +200. Après chaque match, les voisins reçoivent le combo courant (0x4183a4–0x4183a7, `plateau+0x268`) et `plateau+0x1f0/+0x1f4` garde le combo max et ses points (0x421338–0x42136a).
- **Enchaînement** (tirs réussis consécutifs) : `plateau+0x188`, +1 par tir qui fait un match (0x421d2f), +1 aussi quand une bille « en attente » (`+0x32`) est détruite (0x4212d4–0x4212e1) ; remis à 0 par 0x401ac0 à tout tir qui ne fait ni match ni contact de même couleur. À partir du **5ᵉ** tir réussi consécutif (`> 4`), et seulement pour un match **direct** (`combo = 0`), bonus **`(chain + 5) × 10`** : 5ᵉ → 100, 6ᵉ → 110, 7ᵉ → 120, … (0x420bee–0x420bfc), texte « ENCHAÎNEMENT x{chain} », son `chain1` à `chain − 5` demi-tons. Cumul dans `+0x18c`, record `+0x1f8/+0x1fc` (lignes MAX_CHAIN du STATS).
- **Sons de match** (0x421434–0x421516, MOYENNE sur le garde) : si aucun power-up n'a été déclenché par le groupe (`courbe+0x7c = 0`, posé dans 0x41aa20 quand `0x4015c0(bille) ≠ 4`) : `BALLDESTROYED1..5` selon combo 0, 1, 2, 3, ≥ 4 (table 0x421540), puis une instance de `SOUND_COMBO` (`chime1`) avec `AdjustPitch(2 × combo)` demi-tons et `volume = min(1, 0,4 + 0,2 × combo)` (0x4214b7–0x421514) — donc `chime1` joue aussi au combo 0, à 40 %.
- **Fin de la réaction** : `plateau+0x268/+0x26c` remis à 0 (0x421516–0x421525).

### Notre moteur aujourd'hui (`src/core.ts`)

| Règle | Original | Moteur (ligne) |
|---|---|---|
| Points par bille | 10 × n | `10 × n + 10 × max(0, n − 3)` (`destroyRun`, ≈ l. 1079) — **la prime > 3 n'existe pas dans l'original** |
| Combo | +100 × combo, texte « COMBO x{combo+1} » | `100 × (depth − 1)` ✓ ; texte « ENCHAÎNEMENT x{depth} +pts » (`main.ts` 398) — **libellé inversé** |
| Enchaînement | `(chain + 5) × 10` dès chain ≥ 5, match direct seulement, texte « ENCHAÎNEMENT x{chain} », son chain1 à chain − 5 ½-tons | `50 × (streak − 4)` dès 5 (`settle`, l. 1048) : 50, 100, 150… ; texte « COMBO x{streak} » (`main.ts` 409) — **montant et libellé à corriger** ; son `streak` rate 2^((n−5)/12) ✓ |
| Enchaînement entretenu par une bille collée à sa couleur | oui (`+0x32`) | non (`streak = 0` dès qu'un tir ne fait pas de match) |
| « +N » | total du match, couleur de la bille | `+${e.points}` ✓ (couleur à vérifier) |
| Son de match | BALLDESTROYED1..5 par combo + chime1 (hauteur 2 × combo, volume 0,4 + 0,2 × combo) | voir `feedback.ts` (non comparé ici) |
| Bombe | non analysé | `10 × total` (l. 1194) |

Recommandation `destroyRun` : `points = 10 × run.length + 100 × (depth − 1) + gapBonus(run)` ; dans `settle` : `if (streak >= 5 && depth === 1) addScore((streak + 5) × 10)` ; `main.ts` : `destroy` depth > 1 → « COMBO x{depth} », `streak` → « ENCHAÎNEMENT x{streak} ». La règle « bille collée à sa couleur garde l'enchaînement » est un raffinement optionnel (MOYENNE sur l'impact ressenti).

## Q3. « Mode rapide » du décompte STATS

Lecture corrigée de `05-RESEARCH.md` § 8 (HAUTE sur le code, MOYENNE sur la sémantique du mode) :

- 0x440b00 (mise à jour) : au-delà de 100 maj après l'ouverture (`dialogue+0x28 > 0x64`), toutes les 10 maj : `affiché += 100`, ou **`+= 2 500`** si `dialogue+0x161 ≠ 0` (0x440b82–0x440b9b : `0x960 + 0x64`), plafonné à la cible `+0x154`, `AddScore(delta)` (0x440bc5), `endoflevelpop1` avec paramètre `affiché / 1000` (ou `/ 25 000` dans ce mode, 0x54fe9c/0x54fea0).
- `dialogue+0x161` est copié de **`plateau+0x186`** dans le constructeur (0x44797e–0x447984). Ce drapeau :
  - est **remis à 0** au début de chaque niveau (0x42087e, `bl = 0` depuis 0x4200ee dans 0x4200c0) ;
  - n'est **écrit nulle part ailleurs** dans le code (recherche exhaustive des écritures `[…+0x186]`), sauf en désérialisation de sauvegarde (0x41cdad, lecture via 0x434020) ;
  - est consulté par `AddScore` pour **supprimer la vie bonus** (0x4173d1), par le dessin du STATS pour une ligne « EXTRA LIFE BONUS » et par le constructeur pour afficher `WINNING_TOTALS` (« TOTAL DES VICTOIRES », 0x4479a6), par la fin de niveau (`niveau < 13`, 0x423229), et choisit le profil `+0x128` au lieu de `+0x124` (0x41d325).
  - C'est donc un **drapeau de mode de jeu** (vraisemblablement un mode gauntlet/pratique dont les totaux sont bien plus élevés) — **pas** une accélération déclenchée par un clic, une touche ou le temps.
- Écritures de `dialogue+0x158` (affiché) dans 0x440000–0x44a000 : constructeur (0 ; ou = cible si l'argument `[ebp+0xc]` est faux, 0x447cc9–0x447cd4 — dialogue recréé « déjà compté »), mise à jour, et **0x440ac0** (solde : `AddScore(cible − affiché)`, `affiché = cible`). 0x440ac0 n'est appelé que depuis **0x41d2b0**, la routine de sauvegarde du plateau (obtient le dialogue 0xe via `app->vtbl+0x114`, 0x41d2f8–0x41d312) : quitter/sauvegarder pendant le STATS crédite le reste instantanément. **Aucun gestionnaire souris/clavier n'accélère le décompte.**

Reproduction fidèle : garder +100 toutes les 10 maj (≈ 6 ticks) après 1 s, pas d'accélération ; si l'on quitte le dialogue (bouton, menu) avant la fin, créditer le reste d'un coup (équivalent de 0x440ac0). Le « 2 500 » ne concerne pas l'aventure.

## Q4. Géométrie du dialogue STATS (partiel, BASSE–MOYENNE)

Fonction de dessin 0x447d40 (1 463 lignes, lue partiellement) :

- Origine : `x0 = 0x43f060(dialogue) + 20 − dialogue+0x30`, `y = 0x43f070(dialogue) + 10 − dialogue+0x34` (0x447da6–0x447dd1 ; 0x43f060/0x43f070 sont des accesseurs de bord du dialogue, non lus) ; `hauteurLigne = police->GetHeight() + 1` (0x447df0–0x447dfe, `[ebp-0xc0]`), police `ds:0x5a0fa8`.
- Colonnes (0x447dd5–0x447dea, puis 0x447e3e–0x447e45 quand `dialogue+0x160` est levé — mode « totaux ») : valeurs de gauche à **x0 + 120** (110 en mode totaux), libellés de droite à **x0 + 200**, valeurs de droite à **x0 + 300** (330 en mode totaux).
- Deux primitives : 0x45a460 (`police->vtbl+0x34`) pour les libellés, 0x45a430 (`vtbl+0x38`) pour les **nombres** (formatés par `_itow` radix 10, 0x53b316) et l'astuce — vraisemblablement une variante alignée/justifiée (non vérifié : les deux passent `(chaîne, x, y)` et la différence est dans la police).
- Ordre lu : en-tête (ligne jaune `EXTRA_LIFE_BONUS` seulement en mode `+0x161`) ; `y += 2 × hauteurLigne` (0x447f92–0x447f9e) ; `TOTAL_TIME`, puis colonne droite `COMBOS`, `COINS`, `GAPS`, `MAX_CHAIN`, `MAX_COMBO` (0x44805f–0x448345 ; valeurs via 0x45a430) ; orange `POINTS`/`YOUR_TIME` (0xffa500, 0x4483a8), temps formaté par 0x434c40 (`valeur / 100` → min:s) ; `ACE_TIME` ; **BONUS** en vert `0x2aff03` à **x0 + 300/330** (`[ebp-0xcc]`, 0x448e45–0x448e4f) avec `STRING_ID_BONUS` + `L" %d"` ; `NO_TIME_BONUS` (0x9dcba2) ; astuce : `y += 6,5 × hauteurLigne` (0x44909d–0x4490a9, double 0x551100 = 6,5) ; `TIP` jaune.
- Non établi : les incréments de `y` entre chaque ligne (plusieurs écritures de `[ebp-0x80]` non suivies), la position exacte de RECORD (`BEST_TIME`) et l'alignement réel de 0x45a430.

Repli : aligner les **valeurs numériques sur un bord droit commun** par colonne (gauche : x0 + 120 ; droite : x0 + 300) et les libellés à gauche (x0, x0 + 200), avec un interligne constant = hauteur de police + 1 ; BONUS sur la colonne droite des valeurs. C'est suffisant pour la plainte d'alignement ; une lecture complète de 0x447d40 (≈ 1 h) donnerait les y exacts.

## Non établi / replis

| Sujet | État | Repli |
|---|---|---|
| Fonction qui remplit la liste des trous (`projectile+0x94`, largeur `nœud+0xc`) et unité exacte de `w` | non localisée ; px de piste très probable | prendre la distance de piste entre les deux billes bordant le trou, diamètre déduit si le ressenti donne trop souvent 500 |
| Sémantique du drapeau `plateau+0x186` (quel mode ?) | mode de jeu persisté, jamais levé en aventure | ignorer ; aucune accélération du STATS |
| Garde `courbe+0x7c` des sons de match (power-up déclenché ⇒ pas de BALLDESTROYED/chime) | MOYENNE | jouer le son de match sauf si une bille à power-up est dans le groupe |
| Y exacts des lignes du STATS | partiel | repli Q4 ci-dessus |
| Couleur du « +N » (table 0x587408 par couleur de bille) | table non extraite | couleur de la bille telle que rendue |
| Position des textes empilés (0x412b10) | non lue | empiler vers le haut à partir de la bille, comme aujourd'hui |

## Journal des hypothèses

| # | Affirmation | Section | Risque si faux |
|---|---|---|---|
| B1 | `w` (0x40a810) est en pixels de piste [ASSUMED] | Q1 | barème de saut décalé (trop/pas assez généreux) |
| B2 | `plateau+0x186` est un mode de jeu non-aventure [ASSUMED] | Q3 | un mode d'aventure compterait 25 × plus vite — improbable (jamais écrit à 1 hors sauvegarde) |
| B3 | 0x45a430 = tracé aligné/justifié des nombres [ASSUMED] | Q4 | alignement des valeurs du STATS |
| B4 | `0x4015c0(bille) ≠ 4` = « power-up présent » [ASSUMED] | Q2 | sons de match joués/omis à tort |

## Sources

### Primaires (HAUTE)
- PE interne de `private_assets/original/Zuma.exe` (offset 0x1c51a2), désassemblage `objdump -d -M intel` : fonctions 0x401ac0, 0x40a810, 0x415350, 0x417380, 0x41aa20, 0x420b80, 0x421240, 0x421c00–0x421dff, 0x423a83, 0x440ac0, 0x440b00, 0x4478xx, 0x447d40, 0x4200c0/0x42087e, 0x41d2b0, 0x41cdad, 0x44bba0.
- `private_assets/original/properties/resources.xml` (sons) ; `private_assets/pack/strings.json` (chaînes françaises).

### Secondaires (MOYENNE)
- `05-RESEARCH.md` (unités 100 Hz, STATS § 8) — corrigé ici pour le « mode rapide ».

## Metadata

**Confiance :** formules de score et de saut HAUTE ; unité de largeur MOYENNE ; mode `+0x186` MOYENNE ; géométrie BASSE.
**Date :** 2026-10-10 — valable tant que l'exécutable de référence ne change pas.

## Q5. Bouton de pied du STATS (05-14)

**Ajouté le :** 2026-10-11 (plan 05-14, D-36, constat U39). Même PE interne, même `dis.txt` ; lecture ≈ 35 min. **Confiance : HAUTE** sur la règle et les constantes, MOYENNE sur la conversion vers notre cadre (dépend de la transparence des marges du masque, voir plus bas).

### Ce qui est lu

- **Constructeur du STATS** 0x446ec0 (le « 0x4478xx » de Q4 en est la fin) : appelle 0x43ef30 avec `(DIALOG_BOX ds:0x5a1084, DIALOG_BUTTON ds:0x5a122c, id 0xe, modal 1, en-tête, lignes, pied, mode 3, drapeau 1)` (0x446fb9–0x446fdd). Mode 3 = `BUTTONS_FOOTER` : un seul bouton (`mYesButton`, +0x90), pas de second (0x4b3317–0x4b33b8).
- **0x43ef30** (couche Zuma au-dessus de `Dialog::Dialog` 0x4b31a0) : après le constructeur de base (marges de contenu 24 / 24 / 24 / 24, 0x4b3256–0x4b3296), si le drapeau « tête » (`+0x14c`, dessin de `GodHead` dans 0x43f0b0) est levé : `mBackgroundInsets` (+0x108) = **(0, 80, 0, 0)** et `mContentInsets` (+0x118) = **(36, 52, 36, 36)** (gauche, haut, droite, bas ; `Insets` 0x452650 range ses quatre arguments dans cet ordre) ; sans tête : fond inchangé, contenu (36, 28, 36, 36) (0x43efa9–0x43f010).
- **`mButtonHeight`** (+0x104) = hauteur de l'image du bouton (`image+0x8`), 24 sans image (0x4b34b0–0x4b34be) → **48** pour `DialogButton` (360 × 48).
- **`Dialog::Resize`** = entrée 25 de la vtable 0x554554 (0x4ac160 ; le STATS 0x550194 y renvoie par 0x440a60). Branche « un seul bouton » (0x4ac23e–0x4ac291) :
  `x = mX + fond.g + contenu.g`, `y = mY + mHeight − contenu.b − fond.b − mButtonHeight`, `largeur = mWidth − contenu.d − fond.d − fond.g − contenu.g`, `hauteur = mButtonHeight` — exactement le `Dialog::Resize` de SexyAppFramework.
- **Taille du dialogue** (0x434540, appelée par 0x44ae1b avec 460) : largeur `W = max(460, largeur de l'en-tête + marges + 20)`, centré `x = (640 − W) / 2` ; `y = 90 − fond.haut = 10` ; hauteur = hauteur préférée (0x440a70 : base 0x4b0290 + 220, ou + 170 en mode « totaux »), ramenée à `y = 10` si elle dépasse 470. La boîte dessinée (0x4b0410 : rectangle intérieur aux marges de fond) commence donc à **y = 90** et occupe **x 90–550** (460 px).

### Règle et conversion vers notre cadre

Dans le repère de la boîte dessinée : bouton à **36 px** des bords gauche, droit et bas, hauteur 48, pleine largeur intérieure (W − 72).

Notre `STATS_LAYOUT.frame` (109, 91, 422 × 355, mesuré sur la photo R2.0.12) est la partie **opaque** de `dialogbox` : le masque `_dialogbox` laisse 11 px transparents à gauche, 3 à droite et 11 en bas (`STATS_LAYOUT.source`). Vus depuis le bord opaque, les 36 px deviennent 25 (gauche), 33 (droite) et 25 (bas). La boîte originale étant centrée sur 320 comme notre cadre, l'asymétrie horizontale de 4 px est partagée : **règle retenue `STATS_OK_RULE` = gauche 29, droite 29, bas 25, hauteur 48** (largeur = boîte − 72 conservée). OK = **{ x 138, y 373, w 364, h 48 }** (avant : 260, 382, 120 × 48, une seule tranche de 120 px).

Écart de taille relevé, cadre conservé (per D-36) : la boîte lue fait 460 px de large (opaque 446 si les marges du masque sont transparentes) contre 422 mesurés sur la photo ; le haut de la boîte (y = 90) concorde avec notre cadre (91) ; le bas dépend de la hauteur de l'en-tête (non chiffrée), cohérent avec 446 + 11 si l'en-tête ajoute ≈ 3 px.

Conséquence de mise en page : l'encart de l'astuce garde son haut (320, les lignes restent au-dessus pour toute hauteur de ligne permise) et se termine 2 px au-dessus de l'OK (hauteur 60 → 51), texte recentré (ligne de base 350 → 348). Le pied du menu (MENU_LAYOUT, R2.0.18 : 30 / 30 / 22) n'est pas modifié : 1 px d'écart horizontal et 3 px vertical avec la règle du STATS.

### Non établi

| Sujet | État | Repli |
|---|---|---|
| Transparence réelle des marges du masque dans le dessin de la boîte (0x46ae30) | lue côté pack seulement | si elles étaient opaques, la règle serait 36 / 36 / 36 depuis notre cadre (OK 145, 362, 350 × 48) |
| Hauteur exacte du dialogue (métriques de la police d'en-tête dans 0x4b0290) | non chiffrée | cadre mesuré conservé |
| Marges du dialogue MENU (OPTIONS 0x445310) | non relues | règle R2.0.18 conservée |

Preuve : `scratchpad/shots-r220/stats-ok.log` (zone DOM `#result-continue` = rectangle dessiné à 0,05 px près, survol limité au bouton) et captures `stats-ok-3-3-dpr2.png`, `menu-footer-dpr2.png`.
