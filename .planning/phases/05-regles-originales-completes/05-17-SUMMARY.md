---
phase: 05-regles-originales-completes
plan: 17
status: code-ready-deployment-pending-authorisation
subsystem: hosting (Cloudflare Pages advanced mode + D1)
tags: [private-hosting, cloudflare-pages, pages-advanced-mode, worker, d1, option-b, dry-run, simulated-api, idempotent-deploy]

requires:
  - plan: 05-16
    provides: tools/deploy.mjs (Access provisioning, verify, rollback plan, redact), tools/pagesupload.mjs, Pages project zuma + Access apps in production
  - doc: 05-CONTEXT.md
    provides: D-42, D-43
provides:
  - "tools/d1worker.mjs: blobFiles, chunks (60 000 base64 chars), workerManifest, workerContentType, generateWorker (Pages _worker.js over D1, binding ASSETS_DB)"
  - "tools/d1deploy.mjs: findDatabase, readBlobs, planD1, insertBatches, uploadBlobs, bindingBody, bindingOk, deployedOk, workerMarker, deployWorker"
  - "tools/cfsim.mjs: simulated Cloudflare account (Pages, Access, D1 SQL subset) for --dry-run"
  - "tools/deploy.mjs: D1 default method, --dry-run, --direct, extended --rollback-plan, D1 line in --verify, UUID redaction"
  - "tests r220-d1 (20), r220-deploy (29 → 32) — 342 tests total"
affects: [real deployment by the orchestrator (Task 4), UAT 9 (05-16 Task 6), README hosting section (to update after the real deployment)]

tech-stack:
  added: []
  patterns:
    - "Content-addressed file store in D1 (sha256 keys, base64 chunks, INSERT OR IGNORE): re-runs write only absent or incomplete files"
    - "Generated Pages worker with the manifest inlined; its sha256 marker in the deployment commit message makes redeployment idempotent"
    - "Dry run = the real pipeline against an in-memory account seeded in the state 05-16 left"

key-files:
  created: [tools/d1worker.mjs, tools/d1deploy.mjs, tools/cfsim.mjs, tests/r220-d1.test.mjs]
  modified: [tools/deploy.mjs, tools/pagesupload.mjs, tests/r220-deploy.test.mjs, .planning/ROADMAP.md]

decisions:
  - "D1 instead of Workers KV (coordinator, 2026-10-11): the account token has D1 Edit and Pages Edit, no KV permission"
  - "D1 binding named ASSETS_DB: ASSETS is the reserved Pages static-asset binding (env.ASSETS.fetch)"
  - "Completeness by (parts, chars) per key instead of SELECT DISTINCT key: an interrupted upload leaves a partial key that would otherwise never be completed"
  - "Row budget 50 000 estimated rows written per run (2 per chunk: table + primary-key index), half the free 100 000 per day; checked read-only before any write, Access included"
  - "Bodies capped at 900 000 bytes (< 900 KB in either unit); a 400 on the first batch falls back to one {sql, params} request per statement"
  - "--plan stays read-only: GET plus D1 SELECT statements (the D1 REST API reads through POST /query)"

metrics:
  duration: "~75 min (08:52 → 09:10 UTC, plus the KV → D1 redesign)"
  completed: 2026-10-11 (tasks 1–3; Task 4 = real deployment, pending authorisation)
  tasks: "3 of 4 (Task 4 checkpoint)"
  commits: 8 (+ this summary)
---

# Phase 5 Plan 17: Hébergement privé, option B (Pages `_worker.js` + D1) Summary

Le jeu complet peut maintenant être publié depuis la session avec le seul jeton du compte. L'artefact `--deploy` est rangé dans une base D1 `zuma-assets` : une table `blobs`, des morceaux base64 de 60 000 caractères au plus, une clé `sha256:` par contenu. Un `_worker.js` Pages généré (mode avancé, liaison `ASSETS_DB`) sert ces fichiers. Aucun appel n'a besoin du JWT d'envoi Pages, que le proxy empêchait d'arriver. Le code est testé hors réseau, et le dry run sur l'artefact réel passe. **Statut : code prêt ; déploiement réel en attente de l'autorisation de l'utilisateur (Task 4).**

## Tâches

| # | Tâche | Commits | Fichiers |
|---|-------|---------|----------|
| — | Plan + ROADMAP (KV, puis révision D1) | bcb0c05, 11c0aee | 05-17-PLAN.md, ROADMAP.md |
| 1 | Générateur du worker D1 (TDD) | 92494ba (RED), f5f9da7 (GREEN) | tools/d1worker.mjs, tools/pagesupload.mjs, tests/r220-d1.test.mjs |
| 2 | Client D1, liaison, déploiement (TDD) | 8d1890c (RED), 954c3c5 (GREEN) | tools/d1deploy.mjs, tools/pagesupload.mjs, tests/r220-d1.test.mjs |
| 3 | Intégration CLI + `--dry-run` (TDD) | 309275d (RED), 58ac42a (GREEN) | tools/deploy.mjs, tools/cfsim.mjs, tools/d1deploy.mjs, tests/r220-deploy.test.mjs |
| 4 | Déploiement réel par l'orchestrateur | **en attente d'autorisation** | — |

