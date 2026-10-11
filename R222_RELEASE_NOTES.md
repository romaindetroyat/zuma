# R2.0.22

Cette baseline répond à deux questions de l'utilisateur sur R2.0.21 hébergé (`06.1-CONTEXT.md`, 2026-10-11) : « Pour les meilleurs temps, tu peux indiquer le prénom de celui qui l'a réalisé ? » et « Les scores, records etc… sont en commun pour tous les joueurs que j'invite, ou chacun le sien ? ». Sa réponse à la question posée en retour : **« Les deux »** — un tableau commun à tous les invités **et** les records personnels de chacun.

Jusqu'en R2.0.21, tout était local au navigateur : les dix meilleurs scores de l'aventure (`zuma.highscores.v1`) et le meilleur temps de chaque niveau (`zuma.best.<niveau>`). R2.0.22 ajoute à la version hébergée des **records partagés** : un worker qui les garde dans une seconde base D1 (`zuma-scores`), un client qui ne fait jamais attendre le jeu, et leur affichage avec les graphismes du jeu. Elle remplace la synchronisation reportée par la phase 5 (D-39 / D-42).

Chaque règle cite sa décision (D-xx de `06.1-CONTEXT.md`) et le test qui la verrouille. Ce qui reste une hypothèse est listé en fin de document pour la première session UAT de la phase 6.1 (`06.1-UAT.md`). **Le moteur de jeu ne change pas** : seuls la présentation, l'hébergement et les outils évoluent.

## Records partagés (version hébergée)

- **Périmètre** (D-01) : les records partagés n'existent que sur la version hébergée (artefact `--deploy`, derrière Cloudflare Access). `recordsEnabled` exige `http(s)`, un hôte qui n'est pas une boucle locale et le pack. Le **standalone** (`file://`) et **`npm run dev`** (`localhost`) gardent le stockage local de R2.0.21. Ils affichent aussi un prénom à côté du meilleur temps : celui du profil local. Verrou `r222-records` (« recordsEnabled: hosted build only … »).
- **Deux portées** (D-02) : **« TOUS »** (commun à toutes les adresses autorisées) et **« MOI »** (par identité Access, la même sur tous les appareils du joueur). Libellés `RECORD_SCOPE_LABEL` = `TOUS` / `MOI`.
- **Données** (D-03) : les dix meilleurs scores de l'aventure (dix communs, dix personnels) et le meilleur temps de chaque niveau (le meilleur commun avec le prénom de son auteur, et le meilleur personnel). Rien d'autre.
  - Un score part au **game over** et à la **fin de l'aventure** (effet `record-score` de la machine d'états, juste après `save-scores`, jamais en revue). Verrous `r222-records` (« record-score: emitted at a game over … », « … by the final route of won … », « … dropped in review sessions »).
  - Un temps part quand un **niveau du pack est gagné**, hors revue. Verrou `r222-wiring` (« level times are queued only outside review sessions »).
  - Le meilleur temps est gardé **par plateau** : l'identifiant de niveau est celui du record local depuis R2.0.15 (`bestTimeKey` sans `zuma.best.`, soit la clé `graphics` du pack ; 22 plateaux). Verrous `r222-records` (« recordLevelId … »), `r222-api` (« recordLevelIds … »).
- **Prénom apposé par le serveur** (D-04) : le client n'envoie **jamais** de nom ; le worker prend le prénom dans sa table privée `players` à partir de l'adresse du jeton Access. Une adresse autorisée sans prénom écrit sous **« Joueur »**. Aucune adresse n'est stockée : l'identité est l'empreinte SHA-256 de l'adresse en minuscules (comme `playerKey` de `api/me`). Verrous `r222-api` (« the server sets the first name from the JWT (a client name is ignored) », « allowed address without a first name → « Joueur »; no address stored »), `r222-records` (« postBody: … never a name »).
  - Le **nom est figé à l'écriture** : renommer un joueur dans `players` ne renomme pas ses anciens records.
