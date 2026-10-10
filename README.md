# Zuma PWA

Reconstruction web/PWA d'un jeu de billes de type Zuma, développée à partir d'un audit comportemental et de tests de non-régression.

Baseline : **R2.0.14**.

## Contenu du dépôt

| Dossier | Rôle |
| --- | --- |
| `src/core.ts` | Moteur de simulation déterministe (chaînes, insertion à identifiants stables, destruction en 40 ticks, recul local, attraction, power-ups, multi-chaînes). |
| `src/feedback.ts` | Règles de présentation : sons déclenchés par événement, explosions, particules. |
| `src/levels.ts` | Niveaux procéduraux utilisés quand aucune ressource originale n'est fournie. |
| `src/original.ts` | Chargeur du pack de ressources privé (courbes, fonds, sprites, sons). |
| `src/render.ts` | Rendu canvas 640×480, HUD natif, panneau STATS. |
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

Relecture : le paramètre d'URL `?level=1-3` ouvre directement un niveau (temple-niveau, ici le troisième niveau du premier temple) ; il est ignoré sans pack ou si le couple est hors limites.

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

Chaque niveau du pack porte des attributs de difficulté ; `src/main.ts` (`configFromSettings`) les traduit en `EngineConfig`. Leur sémantique n'est documentée nulle part dans les données : le tableau distingue ce qui est vérifié (en jeu, sur l'original) de ce qui reste une hypothèse.

| Réglage | Valeurs observées | Interprétation retenue | Statut |
| --- | --- | --- | --- |
| `score` | 1000 → 5000 (10000 en Gauntlet) | Points à marquer dans le niveau pour remplir la jauge orange et passer en mode ZUMA (`target`). Chaîne originale : « Marquez des points pour remplir la barre orange ». Le bonus de fin de niveau reste fixe (1000). | hypothèse (cohérente avec le texte d'aide) |
| `repeat` | 40–50 (42 → 50 sur les plateaux doubles) | Probabilité (%) qu'une nouvelle bille répète la couleur de la précédente (`repeatChance`) ; des séries de 3 ou 4 apparaissent donc naturellement. | hypothèse (confirmée par l'impression de jeu : groupes constitués dès 1-1) |
| `single` | 7–9, niveaux avancés seulement | Probabilité (%) d'une bille isolée : différente de la précédente et de la suivante (`singleChance`). | hypothèse |
| `start` | 35 → 45 | Nombre de billes envoyées à vitesse rapide avant que la chaîne ralentisse à `speed`. | vérifié |
| `speed` | 0,5 → 0,6 (px par pas à 100 Hz) | Vitesse de croisière de la chaîne, ×100 → px/s. | vérifié |
| `slowfactor` | 4 | Diviseur de vitesse de la balle RALENTIR. | vérifié |
| `firespeed` | 6 (px par pas à 100 Hz) | Vitesse du projectile, ×100/60 → px par tick. | vérifié |
| `powerfreq` | 3000 (pas à 100 Hz) | Intervalle moyen entre deux power-ups ; garde = 30 % de la valeur, puis tirage par tick. | hypothèse |
| `partime` | 90 → 130 (s) | Temps de référence affiché sur l'écran STATS (« OBJECTIF »). | vérifié |
| `colors` | 4 (1-1 à 1-3 seulement) | Nombre de couleurs ; sinon déduit du temple (4, 5, 6). | hypothèse pour la déduction |
| `zumaslow`, `zumaback`, `mergespeed`, `reloaddelay` | — | Non interprétés ; `mergespeed` a seulement inspiré `mergeTicks`. | à confirmer |

### Écran STATS d'origine

Avec le pack, l'écran STATS est **composé à l'exécution** (`src/statsdialog.ts`) à partir des briques du jeu original, sur un canvas 640×480 posé en fond inline de `.zuma-stats` (la feuille de style ne référence aucune image) :

