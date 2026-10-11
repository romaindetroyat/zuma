# R2.0.20

Cette baseline répond au huitième tour d'UAT sur R2.0.19 (constats U39–U43 de `05-UAT.md`). Elle couvre trois points :

- le bouton OK du STATS, posé désormais par la règle du `Dialog` original lue dans `Zuma.exe` (U39, D-36, addendum Q5 du spike 02) ;
- une PWA complète, installable et jouable hors ligne (U40), dans le périmètre révisé D-42 : la PWA est exactement le jeu des standalones, c'est-à-dire le build `--local` avec le pack original embarqué ;
- l'installation aussi simple sur iPhone / iPad que sur Mac / PC (U41, D-38).

Les décisions de l'utilisateur (D-43) s'appliquent :

- le standalone reste maintenu et livré à chaque version ;
- l'hébergement privé sur Cloudflare (Pages derrière Access, connexion par code à usage unique) et la synchronisation des scores (U42) relèvent du plan suivant (05-16). **Rien n'est hébergé ni déployé par cette version.** L'artefact `npm run deploy` est seulement produit, pour un hébergement privé à venir.

Une régression de l'astuce du STATS, relevée sur les captures de R2.0.20, est corrigée en 05-15 (voir « Astuce »). Chaque règle cite sa source et le test qui la verrouille. Ce qui n'a pu être vérifié qu'en émulation est listé en fin de document pour l'UAT 9.

## STATS (`src/statsdialog.ts`, `src/menudialog.ts`)

- **Règle du bouton de pied** (U39, D-36, spike 02 Q5).
  - **Ce que fait l'original.** Le constructeur du STATS 0x446ec0 appelle 0x43ef30 en mode 3 `BUTTONS_FOOTER` (un seul bouton) avec l'en-tête : marges de fond **0 / 80 / 0 / 0** et de contenu **36 / 52 / 36 / 36** (gauche / haut / droite / bas). `mButtonHeight` = hauteur de l'image `DialogButton` = **48** (0x4b34b2). `Dialog::Resize` (0x4ac160, entrée 25 de la vtable 0x554554) pose le bouton unique à fond + contenu à gauche, collé au bord bas intérieur, sur toute la largeur intérieure (W − 72). Le dialogue mesure 460 px de large à partir de y 90 (0x434540).
  - **Conversion vers notre cadre.** Le masque `_dialogbox` laisse 11 px transparents à gauche, 3 à droite et 11 en bas autour de notre cadre opaque mesuré (109, 91, 422 × 355). Les 36 px deviennent donc 25 / 33 / 25. L'écart horizontal de 4 px est partagé, car les deux boîtes sont centrées sur 320 : `STATS_OK_RULE` = **29 / 29 / 25 / 48**, `statsOkRect` → OK = **{ 138, 373, 364 × 48 }** (R2.0.19 : 260, 382, 120 × 48).
  - Verrous `r220-presentation` : « statsOkRect: single footer button of Dialog::Resize (0x4ac160) inside a frame », « STATS_OK_RULE: insets read in Zuma.exe converted to our opaque frame (36 − mask margins), DialogButton height 48 ».
- **Dessin en trois tranches**, partagé avec le menu : `drawDialogButton(ctx, image, état, rect, échelle, bord 22)` découpe l'état (normal / survol / pressé) de `DialogButton` en bord gauche, centre étiré et bord droit. Le bouton du menu passe par la même fonction, avec un rendu identique. Le libellé `DIALOG_BUTTON_OK` est centré (ligne de base `ok.y + 30`) et décalé d'un pixel quand le bouton est pressé. Verrou : `r220-presentation`.
- **Zone cliquable alignée** : le contrôle transparent `#result-continue` couvre exactement le bouton peint. Règle CSS `#stats.stats-original .stats-ok` : 21,5625 % / 77,7083 % / 56,875 % / 10 %. Verrou `r220-presentation` « CSS: the transparent OK control covers the painted button exactly ».
- **Encart de l'astuce** : il garde son haut (y 320, les lignes restent au-dessus pour toute hauteur de ligne permise, verrou `r216`) et se termine 2 px au-dessus de l'OK (hauteur 60 → 51, ligne de base 350 → 348).
- **Pied du menu inchangé** : la règle R2.0.18 30 / 30 / 22 est conservée, à 1 px horizontalement et 3 px verticalement de celle du STATS. Verrou `r220-presentation` « the menu footer keeps its R2.0.18 rectangle ».

