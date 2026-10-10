# Technology Stack

**Analysis Date:** 2026-10-10

## Languages

**Primary:**
- TypeScript 5.8 (strict, `noUnusedLocals`/`noUnusedParameters`) - tout le code applicatif dans `src/`

**Secondary:**
- JavaScript ESM (`.mjs`) - outils de build (`tools/`) et tests (`tests/`)
- Python 3 - `tools/extract_installer.py` (extraction du CAB de l'installeur original)

## Runtime

**Environment:**
- Navigateur moderne (Canvas 2D, ES modules, WebAudio, Service Worker) - cible PWA 640×480 mise à l'échelle
- Node.js ≥ 22 - build, tests, serveur local

**Package Manager:**
- npm 10.x - lockfile `package-lock.json` présent

## Frameworks

**Core:**
- Aucun framework UI : canvas natif + DOM minimal pour les panneaux (menu, STATS)

**Testing:**
- `node:test` + `node:assert/strict` - tests de non-régression sur le code compilé dans `.compiled/`
- Playwright (hors dépôt, installation globale) - captures d'écran manuelles de validation

**Build/Dev:**
- `tsc` (TypeScript compiler) - émission ES2022 vers `.compiled/`
- `tools/build.mjs` - assemblage de `dist/` (copie modules + shell), `--local` (pack privé), `--standalone` (fichier unique avec data URLs)
- `tools/serve.mjs` - serveur statique sans dépendance

## Key Dependencies

**Critical:**
- `typescript` 5.8.3 (devDependency) - seule dépendance npm

**Infrastructure:**
- Aucune dépendance runtime

## Configuration

**Environment:**
- Aucune variable d'environnement requise ; `PORT` optionnel pour `tools/serve.mjs`

**Build:**
- `tsconfig.json` (ES2022, moduleResolution Bundler, rootDir `src`, outDir `.compiled`)
- `package.json` scripts : `build`, `test`, `dev`, `check`, `standalone`, `guard`, `import`

## Platform Requirements

**Development:**
- Node 22+, npm ; Python 3 + `libarchive-c` (ou `cabextract`/`7z`) uniquement pour extraire l'installeur original

**Production:**
- Hébergement statique (dist/) servi en HTTPS pour le service worker ; ou fichier standalone ouvert localement

---

*Stack analysis: 2026-10-10*
