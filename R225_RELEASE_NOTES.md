# R2.0.25 — son sans décalage après une pause

Retour de jeu : « quand on met le jeu en pause avec Menu et qu'on reprend, le son est décalé des actions » (Mac et iPhone). Rapport : `.planning/debug/sound-lag-after-pause.md`.

## Cause

Le jeu ne retarde aucun son : mesuré dans Chromium, chaque son part 0,1 à 0,2 ms après son événement, avant comme après une pause. Sur WebKit (Safari sur Mac, tous les navigateurs de l'iPhone), l'audio de la page passe par un tampon partagé lu par un autre processus ; chaque retard de rendu y creuse un écart que rien ne résorbe tant que le même contexte audio vit, et `suspend()` / `resume()` le conserve. Le jeu gardait un seul contexte toute la session, silencieux pendant le menu : une fois l'écart creusé, tous les sons suivants arrivaient en retard. (Mécanisme lu dans les sources de WebKit ; le déclencheur exact pendant la pause n'a pas pu être observé ici, faute de WebKit dans la session.)

## Correction

- À la reprise (fermeture du menu, fin de la pause P, fermeture du STATS en jeu), le jeu ouvre un **nouveau contexte audio** dans le geste qui reprend la partie, avec le même déverrouillage qu'au premier toucher (session « playback », son silencieux, `resume()`). Les sons déjà décodés et le volume « Sons » sont repris ; l'ancien contexte est fermé 1,5 s plus tard pour laisser jouer le clic de « Retour au jeu ».
- Sans geste récent (fermeture par Échap), le changement attend le prochain toucher ou clic.
- Le menu ne suspend pas l'audio (les clics des boutons restent audibles).
- Verrous : `tests/r225-audio-pause.test.mjs` (contexte simulé modélisant l'écart de WebKit : 173 ms de retard sans la correction, aucun avec).

## À vérifier sur Mac (Safari) et iPhone

Tirer, ouvrir MENU 10 à 30 s, reprendre, tirer : le son doit suivre le tir comme avant la pause, même après plusieurs pauses. Sur iPhone : son avec l'interrupteur silencieux, clic de « Retour au jeu » audible, volume conservé.

## Version

`ENGINE_VERSION` = `package.json` = 2.0.25 (`tests/r225.test.mjs`).
