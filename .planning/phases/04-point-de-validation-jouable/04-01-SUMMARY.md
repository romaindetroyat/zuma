---
phase: 04-point-de-validation-jouable
plan: 01
subsystem: assets-and-rendering
tags: [importer, ffmpeg, aac, canvas, devicePixelRatio, pixelated, playwright]
requires: []
provides:
  - "Importateur : fonds image préservés, levels/<id>/thumb.jpg, .m4a AAC optionnel, sounds/manifest.json format 2"
  - "Renderer : fond 1:1, BackgroundAlpha sous les billes, resize(cssWidth, dpr, pixelated) + setTransform"
  - "Application : applyScaling() (resize / ResizeObserver / dpr), option « Pixels nets » persistée (zuma.pixelated)"
  - "Outillage : MIME audio/mp4 (build standalone + serve), garde-fou .m4a/.aac"
affects: [04-03 (AudioManager consomme manifest format 2), 04-03 (vérification visuelle du niveau 1-3)]
tech-stack:
  added: []
  patterns:
    - "execFileSync('ffmpeg', [argv]) sans shell, try/catch par fichier, .m4a partiel supprimé"
    - "Backing store canvas = min(4, échelle CSS × devicePixelRatio) ; logique inchangée en 640×480 via ctx.setTransform"
    - "Mode pixelisé : store 640×480 + --k entier sur .stage.pixelated + image-rendering: pixelated"
key-files:
  created:
    - tests/r214-import.test.mjs
  modified:
    - tools/import-original.mjs
    - tools/build.mjs
    - tools/serve.mjs
    - tools/guard.mjs
    - src/render.ts
    - src/main.ts
    - index.html
    - public/style.css
decisions:
  - "D-01 : vignette copiée sous thumb.jpg, fond jamais écrasé ; copyImage restreint à IMAGE_EXTS (.jpg/.jpeg/.png/.gif)"
  - "D-02 : fond dessiné 1:1 (recadrage si plus grand, marges noires si plus petit), jamais mis à l'échelle"
  - "D-03 : BackgroundAlpha dessinés juste après le fond avec dérive sin(frame/90) normalisée à 3 px ; Cutout au-dessus des billes"
  - "D-04 : Renderer.resize() plafonné à 4× (2560×1920) ; imageSmoothingEnabled forcé à true dans draw()"
  - "D-05 : option « Pixels nets » (zuma.pixelated === '1') ; k = floor(min(innerW/640, innerH/480)) ≥ 1"
  - "D-06 (importateur) : transcodage AAC 96k +faststart quand ffmpeg répond ; désactivable par { transcode: false } ou ZUMA_NO_TRANSCODE=1"
metrics:
  duration: "~25 min"
  completed: 2026-10-10
  tasks: 3
  files: 9
---

# Phase 4 Plan 01: Décors fidèles et nets (importateur, fond 1:1, DPR, Pixels nets) Summary

Importateur corrigé (le fond 640×480 n'est plus écrasé par la vignette 320×240, le `.dat` n'est plus pris pour une image, `.m4a` AAC à côté de chaque `.ogg`, manifest format 2), fond dessiné 1:1 avec la mosaïque `BackgroundAlpha` sous les billes, backing store du canvas suivant `devicePixelRatio × échelle CSS`, et option de menu « Pixels nets » persistée.

## Tasks

| # | Tâche | Commit | Fichiers |
|---|-------|--------|----------|
| 1 | Importateur — fond préservé, thumb.jpg, extensions image, transcodage AAC, manifest format 2, MIME, garde-fou | `38eec23` | tools/import-original.mjs, tools/build.mjs, tools/serve.mjs, tools/guard.mjs, tests/r214-import.test.mjs |
| 2 | Renderer — fond 1:1, overlays sous les billes, backing store au devicePixelRatio | `36ecad5` | src/render.ts |
| 3 | Option « Pixels nets », mise à l'échelle DPR côté application et shell | `3d0904d` | src/main.ts, index.html, public/style.css |

## Vérifications

