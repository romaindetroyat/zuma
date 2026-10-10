# Zuma PWA

Reconstruction web/PWA d'un jeu de billes de type Zuma, développée à partir d'un audit comportemental et de tests de non-régression.

Baseline : **R2.0.18**.

## Contenu du dépôt

| Dossier | Rôle |
| --- | --- |
| `src/core.ts` | Moteur de simulation déterministe (chaînes, insertion à identifiants stables, destruction en 40 ticks, recul local, attraction, power-ups, multi-chaînes). |
| `src/feedback.ts` | Règles de présentation : sons déclenchés par événement, explosions, particules, trames de la pièce. |
| `src/levels.ts` | Niveaux procéduraux utilisés quand aucune ressource originale n'est fournie. |
| `src/original.ts` | Chargeur du pack de ressources privé (courbes, fonds, sprites, sons). |
| `src/render.ts` | Rendu canvas 640×480, HUD natif, pièce, messages et textes flottants en polices bitmap. |
| `src/bitmapfont.ts`, `src/statsdialog.ts`, `src/menudialog.ts` | Polices bitmap PopCap, composition de l'écran STATS natif et du menu de jeu (dialogue OPTIONS en jeu). |
| `src/audio.ts` | Sons originaux si disponibles, synthèse WebAudio sinon. |
| `src/main.ts` | Boucle de jeu, progression, entrées, menu de jeu, enregistrement du service worker. |
| `tools/` | Build, serveur local, garde-fou de publication, extraction et import des ressources originales. |
| `tests/` | Suite de non-régression (`node --test`). |

## Démarrage

```bash
npm install
npm test        # build + tests de non-régression + garde-fou de publication
npm run dev     # build local (avec ressources privées si présentes) puis http://localhost:8080
```

Commandes (R2.0.18) :

| Action | Commande |
| --- | --- |
| Viser | Souris n'importe où dans la fenêtre (marges et barre du haut comprises) |
| Tirer | Clic gauche, partout, y compris sur le cadre et la barre du haut |
| Échanger la bille | Clic droit |
| Menu | Espace, Entrée ou Échap — le jeu est en pause tant qu'il est ouvert |
| Statistiques | Tab |
| Pause | P |
| Son | M |
| Tactile | Toucher pour viser et tirer ; toucher MENU / STATS dans la barre pour les ouvrir |

Dans l'original, Espace met le jeu en pause et l'échange au clic droit n'a pas été localisé (hypothèse C1) ; Entrée, Échap, Tab et P sont des ajouts. L'option de menu « Pixels nets » arrondit l'échelle à un **nombre entier de pixels d'appareil** par pixel du jeu (par exemple 1,5 × en pixels CSS sur un écran Retina, soit 3 pixels physiques), sans lissage, et désactive les copies 2 × (voir « Netteté ») ; sans elle le jeu remplit la fenêtre en 4:3. Le choix est persisté.

Relecture : le paramètre d'URL `?level=1-3` ouvre directement un niveau (temple-niveau, ici le troisième niveau du premier temple) ; il est ignoré sans pack ou si le couple est hors limites. `?debug=1` expose `window.__zuma.game.debugState()` (moteur et niveau en lecture, pour les scripts de capture).

## Ressources originales (optionnelles, jamais publiées)

Le dépôt public ne distribue aucun média, son, police, exécutable ni pack extrait du jeu original. Pour un build local fidèle, fournissez une copie légalement obtenue :

```bash
python3 tools/extract_installer.py ZumaSetup.exe private_assets/original   # ou copiez le dossier d'installation
npm run import                                                            # → private_assets/pack
npm run dev                                                               # niveaux, fonds, sprites et sons originaux
npm run standalone                                                        # standalone/zuma-standalone.html (fichier unique)
```

`private_assets/`, `dist/`, `.compiled/` et `standalone/` sont ignorés par Git et `npm run guard` refuse tout fichier propriétaire suivi.

L'import décode les fichiers de courbes (`CURV` : points de contrôle puis polyligne échantillonnée au pixel, chaque point portant un octet de tunnel et un octet de priorité de dessin — voir « Tunnels et calques »), `levels.xml` (positions de la grenouille, découpes, réglages de difficulté, progression par temples) et renomme les sons selon les clés de `feedback.ts`.

### Réglages originaux (`levels.xml` → `configFromSettings`)

