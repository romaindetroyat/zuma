# Phase 5 — points différés (hors périmètre des plans, non corrigés)

## Relevés en 05-07 (vérification finale R2.0.16)

- **Fondu du roulement relancé à chaque image** (`src/audio.ts` `setLoop`, D-17, plan 05-06) : `updateLoops` appelle `setLoop('rolling', 0)` à chaque image pendant un arrêt ; chaque appel annule la rampe en cours et en relance une de 150 ms depuis la valeur courante, d'où une décroissance quasi exponentielle (mesuré sur le 1-1 : 0,6 → 0,46 à 50 ms, 0,32 à 100 ms, 0,22 à 150 ms, 0,08 à 300 ms, 0,02 à 500 ms) au lieu d'une rampe linéaire atteignant 0 en 150 ms. Même effet sur la montée (50 ms). Audible comme un fondu d'≈ 0,4 s : acceptable, à confirmer en UAT 5 (U18). Correction possible : ne relancer la rampe que lorsque la cible change (mémoriser la dernière cible dans `Loop`). Verrou à ajouter : rampe armée une seule fois par changement de cible.
- **Score du HUD dessiné sous la tête du STATS natif** (observation 05-04, toujours présente) : cosmétique.
