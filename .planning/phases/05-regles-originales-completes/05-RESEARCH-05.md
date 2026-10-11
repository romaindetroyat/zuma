# Phase 5 : Spike 05 — hébergement privé Cloudflare (Pages + Access) et meilleurs scores par identité (D-39 révisée) ; import de l'installeur (D-40, suspendu)

**Recherché :** 2026-10-11
**Domaine :** Cloudflare Pages en téléversement direct, Cloudflare Access (Zero Trust, PIN à usage unique), Pages Functions + D1, PWA installée (iOS / iPadOS / macOS / Chrome) derrière Access
**Confiance :** MOYENNE. Documentation officielle lue ce jour et deux prototypes exécutés localement. Le compte Cloudflare n'a pas été inspecté, et le comportement d'Access dans une PWA installée sur iOS n'est pas vérifié (risque principal).

<user_constraints>
## Contraintes utilisateur

### Décisions verrouillées (05-CONTEXT.md) et révision du 2026-10-11
- **D-39 :** Meilleurs scores synchronisés sur tous les appareils (choix de l'utilisateur : Cloudflare) : un Worker Cloudflare sans dépendance (`worker/`) + base D1 sur le compte connecté ; chaque appareil s'associe par un code de synchronisation (et QR), sans e-mail ; stockage local d'abord (hors ligne), fusion « le meilleur gagne » par niveau (meilleur score, meilleur temps) ; déploiement du Worker par GitHub Actions (wrangler) avec un jeton d'API Cloudflare fourni par l'utilisateur en secret du dépôt.
- **Révision transmise par le coordinateur (2026-10-11), qui remplace D-39 pour l'hébergement et l'identité :** toute la PWA (code + pack original privé de l'utilisateur, c'est-à-dire le build `--local`) est hébergée **en privé** sur le compte Cloudflare de l'utilisateur, **derrière Cloudflare Access** (liste blanche de quelques adresses e-mail, connexion par PIN à usage unique). Elle est déployée **depuis cette session cloud avec wrangler** et un jeton d'API fourni par l'utilisateur, **jamais par le dépôt GitHub public ni sa CI**. **Pas de bouton de partage** (D-41 retiré). Les scores sont rattachés à l'identité Access, plus à un code de synchronisation.
- **D-40 :** import de l'installeur dans le navigateur. **→ SUSPENDU (décision utilisateur en attente).**
- **D-37 / D-38 (rappel) :** PWA installable, hors ligne, stockage isolé de l'app installée sur iOS, `navigator.storage.persist()`, vérification réelle sur iPhone et iPad en UAT.

### Contraintes du projet (CLAUDE.md)
- Aucune ressource originale **commitée ni publiée** (`npm run guard` + CI) ; le pack vit dans `private_assets/`.
- TypeScript strict, **zéro dépendance d'exécution**, Node 22 pour l'outillage ; seule dépendance npm : `typescript`.
- Chargements tolérants (renvoyer `null`, prévoir un repli) ; `try/catch` autour de `localStorage` et `fetch`.
- Toute règle modifiée est verrouillée par un test `node:test` dans `tests/`.
- Pas de modification du dépôt hors d'une commande GSD.

### Hors périmètre
- Bouton « Partager le jeu », classement, code de synchronisation et QR (remplacés par l'identité Access), import de l'installeur (suspendu).
</user_constraints>

<phase_requirements>
## Exigences couvertes

| ID | Description | Appui de la recherche |
|----|-------------|-----------------------|
| U40 / D-37 (révisée) | PWA complète hébergée, hors ligne | §B1 (Pages en téléversement direct), §B3 (hors ligne derrière Access) |
| U41 / D-38 | Installation simple sur iPhone / iPad | §B3 : **risque principal**, à valider sur un vrai appareil avant tout le reste |
| U42 / D-39 (révisée) | Meilleurs scores sur tous les appareils | §B2 : Pages Function `/api/scores`, identité Access, D1, fusion « le meilleur gagne » (prototype testé) |
| U43 / D-40 | Ressources pour les amis | Couvert par l'hébergement privé derrière Access (§B1, avec la réserve légale de Q1) ; D-40 suspendu |
</phase_requirements>

## Résumé

**Bloquant immédiat : la session cloud ne peut pas joindre Cloudflare.** `npx wrangler --version` répond `4.149.0`, car `registry.npmjs.org` est hors proxy. En revanche, le proxy de sortie de la session refuse par politique (403 sur le CONNECT, consigné dans `recentRelayFailures` le 2026-10-11 vers 07:18Z) les hôtes `api.cloudflare.com`, `dash.cloudflare.com`, `cloudflareaccess.com`, `pages.dev` et `developers.cloudflare.com`. **Aucun `wrangler pages deploy`, `wrangler d1 …` ni appel à l'API Access ne peut donc partir d'ici** tant que l'utilisateur n'a pas ajouté au moins `api.cloudflare.com` à la liste d'accès réseau de l'environnement. Je ne l'ai pas contourné. La documentation Cloudflare a été lue sur `raw.githubusercontent.com/cloudflare/cloudflare-docs`, qui est autorisé. Les outils MCP Cloudflare n'étaient pas exposés à ce sous-agent : **le compte n'a pas été inventorié**.

**Faisabilité technique : bonne, sauf iOS.** Le build `--local` compte ≈ 285 fichiers pour ≈ 5,9 Mo, le plus gros fichier étant `zuma.mo3` (305 Ko). Le plan gratuit de Pages accepte 20 000 fichiers et 25 Mio par fichier. Les scores passent par une **Pages Function sur la même origine** (`/api/scores`) : donc pas de CORS, pas d'échec de requête préalable (preflight) derrière Access, ni de code de synchronisation. Elle **valide le JWT `Cf-Access-Jwt-Assertion`** (RS256, clés JWKS de l'équipe, `iss`, `aud`, `exp`) en ≈ 40 lignes de WebCrypto sans dépendance, et stocke `SHA-256(e-mail)` dans D1 : aucune adresse en clair. Prototype : **2 tests sur 2 réussis** (identité valide, fusion, rejet d'un JWT absent, d'un mauvais `aud`, d'un mauvais `iss`, d'un JWT expiré ou falsifié).

**Risque principal : une PWA installée sur iOS derrière Access.** La page de connexion est servie par `<équipe>.cloudflareaccess.com`, hors du `scope` de l'app. Sur iOS, l'app de l'écran d'accueil a un stockage et des cookies séparés de Safari (D-38). Je n'ai trouvé aucune source qui confirme que le cookie `CF_Authorization` posé au retour de la connexion arrive bien dans l'app installée. Des signalements de la communauté décrivent des boucles de connexion ou des écrans bloqués dans des vues web et des PWA iOS après expiration, mais **aucun ne porte exactement sur Access + PWA iOS** (confiance BASSE). Par ailleurs, le manifeste est chargé **sans cookies** : derrière Access, il est redirigé vers la connexion, ce qui empêche l'installation (correctif connu : `crossorigin="use-credentials"` ou une politique Bypass sur `/public`).

**Recommandation principale :** commencer par un **squelette de déploiement** (build `--local` actuel + Access + OTP + session d'un mois), et tester l'installation et le hors ligne sur l'iPhone et l'iPad réels **avant** d'écrire la synchronisation. Si iOS échoue, passer à la variante « Access par chemins » (M-A, §B3) : coquille publique (le code l'est déjà sur GitHub), Access seulement sur `/assets/*` et `/api/*`.

## Carte des responsabilités

| Capacité | Niveau principal | Niveau secondaire | Raison |
|----------|------------------|-------------------|--------|
| Contrôle d'accès (liste blanche e-mail, OTP) | Cloudflare Access (périphérie) | — | Avant toute requête ; rien à coder |
| Coquille + pack privé | CDN (Pages, statique) | Service worker (Cache Storage) | Statique ; hors ligne par le SW |
| Identité de l'utilisateur | Pages Function (validation du JWT) | — | Le JWT signé est la seule preuve fiable |
| Meilleurs scores (vérité de l'appareil) | Navigateur (`localStorage`) | — | Hors ligne d'abord |
| Fusion « le meilleur gagne » | Fonction pure partagée (`src/scoresync.ts`) | Pages Function | Une seule règle, un seul test |
| Persistance des scores | D1 | — | Une ligne par utilisateur |
| Déploiement | Session cloud (wrangler) **si le réseau l'autorise** | Mac de l'utilisateur (`wrangler login`) | Jamais par GitHub (le pack ne doit pas y transiter) |

## B1. Pages en téléversement direct depuis ce conteneur

### Constat réseau (vérifié)
| Hôte | Résultat | Requis pour |
|------|----------|-------------|
| `registry.npmjs.org` | ✓ (hors proxy) | `npx wrangler` (4.149.0 obtenu) |
| `api.cloudflare.com` | ✗ 403 politique | **tout** : `pages deploy`, `d1`, API Access |
| `dash.cloudflare.com`, `cloudflareaccess.com`, `pages.dev` | ✗ 403 politique | Vérifications après déploiement (facultatif) |
| `developers.cloudflare.com` | ✗ 403 | Documentation (contourné par le dépôt GitHub de la doc) |

**Options :**
1. **(recommandée)** L'utilisateur ajoute `api.cloudflare.com` (et, pour les contrôles, `*.pages.dev` et `<équipe>.cloudflareaccess.com`) à la liste d'accès réseau de l'environnement cloud, puis fournit le jeton comme **secret d'environnement** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), pas en clair dans la conversation. [ASSUMED : l'environnement permet ces réglages]
2. **Repli :** déploiement depuis le Mac de l'utilisateur. Les commandes sont les mêmes : `npx wrangler login` (navigateur), puis `npm run deploy:private`. Il faut que le pack existe sur le Mac (`npm run import` sur l'installeur, ou le `.zpk` de 05-14 déballé).
3. Le MCP Cloudflare ne convient pas. Le serveur « Workers Bindings » n'a aucun outil Pages [CITED: README de mcp-server-cloudflare]. Le serveur API complet devrait enchaîner l'envoi multi-étapes des fichiers (jeton d'envoi, empreintes, envoi en base64) pour 5,9 Mo de ressources privées via des appels d'outils [ASSUMED : irréaliste et peu sûr].

### Commandes (non interactives)
```sh
npx wrangler@4 pages project create zuma --production-branch main     # une seule fois
node tools/build.mjs --local                                         # dist/ + assets/ privés
npx wrangler@4 pages deploy dist --project-name zuma --branch main --commit-dirty=true
```
- **Toujours `--branch main`.** Dans un dépôt Git, wrangler prend la branche courante (ici `claude/…`) et crée un **déploiement d'aperçu** `<hash>.zuma.pages.dev`. Sans réglage, ces URL d'aperçu sont **publiques**, et chaque URL `<hash>` reste accessible pour toujours. [CITED: pages/get-started/direct-upload, pages/configuration/preview-deployments]
- Un projet en téléversement direct ne peut plus passer à l'intégration Git, ce qui convient ici. [CITED: direct-upload]
- Les Functions et les liaisons passent par un fichier `wrangler.jsonc` à la racine, avec `pages_build_output_dir: "./dist"` et `d1_databases` (« source of truth »). Le dossier `functions/` est lu depuis le répertoire courant. [CITED: pages/functions/wrangler-configuration ; ASSUMED : emplacement exact de `functions/`]
- **Ne jamais pousser `dist/` vers Git.** Il est déjà ignoré ; la garde (`tools/guard.mjs`) doit refuser tout `assets/` suivi. `.wrangler/` doit être ajouté à `.gitignore`.
- Le nom `zuma.pages.dev` peut être pris : wrangler ajoute alors un suffixe aléatoire. [CITED: direct-upload]

### Limites gratuites (vs notre build)
| Limite | Valeur | Notre `--local` | Source |
|--------|--------|-----------------|--------|
| Fichiers par site | 20 000 | ≈ 285 (16 coquille + 269 pack) | [CITED: pages/platform/limits] |
| Taille d'un fichier | 25 Mio | max 305 Ko (`zuma.mo3`) | [CITED] |
| Projets Pages | 100 | 1 | [CITED] |
| Requêtes des Functions | comptées dans le quota Workers (100 000 par jour, 10 ms de CPU) | quelques dizaines par jour | [CITED: pages limits, workers limits] |
| D1 | 5 millions de lignes lues et 100 000 écrites par jour, 500 Mo par base, 10 bases | une ligne par utilisateur | [CITED: d1 limits / pricing] |
| Access : utilisateurs | **50 places** gratuites, une place consommée à la première connexion et gardée jusqu'au retrait | quelques amis | [CITED (mécanisme) : cloudflare-one/team-and-resources/users/seat-management ; chiffre de 50 : sources tierces, MEDIUM] |
| Access : applications, domaines par application | 500, 50 | 1 ou 2 applications, 2 domaines | [CITED: cloudflare-one/account-limits] |

### Jeton d'API (permissions minimales)
| Permission (Compte) | Nécessaire pour | Note |
|---------------------|-----------------|------|
| Cloudflare Pages › Edit | `pages project create`, `pages deploy` | |
| D1 › Edit | création de la base, `d1 migrations apply --remote` | |
| Access: Apps and Policies › Edit | application Access, politique de liste blanche, Bypass | |
| Access: Organizations, Identity Providers, and Groups › Edit | ajout du fournisseur OTP **par l'API** | facultatif si fait dans le tableau de bord [CITED: one-time-pin (permission Terraform équivalente)] |
| Account Settings › Read | `wrangler whoami`, résolution du compte | [ASSUMED] |

Le jeton est restreint au seul compte, avec une **date d'expiration** (par exemple 30 jours), puis révoqué après la mise en place. [ASSUMED : noms exacts des permissions à confirmer dans la liste du tableau de bord]

### Créer l'application Access
**Prérequis (tableau de bord uniquement) :** créer l'organisation Zero Trust : **Zero Trust → choisir un nom d'équipe (`<équipe>.cloudflareaccess.com`) et un plan (Free)**. [CITED: cloudflare-one/faq/getting-started-faq] Un moyen de paiement peut être demandé même pour le plan Free. [ASSUMED]

**Piège :** les nouvelles organisations ont comme méthode de connexion par défaut le **fournisseur d'identité Cloudflare, restreint aux membres du compte**. L'OTP n'est plus ajouté automatiquement. Les amis ne pourraient donc pas se connecter tant que l'OTP n'est pas ajouté et autorisé sur l'application. [CITED: integrations/identity-providers/cloudflare, /one-time-pin]

**Par l'API** (script idempotent `tools/cf-access.mjs`, `fetch` + jeton, sans dépendance ; forme des corps à confirmer, [ASSUMED] sauf mention) :
1. `POST /accounts/{id}/access/identity_providers` `{ "name": "One-time PIN login", "type": "onetimepin", "config": {} }` [CITED: one-time-pin]
2. `POST /accounts/{id}/access/policies` (politique réutilisable) `{ "name": "Zuma — joueurs", "decision": "allow", "include": [{ "email": { "email": "a@exemple.fr" } }, …], "session_duration": "730h" }`
3. `POST /accounts/{id}/access/apps` `{ "type": "self_hosted", "name": "Zuma", "destinations": [{ "type": "public", "uri": "zuma.pages.dev" }, { "type": "public", "uri": "*.zuma.pages.dev" }], "session_duration": "730h", "allowed_idps": ["<id OTP>"], "auto_redirect_to_identity": true, "app_launcher_visible": false, "policies": [{ "id": "<id politique>", "precedence": 1 }] }` ; noter l'**AUD** renvoyé (`aud`).
4. Seconde application, plus précise, **Bypass** sur `zuma.pages.dev/public` (manifeste, icônes, CSS : aucun fichier original) ; voir §B3 M-2.

**Par le tableau de bord** (procédure officielle pour `*.pages.dev`) : projet Pages → Settings → **Enable access policy** → Manage → Configure. Sous « Public hostname », supprimer le joker `*` et enregistrer : le domaine `zuma.pages.dev` est alors protégé. Revenir ensuite dans le projet et **réactiver** « Enable access policy » pour protéger aussi les aperçus. Deux applications doivent apparaître : `zuma.pages.dev` et `*.zuma.pages.dev`. [CITED: pages/platform/known-issues « Enable Access on your *.pages.dev domain »]

**Durées de session :** session globale de 15 minutes à **un mois** (24 h par défaut) ; session d'application et de politique jusqu'à **un mois** (24 h par défaut). Quand le jeton d'application expire, Access en réémet un sans connexion tant que la session globale est valide. → Mettre **un mois** partout. [CITED: access-settings/session-management]

## B2. Scores rattachés à l'identité Access (Pages Function + D1)

### Principe
- Le client appelle `GET` et `PUT /api/scores` **sur la même origine**. Access laisse passer la requête si le cookie `CF_Authorization` est valide et ajoute l'en-tête `Cf-Access-Jwt-Assertion`. [CITED: authorization-cookie/validating-json] Pas de CORS ; un appel croisé derrière Access ferait échouer le preflight `OPTIONS` en 403. [CITED: authorization-cookie/cors]
- **Valider le JWT** plutôt que se fier à `Cf-Access-Authenticated-User-Email` ou au cookie (« We recommend validating the `Cf-Access-Jwt-Assertion` header instead of the `CF_Authorization` cookie »). Les clés publiques sont à `https://<équipe>.cloudflareaccess.com/cdn-cgi/access/certs`. La rotation a lieu toutes les 6 semaines et l'ancienne clé reste valide 7 jours : il faut choisir la clé par `kid` et ne pas la coder en dur. L'AUD est propre à l'application et ne change pas, sauf si elle est recréée. [CITED: validating-json] La validation reste nécessaire même derrière Access : un aperçu ou une erreur de configuration ne doit pas permettre de forger l'en-tête.
- Le greffon officiel `@cloudflare/pages-plugin-cloudflare-access` est une **dépendance npm**, donc exclu. Reste ≈ 40 lignes avec `crypto.subtle.importKey('jwk')` et `verify('RSASSA-PKCS1-v1_5')`. La cryptographie est celle de WebCrypto, rien n'est réécrit : seuls le découpage base64url et la vérification des champs sont écrits, et tous les cas de rejet sont testés.
- Clé de stockage `SHA-256(lower(email))` : **aucune adresse en clair** dans D1. L'adresse n'est connue que dans la requête.

### Prototype exécuté (bloc-notes, hors dépôt)
`scratchpad/spike/pages/{functions/api/scores.js (4,0 Ko), merge.mjs (1,4 Ko), d1stub.mjs, schema.sql, pages.test.mjs}`. Le test génère une paire RSA par WebCrypto, sert un faux JWKS par un bouchon `fetch`, et utilise D1 sur `node:sqlite` en mémoire. Résultat : `node --test` → **2 réussis sur 2** (Node 22.22.0). [VERIFIED: exécution locale]

Points du gestionnaire : 405 hors `GET` et `PUT` ; 401 si le JWT est absent, mal signé, avec un mauvais `iss` ou `aud`, expiré, ou avec un `nbf` dans le futur ; 413 au-delà de 16 Ko ; `sanitize` (identifiants `^[a-z0-9-]{1,32}$`, 200 niveaux au plus, bornes entières) ; fusion ; `UPDATE … WHERE rev = ?` (ou `INSERT … ON CONFLICT DO NOTHING` à la première écriture), 3 tentatives puis 409 ; cache JWKS d'une heure, rechargé si le `kid` est inconnu.

**Schéma (`migrations/0001_scores.sql`) :**
```sql
CREATE TABLE IF NOT EXISTS scores (
  user_hash  TEXT PRIMARY KEY,           -- SHA-256(lower(email)), hex
  data       TEXT NOT NULL,              -- JSON { levelId: { s, t, u } }, ≤ 16 Ko
  rev        INTEGER NOT NULL DEFAULT 0, -- concurrence optimiste
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
```
Une ligne par utilisateur, et non par niveau : D1 gratuit limite à 50 requêtes par invocation et 100 paramètres liés par requête, alors que le jeu compte 76 emplacements et 22 décors. [CITED: d1/platform/limits]

**Fusion (fonction pure partagée, `src/scoresync.ts`) :** par niveau, `s` = maximum, `t` = minimum des temps strictement positifs (`null` si le niveau n'a jamais été gagné), `u` = maximum. L'opération est commutative, associative et idempotente, donc sans conflit possible.

**Configuration (`wrangler.jsonc`, générée au déploiement) :**
```jsonc
{
  "name": "zuma",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2026-10-01",
  "d1_databases": [{ "binding": "DB", "database_name": "zuma-scores", "database_id": "<uuid>", "migrations_dir": "migrations" }],
  "vars": { "TEAM_DOMAIN": "https://<équipe>.cloudflareaccess.com", "POLICY_AUD": "<aud>" }
}
```
Rien de secret, mais le dépôt est public : `tools/deploy-private.mjs` écrit ce fichier depuis les variables d'environnement, dans `.wrangler/` (ignoré par Git), pour ne pas publier le nom d'équipe ni l'AUD. [ASSUMED : `--config` accepté par `pages deploy` ; sinon écrire le fichier à la racine et l'ignorer]

### Côté client (lu dans le code)
- Aujourd'hui, seul le meilleur **temps** est persisté (`zuma.best.<id>`, `src/statsdialog.ts` l. 158–167 ; écriture dans `src/main.ts` l. 887–894). La clé est l'identifiant de **décor** (`spiral`) : 22 clés pour 76 emplacements, partagées entre difficultés. Aucun meilleur score n'est stocké. → Q2 et Q3.
- Modules : `src/scoresync.ts` (pur), `src/scorestore.ts` (magasin `zuma.scores` v1 + migration des `zuma.best.*`), `src/syncclient.ts` (`fetch('/api/scores', { credentials: 'same-origin', redirect: 'manual' })`, délai de 8 s, ne lève jamais d'exception). **Plus de panneau de code ni de QR** : une ligne d'état dans le menu ou l'aide suffit (« Scores synchronisés », « Hors ligne », « Reconnexion nécessaire »).
- Moments : au démarrage, au `visibilitychange` → visible (au plus une fois par minute), après chaque niveau gagné, et à l'événement `online` si une écriture est en attente.
- **Session expirée :** Access répond à `/api/scores` par une redirection vers l'équipe. Avec `redirect: 'manual'`, on reçoit une `opaqueredirect` : on garde l'écriture en attente et on propose « Se reconnecter », qui fait une **navigation de premier niveau** hors cache (par exemple `./?login=<horodatage>`, que le SW laisse au réseau). [ASSUMED : forme exacte de la réponse d'Access à un `fetch`]
- Le build `--local` active la synchronisation : `__SYNC__ = true` remplacé par `tools/build.mjs`. Les builds public et standalone gardent `false`.

### Tests (sans réseau)
| Comportement | Test |
|--------------|------|
| Fusion commutative, associative, idempotente ; `null` vs temps | `tests/r2xx-sync.test.mjs` sur `.compiled/scoresync.js` |
| Migration `zuma.best.*` → `zuma.scores` ; `localStorage` indisponible | bouchon `Map` |
| Function : JWT valide (fusion, adresse en minuscules) ; rejet si absent, `aud`, `iss`, `exp`, signature falsifiée, `kid` inconnu ; 413 ; 405 ; 409 | `tests/r2xx-access.test.mjs` : paire RSA WebCrypto, bouchon `fetch` JWKS, D1 sur `node:sqlite` (prototype prêt) |
| Client : `opaqueredirect` → état « reconnexion », écriture en attente conservée ; `fetch` rejeté → hors ligne | bouchon `fetch` |

`node:sqlite` fonctionne sans option sous Node 22.22, avec un simple `ExperimentalWarning`. Repli : un bouchon `Map` qui ne reconnaît que les trois requêtes.

## B3. Risques d'Access avec une PWA installée, et parades

| # | Risque | Plateformes | Preuve | Confiance |
|---|--------|-------------|--------|-----------|
| R1 | **Manifeste chargé sans cookies** → redirigé vers la connexion → app non installable | Chromium (Mac, PC, Android) ; iOS probable | PR NUTFes/group-manager-2 #2194 : « manifest のfetchはcredentialsを送らない » → correctif `<link rel="manifest" crossorigin="use-credentials">` | MOYENNE |
| R2 | **Connexion hors `scope`** (`<équipe>.cloudflareaccess.com`) dans une app iOS installée : la page s'ouvre dans une feuille Safari ou dans Safari. On ne sait pas si le cookie `CF_Authorization` de `zuma.pages.dev` posé au retour (`/cdn-cgi/access/authorized`) arrive dans le stockage **de l'app**, isolé de Safari (D-38). Risque de boucle de connexion | iOS / iPadOS | Aucune source directe. Indirectes : omnigent #9009 (vue web iOS derrière Access, cookie jamais reçu, écran blanc) ; hermes-webui #1038 (PWA iOS : une redirection vers la connexion « breaks out of the PWA shell and opens in Safari », seule issue : supprimer et réinstaller l'app) ; home-assistant/iOS #5563 (boucle si l'app passe en arrière-plan pendant l'authentification, par exemple pour lire le PIN dans Mail) | **BASSE (à tester)** |
| R3 | Lancement **hors ligne ou session expirée** : si la navigation va au réseau, Access redirige hors de l'app | Toutes | Mécanisme d'Access (redirection vers l'équipe) [CITED: session-management] | HAUTE |
| R4 | **Rappel `/cdn-cgi/access/authorized` intercepté par le SW** (navigations servies depuis le cache, `ignoreSearch` en 05-14) → cookie jamais posé, boucle | Toutes | Déduction du code de 05-14 et du flux Access [ASSUMED] | MOYENNE |
| R5 | **Mise à jour du SW bloquée** quand la session a expiré : la requête `sw.js` est redirigée, la mise à jour échoue en silence et l'ancienne version continue | Toutes | [ASSUMED : un script de SW ne peut pas suivre une redirection vers une autre origine] | MOYENNE |
| R6 | **Aperçus `<hash>.zuma.pages.dev` publics** (pack exposé) | — | [CITED: preview-deployments] | HAUTE |
| R7 | Lecture du PIN dans Mail sur le même iPhone → l'app passe en arrière-plan pendant l'authentification | iOS | home-assistant/iOS #5563 (autre fournisseur, même mécanisme) | BASSE |
| R8 | Web app « Ajouter au Dock » (Safari macOS) : données de site séparées de Safari → nouvelle connexion dans l'app | macOS | [ASSUMED] | MOYENNE |
| R9 | Places Access : chaque appareil d'un même e-mail = une seule place ; un ami de plus = une place, gardée jusqu'au retrait | — | [CITED: seat-management] | HAUTE |

**Parades (à mettre en place dans cet ordre) :**
- **M-1 Sessions longues :** session globale **et** session d'application = 1 mois → un PIN par mois et par appareil au plus. [CITED]
- **M-2 Bypass `/public`** (manifeste, icônes, CSS, aucun fichier original) **+** `crossorigin="use-credentials"` sur le `<link rel="manifest">`. Corrige R1 de deux façons ; la Bypass couvre aussi l'icône `apple-touch-icon` lue par iOS. Bypass ne journalise pas et n'accepte pas de sélecteur d'identité : sans importance pour des fichiers publics. [CITED: access-controls/policies « Bypass »]
- **M-3 Service worker :** (a) `if (url.pathname.startsWith('/cdn-cgi/')) return;` et ne jamais servir une navigation `?login=` depuis le cache (R4) ; (b) navigations **cache d'abord** pour la coquille, et pack servi depuis `zuma-pack` ou le cache du build. Session expirée ou hors ligne, **le jeu démarre et se joue entièrement** ; seule la synchronisation attend (R3). (c) Requêtes d'une autre origine ignorées. (d) Échec de mise à jour du SW → message « Reconnectez-vous pour mettre à jour » (R5).
- **M-4 Affichage :** sur iOS, `fullscreen` revient à `standalone` (l'expérience reste la même) ; garder `scope: "./"` et `start_url: "./"`. La page de connexion reste forcément hors `scope` : il n'y a aucun réglage de manifeste pour l'y faire entrer. [ASSUMED]
- **M-5 Aperçus :** `--branch main` imposé par `tools/deploy-private.mjs` + application Access sur `*.zuma.pages.dev` (R6).
- **M-6 Première connexion iOS :** consigne « Ouvrez Zuma dans Safari, connectez-vous (PIN), puis Partager › Sur l'écran d'accueil ; à la première ouverture de l'app, reconnectez-vous une fois ». Lire le PIN sur un autre appareil ou depuis une notification sans quitter la feuille (R7).
- **M-A (repli si R2 échoue sur l'iPhone) — Access par chemins :** la coquille (code déjà public sur GitHub, sans aucun fichier original) devient publique, et Access ne protège que `zuma.pages.dev/assets` et `/api`, en plus des aperçus. L'app s'installe et démarre sans Access, en rendu vectoriel. « Se connecter » navigue vers `/api/login`, une Function protégée qui renvoie en 302 vers `./`. Une fois connecté, le pack est mis en cache et reste disponible hors ligne. Si le cookie n'arrive jamais dans l'app iOS, reste l'import `.zpk` de 05-14 dans l'app, qui contourne Access pour les ressources. Les scores restent alors locaux sur cet appareil. [ASSUMED : les chemins d'une application Access (un domaine + un chemin) l'emportent par spécificité]

**Validation obligatoire avant de planifier la synchronisation :** UAT d'une heure sur l'iPhone et l'iPad réels avec le squelette (M-1, M-2, M-3, M-5) : installation, première connexion, lancement hors ligne, lancement après expiration (régler temporairement la session à 15 minutes), mise à jour.

## B4. Démarches ponctuelles de l'utilisateur (en français, à recopier)

1. **Réseau de la session cloud :** dans les réglages de l'environnement, autoriser `api.cloudflare.com` (et, si possible, `*.pages.dev` et `<équipe>.cloudflareaccess.com`). Sans cela, le déploiement doit se faire depuis votre Mac (`npx wrangler login`, puis la même commande).
2. **Zero Trust :** tableau de bord Cloudflare → **Zero Trust** → choisir un **nom d'équipe** (il donne `https://<équipe>.cloudflareaccess.com`) → plan **Free** (moyen de paiement possiblement demandé).
3. **Connexion par PIN :** Zero Trust → **Integrations › Identity providers** → **Add new identity provider** → **One-time PIN** (ou laisser le script le faire si le jeton a la permission correspondante).
4. **Jeton d'API :** Mon profil → **API Tokens** → **Create Token** → **Custom token** avec les permissions de **Compte** : *Cloudflare Pages : Edit*, *D1 : Edit*, *Access: Apps and Policies : Edit*, *Access: Organizations, Identity Providers, and Groups : Edit* (facultatif), *Account Settings : Read* ; ressources : **votre seul compte** ; **date d'expiration** dans 30 jours. Le donner comme **secret de l'environnement** (`CLOUDFLARE_API_TOKEN`), avec l'**identifiant de compte** (`CLOUDFLARE_ACCOUNT_ID`, visible sur la page d'accueil du compte), et non dans la conversation.
5. **Adresses autorisées :** communiquer la liste des e-mails (vous et vos amis, 50 au plus en gratuit). Pour en ajouter ou en retirer : Zero Trust → **Access controls › Policies** → « Zuma — joueurs ».
6. **Sessions :** Zero Trust → **Access controls › Access settings** → session globale **1 month** (le script règle celle de l'application).
7. **Après le premier déploiement :** vérifier dans une fenêtre privée que `https://zuma.pages.dev` et une URL `https://<hash>.zuma.pages.dev` demandent la connexion.
8. **UAT iPhone / iPad** (§B3, « Validation obligatoire »).
9. **Révoquer le jeton** une fois la configuration stable, ou le garder pour les déploiements suivants.

## Bibliothèques à ne pas réécrire

| Problème | À ne pas écrire | Utiliser | Pourquoi |
|----------|-----------------|----------|----------|
| Signature RS256 | Calcul RSA ou ASN.1 maison | `crypto.subtle.importKey('jwk')` + `verify('RSASSA-PKCS1-v1_5')` | Natif aux Workers et à Node 22 ; seul le découpage du JWT est écrit |
| Clés d'Access | Clé publique codée en dur | JWKS `…/cdn-cgi/access/certs`, choix par `kid`, cache d'une heure | Rotation toutes les 6 semaines [CITED] |
| Authentification | Comptes, mots de passe, e-mails | Cloudflare Access + OTP | Hors du code |
| Concurrence D1 | Verrou | `UPDATE … WHERE rev = ?` + `meta.changes` | Simple et testé |
| Déploiement | Envoi par l'API à la main | `wrangler pages deploy` | Gère les empreintes et les envois partiels |

## Pièges (récapitulatif pour la vérification)
1. Déploiement sans `--branch main` → aperçu **public** contenant le pack.
2. OTP absent ou non autorisé sur l'application → les amis sont refusés (le fournisseur Cloudflare par défaut est réservé aux membres du compte).
3. Le SW intercepte `/cdn-cgi/…` ou sert une navigation de connexion depuis le cache → boucle.
4. Manifeste derrière Access sans `use-credentials` ni Bypass → pas d'installation.
5. `wrangler.jsonc` avec nom d'équipe et AUD commité dans le dépôt public : le générer dans `.wrangler/`.
6. `dist/` local (`--local`) poussé par erreur vers GitHub : déjà ignoré, la garde doit le vérifier.
7. `public/sw.js` actuel : en échec réseau, il renvoie `index.html` pour **tout** `GET`, y compris `/api/scores` → `SyntaxError` hors ligne : laisser `/api/` au réseau.
8. Les places Access ne se libèrent pas d'elles-mêmes (retrait manuel).

## Audit de légitimité des paquets

| Paquet | Registre | Usage | Source | slopcheck | Disposition |
|--------|----------|-------|--------|-----------|-------------|
| `wrangler` | npm 4.149.0 (modifié le 2026-10-08), sans `postinstall` | `npx` au déploiement uniquement, jamais dans `package.json` | github.com/cloudflare/workers-sdk | non concluant (l'outil a détecté PyPI et tenté d'y installer un homonyme, qui a échoué ; vérifié non installé) | Approuvé, nommé par la documentation officielle ; [ASSUMED] faute de verdict |
| `@cloudflare/pages-plugin-cloudflare-access` | npm | — | officiel | n/a | **Écarté** (dépendance ; remplacé par 40 lignes WebCrypto) |

Aucune dépendance npm ajoutée au dépôt. Note : `npx --yes wrangler@4 --version` a été exécuté une fois (téléchargement dans le cache npm de la session) pour la vérification demandée.

## Journal des hypothèses

| # | Hypothèse | Section | Risque si elle est fausse |
|---|-----------|---------|---------------------------|
| A1 | L'environnement cloud permet d'autoriser `api.cloudflare.com` et de fournir des secrets | B1 | Déploiement depuis le Mac seulement |
| A2 | Noms exacts des permissions du jeton | B1 | Échec 403 de wrangler ou de l'API ; ajuster |
| A3 | Formes des corps de l'API Access (`destinations`, `allowed_idps`, `session_duration: "730h"`, politiques réutilisables) | B1 | Script à corriger ; repli tableau de bord |
| A4 | Le plan Free de Zero Trust compte 50 places (sources tierces) | B1 | Limite différente |
| A5 | Réponse d'Access à un `fetch` sans session = redirection (→ `opaqueredirect`) | B2 | Adapter la détection (401, 403 ou HTML) |
| A6 | Un script de SW ne suit pas une redirection vers une autre origine | B3 R5 | Aucun |
| A7 | Les chemins d'Access l'emportent par spécificité (Bypass `/public`, M-A) | B3 | Revoir M-2 / M-A |
| A8 | Web app du Dock sur macOS : cookies séparés de Safari | B3 R8 | Aucun (une connexion de plus) |
| A9 | `functions/` lu depuis le répertoire courant ; `--config` accepté par `pages deploy` | B1/B2 | Ajuster `deploy-private.mjs` |

## Questions ouvertes
1. **Q1 — Légal (à trancher par l'utilisateur) :** CLAUDE.md interdit de **publier** les ressources originales. Derrière Access, le site n'est pas public, mais le pack devient accessible à des tiers (les amis), ce qui revient à le leur distribuer. D-40 avait été choisi pour que chaque ami fournisse sa propre copie. Il faut confirmer que la liste blanche ne regroupe que des personnes qui possèdent le jeu, ou que l'utilisateur assume ce choix. Les deux variantes sont techniquement prêtes : pack hébergé, ou coquille seule et import du `.zpk` par chacun.
2. **Q2 — Clé du record :** identifiant de décor (22 clés, comportement actuel) ou emplacement d'aventure `s-l` (76 clés, plus fidèle) ? Recommandation : l'emplacement, avec migration des anciennes clés.
3. **Q3 — « Meilleur score » :** `levelScore` à la victoire, plus un record de partie (`game`) au game over ?
4. **Q4 — Inventaire du compte :** Workers, D1, KV, projets Pages et organisation Zero Trust existants. Non fait (ni MCP ni réseau ici) : à faire par le coordinateur en lecture seule.
5. **Q5 — Cohérence avec 05-14** (en cours d'écriture : GitHub Pages public + import `.zpk`) : l'hébergement privé le complète (même SW, même cache `zuma-pack`, même manifeste) mais retire `pages.yml` du chemin des ressources. Le planificateur doit fusionner M-2 à M-5 dans 05-14 ou dans un plan 05-16.

## Effort estimé
| Lot | Contenu | Effort |
|-----|---------|--------|
| 0 — Squelette + UAT iOS | `tools/deploy-private.mjs` (`--local`, garde, `--branch main`, `wrangler.jsonc` généré), `tools/cf-access.mjs` (OTP, politique, applications, Bypass), parades du SW (M-3), `use-credentials` | ≈ 0,5–1 jour + 1 h d'UAT utilisateur |
| 1 — Scores | `functions/api/scores.js` (ou `.ts` compilé), migration D1, `src/scoresync.ts`, `scorestore`, `syncclient`, ligne d'état, tests | ≈ 1–1,5 jour |
| Total | | **≈ 2–2,5 jours** ; le lot 1 ne démarre qu'après le verdict iOS du lot 0 |

## Disponibilité de l'environnement
| Dépendance | Requise par | Disponible | Version | Repli |
|------------|-------------|------------|---------|-------|
| `npx wrangler` | Déploiement | ✓ | 4.149.0 | — |
| `api.cloudflare.com` | Déploiement, D1, Access | **✗ (403 politique)** | — | **Action utilisateur** (A1) ou Mac |
| Outils MCP Cloudflare | Inventaire | ✗ (sous-agent) | — | Coordinateur |
| Node + `node:sqlite` | Tests | ✓ | 22.22.0 | Bouchon `Map` |
| Pack privé `private_assets/pack` | Build `--local` | ✓ | 269 fichiers, 5,6 Mo | — |

## Architecture de validation
| Propriété | Valeur |
|-----------|--------|
| Cadre | `node:test` + `node:assert/strict` (existant) |
| Commande rapide | `node --test tests/r2xx-sync.test.mjs tests/r2xx-access.test.mjs` |
| Suite complète | `npm test` |

Vague 0 : créer `tests/r2xx-sync.test.mjs` et `tests/r2xx-access.test.mjs` à partir de `scratchpad/spike/pages/pages.test.mjs`, ainsi qu'un test de garde : `dist/` du build `--local` jamais suivi par Git, `wrangler.jsonc` absent de l'index.

## Domaine sécurité
| ASVS | S'applique | Contrôle |
|------|------------|----------|
| V2 Authentification | oui | Cloudflare Access (OTP), aucune authentification maison |
| V3 Session | oui | Cookie `CF_Authorization` géré par Access ; durée d'un mois (choix d'usage assumé) |
| V4 Contrôle d'accès | oui | Liste blanche d'adresses ; aperçus couverts ; Bypass limitée à `/public` |
| V5 Validation | oui | JWT (signature, `iss`, `aud`, `exp`, `nbf`), corps ≤ 16 Ko, `sanitize` |
| V6 Cryptographie | oui | WebCrypto uniquement |

| Menace | STRIDE | Atténuation |
|--------|--------|-------------|
| En-tête d'identité forgé (aperçu, erreur de configuration) | Usurpation | Validation complète du JWT par JWKS + AUD |
| Pack exposé par une URL d'aperçu | Divulgation | `--branch main` imposé + application Access `*.zuma.pages.dev` |
| Jeton d'API qui fuit (conversation, dépôt) | Élévation | Secret d'environnement, portée d'un seul compte, expiration, révocation |
| Données personnelles en base | Divulgation | Seul `SHA-256(email)` est stocké |
| Dégradation des records d'un autre joueur | Altération | Clé tirée du JWT, fusion monotone |

## Annexe — variante « code de synchronisation » (remplacée par la révision)
Avant la révision, j'avais prototypé et testé (3 sur 3) un Worker séparé : `POST /v1/link` (code de 12 caractères en base32 de Crockford, haché), `GET` et `PUT /v1/scores/:code`, CORS sur liste blanche, liaison `ratelimits` (compteurs locaux à chaque emplacement Cloudflare, cohérents à terme [CITED: workers/runtime-apis/bindings/rate-limit]), déploiement par `cloudflare/wrangler-action@v4` [CITED: README wrangler-action], plus un QR (portage MIT de nayuki/QR-Code-generator : ≈ 18 Ko compilé, ≈ 5 Ko gzip, mesuré). Code dans `scratchpad/spike/worker/`. **Il ne sert plus** dans le modèle Access ; à garder seulement si M-A et le stockage local seul se révélaient insuffisants pour l'iPhone.

## A. Import de l'installeur dans le navigateur (D-40) — suspendu (décision utilisateur en attente)
Constats déjà mesurés sur `ZumaSetup-fr-1.0.exe` (7 521 288 octets), à conserver pour une reprise :
- Exécutable PE dont l'image se termine à `0x57000`, suivi de 8 octets (`00 70 05 00 02 00 00 00`), puis d'un **cabinet Microsoft** à `0x57008` (version 1.3, 7 159 449 octets, 1 dossier, 478 fichiers). [VERIFIED: en-têtes]
- `typeCompress = 0x1503` → **LZX, fenêtre 2²¹**, 348 blocs CFDATA, 7 128 102 octets compressés pour 11 400 963 décompressés, flux unique. [VERIFIED]
- 38 sons en **Ogg Vorbis** (libVorbis 1.0, 1.0 RC1, 1.0 RC2), 238 `.gif`, 111 `.jpg`, 25 courbes `.dat`. [VERIFIED: `file`]
- Safari et Vorbis : la session WWDC25 annonce Ogg Vorbis et Opus dans Safari 26. Non recoupé (webkit.org injoignable) ; `decodeAudioData` non vérifié. [LOW]

## Sources

### Primaires (HAUTE) — dépôt `cloudflare/cloudflare-docs`, branche `production`, lu le 2026-10-11
- `pages/platform/limits` (20 000 fichiers, 25 Mio, Functions dans le quota Workers) ; `pages/get-started/direct-upload` (`--branch`, pas de passage à Git) ; `pages/configuration/preview-deployments` (aperçus publics par défaut) ; `pages/platform/known-issues` (Access sur `*.pages.dev`) ; `pages/functions/wrangler-configuration` (`pages_build_output_dir`, D1) ; `pages/functions/plugins/cloudflare-access`
- `cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json` (JWT, JWKS, rotation, AUD) ; `…/authorization-cookie/cors` (preflight 403) ; `cloudflare-one/access-controls/access-settings/session-management` (durées jusqu'à 1 mois) ; `cloudflare-one/access-controls/policies` (Bypass) ; `cloudflare-one/integrations/identity-providers/one-time-pin` et `/cloudflare` (OTP non ajouté par défaut) ; `cloudflare-one/team-and-resources/users/seat-management` ; `cloudflare-one/account-limits` ; `cloudflare-one/faq/getting-started-faq` (nom d'équipe, plan)
- `d1/platform/limits`, `d1/platform/pricing`, `workers/platform/limits`, `workers/runtime-apis/bindings/rate-limit`
- github.com/cloudflare/mcp-server-cloudflare `apps/workers-bindings/README.md` ; github.com/cloudflare/wrangler-action README
- Mesures locales : statut du proxy (`recentRelayFailures`), `npx wrangler --version`, `find private_assets/pack`, prototypes `scratchpad/spike/{pages,worker}` (2 sur 2 et 3 sur 3)
- Code du dépôt : `src/statsdialog.ts`, `src/main.ts`, `public/sw.js`, `public/manifest.webmanifest`, `index.html`, `05-14-PLAN.md`

### Secondaires / tertiaires (BASSE à MOYENNE)
- [NUTFes/group-manager-2 PR #2194](https://github.com/NUTFes/group-manager-2/pull/2194) — manifeste derrière Access, `crossOrigin="use-credentials"`
- [omnigent-ai/omnigent #9009](https://github.com/omnigent-ai/omnigent/issues/9009) — vue web iOS derrière Access, cookie non reçu
- [nesquena/hermes-webui #1038](https://github.com/nesquena/hermes-webui/issues/1038) — PWA iOS bloquée après expiration (pas Access)
- [home-assistant/iOS #5563](https://github.com/home-assistant/iOS/issues/5563) — boucle si l'app passe en arrière-plan pendant l'authentification
- Agrégateurs de prix (costbench.com, subger.com) — 50 utilisateurs gratuits pour Zero Trust
- [WWDC25 « What's new in Safari and WebKit »](https://developer.apple.com/videos/play/wwdc2025/233/) — partie A seulement

## Métadonnées
- Pile Pages / Access / D1 : HAUTE (documentation officielle) ; corps exacts de l'API Access : MOYENNE
- Prototype de la Function : HAUTE (testé)
- Comportement PWA iOS derrière Access : **BASSE**, à valider en UAT avant de planifier la synchronisation
- Accès réseau de la session : HAUTE (constaté : bloqué)
- **Valide jusqu'au** 2026-11-10
