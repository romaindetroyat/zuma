# Phase 6: Progression et menus — UAT

## Première session (à remplir)

Version **R2.0.21**. Notes de version : `R221_RELEASE_NOTES.md`. Parcours décrit dans le README, « Parcours de jeu ».

### Prérequis

- Version hébergée https://zuma-49c.pages.dev, **après le déploiement de R2.0.21 par l'orchestrateur** (accord de l'utilisateur), ou standalone R2.0.21 (`standalone/zuma-standalone.html`, ouvert depuis le disque).
- Sur la version hébergée, l'app installée propose « Mettre à jour » : accepter, puis vérifier « R2.0.21 » dans MENU › Aide.
- Pour revoir le premier lancement (dialogue de nom, plaque de démonstration) : vider les données du site (Chrome : cadenas › Paramètres du site › Effacer les données ; Safari : Réglages › Avancé › Données de sites web). Cela efface aussi le profil, la sauvegarde et les scores.
- Sur la version hébergée, le prénom vient de l'adresse de connexion (D-12) : le nom n'est pas demandé si l'adresse figure dans la table `players`. Pour tester la saisie, utiliser le standalone.
- `?level=S-L` ouvre un niveau en **revue** : rien n'est écrit (ni sauvegarde, ni profil, ni score). Pour un vrai test de reprise ou de fin, passer par « Aventure » et « Continuer ».

### Points à vérifier

**Accueil (menu principal)**

- [ ] L'app s'ouvre sur l'écran principal de Zuma, jamais directement dans un niveau.
- [ ] Le ciel défile lentement vers la droite derrière l'idole ; le soleil a une lueur qui tourne et pulse (≈ 5 s).
- [ ] Les pupilles de l'idole sont sous les paupières ; un clic sur la grenouille les fait suivre la souris, un second clic les ramène.
- [ ] Cinq pierres : AVENTURE, GANTELET, OPTIONS, PLUS DE JEUX, QUITTER. Seules Aventure et Options s'allument au survol.
- [ ] Le survol d'Aventure et d'Options joue un son de chœur (deux hauteurs différentes) ; les trois autres pierres restent muettes et inertes.
- [ ] Trois passages ordonnés de la souris sur les pierres, de haut en bas, font venir l'OVNI (avec son son), qui plane puis repart ; les yeux le suivent.
- [ ] Ligne « Bienvenue dans Zuma, <nom>! » ; un clic dessus permet de changer de nom.
- [ ] Clavier : Haut / Bas / Tab entre Aventure et Options, Entrée ou Espace pour valider. Toucher (iPhone / iPad) : un appui sur Aventure lance l'aventure.

**Nom et Options**

- [ ] Premier lancement (standalone, données vidées) : « NOUVEL UTILISATEUR » demande le nom **une seule fois** ; il n'est plus demandé après un rechargement.
- [ ] Version hébergée : aucun dialogue de nom, le prénom est déjà là.
- [ ] Options : titre OPTIONS, curseurs, cases, « Aide », « Terminé » ; pas de « Retour au menu principal ». « Terminé » revient à l'accueil.

**Écran d'aventure**

- [ ] Ciel, cascade, temples (2 et 3 voilés au début), titre AVENTURE, plaque RECORDS avec trois scores, plaque STAGE.
- [ ] Portes : la porte 1 brille (sélectionnée) ; les portes ouvertes s'éclairent au survol, les fermées ne répondent pas.
- [ ] Nom du temple sur les marches et message de la porte en jaune ; encadré d'aide en haut à gauche.
- [ ] « Jouer » lance l'étage sélectionné ; un second clic sur la porte sélectionnée aussi ; « Menu principal » revient à l'accueil.
- [ ] Clavier : Gauche / Droite entre les portes ouvertes, Entrée = Jouer, Échap = Menu principal.

**Progression**

