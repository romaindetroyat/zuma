---
phase: quick-261011-ios-sound-menu
plan: 01
subsystem: audio, input
tags: [ios, audio-session, web-audio-unlock, long-press, hud, uat-9]
provides:
  - "audio.ts : AUDIO_SESSION_TYPE = 'playback', setAudioSession(nav), primeContext(ctx), primeMediaChannel(doc), SILENT_WAV, isWebKit(win), AudioEnv injectable (browserAudioEnv), AudioManager.state"
  - "AudioManager.unlock : source silencieuse d'un échantillon dans le geste, <audio> silencieux une fois sur WebKit ; bindUnlock : écouteurs jusqu'à running, réarmés après suspended / interrupted, reprise sur visibilitychange / pageshow"
  - "render.ts : longPress(state, input) machine pure, LONG_PRESS_MS 450, LONG_PRESS_SLOP 12, LONG_PRESS_IDLE, HudState.menuPressed (état pressé de MenuButton)"
  - "main.ts : appui long sur MENU pour tout pointeur (menuPressStep, pressShoot, overMenuButton)"
affects: [audio, input, hud, help-view, readme]
tech-stack:
  added: []
  patterns: [environnement navigateur injectable pour tests Node, machine d'état d'entrée pure]
key-files:
  created: [tests/r220-ios-audio.test.mjs, tests/r220-longpress.test.mjs]
  modified: [src/audio.ts, src/render.ts, src/main.ts, src/menudialog.ts, README.md, R220_RELEASE_NOTES.md, tests/r220-ios.test.mjs, tests/r218-presentation.test.mjs]
key-decisions:
  - "audioSession 'playback' (révise l'hypothèse 'ambient' de 05-14 ; D-38 §6 demandait déjà playback) : le jeu sonne interrupteur silencieux activé"
  - "WebKit détecté par GestureEvent / webkitAudioContext, sans user agent ; l'<audio> silencieux est joué une fois (pas en boucle)"
  - "Souris / stylet sur MENU : le tir part au relâcher (et non plus à l'appui) pour qu'un appui long n'ait pas déjà tiré ; toucher : le menu s'ouvre au relâcher d'un tap ou à 450 ms"
duration: 25min
completed: 2026-10-11
status: complete
---

# Quick Task 261011-ios-sound-menu : son iOS et appui long sur MENU — Summary

**Session audio `playback` + déblocage Web Audio dans le geste (source silencieuse, `<audio>` silencieux sur WebKit, écouteurs jusqu'à `running`) ; un appui de 450 ms sur MENU ouvre le menu sans tirer.**

## Performance
- **Duration:** ~25 min
- **Tasks:** 2 (TDD, RED → GREEN chacune)
- **Files:** 2 créés, 8 modifiés

## Accomplishments
- **Son iPhone (UAT 9)** :
  - `navigator.audioSession.type = 'playback'`, posé avant `new AudioContext()` ;
  - `unlock()` démarre synchroniquement une `AudioBufferSourceNode` d'un échantillon tant que le contexte ne tourne pas ;
  - sur WebKit, un `<audio>` WAV silencieux de 124 octets (data URL, `playsinline`, volume 0, muet au `play()` puis démuté) est joué une fois pour le canal média d'iOS < 16.4 ;
  - `touchend` / `pointerup` / `click` sont retirés une fois `running` et réarmés sur `suspended` / `interrupted` (`statechange`) ;
  - reprise sur `visibilitychange` (visible) et `pageshow` ;
  - rien ne lève sans API (constructeur qui lève, document absent, `play()` rejeté).
- **Appui long sur MENU** :
  - machine `longPress` pure (start / fire / tap / slip / cancel / swallow, autres pointeurs ignorés) ;
  - souris / stylet : tap ou slip → tir au point d'appui au relâcher (D-26) ;
  - toucher : tap → menu, slip → rien ;
  - fire → menu, relâcher avalé ;
  - minuterie `LONG_PRESS_MS + 5` et tick à chaque image ;
  - repère visuel : troisième état (violet, « pressé ») de `MenuButton`, bouton éclairé dans le HUD vectoriel ;
  - aide du menu et README : « Appui long sur MENU : menu ».

## Task Commits
1. Audio iOS : `86d7711` (RED), `e694407` (GREEN)
2. Appui long MENU : `1b02e6b` (RED), `3653baf` (GREEN)

## Verification
- `npm test` : **373/373** (350 avant + 12 audio + 11 appui long), garde-fou : 545 fichiers suivis, aucun propriétaire. Vert à chaque commit GREEN.
- Standalone `file://…?level=1-1&debug=1` (Playwright, Chromium) :
  - clic court sur MENU → 1 tir, pas de menu ;
  - appui souris : pas de menu à 250 ms, menu à 600 ms, 0 tir ;
  - tap tactile → menu, 0 tir ;
  - appui tactile 600 ms → menu, 0 tir ;
  - appui tactile déplacé de 30 px → ni menu ni tir ;
  - clic sur le plateau → tir ;
  - contexte audio `running` ;
  - console propre ;
  - captures : bouton pressé violet pendant l'appui, aide avec la ligne « APPUI LONG SUR MENU : MENU » sans débordement.
- `node tools/build.mjs --deploy` (291 fichiers, 5,7 Mio) puis `node tools/deploy.mjs --dry-run` : code de sortie 0. Rien d'envoyé à Cloudflare.

## Deviations from Plan

### Changements de règles verrouillées
**1. [Rule 1] `r218-presentation` : « boutons du HUD au toucher seulement »**
- MENU est désormais testé pour tout pointeur, afin d'armer l'appui long. STATS reste au toucher seulement.
- L'assertion compte deux `hitTest(` : l'appui et `overMenuButton`, qui suit le pointeur tenu.

**2. [Rule 1] `r220-ios` : `'ambient'` → `'playback'`**
- Changement demandé ; le comportement est verrouillé dans `r220-ios-audio`.

**3. Moment du tir sur MENU**
- Un clic souris / stylet sur MENU tire maintenant **au relâcher** au lieu de l'appui, avec la même cible.
- Sinon, un appui long aurait déjà tiré.
- Ailleurs, le tir reste à l'appui.

## Not verifiable without a real iPhone (UAT 9)
- Son audible avec l'interrupteur silencieux activé, avec `audioSession` `playback` (iOS ≥ 16.4).
- Effet du `<audio>` silencieux joué une fois sur iOS < 16.4. Si le son suit encore l'interrupteur, il faudra peut-être une boucle silencieuse tant que la page est visible (méthode de unmute-ios-audio).
- Le déblocage réel par la source d'un échantillon dans `touchend`.
- Retour après un appel ou un verrouillage (`interrupted` → écouteurs réarmés, reprise au toucher suivant).
- `pageshow` dans l'app installée.
- Interaction avec la musique d'une autre app : `playback` la coupe.
- Appui long au doigt sur l'iPhone : pas de loupe ni de menu contextuel (`-webkit-touch-callout: none` est déjà posé sur la scène).
- Chromium n'émule ni `audioSession`, ni l'interrupteur silencieux, ni WebKit.

## Known Stubs
None.

## Self-Check: PASSED
- Fichiers créés présents : `tests/r220-ios-audio.test.mjs`, `tests/r220-longpress.test.mjs`, ce SUMMARY, le PLAN.
- Commits présents : `86d7711`, `e694407`, `1b02e6b`, `3653baf`.
