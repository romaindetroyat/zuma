# Zuma PWA

Reconstruction web/PWA d'un jeu de billes de type Zuma, développée à partir d'un audit comportemental et de tests de non-régression.

Baseline : **R2.0.16**.

## Contenu du dépôt

| Dossier | Rôle |
| --- | --- |
| `src/core.ts` | Moteur de simulation déterministe (chaînes, insertion à identifiants stables, destruction en 40 ticks, recul local, attraction, power-ups, multi-chaînes). |
| `src/feedback.ts` | Règles de présentation : sons déclenchés par événement, explosions, particules, trames de la pièce. |
| `src/levels.ts` | Niveaux procéduraux utilisés quand aucune ressource originale n'est fournie. |
| `src/original.ts` | Chargeur du pack de ressources privé (courbes, fonds, sprites, sons). |
| `src/render.ts` | Rendu canvas 640×480, HUD natif, pièce, messages et textes flottants en polices bitmap. |
| `src/bitmapfont.ts`, `src/statsdialog.ts` | Polices bitmap PopCap et composition de l'écran STATS natif. |
| `src/audio.ts` | Sons originaux si disponibles, synthèse WebAudio sinon. |
| `src/main.ts` | Boucle de jeu, progression, menus, enregistrement du service worker. |
| `tools/` | Build, serveur local, garde-fou de publication, extraction et import des ressources originales. |
| `tests/` | Suite de non-régression (`node --test`). |

## Démarrage

```bash
npm install
npm test        # build + tests de non-régression + garde-fou de publication
npm run dev     # build local (avec ressources privées si présentes) puis http://localhost:8080
```

Commandes : clic pour tirer, clic droit ou Espace pour échanger la bille, `P` pause, `Échap` menu, `M` son. L'option de menu « Pixels nets » force une échelle entière (×1, ×2, ×3) sans lissage ; le choix est persisté.

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

L'import décode les fichiers de courbes (`CURV` : points de contrôle puis polyligne échantillonnée au pixel avec drapeaux de tunnel), `levels.xml` (positions de la grenouille, découpes, réglages de difficulté, progression par temples) et renomme les sons selon les clés de `feedback.ts`.

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
| `mergespeed`, `reloaddelay`, `treasurefreq`, `maxspeed`, `accrate` | — | Non interprétés ; `mergespeed` a seulement inspiré `mergeTicks` ; `treasurefreq` (défaut 300, unité non vérifiée) n'est pas câblé ; `maxspeed` / `accrate` sont inopérants sans `accrate` dans `levels.xml`. | à confirmer |

### Pièces et fin de niveau

Depuis R2.0.16, les montants et les cadences de la fin de niveau sont ceux lus dans l'exécutable original ; ce qui est marqué *hypothèse* reste à confirmer en jeu (voir `.planning/codebase/CONCERNS.md`).

