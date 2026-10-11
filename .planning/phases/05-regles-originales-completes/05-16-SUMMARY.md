---
phase: 05-regles-originales-completes
plan: 16
status: awaiting-human-check
subsystem: hosting (Cloudflare Pages + Access) + service worker
tags: [private-hosting, cloudflare-pages, cloudflare-access, one-time-pin, d-43-allowed-idps, blake3, direct-upload, deploy-cli, sw-redirected-response, manifest-use-credentials, proxy-authorization-blocker]

# Dependency graph
requires:
  - plan: 05-14
    provides: --deploy artefact (dist/version.json, zuma-assets-<hash>), generated service worker, swgen, r220-pwa harness
  - plan: 05-15
    provides: R2.0.20 release notes, README « Ouvrir et installer Zuma », UAT 9 opened
  - doc: 05-CONTEXT.md
    provides: D-42 (private hosting behind Access, deployed from the session), D-43 (One-time PIN, existing apps pinned to the cloudflare IdP)
  - doc: 05-RESEARCH-05.md
    provides: R1–R9, M-1–M-5, Access body shapes (A3), addendum (account state read-only)
provides:
  - "tools/blake3.mjs: pure-JS BLAKE3 hash mode (blake3Hex), 35/35 official vectors, 291/291 keys identical to blake3-wasm on the artefact"
  - "tools/pagesupload.mjs: checkArtifact, listFiles, contentType, assetKey, buckets, pagesManifest, uploadAndDeploy (REST direct upload, main only, JWT scrubbed)"
  - "tools/deploy.mjs: planProvision, isAccessRedirect, redact, run, makeApi; modes default / --plan / --verify (0/1/2) / --rollback-plan; npm run deploy:private"
  - "public/sw.js: clean() for redirected cached navigations; index.html manifest link crossorigin=use-credentials"
  - "Cloudflare (production): Pages project zuma (main, zuma-49c.pages.dev, no deployment yet), Access apps « Zuma » + « Zuma — fichiers publics », policies « Zuma — joueurs » + « Zuma — fichiers publics », One-time PIN IdP, Prisme / ssh / label pinned to the cloudflare IdP (D-43)"
  - "tests r220-deploy (29), r220-hosting (6) — 319 tests total"
affects: [UAT 9 (user, per device), first content upload from the Mac, score sync plan (Pages Function + D1) after the iOS verdict]

tech-stack:
  added: []
  patterns:
    - "Cloud provisioning as a pure planner (planProvision over GET responses) + one-action-at-a-time executor that re-reads after every write and stops on any unconfirmed effect"
    - "Simulated Cloudflare account (in-memory Pages + Access + upload API) recording every call: write order, idempotence and no-DELETE locks"
    - "All CLI output through redact() (JWT, Authorization values, 32+ hex ids); account name never logged"

key-files:
  created: [tools/blake3.mjs, tools/pagesupload.mjs, tools/deploy.mjs, tests/r220-deploy.test.mjs, tests/r220-hosting.test.mjs]
  modified: [package.json, public/sw.js, index.html, README.md, R220_RELEASE_NOTES.md, .planning/codebase/CONCERNS.md, .planning/phases/05-regles-originales-completes/05-UAT.md]

decisions:
  - "Dedicated reusable policy « Zuma — joueurs » (only the user's address) instead of reusing « Romain uniquement »: the latter is shared by Prisme / ssh / label (app_count 3), so an address added for the game (D-43) would have opened those apps"
  - "D-43 implemented generically and safely: while the One-time PIN IdP is absent, every existing non-Zuma app with allowed_idps [] must be listed in private_assets/deploy.json « pinIdpApps » (else conflict, nothing written); listed apps get allowed_idps = current IdP ids by PUT of the GET body (read-only fields stripped, policies as {id, precedence}); read-back must match except allowed_idps / updated_at; an app already pinned to exactly the current IdPs counts as done (resumable)"
  - "Session proxy overwrites Authorization on api.cloudflare.com (proved read-only: a bogus header still verifies « active »), so the Pages upload JWT never arrives (403 8000013): content upload moves to the Mac with CLOUDFLARE_API_TOKEN, provisioning stays done"
  - "--verify classifies any non-Access answer on a protected URL as code 1 (conservative), unreachable as 2; Node's URL parser normalises %2e%2e, so that traversal probe effectively requests /assets/pack.json (still must redirect)"

