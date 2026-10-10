# Zuma PWA

Reconstruction web/PWA expérimentale d'un jeu de billes de type Zuma, développée à partir d'un audit comportemental et de tests de non-régression.

## Baseline

Version de travail validée : **R2.0.7**.

La suite de tests couvre notamment :
- insertion sans remplacement ni recoloration des billes existantes ;
- persistance des billes pendant la phase de destruction ;
- attraction et reconnexion uniquement après contact physique ;
- recul local propagé de segment en segment ;
- couleur immuable des projectiles en vol ;
- quatre familles de power-ups ;
- HUD redessiné en 640×480 ;
- écran de statistiques dynamique.

## Ressources originales

Ce dépôt public ne distribue pas les médias, sons, polices, exécutable ou packs extraits du jeu original. Les ressources nécessaires aux tests locaux doivent être fournies séparément par l'utilisateur et rester hors Git.

## Distribution locale

Le standalone privé contenant les ressources n'est pas publié dans ce dépôt.

## Statut

R2.0.7 est une baseline de validation, pas une revendication de reproduction bit-à-bit. La loi RNG exacte des power-ups reste à documenter.
