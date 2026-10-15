---
phase: 04-point-de-validation-jouable
plan: 04
subsystem: stats-screen
tags: [stats, original-dialog, texture-cloning, importer, css-container-units, playwright]

# Dependency graph
requires:
  - plan: 04-01
    provides: importateur (copyImage/IMAGE_EXTS), pack.json.images, build standalone avec data URLs
  - plan: 04-03
    provides: openStats() coupe les boucles (stopLoops), ?level=S-L pour la relecture
provides:
  - "tools/import-r212-stats.mjs : extractStatsImage/importStats/STATS_LAYOUT → private_assets/original/extra/stats_bg.png + stats_layout.json"
  - "tools/import-original.mjs : images de original/extra/ dans pack/images/, stats_layout.json dans pack/ (pack.json.statsLayout)"
  - "original.ts : StatsLayout/StatsSlot/StatsArt, OriginalPack.statsArt(), cleanStats() (clonage fondu + bandeau HUD transparent)"
  - "index.html : structure STATS R2.0.12 (stats-idol, h2#results-title, stats-columns, stats-rule, stats-gap, stats-tip, un seul #result-continue.stats-ok)"
  - "style.css : rendu vectoriel de la structure + mode #stats.stats-original (image plein cadre, valeurs positionnées, OK transparent)"
  - "main.ts : openStats() → 10 valeurs vivantes, layoutOriginalStats(), revealStats(), formatSeconds()"
  - "core.ts : Stats.combos"
affects: [phase-5 (pièces : slot coins déjà câblé à 0), phase-7]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Image propriétaire nettoyée au chargement sur un canvas (drawImage patch→erase en trois passes 4 px/0,35 · 2 px/0,6 · 0 px/1), exposée en URL d'objet (toBlob) pour ne pas mettre 3,6 Mo dans un attribut style"
    - "Mise à l'échelle des valeurs par unités de conteneur : #stats{container-type:size} → font-size en cqh, positions en % de l'image étirée 100 %/100 %"
    - "Mesures en pixels dans l'outil (STATS_LAYOUT_PX), fractions à 4 décimales dans le JSON (hors Git)"

key-files:
  created:
    - tools/import-r212-stats.mjs
  modified:
    - tools/import-original.mjs
    - src/original.ts
    - src/main.ts
    - src/core.ts
    - index.html
    - public/style.css
    - tests/r214-presentation.test.mjs
    - README.md
    - R214_RELEASE_NOTES.md

key-decisions:
  - "Trois rectangles par emplacement (box / erase / patch) au lieu d'un seul : la zone effacée est étroite (chiffres figés + ombre), la zone d'écriture est large (du bout du libellé au bord droit) pour accueillir des valeurs plus longues ; patch toujours de la même taille que erase, pris sur le même panneau (même ligne, ou juste dessous pour BONUS)"
  - "Couleurs relevées sur l'image : colonne gauche crème #fcf4d0, TEMPS/OBJECTIF/RECORD or #fcdc80, BONUS vert #58d828 (le plan supposait du jaune partout)"
  - "Image exposée en URL d'objet (canvas.toBlob) plutôt qu'en data URL inline ; repli toDataURL si toBlob manque"
  - "Survol du OK : backdrop-filter: brightness(1.15) + voile rgba(255,255,230,.14) (un filter sur un pseudo-élément transparent n'aurait rien éclairci)"
  - "Animation d'entrée en fondu seul (statsIn opacité, 0,32 s) : un scale sur une image plein cadre aurait fait bouger le bandeau HUD vivant"
  - "Overlay #stats.stats-original à fond transparent : le HUD vivant n'est pas assombri (comme dans l'original)"
  - "« AUCUN » à la place de « PAS DE BONUS » (trop long pour le cadre peint, prévu par le plan) ; temps « 29 s » sous la minute, « 1:42 » au-delà"
  - "Stats.combos ajouté au moteur (non dérivable de matches/maxCombo), verrouillé par test sur la fixture d'attraction de r213"

# Metrics
duration: ~20 min
completed: 2026-10-10
tasks: 3
files: 10
---

# Phase 4 Plan 04: Écran STATS d'origine (valeurs vivantes dans les cadres du dialogue, sans panneau) Summary

## ARRÊT DEMANDÉ — changement de direction (2026-10-10)

