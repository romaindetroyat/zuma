# External Integrations

**Analysis Date:** 2026-10-10

## APIs & External Services

Aucune API distante : le jeu est entièrement local (pas de télémétrie, pas de backend).

## Data Storage

**Databases:**
- Aucune

**Browser storage:**
- `localStorage` clé `zuma.best` - meilleur score (lecture/écriture protégées par try/catch)
- Cache Storage (service worker `public/sw.js`) - app shell versionné `zuma-<build>`

## Authentication & Identity

- Aucune

## Local asset pack (optionnel, hors Git)

- `private_assets/original/` - copie locale de l'installation Zuma Deluxe (fournie par l'utilisateur, jamais commitée)
- `private_assets/pack/` - produit par `tools/import-original.mjs` : `pack.json`, `levels/*.json` (courbes décodées), `levels/<id>/` (fonds, découpes), `sounds/<cle>.ogg` + `manifest.json`, `images/`
- Chargé à l'exécution par `src/original.ts` via `fetch('assets/pack.json')` ; absence = repli procédural silencieux

## Browser APIs

- Canvas 2D, `requestAnimationFrame`
- WebAudio (`AudioContext`, synthèse de repli ; `decodeAudioData` pour les `.ogg` originaux)
- Service Worker + Web App Manifest (`public/manifest.webmanifest`)
- Fullscreen API, événements souris/tactile/clavier

## CI/CD & Deployment

- GitHub Actions `.github/workflows/ci.yml` : `npm ci`, `npm run check`, `npm test`, contrôle d'hygiène des ressources
- Pas de déploiement automatique configuré

---

*Integration audit: 2026-10-10*