- `images/dialogbox.jpg` + `_dialogbox.gif` : cadre dessiné en 9 tranches (coins non étirés, bords étirés dans une dimension, centre étiré) sur le rectangle mesuré de la référence R2.0.12 (x 109–531, y 91–446) ;
- `images/GodHead.gif` + masque : tête de divinité centrée, chevauchant le bord supérieur ;
- `images/DialogButton.jpg` + `_Dialogbutton.gif` : bouton OK, trois états peints (normal / survol / pressé) suivis par le contrôle transparent `#result-continue` ; son `button1` au clic ;
- polices bitmap PopCap lues depuis leurs scripts `fonts/*.txt` (`src/bitmapfont.ts`) : titre en `NativeAlienExtended18` (teinte du gif), libellés et valeurs en `Cancun12` teinté (libellés jaunes, valeurs crème, TEMPS et BONUS verts, OBJECTIF orange, RECORD or), astuce en `Arial12Bold` ;
- libellés et astuces = chaînes originales de `properties/default.xml` (`pack/strings.json` : STATS, POINTS, COMBOS, COINS, GAPS, MAX_CHAIN, MAX_COMBO, YOUR_TIME, ACE_TIME, BONUS, BEST_TIME, NO_TIME_BONUS, TIP, OK et les sept astuces).

Colonne gauche : POINTS (score du niveau), COMBOS, PIÈCES (pièces touchées), SAUTS, ENCH. MAX., COMBO MAX. Colonne droite : TEMPS (durée du niveau), OBJECTIF (`partime`), BONUS (`+N` = bonus de temps d'expert accordé par le moteur en fin de niveau, sinon « PAS DE BONUS » à la place du libellé), RECORD = **meilleur temps du niveau**, persisté dans `localStorage` sous `zuma.best.<id>` (id du niveau du pack ou `proc-N`), mis à jour sur victoire et affiché dès la première partie (alors égal au temps courant). Les dix valeurs se révèlent ligne par ligne (90 ms, son `pop`). Chaque état (ligne révélée, survol, pressé) recompose le canvas, encodé en PNG de façon synchrone (`toDataURL`, ~10 ms) et exposé en URL d'objet ; l'image précédente n'est révoquée qu'une fois la nouvelle décodée.

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
- décodeur de courbes originales vérifié sur un fichier synthétique.

## Fournir ses propres graphismes de niveau

Le jeu charge n'importe quel niveau décrit dans le format du pack (`private_assets/pack/pack.json`, ignoré par Git), que les fichiers viennent de l'import original ou d'une création personnelle. Pour un niveau d'identifiant `<id>` :

- **Fond** : `levels/<id>/<id>.jpg` ou `.png`, 640×480, référencé par `graphics.<id>.background`. Il est dessiné 1:1, jamais mis à l'échelle : une image d'une autre taille est recadrée, pas étirée. Vignette optionnelle `levels/<id>/thumb.jpg` (320×240) dans `graphics.<id>.thumbnail`.
- **Découpes** (tunnels, dessinées au-dessus des billes) : un PNG avec couche alpha `levels/<id>/<nom>.png` et sa position en pixels (coin haut-gauche), déclarés dans `graphics.<id>.cutouts: [{ "image": "<nom>", "x": …, "y": …, "priority": 1 }]` et `graphics.<id>.layers.<nom> = { "color": "levels/<id>/<nom>.png", "alpha": null }`. Un calque avec `"color": null` et un masque dans `"alpha"` découpe le fond lui-même à cette position (format PopCap `_<nom>.gif`).
- **Calques animés** (sous les billes) : même format d'image et de calque, déclarés dans `graphics.<id>.overlays: [{ "image": "<nom>", "x": …, "y": …, "vx": …, "vy": … }]` ; `vx, vy` donnent la direction d'une oscillation lente (amplitude ≤ 3 px).
- **Tracé** : `levels/<fichier>.json` = `{ "version": 2, "controls": [[x, y], …], "points": [[x, y, flags], …] }`. Les `points` sont en pixels, échantillonnés au pas ≈ 1 px du trou d'entrée vers le crâne ; `flags` bit 1 = la bille passe sous une découpe, bit 2 = bille cachée. Le fichier est référencé par `graphics.<id>.curveFiles` (plusieurs tracés = plusieurs chaînes) et la grenouille par `graphics.<id>.frog = { "x": …, "y": … }`.

Ces fichiers vont dans `private_assets/pack/` ; `npm run dev` les charge sans autre configuration.

## Statut

R2.0.14 est une baseline jouable, pas une revendication de reproduction bit-à-bit. La loi RNG exacte des power-ups et plusieurs réglages originaux (`zumaslow`, `zumaback`, pièces bonus) restent à documenter ; `repeat`, `single` et `score` sont interprétés comme décrit dans « Réglages originaux » (hypothèses à confirmer sur l'original).