Chaque niveau du pack porte des attributs de difficulté ; `src/main.ts` (`configFromSettings`) les traduit en `EngineConfig`. Leur sémantique n'est documentée nulle part dans les données : depuis R2.0.16 elle est établie par analyse statique de l'exécutable original (`.planning/phases/05-regles-originales-completes/05-RESEARCH.md` : le jeu se simule à 100 Hz, une mise à jour « maj » = 10 ms ; conversions `ticks = maj × 0,6`, `px/s = px/maj × 100`). Le tableau distingue ce qui est vérifié par cette analyse de ce qui reste une hypothèse (références A1–A7 dans `.planning/codebase/CONCERNS.md`).

| Réglage | Valeurs observées | Interprétation retenue | Statut |
| --- | --- | --- | --- |
| `score` | 1000 → 5000 (10000 en Gauntlet) | Points à marquer dans le niveau pour remplir la jauge orange et passer en mode ZUMA (`target`). Sert aussi à la valeur des pièces (`coinPoints`) et au temps d'expert par défaut (`defaultParTime`). | vérifié par analyse statique |
| `repeat` | 40–50 (42 → 50 sur les plateaux doubles) | Probabilité `(repeat + 1) / 100` qu'une nouvelle bille répète la couleur de la précédente (`repeatChance`) ; `lvl11` / `lvl12` portent l'attribut en double (40 puis 50), le dernier gagne → 0,51 au 1-1. | vérifié ; valeur 50 au 1-1 = hypothèse A1 |
| `single` | 7–9, niveaux avancés seulement | Seuil de **réparation des billes isolées** (`singleLimit`, 0..10) : quand le tirage `repeat` échoue et que le groupe d'entrée est une bille seule, la nouvelle bille copie sa couleur si `single = 0` ou si les dix derniers groupes comptent au plus `single` billes isolées ; 10 = désactivé (tout le temple 1). Ce n'est pas une probabilité. | vérifié |
| `start` | 35 → 45 | Pourcentage de la longueur de la courbe (`startFraction`) rempli par l'arrivée rapide : la chaîne arrive à la vitesse calculée par la formule originale (`feedSpeed`, 1 520 px/s sur la spirale) puis décélère à 1 000 px/s² ; « PARTEZ » quand toutes les chaînes sont à `speed` + 10 px/s (au plus tard après 5 s). | vérifié ; appel unique de la formule = hypothèse A2 |
| `speed` | 0,5 → 0,6 (px par maj) | Vitesse de croisière de la chaîne, ×100 → px/s (50 px/s au 1-1). Le pousseur y converge par une rampe de +50 px/s² / −1 000 px/s² et s'arrête 40 maj (24 ticks) à chaque insertion dans le segment qu'il pousse, puis repart de 0. | vérifié ; arrêt à chaque insertion arrière = à confirmer au ressenti |
| `slowfactor`, `slowspeed` | 4 par défaut (3,5 → 1 sur les niveaux avancés) ; `slowspeed` → `slowfactor = speed / slowspeed` | **Zone lente de fin de piste** (`endSlowFactor`) : sur les `slowdistance` px qui précèdent la ligne de danger, la vitesse cible descend linéairement de `speed` à `speed / slowfactor`, puis y reste jusqu'au crâne. Ce **n'est pas** le facteur de la balle RALENTIR (`slowFactor` du moteur, toujours 4). | vérifié |
| `danger`, `slowdistance` | jamais définis (défauts 600 / 500 px) | Ligne de danger à 600 px du crâne (`dangerDistance`) : départ de l'alerte, du couvercle du crâne et fin de la zone lente ; zone lente de 500 px avant la ligne (`slowDistance`). | vérifié |
| `firespeed` | 6 (px par maj) | Vitesse du projectile, ×100/60 → px par tick. | vérifié |
| `powerfreq` | 3000 (maj) | Intervalle moyen entre deux power-ups ; garde = 30 % de la valeur, puis tirage par tick. | hypothèse (consommateurs non analysés) |
| `partime` | 25 → 240 (s) | Temps d'expert en secondes : affiché en OBJECTIF ; bonus ACE TIME `100 × (1 + ⌊250 × (1 − t / partime)⌋)` (t = secondes entières, 0 si t > partime : 1-1 en 24 s → 1 100, en 20 s → 5 100), compté dans l'écran STATS. Absent → `defaultParTime` = `⌈score × 35 / 1000⌉₅` (× 0,95 × courbes si plusieurs). | vérifié (unité, formule) ; `defaultParTime` = hypothèse A7 |
| `zumaslow`, `zumaback` | 500 / 200 (`lvl35`) ; défauts 1100 / 300 maj | Au passage en mode ZUMA, **si la tête couvre plus de 50 % de la piste** : recul pendant `zumaback` maj puis vitesse cible × 0,25 pendant `zumaslow` maj (× 0,6 → `zumaBackTicks` 180, `zumaSlowTicks` 660 par défaut) ; un recul plus long déjà actif est conservé. | vérifié ; application à toutes les chaînes d'après la couverture maximale = hypothèse |
| `colors` | 4 (1-1 à 1-3 seulement) | Nombre de couleurs, borné 3..6 ; sinon déduit du temple (4 pour les temples 1–3, 5 pour 4–6, 6 ensuite). | vérifié (`Rand() % colors`) ; déduction par temple = hypothèse, verrouillée par test |
| `treasurefreq` | jamais défini (défaut 300) | Probabilité `1 / treasurefreq` par maj d'une tentative d'apparition de pièce (≈ 1/180 par tick, `coinChance`), 13 s après l'apparition précédente ; voir « Pièces et fin de niveau ». | vérifié (R2.0.18) |
| `mergespeed`, `reloaddelay`, `maxspeed`, `accrate` | — | Non interprétés ; `mergespeed` a seulement inspiré `mergeTicks` ; `maxspeed` / `accrate` sont inopérants sans `accrate` dans `levels.xml`. | à confirmer |

