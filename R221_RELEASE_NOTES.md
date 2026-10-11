# R2.0.21

Cette baseline répond au retour de jeu de l'utilisateur sur R2.0.20 hébergé, après une aventure complète (`06-CONTEXT.md`). Il a demandé quatre choses :

- un écran d'accueil : l'app ne doit plus démarrer directement dans un niveau ;
- un écran de fin après le dernier niveau (13-1), avec le score final comparé aux scores antérieurs, au lieu de recommencer au 1-1 ;
- des écrans de début et de fin conformes aux graphismes de l'original ;
- une difficulté plus proche de l'original : le jeu paraissait un peu trop facile.

La recherche 06 (`06-RESEARCH.md`, lecture de `Zuma.exe`) a établi la composition du menu principal, de l'écran d'aventure, des transitions de temple, de l'écran de fin et du tableau des scores. Elle a aussi trouvé la cause de la facilité : une erreur de lecture des recherches 01 et 04 sur l'arrêt du pousseur. Décisions de l'utilisateur : D-09 (règle originale du pousseur appliquée telle quelle), D-10 (fin sans crédits), D-11 (boutons, animations, sons, profil, valeurs de démonstration) et D-12 (prénom fourni par l'hébergement privé).

Chaque règle cite sa source (adresse lue dans l'exécutable, ou lecture du planificateur / de l'exécutant) et le test qui la verrouille. Ce qui reste une hypothèse est listé en fin de document pour la première session UAT de la phase 6 (`06-UAT.md`).

## Difficulté (`src/core.ts`, `tools/sim-difficulty.mjs`)

- **Règle originale de l'arrêt du pousseur** (D-09, recherche 06 Q5c).
  - **Ce que fait l'original.** La fin de destruction 0x423a10 parcourt les billes. Quand une bille en destruction atteint 40 maj (0x423a62) et que son nœud est le **premier de la liste** (la bille la plus en arrière, celle que pousse le pousseur, 0x423abc–0x423ac7), elle écrit `mSpeed = 0` et `arrêt = max(arrêt, 40 maj)` (0x423ac9–0x423ad6), puis retire la bille. À la fin de l'arrêt, la vitesse repart de 0 (0x423ca4–0x423caa).
  - **Ancienne lecture.** Les recherches 01 (§1) et 04 avaient rangé 0x423ac7–0x423ad6 dans la gestion des insertions. Depuis R2.0.16, **chaque insertion dans le segment arrière** arrêtait donc le pousseur 24 ticks, soit presque chaque tir sur une chaîne sans trou. L'inventaire de toutes les écritures du compteur d'arrêt (`courbe+0x54`) montre qu'une insertion n'arrête jamais le pousseur.
  - **Règle appliquée.** `land()` n'arme plus rien. `processRemovals()` arrête le pousseur (`stopTicks = max(stopTicks, 24)`, `speed = 0`) quand la bille d'indice 0 de la chaîne (explosantes comprises) est retirée, en partie seulement (`playing`). Les bombes sont comprises. La valeur 40 maj = 24 ticks et la relance à 50 px/s² sont inchangées.
  - Verrous `r221` : « an insertion into the rear segment no longer stops the pusher », « removal of the rear ball: no stop during the destruction, 24 ticks at speed 0 from the removal, then a restart from 0 », « removal of a block in the middle (the rear ball survives) stops nothing », « a bomb whose blast removes the rear ball stops the pusher at the removal too », « outside play (clearing / draining) the removal of the rear ball arms nothing », « several chains: only the pusher of the chain whose rear ball is removed stops ». Le test `r216` de l'arrêt à l'insertion est inversé (« R2.0.21 (D-09): an insertion no longer stops the pusher »).