- `npm run check` (tsc --noEmit) : vert.
- `npm test` : 33/34 ; le seul échec est `tests/r214.test.mjs`, les verrous RED du plan 04-02 (commit `340615a`, TDD en cours, fichier hors périmètre). r206, r211, r213, r214-import : verts. Garde de publication : « 449 tracked files, none proprietary ».
- `node tools/import-original.mjs` — ligne de résumé : `pack written to /home/user/zuma/private_assets/pack: 22 levels, 25 curves, 37 sounds, 37 m4a, 76 images`.
- Pack : 21/22 `graphics.background` en `.jpg/.png/.gif` (voir déviation ci-dessous pour `space`), aucun chemin `.dat`, 21 `thumb.jpg`, `levels/riverbed/riverbed.jpg` = JPEG 640×480, `thumb.jpg` = 320×240, 37 `.m4a`, `manifest.json` = `{ format: 2, sounds: { fire: ['ogg','m4a'], … } }`.
- Playwright (`scratchpad/dpr-check.mjs`, Chromium, viewport 1280×960, deviceScaleFactor 2) :
  - mode lissé : canvas `[2560, 1920]` (échelle CSS 2 × dpr 2 = 4), pas de classe `pixelated` ;
  - `zuma.pixelated = '1'` : canvas `[640, 480]`, `.stage` = `1280px` (k = 2), `image-rendering: pixelated`, libellé « Pixels nets : activés » ;
  - clic sur `#menu-pixels` : retour à `[2560, 1920]`, `localStorage.zuma.pixelated === '0'`, libellé « Pixels nets : désactivés » ;
  - aucune erreur de page.
- Captures (jamais commitées, ressources originales) :
  - `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r214/dpr2.png`
  - `/tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad/shots-r214/pixelated.png`
  - Les deux montrent le niveau 1-1 (spirale) avec le fond original 640×480 dessiné 1:1 (plus la vignette étirée), HUD net à dpr 2, et le rendu à bords durs en mode pixelisé.

## Deviations from Plan

### Constat (pas de correction nécessaire)

**1. Le niveau `space` n'a pas de fond image dans l'installation originale**
- **Found during:** Task 1 (script de vérification du plan : « 22 niveaux avec `background` image »)
- **Issue:** `private_assets/original/levels/space/` ne contient que `space.dat` (pas de `.jpg`, pas de vignette). L'importateur produit donc `background: null`, `thumbnail: null` pour ce niveau — c'est le comportement attendu (chargement tolérant → repli procédural), et c'est exactement ce que l'ancien bug masquait en pointant vers le `.dat`.
- **Fix:** aucune ; la vérification a été relancée en tolérant `null` pour `space` uniquement. Les 21 autres niveaux ont un fond image et un `thumb.jpg`.
- **Note :** `space` figure dans `pack.stages` ; il sera rendu avec le plateau procédural tant qu'aucun décor n'est fourni (format utilisateur à documenter, cf. CONTEXT « Specific Ideas »).

### Coordination avec le plan 04-02

- `tsc` a échoué une fois sur `src/core.ts` (`insertGrowing` déclaré non utilisé) pendant l'édition parallèle du plan 04-02 ; attente et relance (4e tentative verte), aucun fichier hors périmètre modifié.

## Known Stubs

Aucun. Le bouton « Pixels nets » est câblé ; `drawOverlays` consomme `view.art.overlays` fournis par `OriginalPack.levelArt()`.

## Threat Flags

Aucune nouvelle surface au-delà du registre du plan : ffmpeg appelé via `execFileSync` avec tableau d'arguments (T-04-01), échec par fichier non bloquant et `.m4a` partiel supprimé (T-04-02), `.m4a`/`.aac` bannis par le garde-fou (T-04-03), échelle du backing store plafonnée à 4 (T-04-06).

## Pour le plan 04-03

- Contrat `sounds/manifest.json` : `{ "format": 2, "sounds": { "<key>": ["ogg", "m4a"] } }` ; `pack.json.sounds` reste `string[]`. Les `.m4a` sont servis en `audio/mp4` par `tools/serve.mjs` et inclus dans le standalone.
- `Renderer.drawChain` / `drawBall` / `drawFrog` n'ont pas été touchés.
- Vérification visuelle du niveau 1-3 (riverbed, mosaïque animée sous les billes) à faire dans 04-03 comme prévu.

## Self-Check: PASSED

- 9 fichiers source créés/modifiés présents, 2 captures dans le scratchpad, commits `38eec23`, `36ecad5`, `3d0904d` présents dans `git log`.
- Marqueurs must_haves : `thumb` (import-original.mjs), `drawOverlays` (render.ts), `zuma.pixelated` (main.ts), `pixelated` (style.css), r214-import.test.mjs = 83 lignes (≥ 40).