metrics:
  duration: "~25 min (08:10 → 08:36 UTC, plus summary)"
  completed: 2026-10-11 (tasks 1–5; Task 6 = human check pending)
  tasks: "5 of 6 (Task 6 checkpoint)"
  commits: 8
---

# Phase 5 Plan 16: Hébergement privé Cloudflare (squelette) Summary

L'outil de déploiement privé (BLAKE3 en JS pur, téléversement direct Pages par l'API REST, provisionnement Access idempotent) et les parades du service worker sont faits et testés hors réseau. Le compte Cloudflare est provisionné : projet Pages `zuma` (`zuma-49c.pages.dev`), Access avec code à usage unique et Bypass `/public`, Prisme / ssh / label épinglés au fournisseur Cloudflare (D-43). En revanche, **l'envoi du contenu est bloqué depuis la session**, parce que le proxy remplace l'autorisation d'envoi. Le premier déploiement du jeu se fait donc depuis le Mac. **Statut : en attente de la vérification humaine (Task 6).**

## Tâches

| # | Tâche | Commits | Fichiers |
|---|-------|---------|----------|
| 1 | BLAKE3 + bibliothèque de téléversement direct (TDD) | 791e2dc (RED), e7e7a98 (GREEN) | tools/blake3.mjs, tools/pagesupload.mjs, tests/r220-deploy.test.mjs |
| 2 | `tools/deploy.mjs` : provisionnement, déploiement, vérification, plan de retrait (TDD) | 510bcab (RED), 16e26bd (GREEN), 081c480 (fix) | tools/deploy.mjs, tests/r220-deploy.test.mjs, package.json |
| 3 | Parades Access côté app (TDD) | 7dc9a1d (RED), 97f7840 (GREEN) | public/sw.js, index.html, tests/r220-hosting.test.mjs |
| 4 | Premier déploiement privé depuis la session | aucun commit (état Cloudflare + journaux dans le dossier de travail) | — |
| 5 | Documentation | 21ff282 | README.md, R220_RELEASE_NOTES.md, CONCERNS.md, 05-UAT.md |
| 6 | Vérification humaine (Mac, PC, iPhone, iPad) | **en attente** | 05-UAT.md (verdict à consigner) |

**Tests :** 319 + garde (284 + 29 `r220-deploy` + 6 `r220-hosting`), `npm run check` propre, standalone sans `<link rel="manifest"`, `r215-presentation` vert.

## Task 4 — résultat du premier déploiement (2026-10-11, depuis la session)

Journaux (nettoyés) : `scratchpad/hosting/` (`plan-1b.log`, `deploy.log`, `verify.log`, `plan-2.log`, `rollback-plan.log`, `diag-auth.log`, `diff-apps.log`, `proxy-relay.log`, `blake3-witness.log`, `build-deploy.log`).

- **Artefact** : `node tools/build.mjs --deploy`, 291 fichiers, 5,7 Mio (5 969 712 octets), empreinte du pack `db5c071e6a40`, 269 actifs.
- **Témoin BLAKE3** : `blake3-wasm` du cache npx (hors dépôt), **291 clés identiques sur 291** fichiers de l'artefact (21 sur 21 sur le build public). Les 35 vecteurs officiels concordent.
- **`--plan` (1)** : 9 actions dans l'ordre, aucun conflit. Les trois applications existantes avaient bien `allowed_idps` = `[]` : toute autre valeur aurait produit un conflit et arrêté le script.
  1. `create-project`
  2. `pin-idp Prisme`, `pin-idp ssh`, `pin-idp label`
  3. `add-otp`
  4. `create-allow-policy`
  5. `create-allow-app`
  6. `create-bypass-policy`
  7. `create-bypass-app`
- **Exécution (`deploy.log`, code 1)** :
  - « créé » pour le projet Pages (sous-domaine attribué : `zuma-49c.pages.dev`, le nom `zuma.pages.dev` étant pris) ;
  - D-43 sur Prisme, ssh et label ;
  - « créé » pour One-time PIN, la politique « Zuma — joueurs », l'application « Zuma », la politique et l'application « Zuma — fichiers publics » ;
  - « Access relu » sur les deux hôtes et `/public` ;
  - puis **arrêt** sur `/pages/assets/check-missing : 403 — le proxy a remplacé l'autorisation d'envoi ?`.
