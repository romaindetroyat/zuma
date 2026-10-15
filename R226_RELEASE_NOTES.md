# R2.0.26 — plus aucun son en retard

Retour de jeu après R2.0.25 : le son reste en retard d'une seconde ou plus après une pause, sur Mac et iPhone, dans l'app installée comme dans un onglet. Rapport : `.planning/debug/sound-lag-after-pause.md` (deuxième passe).

## Constat

Dans Chromium (règles d'autoplay réelles, clics, touchers, touches), aucun retard n'apparaît, quel que soit le chemin de fermeture du menu : chaque son part 1 à 23 ms après l'action, retard de sortie 35 à 50 ms avant comme après la pause. Un retard de plus d'une seconde vient donc du moteur audio de l'appareil (WebKit : Safari sur Mac, tous les navigateurs de l'iPhone), comme dans des signalements publics (forums Apple 699192, WebKit 221334), ou d'un contexte qui n'est pas réellement en marche.

## Corrections

- **Aucun son joué en retard** : un son qui n'a pas démarré 100 ms après son heure est annulé (mieux vaut silencieux qu'en retard) et le contexte est relancé.
- **Surveillance continue** (`AudioManager.tick()` à chaque image) : horloge figée (« running » sans avancer depuis 250 ms), retard de sortie mesuré par `getOutputTimestamp()` qui dépasse de 150 ms celui du départ, ou contexte qui ne démarre pas → le contexte audio est reconstruit au toucher ou clic suivant (au plus une demande automatique toutes les 3 s, au plus 2 reconstructions de suite pour une sortie lente type Bluetooth / AirPlay).
- Conservé : nouveau contexte à la reprise (R2.0.25), sons décodés, volume « Sons », déverrouillage iOS.
- **Diagnostic** : `?debug=audio` affiche en haut à gauche l'état du contexte, les latences, le retard mesuré, les reconstructions et les sons annulés. Sans ce paramètre, rien ne change.
- Verrous : `tests/r226-audio-lag.test.mjs` (contexte simulé : suspendu, interrompu, horloge figée, `getOutputTimestamp`).

## Non vérifié ici

WebKit n'est pas disponible dans la session : la correction est éprouvée dans Chromium et par simulation. Si le retard persiste, une capture de `https://zuma-49c.pages.dev/?debug=audio` (ouvert dans Safari) au moment du retard dira lequel des deux mécanismes est en cause, ou si le retard vient de la sortie (écouteurs, AirPlay).

## Version

`ENGINE_VERSION` = `package.json` = 2.0.26 (`tests/r226.test.mjs`).