- **Correction supérieure aux « petits pourcentages »** de D-07 : acceptée par l'utilisateur parce qu'elle restitue l'original (D-09). Aucune autre accélération n'est ajoutée.
- **Aucune accélération par étage ou par temple en aventure** (0x418780, recherche 06 Q5a) : la cible du pousseur ne lit ni le numéro d'étage, ni les vies, ni un attribut `difficulty`. L'accélération à faible couverture n'existe qu'en Gauntlet (`plateau+0x187`). La progression de difficulté est entièrement dans `levels.xml`, déjà appliquée.
- **`colors` inchangé** (question ouverte 1 de la recherche, hypothèse A6) : l'exécutable donne 4 par défaut sans surcharge trouvée ; le repli 4 / 5 / 6 par temple suit les sources publiques. Si l'exécutable avait raison, nous serions plus durs, pas plus faciles.
- **Mesure** (`tools/sim-difficulty.mjs`, plan 06-01) : un robot fixe rejoue chaque niveau sans navigateur. 6 graines, horizon 240 s, un tir toutes les 40 ticks, 40 % de tirs ratés. « Ancienne » = la règle R2.0.20 émulée (`legacy-insert`), « nouvelle » = le moteur R2.0.21. Pourcentages seulement :

  | Niveau | Temps à l'arrêt (ancienne → nouvelle) | Vitesse moyenne / nominale (ancienne → nouvelle) |
  | --- | --- | --- |
  | 1-1 | 36,6 % → 12,7 % | 35,4 % → 75,1 % |
  | 1-2 | 31,9 % → 12,4 % | 41,3 % → 72,8 % |
  | 2-1 | 35,4 % → 9,0 % | 31,3 % → 53,9 % |
  | 2-3 | 31,1 % → 11,1 % | 29,4 % → 47,6 % |
  | 3-1 | 28,6 % → 10,7 % | 26,0 % → 36,1 % |
  | 4-1 | 25,0 % → 9,3 % | 45,3 % → 61,8 % |
  | 5-1 | 30,4 % → 10,3 % | 36,2 % → 55,6 % |
  | 6-1 | 28,1 % → 10,2 % | 31,0 % → 50,0 % |
  | 7-1 | 24,3 % → 5,9 % | 31,9 % → 50,2 % |
  | 8-1 | 24,9 % → 8,3 % | 28,6 % → 38,0 % |
  | 9-1 | 25,1 % → 3,5 % | 24,0 % → 29,6 % |
  | 9-3 | 25,9 % → 6,7 % | 22,1 % → 29,2 % |
  | 10-1 | 26,8 % → 7,2 % | 30,9 % → 41,0 % |
  | 11-1 | 25,2 % → 6,2 % | 21,2 % → 27,7 % |
  | 12-1 | 28,8 % → 4,3 % | 17,9 % → 32,0 % |
  | 13-1 | 30,6 % → 5,7 % | 29,6 % → 59,0 % |

  - La chaîne passe 3,5 à 12,7 % du temps à l'arrêt au lieu de 24 à 37 %, et avance 1,2 à 2,1 fois plus vite en moyenne. L'arrêt « bille arrière » est rare (0 à 1 par partie) ; le temps d'arrêt restant vient surtout des rebonds au contact, qui sont originaux.
  - L'émulation `legacy-insert` est recoupée par le moteur R2.0.20 compilé depuis `be4871b` : mêmes chiffres, sans émulation.
  - Les derniers étages deviennent nettement plus durs pour le robot : au 9-1 et au 12-1 il n'atteint plus jamais le ZUMA (6 / 6 et 4 / 6 avec l'ancienne règle).
  - Le robot ne mesure que des effets relatifs (hypothèse A7).
- Verrous `r221-sim` : déterminisme, « original rule: no insertion stop; the emulated R2.0.20 rule stops on insertions and keeps the pusher stopped longer », bornes des mesures, rapport en français, CLI.

## Écran principal (`src/welcome.ts`)

L'app s'ouvre désormais sur le **menu principal de Zuma Deluxe**, composé sur le canvas à partir du pack (D-01, recherche 06 Q1). Aucun moteur n'existe avant le choix du joueur.