- **Pièces** (`TreasurePoint` de `levels.xml` : `x`, `y`, courbe, `dist1`|`dist2`) : une seule pièce à la fois, qui apparaît 9–15 s après le début du niveau puis après chaque disparition ou ramassage (*hypothèse* : `treasurefreq` n'est pas câblé), sur un point tiré au hasard parmi ceux qui sont dégagés — aucune bille de la courbe concernée à moins de `dist` px du point (`dist = 0` = toujours libre ; règle de dégagement : *hypothèse*). Elle reste visible 6 s. Rendu : `COIN.gif` (30 trames, 20 trames/s) avec le scintillement `sparkle.gif` périodique. Un projectile passant à moins de 18 px la ramasse : **`max(500, 100 × ⌊score / 600⌋)` points** (500 au temple 1, vérifié), texte flottant « +500 », compteur PIÈCES des STATS, **la série (ENCH.) est conservée** et le projectile continue sa course. Sons : `jewelappear` à l'apparition, `gemvanishes` à la disparition, `coingrab` au ramassage.
- **Décompte de fin de niveau** : quand la dernière bille explose en mode ZUMA, le tir est bloqué, **10 000 points par courbe** sont crédités (*hypothèse A3*), et un marqueur part de la dernière destruction vers le crâne par pas de **60 px toutes les 4 maj** (2,4 ticks), le premier 20 maj après le vidage ; chaque pas rapporte **+100** avec un texte flottant jaune « +100 » et cinq étincelles sur la piste, le son `endoflevelpop1` (gain 0,5, hauteur fixe) joue toutes les 10 maj. 50 maj après le dernier pas : `chant5` et l'écran STATS s'ouvre immédiatement, où le bonus ACE TIME (voir `partime`) est compté.
- **Chronomètre** : TEMPS, OBJECTIF et le bonus ACE TIME se mesurent depuis « PARTEZ », pas depuis le chargement du niveau.
- **Début de niveau** : « Attention » (`GET_READY`, police `NativeAlienExtended18` avec le pack) pendant l'arrivée rapide de la chaîne, puis « PARTEZ » (`GO`) quand la vitesse de croisière est atteinte (≈ 1,5 s sur la spirale) ; `chant1` au début.
- **Fin de piste** : l'alerte `warning1` commence 600 px avant le crâne avec un intervalle qui passe de 4,1 s à 0,6 s sans monter en volume ; le couvercle du crâne s'ouvre sur la même distance ; la chaîne ralentit jusqu'à `speed / slowfactor` (voir le tableau). Le roulement (`rolling`) joue à volume constant dès que la chaîne bouge et s'éteint en 150 ms. L'atteinte de la jauge affiche « ZUMA ! » en police titre pendant 2 s avec la jauge qui pulse.

### Écran STATS d'origine

Avec le pack, l'écran STATS est **composé à l'exécution** (`src/statsdialog.ts`) à partir des briques du jeu original, sur un canvas 640×480 posé en fond inline de `.zuma-stats` (la feuille de style ne référence aucune image) :

- `images/dialogbox.jpg` + `_dialogbox.gif` : cadre dessiné en 9 tranches (coins non étirés, bords étirés dans une dimension, centre étiré) sur le rectangle mesuré de la référence R2.0.12 (x 109–531, y 91–446) ;
- `images/GodHead.gif` + masque : tête de divinité centrée, chevauchant le bord supérieur ;
- `images/DialogButton.jpg` + `_Dialogbutton.gif` : bouton OK, trois états peints (normal / survol / pressé) suivis par le contrôle transparent `#result-continue` ; son `button1` au clic ;
- polices bitmap PopCap lues depuis leurs scripts `fonts/*.txt` (`src/bitmapfont.ts`) : titre en `NativeAlienExtended18` multiplié par l'or `#f0c040` de l'original, libellés et valeurs en `Cancun12` teinté aux couleurs lues dans l'exécutable (libellés jaunes, valeurs crème, TEMPS `#ffff00`, OBJECTIF `#ffa500`, BONUS `#2aff03`, « PAS DE BONUS » `#9dcba2`, RECORD or), astuce en `Arial12Bold` ; l'interligne vaut 1,65 × la hauteur de capitale mesurée sur la police (18 px avec `Cancun12`), les valeurs sont alignées à droite sur une même colonne ;
- libellés et astuces = chaînes originales de `properties/default.xml` (`pack/strings.json` : STATS, POINTS, COMBOS, COINS, GAPS, MAX_CHAIN, MAX_COMBO, YOUR_TIME, ACE_TIME, BONUS, BEST_TIME, NO_TIME_BONUS, TIP, OK et les sept astuces).

Colonne gauche : POINTS (score du niveau), COMBOS, PIÈCES (pièces touchées), SAUTS, ENCH. MAX., COMBO MAX. Colonne droite : TEMPS (durée du niveau depuis « PARTEZ »), OBJECTIF (`partime` ou temps d'expert par défaut), BONUS (bonus ACE TIME, sinon « PAS DE BONUS » à la place du libellé), RECORD = **meilleur temps du niveau**, persisté dans `localStorage` sous `zuma.best.<id>` (id du niveau du pack ou `proc-N`), mis à jour sur victoire et affiché dès la première partie (alors égal au temps courant). Les dix valeurs se révèlent ligne par ligne (90 ms, son `pop`). **Compte à rebours du BONUS** : comme dans l'original, le bonus n'est pas dans le score à l'ouverture ; une seconde après, BONUS monte de 100 en 100 toutes les 100 ms avec un `endoflevelpop1` dont la hauteur monte (hypothèse A5), POINTS et le score du HUD suivent, et OK crédite d'un coup ce qui reste. Chaque état (ligne révélée, survol, pressé) recompose le canvas, encodé en PNG de façon synchrone (`toDataURL`, ~10 ms) et exposé en URL d'objet ; l'image précédente n'est révoquée qu'une fois la nouvelle décodée.

Sans pack (ou tant que les polices ne sont pas chargées), l'écran STATS reste le panneau vectoriel (même structure, mêmes valeurs, mêmes identifiants).

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
- arrêt du pousseur et zone lente de fin de piste ; décompte original ; bonus ACE TIME (`tests/r216*.test.mjs`).

## Fournir ses propres graphismes de niveau

Le jeu charge n'importe quel niveau décrit dans le format du pack (`private_assets/pack/pack.json`, ignoré par Git), que les fichiers viennent de l'import original ou d'une création personnelle. Pour un niveau d'identifiant `<id>` :

- **Fond** : `levels/<id>/<id>.jpg` ou `.png`, 640×480, référencé par `graphics.<id>.background`. Il est dessiné 1:1, jamais mis à l'échelle : une image d'une autre taille est recadrée, pas étirée. Vignette optionnelle `levels/<id>/thumb.jpg` (320×240) dans `graphics.<id>.thumbnail`.
- **Découpes** (tunnels, dessinées au-dessus des billes) : un PNG avec couche alpha `levels/<id>/<nom>.png` et sa position en pixels (coin haut-gauche), déclarés dans `graphics.<id>.cutouts: [{ "image": "<nom>", "x": …, "y": …, "priority": 1 }]` et `graphics.<id>.layers.<nom> = { "color": "levels/<id>/<nom>.png", "alpha": null }`. Un calque avec `"color": null` et un masque dans `"alpha"` découpe le fond lui-même à cette position (format PopCap `_<nom>.gif`).
- **Calques animés** (sous les billes) : même format d'image et de calque, déclarés dans `graphics.<id>.overlays: [{ "image": "<nom>", "x": …, "y": …, "vx": …, "vy": … }]` ; `vx, vy` donnent la direction d'une oscillation lente (amplitude ≤ 3 px).
- **Tracé** : `levels/<fichier>.json` = `{ "version": 2, "controls": [[x, y], …], "points": [[x, y, flags], …] }`. Les `points` sont en pixels, échantillonnés au pas ≈ 1 px du trou d'entrée vers le crâne ; `flags` bit 1 = la bille passe sous une découpe, bit 2 = bille cachée. Le fichier est référencé par `graphics.<id>.curveFiles` (plusieurs tracés = plusieurs chaînes) et la grenouille par `graphics.<id>.frog = { "x": …, "y": … }`.

Ces fichiers vont dans `private_assets/pack/` ; `npm run dev` les charge sans autre configuration.

## Statut

R2.0.16 est une baseline jouable, pas une revendication de reproduction bit-à-bit. Sont désormais vérifiés par analyse statique de l'exécutable original : la cadence (100 Hz) et les unités de `speed` / `firespeed`, la rampe et l'arrêt du pousseur, la zone lente et la ligne de danger, l'arrivée rapide calculée depuis `start`, la génération des couleurs (`repeat`, `single`, `colors`), le seuil `score` et la condition du recul ZUMA (`zumaslow` / `zumaback` × 0,25 au-delà de 50 % de couverture), le décompte de fin de niveau (60 px / 4 maj / +100, pops toutes les 10 maj), la formule ACE TIME et son comptage dans l'écran STATS, la valeur des pièces et les couleurs du dialogue STATS. Restent des hypothèses, à confirmer sur l'original ou au ressenti : A1 (`repeat` 50 au 1-1), A2 (appel unique de l'arrivée rapide), A3 (+10 000 par courbe en fin de niveau), A4 (bannière ZUMA 2 s), A5 (hauteur du pop du compte à rebours), A6 (`treasurefreq`, pièce toutes les 9–15 s et règle de dégagement `dist`), A7 (`defaultParTime`), l'arrêt du pousseur à chaque insertion arrière, la loi RNG des power-ups (`powerfreq`), `mergespeed`, `reloaddelay`, le départ du chronomètre à « PARTEZ », le rafraîchissement immédiat des munitions et le roulement à gain constant.