- **Le meilleur gagne** : un temps ne remplace celui du joueur que s'il est strictement plus court ; à égalité, le record le plus ancien garde la première place. Un score est enregistré une fois par identifiant (un renvoi est ignoré). Verrous `r222-api` (« upsertTime keeps the best », « the best time wins … a tie keeps the older record », « a resent id is stored once »).
- **Hors ligne d'abord** (D-07) :
  - le stockage local reste la vérité de l'appareil ; une seule clé `zuma.records.v1` = `{ cache, pending: { scores, times }, migrated }`, relue partie par partie (une partie invalide est vidée, jamais l'ensemble rejeté) ;
  - les envois en attente gardent au plus les 10 meilleurs scores et le meilleur temps par niveau ; ils partent **au chargement**, **au retour du réseau** (`online`) et **après chaque niveau** ;
  - la dernière copie du serveur sert à l'affichage hors ligne ; les scores en attente y figurent déjà sous le prénom du joueur ;
  - **rien n'attend le réseau** : la synchronisation n'est jamais attendue (`void … .catch()`), une à la fois (une demande pendant un échange relance exactement un échange de plus), 5 s au plus par requête, échec silencieux ;
  - la réponse du serveur s'applique au stockage **courant** : un score mis en file pendant l'échange reste en attente.
  - Verrous `r222-records` (« queueScore … », « queueTime … », « afterPost … », « syncRecords: pending items POSTed, the answer applied to the CURRENT store … », « exchangeRecords: no answer within timeoutMs → retry … »), `r222-wiring` (« hors ligne (offline) then back … », « the records synchronisation is never awaited (D-07) »).
- **Reprise de l'existant** (D-08) : au premier échange réussi, chaque appareil envoie une fois ses meilleurs temps locaux et les scores de son tableau local **inscrits sous le prénom du joueur courant**, jamais les valeurs de démonstration (Zuma / Grenouille / Têtard) ni les scores d'un autre nom. Le drapeau `migrated` est écrit avec la copie du serveur. Verrous `r222-records` (« migrationItems … », « isDemoScore … », « syncRecords: D-08 import once … »), `r222-wiring` (« D-08: first successful exchange imports … once »).
- **Revue** (`?level=`) : n'écrit toujours rien ; elle ne met rien en file et ne déclenche aucun envoi après un niveau ; seule la synchronisation du chargement a lieu, comme hors revue. Verrous `r222-records` (« record-score: … dropped in review sessions »), `r222-wiring` (« level times are queued only outside review sessions »).

## API du worker (`tools/recordsapi.mjs`, `tools/d1worker.mjs`)

Le worker Pages généré à chaque déploiement reçoit une route `/api/records`, sur la même origine que le jeu et derrière le même contrôle du jeton Access que le reste (D-06). Le fragment est produit par `tools/recordsapi.mjs` et intégré par `generateWorker` (sans import, noms préfixés).

- **`GET /api/records`** → `{ shared: { scores, times }, mine: { scores, times } }`, `no-store`, `nosniff` ; `HEAD` → 200 sans corps. `shared.times` donne pour chaque niveau le meilleur temps et le prénom de son auteur ; `mine` ne contient que les records du demandeur. Verrou `r222-api` (« GET: empty state as JSON no-store … », « shared = the 10 best of all players, mine = the requester only … »).
- **`POST /api/records`** (JSON) : seule écriture du worker, uniquement sur ce chemin. Corps `{ scores?, times? }` en lot : 1 élément au moins, **10 scores** et **40 temps** au plus, clés inconnues ignorées (dont un éventuel `name`). Réponse : le nouvel état, de la même forme que le GET.
- **Contrôles, dans l'ordre** : identité (adresse du jeton ; sans adresse, par exemple un jeton de service → 403) → `Origin` = l'hôte (sinon 403) → `content-type` JSON (sinon 415) → `content-length` → lecture bornée du corps, arrêtée au-delà de **4 096 octets** même si l'en-tête ment (413) → JSON → bornes (400, **un seul élément invalide refuse toute la requête**) → liaison présente (503) → débit (429) → écriture en un lot. Une requête refusée n'atteint jamais la base. Verrou `r222-api` (« POST refusals: Origin 403, content-type 415, size 413, shape / bounds 400 — nothing written »).
- **Bornes** (D-10) : score entier 0..99 999 999, étage et niveau 0..99, temps entier 1..3 600 s, niveau parmi les plateaux du pack (liste inscrite dans le worker au déploiement), identifiant de score 16 chiffres hexadécimaux, jour `AAAA-MM-JJ` ou vide, prénom 20 caractères au plus. `RECORDS_LIMITS` (worker) = `RECORD_BOUNDS` (client). Verrous `r222-api` (« RECORDS_LIMITS: the D-10 bounds … », « RECORDS_LIMITS equals RECORD_BOUNDS of the client »), `r222-records` (« RECORD_BOUNDS: the exact values shared with the worker »).
- **Débit** : 20 POST par identité sur 60 s glissantes (le 21ᵉ → 429, `retry-after: 60`), 512 identités suivies. **La limite est tenue par isolat du worker, pas globalement** : deux isolats Cloudflare comptent chacun de leur côté (voir CONCERNS). Seules les requêtes valides qui écriraient comptent : un bogue du client ne bloque pas un joueur. Verrou `r222-api` (« rate limit: 20 POST per identity in 60 s … »).
- **SQL fermé** : six requêtes préparées (`RECORDS_SQL`), paramètres liés, aucune `DELETE` / `DROP` / `ALTER` ; chaque texte est préparé sur un vrai SQLite et chaque requête préparée par le worker appartient à la liste ; aucune requête sur `ASSETS_DB`. Verrous `r222-api` (« RECORDS_SQL: closed list … », « every statement prepared on SCORES_DB is in RECORDS_SQL; none on ASSETS_DB »).
- **Autres réponses** : `PUT` / `DELETE` / `PATCH` → 405 (`allow: GET, HEAD, POST`) ; base absente ou en panne → 503 `no-store`, `retry-after: 60`, sans détail. Verrous `r222-api` (« methods … 405 », « outages … 503 »).
- **Pas d'anti-triche** (D-10) : les invités sont de confiance ; le serveur ne vérifie que les bornes et le débit.
- **Service worker** : `api/records` n'est jamais intercepté ni mis en cache (GET, navigation, POST). Verrou `r220-pwa`.
- Le worker reste un module sans `import`, `console`, `process`, `Buffer` ni `eval`, avec un seul `fetch` (JWKS), déterministe et sans aucune adresse. Verrou `r222-api` (« worker source with records … »).