- **Diagnostic du blocage (lecture seule)** : `GET /user/tokens/verify` avec un en-tête `Authorization: Bearer` factice répond quand même `200 active`. Le proxy de la session **remplace donc l'en-tête `Authorization`** de toute requête vers `api.cloudflare.com`. `check-missing` avec le JWT d'envoi et une liste vide répond `403 {code 8000013, "Authorization failed"}`. Aucune autre écriture n'a été tentée. **Aucun fichier n'a été envoyé** et le projet n'a aucun déploiement : rien n'est servi.
- **`--verify` = 2** :
  - configuration conforme par l'API : « Zuma » sur `zuma-49c.pages.dev` et `*.zuma-49c.pages.dev`, politique « Zuma — joueurs » (1 adresse), One-time PIN seul, session 730h ; « Zuma — fichiers publics » sur `zuma-49c.pages.dev/public` uniquement ;
  - les 7 requêtes HTTP sont injoignables (le proxy refuse le CONNECT vers `zuma-49c.pages.dev:443`, consigné dans `recentRelayFailures`) ;
  - aucun déploiement à relire, donc l'URL propre au déploiement n'est pas vérifiée.
- **`--plan` (2)** : « actions prévues : 0 » (idempotence prouvée).
- **`--rollback-plan`** : étapes 1 à 5 imprimées, projet Pages d'abord, rien d'exécuté.
- **Contrôle D-43 indépendant** (`diff-apps.log`, lecture seule) : Prisme, ssh et label ont maintenant `allowed_idps` = [fournisseur `cloudflare` …29e4] (avant : `[]`), et tout le reste est identique à l'instantané pris avant l'exécution (sessions 730h / 24h / 24h, politique « Romain uniquement »).
- **Secrets** : aucun `eyJ…` dans les journaux. Les adresses e-mail ont été masquées dans les journaux du dossier de travail. `private_assets/deploy.json` est ignoré (`git check-ignore`). `git status` propre ; garde verte.

**URL de production** (protégée, publiable) : `https://zuma-49c.pages.dev` — **vide tant que le contenu n'a pas été envoyé depuis le Mac**. URL du déploiement : aucune pour l'instant ; elle aura la forme `https://<id>.zuma-49c.pages.dev`.

### Objets Cloudflare créés ou modifiés (noms seulement)

- Créés :
  - projet Pages `zuma` (branche de production `main`) ;
  - fournisseur d'identité « One-time PIN » ;
  - politiques réutilisables « Zuma — joueurs » (allow, une règle e-mail : l'adresse de l'utilisateur, session 730h) et « Zuma — fichiers publics » (bypass, everyone) ;
  - applications Access « Zuma » (self-hosted, deux destinations, 730h, OTP seul, redirection automatique, hors lanceur) et « Zuma — fichiers publics » (`/public`).
