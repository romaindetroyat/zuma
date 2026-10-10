# Phase 5 — points différés (hors périmètre des plans, non corrigés)

## Relevés en 05-07 (vérification finale R2.0.16)

- **Fondu du roulement relancé à chaque image** (`src/audio.ts` `setLoop`, D-17, plan 05-06) : `updateLoops` appelle `setLoop('rolling', 0)` à chaque image pendant un arrêt ; chaque appel annule la rampe en cours et en relance une de 150 ms depuis la valeur courante, d'où une décroissance quasi exponentielle (mesuré sur le 1-1 : 0,6 → 0,46 à 50 ms, 0,32 à 100 ms, 0,22 à 150 ms, 0,08 à 300 ms, 0,02 à 500 ms) au lieu d'une rampe linéaire atteignant 0 en 150 ms. Même effet sur la montée (50 ms). Audible comme un fondu d'≈ 0,4 s : acceptable, à confirmer en UAT 5 (U18). Correction possible : ne relancer la rampe que lorsque la cible change (mémoriser la dernière cible dans `Loop`). Verrou à ajouter : rampe armée une seule fois par changement de cible. — **Corrigé en 05-08** (`rampPlan`, `Loop.target`, R2.0.17 ; verrou `r217-presentation` « rampPlan: a ramp only when the loop target changes »).
- **Score du HUD dessiné sous la tête du STATS natif** (observation 05-04, toujours présente) : cosmétique.

## Relevés en 05-08 (score original, STATS, netteté — R2.0.17)

- **Garde B4 des sons de match** (`src/feedback.ts` `soundCues`, spike 02 Q2) : l'original ne joue ni `BALLDESTROYED` ni `chime1` quand le groupe détruit a déclenché un power-up (`courbe+0x7c`, prédicat `0x4015c0 ≠ 4` supposé) ; non implémenté, les sons jouent toujours. À trancher en UAT 6.
- **Bille en attente et enchaînement** (`src/core.ts` `settle`, spike 02 Q1–Q2) : dans l'original une bille posée contre sa couleur (`+0x32`) n'interrompt pas l'enchaînement et compte +1 quand elle est détruite ; le moteur garde seulement son bonus de saut et remet l'enchaînement à zéro. Raffinement optionnel.
- **xBR** (D-19 première option) : non retenu, EPX / Scale2x suffit sur les captures ; à revoir seulement si la lisibilité des glyphes 2 × est jugée insuffisante en UAT 6.
- **Mémoire des actifs 2 ×** : 16,26 Mio mesurés (40 images) contre les « < 12 Mo » attendus par le plan 05-08 ; le reste est structurel (barre de menu 640 × 480 pleine, 4,69 Mio ; six feuilles de billes avec chacune leur ombre, 4,4 Mio). Réduction possible : recadrer la barre de menu sur ses lignes opaques, partager une ombre. Non fait (T-05-22 documenté à 16,3 Mio).
- **Base 250 du bonus de saut en mode gauntlet** (`plateau+0x187`) : ignorée, aucun mode gauntlet.
- **Score du HUD sous la tête du STATS** : toujours cosmétique (voir ci-dessus).

## Relevés en 05-10 (tunnels, menu de jeu, entrées, vies, pièces, roulement — R2.0.18)

- **Un canal de roulement par courbe** (`src/audio.ts`, D-29, spike 03 Q5) : l'original crée une instance de `SOUND_ROLLING` par courbe (0x419610, 0x402980 / 0x4029a0) ; une seule boucle sert toutes les chaînes. Sans effet audible attendu sur une chaîne ; à reprendre si l'UAT 7 juge le roulement des niveaux à deux entrées trop uniforme.
- **Geste tactile d'échange** (`src/main.ts` `bindInput`, D-26) : l'échange passe au clic droit, qui n'a pas d'équivalent au toucher : sur un appareil tactile sans souris il n'y a aujourd'hui aucun moyen d'échanger la bille (un toucher vise et tire). Geste à définir (toucher la grenouille, appui long, second doigt). Non fait.
- **Pause sans billes de l'original** (0x42db5a) : pendant la pause, l'original ne dessine pas les billes et affiche `IMAGE_PAUSED` / « PAUSE » ; le moteur fige l'image courante. Non fait (sous le menu, le dialogue couvre déjà l'essentiel du plateau).
- **Menu principal et musique** (phase 6 / 7) : « Retour au menu principal » lance une nouvelle partie après confirmation, le curseur « Musique » est grisé et inerte.
- **Aide du menu sans pagination** : trois astuces du pack sur sept tiennent à la police d'astuce ; les quatre autres ne sont pas affichées.
- **Cosmétique** : dans la barre du haut, le « +N » des vies chevauche la troisième grenouille d'≈ 3 px ; la tête de divinité du MENU / STATS couvre le score du HUD (observation 05-04) ; le « +100 » du décompte en `CancunFloat14` garde ses propres couleurs (la teinte est ignorée par les polices en couleur, préexistant).
- **Priorités ≥ 2** : aucune courbe du pack n'en a ; les passes 2–4 ne sont exercées que par les tests.

## Relevés en 05-11 (vérification finale R2.0.18)

- **README, « Fournir ses propres graphismes »** (laissé intact sur instruction du plan 05-11) : la phrase « `flags` bit 1 = la bille passe sous une découpe, bit 2 = bille cachée » décrit l'ancien décodage ; depuis R2.0.18 le bit 0 (valeur 1) = tunnel et les bits 1–2 = priorité de dessin 0..3 (voir « Tunnels et calques » plus haut dans le README). À corriger lors d'une prochaine passe de documentation.