- [ ] 1-1 → 1-5 s'enchaînent sans écran intermédiaire (après chaque STATS), puis l'écran d'aventure revient avec la porte 2 sélectionnée.
- [ ] Après l'étage 3 (3-5) : dialogue du dieu par-dessus le plateau, avec le son du temple ; la réponse de la grenouille le ferme.
- [ ] Puis l'écran d'aventure révèle le temple 2 en fondu, porte 4 sélectionnée.
- [ ] Après l'étage 9 : le temple 4 jaillit du sol avec un tremblement de terre.
- [ ] Une vie perdue fait rejouer le même niveau avec le score du début du niveau.
- [ ] Game over : le score apparaît dans la plaque RECORDS de l'écran d'aventure (s'il est parmi les trois premiers), après l'OK du STATS.

**Reprise**

- [ ] En plein niveau : MENU › « Retour au menu principal » › confirmer → écran d'aventure.
- [ ] Fermer l'app (ou l'onglet), la rouvrir → Aventure → « CONTINUER ? » ; « Continuer » reprend au début du même niveau, avec le score et les vies de ce début.
- [ ] « Rejouer » efface la sauvegarde et ouvre l'écran d'aventure.

**Fin de l'aventure**

- [ ] Après 13-1 (partie reprise par « Continuer », pas par `?level=13-1`, qui n'écrit rien) : STATS, dernier dialogue du dieu, puis l'écran de fin.
- [ ] Écran de fin : image de fin, « FÉLICITATIONS ! », tableau des dix meilleurs scores avec la ligne de la partie en jaune, « Score : N ».
- [ ] OK ramène à l'accueil ; la partie ne recommence pas au 1-1 ; « Aventure » ne propose plus « Continuer ».

**Difficulté (D-09)**

Comparer à l'original, de mémoire ou côte à côte : la chaîne doit avancer **sans s'arrêter à chaque tir** ; elle ne s'arrête brièvement que quand la bille la plus en arrière est détruite, et rebondit au contact comme avant.

| Niveau | Ressenti R2.0.21 (plus facile / pareil / plus dur que l'original) | Remarque |
| --- | --- | --- |
| 1-1 | | |
| 2-3 | | |
| 4-1 | | |
| 9-3 | | |
| 12-1 | | |

### Hypothèses à confirmer

Voir `R221_RELEASE_NOTES.md`, « Hypothèses à confirmer en UAT ». Au ressenti :

- A1 : l'écran d'aventure ne revient qu'à la fin d'un étage ; A5 : les portes ouvertes sont cliquables.
- A2 / A3 : messages des portes et textes du dieu au bon étage, au bon temple.
- A4 : ordre STATS → dieu → écran de fin après 13-1.
- A6 : nombre de couleurs par temple (billes violettes dès le temple 2, blanches dès le temple 3 ?).
- A8 : regard de l'idole (pupilles qui suivent la souris).
- Cels des portes (sélectionnée / survolée / ouverte / fermée), montée du temple 4 et tremblement.
- Lueur du soleil (couleur), position et trajectoire de l'OVNI.
- Libellé de la réponse du dieu ; noms « QUETZAL QUATL » / « POPO POYOLLI » ; ligne de bienvenue.
- Noms de démonstration du tableau (Zuma, Grenouille, Têtard).
- Encadré d'aide « Découvrez les temples secrets de Zuma ! » / « Cliquez sur une porte… ».
- « STAGE 13 » sur l'étage Espace ; mises en page du dialogue du dieu et de l'écran de fin (à nous).
- Clavier sur l'écran d'aventure (ajout).

Constats cosmétiques déjà connus (inutile de les relever) : « +100 » flottants et bouton STATS tactile visibles sous le dialogue du dieu ; virgules petites dans les textes du dieu.

### Constats

| # | Constat | Analyse | Décision |
|---|---------|---------|----------|
| | | | |

### Différé

- Synchronisation des meilleurs scores entre appareils (phase 5 D-39 / D-42).
- Musique sur ces écrans (phase 7).
- Gantelet, Plus de jeux, Quitter (v2.0, MODE-01).
- Écran de chargement `LoaderBar`.
- Crédits (D-10).
- D-08 : dix niveaux de plus (procédure seulement, `.planning/notes/niveaux-supplementaires.md`).