### Astuce : texte complet en Arial12Bold (correctif 05-15)

- **Constat.** Sur la capture R2.0.20 du niveau 3-3, l'astuce s'affichait en Cancun10 majuscule, tronquée : « FAITES TRAVERSER UN ESPACE VIDE OU PLUS À UNE BALLE POUR OBTENIR UN... ». La capture R2.0.19 de l'utilisateur la montrait complète en Arial12Bold sur deux lignes (« Appuyez sur la barre d'espace / pour mettre le jeu en pause. »).
- **Cause.** Ce n'est ni le chargement ni la 2 × : le kit charge bien `Arial12Bold` comme police d'astuce, en 1 × comme en 2 × EPX (mesuré dans Chromium à DPR 1 et 2). La cause est la mise en page D-20, inchangée depuis R2.0.17 : deux lignes de 270 px après « ASTUCE : » ne logent que **2 des 7** astuces du pack en Arial12Bold.
  - Pour les cinq autres, `layoutTip` passait à Cancun10, une police qui met les minuscules en capitales, puis coupait avec « ... ».
  - L'astuce est tirée au hasard : la capture R2.0.19 était tombée sur une astuce courte.
  - Le pied de 05-14 (hauteur de l'encart, ligne de base), la mémoïsation des polices, le service worker et le standalone n'y sont pour rien.
- **Pourquoi pas deux lignes.** En Arial12Bold, l'astuce la plus longue (« Créez des combos… ») demande **451 px par ligne** pour tenir sur deux lignes, plus que la largeur du cadre entier (422 px).
- **Règle retenue** (`layoutTipBlock`) :
  1. l'astuce reste en colonne après l'étiquette, sur deux lignes, quand elle y tient : présentation de R2.0.19, inchangée, pour 2 astuces sur 7 ;
  2. sinon, elle passe en **paragraphe à étiquette en tête sur trois lignes**, dans la même police : la première ligne après « ASTUCE : », les suivantes depuis l'abscisse de l'étiquette (347 px), lignes de base 336 / 350 / 364, étiquette sur la première ;
  3. la police réduite puis « ... » ne servent plus qu'au-delà de trois lignes, ce qu'aucune astuce du pack n'atteint.
- **Verrous** (`tests/r220-tip.test.mjs`) :
  - « loadStatsKit: Arial12Bold is the tip font whenever the pack provides it, Cancun10 only its fallback » ;
  - « layoutTipBlock: two lines after the label when they hold the tip (R2.0.19 look), else a three-line run-in paragraph in the same font » ;
  - « composeStatsDialog draws every original-length tip complete with the tip font » ;
  - « pack (when present): every tip of strings.json holds in Arial12Bold inside the tip inset, without ellipsis » (sauté sans pack).
  - Le verrou `r217-presentation` suit le nouveau point d'entrée.

## PWA hors ligne et mises à jour (`public/sw.js`, `tools/swgen.mjs`, `src/pwa.ts`)

- **La PWA est le build `--local`** (D-42) : le même jeu que le standalone, avec le pack original embarqué sous `assets/`. Il n'y a pas d'import de fichier, pas d'installeur, pas de site public.
- **Service worker généré**, à partir d'un modèle lisible (`public/sw.js`) rempli au build par `tools/swgen.mjs` :
  - deux caches, **`zuma-shell-<build>`** (le shell de cette version) et **`zuma-assets-<empreinte>`** (le pack ; empreinte = sha256 des chemins, tailles et contenus, 12 chiffres hexadécimaux, `packHash`) ;
  - à l'installation, le shell est précaché, puis **seules les entrées du pack absentes** du cache sont téléchargées, par lots de 8. Une entrée en échec ne fait pas échouer l'installation : elle est reprise à sa première demande.
  - Verrous `r220-pwa` : « dist/sw.js: shell = MODULES exactly + statics, two caches, skipWaiting only on message, no index.html for sub-resources », « install precaches the shell, then only the pack entries that are missing, without skipWaiting ».
- **Routage** (GET de même origine seulement) :
  - `assets/` est servi d'abord depuis le cache du pack ;
  - le shell est servi depuis le cache de sa version ;
  - les navigations utilisent le shell, puis le réseau, puis `index.html` en cache, ce qui rend le jeu jouable **hors ligne après la première visite** ;
  - une sous-ressource absente reste une erreur (jamais `index.html`) ;
  - `api/` et `cdn-cgi/` ne sont jamais interceptés ni mis en cache (prévu pour l'hébergement privé et les scores) ;
  - chaque version ne lit que ses propres caches.
  - Verrous : `r220-pwa` (exécution du worker généré dans `node:vm` sur des caches simulés).
- **Mises à jour confirmées** : une nouvelle version s'installe en arrière-plan et attend.
  - Le bandeau « Nouvelle version disponible » propose « Mettre à jour » (message `skip-waiting`, puis un seul rechargement sur `controllerchange`) ou « Plus tard ».
  - **Le pack n'est pas retéléchargé** si son empreinte n'a pas changé.
  - La première installation est automatique.
  - `activate` ne garde que les deux caches courants.
  - Verrous : `r220-pwa` (« updateReady: only with a controller and a worker installed / waiting », « message skip-waiting → skipWaiting; activate keeps only the shell and pack caches, then claims », bandeau de `index.html`).
- **Stockage** :
  - `navigator.storage.persist()` est demandé une fois le worker prêt, sauf dans Firefox, qui affiche alors une invite ; `persisted()` y est seulement lu (`shouldRequestPersist`).
  - La taille occupée est affichée dans le badge de la vue Aide (« hors ligne : 6,0 Mo », `formatSize`).
  - Verrou : `r220-pwa` (« formatSize: French megabytes with one decimal »).

## Installation (manifeste, icônes, guide par plateforme)

- **Icônes PNG générées au build sans dépendance** (`tools/icons.mjs` : rastérisation de `icon.svg` suréchantillonnée 4 × 4, encodeur PNG et CRC-32 maison) :
  - `icon-192`, `icon-512` (coins transparents) ;
  - `icon-maskable-512` et `apple-touch-icon` 180 (fond opaque #120c06, dessin à 80 % dans la zone sûre).
  - Verrou `r220-pwa` : le test décode les PNG avec sa propre table CRC et `zlib.inflateSync`.
- **Manifeste** : `id`, `start_url` et `scope` relatifs (`./`, valables à la racine comme dans un sous-dossier), `display: fullscreen` avec `display_override`, orientation paysage, `categories`, `dir`, icônes PNG et SVG. Verrou : `r220-pwa`.
- **Métadonnées Apple** : `apple-touch-icon` 180, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, barre d'état `black-translucent`, titre « Zuma », `viewport-fit=cover`. Verrou : `r220-pwa`.
- **Guide par plateforme** (`installGuidance`), dans l'ordre :
  - mode installé, ou page hors http(s) (le standalone `file://`) → rien ;
  - invite `beforeinstallprompt` conservée (Chrome, Edge, Android) → bouton **« Installer Zuma »** ;
  - iPhone / iPod / iPad, et iPadOS qui s'annonce comme un Mac avec plusieurs points de contact → « Touchez Partager puis **« Sur l'écran d'accueil »** » avec le pictogramme de partage ;
  - Safari macOS → « Dans Safari : **Fichier › Ajouter au Dock** » ;
  - sinon → rien.
  - La carte s'ouvre sur l'écran de départ avant la première partie (« × » retient le refus, « Jouer » continue sans le retenir) et depuis la vue Aide du menu par le bouton **« Installer »**. Elle se ferme à `appinstalled`.
  - Verrous `r220-pwa` (`installGuidance`, dont « no install guide outside http(s) ») et `r220-presentation` (bouton « Installer » de la vue Aide).
- **Aucun bouton de partage**, ni dans le jeu ni dans le menu (D-42). Verrou de source `r220-pwa` : `pwa.js` n'appelle aucune API d'écriture ou de partage.

## iOS / iPadOS

- **Marges sûres** : le corps de page reprend `env(safe-area-inset-*)`. `applyScaling` loge la scène dans `fitArea(largeur, hauteur, marges)`, lues sur le rembourrage calculé. Verrou : `r220-ios`.
- **Tactile** :
  - `touch-action: none`, sans sélection, sans menu contextuel ni surbrillance au toucher ;
  - `gesturestart` et `dblclick` neutralisés sur la scène ;
  - **un toucher sur la grenouille échange** les billes (`frogHit`, rayon 32 px : ni visée ni tir), un toucher ailleurs vise et tire ; la souris garde le clic droit ;
  - MENU, STATS, curseurs et cases se manipulent au doigt.
  - Verrou `r220-ios` (`frogHit` → `swap`).
- **Plein écran** : la case « Plein écran » n'apparaît que si l'API Fullscreen existe (`document.fullscreenEnabled`), ce qui n'est pas le cas sur iPhone. « Pixels nets » garde sa place. Verrou : `r220-ios`.
- **« Tournez votre appareil »** (`needsRotation` : portrait, pointeur grossier, petit côté de l'écran < 600 px) : la superposition met une partie en cours en pause et ne lève que sa propre pause au retour en paysage. Un niveau qui démarre dessous reste en pause. Les entrées sont ignorées tant qu'elle est affichée. Sur iPad en portrait, le jeu s'affiche entre deux bandes. Verrou : `r220-ios`.
- **Audio** :
  - `navigator.audioSession.type = 'ambient'`, posé avant la création du contexte : les sons se mêlent aux autres sons et **respectent l'interrupteur silencieux** (décision de l'orchestrateur ; « playback » les jouerait même en silencieux) ;
  - déblocage au premier `touchend` / `pointerup` / `click` (`bindUnlock`) ;
  - reprise d'un contexte `suspended` ou `interrupted` quand la page redevient visible ;
  - repli m4a inchangé.
  - Verrou : `r220-ios`.

## Outils

- **`node tools/build.mjs --deploy`** (script `npm run deploy`) :
  - implique `--local` et refuse l'absence de pack (code 1, message en français, `deployError`) ;
  - génère `dist/sw.js` et écrit `dist/version.json` (version, build, empreinte du pack, nombre de fichiers) ;
  - journalise « artefact de déploiement : dist/ (N fichiers, X Mio, empreinte du pack h) — à héberger uniquement en privé ».
  - Verrous : `r220-pwa`.
- **`tools/swgen.mjs`** (`packFiles`, `packHash`, `swSource`, `deployError`) et **`tools/icons.mjs`** (`crc32`, `encodePng`, `renderIcon`, `ICONS`) : fonctions pures que les tests appellent sur des dossiers temporaires.
- `tools/build.mjs` : le module `pwa` est ajouté à `MODULES` après `original`. La liste du shell comprend `./`, `./index.html`, les fichiers de `dist/public` (icônes comprises) et chaque module. Le standalone retire les liens PNG / `apple-touch-icon` et n'enregistre aucun service worker.
- **Rien n'est déployé par le dépôt ni par la CI** : la CI construit toujours la copie publique (code seul) et lance la garde. L'artefact `--deploy` contient le pack et ne doit être hébergé qu'en privé (plan 05-16, à venir).

## Tests

- `tests/r220-presentation.test.mjs` (9, plan 05-14) : `statsOkRect`, `STATS_OK_RULE`, OK dans le cadre et sous l'astuce, pied du menu inchangé, zone CSS, `drawDialogButton` (trois tranches) et son partage STATS / menu, bouton « Installer » de la vue Aide, baseline 2.0.20.
- `tests/r220-pwa.test.mjs` (17, plan 05-14) :
  - `packFiles`, `packHash`, `swSource`, `deployError` ;
  - worker généré exécuté dans `node:vm` : installation, mise à jour sans retéléchargement, `activate`, `skip-waiting`, routage `assets/` / shell / navigations / `api/` ;
  - `updateReady`, `formatSize`, bandeau de mise à jour, enregistrement par `pwa.ts` ;
  - icônes PNG décodées, manifeste, métadonnées Apple, standalone sans manifeste ni liens PNG, `installGuidance` (dont `file://`), aucun partage.
- `tests/r220-ios.test.mjs` (7, plan 05-14) : `frogHit`, `needsRotation`, `fitArea`, menu sans API Fullscreen, CSS tactile et marges sûres, `main.js` (toucher la grenouille = échange, zoom neutralisé, pause de la rotation), `audio.js` (`audioSession` « ambient », déblocage, reprise).
- `tests/r220-tip.test.mjs` (4, plan 05-15) : police d'astuce du kit, `layoutTipBlock`, composition complète en police d'astuce, sept astuces du pack sans points de suspension (sauté sans pack).
- **Verrous ajustés**, commentés « R2.0.20 » ; aucun n'est affaibli, la règle qu'ils verrouillaient est remplacée :
  - `r215-presentation` : l'ancien rectangle `{ 260, 382, 120, 48 }` devient « h = 48 », le centrage est conservé ; liste des modules du standalone avec `pwa`.
  - `r218-presentation` : liste `MODULES` du build avec `pwa` après `original`.
  - `r219` : la baseline a avancé.
  - `r217-presentation` (05-15) : le bloc de l'astuce appelle `layoutTipBlock`, qui retombe sur `layoutTip`.
- **Total : 284 tests** + garde de publication. R2.0.19 en comptait 247 ; s'y ajoutent 9 `r220-presentation`, 17 `r220-pwa`, 7 `r220-ios` et 4 `r220-tip`.

## Build

- **Suite** : `npm test` → **284 tests** verts + `publication guard: 529 tracked files, none proprietary`. Fichiers : r206, r211, r213, r214, r214-import, r214-presentation, r215, r215-font, r215-import, r215-presentation, r216, r216-presentation, r217, r217-presentation, r218, r218-presentation, r219, r219-presentation, r220-ios, r220-presentation, r220-pwa, r220-tip. `npm run check` propre, `node tools/guard.mjs` vert.
- **Build public** (`node tools/build.mjs`) : code seul, identique à ce que construit la CI.
- **Standalone** (`node tools/build.mjs --standalone`) : `standalone/zuma-standalone.html`, **7 809 949 octets** (7,4 Mio ; +2 839 depuis le build de 05-14, mise en page de l'astuce). Douze modules concaténés (`pwa` compris), sans service worker, sans manifeste ni liens PNG ; `R2.0.20` apparaît 22 fois, commentaires de code compris, et le badge est composé à l'exécution. Verrous de fichier unique (`r215-presentation`, 15 tests) verts.
  - **Démarrage sur `file://`** (Chromium headless, 1 280 × 960 CSS, `?level=3-3&debug=1`), à DPR 2 comme à DPR 1 : « Codex de Mixtec » en ≈ 3 s, badge `R2.0.20 · 2.0.20+20261011T081049 · ressources originales`, kit STATS 2 × avec `arial12bold` comme police d'astuce. STATS ouvert par Tab : astuce tirée au hasard complète ; l'astuce la plus longue, forcée, tient sur trois lignes complètes en minuscules. Aucune carte d'installation, **console propre**.
- **Artefact privé** (`node tools/build.mjs --deploy`) : « artefact de déploiement : dist/ (**291 fichiers, 5.7 Mio**, empreinte du pack **db5c071e6a40**) — à héberger uniquement en privé » ; 5 969 088 octets. `dist/version.json` : version 2.0.20, build `2.0.20+20261011T081116`, `assets` 269.
  - **Hors ligne** (relevé de 05-15 sur l'artefact final, Chromium) : la première visite installe le worker, avec 291 requêtes dont 269 sous `assets/`. Caches : `zuma-shell-<build>` 21 entrées, `zuma-assets-db5c071e6a40` **269 / 269** ; 6 077 289 octets stockés.
  - Après `setOffline(true)` et rechargement : pack original chargé, niveau « Spirale du destin », 40 billes, badge « … ressources originales · hors ligne : 6,0 Mo », console propre.
  - **Installabilité** : `Page.getInstallabilityErrors` → `[]`, manifeste sans erreur (`id` `./`, `display_override` fullscreen / standalone), icônes 192 / 512 / maskable 512 servies en PNG à leur taille.
- **Relevés de 05-14, non refaits** :
  - mise à jour sans retéléchargement du pack : 22 requêtes du worker, toutes du shell, 0 sous `assets/` ; « Mettre à jour » recharge la nouvelle version et garde le cache du pack ;
  - invite d'installation synthétique : « Installer Zuma », un seul `prompt()` ;
  - OK du STATS : contrôle DOM égal au rectangle dessiné à 0,05 px près ;
  - iPhone 15 et iPad Pro 11 émulés : rotation, échange au toucher, curseurs au doigt, bandes ;
  - captures et journaux dans le dossier de travail de la session, **jamais dans le dépôt**.
- **Correctif de l'astuce** (05-15), captures avant / après aux DPR 1 et 2 : les sept astuces du pack, forcées l'une après l'autre dans le STATS du 3-3. Avant : 5 sur 7 en Cancun10 majuscule tronquée. Après : 7 sur 7 complètes en Arial12Bold, deux en colonne sur deux lignes et cinq sur trois lignes.
- **Rien n'est déployé.** L'hébergement privé (Cloudflare Pages derrière Access) et la synchronisation des scores relèvent du plan 05-16. `dist/`, `standalone/` et `private_assets/` restent hors de Git (`git status` propre).
- Hypothèses à valider en UAT 9 : voir la section suivante et `05-UAT.md`, « Neuvième session ».

## Hypothèses à confirmer en UAT

Elles sont listées pour la neuvième session (`05-UAT.md`). L'installation réelle sur iPhone et iPad attend l'hébergement privé en HTTPS (plan 05-16) : un iPhone ne peut pas installer une PWA servie en `http://<IP locale>`.

Nouvelles (05-14, 05-15) :

- **Règle Q5** : les marges 11 / 3 / 11 px du masque `_dialogbox` sont transparentes dans le dessin de la boîte originale (0x46ae30 non lu). Si elles étaient opaques, la règle vaudrait 36 / 36 / 36 depuis notre cadre (OK 145, 362, 350 × 48). Repli D-36 non utilisé.
- **Pied du menu** laissé à 30 / 30 / 22 (marges d'OPTIONS non relues).
- **Libellé « Installer »** de la vue Aide : sans chaîne originale ; le bouton n'existe pas dans OPTIONS.
- **Rayon de 32 px** pour l'échange au doigt sur la grenouille.
- **Seuil de 600 px** (petit côté de l'écran) pour reconnaître un téléphone.
- **`audioSession` « ambient »** : sons coupés par l'interrupteur silencieux et mêlés à la musique d'autres apps. « playback », prévu par D-38, les jouerait même en silencieux. À trancher sur un iPhone réel.
- **Déblocage audio au premier toucher** et **reprise après un appel ou un verrouillage** : à vérifier sur un appareil.
- **Comportement réel d'iOS** :
  - l'app de l'écran d'accueil a un stockage séparé de Safari et doit être ouverte une fois en ligne ;
  - le stockage peut être évincé ;
  - marges sûres réelles d'un iPhone à encoche.
- **Installabilité réelle hors Chromium** : Safari « Sur l'écran d'accueil » et « Ajouter au Dock », Edge, Android.
- **Chemins relatifs du manifeste et du worker** sous l'hébergement privé (racine ou sous-dossier).
- **Astuce en paragraphe sur trois lignes** pour les cinq astuces longues (05-15) : écart assumé à « deux lignes au plus » (D-20), imposé par la largeur de la police. L'interligne de 14 px est serré pour une police de 17 px de haut.

Reportées de R2.0.19, non tranchées en UAT 8, qui ne portait que sur le bouton OK et la PWA :

- **D-31** : tir consommé par la pièce ; **D-32** : aucun son à l'apparition d'un power-up ; trois grenouilles par partie ; vitesse du recul ZUMA (100 px/s) ; billes en destruction poussées par le rebond ; grenouille en jeu comptée pendant la perte d'une vie.
- Mot « MENU » pris sur l'image du pack ; polices `FONT_MONODIGIT` / `FONT_DIALOG` ; « xN » qui se lit « X4 ».
- C1, Espace = menu, C2, C3, C4, tête de divinité et marges du menu, moitiés de l'image des cases, D-30, gain 0,35 et canal unique du roulement, curseur Musique inerte, « Retour au menu principal » → nouvelle partie, boutons du HUD au toucher seulement.
- B1, B3, D-21, bille en attente sans enchaînement, B4, couleur du « +N », EPX, canvas enfant du STATS, A1–A5, A7, arrêt du pousseur à chaque insertion arrière, interligne 18 px, couvercle du crâne à 600 px, `levelwin` / pops.

Retirées (tranchées en 05-14) :

- géométrie du bouton OK du STATS (lue dans l'exécutable) ;
- « pas de geste tactile d'échange » (le toucher sur la grenouille échange) ;
- précache incomplet du service worker (le pack entier est précaché).

## Hébergement privé (plan 05-16)

Premier hébergement privé du jeu complet sur le compte Cloudflare de l'utilisateur : Pages derrière Access, connexion par code à usage unique (D-42, D-43). Aucune règle de jeu n'est touchée et la baseline reste R2.0.20. Il n'y a ni D1, ni Function, ni `_worker.js`.

### Outils

- **`tools/deploy.mjs`** (script `npm run deploy:private`), avec trois options :
  - `--plan` : lecture seule, « actions prévues : N » ;
  - `--verify` : configuration Access lue par l'API, puis HTTP, avec les codes 0 (protégé), 1 (exposé) et 2 (injoignable d'ici) ;
  - `--rollback-plan` : étapes de retrait imprimées, jamais exécutées.

  Fonctions exportées : `planProvision`, `isAccessRedirect`, `redact`, `run`. Le provisionnement est idempotent et suit cet ordre : projet Pages, fournisseur imposé aux applications existantes (D-43), méthode « One-time PIN », politique « Zuma — joueurs », application « Zuma » (hôte et `*.hôte`, 730 h, OTP seul, redirection automatique), politique et application « Zuma — fichiers publics » (Bypass sur `/public` seul).
- **`tools/pagesupload.mjs`** : `checkArtifact`, `listFiles`, `contentType`, `assetKey`, `buckets`, `pagesManifest`, `uploadAndDeploy`. C'est le téléversement direct de Pages par l'API REST :
  1. jeton d'envoi ;
  2. clés manquantes ;
  3. envoi par lots de 40 Mio et 2 000 fichiers au plus, trois en parallèle, cinq tentatives ;
  4. mise à jour des empreintes ;
  5. déploiement multipart sur `main` ;
  6. relecture de l'étape `deploy`.
- **`tools/blake3.mjs`** : BLAKE3 en JavaScript pur, sans dépendance. Il sert seulement de clé de contenu exigée par l'API Pages : `blake3(base64(contenu) + extension)`, 32 premiers chiffres hexadécimaux. Il est conforme aux 35 vecteurs officiels, dont 7 sont verrouillés dans les tests. Témoin hors dépôt : `blake3-wasm` du cache npm, avec **291 clés identiques sur 291** fichiers de l'artefact.
- **Écart à D-42** (REST au lieu de wrangler) : la sonde du 2026-10-11 montre que wrangler exige `CLOUDFLARE_API_TOKEN`, alors que le jeton n'existe dans la session que par injection du proxy. `fetch` natif, aucune dépendance, aucun `npx`.

### Garanties

- Les applications Access sont créées et **relues avant** tout appel d'envoi. Un test verrouille l'ordre des écritures.
- La branche est toujours `main`, jamais un aperçu ; une autre branche est refusée avant le premier appel. Un déploiement dont l'environnement n'est pas « production » est signalé et arrête le script.
- Chaque étape lit avant d'écrire et relit après. Un objet existant différent est un conflit imprimé, jamais réécrit. Un second `--plan` annonce « actions prévues : 0 ».
- Aucun `DELETE` ni `PATCH`. La seule écriture sur un objet existant est l'étape D-43 : `PUT` d'une application listée dans `pinIdpApps`, avec le corps relu par `GET`, où seul `allowed_idps` change. La relecture le confirme et la valeur précédente est journalisée.
- Le journal passe entièrement par `redact` : JWT, valeur d'`Authorization`, identifiants hexadécimaux de 32 chiffres ou plus. Ni le nom du compte (il contient une adresse) ni les adresses autorisées ne sont journalisés. La liste d'adresses vit dans `private_assets/deploy.json`, ignoré par Git.
- **Politique dédiée « Zuma — joueurs »** (écart au plan, qui réutilisait « Romain uniquement ») : la politique existante est partagée par les trois applications du compte. Une adresse ajoutée pour le jeu leur aurait donné accès. La nouvelle politique ne contient que l'adresse de l'utilisateur.

### Parades côté app

- **Service worker** : `clean(response)` reconstruit, pour une navigation, une réponse du cache qui a suivi une redirection. Pages redirige `/index.html` vers `/`, et `start_url` vaut `../index.html` : sans cette parade, l'app installée ne démarrerait pas. `passThrough` est inchangé : `/cdn-cgi/` (rappel `/cdn-cgi/access/authorized` qui pose le cookie) et `/api/` restent au réseau.
- **`index.html`** : `<link rel="manifest" … crossorigin="use-credentials">`, pour que le manifeste parte avec le cookie Access. Le standalone retire toujours la balise.
- **Bypass `/public`** : manifeste, icônes et feuille de style lisibles sans connexion (installation, icône iOS). `dist/public/` ne contient que des fichiers du dépôt et des icônes générées.

### Tests

- `tests/r220-deploy.test.mjs` (29) :
  - BLAKE3 (vecteurs officiels), clés, types MIME, exclusions, lots, manifeste ;
  - contrôle de l'artefact `--deploy` (sept cas de refus) ;
  - séquence d'envoi sur une API simulée : branche `main` imposée, 401 / 403 sur `/pages/assets/*`, `max_file_count_allowed`, étape en échec ou lente, reprises et JWT expiré ;
  - `planProvision` (ordre, conflits, D-43) ;
  - `run` : `--plan` en lecture seule, ordre des écritures et relecture, seconde exécution sans écriture, D-43 sans autre changement, aucun `DELETE` ni `PATCH`, `--rollback-plan`, configuration absente, plusieurs comptes, artefact public, 403 avec la permission nommée, environnement d'aperçu ;
  - sortie sans JWT, jeton, identifiant ni adresse ; `redact`, `isAccessRedirect` ;
  - `--verify` à trois issues ; import sans effet.
- `tests/r220-hosting.test.mjs` (6) :
  - réponse redirigée nettoyée (navigation et repli hors ligne, à la racine et sous un dossier) ;
  - réponse non redirigée servie telle quelle ;
  - `/cdn-cgi/access/*` et `/api/` jamais interceptés ni mis en cache, en navigation comme en sous-ressource ;
  - `use-credentials` et retrait par le standalone ;
  - `clean` et `passThrough` présents dans le build public.
- **Total : 319 tests** + garde de publication.

### Résultat du premier déploiement (depuis la session cloud, 2026-10-11)

- **Provisionnement fait et relu** :
  - projet Pages `zuma`, branche de production `main`, sous-domaine attribué par Cloudflare ;
  - fournisseur Cloudflare imposé aux trois applications existantes (D-43, précédemment `[]`) ;
  - méthode « One-time PIN » ;
  - politiques « Zuma — joueurs » et « Zuma — fichiers publics » ;
  - applications « Zuma » et « Zuma — fichiers publics ».

  Les corps Access de l'hypothèse A3 sont acceptés tels quels. La configuration est conforme par l'API et un second `--plan` donne « actions prévues : 0 ».
- **Envoi du contenu bloqué** : le proxy de la session remplace l'en-tête `Authorization` de toute requête vers `api.cloudflare.com`. Une valeur factice est quand même acceptée par `/user/tokens/verify`, ce qui prouve la substitution. Le jeton d'envoi n'atteint donc jamais Cloudflare : `/pages/assets/check-missing` répond 403, `8000013 Authorization failed`. Aucun fichier n'a été envoyé et le projet n'a aucun déploiement (rien n'est servi). **Repli : `npm run deploy:private` depuis le Mac** avec `CLOUDFLARE_API_TOKEN`, sur un provisionnement déjà en place.
- **`--verify` = 2** : configuration conforme, mais `*.pages.dev` est injoignable depuis la session (CONNECT refusé par le proxy). La preuve HTTP revient à l'utilisateur, en navigation privée (étape 0 du README).
- URL et identifiants : dans le résumé du plan 05-16, jamais dans ce fichier.

### Hypothèses

- **A7** : le chemin le plus précis l'emporte (Bypass `/public` dans « Zuma »), à vérifier en navigation privée.
- **R2** : connexion dans l'app installée sur iOS (stockage séparé de Safari), à vérifier sur l'iPhone et l'iPad réels. En cas de boucle, variante M-A (Access par chemins).
- **R5** : après expiration de la session, la mise à jour du worker échoue en silence et l'app continue sur sa version en cache jusqu'à la prochaine connexion (accepté).
- **Clés BLAKE3** : identiques au témoin et aux vecteurs officiels. L'acceptation par Pages sera confirmée au premier envoi depuis le Mac.
