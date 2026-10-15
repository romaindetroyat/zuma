---
phase: quick-261010-bba
plan: 01
subsystem: build
tags: [standalone, pwa, assets, error-handling]
provides:
  - assetUrl() résolveur unique pour les ressources (data URLs embarquées ou fichiers)
  - overlay #boot visible sans JavaScript, masqué au démarrage, porteur des erreurs d'initialisation
  - bundler standalone sans monkeypatch de fetch / HTMLImageElement
affects: [standalone, original-pack, audio]
tech-stack:
  added: []
  patterns: [résolveur d'URL explicite, overlay d'amorçage]
key-files:
  created: []
  modified: [src/original.ts, src/audio.ts, src/main.ts, index.html, public/style.css, tools/build.mjs, tests/r213.test.mjs]
key-decisions:
  - "Le standalone injecte uniquement window.__ZUMA_ASSETS__ ; le code applicatif choisit l'URL"
duration: 12min
completed: 2026-10-10
status: complete
---

# Quick Task 261010-bba: Standalone robuste Summary (Minimal)

**Le fichier standalone affiche le jeu, ou un message explicite, jamais un écran noir muet.**

## Performance
- **Duration:** 12 min
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `assetUrl()` dans `src/original.ts` remplace le monkeypatching de `fetch` et `HTMLImageElement.prototype.src` ; `src/audio.ts` l'utilise aussi
- Overlay `#boot` (« Chargement… » + consigne) visible sans JavaScript, masqué quand la boucle démarre, affiche l'erreur si `Game.start()` échoue
- Test du shell PWA étendu (présence de `#boot`, absence de monkeypatch)

## Task Commits
1. **Tasks 1-3: résolveur, overlay, verrou de test** - `2dc9246`

## Verification
- `npm test` : 31/31, garde-fou vert
- Playwright sur `file:///…/standalone/zuma-standalone.html` : JS activé → badge affiché, `#boot` masqué, console propre ; JS désactivé → « Chargement… » et consigne visibles

## Files Created/Modified
- `src/original.ts` - `assetUrl()` + utilisation pour pack.json, courbes, images
- `src/audio.ts` - manifest et .ogg via `assetUrl`
- `src/main.ts` - masquage de `#boot`, `reportBootError()`
- `index.html`, `public/style.css` - overlay d'amorçage
- `tools/build.mjs` - injection simple de `window.__ZUMA_ASSETS__`
- `tests/r213.test.mjs` - verrous

## Next Phase Readiness
Cause probable de l'écran noir côté utilisateur : ouverture dans un aperçu sans JavaScript. Le message le dit désormais explicitement. À confirmer en Phase 4 (UAT).
