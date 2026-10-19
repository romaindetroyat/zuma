# Phase 6 : Progression et menus — Recherche (spike 06 : menu principal, aventure, fin, meilleurs scores, difficulté)

**Recherché le :** 2026-10-11
**Domaine :** écrans hors partie de Zuma Deluxe (PopCap SexyAppFramework : `MainMenu`, `AdventureScreen`, `CreditsScreen`, `LoadingScreen`, `HighScoreMgr`, `TransitionMgr`) et analyse de difficulté de notre moteur contre l'exécutable
**Confiance globale :** HAUTE pour les positions, constantes et règles lues dans le code (adresses citées) ; MOYENNE pour l'enchaînement exact des écrans (drapeaux d'état partiellement décodés) ; BASSE pour le nombre de couleurs par étage (contradiction code / sources publiques, voir Q5b).

## Résumé

**Menu principal (Q1).** `MainMenu` (RTTI `.?AVMainMenu@Sexy@@`, ctor 0x43c900, `Draw` 0x43d1a0, `Update` 0x43d9a0) : ciel `mmsky` (520 × 161) qui défile de 1 px toutes les 8 maj (12,5 px/s) en trois copies, puis `mmscreen` plein écran, deux pupilles (`mmeyeleft` 21 × 21, `mmeyeright` 14 × 17) **fixes** en (219, 368) et (276, 355) tant que le joueur n'a pas cliqué sur la grenouille (zone x 63–328, y 276–471 : bascule « les yeux suivent la souris »), une découpe `mmscreen` × `mmeyemask` posée en (191, 331) par-dessus, le chapeau `mmhat` en (188, 247) seulement si toutes les épreuves Gauntlet sont maîtrisées, la lueur `mmsunglow` en mode additif en (−69, −63), rotation 0,3°/maj (30°/s) et alpha triangle 75 → 150 → 75 sur 5 s, puis `mmsun` en (0, 2). Cinq pierres-boutons à 3 états (normal / survol / pressé, libellés français dessinés dans l'image) : `mmARCADEBUTTON` « AVENTURE » (452, 64), `mmGAUNTLETBUTTON` (436, 153), `mmOPTIONSBUTTON` (418, 236), `mmMOREGAMESBUTTON` (406, 306), `mmQUITBUTTON` (394, 372). Clic = `button1` ; **survol = `choral1` transposé** de +12, +14, +10, −2, +5 demi-tons selon la pierre ; survoler les cinq pierres dans l'ordre trois fois de suite fait passer l'OVNI (`images/mmufo`, 6 trames de 175 × 84, son `ufo1` en boucle), qui mène aux crédits si on le clique. Texte « Bienvenue dans Zuma, <nom> ! » (`FONT_BROWNTITLE` = NativeAlienExtended16, blanc, centré, y 32) et lien « Si ce n'est pas vous, cliquez ici. ». Musique : position 28 de `zuma.mo3`.

