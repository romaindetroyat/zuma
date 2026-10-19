# R2.0.28 — records personnels

Demande de l'utilisateur : « Il faudrait que les temps records affichés soient les temps des joueurs. Pas la peine de mutualiser les records. »

## Changements

- **STATS de fin de niveau** : une seule ligne `RECORD`, le meilleur temps du joueur sur ce plateau (copie « à moi » du serveur, envois en attente et record local : le plus bas), sans prénom ni ligne « MOI » (retour à la présentation R2.0.21).
- **Plaque RECORDS de l'écran d'aventure et tableau de l'écran de fin** : les scores du joueur seulement, sous son prénom ; la partie en cours reste en surbrillance. Plus d'étiquette ni de bascule « TOUS / MOI ».
- **Conservé** : la synchronisation des records du joueur entre ses appareils (`api/records`, file d'envoi hors ligne, reprise D-08). Le serveur et la base `zuma-scores` sont inchangés : la partie commune reste enregistrée mais n'est plus affichée (retour arrière possible).
- **Standalone** : inchangé (records locaux).
- Verrous : `tests/r228-personal-records.test.mjs` ; les tests R2.0.22 de l'affichage commun sont retirés (commentaire « R2.0.28: records personnels (demande utilisateur) »).

## Version

`ENGINE_VERSION` = `package.json` = 2.0.28 (`tests/r228.test.mjs`).