### Tunnels et calques

Chaque point d'une courbe originale (`CURV`, chargeur 0x4178c0) porte deux octets, décodés depuis R2.0.18 selon le troisième spike (`05-RESEARCH-03.md`) :

- **octet A = tunnel** (bit 0 des `flags` du pack, `Track.tunnelAt`) : segment injouable — un projectile **traverse** une bille en tunnel sans la toucher (0x408f52) et la recherche du point de courbe le plus proche l'ignore (0x414d6e) ;
- **octet B = priorité de dessin 0..3** (bits 1–2, `Track.priorityAt`) ; la priorité d'une bille est le maximum des priorités à ses deux bords (± 16 px, 0x405c10).

Le plateau se dessine en **cinq passes** `L = 0..4` (0x40c470) : découpes du décor de priorité `L`, étincelles de ce calque, puis billes de priorité `L`. Toutes les découpes du pack ont la priorité 1 : les billes de priorité 0 passent **sous** les découpes, celles de priorité ≥ 1 **par-dessus**. Aucune bille n'est jamais omise (jusqu'en R2.0.17, 64 % des billes du 2-2 disparaissaient). Les découpes sont des pochoirs du fond (masques `_<nom>.gif`, hypothèse C2).

Un pack importé avant R2.0.18 garde l'ancien décodage (octets décalés d'un point) et n'a pas les images du menu de jeu : relancer `npm run import`.

### Pièces et fin de niveau

Depuis R2.0.16, les montants et les cadences de la fin de niveau sont ceux lus dans l'exécutable original, et depuis R2.0.18 la cadence des pièces aussi ; ce qui est marqué *hypothèse* reste à confirmer en jeu (voir `.planning/codebase/CONCERNS.md`).

