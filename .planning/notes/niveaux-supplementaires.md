# Idée différée : 10 niveaux supplémentaires (2026-10-11)

Demande de l'utilisateur : « comment imaginer 10 niveaux de plus ? » — procédure seulement, rien n'est lancé.

## Ce qu'est un niveau dans ce projet
- Un décor 640 × 480 (fond + découpes pour les tunnels), une ou deux courbes (polylignes au pas d'1 px avec un octet tunnel et un octet de priorité par point), la position de la grenouille, les points de pièces, et une ligne de réglages (`speed`, `start`, `repeat`, `single`, `colors`, `score`, `partime`, `slowfactor`, `zumaback`, `zumaslow`…), le tout rangé dans le pack privé (`graphics.<id>`, `settings.<id>`, `stages[]`).
- Le moteur ne fait aucune hypothèse sur l'origine des niveaux : un niveau fourni au même format se joue comme un niveau original.

## Procédure proposée
1. Cahier des charges : 10 niveaux = 2 temples de 5 (ou une suite du temple final), difficulté prolongeant la courbe 1-1 → 13-1 (vitesse, couleurs, objectif, temps d'expert) ; décider s'ils restent privés (dérivés des décors originaux) ou s'ils sont entièrement originaux (publiables).
2. Décors : soit l'utilisateur les produit (il l'a proposé en phase 4), soit génération à partir de nouvelles illustrations ; découpes de tunnels dessinées sur le même principe (masques).
3. Courbes : un petit éditeur de courbes dans le navigateur (prévu en v2, MODE-02 / PWA-02) — points de contrôle, lissage, marquage des tunnels et des priorités, position de la grenouille et des pièces, export au format du pack ; validation automatique (longueur, rayon de courbure minimal, pas de croisement non marqué, distance grenouille-courbe jouable).
4. Réglages : extrapolation des réglages originaux par temple, puis calage par simulation (temps moyen de complétion, taux de perte avec un joueur automatique simple) avant les tests humains.
5. Intégration : `stages[]` étendu, écran d'aventure (portes/temples supplémentaires), tests de non-régression, UAT par l'utilisateur.

Estimation grossière : éditeur de courbes 1 phase ; 10 niveaux (décors fournis) 1 phase ; calage 1 phase.