- **Composition** dans l'ordre de 0x43d1a0 : ciel `mmsky` ×3, écran `mmscreen` troué par son masque, pupilles, paupières découpées dans `mmscreen` × `_mmeyemask` en (191, 331), lueur additive `mmsunglow` en (−69, −63), soleil `mmsun` en (0, 2), ligne de bienvenue, pierres, OVNI. `mmhat` n'est jamais importé : il dépend du Gauntlet (0x43c730). Verrou `r221-welcome` « drawWelcome: 0x43d1a0 order ».
- **Animations** (fonctions pures du compteur maj) :
  - ciel `(c >> 3) mod 520`, soit 12,5 px/s vers la droite (`mmSkyOffset`) ;
  - lueur : alpha 75 → 150 → 75 sur 500 maj (5 s), rotation 0,3° par maj (`mmGlow`) ;
  - yeux : pupilles au repos en (219, 368) et (276, 355) ; un clic sur la grenouille bascule le suivi du pointeur (ou de l'OVNI), repos + 4 px vers la cible dans une ellipse 6 × 4 (`mmEyes`, repli A8) ;
  - OVNI : trois passages ordonnés sur les pierres 0 → 4 (0x43ed30) le lancent ; (−50, −50) → (300, 210) en 300 maj, vol stationnaire de 1 000 maj, départ vers (−200, −200) en 50 maj, attente de 100 maj ; trame `(c >> 1) mod 5` ; boucle `ufo1` (`mmUfo`, `mmHoverSequence`).
  - Verrous `r221-welcome` : `mmSkyOffset`, `mmGlow`, `mmEyes`, `mmHoverSequence`, `mmUfo`.
- **Pierres** (0x43cf60, 0x434d10) : AVENTURE (452, 64), GANTELET (436, 153), OPTIONS (418, 236), PLUS DE JEUX (406, 306), QUITTER (394, 372), libellés peints dans les images. **Aventure et Options sont actives** ; Gantelet, Plus de jeux et Quitter sont dessinées à l'état normal, **sans survol, son ni clic** (D-11). Verrou `r221-welcome` « MM.stones … only Aventure / Options enabled ».
- **Sons** : survol d'une pierre active = `choral1` à 0,2, transposé de +12 (Aventure) ou +10 (Options) demi-tons (0x434dd1–0x434e01) ; clic = `button1` ; OVNI = `ufo1` en boucle (gain 0,8, coupé à chaque changement d'écran). Verrous `r221-welcome` (« hover sounds choral at 0.2 transposed, click button1, UFO loop »), `audio.js` (« the ufo loop has its own gain and is cut by stopLoops »).
- **Ligne de bienvenue** « Bienvenue dans Zuma, <nom>! » (concaténation originale `WELCOME_TO_ZUMA` + « , » + nom + « ! », NativeAlienExtended16) ; sans profil « Bienvenue dans Zuma ! ». Un clic dessus rouvre le dialogue de nom, à la place du lien « Si ce n'est pas vous ». Verrou `r221-welcome` « welcome line ».
- **OPTIONS hors partie** (0x445310, `inGame = 0`) : titre OPTIONS, sans « Retour au menu principal », pied « Terminé », Aide conservée (`menuWidgets(…, { inGame: false })`). Verrou `r221-welcome` « menuWidgets: OPTIONS out of game ».
- **Entrées** : souris (survol, pression, relâcher sur la même pierre), toucher (sans survol : la pression allume, le relâcher dans la pierre active), clavier (Haut / Bas / Tab entre Aventure et Options, Entrée / Espace pour valider).
- **Repli vectoriel** sans pack : mêmes zones, titre, grenouille aux pupilles mobiles, Aventure / Options lisibles, autres pierres grisées. Verrou `r221-welcome` « drawWelcome: kit null → vector welcome ».
- **Copies 2 ×** (EPX) des images et de la police au-delà de `HD_MIN_SCALE`, découpées à 2 × et dessinées à leur taille logique.
- **Police bitmap à calques** (correctif 06-03) : tous les calques d'un caractère partagent une plume qui avance de la largeur du calque le plus large (`ImageFont::DrawStringEx`). L'ombre de NativeAlienExtended16 a une espace de 15 px contre 11 pour le corps ; elle glissait de 4 px à chaque espace (« ZUMAA, RROMAINN »). Les autres polices du pack ont des calques de même largeur et ne changent pas. Verrou `r221-welcome` « bitmap fonts: all layers share one pen ».

## Profil et reprise de partie (`src/progress.ts`)

