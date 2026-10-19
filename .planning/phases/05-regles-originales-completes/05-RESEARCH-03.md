# Phase 5 : Règles originales complètes — Recherche 03 (spike ciblé : tunnels, menu de jeu, vies, pièces, roulement)

**Recherché le :** 2026-10-10
**Domaine :** Zuma Deluxe (PopCap) — format CURV et ordre de dessin (tunnels / calques), dialogue MENU en jeu et dialogue OPTIONS, touches, vies supplémentaires, cadence des pièces, boucle de roulement
**Confiance globale :** HAUTE pour tout ce qui est lu dans le code (adresses citées) ; MOYENNE pour la géométrie du dialogue (drapeaux `Layout` partiellement décodés) et la condition exacte de rafraîchissement du roulement ; BASSE pour le rendu des grenouilles dans le HUD (non analysé).
**Complète :** `05-RESEARCH.md` et `05-RESEARCH-02.md` (même méthode, même PE interne). Corrige une interprétation du spike 01 : le réglage `dist` des `TreasurePoint` n'est pas un dégagement en px mais un **pourcentage de progression** de la chaîne (Q4).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (sixième session, D-23..D-29)
- **D-23:** Tunnels : les billes sont toujours simulées et dessinées ; les portions de courbe marquées « dessous » sont recouvertes par les découpes du décor (`layers` du pack) dessinées après les billes ; l'octet de calque CURV est interprété selon le spike 03 ; aucune bille n'est « cachée » par omission de dessin.
- **D-24:** Menu de jeu natif : dialogue composé avec le kit du STATS (dialogbox, DialogButton, polices, chaînes du pack) : titre `MENU`, boutons `BACK_TO_GAME`, `OPTIONS`, `HELP`, `BACK_TO_MAIN_MENU` (ou `QUIT`) ; OPTIONS ouvre un dialogue de même facture (son, pixels nets, plein écran) ; `HELP` affiche les astuces du pack ; plus aucun panneau DOM stylé.
- **D-25:** Taille : le canvas remplit toujours la fenêtre en 4:3 (marge minimale) ; en « Pixels nets » l'échelle est arrondie à l'entier en pixels d'appareil (`floor(css × dpr / 640) / dpr`), jamais en dessous de 1.
- **D-26:** Entrées : la visée suit le pointeur sur toute la fenêtre (coordonnées ramenées et bornées au canvas) ; un clic tire partout, cadre compris ; les boutons MENU / STATS du HUD ne réagissent plus au clic ; Entrée et Échap ouvrent / ferment le menu ; Espace et clic droit échangent (original) ; Tab ouvre le STATS ; P pause.
- **D-27:** Vies : une grenouille supplémentaire à chaque multiple de 50 000 points (chaîne `GET_AN_EXTRA_FROG` ; seuil confirmé par le spike 03), événement `extra-life`, son `extralife`, texte `EXTRA_LIFE_BONUS` à l'écran, HUD mis à jour ; plafond éventuel selon le spike.
- **D-28:** Pièces : cadence d'apparition reprise de l'exécutable (spike 03) ; à défaut intervalle 18–30 s ; `coinappear` joué une seule fois par apparition.
- **D-29:** Roulement : gain 0,35, montée 100 ms, fondu 400 ms à l'arrêt.

### Claude's Discretion
- Échelle exacte du dialogue, courbes d'animation, volumes.

### Deferred Ideas (OUT OF SCOPE)
- Voir `05-CONTEXT.md` (inchangé par ce spike).
</user_constraints>

## Résumé

**Tunnels (Q1).** Les deux octets par point du CURV ne sont pas « dessous / caché » mais **« tunnel » (octet A, injouable : ni touché ni ciblé) et « priorité de dessin » (octet B, 0..3)**. Le plateau dessine en cinq passes `L = 0..4` : découpes de priorité `L`, particules de calque `L`, puis billes de priorité `L`. Toutes les découpes du pack ont `pri="1"`, donc : billes de priorité 0 → découpes → billes de priorité ≥ 1. Au 2-2 (`underover`) l'octet B vaut 1 sur 64 % de la courbe (la partie intérieure qui repasse **par-dessus** la partie extérieure) : notre rendu, qui saute les billes « cachées », faisait disparaître ces billes — c'est le constat U26. Le tunnel (octet A) ne concerne que le jeu (collision du projectile), pas le dessin.

**Menu (Q2).** Il n'y a pas de dialogue MENU distinct : c'est le **dialogue OPTIONS construit en mode « en jeu »** (0x445310 avec `inGame = 1`) : titre `MENU`, deux curseurs (`MUSIC_VOLUME`, `SOUND_EFFECTS`), trois cases (`FULLSCREEN`, `CUSTOM_CURSORS`, `3D_HARDWARE_ACCELERATION`), boutons `HELP`, (`CHECK_FOR_UPDATES`, `REGISTER` selon l'état), `BACK_TO_MAIN_MENU` (visible seulement en jeu), et un bouton de pied `BACK_TO_GAME`. Le jeu est **mis en pause** avant l'ouverture. Dans le code du jeu, **Espace = pause** (chaîne `PRESS_SPACE_BAR_TO_PAUSE`), aucune gestion d'Échap, Entrée, Tab ni P n'a été trouvée.

**Vies (Q3).** `AddScore` : une vie par franchissement d'un multiple de **50 000** (`⌊nouveau/50000⌋ − ⌊ancien/50000⌋`, plusieurs vies possibles d'un coup), **sans plafond**, hors mode gauntlet ; son `extralife` joué **trois fois** (0, +0,3 s, +0,6 s) ; **aucun texte en jeu** (`EXTRA_LIFE_BONUS` n'existe que dans le STATS d'un autre mode). **Pièces (Q4).** Visible **10 s** ; tentative d'apparition chaque mise à jour avec probabilité `1/treasurefreq` (= 1/300) dès que `maintenant − (dernière apparition + 1000) > 300` maj, uniquement **avant ZUMA** (score < cible) et sur un point dont la **chaîne a dépassé `dist` % de la courbe** ; `jewelappear` à **volume 0,40** (resources.xml), panoramique selon x. **Roulement (Q5).** Une instance par courbe, volume 1,0 au départ, rafraîchi à 0,98 à chaque maj où la chaîne roule, sinon **fondu linéaire 0,02/maj (≈ 0,5 s)** puis arrêt ; pas de modulation de hauteur ; coupé à la pause.

