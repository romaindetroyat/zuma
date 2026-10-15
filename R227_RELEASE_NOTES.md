# R2.0.27 — zone lente et brèches comme l'original

Retour de jeu : « quand la ligne est assez pleine, la vitesse ralentit considérablement » ; « je doute de la qualité du calcul des points lors de tirs dans les brèches […] parfois ça compte comme une brèche alors que ça ne devrait pas, et parfois l'inverse ». Rapports : `.planning/debug/slowdown-full-chain.md`, `.planning/debug/scoring-audit.md` (deuxième passe).

## Zone lente

- Chaîne d'un seul tenant : le ralentissement près du crâne était déjà celui de l'original (temps jusqu'au crâne à −1,8 … +0,4 % d'un modèle indépendant sur 1-1, 3-4, 6-4, 9-7, 12-1, 13-1). Inchangé.
- **Chaîne coupée près du crâne** : l'original mesure la zone lente à partir de l'avant du **tronçon arrière** (celui que la file pousse ; 0x418a28–0x418a77, liens entre billes). Nous prenions la bille la plus avancée de toute la chaîne : tout le tronçon arrière rampait à vitesse ÷ slowfactor (25–40 % de la vitesse de croisière) et rejoignait l'avant 1,8 à 2,3 fois trop lentement. Corrigé (à ±0,5 s de l'original). Le jeu redevient un peu plus difficile (robot : 23 défaites sur 48 au lieu de 18).

## Brèches

Cinq règles de l'original étaient absentes ou approchées ; comparaison avec un émulateur indépendant sur ≈ 21 000 tirs : faux positifs 30 → 0, faux négatifs 42 → 0, simple/DOUBLE/TRIPLE erronés 24 → 0, montants erronés 32 → 0.

1. **Projectile mis à jour à 100 Hz** (6 px par mise à jour, sans balayage), au lieu de sauts de 10 px qui enjambaient des points de contrôle ; affichage interpolé entre deux mises à jour.
2. **Points de contrôle** aux points 1, 33, 65… de la courbe (et non à la longueur d'arc, décalée jusqu'à 10–15 px en fin de courbe).
3. **Mémoire du point** : tant que la bille reste à moins de 16 px du dernier point compté, rien n'est recompté (fini les « DOUBLE » au-dessus d'une série qui explose).
4. **Bords de l'écran** de l'original (on pouvait toucher une bille hors de l'écran).
5. **Contact** : première bille dans l'ordre des courbes, tunnel testé du côté de l'insertion.

Montants inchangés (largeur de centre à centre, choix de l'utilisateur) ; le « +N » affiché est exactement ce qui s'ajoute au score (verrouillé). Total d'un robot : +0,2 % ; c'est le choix des tirs qui comptent qui change, pas la moyenne.

## Version

`ENGINE_VERSION` = `package.json` = 2.0.27 (`tests/r227.test.mjs`) ; verrous `r227-slowzone`, `r227-gaps`.