- **Pièces** (`TreasurePoint` de `levels.xml` : `x`, `y`, courbe, `dist1`|`dist2` ; objet « pièces » 0x417580) : une seule pièce à la fois, **visible 10 s** (600 ticks). Première tentative 3 s après le début du niveau, puis au plus tôt **13 s après l'apparition précédente** (qu'elle ait été ramassée ou non) ; à partir de là une chance sur 180 par tick (`1 / treasurefreq` par maj), soit **≈ 16 s en moyenne** entre deux apparitions. **Aucune pièce une fois la jauge ZUMA pleine.** Le point est tiré au hasard (jusqu'à `2 × n` tirages) parmi ceux dont la tête de chaîne de la courbe a dépassé **`dist` % de la piste** (`dist = 0` = toujours libre ; ce n'est pas un dégagement en px). Rendu : `COIN.gif` (30 trames, 20 trames/s) avec le scintillement `sparkle.gif` périodique. Un projectile passant à moins de 18 px la ramasse : **`max(500, 100 × ⌊score / 600⌋)` points** (500 au temple 1, vérifié), texte flottant « +500 », compteur PIÈCES des STATS, **la série (ENCH.) est conservée** et le projectile continue sa course. Sons : `jewelappear` à l'apparition (**gain 0,40**, comme dans `resources.xml`), `gemvanishes` à la disparition, tous deux **panoramiques** selon la position de la pièce (`(x − 320) / 320 × 0,3`, unité : hypothèse C3), `coingrab` au ramassage.
- **Décompte de fin de niveau** : quand la dernière bille explose en mode ZUMA, le tir est bloqué, **10 000 points par courbe** sont crédités (*hypothèse A3*), et **un marqueur par chaîne** part de la dernière destruction de sa chaîne (à défaut, du début de sa piste) vers son crâne par pas de **60 px toutes les 4 maj** (2,4 ticks), le premier 20 maj après le vidage ; **tous les marqueurs avancent en même temps** et chaque pas rapporte **+100** par marqueur avec un texte flottant jaune « +100 » et cinq étincelles sur la piste, le son `endoflevelpop1` (gain 0,5, hauteur fixe) joue toutes les 10 maj (pops partagés). 50 maj après le dernier pas du marqueur le plus long : `chant5` et l'écran STATS s'ouvre immédiatement, où le bonus ACE TIME (voir `partime`) est compté. Le décompte **simultané** sur plusieurs chaînes est une **déviation volontaire** (D-30, demandée en UAT) : l'original décompte courbe par courbe, avec 50 maj entre deux courbes.
- **Chronomètre** : TEMPS, OBJECTIF et le bonus ACE TIME se mesurent depuis « PARTEZ », pas depuis le chargement du niveau.
- **Début de niveau** : « Attention » (`GET_READY`, police `NativeAlienExtended18` avec le pack) pendant l'arrivée rapide de la chaîne, puis « PARTEZ » (`GO`) quand la vitesse de croisière est atteinte (≈ 1,5 s sur la spirale) ; `chant1` au début.
- **Fin de piste** : l'alerte `warning1` commence 600 px avant le crâne avec un intervalle qui passe de 4,1 s à 0,6 s sans monter en volume ; le couvercle du crâne s'ouvre sur la même distance ; la chaîne ralentit jusqu'à `speed / slowfactor` (voir le tableau). Le roulement (`rolling`) joue à volume constant (gain 0,35, montée 50 ms) dès que la chaîne bouge et s'éteint par un fondu linéaire de 500 ms (l'original : ≈ 0,5 s) ; il est coupé en pause, sous le menu et le STATS. L'atteinte de la jauge affiche « ZUMA ! » en police titre pendant 2 s avec la jauge qui pulse.

### Vies

Comme dans l'original (`AddScore` 0x417380), **une grenouille supplémentaire tous les 50 000 points** (chaîne du pack `GET_AN_EXTRA_FROG`) : une vie par multiple de 50 000 franchi, plusieurs d'un coup si besoin, **sans plafond**, y compris pendant le compte à rebours du bonus dans l'écran STATS. Le son `extralife` est joué **trois fois** (0, 0,3 et 0,6 s) ; aucun texte n'apparaît en jeu (comme l'original). Le compteur de la barre du haut montre **trois grenouilles puis « +N »** (plafond d'affichage seulement).

### Menu de jeu

Espace, Entrée ou Échap ouvrent le menu de jeu, **composé comme les dialogues du jeu original** : l'original n'a pas de dialogue MENU distinct, c'est son dialogue OPTIONS construit en mode « en jeu » (0x445310). Le jeu est **en pause** dessous.

- Titre « MENU » ; curseurs « Musique » (grisé : pas de musique avant les phases 6–7) et « Sons » (volume général, persisté) ; cases « Plein écran » et « Pixels nets » ; « Aide » (commandes, astuces du pack, version) ; « Retour au menu principal » (confirmation « Quitter la partie ? » puis **nouvelle partie** tant que le menu principal n'existe pas) ; « Retour à la partie ».
- Avec le pack : cadre `dialogbox`, tête de divinité, boutons `DialogButton`, curseurs `slidertrack` / `sliderthumb`, cases `checkbutton` et polices bitmap, composés sur un canvas à l'échelle réelle de l'écran (copies 2 × EPX au-delà de 1,5 ×) ; sans pack, même disposition en dessin vectoriel. Plus aucun panneau HTML.
- Souris : survol, pression, glissement du curseur ; clavier : Haut / Bas pour se déplacer, Gauche / Droite pour le volume, Entrée ou Espace pour valider, Échap pour revenir ou fermer.

### Score (règles originales)

Depuis R2.0.17, le score d'un match est celui lu dans l'exécutable original par le second spike (`05-RESEARCH-02.md`, fonctions 0x420b80, 0x421240, 0x421cac, 0x40a810). Les montants sont implémentés dans `src/core.ts` (`gapBonusPoints`, `destroyRun`, `settle`) et les textes dans `src/main.ts` ; ce qui est marqué *hypothèse Bn* reste à confirmer au ressenti (`.planning/codebase/CONCERNS.md`).

| Règle | Formule / valeur | Texte affiché | Statut |
| --- | --- | --- | --- |
| Match | `10 × n` points pour `n` billes détruites, sans prime au-delà de trois | « +N » dans la couleur de la bille (montant total du match, saut et enchaînement compris) | vérifié par analyse statique ; couleur = celle de la bille rendue (table originale non extraite : hypothèse) |
| Combo (réaction en chaîne) | `+100 × combo`, `combo` = profondeur de la réaction (0 pour le tir direct) ; une ligne COMBOS par match avec combo > 0 | « COMBO x{combo + 1} » | vérifié |
| Enchaînement (tirs réussis consécutifs) | `(chain + 5) × 10` à partir du 5ᵉ tir réussi de suite (100, 110, 120…), pour un match direct seulement ; remis à zéro par tout tir sans match | « ENCHAÎNEMENT x{chain} », son `chain1` à `chain − 5` demi-tons | vérifié ; une bille posée contre sa couleur n'entretient pas l'enchaînement (raffinement original non implémenté : hypothèse) |
| Bonus de saut | calculé à l'insertion d'après la largeur libre `w` de la brèche **la plus étroite** traversée : `max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀)` — 500 / 440 / 350 / 270 / 190 / 100 / 10 points pour `w` ≤ 64 / 100 / 150 / 200 / 250 / 300 / ≥ 364 px — **× le nombre de brèches** (double, triple) ; armé sur la bille et **payé seulement par le match qui la détruit** ; une bille posée contre sa couleur garde son bonus pour un match ultérieur, toute autre bille le perd ; une ligne SAUTS par match | « BONUS SAUT / BONUS DOUBLE SAUT / BONUS TRIPLE SAUT » sans montant, `gapbonus1` à 0 / 150 / 300 ms (+0 / +2 / +3 demi-tons) | vérifié (formule, moment du paiement, sons) ; unité de `w` en px de piste = hypothèse B1 |
| Pièce | `max(500, 100 × ⌊score / 600⌋)` (rappel, R2.0.16) | « +500 » | vérifié |
| Bonus de niveau | 10 000 par courbe à la dernière bille, puis +100 par pas du décompte (rappel) | « +100 » | hypothèse A3 (montant) |
| ACE TIME | `100 × (1 + ⌊250 × (1 − t / partime)⌋)` (rappel), compté dans l'écran STATS | BONUS « +N » | vérifié |

Les sons de match (`BALLDESTROYED1..5` selon le combo, `chime1` à `2 × combo` demi-tons et volume `0,4 + 0,2 × combo`) jouent aussi quand le groupe a déclenché un power-up (l'original les coupe : hypothèse B4).

### Écran STATS d'origine

Avec le pack, l'écran STATS est **composé à l'exécution** (`src/statsdialog.ts`) à partir des briques du jeu original, dans un canvas enfant de `.zuma-stats` (`<canvas class="stats-picture">`) dimensionné à l'échelle réelle du canvas de jeu (la feuille de style ne référence aucune image) :

- `images/dialogbox.jpg` + `_dialogbox.gif` : cadre dessiné en 9 tranches (coins non étirés, bords étirés dans une dimension, centre étiré) sur le rectangle mesuré de la référence R2.0.12 (x 109–531, y 91–446) ;
- `images/GodHead.gif` + masque : tête de divinité centrée, chevauchant le bord supérieur ;
- `images/DialogButton.jpg` + `_Dialogbutton.gif` : bouton OK, trois états peints (normal / survol / pressé) suivis par le contrôle transparent `#result-continue` ; son `button1` au clic ;
- polices bitmap PopCap lues depuis leurs scripts `fonts/*.txt` (`src/bitmapfont.ts`) : titre en `NativeAlienExtended18` multiplié par l'or `#f0c040` de l'original, libellés et valeurs en `Cancun12` teinté aux couleurs lues dans l'exécutable (libellés jaunes, valeurs crème, TEMPS `#ffff00`, OBJECTIF `#ffa500`, BONUS `#2aff03`, « PAS DE BONUS » `#9dcba2`, RECORD or), astuce en `Arial12Bold` ; l'interligne vaut 1,65 × la hauteur de capitale mesurée sur la police (18 px avec `Cancun12`) ; les deux colonnes partagent la **même grille** (TEMPS sur la ligne POINTS, OBJECTIF sur COMBOS, filet dans la ligne PIÈCES, BONUS sur SAUTS, RECORD sur ENCH. MAX.), les libellés droits sont 200 px à droite des libellés gauches comme dans la fonction de dessin originale, les valeurs sont alignées à droite dans leur colonne ; le signe « + » du bonus est normalisé à l'opacité des chiffres (le masque original du « + » est plus pâle) ; l'astuce est alignée à gauche après « ASTUCE : », sur deux lignes au plus (police réduite puis points de suspension) ;
- libellés et astuces = chaînes originales de `properties/default.xml` (`pack/strings.json` : STATS, POINTS, COMBOS, COINS, GAPS, MAX_CHAIN, MAX_COMBO, YOUR_TIME, ACE_TIME, BONUS, BEST_TIME, NO_TIME_BONUS, TIP, OK et les sept astuces).

Colonne gauche : POINTS (score du niveau), COMBOS, PIÈCES (pièces touchées), SAUTS, ENCH. MAX., COMBO MAX. Colonne droite : TEMPS (durée du niveau depuis « PARTEZ »), OBJECTIF (`partime` ou temps d'expert par défaut), BONUS (bonus ACE TIME, sinon « PAS DE BONUS » à la place du libellé), RECORD = **meilleur temps du niveau**, persisté dans `localStorage` sous `zuma.best.<id>` (id du niveau du pack ou `proc-N`), mis à jour sur victoire et affiché dès la première partie (alors égal au temps courant). TEMPS, OBJECTIF et RECORD passent par un seul formateur (« N s » sous la minute, « m:ss » au-delà). Les dix valeurs se révèlent ligne par ligne (90 ms, son `pop`). **Compte à rebours du BONUS** : comme dans l'original, le bonus n'est pas dans le score à l'ouverture ; une seconde après, BONUS monte par pas toutes les 100 ms avec un `endoflevelpop1` dont la hauteur monte (hypothèse A5), POINTS et le score du HUD suivent. Le pas vaut 100 jusqu'à 2 000 points, sinon le multiple de 100 ≥ total / 20 (**20 pas au plus, ≈ 2 s**) ; un clic sur le dialogue (hors OK) passe à 2 500 par pas et OK crédite d'un coup ce qui reste. C'est une **déviation documentée** : l'original compte toujours +100 toutes les 10 maj sans accélération en aventure (D-21, demandée en UAT). Chaque état (ligne révélée, pas du compte à rebours, survol, pressé) recompose le canvas directement (≈ 1–2 ms), sans PNG intermédiaire.

Sans pack (ou tant que les polices ne sont pas chargées), l'écran STATS reste le panneau vectoriel (même structure, mêmes valeurs, mêmes identifiants).

### Netteté

Le jeu est simulé et dessiné en 640×480 logiques ; le canvas est mis à l'échelle de la fenêtre et du `devicePixelRatio` (≈ 3,1 × sur un écran Retina de 1 000 px CSS). Depuis R2.0.17 :

- l'écran STATS est composé **une seule fois à l'échelle réelle** du canvas (plus d'image 640×480 étirée une seconde fois) ;
- dès que l'échelle atteint **1,5 pixel physique par pixel logique** (`HD_MIN_SCALE`), les polices bitmap (HUD et STATS), le cadre, la tête et le bouton du dialogue, les feuilles de billes, l'ombre, les icônes de power-up et la barre de menu sont remplacés par des copies **2 × EPX** (`src/upscale.ts`, filtre Scale2x pur, aucune dépendance) construites en mémoire au chargement et dessinées à leur taille logique avec lissage ;
- le fond de niveau, les découpes, les trous, le couvercle, la grenouille, la pièce, la jauge et les explosions restent en 1 × bilinéaire ;
- « Pixels nets » choisit une échelle entière **en pixels d'appareil** (`fitScale` : `max(1, ⌊ajustement × dpr⌋) / dpr`, soit 960 × 720 px CSS dans une fenêtre de 1 000 × 750 sur un écran Retina, contre 640 × 480 jusqu'en R2.0.17), sans lissage, actifs 1 × ; sans elle le canvas remplit la fenêtre en 4:3 ; la bascule se fait sans rechargement ;
- coût mémoire mesuré avec le pack : ≈ 16,3 Mio d'images 2 × (dont 4,7 pour la barre de menu et 4,4 pour les six feuilles de billes), construites uniquement au-dessus de 1,5 ×.

## Verrous de non-régression

- insertion sans remplacement ni recoloration des billes existantes ;
- insertion progressive sur 12 ticks, destruction évaluée une fois la place faite ;
- tir partant de la bouche (muzzleOffset) ;
- trame de roulement monotone (recul visible) ;
- persistance des billes pendant la phase de destruction (40 ticks) ;
- attraction et reconnexion uniquement après contact physique ;
- recul local propagé de segment en segment ;
- couleur immuable des projectiles en vol ;
- filtrage des munitions sur les couleurs présentes ;
- quatre familles de power-ups (Bombe, Ralentir, Retour, Visée) avec leurs sons dédiés ;
- bonus saut, enchaînements, mode ZUMA, perte de vie et victoire ;
- HUD natif 640×480 et écran STATS monolithique à bouton OK unique (structure R2.0.12 ; avec le pack, écran STATS natif composé depuis les ressources originales : cadre 9 tranches, polices bitmap, chaînes, record de temps par niveau) ;
- décodeur de courbes originales vérifié sur un fichier synthétique ;
- arrêt du pousseur et zone lente de fin de piste ; décompte original ; bonus ACE TIME (`tests/r216*.test.mjs`) ;
- bonus de saut payé au match (barème 500 … 10 × brèches, bille en attente) ; score `10n + 100·combo` ; enchaînement `(chain + 5) × 10` ; textes et sons de score originaux ; grille du STATS, signe du bonus, astuce sur deux lignes ; compte à rebours borné avec mode rapide ; rampe du roulement armée une fois par cible ; `upscale2x`, composition à l'échelle du canvas et actifs 2 × dès 1,5 × (`tests/r217*.test.mjs`) ;
- décodage CURV aligné (tunnel, priorité 0..3), priorité d'une bille aux deux bords, projectile qui traverse une bille en tunnel, cinq passes de dessin sans bille omise ; vies tous les 50 000 points (sans plafond, aussi pendant le compte à rebours) avec triple `extralife` et compteur de grenouilles ; cadence originale des pièces (10 s, 13 s, 1/180 par tick, rien après ZUMA, `dist` en %), `coinappear` à 0,40 et panoramique ; décompte simultané sur plusieurs chaînes ; menu de jeu (disposition, aide, confirmation, composition, pause, volume) ; visée et tir sur toute la fenêtre, liaisons clavier, `stagePoint`, `fitScale` ; roulement 0,35 / 50 ms / 500 ms (`tests/r218*.test.mjs`).

## Fournir ses propres graphismes de niveau

Le jeu charge n'importe quel niveau décrit dans le format du pack (`private_assets/pack/pack.json`, ignoré par Git), que les fichiers viennent de l'import original ou d'une création personnelle. Pour un niveau d'identifiant `<id>` :

- **Fond** : `levels/<id>/<id>.jpg` ou `.png`, 640×480, référencé par `graphics.<id>.background`. Il est dessiné 1:1, jamais mis à l'échelle : une image d'une autre taille est recadrée, pas étirée. Vignette optionnelle `levels/<id>/thumb.jpg` (320×240) dans `graphics.<id>.thumbnail`.
- **Découpes** (tunnels, dessinées au-dessus des billes) : un PNG avec couche alpha `levels/<id>/<nom>.png` et sa position en pixels (coin haut-gauche), déclarés dans `graphics.<id>.cutouts: [{ "image": "<nom>", "x": …, "y": …, "priority": 1 }]` et `graphics.<id>.layers.<nom> = { "color": "levels/<id>/<nom>.png", "alpha": null }`. Un calque avec `"color": null` et un masque dans `"alpha"` découpe le fond lui-même à cette position (format PopCap `_<nom>.gif`).
- **Calques animés** (sous les billes) : même format d'image et de calque, déclarés dans `graphics.<id>.overlays: [{ "image": "<nom>", "x": …, "y": …, "vx": …, "vy": … }]` ; `vx, vy` donnent la direction d'une oscillation lente (amplitude ≤ 3 px).
- **Tracé** : `levels/<fichier>.json` = `{ "version": 2, "controls": [[x, y], …], "points": [[x, y, flags], …] }`. Les `points` sont en pixels, échantillonnés au pas ≈ 1 px du trou d'entrée vers le crâne ; `flags` bit 1 = la bille passe sous une découpe, bit 2 = bille cachée. Le fichier est référencé par `graphics.<id>.curveFiles` (plusieurs tracés = plusieurs chaînes) et la grenouille par `graphics.<id>.frog = { "x": …, "y": … }`.

Ces fichiers vont dans `private_assets/pack/` ; `npm run dev` les charge sans autre configuration.

## Statut

R2.0.18 est une baseline jouable, pas une revendication de reproduction bit-à-bit. Sont vérifiés par analyse statique de l'exécutable original : la cadence (100 Hz) et les unités de `speed` / `firespeed`, la rampe et l'arrêt du pousseur, la zone lente et la ligne de danger, l'arrivée rapide calculée depuis `start`, la génération des couleurs (`repeat`, `single`, `colors`), le seuil `score` et la condition du recul ZUMA (`zumaslow` / `zumaback` × 0,25 au-delà de 50 % de couverture), le décompte de fin de niveau (60 px / 4 maj / +100, pops toutes les 10 maj), la formule ACE TIME et son comptage dans l'écran STATS, la valeur des pièces, les couleurs du dialogue STATS ; depuis R2.0.17 le score des matches (`10 × n + 100 × combo`), l'enchaînement `(chain + 5) × 10`, le barème et le moment de paiement du bonus de saut, les textes et sons de score, l'absence de mode rapide du compte à rebours dans l'original ; et depuis R2.0.18 le format CURV (tunnel et priorité de dessin), l'ordre de dessin du plateau en cinq passes, la collision qui ignore les billes en tunnel, la composition du menu de jeu (dialogue OPTIONS en jeu, jeu en pause dessous), les vies tous les 50 000 points sans plafond avec le triple `extralife`, la cadence des pièces (`treasurefreq`, 10 s visibles, 13 s entre deux apparitions, rien après ZUMA, `dist` en pourcentage), le volume de `jewelappear` et le fondu linéaire du roulement.

Restent des hypothèses, à confirmer sur l'original ou au ressenti : A1 (`repeat` 50 au 1-1), A2 (appel unique de l'arrivée rapide), A3 (+10 000 par courbe en fin de niveau), A4 (bannière ZUMA 2 s), A5 (hauteur du pop du compte à rebours), A7 (`defaultParTime`), B1 (largeur de brèche en px de piste), B3 (alignement des valeurs du STATS et `y` exacts), B4 (sons de match malgré un power-up), C1 (clic droit = échange), C2 (découpes = pochoirs du fond), C3 (unité du panoramique des pièces), C4 (police des libellés du menu), la tête de divinité et les marges du menu, la couleur du « +N », la bille en attente qui n'entretient pas l'enchaînement, l'arrêt du pousseur à chaque insertion arrière, la loi RNG des power-ups (`powerfreq`), `mergespeed`, `reloaddelay`, le départ du chronomètre à « PARTEZ », le rafraîchissement immédiat des munitions, la condition exacte du rafraîchissement du roulement ; et des choix assumés : Espace = menu (l'original : pause), Échap / Entrée / Tab / P sans équivalent original, gain 0,35 du roulement sur un seul canal (l'original : 1,0, un canal par courbe), curseur Musique inerte, « Retour au menu principal » qui lance une nouvelle partie, boutons du HUD actifs au toucher seulement. Deux déviations volontaires sont documentées : D-21 (compte à rebours borné à ≈ 2 s et accéléré au clic, là où l'original n'accélère jamais en aventure) et D-30 (décompte de fin de niveau simultané sur toutes les chaînes, là où l'original les décompte l'une après l'autre).