**Tests :** 342 + garde (319 + 20 `r220-d1` + 3 nouveaux dans `r220-deploy`), verts à chaque commit GREEN. `npm run check` propre. Aucune dépendance d'exécution ajoutée.

## Worker généré (vérifié dans node:vm avec une D1 simulée)

- **Méthodes et chemins :**
  - GET / HEAD seulement, sinon 405 avec `Allow` ;
  - recherche exacte dans une `Map` (`/` → `/index.html`) ;
  - `/cdn-cgi/…` (y compris encodé) → 404, même pour une navigation ;
  - navigation inconnue (`sec-fetch-mode: navigate` ou `Accept: text/html`) → `index.html` ;
  - toute autre ressource inconnue → 404 `no-store`.
- **Types et cache :**
  - types de Pages, avec `charset=utf-8` sur les types texte ;
  - `public, max-age=31536000, immutable` pour `/assets/` et les noms à empreinte ;
  - `no-cache` pour tout le reste (dont `index.html`, `sw.js`, `version.json`, `manifest.webmanifest`, `js/*.js`) ;
  - `x-content-type-options: nosniff`.
- **ETag et requêtes :**
  - ETag fort = empreinte sha256 ; `If-None-Match` (liste, `W/`, `*`) → 304 sans requête D1 ;
  - HEAD → `content-length` du manifeste, sans requête ;
  - une seule requête D1, avec paramètre lié : `SELECT data FROM blobs WHERE key = ? ORDER BY part`.
- **Corps et erreurs :**
  - corps décodé, puis taille comparée au manifeste : un fichier absent ou incomplet → 503 `retry-after: 60` ;
  - cache par isolat borné à 64 entrées / 16 Mio, 2 Mio par fichier ;
  - liaison absente → 500 ;
  - aucune journalisation (ni `console`, ni en-tête).
- **Bout en bout sur l'artefact réel** (script de travail, non commité) : les 291 fichiers sont servis octet pour octet à partir des 351 lignes D1 simulées.

## Dry run sur l'artefact réel

Commandes : `node tools/build.mjs --deploy`, puis `node tools/deploy.mjs --dry-run` (code 0, aucun appel réseau). Journaux : `scratchpad/d1/` (`build-deploy.log`, `dry-run.log`, `e2e.log`).

- **Artefact :** 291 fichiers, 5,7 Mio, empreinte du pack `db5c071e6a40`. Cela donne 289 contenus distincts et 351 morceaux, soit ≈ 702 lignes écrites estimées (budget : 50 000).
- **Insertions :** 10 requêtes `batch` de 7 à 90 instructions, chacune sous 900 000 octets.
- **Worker :** 49 861 octets.
- **Fichiers d'inspection :** `dist/_d1/_worker.js` et `dist/_d1/manifest.json` (291 chemins).
- **Écritures prévues (14, dans l'ordre), sur un compte déjà provisionné par 05-16 :**
  1. `POST /accounts/{compte}/d1/database {"name":"zuma-assets"}`
  2. `POST …/d1/database/{base}/query` `CREATE TABLE IF NOT EXISTS blobs (key TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (key, part))`
  3. à 12. `POST …/d1/database/{base}/query` : 10 lots `INSERT OR IGNORE INTO blobs (key, part, data) VALUES (?, ?, ?)`, soit 351 instructions
  13. `PATCH /accounts/{compte}/pages/projects/zuma` : `deployment_configs.production|preview = { d1_databases: { ASSETS_DB: { id } }, compatibility_date: "2025-09-01" }`
  14. `POST /accounts/{compte}/pages/projects/zuma/deployments` : multipart avec `manifest` `{}`, `branch` `main`, `commit_message` « R2.0.20 <build> worker:<hex> », `commit_dirty` et `_worker.js`
- **Second plan sur le compte simulé :** « actions prévues : 0 ».

## Deviations from Plan

### Auto-fixed Issues

**1. [Consigne du coordinateur] Workers KV remplacé par D1 en cours d'exécution**
- Le jeton n'a pas la permission KV ; il a D1 Edit et Pages Edit.
- Plan 05-17 révisé et commité (11c0aee) avant tout code : schéma imposé, limites D1 citées, tâches renommées, sortie du dry run déplacée de `dist/_kv/` à `dist/_d1/`.
- Le test RED KV, non commité, a été abandonné.

**2. [Rule 1 - Plateforme] Liaison nommée `ASSETS_DB`, jamais `ASSETS`**
- `ASSETS` est la liaison réservée de Pages (`env.ASSETS.fetch`, doc « advanced mode »).
- Elle est verrouillée par un test, et le simulateur refuse ce nom.

**3. [Rule 2 - Correction] État D1 lu par clé (nombre de morceaux, nombre de caractères) au lieu de `SELECT DISTINCT key`**
- Un envoi interrompu laisse une clé partielle : avec `DISTINCT`, elle ne serait jamais complétée.
- Une telle clé est replanifiée ; `INSERT OR IGNORE` n'écrit alors que les morceaux absents. Testé.

**4. [Rule 1 - Bug] Plafond des corps fixé à 900 000 octets**
- La première version (900 Kio) produisait des lots de 915 791 octets, au-dessus de « < 900 Ko ».
- Constaté au dry run réel et corrigé dans 58ac42a.

**5. [Rule 1 - Test] Fixture du test « no DELETE »**
- L'application Prisme y référençait une politique absente du compte simulé. L'exécution complète s'arrêtait donc à la relecture D-43 (déjà le cas en 05-16, sans effet sur l'ancienne assertion).
- La politique est maintenant fournie, pour que le test couvre réellement les étapes D1 (58ac42a).