**Aventure (Q2).** `AdventureScreen` (ctor 0x449b90, `Draw` 0x441b50) : `advsky` qui défile (1 px / 4 maj), `advback`, `advTitle` en (0, 0), plaque `advHighscore` en (456, 0) avec les meilleurs scores dessous (noms x 470, scores alignés à droite x 575, à partir de y 70), quatre temples (`advtemple1..4`, variantes `2v`/`3v`, `advmiddle`), **douze portes** (étages 1–12, 3 par temple, 4 trames d'ouverture chacune) aux positions lues en 0x449cb2–0x449e57, plaque `advstage` « STAGE » en (289, 382) avec le numéro en (344, 396), message de la porte (`DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS`…`ENTER_THE_RUINS`, un par étage) en NativeAlienExtended16 blanc centré y 422, boutons `advplaybutton` et `advmainmenubutton`. On y arrive par « Aventure » (après reprise éventuelle d'une partie sauvegardée), **après chaque étage terminé** (animation d'ouverture de la porte suivante, 75 maj) et après une partie perdue. Musique : position 32.

**Fin (Q3).** Après le STATS du dernier niveau (étage d'indice ≥ 12, soit 13-1 « Espace »), 0x44f530 appelle `ShowCredits(happy = 1)` (0x44b310) : `CreditsScreen` (ctor 0x43af60) dessine `images/happyending` (640 × 480, plein écran) puis fait défiler les crédits (titres en NativeAlien48 / NativeAlienExtended18 / 16) à **50 px/s** (1 px toutes les 2 maj), bouton « Passer » (`STRING_ID_WHATEVER`, kit `Dialogbutton`) → menu principal (0x44b3e0). Avant, le niveau final joue la séquence du dieu (temple d'indice 4 : `EXCELLENT_WORK_FROG_ONE`, réponses « Coâ-coâ ! » / « (Bizarre) ! ») et le score est soumis au tableau à la fin du STATS (0x440c6a, quand le drapeau `+0xdd` du dialogue est levé — sens « dernier niveau » MOYEN). Musique : position 0.

**Meilleurs scores (Q4).** `HighScoreMgr` (fichier `userdata/highscores.dat`) : une liste par clé (`"adventure"` en aventure), **10 entrées** au plus (0x427d8d `cmp …,0xa`), entrée = {nom, score} ; le nom est celui du **profil joueur** saisi une fois au premier lancement (`ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE`), il n'y a **pas** de saisie de nom au moment du record. Soumission à la perte de la dernière vie (0x4283c4) et à la fin du STATS final (0x440c6a). Valeurs par défaut de l'aventure : 3 entrées (10 000, 5 000, 1 000) aux prénoms de l'équipe PopCap.

**Difficulté (Q5).** (a) Aucune accélération globale en aventure : la cible du pousseur (0x418780) ne dépend que des réglages du niveau (`speed`, `zumaslow`, zone lente) ; l'accélération par couverture < 30 % n'existe qu'en Gauntlet (drapeau `plateau+0x187`) ; `maxspeed`/`accrate` inopérants ; aucune aide après une vie perdue. (b) `configFromSettings` couvre tous les attributs utilisés par `StageProgression` ; seul écart : `colors` (notre repli 4/5/6 par étage contre défaut exécutable 4, non résolu). (c) **Erreur de règle trouvée :** l'arrêt du pousseur de 40 maj n'est **pas** déclenché par une insertion : 0x423ac7–0x423ad6 appartient à 0x423a10 (fin de destruction, cf. recherche 04) et ne s'applique que lorsque la bille **retirée** est la bille **arrière** de la chaîne (premier nœud de la liste). Notre moteur (`core.ts` 1661–1668) arrête la chaîne 0,4 s et la relance de 0 à **chaque insertion dans le segment arrière**, c'est-à-dire presque à chaque tir. Simulation sans navigateur (13 niveaux × 6 graines, même robot pour les deux règles) : pousseur à l'arrêt **18–32 %** du temps de jeu chez nous contre **3–9 %** avec la règle originale ; vitesse effective moyenne **+15 à +45 %** avec la règle originale ; vies perdues plus tôt (13-1 : 105 s contre 138 s). C'est la cause principale du « trop facile ».

**Recommandation principale :** composer les trois écrans originaux (menu, aventure, crédits) depuis le pack avec les positions ci-dessus ; tableau local de 10 scores, nom du profil demandé une fois ; et, pour la difficulté, **remplacer l'arrêt du pousseur à l'insertion par l'arrêt au retrait de la bille arrière** (correction de règle, verrouillée par un test) — c'est la seule correction justifiée ; aucune correction « en pourcentage » n'est justifiée par l'exécutable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Écran de bienvenue (U1)
- **D-01:** Au lancement, l'app affiche l'écran principal du jeu original, composé à partir des ressources du pack (`mmscreen`, `mmsky`, `mmsun` / `mmsunglow`, `mmhat`, `mmeyeleft` / `mmeyeright` / `mmeyemask`, `mmUFO`, boutons `mmARCADEBUTTON` → « Aventure », `mmOPTIONSBUTTON` → options, `mmQUITBUTTON` / `mmMOREGAMESBUTTON` / `mmGAUNTLETBUTTON` selon ce que l'analyse de l'exécutable établit et ce qui a un sens dans une PWA) ; la composition, les animations (yeux, soleil, OVNI) et les sons sont lus dans l'exécutable (recherche 06). Aucun niveau ne démarre avant le choix du joueur.
- **D-02:** « Aventure » mène à l'écran d'aventure original (`advback`, `advsky`, `advmiddle`, `advstage`, `advtemple1..4`, portes `advdoor*`, `advTitle`, `advplaybutton`, `advmainmenubutton`, `advHighscore`) si l'analyse confirme ce chaînage ; sinon directement au premier niveau. Le menu de jeu (« Retour au menu principal ») ramène à cet écran au lieu de relancer une partie.

#### Écran de fin (U2)
- **D-03:** Après le dernier niveau de la progression (13-1 aujourd'hui), le jeu ne recommence pas : il affiche l'écran de fin original (`happyending` et ce que l'exécutable enchaîne : texte, sons, crédits éventuels), puis le score final et le tableau des meilleurs scores (graphismes `advHighscore` / chaînes du pack), avec la position du score de la partie ; retour à l'écran de bienvenue ensuite.
- **D-04:** Tableau des meilleurs scores local (`localStorage`, 10 entrées comme l'original si l'analyse le confirme : nom ou date, score, niveau atteint) ; une partie perdue (game over) y entre aussi, comme dans l'original. La saisie d'un nom suit l'original si elle existe (sinon « Joueur » + date). Synchronisation entre appareils : différée (phase 5 D-39/D-42).

#### Conformité graphique (U3)
- **D-05:** Mêmes principes que le STATS et le menu natifs : composition à l'échelle du canvas, chemin 2× HD, polices bitmap du pack, chaînes du pack, aucun panneau DOM stylé ; captures Playwright à DPR 2 comparées à l'original (géométrie lue dans l'exécutable).

#### Difficulté (U4)
- **D-06:** Analyse avant toute correction : mesurer dans notre moteur, niveau par niveau, le temps passé à l'arrêt (arrêts du pousseur après insertion, reculs au contact, recul ZUMA), la vitesse effective, et la comparer aux règles lues dans l'exécutable (recherches 01 et 04) et aux réglages `levels.xml` par niveau (`speed`, `slowfactor`, `slowspeed`, `maxspeed`, `mergespeed`, `zumaslow`, `zumaback`, progression `StageProgression`). Rechercher dans l'exécutable toute accélération globale par niveau/temple (multiplicateur de vitesse, `maxspeed`, difficulté du mode aventure) que nous n'appliquerions pas.
- **D-07:** Corrections éventuelles limitées à de petits pourcentages et justifiées une à une par l'analyse ; chaque règle modifiée est verrouillée par un test ; aucune « difficulté inventée ».

### Claude's Discretion
(aucune section dédiée dans 06-CONTEXT.md)

### Deferred Ideas (OUT OF SCOPE)
- **D-08:** « Comment imaginer 10 niveaux de plus ? » : procédure décrite à l'utilisateur, rien n'est lancé (voir `.planning/notes/niveaux-supplementaires.md`).
- Synchronisation des scores entre appareils (D-39/D-42 de la phase 5), sauf greffe sans risque.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Ce que ce spike apporte |
|----|-------------|-------------------------|
| PROG-01 | Aventure par temples suivant `StageProgression` avec écran de transition | Q2 : écran d'aventure (12 portes, 4 temples, positions), retour après chaque **étage** (pas après chaque niveau), séquence du dieu après chaque temple (Q3), 13-1 → crédits |
| PROG-02 | Sauvegarde locale de la progression, reprise de partie, meilleurs scores | Q4 : 10 scores par clé, nom du profil ; Q2 : sauvegarde du **niveau suivant** après une victoire (0x41d325) et reprise par « Aventure » (0x44ef40) ; chaînes `DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?`, `SM_CONTINUE`, `NEW_GAME` |
| PROG-03 | Menu principal (aventure, options son/plein écran, aide) | Q1 : composition, animations, sons, boutons ; « Aide » est dans le dialogue OPTIONS (recherche 03), pas sur l'écran principal |
</phase_requirements>

## Contraintes du projet (CLAUDE.md)

- Aucune ressource originale commitée ou publiée : images, polices et sons viennent du pack privé (`private_assets/pack/`) via l'importateur ; ce document ne cite que des adresses, des nombres et de courtes chaînes. Les prénoms du tableau par défaut ne doivent pas être recopiés dans le dépôt (voir Q4). `npm run guard` reste la barrière.
- TypeScript strict, zéro dépendance runtime, canvas 2D, Node 22 : aucun paquet nouveau.
- Moteur sans DOM (`command()` / `drainEvents()`), aléa via `engine.rng` ; les écrans hors partie vivent dans la présentation (`main.ts` + nouveaux modules canvas), pas dans `ZumaEngine`.
- Chargement d'assets : `null` + repli, jamais d'exception ; `localStorage` sous `try/catch`.
- Toute règle de jeu modifiée = nouveau test `tests/r221*.test.mjs` (baseline `ENGINE_VERSION` 2.0.20 → 2.0.21) + ligne dans `R221_RELEASE_NOTES.md`.
- Interface en français, chaînes alignées sur `default.xml` (déjà importées dans `pack/strings.json`, 215 clés).
- Travail via un flux GSD (`/gsd-execute-phase`).

## Architectural Responsibility Map

| Capacité | Tier principal | Tier secondaire | Raison |
|---|---|---|---|
| Machine d'écrans (chargement → menu → aventure → partie → fin) | Navigateur : `main.ts` (cycle de vie) | — | État d'application, pas règle de jeu ; le moteur reste par niveau |
| Composition des écrans (menu, aventure, crédits) | Navigateur : nouveau module canvas (ex. `src/screens.ts`) | `original.ts` (chargement des images du pack) | Même principe que `statsdialog.ts` / `menudialog.ts` : canvas 640 × 480, chemin 2× |
| Animations (ciel, lueur, yeux, OVNI, portes, défilement) | Navigateur : fonctions pures du compteur de mises à jour | — | Testables sans DOM (positions = f(t)) |
| Sons de menu (`button1`, `choral1` transposé, `ufo1`) | Navigateur : `audio.ts` / `feedback.ts` | — | Le moteur n'intervient pas |
| Progression, sauvegarde, profil, meilleurs scores | Stockage : `localStorage` | `main.ts` | Persistance locale, `try/catch` |
| Arrêt du pousseur (correction de difficulté) | Moteur : `core.ts` | tests `r221` | Règle de simulation |
| Import des images/polices nouvelles | Outillage : `tools/import-original.mjs` | `guard` | Ressources jamais dans le dépôt |

## Standard Stack

Aucune bibliothèque : tout est canvas 2D natif, `localStorage`, WebAudio existant, polices bitmap PopCap (`src/bitmapfont.ts`). **Aucun paquet installé → pas d'audit de légitimité nécessaire.**

À importer en plus dans le pack (importateur) :

| Ressource | Fichiers originaux | Usage |
|---|---|---|
| Menu | `mmscreen` (déjà importé), `mmsky.jpg`, `mmsun.gif`/`_mmsun.gif`, `_mmsunglow.jpg` (masque seul : lueur additive), `mmhat.jpg`/`_mmhat.gif`, `mmeyeleft.gif`/`mmeyeright.gif` (+ masques), `_mmeyemask.gif`, `mmUFO.jpg`/`_mmUFO.gif`, `mm{ARCADE,GAUNTLET,OPTIONS,MOREGAMES,QUIT}BUTTON.jpg` + masques | Q1 |
| Aventure | `advsky.jpg`, `advback.jpg`/`_advback.gif` (640 × 250), `advmiddle`, `advtemple1..4`, `advtemple2v`/`3v`, `advdoor{1..4}{A,B,C}` (4 trames), `advTitle`, `advHighscore`, `advstage.gif`, `advplaybutton`, `advmainmenubutton` (+ masques `_…`) | Q2 |
| Fin | `happyending.jpg` | Q3 |
| Chargement | `loadingscreen` (déjà importé), `LoaderBar.gif`/`_LoaderBar.gif` (399 × 44) | Q1 |
| Polices | `NativeAlienExtended16` (`FONT_BROWNTITLE`, `FONT_CREDITBROWNTITLE`), `NativeAlien48` (`FONT_HUGE`), `Cancun8`/`Cancun13` si besoin | textes de menu, crédits, plaque des scores |
| Sons | déjà dans le pack : `choral` (`choral1`, volume 0,2), `ufo`, `button`, `templecomplete` (`chant6`), `earthquake` | Q1–Q3 |

## Méthode (reproductible)

1. PE interne réutilisé (`scratchpad/exe/inner.exe`, `exe/dis.txt`), VMA = offset + 0x400000 (cf. `05-RESEARCH.md` § Méthode). Nouveaux outils dans `scratchpad/s06/` : `strs.py` (chaînes ASCII/UTF-16 → VMA), `resmap.py` (identifiant `IMAGE_*/SOUND_*/FONT_*` → globale, 227 entrées), `refs.py` (lecteurs d'une globale), `vt.py` (vtables).
2. Classes repérées par RTTI (`.?AVMainMenu@Sexy@@` 0x5878dc, `AdventureScreen` 0x587c20, `CreditsScreen` 0x587890, `LoadingScreen` 0x587bd8, `HighScoreMgr` 0x587314, `TransitionMgr` 0x587378), puis par les lecteurs des globales d'images (`IMAGE_MM_*` 0x5a0fc0…, `IMAGE_ADV*` 0x5a1008…) et des chaînes (`images/happyending` 0x54ed14, `images/mmufo` 0x54f3c8, `userdata/highscores.dat` 0x54d35c).
3. Fonctions lues : menu 0x43be00 (OVNI + fondu), 0x43bfe0 (boutons), 0x43c050/0x43c270 (yeux), 0x43c430 (clic sur la grenouille), 0x43c550/0x43c6b0 (trajectoire OVNI), 0x43c730 (chapeau), 0x43c900 (ctor), 0x43cf60 (disposition), 0x43d1a0 (dessin), 0x43d7e0/0x43d880/0x43d9a0 (OVNI, update), 0x43ed30 (son de survol, compteur 0x5a1330), 0x434d10 (fabrique de boutons, drapeaux sons) ; aventure 0x449b90, 0x441b50, 0x44f180 ; crédits 0x43af60, 0x43add0, 0x43b250, 0x44b310 ; menu 0x44b3e0 ; fin de partie 0x44f530 ; scores 0x426f20, 0x427d60, 0x428170 ; dieu 0x430320–0x431b10 ; chargement 0x445130 ; pousseur 0x418780, 0x423a10, 0x423c50, 0x40ab60 ; tir 0x40c290, 0x4052a0, 0x4024e0.
4. Simulation : `scratchpad/s06sim/sim.mjs` (Node 22, `.compiled/core.js` et `configFromSettings` de `.compiled/main.js`, courbes et réglages du pack, aucun fichier du dépôt modifié).

Durée : ≈ 2 h.

## Q1. Menu principal et chargement (D-01)

### Enchaînement (HAUTE sauf mention)

`LoadingScreen` → (premier lancement : dialogue de création de profil, 0x44a8b0, `ENTER_YOUR_NAME…`) → `ShowMainMenu` 0x44b3e0 : crée `MainMenu`, musique `0x44a5e0(28, boucle, fondu 0,01)`. Chargement (0x445130) : `loadingscreen` en (0, 0), `LoaderBar` dessinée **rognée à `largeur × progression`** en (128, 349) ; texte éventuel en `FONT_FLOAT` couleur 0xffec91 (message d'enregistrement : sans objet).

### Composition, ordre de dessin (0x43d1a0)

| # | Élément | Position | Détail |
|---|---|---|---|
| 1 | `MM_SKY` (`mmsky`, 520 × 161) | x = `o − w`, `o`, `o + w` ; y 0 | `o = (compteur >> 3) mod w` → défile vers la droite, 12,5 px/s |
| 2 | `MM_BACK` (`mmscreen` + `_mmscreen`) | (0, 0) | le ciel transparaît par le masque |
| 3 | `MM_EYELEFT` | centre (`+0xb0`, `+0xb8`) − taille/2 | repos : (219, 368) |
| 4 | `MM_EYERIGHT` | centre (`+0xc0`, `+0xc8`) − taille/2 | repos : (276, 355) |
| 5 | découpe `mmscreen` × `_mmeyemask` (105 × 54) | (191, 331) | paupières par-dessus les pupilles (0x433c40 au ctor) |
| 6 | `MM_HAT` (`mmhat`) | (188, 247) | seulement si `+0xd8` : toutes les épreuves Gauntlet au rang ≥ 21 (0x43c730) → **jamais dans notre PWA** |
| 7 | `SUNGLOW` (`_mmsunglow.jpg`, 229 × 227) | (−69, −63) | mode additif + colorisation ; alpha `75 + 75·tri(c mod 500)/250` (5 s) ; avec accélération 3D : rotation `c × π/180 × 0,3` (0,3°/maj) |
| 8 | `MM_SUN` (`mmsun`, 87 × 92) | (0, 2) | |
| 9 | Texte `WELCOME_TO_ZUMA` + `, <nom>` + `!` | centré (640 − w)/2, y 32 | `FONT_BROWNTITLE` (NativeAlienExtended16), blanc ; sans profil : « Bienvenue dans Zuma ! » |
| 10 | lien `IF_THIS_IS_NOT_YOU` (id 5) | centré, y 30 (Resize, w + 20) | `FONT_MAIN10`, couleurs 0x5b3700 / 0xfff763 ; ouvre le dialogue des profils |
| 11 | OVNI + fondu | 0x43be00 | voir plus bas |

### Yeux (0x43c270, 0x43c050, 0x43c430)

- Par défaut (`0x5a2c2c == 0` et pas d'OVNI) : pupilles aux positions fixes (219, 368) et (276, 355) (doubles 0x54f230–0x54f248).
- Un clic dans le rectangle x ∈ [63, 328), y ∈ [276, 471) (la grenouille) **bascule** `0x5a2c2c` : les pupilles suivent alors la souris (ou l'OVNI s'il vole), chacune contrainte dans son orbite par 0x43c050 (paramètres (29, 25) et (87, 16) relatifs à la découpe en (191, 331)) ; mise à jour au mouvement de souris (0x43c400) et à chaque update. [Géométrie exacte de l'orbite : MOYENNE — repli : pupille = repos + 4 px dans la direction du pointeur, bornée par l'ellipse 6 × 4.]

### Boutons (ctor 0x43c900, disposition 0x43cf60, actions 0x43bfe0)

`0x434d10(id, écouteur, libellé "", drapeaux 3, image, 3 colonnes)` : image découpée en **3 états horizontaux** (normal / survol / pressé), libellés **dessinés dans l'image** (« AVENTURE »…). Drapeau 1 → son de clic `SOUND_BUTTON1` ; drapeau 2 → son de survol = entrée 0xd8 de la table des ressources = **`SOUND_CHORAL1`** (`choral1`, volume 0,2), transposé de `[2, 4, 0, −12, −5][id mod 5] + 10` demi-tons (0x434dd1–0x434e01 ; joué en 0x43ed46–0x43ed81). *Correction de la recherche 04 :* `choral1` a bien un lecteur, indirect.

| id | Image (taille d'un état) | Position `Layout(0x30)` | Survol (demi-tons) | Action |
|---|---|---|---|---|
| 0 | `mmARCADEBUTTON` (163 × 92) | (452, 64) | +12 | `ShowAdventureScreen(reprise = 1, étage fini = 0)` 0x44f180 |
| 1 | `mmGAUNTLETBUTTON` (180 × 83) | (436, 153) | +14 | écran Gauntlet 0x44f2f0 |
| 2 | `mmOPTIONSBUTTON` (203 × 74) | (418, 236) | +10 | dialogue OPTIONS hors partie (0x44ac50 ; titre `OPTIONS`, pied `DONE` « Terminé », bouton `HELP`) |
| 3 | `mmMOREGAMESBUTTON` (209 × 83) | (406, 306) | −2 | écran « Plus de jeux » 0x44b9c0 (désactivable par la config partenaire, 0x43d03c) |
| 4 | `mmQUITBUTTON` (220 × 100) | (394, 372) | +5 | confirmation `QUIT_ZUMA_?` 0x44e640 |

### OVNI (easter egg, 0x43ed30, 0x43d880, 0x43c550, 0x43d9a0)

Survoler les pierres 0 → 4 dans l'ordre incrémente `0x5a1330` à chaque passage sur la 4 ; à **3** le menu lance l'OVNI : `images/mmufo` (6 lignes → 175 × 84), son `SOUND_UFO` (`ufo1`) en boucle ; trajectoire : (−50, −50) → (300, 210) en 300 maj, puis vol stationnaire 1 000 maj (`x = cx + 40·sin a`, `y = cy − 15·cos a`, a += 1°/maj), puis départ vers (−200, −200) en 50 maj, attente 100 maj, son coupé ; trame `(compteur >> 1) mod 5`. Les yeux le suivent. Clic sur l'OVNI → fondu (`+0xf4`, 25 maj, alpha `n × 255/100`) → crédits **sans** `happyending` (0x44b310(0)).

### Recommandation PWA (D-01)

| Bouton | PWA | Raison |
|---|---|---|
| AVENTURE | actif → écran d'aventure (Q2) | cœur de la phase |
| OPTIONS | actif → notre dialogue natif en mode « hors partie » : titre `OPTIONS`, pied `DONE`, sans `BACK_TO_MAIN_MENU` (comme 0x445310 `inGame = 0`) ; « Aide » y reste | identique à l'original |
| GAUNTLET | **visible, désactivé** (état normal, pas de survol ni de clic) | mode prévu en v2.0 (MODE-01) ; garder la pierre évite un trou dans la tablette |
| PLUS DE JEUX | **visible, désactivé** (même traitement) | sans objet ; l'original le désactive lui-même selon le partenaire |
| QUITTER | **visible, désactivé** ; repli : masqué par la découpe `mmscreen` d'origine (la tablette vide est dessinée dans `mmscreen`) | une PWA ne se ferme pas ; sur iOS impossible |
| Lien « Si ce n'est pas vous » | remplacé par un clic sur la ligne de bienvenue → dialogue de nom (Q4) | un seul profil local |
| Chapeau | jamais | dépend du Gauntlet |
| OVNI | à faire si le budget le permet (fonction pure du compteur) | non demandé explicitement ; repli : omis, noté en différé |

Repli si l'utilisateur préfère masquer les pierres inactives : dessiner `mmscreen` seul à leur place (la tablette vide fait partie du fond).

## Q2. Écran d'aventure et transitions (D-02, PROG-01)

### Composition (0x441b50 et suivantes)

| # | Élément | Position | Détail |
|---|---|---|---|
| 1 | `ADVSKY` (640 × 116) | trois copies, `o = (c >> 2) mod w` | 25 px/s |
| 2 | `ADVBACK` (640 × 250, masque) | (0, 0) | |
| 3 | `ADVTITLE` (185 × 73) | (0, 0) | titre « aventure » dessiné |
| 4 | `ADVHIGHSCORE` (184 × 65) | (456, 0) | plaque des scores |
| 5 | temples (0x43e8b0 → `advtemple4` + `advmiddle`, 0x43e790 → 3/3v, 0x43e670 → 2/2v, 0x43e640 → 1) | translations `+0x1f0..+0x1f8` | décalages animés (le temple 4 « jaillit » : `RUINED_TEMPLE_RISES`, `SOUND_EARTHQUAKE` 0x43e4b2) |
| 6 | nom du temple (`TEMPLE_OF_ZUKULKAN`, `QUETZAL_QUATL`, `POPO_POYOLLI`, `SECRET_SHRINE_OF_ZUMA`) | — | **`QUETZAL_QUATL` et `POPO_POYOLLI` absents de `default.xml` français** (le code teste l'existence, 0x403e60) → repli : texte anglais du code ou rien |
| 7 | `ADVSTAGE` (76 × 16) | (289, 382) | + numéro d'étage `%d` en `FONT_DIALOG`, couleur 0xfbf1b0, en (344, 396) |
| 8 | message de la porte | centré, y 422, `FONT_BROWNTITLE` blanc | un par étage, dans l'ordre : `DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS`, `THE_2ND_LEVEL_OF_THE_TEMPLE_AWAITS`, `WILL_YOU_DESCEND_TO_THE_THIRD_LEVEL`, `YOU_HAVE_UNCOVERED_A_HIDDEN_DOOR`, `THE_GOLDEN_SECRETS_OF_ZUMA_AWAIT_YOU`, `DO_YOU_DARE_ENTER_THE_LAST_CHAMBER`, `ANOTHER_LOST_TEMPLE`, `CAN_YOU_FULFILL_THE_PROPHECY_?`, `THE_LAST_STAGE_?`, `RUINED_TEMPLE_RISES`, `THE_FINAL_SECRET`, `ENTER_THE_RUINS` [ordre MOYEN : lu dans l'ordre des `push` 0x4422a0–0x442400] |
| 9 | seconde ligne | y 456, `FONT_MAIN10OUTLINE2`, 0xffea01 | `CLICK_ON_A_DOORWAY` / `UNCOVER_THE_SECRET_TEMPLES` |
| 10 | scores | noms x 470, scores alignés à droite x 575 (`%d`), y = 70 + i × hauteur de ligne | police `FONT_MAIN8OUTLINESCORE` (système `!program`) ; couleur 0xffff4c (ou 0x28534c selon 0x44ed80) |
| 11 | boutons | `advmainmenubutton` (id 0, 125 × 42 par état), `advplaybutton` (id 1, 97 × 39) | 3 états, son de clic seulement (drapeau 1) ; positions fixées par `Resize` non lu → repli : mesurer sur `advback` (zones prévues dans le décor) |

### Portes (0x449cb2–0x449e57)

12 portes (étages 1–12), image `ADVDOOR{temple}{A,B,C}` (index de ressource 0x2a + i), **4 trames** horizontales (`cols = 4`, ouverture). Position de dessin (x, y) puis point d'ancrage secondaire (probablement le libellé) :

| Étage | Porte (x, y) | Ancre | Étage | Porte | Ancre |
|---|---|---|---|---|---|
| 1 | (226, 300) | (256, 361) | 7 | (452, 154) | (462, 188) |
| 2 | (296, 270) | (327, 364) | 8 | (509, 154) | (521, 192) |
| 3 | (366, 300) | (398, 360) | 9 | (568, 154) | (584, 196) |
| 4 | (0, 164) | (56, 218) | 10 | (220, 35) | (248, 86) |
| 5 | (69, 159) | (116, 201) | 11 | (291, 35) | (324, 86) |
| 6 | (120, 155) | (167, 188) | 12 | (369, 35) | (408, 85) |

`+0x90` = étage maximal atteint du profil (profil +0x30, borné 0..11) : les portes ≤ ce rang sont ouvertes et **cliquables** (`CLICK_ON_A_DOORWAY` « Cliquez sur une porte pour sélectionner un niveau ») → l'original permet de **recommencer à n'importe quel étage débloqué** ; « Jouer » lance l'étage sélectionné. [Sélection/clic : MOYENNE, déduit des chaînes et de `+0x90` ; le gestionnaire de clic n'a pas été lu.]

### Quand l'écran apparaît (0x44f180, 0x44f530, HAUTE sur les appels, MOYENNE sur le sens de `+0x186`)

`ShowAdventureScreen(reprise, étageFini)` :
- depuis « Aventure » : `(1, 0)` → 0x44ef40 cherche une **partie sauvegardée** du profil ; si elle existe, elle est reprise directement (chaînes `DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?` / `SM_CONTINUE` « Continuer » / `NEW_GAME` « Rejouer ») ; sinon écran d'aventure, glissé depuis le haut (0x43a200 avec −hauteur) ;
- après le STATS d'un niveau gagné qui **termine un étage** (`plateau+0x186`, sauvegarde du niveau suivant `+0x128` en 0x41d325) : étage < 12 → `(0, 1)` : écran d'aventure **avec animation d'ouverture de la porte suivante** (0x43e3f0(75 maj, temple = étageMax/3 + 1), 0x43e430(1)) ; étage ≥ 12 → crédits avec `happyending` (Q3) ;
- après un game over : `(0, 0)` (écran simple ; le score a déjà été soumis, Q4) ;
- entre deux niveaux d'un même étage : **pas** d'écran d'aventure (le plateau enchaîne).
- musique : position 32 (0x44f2c9).

### Transitions de temple (TransitionMgr, 0x430320–0x431b10, MOYENNE)

Après les étages 3, 6, 9, 12 et 13 (index de temple = `étage/3`, 0x4317ec–0x43180e, 5 cas) : musique position 32, `SOUND_TEMPLE_COMPLETE` (`chant6`), dialogue du dieu (kit `GodHead`) avec les textes `INTERLOPER_OF_PUNY`, `I_SEE_WHAT`, `NOT_POSSIBLE_TO_BELIEVE`, `FINAL_TEMPLE_STRUCK`, `WE_COME_FROM_STAR`, `EXCELLENT_WORK_FROG_ONE` et les réponses de la grenouille (`RIBBIT` / `I_BEG_TO_DIFFER`, `RIBBIT` / `NEVER_GIVE_UP`, `RIBBIT` / `FULFILL_THE_PROPHECY`, `RIBBIT_?` / `IN_SPACE`, `RIBBIT_!` / `WERD`), la variante dépendant d'un drapeau du profil (`+0x39`). Correspondance texte ↔ temple [ASSUMED, ordre des chaînes] : temple 1 → `INTERLOPER_OF_PUNY`, 2 → `I_SEE_WHAT`, 3 → `NOT_POSSIBLE_TO_BELIEVE`, 4 → `FINAL_TEMPLE_STRUCK` puis `WE_COME_FROM_STAR`, Espace → `EXCELLENT_WORK_FROG_ONE`. Repli si non planifié : bannière `STAGE x TERMINÉ` (`STRING_ID_STAGE` + `COMPLETE`) et `chant6`, sans dialogue.

## Q3. Écran de fin (D-03)

1. Fin du niveau 13-1 : décompte habituel, séquence du dieu (temple 4, Q2), **STATS**, à la fin duquel le score est soumis au tableau (0x440c6a, drapeau `+0xdd` du dialogue) [HAUTE sur l'appel, MOYENNE sur le sens de `+0xdd` et sur l'ordre dieu/STATS].
2. 0x44f530 : étage ≥ 12 → `ShowCredits(1)` (0x44b310) : retire le plateau, crée `CreditsScreen(happy = 1)`, musique position 0 (fondu 0,01).
3. `CreditsScreen` : `happyending` plein écran (0, 0) puis liste de crédits qui **défile vers le haut à 50 px/s** (0x43add0 : `+0x88 −= 1` toutes les 2 maj) ; titres `CREDITS` (« CRÉDITS ») en NativeAlien48, rubriques (`GAME_DESIGN`, `PROGRAMMING`, `ART`, `SOUND_FX`, `MUSIC`, `LEVEL_DESIGN`, `QA`, `POPCAP_FRAMEWORK`, `BIZ_DEV`, `SPECIAL_THANKS_TO`) en NativeAlienExtended18, noms en NativeAlienExtended16 (`FONT_CREDITBROWNTITLE`), interlignes 50 / 35 px ; fondu final ; bouton « Passer » (`STRING_ID_WHATEVER`, `Dialogbutton`, son de clic) ; touche `s` = défilement d'étoiles (`PRESS_THE_S_KEY`, objet de fond `+0x98`) ; `IMAGE_CONGRATULATIONS` (« FÉLICITATIONS ! ») est une image de texte générée (0x4505f2) [usage exact : MOYENNE].
4. « Passer » ou fin du défilement → **menu principal** (0x44b3e0). Pas de saisie de nom, pas de tableau dédié : les scores sont visibles sur l'écran d'aventure.

**Recommandation (D-03 est plus exigeant que l'original) :** `happyending` plein écran + « FÉLICITATIONS ! » (`CONGRATULATIONS`, NativeAlien48 ou NativeAlienExtended18 doré) + score final + **tableau des 10 meilleurs** avec la ligne de la partie en surbrillance, dans le cadre `dialogbox` du STATS, puis crédits défilants optionnels (noms réels **non** reproduits dans le dépôt : les lire dans l'exécutable n'est pas possible proprement → repli : seulement les rubriques traduites, ou pas de crédits), bouton « Passer » / OK → menu principal. Son : `templecomplete` (`chant6`) à l'apparition ; musique en phase 7.

## Q4. Meilleurs scores (D-04, PROG-02)

- Gestionnaire 0x427d60 : `liste = table[clé]` ; insertion triée (0x416bc0, score `+0x28`, nom `+0xc`) ; si la liste dépasse **10** → tronquée à 10 (0x415010(liste, 10)) et sauvegardée (0x427c30) ; renvoie vrai si l'entrée est restée.
- Clé (0x428170) : `plateau+0x194` (nom de l'épreuve en Gauntlet, + suffixe 0x54d37c) ou **`"adventure"`** ; nom = nom du profil (`app+0x8cc`) ; score = `plateau+0xe4`.
- Soumission : perte de la dernière vie (0x4283c4, après la musique « game over » position 39) et fin du STATS final (0x440c6a). **Pas de saisie de nom au record** : le nom vient du profil, créé au premier lancement (`NEW_USER` « NOUVEL UTILISATEUR », `ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE`), renommable (`RENAME_USER`), avec gestion des homonymes (`NAME_CONFLICT`).
- Valeurs par défaut (0x426f20) : clé `adventure` → 3 entrées de 10 000, 5 000 et 1 000 points au nom de membres de l'équipe PopCap ; ne pas reproduire ces prénoms dans le dépôt.
- Affichage : plaque de l'écran d'aventure (Q2, ligne 10) ; aucun « niveau atteint » stocké.

**Recommandation :** `localStorage` `zuma.highscores.v1` = `[{ name, score, stage, level, date }]` trié décroissant, 10 entrées (champs `stage`/`level`/`date` en plus de l'original, utiles pour D-04) ; nom = profil local `zuma.profile.name` demandé **une fois** au premier passage sur l'écran principal (dialogue natif `dialogbox`, titre `NEW_USER`, texte `ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE`, champ texte, OK), modifiable en cliquant la ligne de bienvenue ; repli sans saisie : « Joueur ». Liste vide au départ (ou seuils 10 000 / 5 000 / 1 000 sans nom). Soumission au game over et à la fin de 13-1, position de la partie renvoyée pour la surbrillance.

## Q5. Difficulté (D-06, D-07)

### (a) Mise à l'échelle globale : aucune en aventure (HAUTE)

0x418780 (cible du pousseur) : `cible = speed (+ cumul accrate, plafonné à maxspeed)` ; `× 0,25` si `zumaslow` actif ; zone lente (`slowdistance`, ligne de danger, `slowfactor`) ; **seulement si `plateau+0x187` (Gauntlet)** et après 300 maj : accélération si couverture < 30 % ; puis `mSpeed → cible` à −0,1 / +0,005 px/maj². Aucune lecture du numéro d'étage, du nombre de niveaux finis, des vies ou d'un attribut `difficulty` (ce dernier ne sert qu'aux `LevelProgression` du Gauntlet, 0x42ae41). Aucun niveau d'aventure ne définit `accrate`, `maxspeed`, `mergespeed` (sauf lvl11/12 = défaut 0,05), `slowspeed`, `danger`, `slowdistance`. La progression de difficulté est **entièrement dans `levels.xml`** (vitesse 0,5 → 1,0, `start` 35 → 80 %, `score`, `slowfactor` 4 → 2), que nous appliquons déjà.

### (b) `levels.xml` × `configFromSettings` (progression `StageProgression`)

| Étage | Niveaux (vitesse px/maj · start % · score · slowfactor · single · partime s) |
|---|---|
| 1 | 0,5·35·1000 ; 0,5·35·1000 ; 0,6·40·1500 ; 0,6·40·1500 ; 0,6·35·3500 (slowfactor 4 par défaut, partime 25/35/35/60/135) |
| 2 | 0,75·50·2500 ; 0,75·50·2500 ; 0,8·55·3000 ; 0,8·55·3000 ; 0,55·30·3000 |
| 3 | 0,85·65·3500 ; 0,9·65·3500 ; 0,9·70·4000 ; 0,9·60·4500·sf 4 ; 0,6·45·4500·single 8·zumaslow 500·zumaback 200 |
| 4 | 0,7·45·2000 ; 0,7·45·2000 ; 0,75·50·2500·sf 3,5 ; 0,75·55·3000 ; 0,55·35·3500·sf 3,5 ; 0,7·55·3500·sf 3,5 |
| 5 | 0,75·55·3500 ; 0,8·60·3500 ; 0,8·60·4000·sf 3,5 ; 0,85·65·4000·sf 4 ; 0,65·40·4000 ; 0,85·65·4000·sf 4 |
| 6 | 0,9·70·4500·s 8 ; 0,95·65·4500·s 8 ; 0,9·75·4500·sf 3,5 ; 0,9·55·4500·sf 3,5·s 7 ; 0,65·45·4000·sf 4,2·s 7 ; 0,9·65·4500·sf 3,5 |
| 7 | 0,7–0,85 · 40–60 · 2500–3500 · sf 3,5–4 · s 7/9 |
| 8 | 0,6–0,9 · 45–70 · 3500–4500 · sf 3,5 |
| 9 | 0,7–0,95 · 50–70 · 4500 · sf 2,5–4 · s 8 |
| 10 | 0,6–0,9 · 55–75 · 5000 · sf 3–3,5 · s 8 |
| 11 | 0,65–0,95 · 45–80 · 5000 · sf 3,5 |
| 12 | 0,78–1,0 · 45–75 · 5000 · sf 2–3,5 · s 7 |
| 13 | 0,85·50·10000·sf 3·partime 240 |

(`repeat` absent → 40, sauf lvl11/12 où l'attribut dupliqué vaut 40 puis 50 ; `colors` absent sauf lvl11/12 = 4 ; `firespeed` 6, `reloaddelay` 0, `powerfreq` absent → 3000.)

| Attribut | Mapping actuel | Écart |
|---|---|---|
| `speed` | × 100 px/s | aucun |
| `start` | `startFraction` | aucun |
| `score`, `partime`, `slowfactor`/`slowspeed`, `single`, `repeat`, `zumaback`/`zumaslow`, `danger`, `slowdistance`, `firespeed`, `powerfreq` | conformes aux recherches 01–04 | aucun |
| `mergespeed` | ignoré (`mergeTicks: 12` = 0,05/maj → 20 maj → 12 ticks) | aucun (valeur unique) |
| `maxspeed`, `accrate`, `reloaddelay` | ignorés | sans effet en aventure |
| **`colors`** | repli par étage `4 / 5 / 6` (étages 1–3 / 4–6 / 7–13) | **non résolu** : défaut exécutable 4 (0x40b0ae), aucune surcharge trouvée (parseur 0x4293d0, copie 0x41e790/0x41e910, générateur 0x414b20 dont la surcharge globale 0x58cf30/0x587004 n'est jamais écrite) ; mais les sources publiques (Wikipédia) décrivent violet à partir de l'étage 4 et blanc à partir de l'étage 7, ce que fait notre repli. Si l'exécutable avait raison, nous serions **plus durs**, pas plus faciles → ne rien changer (BASSE) |

### (c) Arrêts du pousseur : notre moteur contre l'original (HAUTE)

**Règle originale (relue) :**
1. **Retrait de la bille arrière** — 0x423a10 parcourt les billes ; quand une bille en destruction atteint 40 maj (0x423a62) et que son nœud est le **premier de la liste** (bille la plus proche de l'entrée, celle que pousse le pousseur, 0x423abc–0x423ac7), alors `mSpeed = 0` et `arrêt = max(arrêt, 40 maj)` (0x423ac9–0x423ad6), puis retrait (0x423970). Les recherches 01 (§1) et 04 ont placé ce code dans « la gestion des insertions » ; la recherche 04 a identifié 0x423a10 comme fin de destruction sans revenir sur ce point.
2. **Rebond au contact / recul ZUMA** — 0x40ad04–0x40ad15 : `arrêt ≥ 20 maj` chaque maj où le recul déplace des billes (déjà dans notre moteur, `contactPusherStopTicks`).
3. Aucune autre écriture du compteur `courbe+0x54` dans le code de jeu (inventaire de toutes les écritures `+0x54` en 0x401000–0x434000 : les autres sont des destructeurs de chaînes ou d'autres structures). **Une insertion n'arrête jamais le pousseur.**
4. À la fin d'un arrêt, `mSpeed` repart de 0 (0x423ca4–0x423caa) et remonte de 0,005 px/maj² — identique chez nous.

**Notre moteur :** `core.ts` 1661–1668 : toute insertion dans le composant 0 (segment poussé) → `stopTicks = max(stopTicks, 24)` et `speed = 0`. Avec une chaîne sans trou, c'est presque chaque tir.

**Coût d'une insertion chez nous** (arrêt 0,4 s + remontée à 50 px/s²) : distance perdue `v·0,4 + v²/100` → 45 px (1,4 bille) à 50 px/s (1-1), 86 px à 75 px/s (2-1), 117 px à 90 px/s, **140 px (4,4 billes) à 100 px/s (12-1)**, par tir.

**Simulation** (`s06sim/sim.mjs`, même robot pour les deux règles : vise la bille de sa couleur la plus avancée, préfère les paires, échange si utile, 1 tir/s, 40 % de tirs « ratés » sur une autre couleur, 6 graines, mesures jusqu'au ZUMA ou à la première vie perdue) :

| Niveau | Arrêt du pousseur (actuel → original) | Vitesse moyenne / nominale | Arrêts armés par insertion | Issue (vies perdues / 6) | Temps joué moyen |
|---|---|---|---|---|---|
| 1-1 | 24,7 % → 9,4 % | 46 % → 57 % | 69 → 0 | 0 → 0 | 25 → 35 s |
| 1-2 | 31,9 % → 6,5 % | 38 % → 55 % | 64 → 0 | 0 → 1 | 24 → 23 s |
| 2-3 | 28,7 % → 6,6 % | 31 % → 37 % | 134 → 0 | 1 → 4 | 82 → 62 s |
| 4-1 | 25,8 % → 4,7 % | 34 % → 45 % | 135 → 0 | 2 → 6 | 81 → 67 s |
| 5-1 | 24,8 % → 7,1 % | 30 % → 39 % | 122 → 0 | 3 → 5 | 127 → 88 s |
| 9-3 | 18,2 % → 4,7 % | 21 % → 25 % | 63 → 0 | 6 → 6 | 83 → 70 s |
| 12-1 | 20,7 % → 3,3 % | 22 % → 27 % | 36 → 0 | 6 → 6 (ZUMA atteint 2 → 0) | 60 → 46 s |
| 13-1 | 26,6 % → 3,5 % | 28 % → 37 % | 86 → 0 | 6 → 6 | 138 → 105 s |

(La vitesse moyenne inclut la zone lente et les rebonds ; les arrêts « bille arrière » de la règle originale sont rares : 0 à 0,7 par partie.) Conclusion : notre chaîne est arrêtée **3 à 5 fois plus souvent** que l'original, avance **15 à 45 % moins vite** en moyenne, et le robot tient **20 à 45 % plus longtemps** — ce qui explique le ressenti de l'utilisateur.

Autres vérifications : recul au contact (0,3 s à `max(50, 150·d)` px/s + 20 maj d'arrêt) et attraction (`v/8` px/maj, `v += 1`) déjà conformes (05-04) ; recul ZUMA conforme ; cadence de tir originale ≈ 10 maj entre deux tirs (0x4024e0 : +0,15/maj jusqu'à 0,6 puis +0,07/maj jusqu'à 1,0) contre 8 ticks (133 ms) chez nous — sans effet pratique (MOYENNE).

### (d) Corrections classées

1. **[Justifiée, HAUTE] Supprimer l'arrêt du pousseur à l'insertion ; l'appliquer au retrait de la bille arrière.** Dans `insertBall` (`core.ts` 1661–1668) retirer l'armement ; dans le retrait des billes détruites (`processRemovals` / fin de `destroyTicks`), si la bille retirée est la bille d'indice 0 de `chain.balls` (la plus petite `s`, explosantes comprises) et que la partie est en cours : `stopTicks = max(stopTicks, pusherStopTicks)`, `speed = 0`. Garder `pusherStopTicks: 24`. Test `r221` : une insertion dans le segment arrière ne modifie ni `stopTicks` ni `speed` ; le retrait de la bille arrière arrête 24 ticks puis relance de 0 ; le retrait d'une bille du milieu n'arrête pas. Ce n'est **pas** un ajustement en pourcentage : c'est une erreur de lecture corrigée (effet mesuré : +15–45 % de vitesse effective). D-07 limite les corrections à de petits pourcentages → **à présenter à l'utilisateur avant exécution**. Repli s'il refuse un changement de cette ampleur : `pusherStopTicks` 24 → 12 à l'insertion (moitié du temps d'arrêt, distance perdue ≈ −45 % à 1-1) en le documentant comme déviation, puis UAT.
2. **[Aucune correction] Accélération par étage/temple, `maxspeed`, aide après une vie perdue** : inexistantes dans l'exécutable.
3. **[Aucune correction, BASSE] `colors`** : garder le repli 4/5/6 (sources publiques) ; question ouverte n° 1.
4. **[Aucune correction] Cadence de tir, rebonds, attraction, recul ZUMA, zone lente** : conformes ou sans effet sur la difficulté.

Aucune correction « en petits pourcentages » n'est justifiée par l'analyse ; la seule correction justifiée est la règle n° 1.

## Don't Hand-Roll

| Problème | Ne pas construire | Utiliser | Pourquoi |
|---|---|---|---|
| Textes de menu, crédits, scores | polices CSS / DOM | `src/bitmapfont.ts` + polices du pack (ajouter NativeAlienExtended16, NativeAlien48) | D-05, rendu identique en 2× |
| Boutons à 3 états | nouveaux widgets DOM | découpe en 3 colonnes de l'image + masque `_…` comme `Menubutton` / `DialogButton` | images avec libellés français intégrés |
| Dialogue de nom | `prompt()` | kit `dialogbox` du STATS / menu (`menudialog.ts`) + un `<input>` invisible pour le clavier mobile | cohérence D-05 |
| Persistance | IndexedDB, serveur | `localStorage` sous `try/catch` | règle du projet ; sync différée |
| Strings | littéraux français | `pack/strings.json` (déjà 215 clés) avec repli littéral | localisation alignée |

## Common Pitfalls

1. **Libellés dans les images** : `mm*BUTTON` portent « AVENTURE »… — ne pas superposer de texte ; état = colonne 0/1/2.
2. **Masques sans couleur** : `_mmsunglow.jpg` et `_mmeyemask.gif` n'ont pas d'image couleur ; la lueur est une **image additive** (le masque sert d'image), la paupière une **découpe de `mmscreen`** à (191, 331).
3. **Ordre ciel/fond** : le ciel est dessiné **avant** `mmscreen` (et `advsky` avant `advback`) — le fond est troué.
4. **Écran d'aventure entre deux niveaux** : l'original ne l'affiche qu'après un étage complet ; l'afficher après chaque niveau casserait le rythme.
5. **Fin 13-1** : aujourd'hui `nextLevel()` repart à `{0,0}` (`main.ts` 395) et `gameover` relance `newGame()` (1261) : les deux chemins doivent mener aux nouveaux écrans.
6. **`?level=S-L`** (revue) doit continuer d'ouvrir un niveau directement sans passer par les menus.
7. **Correction du pousseur** : les tests existants qui supposent l'arrêt à l'insertion (`r216`/`r219`, rechercher `pusherStopTicks`, `stopTicks`) devront être mis à jour, pas supprimés.
8. **Prénoms PopCap** du tableau par défaut et noms des crédits : ne jamais les écrire dans `src/`, `tests/` ou la doc commitée.
9. **Chaînes manquantes** : `QUETZAL_QUATL`, `POPO_POYOLLI` absentes du pack français → repli explicite.
10. **Musique** : positions de `zuma.mo3` (menu 28, aventure 32, crédits 0, game over 39) relèvent de la phase 7 ; ne pas bloquer la phase 6 dessus.

## Code Examples

```ts
// Animations pures du menu principal (compteur c en maj de 10 ms, 0x43d1a0) — positions établies ci-dessus.
export const MM = {
  skyOffset: (c: number, w = 520) => (c >> 3) % w,               // x = o − w, o, o + w ; y 0
  glow: (c: number) => {                                           // additif en (−69, −63)
    let d = c % 500; if (d > 250) d = 500 - d;
    return { alpha: (75 + Math.floor((d * 75) / 250)) / 255, angle: c * Math.PI / 180 * 0.3 };
  },
  eyesRest: { left: { x: 219, y: 368 }, right: { x: 276, y: 355 } },   // centres
  eyeMaskAt: { x: 191, y: 331 }, hatAt: { x: 188, y: 247 }, sunAt: { x: 0, y: 2 },
  buttons: [ // id, image, (x, y), demi-tons de survol (choral1)
    [0, 'mmarcadebutton', 452, 64, 12], [1, 'mmgauntletbutton', 436, 153, 14], [2, 'mmoptionsbutton', 418, 236, 10],
    [3, 'mmmoregamesbutton', 406, 306, -2], [4, 'mmquitbutton', 394, 372, 5],
  ] as const,
};
// WebAudio : transposition = playbackRate 2^(n/12).
```

```ts
// core.ts — règle originale de l'arrêt du pousseur (0x423a10 → 0x423ac7–0x423ad6).
// À l'insertion : rien. Au retrait d'une bille détruite :
if (state === 'playing' && chain.balls[0] === removed) {   // premier nœud = bille arrière, explosantes comprises
  chain.stopTicks = Math.max(chain.stopTicks, this.config.pusherStopTicks); // 40 maj
  chain.speed = 0;                                           // repart de 0 à 0,005 px/maj² (inchangé)
}
```

## State of the Art

| Ancien (nous) | Original | Impact |
|---|---|---|
| Démarrage direct dans 1-1 | chargement → menu → aventure | D-01/D-02 |
| 13-1 → 1-1 | 13-1 → crédits `happyending` → menu | D-03 |
| Pas de tableau | 10 scores par clé, nom du profil | D-04 |
| Arrêt du pousseur à chaque insertion arrière | arrêt seulement au retrait de la bille arrière | difficulté (Q5) |
| `choral1` inutilisé | son de survol des pierres du menu | corrige la recherche 04 (Q2 « jamais lu ») |

## Assumptions Log

| # | Hypothèse | Section | Risque si faux |
|---|---|---|---|
| A1 | `plateau+0x186` = « étage terminé » (sauvegarde du niveau suivant, retour à l'aventure) [ASSUMED à partir de 0x41d325, 0x44f56e, 0x4173d1] | Q2 | écran d'aventure affiché trop souvent ou jamais entre étages |
| A2 | Ordre des 12 messages de porte = ordre des `push` | Q2 | message décalé d'un étage |
| A3 | Correspondance textes du dieu ↔ temples [ASSUMED] | Q2 | texte d'un autre temple |
| A4 | La séquence du dieu précède le STATS final | Q3 | ordre inverse |
| A5 | Les portes débloquées sont cliquables (sélection d'étage) [ASSUMED, chaînes + `+0x90`] | Q2 | sélection d'étage absente dans l'original |
| A6 | Le repli `colors` 4/5/6 correspond au jeu réel (sources publiques) alors que le code lu donne 4 [ASSUMED] | Q5b | difficulté des étages 4–13 (nous serions plus durs si l'exécutable a raison) |
| A7 | Le robot de simulation est représentatif d'un joueur (comparaison relative seulement) | Q5c | ampleur de l'effet, pas son sens |
| A8 | Orbite des pupilles : paramètres (29, 25) / (87, 16) relatifs à la découpe [ASSUMED] | Q1 | regard légèrement décalé |

## Open Questions

1. **Nombre de couleurs par étage.** Su : défaut 4, pas de surcharge trouvée ; sources publiques : 5 dès l'étage 4, 6 dès l'étage 7. Manque : le chemin qui changerait `colors` (peut-être hors des fonctions lues). Recommandation : garder le repli, demander à l'utilisateur s'il se souvient de billes violettes/blanches tôt ; capture du jeu original si disponible.
2. **La correction du pousseur dépasse « petits pourcentages » (D-07).** Recommandation : la présenter comme correction d'erreur de lecture, avec les chiffres de la simulation ; repli 24 → 12 ticks.
3. **Positions des boutons de l'écran d'aventure** (`Resize` non lu). Repli : les poser sur les zones prévues de `advback` mesurées à l'image (capture DPR 2).
4. **Crédits** : reproduire les noms est impossible sans copier des données de l'exécutable dans le dépôt. Repli : rubriques seules ou crédits omis.
5. **Reprise de partie (SC5)** : l'original sauvegarde le niveau suivant après chaque victoire et à la sortie ; à planifier si le budget le permet (`zuma.save.v1` = { stage, level, score, lives }).

## Environment Availability

| Dépendance | Requise par | Disponible | Version | Repli |
|---|---|---|---|---|
| Node | build, tests, simulation | ✓ | 22 | — |
| `objdump` / Python 3 | spike | ✓ | — | — |
| Playwright (global) | captures D-05 | ✓ (`/opt/node22/lib/node_modules/playwright`) | — | captures manuelles |
| Pack privé (`private_assets/`) | importateur, captures | ✓ | — | rendu vectoriel / écran texte |

## Validation Architecture

### Test Framework
| Propriété | Valeur |
|---|---|
| Framework | `node:test` + `node:assert/strict` sur `.compiled/` |
| Config | aucune |
| Rapide | `node tools/build.mjs && node --test tests/r221*.test.mjs` |
| Complet | `npm test` (build + tous les tests + `guard`) |

### Phase Requirements → Test Map
| Req | Comportement | Type | Commande | Fichier |
|---|---|---|---|---|
| PROG-03 | `MM.skyOffset`, `MM.glow`, positions des pierres, transposition du survol, désactivation Gauntlet/Plus de jeux/Quitter | unitaire (fonctions pures) | `node --test tests/r221-presentation.test.mjs` | ❌ Wave 0 |
| PROG-03 | l'app démarre sur le menu (aucun `ZumaEngine` créé avant « Aventure ») | unitaire (machine d'écrans pure) ou e2e Playwright | idem | ❌ Wave 0 |
| PROG-01 | après le dernier niveau d'un étage → écran d'aventure avec porte suivante ; entre deux niveaux d'un étage → niveau suivant direct ; 13-1 gagné → fin ; `?level=` inchangé | unitaire (fonction `afterLevel(progress, outcome)`) | idem | ❌ Wave 0 |
| PROG-02 | tableau : tri, 10 entrées, position renvoyée, game over inclus, `localStorage` indisponible toléré | unitaire | idem | ❌ Wave 0 |
| D-06 | insertion arrière sans arrêt ; retrait de la bille arrière → 24 ticks puis relance de 0 ; retrait au milieu sans arrêt | unitaire moteur | `node --test tests/r221.test.mjs` | ❌ Wave 0 |
| D-05 | captures DPR 2 menu / aventure / fin | manuel (Playwright) | script de scratchpad | — |

### Sampling Rate
- Par tâche : `node tools/build.mjs && node --test tests/r221*.test.mjs`
- Par vague : `npm test`
- Porte de phase : suite verte + `npm run guard`.

### Wave 0 Gaps
- [ ] `tests/r221.test.mjs` (pousseur) ; `tests/r221-presentation.test.mjs` (menu, aventure, scores, machine d'écrans).
- [ ] Mettre à jour les tests qui figent l'arrêt à l'insertion (rechercher `pusherStopTicks` / `stopTicks` dans `tests/`).
- [ ] Importateur : nouvelles images/polices (sans test réseau ; vérifier par `npm run guard` qu'aucune n'entre dans le dépôt).

## Security Domain

| ASVS | S'applique | Contrôle |
|---|---|---|
| V2/V3/V4 | non | pas d'authentification (sync différée) |
| V5 Validation des entrées | oui | nom de profil : longueur ≤ 16, caractères imprimables, rendu en police bitmap (glyphes absents ignorés) ; `localStorage` relu comme non fiable (JSON borné, nombres finis, 10 entrées max) |
| V6 Cryptographie | non | — |

| Menace | STRIDE | Mitigation |
|---|---|---|
| Données `localStorage` corrompues ou falsifiées | Tampering | parse défensif, repli liste vide, jamais d'exception |
| Nom de profil injecté dans le DOM | Tampering/XSS | rendu canvas uniquement ; si un `<input>` sert à la saisie, ne jamais réinjecter via `innerHTML` |
| Ressource originale commitée | Information disclosure (légal) | importateur → `private_assets/pack/`, `npm run guard` |

## Sources

### Primaires (HAUTE)
- PE interne de `private_assets/original/Zuma.exe` (offset 0x1c51a2), `objdump -d -M intel` : fonctions et adresses citées en § Méthode et dans chaque section.
- `private_assets/original/properties/resources.xml` (groupes `MainMenu`, `AdventureScreen`, `LoadingThread`, sons et volumes), `properties/default.xml` (chaînes françaises), `levels/levels.xml` (`StageProgression`, réglages).
- Images mesurées dans `private_assets/original/images/` (tailles listées) ; `private_assets/pack/pack.json` et `strings.json` (contenu déjà importé).
- Code du projet : `src/main.ts` (`start` 221, `newGame` 331, `nextLevel` 386–398, `configFromSettings` 1353), `src/core.ts` (`CANDIDATE` 422–470, arrêt à l'insertion 1661–1668, `stopPusher` 1225).
- Simulation : `scratchpad/s06sim/sim.mjs` (sorties reproduites dans Q5c).

### Secondaires (MOYENNE)
- [Wikipedia — Zuma (video game)](https://en.wikipedia.org/wiki/Zuma_(video_game)) : couleurs ajoutées au fil des étages (violet, blanc) — sert seulement à la question ouverte 1.
- [StrategyWiki — Zuma Deluxe](https://strategywiki.org/wiki/Zuma_Deluxe) : structure en temples (non vérifiée en détail).

## Metadata

**Confiance :** menu principal HAUTE (positions, sons, animations), MOYENNE (orbite des yeux) ; aventure HAUTE (composition, portes), MOYENNE (sélection, messages, `+0x186`) ; fin HAUTE (enchaînement crédits/menu), MOYENNE (ordre dieu/STATS, image de texte) ; scores HAUTE ; difficulté HAUTE (règle du pousseur, absence d'échelle globale), BASSE (`colors`).
**Date :** 2026-10-11 — **valide** tant que l'exécutable de référence ne change pas.