## Base `zuma-scores` et déploiement (`tools/deploy.mjs`)

- **Seconde base D1** `zuma-scores`, liaison **`SCORES_DB`** (D-05) ; `zuma-assets` / `ASSETS_DB` restent réservées aux fichiers du jeu. Schéma : deux `CREATE TABLE IF NOT EXISTS` (`scores` : un score par ligne, unique par joueur et identifiant ; `times` : un temps par joueur et par plateau). Verrous `r222-api` (« records database: own binding and name … », « SCORES_SCHEMA … »).
- **Ordre des écritures**, chacune relue avant de passer à la suivante : Access → `zuma-assets` → contenus manquants → **base `zuma-scores`** → **schéma** (les deux textes en un lot dès qu'une table manque) → **un seul PATCH** avec `ASSETS_DB` et `SCORES_DB` (production et aperçu) → worker sur `main`, avec la liste des plateaux du pack (« records : 22 niveaux » ; pack illisible → aucun niveau, temps refusés, déploiement poursuivi). Verrous `r222-deploy` (« run (default) from the R2.0.21 state … », « run (default) on a provisioned account … second run writes nothing », « worker levels … »).
- **Redéploiement après une liaison** : une liaison Pages ne s'applique qu'aux nouveaux déploiements. Le déploiement redéploie donc **toujours** le worker après un PATCH des liaisons, même si le worker n'a pas changé (correction trouvée pendant la phase : sans elle, un ajout de `SCORES_DB` avec un worker identique aurait laissé la production sans la base). Verrou `r222-deploy` (« zuma-scores present but without its tables: only the schema, the binding and the redeploy are written »).
- **Idempotent, ne supprime jamais rien** : un second passage n'écrit rien (« actions prévues : 0 ») ; aucun `DELETE` dans aucun mode, PATCH seulement sur le projet Pages, aucune ligne écrite dans `zuma-scores` par l'outil, rien de secret dans le journal. Le compte simulé (`tools/cfsim.mjs`) refuse toute autre requête que le schéma et la lecture de `sqlite_master` sur `zuma-scores`. Verrous `r222-deploy` (« guarantees … », « cfsim … »).
- **Modes** :
  - `--plan` : actions prévues (au premier déploiement de R2.0.22 : `create-d1-scores-database`, `create-scores-tables`, `bind-d1`, `deploy-worker`) et une ligne « records : base « zuma-scores » présente|absente ; tables : … » ;
  - `--dry-run` : répétition complète sur un compte simulé, sans réseau. Verrou `r222-deploy` (« run --dry-run … ») ;
  - `--rollback-plan` : dix étapes décrites, jamais exécutées, dont le retrait de `SCORES_DB` et la suppression de `zuma-scores` (**records perdus** ; exporter d'abord depuis Storage & Databases › D1 › zuma-scores). Verrou `r222-deploy` (« run --rollback-plan … ») ;
  - `--verify` : une ligne par liaison et une ligne « records : base … ; liaison … ». Verrou `r222-deploy` (« run --verify … »).
- **Jeton** : les permissions de R2.0.21 suffisent (*D1 : Edit* couvre la seconde base).

## Affichage

Avec les graphismes du jeu, sans panneau DOM (D-09). Sans données de records (aucun meilleur temps, aucune portée affichée), chaque écran produit exactement la suite d'appels de dessin de R2.0.21. Verrou `r222-display` (empreintes des suites d'appels R2.0.21 capturées avant le changement).

- **STATS de fin de niveau** :
  - la ligne RECORD garde « RECORD » et le meilleur temps (commun sur la version hébergée) ;
  - la **sixième ligne de la colonne droite**, vide dans l'original et alignée sur COMBO MAX., montre « (PRÉNOM) » de l'auteur du meilleur temps, en majuscules, aligné à droite sur la colonne des valeurs (x 489), dans la couleur du record ;
  - quand le record personnel diffère, « MOI » se place dans la colonne des libellés (x 335) suivi du temps personnel ; le prénom est raccourci (« . » final) pour garder 8 px d'écart, jamais moins que « (S.) » ;
  - la ligne apparaît avec RECORD pendant le décompte du STATS ;
  - panneau vectoriel (sans pack) : `#result-record` = « 1:23 (Prénom) », écrit par `textContent`.
  - Verrous `r222-display` (« recordLabel … », « layoutRecordRow … », « composeStatsDialog with records … »), `r222-wiring` (« deux joueurs (two players): Bruno beats the time of Alice … » — joueurs fictifs des tests).
- **Écran d'aventure** : la plaque RECORDS (trois lignes) montre le tableau commun ; un **clic ou un toucher sur la plaque** bascule « TOUS » / « MOI ». Le libellé est centré sous le mot RECORDS (x 548, ligne de base 58), dans la police de la plaque, cerné, jaune 0xffff4c. Zone de la plaque : (456, 0, 184 × 65). Verrous `r222-display` (« drawAdventure: scope « TOUS » … », « advPlaqueAt / endingPlaqueAt … »).
- **Écran de fin** : tableau des dix communs avec **la ligne de la partie en surbrillance** (retrouvée par prénom et score, avant même le retour du serveur), « Score : N », même bascule ; libellé centré (x 320, ligne de base **162**, police du tableau). Zone de la plaque : (228, 84, 184 × 65). La ligne de base 164 du planificateur posait le libellé à 8 px sous le bord du cadre et 3,5 px sur la première ligne : elle a été ramenée à 162 après la capture DPR 2 (≈ 6 / 5,5 px). Verrous `r222-display` (« ADV_SCOPE … baseline 162 », « drawEnding: scope « MOI » … »).
- **Portée** : gardée en mémoire seulement ; **chaque lancement repart sur « TOUS »**.
- **Standalone et `npm run dev`** : aucun libellé de portée, la plaque ne réagit pas au clic, tableau local ; le STATS montre le prénom du profil local à côté du meilleur temps.

## Correction trouvée pendant la phase : standalone vide

**Le fichier unique du standalone ne démarrait plus depuis l'ajout de `records.js` (plan 06.1-01)** : écran vide, « Invalid or unexpected token ». `tools/build.mjs` insérait le code avec `html.replace(regex, \`…${js}…\`)` ; or `records.js` contient `'^[a-z0-9-]{1,40}$'`, et dans une chaîne de remplacement `$'` signifie « le texte après la correspondance » : la fin de `index.html` était recopiée au milieu de l'expression régulière. Les verrous `r215` vérifiaient la concaténation, pas le HTML final. Sans la preuve sur `file://` du plan 06.1-05, **ce bogue aurait été livré**. Les styles, le module et les ressources sont maintenant insérés par des **fonctions de remplacement** (aucune interprétation des `$`). Verrou `r222-wiring` (« standalone build: the bundle, the styles and the assets are inserted by replacer functions (no $-pattern expansion) »), qui vérifie aussi que le piège est réel.

## Tests

- Nouveaux fichiers :
  - `tests/r222-records.test.mjs` (33, plan 06.1-01) : modèle `zuma.records.v1`, bornes, file « le meilleur gagne », lectures défensives (noms nettoyés, pas de pollution de prototype), vues TOUS / MOI, reprise D-08, `levelRecord`, `rankOf`, activation, effet `record-score`, client d'échange (délai, abandon, `drop` / `retry`), synchronisation.
  - `tests/r222-api.test.mjs` (22, plan 06.1-02) : base, schéma, SQL fermé sur un vrai SQLite (`node:sqlite`), bornes, débit, route `api/records` (prénom du serveur, portées, refus, méthodes, pannes), source du worker.
  - `tests/fake-scores-d1.mjs` (aide, plan 06.1-02) : D1 simulée sur SQLite en mémoire, journal SQL, interrupteur de panne.
  - `tests/r222-deploy.test.mjs` (13, plan 06.1-03) : contrats à deux bases, compte simulé, ordre des écritures, redéploiement après liaison, `--dry-run`, `--rollback-plan`, `--verify`, garanties.
  - `tests/r222-display.test.mjs` (13, plan 06.1-04) : suites d'appels R2.0.21 inchangées sans données, ligne du STATS, libellés de portée, zones des plaques.
  - `tests/r222-wiring.test.mjs` (8, plan 06.1-05) : client et worker généré de bout en bout sur SQLite (file, D-08, deux joueurs, hors ligne), câblage de `main.ts`, insertion du standalone.
  - `tests/r222.test.mjs` (1, plan 06.1-06) : baseline 2.0.22.
- **Verrous ajustés**, commentés « R2.0.22 » ; aucun n'est affaibli :
  - `r221` : la baseline 2.0.21 devient « superseded » (version > 2.0.21, égale à `package.json`) ;
  - `r215-presentation`, `r218-presentation`, `r221-progress`, `r221-welcome` : `records` après `progress` dans `MODULES` et dans le shell du service worker ;
  - `r221-progress` : `record-score` rejoint les effets d'écriture ;
  - `r221-welcome` : le verrou « aucun nom dans un `textContent` » autorise exactement la ligne `#result-record` = `recordLabel(…)` (une seule occurrence), la règle R2.0.21 reste pour toutes les autres ;
  - `r221-adventure` : les vues reçoivent `scope: null` (écran R2.0.21) ;
  - `r220-pwa` : `api/records` jamais intercepté (ajout) ;
  - `r220-d1`, `r220-deploy` : contrat à deux liaisons, 13 actions au `--plan`, étapes du retrait renumérotées.
- **Total : 573 tests** + garde de publication. R2.0.21 en comptait 483 ; s'y ajoutent 33 `r222-records`, 22 `r222-api`, 13 `r222-deploy`, 13 `r222-display`, 8 `r222-wiring` et 1 `r222`.

## Build

- **Suite** : `npm test` → **573 tests** verts + `publication guard: 593 tracked files, none proprietary`. `npm run check` propre, `node tools/guard.mjs` vert.
- **Build public** (`node tools/build.mjs`) : code seul, identique à ce que construit la CI ; `records.js` rejoint `dist/js/` et le shell du service worker ; sans pack, les records restent inactifs (`recordsEnabled` exige le pack).
- **Standalone** (`node tools/build.mjs --standalone`) : `standalone/zuma-standalone.html`, **9 440 691 octets** (9,0 Mio ; 9 407 484 en R2.0.21). Seize modules concaténés (`records` après `progress`), insérés par des fonctions de remplacement, sans service worker ; `R2.0.22` y apparaît 10 fois. Verrous de fichier unique (`r215-presentation`, 15 tests) verts.
  - **Démarrage sur `file://`** (Chromium, 1 000 × 750 CSS, DPR 2) : écran principal, aucun moteur ; Aventure → écran d'aventure (kit 2 ×), plaque RECORDS sans libellé de portée (tableau local de démonstration) ; Jouer → 1-1 en jeu, 3 vies ; aucune clé `zuma.records.v1`, **aucune requête réseau**, **console propre**.
  - La preuve du plan 06.1-05 sur `file://` montre aussi le prénom du profil local à côté du meilleur temps (« (PRÉNOM) » sous RECORD).
- **Artefact privé** (`node tools/build.mjs --deploy`) : « artefact de déploiement : dist/ (**376 fichiers, 6.9 Mio**, empreinte du pack **1668c4fa9c7f**) — à héberger uniquement en privé ». `dist/version.json` : version 2.0.22, `assets` 350 ; `dist/js/records.js` présent. Le pack n'a pas changé depuis R2.0.21 : les ressources déjà en cache ne sont pas retéléchargées.
- **Preuves de bout en bout** (plan 06.1-05, Chromium DPR 2, hôte `zuma.test` mappé sur 127.0.0.1, worker généré sur `fakeScoresD1`, deux joueurs fictifs `example.org`) : STATS avec l'auteur du meilleur temps et « MOI » ; plaques « TOUS » / « MOI » sur l'écran d'aventure et l'écran de fin (ligne de la partie en surbrillance) ; hors ligne puis retour du réseau (un seul POST avec le score et le temps, file vidée) ; reprise D-08 (un POST au premier chargement, sans démonstration, puis GET seul) ; revue sans POST ; accueil non retardé par un `api/records` lent de 4 s. Sur cet hôte `http://`, Chromium sans interface n'offre pas de contexte sécurisé : la preuve hors ligne a tourné **sans service worker** (jeu gardé en mémoire) ; le jeu hors ligne avec le cache du worker est prouvé depuis la phase 5.
- **Répétition à blanc du déploiement** (`node tools/deploy.mjs --dry-run`, compte simulé dans l'état laissé par 05-16, aucun appel réseau) : Access relu sans changement ; « records : 22 niveaux » ; **18 écritures prévues** : base `zuma-assets` et table (1–2), 12 lots `INSERT OR IGNORE` pour 374 contenus (3–14), **base `zuma-scores`** (15), **lot de 2 `CREATE TABLE IF NOT EXISTS scores` + `times`** (16), **un PATCH avec `ASSETS_DB` et `SCORES_DB`** sur la production et l'aperçu (17), déploiement du worker de **79 148 octets** sur `main` (18 ; 69 587 en R2.0.21). Un second plan annonce « records : base « zuma-scores » présente ; tables : scores, times » et « actions prévues : 0 ». Le journal ne contient ni adresse, ni prénom, ni jeton, ni identifiant (vérifié par script).
- **Rien n'est déployé par cette version.** Le déploiement privé (`node tools/deploy.mjs --plan`, puis `node tools/deploy.mjs`, puis `node tools/deploy.mjs --verify`) est lancé par l'orchestrateur après l'accord de l'utilisateur ; au premier passage il crée `zuma-scores`, ses tables et la liaison `SCORES_DB`, puis redéploie le worker. Le standalone est livré comme à chaque version. `dist/`, `standalone/` et `private_assets/` restent hors de Git ; captures et journaux dans le dossier de travail de la session, jamais dans le dépôt.

## Hypothèses à confirmer en UAT

Elles sont listées pour la première session de la phase 6.1 (`06.1-UAT.md`).

- **Sixième ligne du STATS** : « MOI 1:23 » (colonne des libellés) et « (BRUNO) » (aligné à droite) partagent la même ligne ; on pourrait les lire comme un seul ensemble (« MOI 1:23 (BRUNO) ») alors que le prénom est celui de l'auteur du record commun de la ligne RECORD au-dessus.
- **Position des libellés « TOUS » / « MOI »** : sous le mot RECORDS (aventure : centre 548, ligne de base 58 ; fin : centre 320, ligne de base 162) ; lisibilité et découverte de la bascule (rien n'indique qu'on peut toucher la plaque).
- **Portée remise à « TOUS » à chaque lancement** (non mémorisée).
- **Meilleur temps par plateau** (identifiant `graphics`, 22 plateaux, comme le record local depuis R2.0.15) et non par étage-niveau : deux niveaux qui partagent un plateau partagent leur record.
- **Nom apposé à l'écriture** : un prénom changé dans `players` ne renomme pas les records déjà écrits ; un joueur retiré garde ses records sous son prénom.
- **Envoi en lot** (≤ 10 scores, ≤ 40 temps par requête) et **limite de débit** 20 POST / 60 s / identité par isolat : jamais atteinte en jeu normal.
- **Reprise D-08** : seuls les scores locaux inscrits sous le prénom du joueur courant partent ; les scores d'un ancien nom saisi à la main restent locaux.

Différé : rien de la phase ; la musique reste pour la phase 7.