**Recommandation principale :** corriger l'importateur (A = tunnel, B = priorité 0..3), dessiner par passes de priorité avec les découpes entre les passes 0 et 1 ; composer le MENU comme le dialogue OPTIONS en jeu ; vies à chaque multiple de 50 000 sans texte ; pièces : 10 s visibles, ~1/180 par tick à 60 Hz après 13 s depuis la dernière apparition, `dist` en % de progression ; roulement : fondu 500 ms linéaire, pas de hauteur.

## Méthode (reproductible)

1. PE interne réutilisé dans le scratchpad (`exe/inner.exe`, `exe/dis.txt` = `objdump -d -M intel`), cf. `05-RESEARCH.md` § Méthode. VMA = offset fichier + 0x400000 (`.rdata` 0x54c000 ↔ 0x14c000). Rien n'a été copié dans le dépôt. Un petit extracteur de plages d'adresses (`scratchpad/s03/rng.py`) a servi à lire les fonctions.
2. Chaînes `.rdata` : `CURV` 0x54c9e0 ; `STRING_ID_MENU` 0x550a30, `_BACK_TO_GAME` 0x550a50, `_OPTIONS` 0x550a1c, `_DONE` 0x550a40, `_HELP` 0x550a0c, `_BACK_TO_MAIN_MENU` 0x5509d4, `_CHECK_FOR_UPDATES` 0x5509f0, `_REGISTER` 0x54f560, `_MUSIC_VOLUME` 0x550ad8, `_SOUND_EFFECTS` 0x550ac0, `_FULLSCREEN` 0x550aa8, `_CUSTOM_CURSORS` 0x550a8c, `_3D_HARDWARE_ACCELERATION` 0x550a68, `_EXTRA_LIFE_BONUS` 0x5511d0, `_GET_AN_EXTRA_FROG` 0x550f50, `_LIVES_LEFT` 0x54da30, `_LAST_LIFE` 0x54da1c, `_GAME_OVER` 0x54da48, `_PAUSED` 0x54ca8c, `_PRESS_SPACE_BAR_TO_PAUSE` 0x550efc, `_QUIT_THE_GAME_?` 0x55184c, `_LEAVE_GAME_?` 0x551878. Attributs XML (UTF-16) : `Cutout` 0x54d778, `pri` 0x54ca5c, `BackgroundAlpha` 0x54d788, `TreasurePoint` 0x54d714.
3. Identifiants de ressources (motif `push "X" … mov ds:G,eax` dans 0x438f80–0x439260) : `SOUND_EXTRA_LIFE` → 0x5a0fac, `SOUND_JEWEL_APPEAR` → 0x5a11fc, `SOUND_JEWEL_DISAPPEAR` → 0x5a12a0, `SOUND_JEWEL_HIT` → 0x5a10f8, `SOUND_ROLLING` → 0x5a105c, `FONT_DIALOG` → 0x5a10c4 (`!program`, police système), `FONT_MAIN12` → 0x5a0fa8 (`cancun12.txt`), `FONT_HUGE` → 0x5a1298 (`nativealien48.txt`), `IMAGE_DIALOG_BACK` → 0x5a1084 (`dialogbox`), `IMAGE_DIALOG_BUTTON` → 0x5a122c (`Dialogbutton`), `IMAGE_SLIDER_TRACK` → 0x5a115c, `IMAGE_SLIDER_THUMB` → 0x5a1130, `IMAGE_DIALOG_CHECKBOX` (`checkbutton`). `resources.xml` : `JEWEL_APPEAR` = `jewelappear` **`volume="0.40"`**, `JEWEL_DISAPPEAR` = `gemvanishes`, `JEWEL_HIT` = `coingrab`, `EXTRA_LIFE` = `extralife`, `ROLLING` = `rolling` (pas d'attribut volume).
4. Fonctions : chargeur CURV 0x4178c0 ; accesseurs de point 0x404f60 (x, y, priorité), 0x405bc0 (priorité à l'index), 0x405cb0 (tunnel à l'index), 0x405c10 (priorité d'une bille), 0x405d00 (tunnel d'une bille) ; répartition en calques 0x408fc0 (+ 0x4020b0 / 0x4020e0) ; dessin du plateau 0x42db30 → 0x40c470 (passes) → 0x409210 / 0x4091d0 (découpes), 0x40b4d0 (particules) ; parse des `Cutout` 0x4105e0 (attribut `pri` lu en 0x4106d6) ; `AddScore` 0x417380 ; mise à jour de l'objet « pièces » 0x417580 ; valeur de pièce 0x4233fb ; progression de la chaîne 0x40a900 ; aléa 0x433180 (→ 0x4b6000) ; dialogue OPTIONS 0x445310 (ctor), 0x445b00 (dessin des libellés), 0x4402c0 (`Resize`), 0x440470 (hauteur), ouverture 0x44ac50 → 0x44aac0(1) → pause 0x4049d0 ; `Board::KeyChar` 0x404a80 ; `Board::Pause` 0x4049d0 ; STATS 0x447d40 (ligne `EXTRA_LIFE_BONUS` 0x447e4c–0x447e78) ; objet sons/effets (plateau+0xac, ctor 0x419610) : canaux de roulement 0x402790 (ctor), 0x4027d0 (départ), 0x402810 (rafraîchissement), 0x402830 (pause), 0x402880 (mise à jour / fondu) ; son différé 0x415350.
5. Données : `private_assets/original/levels/underover/underover.dat` (CURV v2, 2 666 points) relu en Python ; `levels.xml` (UTF-16) pour le bloc `underover` et les `TreasurePoint` de tous les niveaux ; `private_assets/pack/strings.json` pour les libellés français.

Durée : ≈ 1 h 30. Ce qui n'a pas été établi est listé en « Non établi / replis ».

## Q1. Tunnels et ordre de dessin (U26, D-23)

### Format CURV (0x4178c0, HAUTE)

```
"CURV"            4 octets (comparés sur 5 avec le NUL, 0x417992–0x4179a3)
int32 version     1..3 (max lu en ds:0x58700c = 3 ; nos fichiers : 2)
int32 ?           [+8] (= 1 dans underover ; stocké en courbe+0x10, sens non analysé)
int32 size        taille du bloc des points de contrôle, parsé par 0x4c55f0 (int32 n, puis n × 10 octets)
int32 count       nombre de points échantillonnés (0x417ab1)
float x, float y  premier point (0x417b5e–0x417b7d)
uint8 A, uint8 B  premier point (0x417b85 → point+9 ; 0x417b90 → point+8)
puis (count − 1) × { int8 dx, int8 dy, uint8 A, uint8 B }   (0x417bc5–0x417c2b : dx, dy × 0,01 (ds:0x587020), A → +9, B → +8)
```

Notre `parseCurve` (`tools/import-original.mjs` 68–91) lit, après `count, x, y`, des quadruplets `[A][B][dx][dy]` : il consomme donc les deux octets du point *précédent* avec le déplacement du point courant (décalage d'un point, sans conséquence visible) et il reste 2 octets en fin de fichier (vérifié : « trailing bytes = 2 »). Les octets sont bien ceux-là : **octet 0 = A, octet 1 = B** ; seule leur sémantique était fausse.

### Sémantique des deux octets (HAUTE)

Au chargement du plateau, chaque point est recopié dans une entrée de 36 octets (0x419e12–0x419faa) : `+0x20 = A` (0x419f44), `+0x21 = B` (0x419f92).

| Octet | Entrée | Sens | Preuves |
|---|---|---|---|
| A (notre « under ») | `+0x20` | **Tunnel** : segment injouable. La boucle de collision du projectile saute les billes dont l'index est en tunnel (0x408f52 `IsInTunnel(idx)` → pas de test de contact 0x401880) ; la recherche du point de courbe le plus proche ignore ces points (0x414d6e) ; la mise à jour d'une bille transmet l'état à 0x401600 (0x41aaad) ; en mode `drawcurve` (débogage) les segments en tunnel sont surlignés en noir alpha 160 (0x407391–0x4073bd). | 0x405cb0, 0x405d00 |
| B (notre « hidden ») | `+0x21` | **Priorité de dessin 0..3** (test `< 4` en 0x40739a). Priorité d'une bille = `max(B[idx − 16], B[idx + 16])` (0x405c10 ; rayon 16 = 0x401720) : la bille change de calque quand l'un de ses bords entre dans la zone. | 0x405bc0, 0x405c10, 0x408fc0 |

Aucune lecture de B ne cache une bille : B ne fait que choisir la passe de dessin.

### Ordre de dessin du plateau (0x42db30 → 0x40c470, HAUTE)

1. Fond du niveau (0x40b7f0, `LevelDesc`), puis remise à zéro des listes de calques (0x402090, 4 priorités × 2 listes de 1 024 entrées).
2. Pour chaque courbe, 0x408fc0 range chaque bille dans `listeA[p]` (p = priorité de la bille) et dans `listeB[min(p, p_suivante)]` (0x4020b0 / 0x4020e0) — la liste B est dessinée par 0x401730 (non virtuel, probablement l'ombre / le raccord sous la bille), la liste A par `Ball::Draw` virtuel.
3. **Cinq passes `L = 0..4`** (0x40c490–0x40c503) : (a) découpes dont `pri == L` (0x409210 → 0x4091d0 : `DrawImage(image, x, y)` pour chaque entrée de la liste `LevelDesc+4+12·L`), (b) particules du calque L (0x40b4d0), (c) liste B de L, (d) liste A de L.
4. Ensuite projectiles / grenouille (0x4053e0) / particules du calque 4 / HUD.

Les 22 `<Cutout>` du pack ont tous `pri="1"` (vérifié dans `levels.xml`). Concrètement : **billes de priorité 0 → découpes → billes de priorité ≥ 1 (par-dessus les découpes et les billes de priorité 0)**. Une bille en tunnel (A = 1) a en général B = 0 : elle est dessinée en passe 0 puis recouverte par la découpe, ce qui est exactement D-23. Que `Ball::Draw` saute ou non une bille en tunnel n'a pas été vérifié (non nécessaire : la découpe la recouvre).

### Données du 2-2 (`underover`, « Bourbier glissant »)

`levels.xml` : `curve="underover" gx="334" gy="247"`, `<Cutout image="left" pri="1" x="0" y="118"/>`, `<Cutout image="right" pri="1" x="311" y="0"/>`, trois `TreasurePoint` (`dist1` 32 / 50 / 60). Fichiers : `underover.jpg`, `_left.gif`, `_right.gif` (masques alpha seuls, aucune image couleur). Pack : `graphics.underover.cutouts = [{left, 0,118, priority 1}, {right, 311,0, priority 1}]`, `layers.left/right = {alpha: levels/underover/_left.gif, color: null}` ; `levels/underover.json` : 2 666 points.

Plages (index de point, octet A, octet B) lues dans le `.dat` :

| Points | A (tunnel) | B (priorité) | Où |
|---|---|---|---|
| 1–124 | 0 | **1** | entrée hors écran (667,13) → (548,50) |
| 125–155 | 0 | 0 | |
| 156–293 | **1** | 0 | (517,60) → (386,102), sous la découpe `right` |
| 294–557 | 0 | 0 | |
| 558–761 | **1** | 0 | (133,186) → (61,323), sous la découpe `left` |
| 762–960 | 0 | 0 | |
| 961–2665 | 0 | **1** | (218,439) → crâne (494,353) : toute la partie intérieure, qui croise l'extérieure |

Notre `render.ts` (307) saute `layerAt(s) & 2` : 64 % des billes du 2-2 n'étaient jamais dessinées, et le tri `& 1` plaçait les billes en tunnel au-dessus. Les « billes tronquées en haut à droite » sont celles du segment 156–293 sous `right`, dessinées après la découpe.

### Règle à implémenter (D-23)

1. Importateur : `points[i][2] = (A ? 1 : 0) | (B << 1)` avec B lu comme entier 0..3 (et, optionnellement, corriger l'alignement en lisant `[dx][dy][A][B]` après le premier point `[x][y][A][B]`). `Track` : `tunnelAt(s)` = bit 0, `priorityAt(s)` = bits 1–2 ; priorité d'une bille = `max(priorityAt(s − r), priorityAt(s + r))`.
2. Rendu, dans cet ordre : fond ; `BackgroundAlpha` (inchangé) ; billes de priorité 0 (posées puis en insertion) ; **découpes (`art.cutouts`, toutes `pri` 1) dessinées après la passe 0** ; billes de priorité 1, puis 2, puis 3 ; projectiles, grenouille, effets, HUD. Avec plusieurs priorités de découpes (aucune dans le pack) : découpes `pri == L` avant les billes de priorité L.
3. Moteur : une bille dont l'index est en tunnel n'est **pas touchable** par le projectile (règle originale 0x408f52) — à verrouiller par un test ; ne rien cacher à l'affichage.
4. Les stencils alpha (`original.ts` 242, découpe du fond au même emplacement) restent la bonne approche : les fichiers originaux ne contiennent eux aussi que les masques `_left.gif` / `_right.gif`. [MOYENNE : le chargeur d'image original n'a pas été lu]

## Q2. Dialogue MENU en jeu et OPTIONS (U27, D-24), touches (D-26)

### Composition (ctor 0x445310, HAUTE)

Un seul constructeur `OptionsDialog(bool inGame)`. Base : `Dialog(IMAGE_DIALOG_BACK, IMAGE_DIALOG_BUTTON, id 1, modal = 1, titre, lignes "", pied = texte du bouton, mode 3 = bouton de pied unique)` (0x4454cf–0x4454ed).

| Élément | En jeu (`inGame = 1`) | Depuis le menu principal | Preuve |
|---|---|---|---|
| Titre | `MENU` | `OPTIONS` | 0x445421 / 0x445477 |
| Bouton de pied | `BACK_TO_GAME` (« Retour à la partie ») | `DONE` (« Terminé ») | 0x44534f / 0x44539d |
| Curseur id 0 | `MUSIC_VOLUME` (« Musique »), valeur = volume musique de l'app (`vtable+0xd4`) | idem | 0x445724–0x44576f |
| Curseur id 1 | `SOUND_EFFECTS` (« Sons »), valeur = volume sons (`vtable+0xd8`) | idem | 0x445789–0x4457db |
| Case id 2 | `FULLSCREEN` (« Plein écran ») = `!app.windowed` (+0x4cb) | idem | 0x4457e6, 0x445a2c |
| Case id 3 | `CUSTOM_CURSORS` (« Curseurs perso. ») = app+0x688 | idem | 0x4457f4, 0x445a46 |
| Case id 4 | `3D_HARDWARE_ACCELERATION` (« Accélération matérielle ») = 0x48ad90() | idem | 0x445802, 0x445a5e |
| Bouton id 5 | `HELP` (« Aide ») | idem | 0x44580c–0x445856 |
| Bouton id 6 | `CHECK_FOR_UPDATES` — masqué si app+0x80d | idem | 0x44589c, 0x445a86–0x445a9a |
| Bouton id 7 | `REGISTER` (« S'enregistrer ») — masqué si app+0x885 (version enregistrée) | idem | 0x445920, 0x445a9c–0x445ab0 |
| Bouton id 8 | `BACK_TO_MAIN_MENU` (« Retour au menu principal ») — `SetVisible(inGame)` | masqué | 0x4459a4, 0x445a6f–0x445a7e |

Il n'y a donc **pas** de bouton `OPTIONS` ni `QUIT` dans ce dialogue : le menu en jeu *est* le dialogue des options. `QUIT_THE_GAME_?` / `QUIT_ZUMA_?` (0x44e692/0x44e6ad) et `LEAVE_GAME_?` (0x44e859) appartiennent à des dialogues de confirmation séparés (quitter l'application, quitter la partie) non analysés.

### Géométrie (0x4402c0 `Resize`, 0x440470, MOYENNE)

- Hauteur ajoutée au contenu de base : **200 px** (`+0x180 = 0xc8`), **+50** si `CHECK_FOR_UPDATES` visible, **+50** si `BACK_TO_MAIN_MENU` visible (0x445ab8–0x445ade) ; `GetPreferredHeight = base + +0x180` (0x440470).
- Curseur Musique : `x = gauche_contenu + 130`, `y = haut_contenu − 15`, `largeur = largeur_contenu − 130`, `hauteur = 36` (0x4402f7–0x440319 : `push 0x24 ; lea eax,[edi-0x82] ; … sub eax,0xf ; lea ecx,[ebx+0x82]`). Les libellés « Musique » / « Sons » sont dessinés à gauche, centrés verticalement sur leur curseur, police `FONT_DIALOG` (0x445b33–0x445bd0).
- Les autres widgets sont posés par `Widget::Layout(flags, relatif, …)` (0x4a81e0) : Sons sous Musique (0x1203), Plein écran sous Sons (0x210, décalage = gauche_contenu), Curseurs perso. à droite de Plein écran (0x4400, +90 px), Accélération sous Curseurs (0x1200), `HELP` sous Accélération en pleine largeur (0x1240 ; moitié de largeur et `REGISTER` à droite (0x4403) si celui-ci est visible), `CHECK_FOR_UPDATES` sous `HELP` (0x1240), `BACK_TO_MAIN_MENU` sous le précédent (0x1203 / 0x1240), puis le bouton de pied `BACK_TO_GAME` géré par `Dialog`. Les valeurs des drapeaux `LAY_*` n'ont pas été décodées une à une ; l'ordre vertical ci-dessus est sûr, les marges exactes ne le sont pas. [MOYENNE]
- Polices : `FONT_DIALOG` = police système (`!program`) pour les libellés ; le titre est rendu par `Dialog` avec la police d'en-tête de l'app (non lue). Pour « même facture que le STATS » (D-24) : titre NativeAlien 18, libellés et boutons Cancun 12, comme le STATS (`FONT_MAIN12` = `cancun12.txt` est la police du STATS 0x447d7f). Images : `dialogbox` (9-slice), `Dialogbutton`, `slidertrack` / `sliderthumb`, `checkbutton` (+ `checkboxcap`, `checkboxsliver`).

### Ouverture, pause, touches (HAUTE sauf mention)

- Ouverture par le bouton MENU de la barre (menubar `ButtonDepress` id 3 → 0x44ac50, 0x43c019) et par l'écouteur du plateau (0x420b64). 0x44ac50 appelle **d'abord 0x44aac0(1) → `Board::Pause(true, fromDialog = true)` (0x44aad3 → 0x4049d0)** puis construit le dialogue avec `inGame = (app+0x89c ≠ 0)` et l'affiche en modal (`DoDialog` 0x434540, id 0x190). **Le jeu est en pause derrière le menu.**
- `Board::Pause(pause, fromDialog)` (0x4049d0) : compteurs `+0xf8` (profondeur de pause) et `+0xfc` (pauses dues aux dialogues) ; met le roulement à zéro (0x402950(1)) et le restaure à la reprise ; pendant la pause le plateau **ne dessine pas les billes** (0x42db5a : `+0xf8 ≠ 0 && +0x185 == 0` → saut de la répartition en calques) et affiche `IMAGE_PAUSED` / « PAUSE » (`STRING_ID_PAUSED`, non lu en détail).
- `Board::KeyChar` (0x404a80) : **Espace (0x20) = bascule de pause** (refusée si une pause de dialogue est active `+0xfc ≠ 0`, anti-rebond 100 ms via 0x433110 et `+0x11c`) ; `T` (0x54) et `S` (0x53) basculent des drapeaux de débogage (+0x121, grenouille+0x5a). Chaîne du pack : `PRESS_SPACE_BAR_TO_PAUSE` = « Appuyez sur la barre d'espace pour mettre le jeu en pause. »
- **Aucune comparaison avec Échap (0x1b), Entrée (0xd), Tab (0x9) ni P (0x50) en tant que touche** dans 0x401000–0x450000 (les seules occurrences sont des longueurs de chaînes, des compteurs de niveau `cmp edi,0xd` = 13 niveaux, ou des boucles) ; dans le cadre (0x450000+), les seules `cmp …,0x1b` sont un analyseur de fichier (0x4f9f9c) et la CRT. **Négatif, MOYENNE** (un `switch` par table de sauts avec `add eax,-27` a aussi été cherché, sans résultat).
- Échange de la bille : non localisé dans le temps imparti (pas de `MouseDown` lu) ; « clic droit = échange » reste [ASSUMED]. Ce qui est sûr : **Espace n'échange pas, il met en pause.**

### Recommandation pour D-24 / D-26

- Dialogue MENU = notre dialogue OPTIONS en mode « en jeu » : titre `MENU`, curseur(s) de volume (ou une case « Son »), cases « Pixels nets » et « Plein écran » (équivalents de `CUSTOM_CURSORS`/`FULLSCREEN`), boutons `HELP`, `BACK_TO_MAIN_MENU`, pied `BACK_TO_GAME` ; hauteur ≈ contenu + 250 px, curseurs de 36 px décalés de 130 px. Pas de bouton `OPTIONS` imbriqué (fidèle), sauf si l'utilisateur tient à D-24 tel quel.
- Mettre le moteur en pause pendant le dialogue (fidèle). Entrée / Échap pour ouvrir / fermer et Tab pour le STATS sont des ajouts sans équivalent original ; **Espace : l'original met en pause** — à trancher avec l'utilisateur (D-26 affirme le contraire). P : aucun équivalent ; garder P = pause si Espace reste l'échange.

## Q3. Vies supplémentaires (U30, D-27)

`AddScore(points, flag)` 0x417380 (HAUTE) :

```
si points ≤ 0 : retour
ancien = score (+0xe4) ; nouveau = ancien + points
si ⌊nouveau / 50000⌋ > ⌊ancien / 50000⌋            ; 0x41739b–0x4173bd (magie 0x14f8b589 >> 12 = ÷ 50 000)
   et plateau+0x187 == 0 (pas gauntlet) et plateau+0x186 == 0 (mode aventure) :
       vies (+0xec) += ⌊nouveau/50000⌋ − ⌊ancien/50000⌋    ; 0x4173da–0x4173dc (plusieurs vies si plusieurs seuils franchis)
       plateau+0x178 = 150                                ; 0x4173e8 (compteur décrémenté en 0x401e35, AUCUN autre lecteur)
       PlaySample(SOUND_EXTRA_LIFE)                       ; 0x4173f4–0x417401 (app vtable+0xcc)
       son différé SOUND_EXTRA_LIFE à +30 maj et +60 maj  ; 0x415350(son, 30, 0, 0.0) et (son, 60, 0, 0.0) → triple « extralife » à 0 / 0,3 s / 0,6 s
score = nouveau ; si flag == 0 : +0xe8 = score (synchronisation de l'affichage)   ; 0x41743b–0x417447
```

- **Seuil : 50 000** (la chaîne `GET_AN_EXTRA_FROG` est exacte ; U30 « 100 000 » est faux). **Aucun plafond** dans `AddScore` ni ailleurs (les autres accès à `+0xec` sont la sauvegarde 0x41cd03, la perte de vie `−1` en 0x428383 et des tests `> 0 / == 1`).
- **Aucun texte en jeu** : `EXTRA_LIFE_BONUS` (« BONUS VIE SUPP. ») n'est dessiné que dans le dialogue STATS (0x447e4c–0x447e78, ligne jaune `0xffff00`) et seulement quand `dialogue+0x161` = copie de `plateau+0x186` (0x447984), le drapeau de mode qui désactive justement les vies dans `AddScore` — un mode hors aventure (cf. spike 02 Q3). En aventure, le seul retour est le **son joué trois fois** et le compteur du HUD.
- Le compteur `+0x178 = 150` (1,5 s) n'a pas de lecteur : probablement un clignotement du HUD abandonné. HUD : le nombre de vies est lu depuis `+0xec` ; sa mise en forme (icônes de grenouille) n'a pas été analysée [BASSE]. En début de niveau, la bannière affiche « VIES RESTANTES » + nombre si vies > 1, « DERNIÈRE VIE ! » si 1, « PARTIE TERMINÉE » si 0 (0x431e34–0x432042, police `FONT_HUGE` = nativealien48). [MOYENNE : contexte de la bannière déduit]

**Recommandation D-27 :** `addScore` : `lives += ⌊new/50000⌋ − ⌊old/50000⌋` (sans plafond), événement `extra-life` avec le nombre de vies ; son `extralife` à t, t+300 ms, t+600 ms (ou une seule fois si l'utilisateur trouve l'écho excessif) ; **pas de texte flottant** (fidèle) — si l'utilisateur veut un texte, « BONUS VIE SUPP. » en jaune près de la grenouille est la seule chaîne disponible ; HUD : grenouille(s) selon `lives`.

## Q4. Cadence des pièces (U31, D-28)

Objet « pièces » dans la mise à jour du plateau, 0x417580 (HAUTE) ; champs : `+0xc8` pointeur du point actif (0 = aucune pièce), `+0xd0` échéance (maj), `+0xf0` compteur de maj du plateau, `+0xdc` image d'animation (0..40), `LevelDesc+0x74` = `treasurefreq` (300, **aucun niveau ne le redéfinit**), `LevelDesc+0x9c` = nombre de `TreasurePoint`.

1. **Pièce visible** : si `maj > échéance` → son `JEWEL_DISAPPEAR` (`gemvanishes`, panoramique selon x) et `+0xc8 = 0` (0x4175c1–0x4175f5). Échéance = `apparition + 1000` maj = **10 s** (0x4177cf–0x4177da).
2. **Pas de pièce** — conditions d'une tentative (0x41760d–0x417654) : `score < plateau+0x160` (**cible ZUMA du niveau** : plus de pièce une fois la jauge pleine) ; au moins un `TreasurePoint` ; `Rand() % treasurefreq == 0` (0x433180 = aléa global → **probabilité 1/300 par maj**, soit en moyenne 3 s) ; `maj − échéance > treasurefreq` (**au moins 3 s après l'échéance de la pièce précédente**, échéance non remise à jour lors d'une prise : après une prise, pas de nouvelle pièce avant `apparition + 13 s`). Au début du niveau `+0xd0 = 0` (0x42083c) : première tentative possible dès 3 s.
3. **Choix du point** (0x41765a–0x41777d) : jusqu'à `2 × n` tirages `Rand() % n` ; le point est accepté si, pour chaque courbe `i` avec `dist_i ≠ 0`, **`progression_i ≥ dist_i`** où `progression_i = ⌊100 × position_de_la_bille_de_tête / nbPoints⌋` (0x40a900 : dernière bille de la liste, ÷ nombre d'entrées de 36 octets, × 100 (ds:0x54c7c0)). **`dist` est un pourcentage de la longueur de la courbe que la tête de chaîne doit avoir dépassé**, pas un dégagement en pixels (toutes les valeurs du pack sont ≤ 85 ; `0` = toujours libre). Sinon `+0xc8 = 0` et tirage suivant ; si aucun n'aboutit, pas de pièce avant une prochaine tentative.
4. **Apparition** : son `JEWEL_APPEAR` (`jewelappear`, **volume 0,40** dans `resources.xml`) avec panoramique `(x − 320) × 3000 / 320` (0x401d40 ; ≈ ±30 % de la course), 4 étincelles autour du point (0x4177e0–0x4178a4), échéance = `maj + 1000`.
5. **Prise** (0x4233fb, spike 01) : valeur `max(500, 100 × ⌊(cible − score_départ)/600⌋)`, son `JEWEL_HIT` (`coingrab`), `+0xc8 = 0` ; `+0xd0` inchangé.

Notre moteur (`src/core.ts` 384–388, 1270–1316) : visible 6 s ; intervalle 9–15 s après la disparition ; `dist` traité comme un rayon de dégagement en px ; son `coinappear` → `jewelappear` à plein gain. L'original n'est **pas moins fréquent** (période moyenne ≈ 16 s entre apparitions, 10 s de présence) : ce qui est « trop présent » est le volume (0,40 contre 1) et le fait que nos pièces réapparaissent dès 9 s après une disparition même quand la jauge est pleine.

**Recommandation D-28 (60 Hz) :** `coinVisibleTicks = 600` ; `nextAttemptTick = lastAppearTick + 780` (13 s après l'apparition, après prise comme après disparition ; `lastAppearTick = −780` en début de niveau pour autoriser dès 3 s) ; à partir de là, chaque tick, `rng.chance(1/180)` (≈ `1 − (1 − 1/300)^(100/60)`) ; aucune pièce si `score ≥ zumaTarget` ; `treasureFree(p)` = pour la courbe `p.curve`, `maxS(billes vivantes) / track.length × 100 ≥ p.dist` (`dist = 0` → libre) ; jusqu'à `2 × n` tirages avec remise ; `coinappear` **gain 0,4** et panoramique `(x − 320) / 320 × 0,3` ; `coinvanish` à l'expiration. Repli D-28 (18–30 s) inutile.

## Q5. Roulement (U32, D-29)

Objet sons/effets `plateau+0xac` (ctor 0x419610) : deux canaux de 16 octets `{vtable, instance (+4), volume (+8), actif (+0xc)}` construits à `+0x14` et `+0x24`, chacun avec une **instance de `SOUND_ROLLING`** (0x41969c, 0x4196bb). Un canal par courbe (index 0 / 1 passé par 0x402980 / 0x4029a0). HAUTE :

| Méthode | Effet | Preuve |
|---|---|---|
| Départ 0x4027d0 (via 0x402980(idx), au départ du niveau 0x4174c3 et 0x428376) | `volume = 1,0 ; actif = 1 ; SetVolume(1.0) ; Play(loop = 1, autoRelease = 0)` | 0x4027da–0x4027fe (vtable+0x14 = SetVolume(double), +0x1c = Play) |
| Rafraîchissement 0x402810 (via 0x4029a0(idx) : 0x4282f1, 0x428750, 0x428a48 pour la courbe 0, 0x4320be pour la 1) | `si volume < 0,99 : volume = 0,98` | ds:0x54c6f0 = 0,99 ; ds:0x54c6ec = 0,98 |
| Mise à jour 0x402880 (chaque maj, canal actif) | `volume −= 0,02` ; si `volume > 0` : `SetVolume(volume)` sinon `actif = 0 ; Stop()` | ds:0x54c700 = 0,02 ; vtable+0x20 = Stop |
| Pause 0x402830 (via 0x402950(bool)) | pause : `SetVolume(0)` ; reprise : `SetVolume(volume)` | 0x402844–0x40286d |

Tant que la chaîne roule, le volume oscille entre 0,96 et 0,98 (≈ constant) ; dès que le rafraîchissement cesse, **fondu linéaire de 0,98 à 0 en 49 maj (≈ 0,5 s)** puis arrêt ; redémarrage **instantané** à 1,0 ; **aucune modification de hauteur** (pas d'appel de `SetPitch`, vtable+0x18, sur ces instances) ; le volume de base est celui de la ressource (1,0, pas d'attribut `volume`) multiplié par le curseur « Sons ». La condition exacte de l'appel de rafraîchissement (chaîne en mouvement ? seulement poussée ?) n'a pas été lue [MOYENNE : sites 0x4282f1 (après une remise à zéro de l'enchaînement), 0x428750, 0x428a48 (sortie de l'état « PARTEZ »)].

**Recommandation D-29 :** garder un gain cible unique (0,35 est un choix de goût ; l'original joue l'échantillon à 1,0 × curseur) ; **montée 0 ms (ou 50 ms pour éviter le clic)** ; **fondu linéaire 500 ms** à l'arrêt (D-29 : 400 ms — compatible) ; pas de modulation de hauteur ni de vitesse (D-17 confirmé) ; un canal par chaîne si le niveau en a deux ; couper (gain 0) pendant la pause et le menu.

## Non établi / replis

| Sujet | État | Repli |
|---|---|---|
| Saut des billes en tunnel dans `Ball::Draw` | non lu (sans effet : la découpe recouvre) | D-23 : toujours dessiner |
| Sens de l'entier `+8` du CURV (= 1) | non analysé | ignorer |
| Marges exactes du dialogue OPTIONS (drapeaux `LAY_*`) | ordre vertical sûr, marges non décodées | reprendre les proportions du STATS (`stats_bg.png`) ; hauteur contenu + 250 px |
| Police du titre du dialogue (en-tête `Dialog`) | non lue | NativeAlien 18 comme le STATS |
| Échange par clic droit | non localisé | [ASSUMED] clic droit = échange ; Espace = pause dans l'original (sûr) |
| Échap / Entrée / Tab / P | aucune gestion trouvée (négatif, MOYENNE) | garder nos liaisons comme ajouts assumés |
| Rendu des grenouilles (vies) dans le HUD | non analysé | icônes actuelles |
| Condition exacte du rafraîchissement du roulement | sites d'appel identifiés, condition non lue | « au moins une bille a bougé ce tick » (actuel) |
| Dialogues `QUIT_THE_GAME_?` / `LEAVE_GAME_?` | non analysés | confirmation simple avant `BACK_TO_MAIN_MENU` |

## Journal des hypothèses

| # | Affirmation | Section | Risque si faux |
|---|---|---|---|
| C1 | Clic droit = échange de bille [ASSUMED] | Q2 | une liaison de souris différente de l'original |
| C2 | Les cutouts originaux sont des stencils du fond (comme `original.ts` 242) [ASSUMED] | Q1 | rendu des découpes légèrement différent (sans effet sur l'ordre) |
| C3 | Unité du panoramique 0x401d40 = ±10 000 (DirectSound) → ±30 % [ASSUMED] | Q4 | panoramique des sons de pièce plus ou moins marqué |
| C4 | `FONT_DIALOG` (`!program`) = police système, remplacée par Cancun 12 [ASSUMED] | Q2 | aspect des libellés |

## Validation Architecture

- Framework : `node:test` sur `.compiled/` (inchangé). Tests à ajouter dans `tests/r218.test.mjs` (ou la baseline suivante) : (1) `parseCurve` : `points[i][2]` bit 0 = tunnel, bits 1–2 = priorité, sur un CURV synthétique ; (2) `Track.priorityAt` / priorité d'une bille = max aux deux bords ; (3) ordre de dessin : fonction pure `drawOrder(balls, cutouts)` renvoyant `[P0…, cutouts, P1…]` ; (4) projectile ignorant une bille en tunnel ; (5) `addScore` : vies +1 à 50 000, +2 si 100 000 franchis d'un coup, aucune au-delà sans plafond ; (6) pièces : pas d'apparition avant `lastAppear + 780` ticks, aucune si `score ≥ zumaTarget`, `treasureFree` en % de progression ; (7) roulement : `loopRamp` → fondu 500 ms linéaire, montée ≤ 50 ms.
- Commandes : `npm test` (suite complète) ; par tâche `node --test tests/r218.test.mjs`.

## Sources

### Primaires (HAUTE)
- PE interne de `private_assets/original/Zuma.exe` (offset 0x1c51a2), désassemblage `objdump -d -M intel` : fonctions citées en § Méthode (0x4178c0, 0x404f60–0x405d70, 0x408fc0, 0x40c470, 0x409210, 0x4091d0, 0x42db30, 0x417380, 0x417580, 0x4233fb, 0x40a900, 0x433180, 0x445310, 0x445b00, 0x4402c0, 0x440470, 0x44ac50, 0x44aac0, 0x4049d0, 0x404a80, 0x447d40, 0x419610, 0x402790–0x402880, 0x415350, 0x401d40, 0x401e35, 0x431e34–0x432042).
- `private_assets/original/levels/underover/underover.dat`, `levels.xml`, `properties/resources.xml`, `private_assets/pack/pack.json`, `strings.json`.

### Secondaires (MOYENNE)
- `05-RESEARCH.md` (100 Hz, offsets de `LevelDesc`, valeur des pièces), `05-RESEARCH-02.md` (signature de 0x415350, drapeau `+0x186`).

## Metadata

**Confiance :** format CURV et ordre de dessin HAUTE ; composition du dialogue HAUTE, géométrie MOYENNE ; touches (Espace = pause) HAUTE, négatifs MOYENNE ; vies HAUTE ; pièces HAUTE ; roulement HAUTE (constantes), MOYENNE (condition de rafraîchissement).
**Date :** 2026-10-10 — valable tant que l'exécutable de référence ne change pas.
