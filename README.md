# Zuma PWA

Reconstruction web/PWA d'un jeu de billes de type Zuma, développée à partir d'un audit comportemental et de tests de non-régression.

Baseline : **R2.0.13**.

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
npm test        # build + 31 tests + garde-fou de publication
npm run dev     # build local (avec ressources privées si présentes) puis http://localhost:8080
```

Commandes : clic pour tirer, clic droit ou Espace pour échanger la bille, `P` pause, `Échap` menu, `M` son.

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
- persistance des billes pendant la phase de destruction (40 ticks) ;
- attraction et reconnexion uniquement après contact physique ;
- recul local propagé de segment en segment ;
- couleur immuable des projectiles en vol ;
- filtrage des munitions sur les couleurs présentes ;
- quatre familles de power-ups (Bombe, Ralentir, Retour, Visée) avec leurs sons dédiés ;
- bonus saut, enchaînements, mode ZUMA, perte de vie et victoire ;
- HUD natif 640×480 et écran STATS monolithique à bouton OK unique ;
- décodeur de courbes originales vérifié sur un fichier synthétique.

## Statut

R2.0.13 est une baseline jouable, pas une revendication de reproduction bit-à-bit. La loi RNG exacte des power-ups et plusieurs réglages originaux (`single`, `zumaslow`, `zumaback`, pièces bonus) restent à documenter.