- **Nom saisi une fois** (recherche 06 Q4, `NEW_USER` « NOUVEL UTILISATEUR », `ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE`) au premier lancement, dans le dialogue natif (cadre OPTIONS, GodHead, champ, OK). Un OK vide donne « Joueur ». Renommage par la ligne de bienvenue (`RENAME_USER`) ; un OK vide garde le nom. Le champ est un `<input>` invisible posé sur le champ dessiné ; sa valeur ne passe que par `sanitizeName` (lettres, chiffres, ponctuation, symboles, espaces ; 16 caractères au plus) et le nom n'est jamais écrit dans le DOM. Verrous `r221-progress` (« name dialog », `sanitizeName`), `r221-welcome` (« the profile name is never injected into the DOM »).
- **Profil** `zuma.profile.v1` = `{ name, maxStage, source? }` : `maxStage` borné 0..12, n'est écrit que quand il monte. Verrou `r221-progress` (`parseProfile`).
- **Prénom fourni par l'hébergement** (D-12) : sur la version hébergée, le jeu demande `api/me` (même origine, sans cache, abandon à 8 s) et n'accepte qu'un JSON `{ name }`.
  - Le prénom remplace l'absence de profil, le repli « Joueur » ou un ancien prénom fourni par l'hébergement, **jamais un nom saisi sur l'appareil**.
  - Le démarrage attend la réponse 1,5 s au plus ; une réponse plus tardive ferme le dialogue de nom (`profile-detected`).
  - Pas de requête sur `file://`, sans pack, ni sur une adresse locale (`localhost`) : le standalone et l'usage local gardent la saisie unique.
  - Verrous `r221-progress` (« platform name at boot », « platform name never replaces a name typed on this device », « profile-detected event »), `r221-welcome` (« platform first name (D-12) »). Côté hébergement, voir « Outils ».
- **Sauvegarde** `zuma.save.v1` = `{ stage, level, score, lives }`, écrite **au début de chaque niveau** (score et vies du début du niveau). Lecture stricte (`parseSave` : entiers, étage et niveau existants dans le pack, vies 1..99), sinon ignorée. Effacée à la fin de partie et au game over. Verrou `r221-progress` (`parseSave`, « leaving a level »).
- **Reprise** : avec une sauvegarde, « Aventure » ouvre le dialogue « CONTINUER ? » (`DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?`) : « Continuer » reprend le niveau sauvegardé, « Rejouer » efface la sauvegarde et ouvre l'écran d'aventure ; Échap ferme la question sans rien changer. Verrou `r221-progress` (« Aventure: adventure screen on maxStage without a save; continue prompt with one; Continuer / Rejouer »).
- **« Retour au menu principal »** (menu de jeu, après confirmation) mène désormais à l'écran d'aventure, avec la partie sauvegardée au début de son niveau ; elle ne lance plus une nouvelle partie.
- **Revue** `?level=S-L` : le niveau s'ouvre directement et **rien n'est écrit** (ni sauvegarde, ni profil, ni score, ni meilleur temps). Le filtre est appliqué une seule fois, dans `reduceApp`. Verrous `r221-progress` (« review (?level=): no save-run, save-profile nor save-scores »), `r221-adventure` (« a review session (?level=) writes no best time »).
- **Machine d'états** `initialApp` / `reduceApp` : écrans `welcome` → `adventure` → `level` → `temple` → `ending` → `welcome`. Chaque transition renvoie des effets (`start-level`, `save-run`, `save-profile`, `save-scores`, `sound`) exécutés par `main.ts` à un seul endroit ; un événement hors de propos ne change rien et l'état reçu n'est jamais modifié. Verrou `r221-progress` (« out-of-place events change nothing; reduceApp never mutates »).

## Aventure et temples (`src/adventure.ts`)