L'orchestrateur a demandé l'arrêt du plan 04-04 **après** l'exécution complète des trois tâches : l'utilisateur veut que l'écran STATS soit reconstruit à partir des ressources du jeu original (`images/dialogbox.jpg` + `_dialogbox.gif` en cadre 9-slice, `images/GodHead.gif` + masque, `images/DialogButton.jpg` + `_Dialogbutton.gif`, polices bitmap `fonts/NativeAlienExtended18` et `fonts/Cancun12` avec leurs `.txt`, chaînes de `properties/default.xml`), la capture R2.0.12 ne servant que de référence de mise en page. Le plan sera réécrit.

**État exact au moment de l'arrêt :**
- Aucune tâche en cours : les trois tâches étaient commitées, suite de tests verte (49/49), `npm run check` vert, garde verte. Arbre de travail propre (seul ce SUMMARY est non suivi). Rien n'a été abandonné à mi-chemin ni `git checkout`-é.
- Commits de ce plan, dans l'ordre : `ae72f0d` (Task 1), `8cd9bb9` (Task 2), `15beb7b` (Task 3). Détail dans « Task Commits » ci-dessous. L'orchestrateur décide de les conserver, de les réverter ou de les remplacer.
- Approche commitée **supplantée** par la nouvelle direction : rendu STATS par l'image `stats_bg` nettoyée (`OriginalPack.statsArt()` / `cleanStats()`, `#stats.stats-original` posant l'image plein cadre, `STATS_LAYOUT`/`stats_layout.json`, `tools/import-r212-stats.mjs`). À retirer ou à reconvertir lors de la réécriture.
- Éléments **réutilisables** par le plan réécrit : structure `index.html` R2.0.12 avec ses ids (`result-*`, un seul `#result-continue`) et ses verrous de test ; `Stats.combos` (core.ts, verrouillé) ; `formatSeconds()` et le remplissage des dix valeurs dans `openStats()` ; la révélation progressive ; les mesures de mise en page relevées sur la capture (positions des lignes, alignement à droite, couleurs crème/or/vert, hauteur de capitale 25/1089) ; les copies pack de `dialogbox`, `_dialogbox`, `godhead`, `_godhead`, `dialogbutton`, `_dialogbutton` (déjà dans `IMAGES` de l'importateur, présentes dans `pack.json.images`).
- Manque pour la nouvelle direction : les polices bitmap ne sont pas importées (`private_assets/original/fonts/` contient `NativeAlienExtended18.gif` + `_NativeAlienExtended18.gif` + `.txt`, et `_Cancun12.gif` + `Cancun12.txt` — pas de `Cancun12.gif` couleur dans l'arbre) ; aucune lecture de `properties/default.xml` n'existe encore dans l'importateur.

Le reste de ce document décrit ce qui a été réalisé et commité avant l'arrêt.

**Avec le pack, l'écran STATS est le dialogue original lui-même : les chiffres figés de `stats_bg.png` sont effacés au chargement par clonage fondu de la texture voisine, le bandeau HUD figé est rendu transparent, et les dix valeurs vivantes s'écrivent exactement aux emplacements mesurés (alignées à droite, couleurs et taille relevées sur l'image) ; aucun panneau superposé. Sans pack, le panneau vectoriel reste, avec la même structure R2.0.12.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 10 (1 créé)

## Task Commits

| # | Tâche | Commit | Fichiers |
|---|-------|--------|----------|
| 1 | Extraction et transport de l'image STATS | `ae72f0d` | tools/import-r212-stats.mjs, tools/import-original.mjs |
| 2 | Mesure, nettoyage et incrustation dans les cadres d'origine | `8cd9bb9` | tools/import-r212-stats.mjs, tools/import-original.mjs, src/original.ts, src/core.ts, src/main.ts, index.html, public/style.css |
| 3 | Verrous, documentation, standalone | `15beb7b` | tests/r214-presentation.test.mjs, README.md, R214_RELEASE_NOTES.md |

Le SUMMARY n'est pas commité (consigne de l'orchestrateur) ; STATE.md et ROADMAP.md non modifiés.

## Ce qui a été fait

### Task 1 — extraction
- `tools/import-r212-stats.mjs <standalone> [extra]` : prend la dernière règle `.zuma-stats:before{…url(data:image/…;base64,…)}` (la première est `display:none`), décode, écrit `stats_bg.png` ; code 1 et message si absent. Résultat identique octet pour octet à l'image déjà extraite (1445×1089, 2 702 743 octets).
- `tools/import-original.mjs` : toute image de `original/extra/` est copiée dans `pack/images/` et enregistrée sous son radical (`images.stats_bg`). Pack : 77 images (76 + stats_bg). `src/original.ts` inchangé pour cette tâche (`image('stats_bg')` fonctionne par la carte `images`).

### Task 2 — mesure, nettoyage, incrustation
- **Mesures (PIL, image 1445×1089)** : chiffres de 25 px de haut (capitale) ; bord droit des valeurs x = 675 (gauche) / 1105 (droite) ; lignes à y = 473, 516, 559, 601, 643, 685 (gauche), 474, 517, 585, 640 (droite) ; ombre portée +2 px / +2 px quasi noire ; séparateur vertical x = 724 ; bouton OK vert x 601–842, y 877–929 ; titre y 327–401 ; bandeau HUD 0–100 px (= 44/480). Couleurs dominantes : crème `#fcf4d0` (colonne gauche), or `#fcdc80` (TEMPS, OBJECTIF, RECORD), vert `#58d828` (BONUS).
- `STATS_LAYOUT` dans l'outil (pixels → fractions 4 décimales) sérialisé en `extra/stats_layout.json`, copié par `import-original.mjs` dans `pack/stats_layout.json` et référencé par `pack.json.statsLayout`.
- `OriginalPack.statsArt()` : charge `stats_bg` + le JSON, `cleanStats()` dessine l'image, clone `patch` sur `erase` pour chaque emplacement en trois passes (4 px plus large à α 0,35, 2 px à 0,6, puis opaque) puis `clearRect` du bandeau HUD ; renvoie `{ canvas, layout, url }` (URL d'objet PNG). Chargé en tâche de fond après les sprites.
- `index.html` : structure R2.0.12 reprise avec ses ids ; `public/style.css` : styles vectoriels de la structure, puis `#stats.stats-original` (fond transparent, `container-type:size`, `.zuma-stats` plein cadre avec `background-size:100% 100%`, textes de la structure en `opacity:0`, `strong` en absolu/flex aligné à droite avec ombre `.03em/.06em`, OK transparent sur le bouton peint avec surbrillance au survol, fondu `statsIn`). Bloc R2.0.11 intact, aucun `url(`.
- `main.ts` : `openStats()` remplit `result-points/combo/coins/gaps/chain/combo-max/time/objective/expert/record`, bascule `stats-original`, `layoutOriginalStats()` pose l'image et les positions/tailles (`cqh`)/couleurs en style inline une seule fois, `revealStats()` ajoute `stats-reveal` toutes les 90 ms (timers purgés dans `closeStats()`). `formatSeconds()` exporté.
- `core.ts` : `Stats.combos` incrémenté dans `destroyRun` quand `depth > 1`.

### Task 3 — verrous, documentation, standalone
- Tests ajoutés (4) dans `tests/r214-presentation.test.mjs` ; README « Écran STATS d'origine » (commande, structure du JSON) ; notes R2.0.14 (section STATS, outil, tests).
- `node tools/build.mjs --standalone` : `standalone/zuma-standalone.html` = **10,4 MiB** (7,0 avant l'image STATS de 2,7 Mo).

## Vérifications

- `npm run check` : vert. `npm test` : **49/49** (r206, r211, r213, r214, r214-import, r214-presentation) + garde « 458 tracked files, none proprietary ». Verrous r211 : un seul `result-continue`, tail CSS après `R2.0.11` avec `background:radial-gradient`, `.zuma-stats h2{display:block`, `.stats-ok{display:block`, aucun `url(`.
- `node tools/import-r212-stats.mjs private_assets/original/extra/Zuma_R2_0_12_Local_Autonome.html` → `stats_bg.png: 1445×1089, 2702743 bytes` + `stats_layout.json: 10 slots` ; `node tools/import-original.mjs` → `22 levels, 25 curves, 37 sounds, 37 m4a, 77 images`, `pack.json.statsLayout = "stats_layout.json"`.
- Playwright (Chromium, 1280×960, dpr 2), scripts `scratchpad/stats-shot.mjs` et `stats-vector.mjs` — captures hors dépôt dans `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r214/` :

| Fichier | Contenu | Constat |
|---------|---------|---------|
| `stats-pack.png` | dist servi, `?level=1-1`, clic STATS (598, 462) | dialogue original plein cadre, aucun panneau superposé, titre/libellés/astuce/OK = ceux peints, valeurs vivantes alignées à droite dans les cadres (TEMPS 8 s, OBJECTIF 25 s), HUD vivant du canvas visible en haut (MENU, vies, score, 1-1, jauge) ; `stats-original` = true, `backgroundImage = url("blob:…")`, `okCount = 1`, h2 opacité 0, valeurs opacité 1 après révélation, aucune erreur console |
| `stats-pack-left.png`, `stats-pack-right.png` | zoom ×2 sur les deux colonnes | aucune marche de texture aux emplacements nettoyés, chiffres à la hauteur des capitales des libellés |
| `stats-pack-hud.png` | bandeau 0–70 px | HUD vivant au-dessus de l'image (raccord à 44 px) |
| `stats-pack-ok-hover.png` | survol du OK peint | surbrillance discrète du bouton peint |
| `stats-standalone.png` (+ `-left/-right/-hud/-ok-hover`) | `file://…/standalone/zuma-standalone.html?level=1-1` | badge `R2.0.14 · … · ressources originales`, valeurs vivantes POINTS 790 / COMBOS 3 / COMBO MAX. 4 / TEMPS 7 s / OBJECTIF 25 s / RECORD 790, HUD vivant score 790 et jauge, aucune erreur |
| `stats-vector.png` | `pack.json` bloqué (route abort) | panneau vectoriel radial, structure R2.0.12, valeurs visibles, OK unique ; seule erreur console : la ressource bloquée |

## Deviations from Plan

### Ajustements nécessaires (Rule 1/2 — la lettre du plan aurait produit un rendu faux ou inefficace)

**1. Trois rectangles par emplacement (`box` / `erase` / `patch`)**
- **Found during:** Task 2 (mesure)
- **Issue:** le plan prévoit un seul `box` servant à la fois à effacer et à écrire. Aucun patch propre de la largeur de la zone d'écriture n'existe sur la même ligne (le libellé l'occupe), et une valeur vivante plus longue que le chiffre figé (score à 6 chiffres) déborderait de la zone effacée.
- **Fix:** `erase` (chiffres + ombre, étroit) cloné depuis `patch` de même taille ; `box` large pour la valeur vivante. Structure documentée dans le README et verrouillée par test.

**2. Couleurs réelles**
- **Issue:** le plan supposait du jaune `#f0c94a`-ish pour les points ; la colonne gauche est crème (`#fcf4d0`, saturation faible), la droite or (`#fcdc80`), BONUS vert (`#58d828`).
- **Fix:** valeurs relevées (pixels les plus fréquents > 200 de luminance) écrites dans `STATS_LAYOUT`.

**3. Survol du OK**
- **Issue:** `filter: brightness(1.15)` sur un pseudo-élément transparent n'éclaircit rien.
- **Fix:** `backdrop-filter: brightness(1.15)` + voile clair sur le bouton transparent lui-même.

**4. Animation d'entrée**
- **Issue:** `statsIn` en scale (.9 → 1.025 → 1) sur une image plein cadre ferait bouger le bandeau HUD vivant et découvrirait les bords.
- **Fix:** fondu d'opacité seul (0,32 s) en mode pack.

**5. Image en URL d'objet**
- **Issue:** `canvas.toDataURL()` dans un `style` inline = 3,6 Mo dans un attribut DOM.
- **Fix:** `canvas.toBlob` → `URL.createObjectURL` (style inline conservé : `backgroundImage: url("blob:…")`), repli `toDataURL` si `toBlob` est absent.

**6. Overlay transparent en mode pack**
- **Issue:** le fond `rgba(0,0,0,.55)` de `.overlay` assombrirait le HUD vivant sous le bandeau transparent, alors que l'original ne l'assombrit pas.
- **Fix:** `#stats.stats-original{background:transparent}`.

### Hors plan
- `Stats.combos` ajouté au moteur (le plan l'autorisait « uniquement si nécessaire » : non dérivable). Test ajouté conformément à CLAUDE.md.

## Auth gates
Aucune.

## Known Stubs
- `result-coins` vaut toujours `0` : les pièces n'existent pas encore (prévu par le plan, phase 5 « Pièces bonus »). L'emplacement est câblé ; seule la source de données manque.

## Threat Flags
Aucune surface nouvelle : `stats_layout.json` est lu par `fetch` (ou data URL embarquée) et seules des valeurs numériques en fractions sont appliquées (styles inline de position/taille/couleur, `color` du JSON appliqué tel quel via `style.color` — propriété CSS, pas de HTML) ; `statsArt()` est en try/catch → `null` → panneau vectoriel ; l'image reste hors Git (garde verte, `git status` sans `.png`).

## Next
- Validation utilisateur sur Windows (Georgia avec `lining-nums` : chiffres alignés ; ici Chromium Linux a utilisé le serif de repli).
- Phase 5 : brancher `result-coins`.

## Self-Check: PASSED

- 11 fichiers présents (10 sources/docs + standalone), SUMMARY écrit ; commits ae72f0d, 8cd9bb9, 15beb7b présents dans `git log` ; `git status` : seul le SUMMARY est non suivi, aucun `.png`.
