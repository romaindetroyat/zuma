# Zuma PWA

Reconstruction web/PWA d'un jeu de billes de type Zuma, développée à partir d'un audit comportemental et de tests de non-régression.

Baseline : **R2.0.21**.

## Contenu du dépôt

| Dossier | Rôle |
| --- | --- |
| `src/core.ts` | Moteur de simulation déterministe (chaînes, insertion à identifiants stables, destruction en 0,4 s, attraction accélérée, rebond au contact, recul ZUMA par chaîne, power-ups, multi-chaînes). |
| `src/feedback.ts` | Règles de présentation : sons déclenchés par événement, explosions, particules, trames de la pièce. |
| `src/levels.ts` | Niveaux procéduraux utilisés quand aucune ressource originale n'est fournie. |
| `src/original.ts` | Chargeur du pack de ressources privé (courbes, fonds, sprites, sons). |
| `src/render.ts` | Rendu canvas 640×480, HUD natif, pièce, messages et textes flottants en polices bitmap. |
| `src/bitmapfont.ts`, `src/statsdialog.ts`, `src/menudialog.ts` | Polices bitmap PopCap, composition de l'écran STATS natif et du menu de jeu (dialogue OPTIONS en jeu ou hors partie). |
| `src/progress.ts` | Règles pures de la progression : étages, temples, portes, textes du dieu, meilleurs scores, profil, sauvegarde de partie, machine d'états des écrans (accueil, aventure, niveau, temple, fin). |
| `src/welcome.ts` | Menu principal original (ciel, soleil, yeux, pierres, OVNI), dialogues de nom et de reprise. |
| `src/adventure.ts` | Écran d'aventure original (temples, portes, plaque des scores, arrivée d'un temple), dialogue du dieu, écran de fin. |
| `src/audio.ts` | Sons originaux si disponibles, synthèse WebAudio sinon. |
| `src/main.ts` | Boucle de jeu, écrans (exécution des effets de la machine d'états), entrées (souris, clavier, toucher), menu de jeu, carte d'installation, bandeau de mise à jour. |
| `src/pwa.ts` | Service worker (enregistrement, mise à jour confirmée), stockage hors ligne, consignes d'installation par plateforme, rotation et marges sûres. |
| `tools/` | Build (`build.mjs`, service worker généré par `swgen.mjs`, icônes PNG par `icons.mjs`), serveur local, garde-fou de publication, extraction et import des ressources originales, mesure de la difficulté (`sim-difficulty.mjs`), hébergement privé (`deploy.mjs`, `d1worker.mjs`). |
| `tests/` | Suite de non-régression (`node --test`). |

## Démarrage

```bash
npm install
npm test        # build + tests de non-régression + garde-fou de publication
npm run dev     # build local (avec ressources privées si présentes) puis http://localhost:8080
```

Commandes en jeu (R2.0.21) :

| Action | Commande |
| --- | --- |
| Viser | Souris n'importe où dans la fenêtre (marges et barre du haut comprises) |
| Tirer | Clic gauche, partout, y compris sur le cadre et la barre du haut |
| Échanger la bille | Clic droit ; au toucher, toucher la grenouille |
| Menu | Espace, Entrée ou Échap — le jeu est en pause tant qu'il est ouvert ; **Appui long sur MENU** (450 ms, souris, doigt ou stylet) : menu, sans tirer |
| Statistiques | Tab |
| Pause | P |
| Son | M |
| Tactile | Toucher pour viser et tirer, toucher la grenouille pour échanger ; toucher MENU / STATS dans la barre pour les ouvrir (un appui long sur MENU l'ouvre aussi) ; curseurs et cases du menu au doigt |

Dans l'original, Espace met le jeu en pause et l'échange au clic droit n'a pas été localisé (hypothèse C1) ; Entrée, Échap, Tab et P sont des ajouts. L'option de menu « Pixels nets » arrondit l'échelle à un **nombre entier de pixels d'appareil** par pixel du jeu (par exemple 1,5 × en pixels CSS sur un écran Retina, soit 3 pixels physiques), sans lissage, et désactive les copies 2 × (voir « Netteté ») ; sans elle le jeu remplit la fenêtre en 4:3. Le choix est persisté.

Revue : le paramètre d'URL `?level=1-3` ouvre directement un niveau (étage-niveau, ici le troisième niveau du premier étage), sans passer par l'accueil ; il est ignoré sans pack ou si le couple est hors limites. **Une revue n'écrit rien** : ni sauvegarde de partie, ni profil, ni meilleur score, ni meilleur temps. Pour tester la reprise ou la fin de l'aventure, passez par « Aventure » et « Continuer ». `?debug=1` expose `window.__zuma.game.debugState()` (moteur, niveau et état des écrans en lecture, pour les scripts de capture).

## Parcours de jeu

Depuis R2.0.21, le jeu suit le parcours de l'aventure de Zuma Deluxe, écran par écran, avec les graphismes du pack (repli vectoriel sans pack).

1. **Accueil** : le menu principal original (ciel qui défile, soleil, idole dont les yeux suivent la souris après un clic sur la grenouille). Aucun niveau ne démarre avant votre choix.
   - **Aventure** et **Options** sont actives. Gantelet, Plus de jeux et Quitter sont dessinées mais inactives.
   - **Options** ouvre le dialogue OPTIONS hors partie : volume, plein écran, pixels nets, Aide, « Terminé ».
   - Au premier lancement, le jeu **demande votre nom une seule fois** (« NOUVEL UTILISATEUR ») ; un clic sur la ligne « Bienvenue dans Zuma, <nom>! » permet de le changer. Sur la version hébergée, votre prénom est connu par votre adresse de connexion et le nom n'est pas demandé.
   - Clavier : Haut / Bas pour choisir, Entrée ou Espace pour valider.
2. **Écran d'aventure** : les quatre temples, les douze portes, la plaque RECORDS (trois meilleurs scores), le numéro d'étage.
   - Une porte ouverte se sélectionne d'un clic ; un second clic sur la porte sélectionnée, ou **Jouer**, lance son étage. **Menu principal** revient à l'accueil.
   - Clavier : Gauche / Droite parcourent les portes ouvertes, Entrée ou Espace = Jouer, Échap = Menu principal.
3. **Niveaux** : les niveaux d'un étage s'enchaînent directement. À la fin d'un étage, l'écran d'aventure revient avec la porte suivante sélectionnée. Après les étages 3, 6, 9 et 12, le **dieu** parle d'abord (une réponse de la grenouille pour continuer), puis l'écran d'aventure révèle le temple suivant (le dernier jaillit du sol).
4. **Fin** : après le dernier niveau (13-1), la partie s'arrête : STATS, dernier dialogue du dieu, puis l'écran de fin (« FÉLICITATIONS ! », score final, tableau des dix meilleurs scores avec la place de la partie). OK ramène à l'accueil. Le jeu ne recommence jamais au 1-1 de lui-même.

**Vies et game over.** Une vie perdue fait rejouer le même niveau, avec le score du début du niveau. À la dernière vie perdue, le score entre au tableau, puis l'écran d'aventure s'affiche.

**Reprise de partie.** La partie est sauvegardée au début de chaque niveau (étage, niveau, score, vies). MENU › « Retour au menu principal » (avec confirmation) mène à l'écran d'aventure sans perdre la partie. Au lancement suivant, « Aventure » propose **« Continuer »** (reprendre au début du niveau sauvegardé) ou **« Rejouer »** (effacer la sauvegarde et choisir une porte).

**Meilleurs scores.** Le tableau garde les **dix meilleurs scores** de l'aventure (nom du profil et score), avec trois valeurs de démonstration au départ. Il est **local à cet appareil et à ce navigateur** : il n'est pas synchronisé entre appareils, et effacer les données du site efface le profil, la sauvegarde et les scores. Clés `localStorage` : `zuma.profile.v1`, `zuma.save.v1`, `zuma.highscores.v1`.

Pas encore de musique sur ces écrans (phase 7).

## Ouvrir et installer Zuma

Le jeu complet (avec les ressources originales) se joue de deux façons :

- **le fichier unique** `standalone/zuma-standalone.html` (`npm run standalone`), maintenu et livré à chaque version, qui s'ouvre directement dans un navigateur, sans installation ni connexion ;
- **l'application installée** (PWA), qui se lance comme une app et fonctionne ensuite hors ligne. Elle s'installe depuis une page servie en `http://localhost` (usage local, ci-dessous) ou depuis l'hébergement privé.

Le standalone ouvert depuis le disque (`file://`) ne peut pas être installé : aucune consigne d'installation ne s'y affiche.

### Mac et PC

- **Chrome ou Edge** : le bouton **« Installer Zuma »** de la carte d'accueil (ou « Installer » dans la vue Aide du menu), ou l'icône d'installation de la barre d'adresse. L'app s'ouvre ensuite dans sa propre fenêtre.
- **Safari (macOS)** : menu **« Fichier › Ajouter au Dock »** ; la carte d'accueil le rappelle.

### Android

- Chrome : bouton **« Installer Zuma »**, ou « Ajouter à l'écran d'accueil » dans le menu du navigateur.

### iPhone et iPad

- Dans **Safari**, touchez **Partager** puis **« Sur l'écran d'accueil »** ; la carte d'accueil affiche cette consigne avec le pictogramme de partage.
- **Ouvrez l'app installée une première fois avec une connexion** : l'app de l'écran d'accueil a son propre stockage, séparé de Safari. C'est à ce premier lancement qu'elle met le jeu et les ressources en cache ; elle fonctionne ensuite hors ligne (mode avion compris).
- L'app s'ouvre en plein écran, en tenant compte de l'encoche et des bords arrondis.
- Sur iPhone, jouez en **paysage** : en portrait, « Tournez votre appareil » s'affiche et met la partie en pause. Sur iPad, le portrait fonctionne avec des bandes au-dessus et au-dessous du jeu.
- Les sons démarrent au premier toucher et suivent l'interrupteur silencieux.
- L'installation sur iPhone et iPad demande une adresse **HTTPS** : elle passe par l'hébergement privé (ci-dessous) ; un iPhone ne peut pas installer depuis `http://<adresse locale>`.

### Hors ligne

Après la première visite, le jeu (`zuma-shell-<build>`) et toutes les ressources (`zuma-assets-<empreinte>`) sont en cache : l'app démarre et se joue sans réseau. La place occupée est indiquée dans la vue Aide du menu (« hors ligne : 6,0 Mo » par exemple). Le navigateur peut effacer ce cache après une longue période sans utilisation ; les ressources sont alors retéléchargées à la visite suivante, avec une connexion.

### Mises à jour

Quand une nouvelle version est publiée, elle se télécharge en arrière-plan. Le bandeau **« Nouvelle version disponible »** propose **« Mettre à jour »** (rechargement sur la nouvelle version) ou « Plus tard ». Rien ne change sans ce clic. Les ressources ne sont pas retéléchargées si le pack n'a pas changé.

### En local

```bash
npm run import   # une fois, depuis votre copie du jeu (voir « Ressources originales »)
npm run dev      # build local avec les ressources puis http://localhost:8080/
```

`http://localhost:8080/` est un contexte sécurisé : sur cet ordinateur, on peut installer l'app depuis Chrome, Edge ou Safari comme ci-dessus. Le serveur peut ensuite être arrêté : l'app installée fonctionne hors ligne.

### Artefact privé

```bash
npm run deploy   # = node tools/build.mjs --deploy → dist/ avec le pack, dist/version.json
```

Cette commande produit le jeu complet, ressources originales comprises, dans `dist/`. Elle refuse de s'exécuter sans pack et journalise « à héberger uniquement en privé ». **Cet artefact ne doit jamais être publié ni commité** : `dist/` est ignoré par Git, la garde et la CI ne publient que le code. Son hébergement privé (accès réservé aux adresses autorisées) est décrit ci-dessous.

### Jeu hébergé en privé (Cloudflare Access)

**Principe.** Le jeu complet (artefact `npm run deploy`, ressources originales comprises) est servi par Cloudflare Pages à une adresse `https://<sous-domaine>.pages.dev`, derrière **Cloudflare Access** :

- seules les adresses e-mail autorisées passent : Access demande l'adresse et envoie un **code à usage unique** par e-mail ;
- la connexion dure **un mois par appareil**. Elle sert seulement à recevoir le jeu et ses mises à jour : **une fois installé, le jeu reste jouable sans limite de durée**, hors ligne, depuis le cache du service worker. Après un mois, il suffit de se reconnecter (nouveau code) pour recevoir les mises à jour ;
- seul le dossier `/public/` (manifeste, icônes, feuille de style : des fichiers déjà publics dans ce dépôt, aucune ressource originale) est lisible sans connexion, pour permettre l'installation ;
- rien n'est publié par le dépôt ni par la CI : le déploiement se lance à la main, depuis un poste qui possède le pack.

La liste d'accès doit rester restreinte : ouvrir le jeu au public reviendrait à distribuer les ressources de PopCap. Les adresses autorisées sont celles de `allow` et de `players` dans `private_assets/deploy.json` (voir « Ajouter un joueur »). La politique « Zuma — joueurs » sert au jeu seul : vos autres applications Access n'en dépendent pas.

#### Déployer

```bash
npm run deploy           # artefact : dist/ avec le pack (refusé sans pack)
npm run deploy:private   # Cloudflare : provisionnement (idempotent), envoi sur la production, vérification
node tools/deploy.mjs --dry-run   # répétition complète sur un compte simulé, sans réseau ni écriture
```

Le contenu de `dist/` est rangé dans une base D1 (`zuma-assets`) et servi par un worker Pages généré à chaque déploiement, qui vérifie la connexion Access de chaque requête (sauf `/public/`). Le déploiement fonctionne donc aussi depuis la session cloud ; `--direct` garde l'ancien envoi direct de Pages (depuis le Mac).

- **Configuration privée** `private_assets/deploy.json` (dossier ignoré par Git) :

  ```json
  {
    "project": "zuma",
    "allow": ["vous@example.org"],
    "players": { "vous@example.org": "Prénom", "joueur@example.org": "Prénom" },
    "pinIdpApps": ["…"]
  }
  ```

  `players` associe chaque adresse à un prénom (lettres, espaces, apostrophes ou traits d'union, 20 caractères au plus). Toute adresse de `players` est aussi autorisée ; `allow` peut donc se limiter aux adresses sans prénom.

  `pinIdpApps` liste les applications Access déjà présentes sur le compte. Avant d'ajouter la connexion par code, le script leur impose leur fournisseur actuel, pour qu'elles gardent exactement leur mode de connexion. Il refuse de continuer si une application existante sans fournisseur imposé n'est pas listée.
- **Jeton** : sur le Mac ou le PC, créez un jeton dans le tableau de bord Cloudflare, « Mon profil › Jetons d'API ». Permissions du compte : *Cloudflare Pages : Edit*, *D1 : Edit*, *Access: Apps and Policies : Edit*, *Access: Organizations, Identity Providers, and Groups : Edit*, *Account Settings : Read*. Saisissez-le sans le laisser dans l'historique :

  ```bash
  read -s CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
  npm run deploy:private
  ```

  Avec plusieurs comptes, ajoutez `CLOUDFLARE_ACCOUNT_ID`. Dans la session cloud, le jeton est fourni par l'environnement ; il suffit pour tout le déploiement par D1. Seul `--direct` doit être lancé depuis le Mac : le proxy de la session remplace l'autorisation d'envoi de Pages.
- **Garanties** :
  - le déploiement va toujours sur la production, jamais sur un aperçu ;
  - les applications Access sont créées et relues avant l'envoi du moindre fichier ;
  - un objet existant différent de l'attendu est signalé et jamais réécrit ;
  - le journal ne contient ni jeton, ni identifiant de compte, ni adresse.
- **`node tools/deploy.mjs --plan`** affiche les actions prévues sans rien écrire (« actions prévues : 0 » une fois tout en place).
- **`node tools/deploy.mjs --verify`** vérifie la configuration par l'API puis teste les adresses. Codes de sortie :
  - 0 : tout est protégé ;
  - 1 : une ressource est servie sans connexion, à corriger immédiatement ;
  - 2 : les adresses sont injoignables depuis ce poste ; vérifiez alors dans une fenêtre de navigation privée.

#### Ajouter un joueur

Sur la version hébergée, le jeu connaît le prénom du joueur par son adresse de connexion : le worker répond à `api/me` par `{ "name": "<prénom>" }` pour l'adresse authentifiée par Access, et rien (404) pour une adresse sans prénom. Le jeu utilise ce prénom pour l'accueil et les meilleurs scores, sans demander de nom. Un nom saisi à la main sur un appareil n'est jamais remplacé. Le worker ne contient que les empreintes SHA-256 des adresses, jamais les adresses elles-mêmes. Le standalone et l'usage local gardent la saisie du nom.

1. Dans `private_assets/deploy.json`, ajoutez une ligne `"adresse": "Prénom"` dans `players`, par exemple `"joueur@example.org": "Prénom"`. L'adresse est alors autorisée, sans autre liste à tenir.
2. Ajoutez la même adresse à la politique Access existante : Zero Trust › Access › Policies › « Zuma — joueurs » › règle e-mail. Le script ne réécrit jamais un objet existant : sans cette étape, il signale un conflit et s'arrête sans rien modifier.
3. `node tools/deploy.mjs --plan` : aucun conflit ne doit être signalé.
4. `npm run deploy:private` : le worker est régénéré avec le nouveau prénom, puis vérifié.

#### Installer le jeu depuis l'adresse privée

0. **Vérifier que le site n'est pas public** : dans une fenêtre de navigation privée, ouvrez l'adresse du jeu. Une page Cloudflare Access doit demander une adresse e-mail, sans afficher le jeu. Faites de même avec l'adresse propre au déploiement (`https://<identifiant>.<sous-domaine>.pages.dev`). En revanche, `<adresse>/public/manifest.webmanifest` affiche un petit fichier JSON : c'est voulu, il ne contient aucune ressource du jeu.
1. **Mac, Chrome** :
   1. Ouvrez l'adresse, saisissez votre adresse e-mail, puis « Envoyer le code ». Recopiez le code reçu par e-mail.
   2. Le jeu démarre ; MENU › Aide indique « ressources originales ».
   3. Cliquez « Installer Zuma » (ou l'icône d'installation de la barre d'adresse) : l'app s'ouvre dans sa fenêtre.
   4. Jouez une minute, jusqu'à ce que l'Aide affiche « hors ligne : … Mo ».
   5. Quittez l'app, coupez le Wi-Fi, puis relancez-la : le jeu démarre et se joue avec les sons.
2. **Mac, Safari** : ouvrez l'adresse, connectez-vous avec le code, puis « Fichier › Ajouter au Dock ». Ouvrez Zuma depuis le Dock : le code peut être redemandé une fois, car l'app a ses propres données. Faites ensuite le même essai hors ligne.
3. **PC, Chrome ou Edge** : mêmes étapes que Chrome sur Mac (Edge : menu « … › Applications › Installer Zuma »).
4. **iPhone, Safari** :
   1. Ouvrez l'adresse, saisissez votre adresse e-mail, puis « Envoyer le code ».
   2. **Lisez le code sur un autre appareil, ou dans la notification de l'e-mail, sans quitter Safari**, puis saisissez-le.
   3. Le jeu s'affiche : touchez Partager › **« Sur l'écran d'accueil »** › « Ajouter ».
   4. Ouvrez Zuma depuis l'écran d'accueil. **À cette première ouverture, le code peut être redemandé une fois** : l'app de l'écran d'accueil ne partage pas la connexion de Safari. Saisissez-le, de préférence en le lisant sur un autre appareil.
   5. Tournez l'iPhone en paysage, jouez un niveau et attendez « hors ligne : … Mo » dans MENU › Aide.
   6. Fermez l'app, activez le mode Avion, puis rouvrez Zuma : le jeu démarre, et les sons fonctionnent après le premier toucher.
   7. Désactivez le mode Avion et rouvrez l'app : le code ne doit pas être redemandé.
5. **iPad, Safari** : mêmes étapes que l'iPhone. Le portrait fonctionne aussi, avec des bandes au-dessus et au-dessous du jeu.

Si la page du code revient sans fin, ou si elle s'ouvre dans Safari pendant que l'app reste blanche, notez-le : c'est une limite connue d'iOS avec les apps de l'écran d'accueil. Une variante qui protège seulement les ressources est alors prévue.

#### Retirer l'hébergement

`node tools/deploy.mjs --rollback-plan` affiche les étapes de retrait sans rien exécuter : **rien n'est supprimé automatiquement**. L'ordre compte : supprimer d'abord le projet Pages, pour que le jeu ne soit jamais servi sans protection, puis les applications Access. Depuis le tableau de bord :

1. Workers & Pages › zuma › Settings › Delete project ;
2. Zero Trust › Access › Applications › Zuma › Delete, puis « Zuma — fichiers publics » ;
3. les politiques « Zuma — joueurs » et « Zuma — fichiers publics », si plus aucune application ne les utilise ;
4. la méthode « One-time PIN » peut rester. Si vous la retirez, vos autres applications peuvent ensuite retrouver leur réglage de fournisseur d'origine (liste vide).

## Ressources originales (optionnelles, jamais publiées)

Le dépôt public ne distribue aucun média, son, police, exécutable ni pack extrait du jeu original. Pour un build local fidèle, fournissez une copie légalement obtenue :

```bash
python3 tools/extract_installer.py ZumaSetup.exe private_assets/original   # ou copiez le dossier d'installation
npm run import                                                            # → private_assets/pack
npm run dev                                                               # niveaux, fonds, sprites et sons originaux
npm run standalone                                                        # standalone/zuma-standalone.html (fichier unique)
```

`private_assets/`, `dist/`, `.compiled/` et `standalone/` sont ignorés par Git et `npm run guard` refuse tout fichier propriétaire suivi.

L'import décode les fichiers de courbes (`CURV` : points de contrôle puis polyligne échantillonnée au pixel, chaque point portant un octet de tunnel et un octet de priorité de dessin — voir « Tunnels et calques »), `levels.xml` (positions de la grenouille, découpes, réglages de difficulté, progression par temples) et renomme les sons selon les clés de `feedback.ts`.

### Réglages originaux (`levels.xml` → `configFromSettings`)

Chaque niveau du pack porte des attributs de difficulté ; `src/main.ts` (`configFromSettings`) les traduit en `EngineConfig`. Leur sémantique n'est documentée nulle part dans les données : depuis R2.0.16 elle est établie par analyse statique de l'exécutable original (`.planning/phases/05-regles-originales-completes/05-RESEARCH.md` : le jeu se simule à 100 Hz, une mise à jour « maj » = 10 ms ; conversions `ticks = maj × 0,6`, `px/s = px/maj × 100`). Le tableau distingue ce qui est vérifié par cette analyse de ce qui reste une hypothèse (références A1–A7 dans `.planning/codebase/CONCERNS.md`).

| Réglage | Valeurs observées | Interprétation retenue | Statut |
| --- | --- | --- | --- |
| `score` | 1000 → 5000 (10000 en Gauntlet) | Points à marquer dans le niveau pour remplir la jauge orange et passer en mode ZUMA (`target`). Sert aussi à la valeur des pièces (`coinPoints`) et au temps d'expert par défaut (`defaultParTime`). | vérifié par analyse statique |
| `repeat` | 40–50 (42 → 50 sur les plateaux doubles) | Probabilité `(repeat + 1) / 100` qu'une nouvelle bille répète la couleur de la précédente (`repeatChance`) ; `lvl11` / `lvl12` portent l'attribut en double (40 puis 50), le dernier gagne → 0,51 au 1-1. | vérifié ; valeur 50 au 1-1 = hypothèse A1 |
| `single` | 7–9, niveaux avancés seulement | Seuil de **réparation des billes isolées** (`singleLimit`, 0..10) : quand le tirage `repeat` échoue et que le groupe d'entrée est une bille seule, la nouvelle bille copie sa couleur si `single = 0` ou si les dix derniers groupes comptent au plus `single` billes isolées ; 10 = désactivé (tout le temple 1). Ce n'est pas une probabilité. | vérifié |
| `start` | 35 → 45 | Pourcentage de la longueur de la courbe (`startFraction`) rempli par l'arrivée rapide : la chaîne arrive à la vitesse calculée par la formule originale (`feedSpeed`, 1 520 px/s sur la spirale) puis décélère à 1 000 px/s² ; « PARTEZ » quand toutes les chaînes sont à `speed` + 10 px/s (au plus tard après 5 s). | vérifié ; appel unique de la formule = hypothèse A2 |
| `speed` | 0,5 → 0,6 (px par maj) | Vitesse de croisière de la chaîne, ×100 → px/s (50 px/s au 1-1). Le pousseur y converge par une rampe de +50 px/s² / −1 000 px/s². Depuis R2.0.21, il s'arrête 40 maj (24 ticks) quand **la bille la plus en arrière est retirée** à la fin de sa destruction, jamais à une insertion, puis repart de 0 (voir « Difficulté »). | vérifié (R2.0.21, 0x423a10) |
| `slowfactor`, `slowspeed` | 4 par défaut (3,5 → 1 sur les niveaux avancés) ; `slowspeed` → `slowfactor = speed / slowspeed` | **Zone lente de fin de piste** (`endSlowFactor`) : sur les `slowdistance` px qui précèdent la ligne de danger, la vitesse cible descend linéairement de `speed` à `speed / slowfactor`, puis y reste jusqu'au crâne. Ce **n'est pas** le facteur de la balle RALENTIR (`slowFactor` du moteur, toujours 4). | vérifié |
| `danger`, `slowdistance` | jamais définis (défauts 600 / 500 px) | Ligne de danger à 600 px du crâne (`dangerDistance`) : départ de l'alerte, du couvercle du crâne et fin de la zone lente ; zone lente de 500 px avant la ligne (`slowDistance`). | vérifié |
| `firespeed` | 6 (px par maj) | Vitesse du projectile, ×100/60 → px par tick. | vérifié |
| `powerfreq` | 3000 (maj) | Intervalle moyen entre deux power-ups ; garde = 30 % de la valeur, puis tirage par tick. | hypothèse ; le modèle original (un tirage `1 / powerfreq` par maj et par type, plusieurs power-ups simultanés, 1 s d'attente, 20 s de vie) est lu par le spike 04 mais pas implémenté |
| `partime` | 25 → 240 (s) | Temps d'expert en secondes : affiché en OBJECTIF ; bonus ACE TIME `100 × (1 + ⌊250 × (1 − t / partime)⌋)` (t = secondes entières, 0 si t > partime : 1-1 en 24 s → 1 100, en 20 s → 5 100), compté dans l'écran STATS. Absent → `defaultParTime` = `⌈score × 35 / 1000⌉₅` (× 0,95 × courbes si plusieurs). | vérifié (unité, formule) ; `defaultParTime` = hypothèse A7 |
| `zumaslow`, `zumaback` | 500 / 200 (`lvl35`) ; défauts 1100 / 300 maj | Au passage en mode ZUMA, **chaque chaîne dont la tête couvre plus de 50 % de sa piste** recule pendant `zumaback` maj et ralentit (vitesse cible × 0,25) pendant `zumaslow` maj (× 0,6 → `zumaBackTicks` 180, `zumaSlowTicks` 660 par défaut) ; les autres chaînes continuent. Le recul part de la **tête**, à **100 px/s** constants (300 px au plus), et pousse les billes derrière elle : les brèches se referment par l'avant ; tout s'arrête quand la tête passe à moins de **50 px** de l'entrée ; les billes qui repassent l'entrée (position < 1 px) sont **perdues** (`ball-exit`, sans points). | vérifié (R2.0.19, spike 04 : 0x40a980, 0x40ab60, 0x423b60, 0x423c73) ; l'hypothèse « toutes les chaînes » est levée |
| `colors` | 4 (1-1 à 1-3 seulement) | Nombre de couleurs, borné 3..6 ; sinon déduit du temple (4 pour les temples 1–3, 5 pour 4–6, 6 ensuite). | vérifié (`Rand() % colors`) ; déduction par temple = hypothèse, verrouillée par test |
| `treasurefreq` | jamais défini (défaut 300) | Probabilité `1 / treasurefreq` par maj d'une tentative d'apparition de pièce (≈ 1/180 par tick, `coinChance`), 13 s après l'apparition précédente ; voir « Pièces et fin de niveau ». | vérifié (R2.0.18) |
| `mergespeed`, `reloaddelay`, `maxspeed`, `accrate` | — | Non interprétés ; `mergespeed` a seulement inspiré `mergeTicks` ; `maxspeed` / `accrate` sont inopérants sans `accrate` dans `levels.xml`. | à confirmer |

### Difficulté

Depuis R2.0.21, l'arrêt du pousseur suit la règle originale (0x423a10, stop 0x423ac7–0x423ad6). Le pousseur s'arrête 40 maj (24 ticks) et repart de 0 à 50 px/s² **seulement quand la bille la plus en arrière** (celle qu'il pousse) quitte la chaîne à la fin de sa destruction, bombes comprises. **Une insertion ne l'arrête jamais.** Jusqu'en R2.0.20, chaque tir dans le segment arrière l'arrêtait, à la suite d'une erreur de lecture des recherches 01 et 04 : le jeu freinait presque à chaque tir et paraissait plus facile que l'original. L'original n'a **aucune accélération par étage ou par temple** en aventure (0x418780) : toute la progression est dans `levels.xml` (`speed`, `start`, `score`, `slowfactor`…), appliqué tel quel. Le nombre de couleurs (`colors`) n'a pas changé (question ouverte).

La difficulté se mesure sans navigateur, avec un robot de tir déterministe :

```bash
npm test                                   # compile .compiled/ (ou node tools/build.mjs)
node tools/sim-difficulty.mjs --levels=1-1,2-3 --compare
node tools/sim-difficulty.mjs [--levels=1-1,2-3] [--seeds=6] [--horizon=240] [--shot=40] [--miss=0.4] [--compare] [--pack=<dossier>|none]
```

- Pour chaque niveau : part du temps où la chaîne est à l'arrêt, vitesse moyenne rapportée à la vitesse nominale, arrêts par partie, issue (ZUMA, gagné, perdu) sur `--seeds` parties.
- `--compare` ajoute l'ancienne règle (arrêt à chaque insertion) pour comparer avant / après.
- Avec le pack, les niveaux se notent `S-L` (par défaut le premier niveau de chaque étage). Sans pack (ou `--pack=none`), l'outil prend les niveaux procéduraux, notés `P1`, `P2`…
- Le robot ne mesure que des effets relatifs : un joueur réel tire autrement. Les chiffres de R2.0.21 sont dans `R221_RELEASE_NOTES.md`.

### Tunnels et calques

Chaque point d'une courbe originale (`CURV`, chargeur 0x4178c0) porte deux octets, décodés depuis R2.0.18 selon le troisième spike (`05-RESEARCH-03.md`) :

- **octet A = tunnel** (bit 0 des `flags` du pack, `Track.tunnelAt`) : segment injouable — un projectile **traverse** une bille en tunnel sans la toucher (0x408f52) et la recherche du point de courbe le plus proche l'ignore (0x414d6e) ;
- **octet B = priorité de dessin 0..3** (bits 1–2, `Track.priorityAt`) ; la priorité d'une bille est le maximum des priorités à ses deux bords (± 16 px, 0x405c10).

Le plateau se dessine en **cinq passes** `L = 0..4` (0x40c470) : découpes du décor de priorité `L`, étincelles de ce calque, puis billes de priorité `L`. Toutes les découpes du pack ont la priorité 1 : les billes de priorité 0 passent **sous** les découpes, celles de priorité ≥ 1 **par-dessus**. Aucune bille n'est jamais omise (jusqu'en R2.0.17, 64 % des billes du 2-2 disparaissaient). Les découpes sont des pochoirs du fond (masques `_<nom>.gif`, hypothèse C2).

Un pack importé avant R2.0.18 garde l'ancien décodage (octets décalés d'un point) et n'a pas les images du menu de jeu : relancer `npm run import`.

### Pièces et fin de niveau

Depuis R2.0.16, les montants et les cadences de la fin de niveau sont ceux lus dans l'exécutable original, depuis R2.0.18 la cadence des pièces aussi, et depuis R2.0.19 leur prise (36 px, tir consommé) ; ce qui est marqué *hypothèse* reste à confirmer en jeu (voir `.planning/codebase/CONCERNS.md`).

- **Pièces** (`TreasurePoint` de `levels.xml` : `x`, `y`, courbe, `dist1`|`dist2` ; objet « pièces » 0x417580) : une seule pièce à la fois, **visible 10 s** (600 ticks). Première tentative 3 s après le début du niveau, puis au plus tôt **13 s après l'apparition précédente** (qu'elle ait été ramassée ou non) ; à partir de là une chance sur 180 par tick (`1 / treasurefreq` par maj), soit **≈ 16 s en moyenne** entre deux apparitions. **Aucune pièce une fois la jauge ZUMA pleine.** Le point est tiré au hasard (jusqu'à `2 × n` tirages) parmi ceux dont la tête de chaîne de la courbe a dépassé **`dist` % de la piste** (`dist = 0` = toujours libre ; ce n'est pas un dégagement en px). Rendu : `COIN.gif` (30 trames, 20 trames/s) avec le scintillement `sparkle.gif` périodique. Un projectile dont le centre passe à moins de **36 px** du centre de la pièce (16 + 20, 0x4233b6) la ramasse : **`max(500, 100 × ⌊score / 600⌋)` points** (500 au temple 1, vérifié), texte flottant « +500 », compteur PIÈCES des STATS, **la série (ENCH.) est conservée** et **le tir est consommé** comme dans l'original (0x4236a9 : ni insertion ni tir raté). C'est contraire au souvenir de l'utilisateur en UAT 7 (D-31) ; `coinConsumesShot: false` rétablit le tir qui poursuit sa course (comportement R2.0.18). La pièce est testée avant la chaîne ; la plupart des pièces du pack sont placées sans piste derrière elles sur la ligne de tir. Sons : `jewelappear` à l'apparition (**gain 0,40**, comme dans `resources.xml`), `gemvanishes` à la disparition, tous deux **panoramiques** selon la position de la pièce (`(x − 320) / 320 × 0,3`, unité : hypothèse C3), `coingrab` au ramassage.
- **Décompte de fin de niveau** : quand la dernière bille explose en mode ZUMA, le tir est bloqué, **10 000 points par courbe** sont crédités (*hypothèse A3*), et **un marqueur par chaîne** part de la dernière destruction de sa chaîne (à défaut, du début de sa piste) vers son crâne par pas de **60 px toutes les 4 maj** (2,4 ticks), le premier 20 maj après le vidage ; **tous les marqueurs avancent en même temps** et chaque pas rapporte **+100** par marqueur avec un texte flottant jaune « +100 » et cinq étincelles sur la piste, le son `endoflevelpop1` (gain 0,5, hauteur fixe) joue toutes les 10 maj (pops partagés). 50 maj après le dernier pas du marqueur le plus long : `chant5` et l'écran STATS s'ouvre immédiatement, où le bonus ACE TIME (voir `partime`) est compté. Le décompte **simultané** sur plusieurs chaînes est une **déviation volontaire** (D-30, demandée en UAT) : l'original décompte courbe par courbe, avec 50 maj entre deux courbes.
- **Chronomètre** : TEMPS, OBJECTIF et le bonus ACE TIME se mesurent depuis « PARTEZ », pas depuis le chargement du niveau.
- **Début de niveau** : « Attention » (`GET_READY`, police `NativeAlienExtended18` avec le pack) pendant l'arrivée rapide de la chaîne, puis « PARTEZ » (`GO`) quand la vitesse de croisière est atteinte (≈ 1,5 s sur la spirale) ; `chant1` au début.
- **Fin de piste** : l'alerte `warning1` commence 600 px avant le crâne avec un intervalle qui passe de 4,1 s à 0,6 s sans monter en volume ; le couvercle du crâne s'ouvre sur la même distance ; la chaîne ralentit jusqu'à `speed / slowfactor` (voir le tableau). Le roulement (`rolling`) joue à volume constant (gain 0,35, montée 50 ms) dès que la chaîne bouge et s'éteint par un fondu linéaire de 500 ms (l'original : ≈ 0,5 s) ; il est coupé en pause, sous le menu et le STATS. L'atteinte de la jauge affiche « ZUMA ! » en police titre pendant 2 s avec la jauge qui pulse.

### Vies

Comme dans l'original (`AddScore` 0x417380), **une grenouille supplémentaire tous les 50 000 points** (chaîne du pack `GET_AN_EXTRA_FROG`) : une vie par multiple de 50 000 franchi, plusieurs d'un coup si besoin, **sans plafond**, y compris pendant le compte à rebours du bonus dans l'écran STATS. Le son `extralife` est joué **trois fois** (0, 0,3 et 0,6 s) ; aucun texte n'apparaît en jeu (comme l'original) ; les grenouilles de la barre **clignotent 1,5 s**.

Une partie compte **trois grenouilles**, celle en jeu comprise (0x428383 : chaque perte retire une vie, la partie est perdue quand le compteur arrive à 0 ; R2.0.18 en donnait quatre). La barre du haut montre la **réserve = vies − 1** dans l'ovale vert de gauche (0x40fa90) : jusqu'à **trois icônes** à leur taille d'origine, au-delà **une icône suivie de « xN »** en jaune (police CancunFloat14). Pendant la perte d'une vie, la grenouille en jeu est comptée avec la réserve. « Perdu… » s'affiche une fois par perte.

La barre suit la disposition de l'original : vies à gauche, niveau jaune centré dans l'ovale rouge de gauche, score dans l'ovale noir, jauge dans l'ovale rouge de droite, bouton MENU (image du pack) dans l'ovale vert de droite.

### Chaîne : comblement et rebond

Depuis R2.0.19, la cinématique de la chaîne est celle lue dans l'exécutable par le quatrième spike (`05-RESEARCH-04.md`, 0x423a10, 0x421800, 0x40ab60) :

- une bille détruite reste **0,4 s** (40 maj, 24 ticks) et rien ne bouge autour de la brèche pendant ce temps ; **aucun recul au moment de l'alignement** ;
- à la fin de la destruction, si les deux bords de la brèche ont **la même couleur**, le segment avant est **attiré** vers l'arrière par un compteur `v = 10` : ⌊v / 8⌋ px par maj, puis `v + 1`, **sans plafond** (≈ 100 px/s au départ, +100 px/s toutes les 80 ms) — une brèche d'une bille se referme en 0,18 s, de trois billes en 0,34 s ; une bille tirée sans alignement contre une brèche de sa couleur l'attire aussi (`v = 1`) ;
- au **contact**, toute la chaîne **rebondit** pendant 0,3 s : 50 px/s (15 px) sans alignement, 150 × profondeur px/s (45 px pour une réaction en chaîne de profondeur 1) quand le contact détruit ; le pousseur est arrêté pendant le rebond et 0,2 s après, puis repart de 0 ;
- sons : `ballclick2` à l'impact d'un tir sur la chaîne, `ballclick1` à 0,8 au contact (au plus un toutes les 250 ms) ; aucun son quand une bille devient power-up (seulement à l'activation).

Un pack importé avant R2.0.19 garde les deux clics inversés : relancer `npm run import`.

### Menu de jeu

Espace, Entrée ou Échap ouvrent le menu de jeu, **composé comme les dialogues du jeu original** : l'original n'a pas de dialogue MENU distinct, c'est son dialogue OPTIONS construit en mode « en jeu » (0x445310). Le jeu est **en pause** dessous.

- Titre « MENU » ; curseurs « Musique » (grisé : pas de musique avant les phases 6–7) et « Sons » (volume général, persisté) ; cases « Plein écran » et « Pixels nets » ; « Aide » (commandes, astuces du pack, version) ; « Retour au menu principal » (confirmation « Quitter la partie ? » puis **écran d'aventure**, partie sauvegardée au début du niveau ; voir « Parcours de jeu ») ; « Retour à la partie ».
- Avec le pack : cadre `dialogbox`, tête de divinité, boutons `DialogButton`, curseurs `slidertrack` / `sliderthumb`, cases `checkbutton` et polices bitmap, composés sur un canvas à l'échelle réelle de l'écran (copies 2 × EPX au-delà de 1,5 ×) ; sans pack, même disposition en dessin vectoriel. Plus aucun panneau HTML.
- Souris : survol, pression, glissement du curseur ; clavier : Haut / Bas pour se déplacer, Gauche / Droite pour le volume, Entrée ou Espace pour valider, Échap pour revenir ou fermer.

### Score (règles originales)

Depuis R2.0.17, le score d'un match est celui lu dans l'exécutable original par le second spike (`05-RESEARCH-02.md`, fonctions 0x420b80, 0x421240, 0x421cac, 0x40a810). Les montants sont implémentés dans `src/core.ts` (`gapBonusPoints`, `destroyRun`, `settle`) et les textes dans `src/main.ts` ; ce qui est marqué *hypothèse Bn* reste à confirmer au ressenti (`.planning/codebase/CONCERNS.md`).

| Règle | Formule / valeur | Texte affiché | Statut |
| --- | --- | --- | --- |
| Match | `10 × n` points pour `n` billes détruites, sans prime au-delà de trois | « +N » dans la couleur de la bille (montant total du match, saut et enchaînement compris) | vérifié par analyse statique ; couleur = celle de la bille rendue (table originale non extraite : hypothèse) |
| Combo (réaction en chaîne) | `+100 × combo`, `combo` = profondeur de la réaction (0 pour le tir direct) ; une ligne COMBOS par match avec combo > 0 | « COMBO x{combo + 1} » | vérifié |
| Enchaînement (tirs réussis consécutifs) | `(chain + 5) × 10` à partir du 5ᵉ tir réussi de suite (100, 110, 120…), pour un match direct seulement ; remis à zéro par tout tir sans match | « ENCHAÎNEMENT x{chain} », son `chain1` à `chain − 5` demi-tons | vérifié ; une bille posée contre sa couleur n'entretient pas l'enchaînement (raffinement original non implémenté : hypothèse) |
| Bonus de saut | calculé à l'insertion d'après la largeur libre `w` de la brèche **la plus étroite** traversée : `max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀)` — 500 / 440 / 350 / 270 / 190 / 100 / 10 points pour `w` ≤ 64 / 100 / 150 / 200 / 250 / 300 / ≥ 364 px — **× le nombre de brèches** (double, triple) ; armé sur la bille et **payé seulement par le match qui la détruit** ; une bille posée contre sa couleur garde son bonus pour un match ultérieur, toute autre bille le perd ; une ligne SAUTS par match | « BONUS SAUT / BONUS DOUBLE SAUT / BONUS TRIPLE SAUT » sans montant, `gapbonus1` à 0 / 150 / 300 ms (+0 / +2 / +3 demi-tons) | vérifié (formule, moment du paiement, sons) ; unité de `w` en px de piste = hypothèse B1 |
| Pièce | `max(500, 100 × ⌊score / 600⌋)` (rappel, R2.0.16) | « +500 » | vérifié |
| Bonus de niveau | 10 000 par courbe à la dernière bille, puis +100 par pas du décompte (rappel) | « +100 » | hypothèse A3 (montant) |
| ACE TIME | `100 × (1 + ⌊250 × (1 − t / partime)⌋)` (rappel), compté dans l'écran STATS | BONUS « +N » | vérifié |

Les sons de match (`BALLDESTROYED1..5` selon le combo, `chime1` à `2 × combo` demi-tons et volume `0,4 + 0,2 × combo`) jouent aussi quand le groupe a déclenché un power-up (l'original les coupe : hypothèse B4).

### Écran STATS d'origine

Avec le pack, l'écran STATS est **composé à l'exécution** (`src/statsdialog.ts`) à partir des briques du jeu original, dans un canvas enfant de `.zuma-stats` (`<canvas class="stats-picture">`) dimensionné à l'échelle réelle du canvas de jeu (la feuille de style ne référence aucune image) :

- `images/dialogbox.jpg` + `_dialogbox.gif` : cadre dessiné en 9 tranches (coins non étirés, bords étirés dans une dimension, centre étiré) sur le rectangle mesuré de la référence R2.0.12 (x 109–531, y 91–446) ;
- `images/GodHead.gif` + masque : tête de divinité centrée, chevauchant le bord supérieur ;
- `images/DialogButton.jpg` + `_Dialogbutton.gif` : bouton OK, trois états peints (normal / survol / pressé) suivis par le contrôle transparent `#result-continue` ; son `button1` au clic. Depuis R2.0.20, c'est le **bouton de pied du `Dialog` original** (`Dialog::Resize` 0x4ac160) : pleine largeur intérieure, collé au bord bas intérieur, hauteur 48 (rectangle 138, 373, 364 × 48), dessiné en trois tranches comme les boutons du menu ;
- polices bitmap PopCap lues depuis leurs scripts `fonts/*.txt` (`src/bitmapfont.ts`) : titre en `NativeAlienExtended18` multiplié par l'or `#f0c040` de l'original, libellés et valeurs en `Cancun12` teinté aux couleurs lues dans l'exécutable (libellés jaunes, valeurs crème, TEMPS `#ffff00`, OBJECTIF `#ffa500`, BONUS `#2aff03`, « PAS DE BONUS » `#9dcba2`, RECORD or), astuce en `Arial12Bold` ; l'interligne vaut 1,65 × la hauteur de capitale mesurée sur la police (18 px avec `Cancun12`) ; les deux colonnes partagent la **même grille** (TEMPS sur la ligne POINTS, OBJECTIF sur COMBOS, filet dans la ligne PIÈCES, BONUS sur SAUTS, RECORD sur ENCH. MAX.), les libellés droits sont 200 px à droite des libellés gauches comme dans la fonction de dessin originale, les valeurs sont alignées à droite dans leur colonne ; le signe « + » du bonus est normalisé à l'opacité des chiffres (le masque original du « + » est plus pâle) ; l'astuce est alignée à gauche après « ASTUCE : » sur deux lignes quand elle y tient ; sinon, depuis R2.0.20, elle continue sous l'étiquette sur trois lignes, toujours en `Arial12Bold` et toujours complète (aucune des sept astuces du pack ne tient sur deux lignes de cette police dans le cadre ; police réduite puis points de suspension seulement au-delà de trois lignes) ;
- libellés et astuces = chaînes originales de `properties/default.xml` (`pack/strings.json` : STATS, POINTS, COMBOS, COINS, GAPS, MAX_CHAIN, MAX_COMBO, YOUR_TIME, ACE_TIME, BONUS, BEST_TIME, NO_TIME_BONUS, TIP, OK et les sept astuces).

Colonne gauche : POINTS (score du niveau), COMBOS, PIÈCES (pièces touchées), SAUTS, ENCH. MAX., COMBO MAX. Colonne droite : TEMPS (durée du niveau depuis « PARTEZ »), OBJECTIF (`partime` ou temps d'expert par défaut), BONUS (bonus ACE TIME, sinon « PAS DE BONUS » à la place du libellé), RECORD = **meilleur temps du niveau**, persisté dans `localStorage` sous `zuma.best.<id>` (id du niveau du pack ou `proc-N`), mis à jour sur victoire et affiché dès la première partie (alors égal au temps courant). TEMPS, OBJECTIF et RECORD passent par un seul formateur (« N s » sous la minute, « m:ss » au-delà). Les dix valeurs se révèlent ligne par ligne (90 ms, son `pop`). **Compte à rebours du BONUS** : comme dans l'original, le bonus n'est pas dans le score à l'ouverture ; une seconde après, BONUS monte par pas toutes les 100 ms avec un `endoflevelpop1` dont la hauteur monte (hypothèse A5), POINTS et le score du HUD suivent. Le pas vaut 100 jusqu'à 2 000 points, sinon le multiple de 100 ≥ total / 20 (**20 pas au plus, ≈ 2 s**) ; un clic sur le dialogue (hors OK) passe à 2 500 par pas et OK crédite d'un coup ce qui reste. C'est une **déviation documentée** : l'original compte toujours +100 toutes les 10 maj sans accélération en aventure (D-21, demandée en UAT). Chaque état (ligne révélée, pas du compte à rebours, survol, pressé) recompose le canvas directement (≈ 1–2 ms), sans PNG intermédiaire.

Sans pack (ou tant que les polices ne sont pas chargées), l'écran STATS reste le panneau vectoriel (même structure, mêmes valeurs, mêmes identifiants).

### Netteté

Le jeu est simulé et dessiné en 640×480 logiques ; le canvas est mis à l'échelle de la fenêtre et du `devicePixelRatio` (≈ 3,1 × sur un écran Retina de 1 000 px CSS). Depuis R2.0.17 :

- l'écran STATS est composé **une seule fois à l'échelle réelle** du canvas (plus d'image 640×480 étirée une seconde fois) ;
- dès que l'échelle atteint **1,5 pixel physique par pixel logique** (`HD_MIN_SCALE`), les polices bitmap (HUD et STATS), le cadre, la tête et le bouton du dialogue, les feuilles de billes, l'ombre, les icônes de power-up et la barre de menu sont remplacés par des copies **2 × EPX** (`src/upscale.ts`, filtre Scale2x pur, aucune dépendance) construites en mémoire au chargement et dessinées à leur taille logique avec lissage ;
- le fond de niveau, les découpes, les trous, le couvercle, la grenouille, la pièce, la jauge et les explosions restent en 1 × bilinéaire ;
- « Pixels nets » choisit une échelle entière **en pixels d'appareil** (`fitScale` : `max(1, ⌊ajustement × dpr⌋) / dpr`, soit 960 × 720 px CSS dans une fenêtre de 1 000 × 750 sur un écran Retina, contre 640 × 480 jusqu'en R2.0.17), sans lissage, actifs 1 × ; sans elle le canvas remplit la fenêtre en 4:3 ; la bascule se fait sans rechargement ;
- coût mémoire mesuré avec le pack : ≈ 16,3 Mio d'images 2 × (dont 4,7 pour la barre de menu et 4,4 pour les six feuilles de billes), construites uniquement au-dessus de 1,5 ×.

## Verrous de non-régression

- insertion sans remplacement ni recoloration des billes existantes ;
- insertion progressive sur 12 ticks, destruction évaluée une fois la place faite ;
- tir partant de la bouche (muzzleOffset) ;
- trame de roulement monotone (recul visible) ;
- persistance des billes pendant la phase de destruction (24 ticks = 40 maj) ;
- attraction et reconnexion uniquement après contact physique ;
- couleur immuable des projectiles en vol ;
- filtrage des munitions sur les couleurs présentes ;
- quatre familles de power-ups (Bombe, Ralentir, Retour, Visée) avec leurs sons dédiés ;
- bonus saut, enchaînements, mode ZUMA, perte de vie et victoire ;
- HUD natif 640×480 et écran STATS monolithique à bouton OK unique (structure R2.0.12 ; avec le pack, écran STATS natif composé depuis les ressources originales : cadre 9 tranches, polices bitmap, chaînes, record de temps par niveau) ;
- décodeur de courbes originales vérifié sur un fichier synthétique ;
- arrêt du pousseur et zone lente de fin de piste ; décompte original ; bonus ACE TIME (`tests/r216*.test.mjs`) ;
- bonus de saut payé au match (barème 500 … 10 × brèches, bille en attente) ; score `10n + 100·combo` ; enchaînement `(chain + 5) × 10` ; textes et sons de score originaux ; grille du STATS, signe du bonus, astuce sur deux lignes ; compte à rebours borné avec mode rapide ; rampe du roulement armée une fois par cible ; `upscale2x`, composition à l'échelle du canvas et actifs 2 × dès 1,5 × (`tests/r217*.test.mjs`) ;
- décodage CURV aligné (tunnel, priorité 0..3), priorité d'une bille aux deux bords, projectile qui traverse une bille en tunnel, cinq passes de dessin sans bille omise ; vies tous les 50 000 points (sans plafond, aussi pendant le compte à rebours) avec triple `extralife` et compteur de grenouilles ; cadence originale des pièces (10 s, 13 s, 1/180 par tick, rien après ZUMA, `dist` en %), `coinappear` à 0,40 et panoramique ; décompte simultané sur plusieurs chaînes ; menu de jeu (disposition, aide, confirmation, composition, pause, volume) ; visée et tir sur toute la fenêtre, liaisons clavier, `stagePoint`, `fitScale` ; roulement 0,35 / 50 ms / 500 ms (`tests/r218*.test.mjs`) ;
- destruction en 24 ticks sans mouvement ; attraction `v = 10` après la destruction et `v = 1` après un tir sans alignement (⌊v/8⌋ px par maj, sans plafond) ; rebond au contact (18 ticks à max(50, 150 × profondeur) px/s, toute la chaîne, pousseur arrêté ≥ 12 ticks) ; recul ZUMA par chaîne depuis la tête (100 px/s, 180 ticks au plus, arrêt sous 50 px) et `ball-exit` sous 1 px ; pièce à 36 px qui consomme le tir ; trois grenouilles par partie et un seul `lost` par perte ; sons du contact et de l'impact, anti-rafale 250 ms, `power-spawn` muet ; réserve de grenouilles, « xN », clignotement, barre du haut recalée (`tests/r219*.test.mjs`) ;
- bouton OK du STATS selon la règle du pied du `Dialog` original, dessin en trois tranches partagé avec le menu, zone cliquable alignée ; service worker généré (deux caches, seules les ressources absentes téléchargées, routage hors ligne, mise à jour sur confirmation, `api/` jamais intercepté), artefact `--deploy`, icônes PNG, manifeste, métadonnées Apple, consignes d'installation par plateforme (aucune hors http(s)) ; toucher la grenouille = échange, rotation, marges sûres, plein écran conditionnel, audio iOS ; astuce complète en `Arial12Bold` pour les sept astuces du pack (`tests/r220*.test.mjs`) ;
- arrêt du pousseur au retrait de la bille arrière, jamais à l'insertion ; outil de simulation de la difficulté ; progression par étages et temples, portes, textes du dieu, tableau des dix meilleurs scores, profil, sauvegarde, machine d'états des écrans, revue sans écriture, prénom de l'hébergement ; menu principal original (composition, animations, sons, OVNI, OPTIONS hors partie, dialogues de nom et de reprise) ; écran d'aventure (portes, plaque, arrivée des temples), dialogue du dieu, écran de fin et routage après un niveau ; route `api/me` du worker (`tests/r221*.test.mjs`).

## Fournir ses propres graphismes de niveau

Le jeu charge n'importe quel niveau décrit dans le format du pack (`private_assets/pack/pack.json`, ignoré par Git), que les fichiers viennent de l'import original ou d'une création personnelle. Pour un niveau d'identifiant `<id>` :

- **Fond** : `levels/<id>/<id>.jpg` ou `.png`, 640×480, référencé par `graphics.<id>.background`. Il est dessiné 1:1, jamais mis à l'échelle : une image d'une autre taille est recadrée, pas étirée. Vignette optionnelle `levels/<id>/thumb.jpg` (320×240) dans `graphics.<id>.thumbnail`.
- **Découpes** (tunnels, dessinées au-dessus des billes) : un PNG avec couche alpha `levels/<id>/<nom>.png` et sa position en pixels (coin haut-gauche), déclarés dans `graphics.<id>.cutouts: [{ "image": "<nom>", "x": …, "y": …, "priority": 1 }]` et `graphics.<id>.layers.<nom> = { "color": "levels/<id>/<nom>.png", "alpha": null }`. Un calque avec `"color": null` et un masque dans `"alpha"` découpe le fond lui-même à cette position (format PopCap `_<nom>.gif`).
- **Calques animés** (sous les billes) : même format d'image et de calque, déclarés dans `graphics.<id>.overlays: [{ "image": "<nom>", "x": …, "y": …, "vx": …, "vy": … }]` ; `vx, vy` donnent la direction d'une oscillation lente (amplitude ≤ 3 px).
- **Tracé** : `levels/<fichier>.json` = `{ "version": 2, "controls": [[x, y], …], "points": [[x, y, flags], …] }`. Les `points` sont en pixels, échantillonnés au pas ≈ 1 px du trou d'entrée vers le crâne ; `flags` bit 0 = tunnel (portion injouable : ni impact ni visée), bits 1–2 = priorité de dessin 0..3 (les billes de priorité 0 passent sous les découpes, les autres au-dessus). Le fichier est référencé par `graphics.<id>.curveFiles` (plusieurs tracés = plusieurs chaînes) et la grenouille par `graphics.<id>.frog = { "x": …, "y": … }`.

Ces fichiers vont dans `private_assets/pack/` ; `npm run dev` les charge sans autre configuration.

## Statut

R2.0.21 est une baseline jouable, pas une revendication de reproduction bit-à-bit. Elle ajoute à R2.0.20 le parcours de l'aventure de l'original, composé à partir du pack : menu principal (animations, sons, OVNI), écran d'aventure (temples, portes, plaque des scores, arrivée des temples), dialogue du dieu entre les temples, écran de fin après 13-1 avec le tableau des dix meilleurs scores (sans crédits, D-10), profil saisi une fois ou fourni par l'hébergement privé (D-12), reprise de partie. Elle corrige surtout la difficulté : l'arrêt du pousseur suit la règle originale (retrait de la bille arrière, jamais une insertion, D-09), mesurable par `tools/sim-difficulty.mjs`. Sont vérifiés par analyse statique depuis R2.0.21 : cette règle, l'absence d'accélération par étage en aventure, la composition et les animations du menu principal, la composition de l'écran d'aventure (portes, plaque, textes, boutons, arrivée), les transitions de temple, les clés et la taille (10) du tableau des scores et ses soumissions (game over, fin du STATS final).

R2.0.20 ajoutait à R2.0.19 le bouton OK du STATS posé par la règle du pied du `Dialog` original (lue dans l'exécutable : `Dialog::Resize` 0x4ac160, marges de 0x43ef30), une PWA installable qui est exactement le jeu local avec ses ressources, jouable hors ligne après la première visite et mise à jour sur confirmation, l'installation et le jeu au toucher sur iPhone / iPad (à vérifier sur appareils réels une fois l'hébergement privé en place), et l'astuce du STATS toujours complète en `Arial12Bold`. Le standalone reste maintenu et livré à chaque version ; l'hébergement privé est en place (Pages, D1, Access) ; la synchronisation des scores entre appareils viendra ensuite. Sont vérifiés par analyse statique de l'exécutable original : la cadence (100 Hz) et les unités de `speed` / `firespeed`, la rampe et l'arrêt du pousseur, la zone lente et la ligne de danger, l'arrivée rapide calculée depuis `start`, la génération des couleurs (`repeat`, `single`, `colors`), le seuil `score` et la condition du recul ZUMA (`zumaslow` / `zumaback` × 0,25 au-delà de 50 % de couverture), le décompte de fin de niveau (60 px / 4 maj / +100, pops toutes les 10 maj), la formule ACE TIME et son comptage dans l'écran STATS, la valeur des pièces, les couleurs du dialogue STATS ; depuis R2.0.17 le score des matches (`10 × n + 100 × combo`), l'enchaînement `(chain + 5) × 10`, le barème et le moment de paiement du bonus de saut, les textes et sons de score, l'absence de mode rapide du compte à rebours dans l'original ; et depuis R2.0.18 le format CURV (tunnel et priorité de dessin), l'ordre de dessin du plateau en cinq passes, la collision qui ignore les billes en tunnel, la composition du menu de jeu (dialogue OPTIONS en jeu, jeu en pause dessous), les vies tous les 50 000 points sans plafond avec le triple `extralife`, la cadence des pièces (`treasurefreq`, 10 s visibles, 13 s entre deux apparitions, rien après ZUMA, `dist` en pourcentage), le volume de `jewelappear` et le fondu linéaire du roulement ; et depuis R2.0.19 (spike 04) la durée de destruction (40 maj), l'attraction accélérée à la fin de la destruction et après un tir sans alignement, le rebond au contact (et l'absence de recul à l'alignement), le recul ZUMA par chaîne depuis la tête avec arrêt sous 50 px et la perte des billes qui repassent l'entrée, la prise de la pièce à 36 px qui consomme le tir, les trois grenouilles par partie, le dessin de la réserve de vies (seuil 3, « xN », clignotement) et la disposition de la barre du haut, les sons du contact et de l'impact (et leur anti-rafale), l'absence de son à l'apparition d'un power-up.

Restent des hypothèses, à confirmer sur l'original ou au ressenti : A1 (`repeat` 50 au 1-1), A2 (appel unique de l'arrivée rapide), A3 (+10 000 par courbe en fin de niveau), A4 (bannière ZUMA 2 s), A5 (hauteur du pop du compte à rebours), A7 (`defaultParTime`), B1 (largeur de brèche en px de piste), B3 (alignement des valeurs du STATS et `y` exacts), B4 (sons de match malgré un power-up), C1 (clic droit = échange), C2 (découpes = pochoirs du fond), C3 (unité du panoramique des pièces), C4 (police des libellés du menu), la tête de divinité et les marges du menu, la couleur du « +N », la bille en attente qui n'entretient pas l'enchaînement, la loi RNG des power-ups (`powerfreq`), `mergespeed`, `reloaddelay`, le départ du chronomètre à « PARTEZ », le rafraîchissement immédiat des munitions, la condition exacte du rafraîchissement du roulement, la sensation de vitesse du recul ZUMA (100 px/s dans l'exécutable, plus lent que le souvenir de l'utilisateur), les billes en destruction poussées par le rebond, la grenouille en jeu comptée pendant la perte d'une vie, le modèle d'apparition des power-ups (lu, non implémenté) et les polices `FONT_MONODIGIT` / `FONT_DIALOG` du score et du niveau ; et des choix assumés : Espace = menu (l'original : pause), Échap / Entrée / Tab / P sans équivalent original, gain 0,35 du roulement sur un seul canal (l'original : 1,0, un canal par courbe), curseur Musique inerte, boutons du HUD actifs au toucher seulement (sauf l'appui long de 450 ms sur MENU, qui ouvre le menu avec la souris aussi). Deux déviations volontaires sont documentées : D-21 (compte à rebours borné à ≈ 2 s et accéléré au clic, là où l'original n'accélère jamais en aventure) et D-30 (décompte de fin de niveau simultané sur toutes les chaînes, là où l'original les décompte l'une après l'autre). Deux écarts avec les souvenirs de l'utilisateur sont tranchés en faveur de l'exécutable, à reconfirmer en UAT 9 : D-31 (une pièce touchée consomme le tir ; drapeau `coinConsumesShot` pour l'autre comportement) et D-32 (aucun son quand une bille devient power-up ; le son entendu jusqu'en R2.0.18 était celui des pièces). Les hypothèses propres à R2.0.21 (A1–A8 de la recherche 06, cels des portes, montée du temple 4, polices « !program », mises en page du dieu et de la fin, « STAGE 13 », clavier sur l'écran d'aventure) sont listées dans `R221_RELEASE_NOTES.md` et à confirmer dans `06-UAT.md`.