- Modifiés (D-43) : applications « Prisme », « ssh » et « label », `allowed_idps` `[]` → [fournisseur `cloudflare`]. Rien d'autre n'a changé. Retour : remettre `[]`, seulement après avoir retiré One-time PIN.
- Rien n'a été supprimé ni modifié d'autre. La politique « Romain uniquement » est intacte et n'est pas utilisée par le jeu.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Sécurité] Politique dédiée « Zuma — joueurs » au lieu de la politique partagée « Romain uniquement »**
- **Trouvé pendant :** Task 2 (sonde en lecture seule des formes de l'API).
- **Problème :** « Romain uniquement » existe déjà comme politique réutilisable partagée par Prisme, ssh et label (`app_count` 3). Le plan la réutilisait. Or, selon D-43, l'utilisateur ajoutera lui-même des adresses à la politique du jeu dans la console : chacune aurait aussi ouvert les trois autres applications.
- **Correctif :** nouvelle politique « Zuma — joueurs », avec la seule adresse de l'utilisateur. Le README indique où ajouter une adresse, et précise que cela ne touche pas les autres applications. Le plan de retrait vise « Zuma — joueurs » / « Zuma — fichiers publics ».
- **Fichiers :** tools/deploy.mjs, tests/r220-deploy.test.mjs, README.md, CONCERNS.md. **Commit :** 16e26bd.

**2. [Décision D-43, consigne de l'orchestrateur] Étape `pin-idp` avant `add-otp` (seul PUT sur un objet existant)**
- Le verrou du plan « aucun PUT / PATCH sur une ressource existante » est remplacé par « PUT seulement sur les applications listées dans `pinIdpApps`, seul `allowed_idps` change, relu et comparé ». Il est testé (« no mode ever sends DELETE / PATCH; PUT only on listed existing Access apps »).
- Conflit, et rien n'est écrit, si :
  - une application existante a `allowed_idps` vide sans être listée ;
  - une application listée est introuvable ;
  - une application listée a une autre valeur non vide.
- **Commit :** 16e26bd.

**3. [Rule 1 - Bug] `--plan` exécutait le déploiement complet** (mode `'--plan'` comparé à `'plan'`). Le verrou « GET only » de `r220-deploy` l'a détecté avant tout appel réel ; corrigé dans le commit GREEN de Task 2 (16e26bd).

**4. [Rule 2 - Confidentialité] Le nom du compte Cloudflare (qui contient l'adresse e-mail) était journalisé**
- **Trouvé pendant :** Task 4, `--plan` (1).
- **Correctif :** seul l'identifiant masqué est imprimé. Le test « whole output » vérifie aussi l'absence d'adresse ; il échoue sur l'ancien code. Le premier journal a été nettoyé.
- **Commit :** 081c480.

**5. [Plan, risque prévu] Envoi du contenu impossible depuis la session**
- Le proxy remplace `Authorization` (voir Task 4). Arrêt au point d'échec, comme demandé. Repli « depuis le Mac » documenté (README, CONCERNS, notes, UAT).
- Le must-have « Le jeu complet est servi en production » n'est **pas encore atteint**. Il le sera au premier `npm run deploy:private` lancé depuis le Mac.

**6. Corrections de rédaction imposées par D-43**
- CONCERNS ne dit pas « durcissement possible, non appliqué » (texte du plan antérieur à D-43) : il décrit l'épinglage réellement appliqué et ses limites (une future application avec `allowed_idps` vide accepterait le code).
- La question de Task 6 sur le durcissement devient une vérification : « Prisme / ssh / label : connexion inchangée ».

### Non vérifiable depuis la session

- Protection HTTP (`*.pages.dev` et le domaine de l'équipe sont injoignables) : étape 0 de l'utilisateur, en navigation privée.
- A7 (priorité du chemin `/public` sur l'hôte), acceptation des clés BLAKE3 par Pages, URL propre au déploiement : au premier envoi depuis le Mac, puis à l'étape 0.
- R2 (connexion dans l'app iOS installée) et l'installation réelle sur les quatre appareils : Task 6.

## Known Stubs

Aucun.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: config-change-existing | tools/deploy.mjs | Étape D-43 : `PUT /access/apps/{id}` sur des applications existantes (seul `allowed_idps`). T-05-57 passe de « accept » à « mitigate » par décision de l'utilisateur ; verrouillé par les tests et relu après écriture |

## Point de contrôle (Task 6) — à présenter à l'utilisateur

**Ce qui est en place.** Votre compte Cloudflare est prêt pour héberger le jeu en privé :

- projet Pages `zuma`, à l'adresse `https://zuma-49c.pages.dev` ;
- protégé par Cloudflare Access : seule votre adresse e-mail est autorisée, avec connexion par code reçu par e-mail et une session d'un mois par appareil ;
- seul `/public` (manifeste, icônes) reste lisible sans connexion ;
- Prisme, ssh et label gardent leur connexion actuelle par votre compte Cloudflare : ils ne proposent pas le code par e-mail.

**Le jeu n'est pas encore en ligne** : depuis la session cloud, le proxy empêche l'envoi des fichiers. `--verify` a répondu **2**, c'est-à-dire configuration conforme mais adresse injoignable d'ici. La preuve que le site n'est pas public vous revient (étape 0).

**Étape A — envoyer le jeu depuis le Mac (une fois)** :

1. Dans le dépôt à jour (branche de ce travail), avec votre copie du jeu : `npm run import`, si le pack n'est pas déjà sur le Mac.
2. Créez `private_assets/deploy.json` :

   ```json
   { "project": "zuma", "allow": ["<votre adresse>"], "pinIdpApps": ["Prisme", "ssh", "label"] }
   ```

3. Créez un jeton : tableau de bord Cloudflare › Mon profil › Jetons d'API › Créer un jeton personnalisé. Permissions du compte : *Cloudflare Pages : Edit*, *Access: Apps and Policies : Edit*, *Access: Organizations, Identity Providers, and Groups : Edit*, *Account Settings : Read*.
4. Lancez :

   ```bash
   npm run deploy
   read -s CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
   npm run deploy:private
   ```

   Le provisionnement est déjà fait : le script le relit (« déjà présent ») puis envoie les 291 fichiers sur la production. Il affiche l'adresse du déploiement et un code de vérification : 0 = protégé, **1 = exposé, à me signaler immédiatement**, 2 = vérification à faire à la main.

**Étape 0 — le site n'est pas public** : sur le Mac, dans une fenêtre de navigation privée :

- ouvrez `https://zuma-49c.pages.dev` : une page Cloudflare Access « falling-sun-db70 » doit demander une adresse e-mail, sans afficher le jeu ;
- même chose pour l'adresse du déploiement (`https://<id>.zuma-49c.pages.dev`) ;
- ouvrez `https://zuma-49c.pages.dev/public/manifest.webmanifest` : le petit fichier JSON s'affiche (public voulu, aucun contenu du jeu original) ;
- fermez la fenêtre privée.

**Mac — Chrome** :

1. Ouvrez l'adresse, saisissez votre adresse e-mail, puis « Envoyer le code ». Recopiez le code reçu dans Gmail.
2. Le jeu démarre ; MENU › Aide indique « ressources originales ».
3. Cliquez « Installer Zuma » (ou l'icône d'installation à droite de la barre d'adresse) : l'app s'ouvre dans sa fenêtre.
4. Jouez une minute, jusqu'à ce que l'Aide affiche « hors ligne : … Mo ».
5. Quittez l'app, coupez le Wi-Fi, puis relancez-la : le jeu démarre et se joue avec les sons. Rétablissez le Wi-Fi.

**Mac — Safari** : ouvrez l'adresse, connectez-vous avec le code, puis « Fichier › Ajouter au Dock ». Ouvrez Zuma depuis le Dock : le code peut être redemandé une fois, car l'app a ses propres données. Faites ensuite le même test hors ligne.

**PC — Chrome ou Edge** : mêmes étapes que Chrome sur Mac (Edge : menu « … › Applications › Installer Zuma »).

**iPhone — Safari** :

1. Ouvrez l'adresse dans Safari, saisissez l'adresse e-mail, puis « Envoyer le code ». Lisez le code sur le Mac, ou dans la notification Gmail sans quitter Safari, et saisissez-le.
2. Le jeu s'affiche : bouton Partager › « Sur l'écran d'accueil » › « Ajouter ».
3. Ouvrez Zuma depuis l'écran d'accueil. Si le code est redemandé, saisissez-le une fois, de préférence en le lisant sur un autre appareil.
4. Tournez en paysage, jouez un niveau, et attendez « hors ligne : … Mo » dans MENU › Aide.
5. Fermez l'app (balayez vers le haut), activez le mode Avion, puis rouvrez Zuma : le jeu démarre, se joue, et les sons fonctionnent après le premier toucher.
6. Désactivez le mode Avion et rouvrez l'app : le code ne doit pas être redemandé.

**iPad — Safari** : mêmes étapes que l'iPhone. Vérifiez aussi le portrait : des bandes, et pas de message « Tournez votre appareil ».

**À signaler pour chaque appareil** :

- connexion : OK, ou boucle (la page du code revient sans fin, ou s'ouvre dans Safari pendant que l'app reste blanche) ;
- installation : OK ou impossible ;
- hors ligne : OK ou écran blanc ;
- sons ;
- nombre de fois où le code a été redemandé ;
- toute autre remarque.

Vérifiez aussi que Prisme, ssh et label se connectent toujours comme avant (compte Cloudflare, sans code par e-mail).

**Retrait** (seulement si vous le demandez, jamais automatique) : `node tools/deploy.mjs --rollback-plan` affiche l'ordre :

1. supprimer d'abord le projet Pages ;
2. puis les applications Access « Zuma » et « Zuma — fichiers publics » ;
3. puis leurs politiques, si plus aucune application ne les utilise ;
4. la méthode « One-time PIN » peut rester.

**Reprise** : tapez « approuvé » si les quatre appareils se connectent, s'installent et jouent hors ligne ; sinon décrivez le problème par appareil. Une boucle de connexion sur iPhone / iPad orienterait vers la variante « Access par chemins » (M-A), avant la synchronisation des scores.

## Self-Check: PASSED

- Fichiers : tools/blake3.mjs, tools/pagesupload.mjs, tools/deploy.mjs, tests/r220-deploy.test.mjs, tests/r220-hosting.test.mjs — présents.
- Commits : 791e2dc, e7e7a98, 510bcab, 16e26bd, 7dc9a1d, 97f7840, 081c480, 21ff282 — présents dans `git log`.
- `npm test` : 319 / 319 + garde ; aucun `dist/`, `standalone/`, `private_assets/` suivi.
