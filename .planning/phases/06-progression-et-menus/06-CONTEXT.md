# Phase 6: Progression et menus - Context

**Gathered:** 2026-10-11 (retour de jeu de l'utilisateur sur R2.0.20 hébergé)
**Status:** Ready for research

<domain>
## Phase Boundary

Quatre demandes de l'utilisateur après avoir joué l'aventure complète sur la version hébergée (R2.0.20) :
1. Un écran de bienvenue : l'app ne doit plus démarrer directement dans un niveau.
2. Un écran de fin (« congratulations ») après le dernier niveau de l'aventure (aujourd'hui 13-1) : la partie s'arrête au lieu de recommencer, le score final est affiché et comparé aux scores antérieurs.
3. Ces écrans de début et de fin sont conformes aux graphismes du jeu original.
4. Le jeu paraît un peu plus facile que l'original : analyser pourquoi (arrêts des files trop fréquents ou trop longs ? absence d'accélération progressive au fil des niveaux ?) et corriger par petits pourcentages, uniquement si l'analyse le justifie.

Couvre PROG-01 (aventure par temples, transitions), PROG-02 (meilleurs scores ; la reprise de partie reste dans le périmètre de la phase si elle ne retarde pas les points 1–3), PROG-03 (menu principal). La synchronisation des scores entre appareils (D-39/D-42 de la phase 5, fonction Pages + D1 identifiée par Access) est hors de cette phase sauf si elle se greffe sans risque sur le tableau des scores local.

</domain>

<decisions>
## Implementation Decisions

### Écran de bienvenue (U1)
- **D-01:** Au lancement, l'app affiche l'écran principal du jeu original, composé à partir des ressources du pack (`mmscreen`, `mmsky`, `mmsun` / `mmsunglow`, `mmhat`, `mmeyeleft` / `mmeyeright` / `mmeyemask`, `mmUFO`, boutons `mmARCADEBUTTON` → « Aventure », `mmOPTIONSBUTTON` → options, `mmQUITBUTTON` / `mmMOREGAMESBUTTON` / `mmGAUNTLETBUTTON` selon ce que l'analyse de l'exécutable établit et ce qui a un sens dans une PWA) ; la composition, les animations (yeux, soleil, OVNI) et les sons sont lus dans l'exécutable (recherche 06). Aucun niveau ne démarre avant le choix du joueur.
- **D-02:** « Aventure » mène à l'écran d'aventure original (`advback`, `advsky`, `advmiddle`, `advstage`, `advtemple1..4`, portes `advdoor*`, `advTitle`, `advplaybutton`, `advmainmenubutton`, `advHighscore`) si l'analyse confirme ce chaînage ; sinon directement au premier niveau. Le menu de jeu (« Retour au menu principal ») ramène à cet écran au lieu de relancer une partie.

### Écran de fin (U2)
- **D-03:** Après le dernier niveau de la progression (13-1 aujourd'hui), le jeu ne recommence pas : il affiche l'écran de fin original (`happyending` et ce que l'exécutable enchaîne : texte, sons, crédits éventuels), puis le score final et le tableau des meilleurs scores (graphismes `advHighscore` / chaînes du pack), avec la position du score de la partie ; retour à l'écran de bienvenue ensuite.
- **D-04:** Tableau des meilleurs scores local (`localStorage`, 10 entrées comme l'original si l'analyse le confirme : nom ou date, score, niveau atteint) ; une partie perdue (game over) y entre aussi, comme dans l'original. La saisie d'un nom suit l'original si elle existe (sinon « Joueur » + date). Synchronisation entre appareils : différée (phase 5 D-39/D-42).

### Conformité graphique (U3)
- **D-05:** Mêmes principes que le STATS et le menu natifs : composition à l'échelle du canvas, chemin 2× HD, polices bitmap du pack, chaînes du pack, aucun panneau DOM stylé ; captures Playwright à DPR 2 comparées à l'original (géométrie lue dans l'exécutable).

### Difficulté (U4)
- **D-06:** Analyse avant toute correction : mesurer dans notre moteur, niveau par niveau, le temps passé à l'arrêt (arrêts du pousseur après insertion, reculs au contact, recul ZUMA), la vitesse effective, et la comparer aux règles lues dans l'exécutable (recherches 01 et 04) et aux réglages `levels.xml` par niveau (`speed`, `slowfactor`, `slowspeed`, `maxspeed`, `mergespeed`, `zumaslow`, `zumaback`, progression `StageProgression`). Rechercher dans l'exécutable toute accélération globale par niveau/temple (multiplicateur de vitesse, `maxspeed`, difficulté du mode aventure) que nous n'appliquerions pas.
- **D-07:** Corrections éventuelles limitées à de petits pourcentages et justifiées une à une par l'analyse ; chaque règle modifiée est verrouillée par un test ; aucune « difficulté inventée ».

### Plus tard (hors phase, information seulement)
- **D-08:** « Comment imaginer 10 niveaux de plus ? » : procédure décrite à l'utilisateur, rien n'est lancé (voir `.planning/notes/niveaux-supplementaires.md`).

</decisions>

<decisions-after-research>
## Décisions après la recherche 06 (2026-10-11)

- **D-09:** Difficulté (D-06/D-07 révisés, accord explicite de l'utilisateur) : la règle originale est appliquée telle quelle — l'arrêt du pousseur (40 maj, reprise depuis 0) n'a lieu que lorsque la bille la plus en arrière (celle que pousse le pousseur) est détruite, jamais à une insertion (0x423a10, stop 0x423ac7–0x423ad6). Correction supérieure aux « petits pourcentages », acceptée parce qu'elle restitue l'original ; aucune autre accélération (pas d'accélération par temple en aventure). `colors` inchangé.
- **D-10:** Écran de fin : image `happyending`, « Félicitations », score final et tableau des 10 meilleurs scores avec la place de la partie, puis retour à l'écran d'accueil ; pas de crédits (noms PopCap non recopiés).
- **D-11:** Écran d'accueil : boutons Aventure et Options actifs ; Gauntlet, Plus de jeux, Quitter affichés mais désactivés ; Aide dans le dialogue Options comme l'original ; animations et sons selon la recherche 06 (soleil, yeux, survol `choral1`, OVNI). Meilleurs scores : 10 entrées « adventure » (nom du profil saisi une fois au premier lancement, score), enregistrées à la fin de partie et après le STATS final ; valeurs initiales de démonstration sans noms PopCap.
</decisions-after-research>

- **D-12:** Prénom automatique (demande de l'utilisateur, 2026-10-11) : sur la version hébergée, le prénom du joueur vient de son identité Cloudflare Access (adresse e-mail → prénom, table privée `players` dans `private_assets/deploy.json`, jamais commitée) ; le worker l'expose au jeu (`api/me` → `{ name }`, rien pour une adresse inconnue) ; le jeu l'utilise pour les meilleurs scores sans demander de nom ni écrire « Joueur ». Le standalone et l'usage local gardent la saisie unique. Ajouter un joueur = une ligne adresse → prénom ; le script de déploiement en déduit la liste d'accès Access (`allow`) et le mail d'installation est personnalisé avec le prénom.