« Aventure » (ou « Rejouer ») ouvre l'**écran d'aventure original** (D-02, recherche 06 Q2, relevés de l'exécutant dans `adventure-measure.log`).

- **Composition** dans l'ordre de 0x441b50 : ciel `advsky` ×3 (25 px/s, `(c >> 2) mod 640`), `advback`, titre `advTitle` (0, 0), plaque `advHighscore` (456, 0), temples (4 + `advmiddle`, 3, 2, 1), plaque `advstage` (289, 382) avec le numéro d'étage, textes, boutons. Verrou `r221-adventure` « drawAdventure: 0x441b50 order ».
- **Temples** : temples 2 et 3 voilés (`advtemple2v` / `advtemple3v`) tant que `maxStage` < 3 / < 6 ; temple 4 à partir de `maxStage` ≥ 9. Un temple voilé ne porte aucune porte (0x43e670 / 0x43e790). Verrou `r221-adventure` « advTemples ».
- **Portes** : 12 portes `ADVDOOR{temple}{A,B,C}` aux positions de 0x449cb2–0x449e57, quatre trames : 3 sélectionnée, 2 survolée, 1 ouverte, 0 fermée (0x43e5c0). Seules les portes ≤ `maxStage` répondent ; le test de clic lit le rectangle puis l'alpha du pixel de la trame 0 (0x440c90). Un clic sur une autre porte la sélectionne sans son ; un clic sur la porte sélectionnée = « Jouer » (0x440db0 / 0x440e06). Verrous `r221-adventure` (`doorCel`, `doorAt`, « main.js: doors select … the selected door again = Jouer »).
- **Plaque RECORDS** : les **trois** meilleurs scores (0x44286b), noms en x 470 rognés à 567, scores « %d » alignés à gauche en 575, lignes à 70 + i × interligne. Verrou `r221-adventure` « scoreRows (0x44286b) ».
- **Textes** : ligne 1 = nom du temple de la porte sélectionnée (NativeAlienExtended16, blanc, centré sur 326, ligne de base 422) ; ligne 2 = message de la porte (Cancun10 cerné de noir, 0xffea01, 456) ; encadré d'aide (20, 60, 150 × 100) en jaune 0xffff4c : `UNCOVER_THE_SECRET_TEMPLES`, ou `CLICK_ON_A_DOORWAY` pendant le survol d'une autre porte (0x442648–0x442c9e). Noms de repli « QUETZAL QUATL » (0x550504) et « POPO POYOLLI » (0x5504d0), absents du `default.xml` français. Verrous `r221-adventure` (`advLines`, « temple name fallbacks are the literals of the executable »).
- **Boutons** (Resize 0x4414f0) : « Menu principal » (0, 438, 125 × 42) et « Jouer » (542, 441, 97 × 39), trois états, `button1` au relâcher. Verrou `r221-adventure` `advButtonAt`.
- **Enchaînement par étage** (recherche Q2, hypothèse A1) : les niveaux d'un étage s'enchaînent sans écran ; à la fin d'un étage, l'écran d'aventure revient avec la porte suivante sélectionnée. Verrou `r221-progress` (« afterWin »).
- **Arrivée** (0x43e3f0(75, maxStage / 3 + 1), mise à jour 0x43e470) : 75 maj d'attente, puis fondu des temples 2 / 3 sur 100 maj (alpha n × 255 / 100, portes comprises), ou montée du temple 4 sur 300 maj (décalage (300 − n)² / 300) avec `earthquake` à n = 1 et un tremblement horizontal des quatre temples toutes les 4 maj dans ±(10 − n × 10 / 300) px. Les portes ignorent le pointeur pendant l'arrivée (+0x204). Verrous `r221-adventure` (« arrival: revealTemple … revealProgress », `advShakeStep`, « earthquake once, doors locked »).
- **Dialogue du dieu** après les étages 3, 6, 9 et 12 (`templeAfter` 2 → 1, 5 → 2, 8 → 3, 11 → 4, 0x4317ec–0x43180e) et après 13-1 (temple 5) : `templecomplete` (`chant6`), dialogue natif (cadre OPTIONS, GodHead, nom du temple en titre, aucun pour le dialogue final), texte du dieu, un bouton de réponse « <RIBBIT…> <traduction> » qui tourne les pages (deux pour le temple 4) puis ferme. Le plateau du dernier niveau reste figé dessous. Textes : `INTERLOPER_OF_PUNY`, `I_SEE_WHAT`, `NOT_POSSIBLE_TO_BELIEVE`, `FINAL_TEMPLE_STRUCK` puis `WE_COME_FROM_STAR`, `EXCELLENT_WORK_FROG_ONE` (correspondance A3). Verrous `r221-progress` (`templeAfter`, `GOD_LINES`), `r221-adventure` (`godDialogWidgets`, `drawGodDialog`, « temple screen = the frozen board under drawGodDialog »).
- **Révélation** : la réponse au dieu ramène l'écran d'aventure, qui révèle le temple suivant (`revealTemple` 3 → 2, 6 → 3, 9 → 4).
- **Étage « Espace »** (13-1) : après le temple 4, l'écran affiche STAGE 13 avec les textes de la porte 12 et toutes les portes ouvertes.
- **Entrées** : souris, toucher (sans survol), clavier ajouté (Gauche / Droite parcourent les portes ouvertes, Entrée / Espace = Jouer, Échap = Menu principal ; l'original n'a pas de clavier sur cet écran).
- **Repli vectoriel** sans pack : mêmes zones (portes, textes, boutons). Verrou `r221-adventure` « kit null → a vector adventure screen ».

## Fin de partie et meilleurs scores

- **Fin de l'aventure** (D-03, D-10, recherche Q3) : 13-1 gagné → décompte et STATS → dialogue final du dieu (`templecomplete`) → **écran de fin** : `happyending` plein écran, « FÉLICITATIONS ! » (`CONGRATULATIONS`, NativeAlien48, ligne de base 74), plaque RECORDS, tableau des 10 meilleurs (rang, nom, score) dans le cadre `dialogbox` avec la ligne de la partie en jaune 0xffff4c, « Score : N », bouton OK → écran d'accueil. **La partie ne recommence jamais au 1-1.** Verrous `r221-progress` (« afterWin: the last stage of the progression is final (temple 5), never a return to 1-1 »), `r221-adventure` (« ending: endingWidgets … drawEnding happyending … rank row »).
- **Sans crédits** (D-10) : les noms de l'équipe ne sont pas recopiés ; ni défilement, ni lien OVNI → crédits, ni image de texte `IMAGE_CONGRATULATIONS` (la chaîne du pack la remplace). La mise en page de l'écran de fin est la nôtre (aucun équivalent original).
- **Tableau** `zuma.highscores.v1` = `{ adventure: [{ name, score, stage, level, date }] }` (clé `adventure` de 0x428170), trié décroissant, **10 entrées** (0x427d60 / 0x415010). Une nouvelle entrée se place après les scores égaux ; l'insertion renvoie son rang (ou rien si elle sort). Lecture défensive (`parseScores` : nom valide, score entier positif sûr, 10 au plus). Verrous `r221-progress` (« high-score constants », `insertScore`, `parseScores`).
- **Soumissions** (recherche Q4) : à la **perte de la dernière vie** (0x4283c4 ; envoyée par `checkOutcome` une seule fois par niveau, avant l'ouverture du STATS) et à la **fin du STATS final** (13-1). Le nom est celui du profil, sinon « Joueur ». Verrous `r221-progress` (« defeat … game over submits the score »), `r221-adventure` (« the game over is submitted by checkOutcome … once per level »).
- **Valeurs de démonstration** : Zuma 10 000, Grenouille 5 000, Têtard 1 000 — les seuils de 0x426f20, sans les noms de l'original. Verrou `r221-progress` (`defaultScores`).
- **Routage après un niveau** :

  | Fin du niveau | Écran suivant |
  | --- | --- |
  | gagné, niveau suivant dans l'étage | niveau suivant directement (sauvegarde) |
  | gagné, fin d'un étage sans temple | écran d'aventure, porte suivante sélectionnée |
  | gagné, fin des étages 3 / 6 / 9 / 12 | dialogue du dieu, puis écran d'aventure avec la révélation |
  | gagné, 13-1 | STATS, dialogue final, écran de fin, puis accueil |
  | perdu avec des vies | même niveau, score du début du niveau |
  | game over | score au tableau, sauvegarde effacée ; OK du STATS → écran d'aventure |
  | « Retour au menu principal » | écran d'aventure, partie sauvegardée au début du niveau |

  Verrous `r221-adventure` (« closeStats sends won / retry / leave … never a new game or a wrap to 1-1 »), `r221-progress` (« victory », « defeat », « leaving a level »).
- **Meilleurs scores locaux** : propres à chaque appareil (et à chaque navigateur), **non synchronisés** (différé, phase 5 D-39 / D-42).
- Le libellé vectoriel du STATS après un game over est « OK ».

## Outils

- **Importateur** (`tools/import-original.mjs`) : ajoute les images du menu principal (`mmsky`, `mmscreen` et son masque, soleil et lueur, pupilles et masque des yeux, `mmUFO`, cinq pierres avec masques), de l'écran d'aventure (`advsky`, `advback`, `advmiddle`, temples dont `2v` / `3v`, 12 portes avec masques, `advTitle`, `advHighscore`, `advstage`, `advplaybutton`, `advmainmenubutton`) et `happyending`, ainsi que les polices NativeAlienExtended16, NativeAlien48 et Cancun8. **Relancer `npm run import`** : un pack plus ancien n'a pas ces images, et les écrans passent en repli vectoriel. Verrous `r221-welcome` (« importer »), `r215-import` (FONTS).
- **`tools/sim-difficulty.mjs`** : simulation sans navigateur de la difficulté, niveau par niveau.
  - `node tools/sim-difficulty.mjs [--levels=1-1,2-3] [--seeds=6] [--horizon=240] [--shot=40] [--miss=0.4] [--compare] [--pack=<dossier>|none]` ;
  - sans pack (ou `--pack=none`) : niveaux procéduraux, notés `P1`, `P2`… ; avec le pack, par défaut le premier niveau de chaque étage ;
  - `--compare` ajoute l'ancienne règle émulée (`legacy-insert`) ;
  - rapport en pourcentages et compteurs : temps à l'arrêt, vitesse moyenne / nominale, arrêts par insertion et par bille arrière, issue ; aucun fichier écrit ;
  - il lit `.compiled/` : lancer d'abord `npm test` ou `node tools/build.mjs` (sinon code 1 et message explicite).
- **Hébergement : `api/me`** (D-12, commit `c0ca85b`) :
  - `tools/d1worker.mjs` génère, dans le worker de l'hébergement privé, une route `GET /api/me` qui répond `{ "name": "<prénom>" }` pour l'adresse e-mail de l'identité Access (JWT validé), sans cache ; 404 pour une adresse inconnue ou une table vide, 403 sans jeton, 405 pour une autre méthode ;
  - les prénoms viennent de la table privée `players` de `private_assets/deploy.json` : `{ "players": { "joueur@example.org": "Prénom" } }` ;
  - le worker ne contient que les **empreintes SHA-256** des adresses (minuscules, espaces retirés) et les prénoms, jamais une adresse ;
  - toute adresse de `players` est aussi autorisée (`readConfig` de `tools/deploy.mjs`), sans doublon avec `allow` ; une table mal formée arrête le déploiement avant tout appel, sans imprimer d'adresse ;
  - prénom : une lettre puis lettres, espaces, apostrophes ou traits d'union, 20 caractères au plus.
  - Ajouter un joueur : voir le README, « Jeu hébergé en privé ».
  - Verrou `tests/r221-api-me.test.mjs`.
- **Build** : `progress`, `welcome` et `adventure` rejoignent `MODULES` (après `menudialog`, dans cet ordre, avant `main`), le shell du service worker et le standalone. Verrous `r215-presentation`, `r218-presentation`, `r221-progress`, `r221-welcome`, `r221-adventure` (« bundle »).
- `?debug=1` : `debugState()` renvoie aussi `app` (état de la machine, lecture seule).

## Tests

- Nouveaux fichiers :
  - `tests/r221.test.mjs` (10, plan 06-01) : arrêt du pousseur au retrait de la bille arrière, jamais à l'insertion ; baseline 2.0.21.
  - `tests/r221-sim.test.mjs` (7, plan 06-01) : outil de simulation sur les niveaux procéduraux.
  - `tests/r221-progress.test.mjs` (33, plan 06-02) : progression, portes, textes, scores, profil, sauvegarde, machine d'états, prénom de l'hébergement.
  - `tests/r221-welcome.test.mjs` (25, plan 06-03) : importateur, géométrie et animations du menu principal, composition, dialogues, OPTIONS hors partie, câblage de `main.js`, plume partagée des polices.
  - `tests/r221-adventure.test.mjs` (30, plan 06-04) : géométrie de l'écran d'aventure, arrivée, composition, dialogue du dieu, écran de fin, câblage et routage.
  - `tests/r221-api-me.test.mjs` (5, D-12) : route `api/me`, empreintes, `playerNames`, adresses de `players` autorisées.
- **Verrous ajustés**, commentés « R2.0.21 » ; aucun n'est affaibli, la règle qu'ils verrouillaient est remplacée :
  - `r216` : « an insertion into the rear segment halts the pusher 24 ticks » devient « R2.0.21 (D-09): an insertion no longer stops the pusher » ;
  - `r220-presentation` : la baseline 2.0.20 devient « superseded » (version > 2.0.20, égale à `package.json`) ;
  - `r215-presentation`, `r218-presentation` : listes `MODULES` avec `progress`, `welcome`, `adventure` ;
  - `r215-import` : `FONTS` avec les trois nouvelles polices ;
  - `r217-presentation` : `rampPlan(loop.target, target, LOOP_GAINS[key])` (gain propre à chaque boucle) ;
  - `r221-progress`, `r221-welcome` : `MODULES` et shell du worker suivent les plans 06-03 / 06-04.
- **Total : 483 tests** + garde de publication. R2.0.20 en comptait 373 au départ de la phase 6 ; s'y ajoutent 10 `r221`, 7 `r221-sim`, 33 `r221-progress`, 25 `r221-welcome`, 30 `r221-adventure` et 5 `r221-api-me`.

## Build

_Complété à la vérification finale (plan 06-05, tâche 3)._

## Hypothèses à confirmer en UAT

Elles sont listées pour la première session de la phase 6 (`06-UAT.md`).

Recherche 06 :

- **A1** : `plateau+0x186` = « étage terminé » ; l'écran d'aventure n'apparaît qu'après un étage complet.
- **A2** : ordre des 12 messages de porte = ordre des `push` (0x4422a0–0x442400).
- **A3** : correspondance des textes du dieu avec les temples (ordre des chaînes).
- **A4** : le dialogue du dieu suit le STATS final, puis l'écran de fin (ordre STATS → dieu).
- **A5** : les portes débloquées sont cliquables et « Jouer » lance l'étage sélectionné.
- **A6** : repli `colors` 4 / 5 / 6 par temple (question ouverte 1).
- **A7** : le robot de simulation ne mesure que des effets relatifs.
- **A8** : orbite des pupilles (repos + 4 px dans une ellipse 6 × 4).
- **D-09** : la bille arrière est le premier nœud de la liste, billes en file derrière l'entrée comprises ; un retrait pendant que la file alimente encore n'arrête rien.

Lectures du planificateur et des exécutants :

- **Cels des portes** : sens de `+0x1e4` / `+0x1e8` (3 sélectionnée, 2 survolée, 1 ouverte, 0 fermée).
- **Positions des temples** et **montée du temple 4** : amplitude 300 px, courbe quadratique, tremblement tiré par un générateur à graine (l'original utilise `rand()`).
- **Boutons d'aventure** : positions lues dans Resize 0x4414f0.
- **Lueur du soleil** : blanc additif avec l'alpha (couleur de colorisation non lue).
- **OVNI** : positions = coin haut-gauche de la trame ; formule du vol stationnaire littérale (15 px plus haut que le point d'arrivée au départ) ; 5 trames sur 6 ; gain 0,8 de `ufo1`.
- **Comptage du survol** : un saut remet l'attente à zéro et garde les tours ; une entrée compte seulement sur une pierre différente de la dernière.
- **Ordre de dessin** : pierres après la ligne de bienvenue, OVNI en dernier.
- **Libellé de la réponse** du dieu : « <RIBBIT…> <traduction> » sur un seul bouton.
- **Noms de repli** `QUETZAL_QUATL` / `POPO_POYOLLI` : littéraux anglais de l'exécutable, absents du pack français.
- **Ligne « Bienvenue dans Zuma, <nom>! »** : sans espace avant « ! » (concaténation originale).
- **Noms de démonstration** Zuma / Grenouille / Têtard (seuils originaux, noms à nous).
- **`CLICK_ON_A_DOORWAY` / `UNCOVER_THE_SECRET_TEMPLES`** dans l'encadré d'aide en haut à gauche ; première ligne de base = haut de l'encadré + ascendante de la police.
- **Polices « !program »** approchées : `FONT_MAIN10OUTLINE2` = Cancun10 cerné de 1 px noir, `FONT_MAIN8OUTLINE(SCORE)` = Cancun8 cerné, `FONT_DIALOG` = Cancun12 du STATS.
- **« STAGE 13 »** pour l'étage Espace (l'original borne à la porte 12 / STAGE 12).
- **Mises en page à nous** : dialogue du dieu (cadre OPTIONS, texte aligné à gauche, pas de titre au dialogue final) et écran de fin (titre 74, plaque 84, cadre 118–472, lignes dès 178, score 374, OK 400), D-10.
- **Clavier** sur l'écran d'aventure : ajout (l'original n'en a pas).
- **Délai de 1,5 s** avant le dialogue de nom sur la version hébergée (attente de `api/me`).

Constats cosmétiques connus (non corrigés) :

- sous le dialogue du dieu, le plateau figé montre encore les « +100 » flottants du décompte et le bouton STATS tactile ;
- les virgules de Cancun12 sont petites (police d'origine, visible dans les longs textes du dieu).

Différé :

- **Musique** (phase 7) : positions 28 (menu principal), 32 (aventure, temples), 0 (fin) et 39 (game over) non jouées ; le curseur Musique reste inerte.
- **Synchronisation des scores** entre appareils (phase 5 D-39 / D-42).
- **Gantelet, Plus de jeux, Quitter** (v2.0, MODE-01) ; écran de chargement `LoaderBar`.
- **Crédits** (D-10) ; **dix niveaux de plus** (D-08 : procédure seulement, `.planning/notes/niveaux-supplementaires.md`).