**6. Ajouts nécessaires au plan**
- Budget de lignes vérifié en lecture seule **avant** toute écriture, Access compris.
- Repli « instruction par instruction » si l'API refuse `batch` (400 au premier lot).
- UUID de base masqués par `redact`.
- Permission « D1 : Edit » nommée sur un refus.
- `pollDeployment` factorisé dans `pagesupload.mjs`, sans changement de comportement.

### Non vérifiable depuis la session (sans écriture)

- Acceptation réelle par l'API :
  - du champ multipart `_worker.js` (documenté dans `cloudflare-typescript`, exclusif de `_worker.bundle`) ;
  - de `manifest` `{}` ;
  - du champ `batch` de `/query` (documenté ; repli prévu).
- Sur Pages : exécution du worker derrière Access et lecture de D1 en production.
- Permission D1 effective du jeton : un refus 403 arrête le script à la première écriture D1, en nommant « D1 : Edit ».

## Known Stubs

Aucun.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-serving-path | tools/d1worker.mjs | Le pack est désormais servi par un worker (mode avancé) au lieu des fichiers statiques Pages. Access reste devant (même hôte, mêmes applications) ; T-05-66 à T-05-71 dans le plan |
| threat_flag: config-change-existing | tools/deploy.mjs | `PATCH` du projet Pages `zuma` (liaison D1, date de compatibilité), relu après écriture ; seul PATCH du code, verrouillé par test |

## Point de contrôle (Task 4) — déploiement réel par l'orchestrateur

**Commande exacte** (dans `/home/user/zuma`, session cloud ; `tools/deploy.mjs` se relance seul avec `NODE_USE_ENV_PROXY=1` quand `HTTPS_PROXY` est défini ; `private_assets/deploy.json` est déjà présent) :

```bash
node tools/build.mjs --deploy
node tools/deploy.mjs --plan      # lecture seule (GET + SELECT) ; attendu : 5 actions D1, 0 action Access
node tools/deploy.mjs             # écritures ci-dessous, puis --verify intégré (code 2 attendu : pages.dev injoignable d'ici)
node tools/deploy.mjs --plan      # attendu : « actions prévues : 0 »
```

**Écritures, dans l'ordre**, si l'état du compte est celui de 05-16 (provisionnement Access à 0 action) :

1. `POST /accounts/{compte}/d1/database` `{ "name": "zuma-assets" }` ;
2. `POST /accounts/{compte}/d1/database/{base}/query` : `CREATE TABLE IF NOT EXISTS blobs (…)` ;
3. ≈ 10 × `POST …/query` `{ batch: [INSERT OR IGNORE …] }` (≈ 351 instructions, chaque corps < 900 000 octets). Si le premier lot est refusé en 400, envoi d'une instruction par requête (≈ 351 requêtes) ;
4. `PATCH /accounts/{compte}/pages/projects/zuma` : liaison `ASSETS_DB` en production et en aperçu, date de compatibilité `2025-09-01` ;
5. `POST /accounts/{compte}/pages/projects/zuma/deployments` : multipart avec `_worker.js` sur `main`.

**Reprise** : chaque étape est relue, et une nouvelle exécution reprend là où la précédente s'est arrêtée (base, table, morceaux, liaison, worker). Rien n'est jamais supprimé ; `--rollback-plan` imprime le retrait.

**Signal de reprise** : « autorisé » pour lancer le déploiement réel, ou consigne contraire.

## Self-Check: PASSED

- Fichiers : tools/d1worker.mjs, tools/d1deploy.mjs, tools/cfsim.mjs, tests/r220-d1.test.mjs, 05-17-PLAN.md — présents.
- Commits : bcb0c05, 11c0aee, 92494ba, f5f9da7, 8d1890c, 954c3c5, 309275d, 58ac42a — présents dans `git log`.
- `npm test` : 342 / 342 + garde ; aucun `dist/`, `standalone/`, `private_assets/` suivi ; aucun appel en écriture vers Cloudflare depuis ce plan.
