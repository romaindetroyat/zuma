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
- HUD natif 640×480 et écran STATS monolithique à bouton OK unique ;
- décodeur de courbes originales vérifié sur un fichier synthétique.

## Fournir ses propres graphismes de niveau

Le jeu charge n'importe quel niveau décrit dans le format du pack (`private_assets/pack/pack.json`, ignoré par Git), que les fichiers viennent de l'import original ou d'une création personnelle. Pour un niveau d'identifiant `<id>` :

- **Fond** : `levels/<id>/<id>.jpg` ou `.png`, 640×480, référencé par `graphics.<id>.background`. Il est dessiné 1:1, jamais mis à l'échelle : une image d'une autre taille est recadrée, pas étirée. Vignette optionnelle `levels/<id>/thumb.jpg` (320×240) dans `graphics.<id>.thumbnail`.
- **Découpes** (tunnels, dessinées au-dessus des billes) : un PNG avec couche alpha `levels/<id>/<nom>.png` et sa position en pixels (coin haut-gauche), déclarés dans `graphics.<id>.cutouts: [{ "image": "<nom>", "x": …, "y": …, "priority": 1 }]` et `graphics.<id>.layers.<nom> = { "color": "levels/<id>/<nom>.png", "alpha": null }`. Un calque avec `"color": null` et un masque dans `"alpha"` découpe le fond lui-même à cette position (format PopCap `_<nom>.gif`).
- **Calques animés** (sous les billes) : même format d'image et de calque, déclarés dans `graphics.<id>.overlays: [{ "image": "<nom>", "x": …, "y": …, "vx": …, "vy": … }]` ; `vx, vy` donnent la direction d'une oscillation lente (amplitude ≤ 3 px).
- **Tracé** : `levels/<fichier>.json` = `{ "version": 2, "controls": [[x, y], …], "points": [[x, y, flags], …] }`. Les `points` sont en pixels, échantillonnés au pas ≈ 1 px du trou d'entrée vers le crâne ; `flags` bit 1 = la bille passe sous une découpe, bit 2 = bille cachée. Le fichier est référencé par `graphics.<id>.curveFiles` (plusieurs tracés = plusieurs chaînes) et la grenouille par `graphics.<id>.frog = { "x": …, "y": … }`.

Ces fichiers vont dans `private_assets/pack/` ; `npm run dev` les charge sans autre configuration.

## Statut

R2.0.14 est une baseline jouable, pas une revendication de reproduction bit-à-bit. La loi RNG exacte des power-ups et plusieurs réglages originaux (`single`, `zumaslow`, `zumaback`, pièces bonus) restent à documenter.
