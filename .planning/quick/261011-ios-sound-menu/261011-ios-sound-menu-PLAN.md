---
phase: quick-261011-ios-sound-menu
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: [src/audio.ts, src/render.ts, src/main.ts, src/menudialog.ts, README.md, R220_RELEASE_NOTES.md, tests/r220-ios.test.mjs, tests/r220-ios-audio.test.mjs, tests/r220-longpress.test.mjs]
autonomous: true
requirements: []
must_haves:
  truths:
    - "Sur iPhone, le son joue même interrupteur silencieux activé (audioSession 'playback', canal média sur iOS < 16.4)"
    - "Le contexte audio est réellement débloqué dans le geste : une source silencieuse d'un échantillon démarre dans unlock()"
    - "Un appui de 450 ms ou plus sur MENU (souris, toucher, stylet) ouvre le menu sans tirer"
    - "Un appui court garde le comportement actuel : la souris tire (D-26), le toucher ouvre le menu"
  artifacts:
    - path: src/audio.ts
      provides: "AUDIO_SESSION_TYPE = 'playback', setAudioSession(nav), primeContext(ctx), primeMediaChannel(doc), AudioEnv injectable, bindUnlock jusqu'à 'running' + visibilitychange / pageshow"
    - path: src/render.ts
      provides: "longPress(state, input) machine pure, LONG_PRESS_MS = 450, LONG_PRESS_SLOP = 12, HudState.menuPressed (état pressé de MenuButton)"
---

<objective>
UAT 9 (iPhone réel, app installée) : « le son ne semble pas fonctionner » et « peut-on faire un appui long sur le bouton menu pour ouvrir le menu ? ».
1. Audio iOS : session `playback` (révision de l'hypothèse `ambient` de 05-14 / D-38 §6, qui demandait déjà `playback`), source silencieuse démarrée dans le geste, `<audio>` silencieux joué une fois sur WebKit pour basculer iOS < 16.4 sur le canal média, écouteurs de geste gardés jusqu'à `running`, reprise sur `visibilitychange` / `pageshow`, état `interrupted` traité.
2. Appui long ≥ 450 ms sur MENU → menu ; appui court inchangé ; repère visuel (état pressé du bouton) pendant l'appui.
</objective>

<context>
@CLAUDE.md
@src/audio.ts
@src/main.ts (bindInput)
@src/render.ts (hitTest, HUD_LAYOUT, drawHud)
@.planning/phases/05-regles-originales-completes/05-14-SUMMARY.md
@.planning/phases/05-regles-originales-completes/05-12-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Déblocage audio iOS</name>
  <files>src/audio.ts, tests/r220-ios-audio.test.mjs, tests/r220-ios.test.mjs</files>
  <behavior>
    - setAudioSession(nav) met `type = 'playback'`, ne lève jamais (absent, non modifiable)
    - unlock() crée le contexte, règle la session avant, démarre synchroniquement un AudioBufferSourceNode d'un échantillon, reprend un contexte suspended / interrupted
    - sur WebKit (GestureEvent / webkitAudioContext), joue une fois un `<audio>` silencieux (data URL WAV, playsinline, volume 0, muet puis démuté)
    - bindUnlock : touchend / pointerup / click retirés quand le contexte est `running`, réarmés s'il repasse suspended / interrupted ; reprise sur visibilitychange (visible) et pageshow
    - aucun appel ne lève sans AudioContext / document / navigator
  </behavior>
  <action>RED : tests Node avec AudioContext, document et audio factices. GREEN : AudioEnv injectable dans AudioManager, helpers purs exportés.</action>
  <verify>npm test</verify>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Appui long sur MENU</name>
  <files>src/render.ts, src/main.ts, src/menudialog.ts, README.md, tests/r220-longpress.test.mjs, tests/r218-presentation.test.mjs</files>
  <behavior>
    - longPress : down dans le bouton → pending ; move ≥ 12 px ou hors bouton → slip ; up < 450 ms dans le bouton → tap ; tick / up ≥ 450 ms → fire ; pointercancel → cancel ; up après fire → swallow ; autres pointeurs ignorés
    - main : souris / stylet → tir différé au relâcher (tap / slip), aucun tir si le menu s'est ouvert ; toucher → tap ouvre le menu ; MenuButton dessiné à l'état pressé pendant l'appui
    - CONTROLS_HELP et README : « Appui long sur MENU : menu »
  </behavior>
  <action>RED : tests de la machine et du câblage. GREEN : implémentation.</action>
  <verify>npm test ; standalone file:// console propre ; --deploy + deploy --dry-run</verify>
</task>

</tasks>

<output>
`.planning/quick/261011-ios-sound-menu/261011-ios-sound-menu-SUMMARY.md`
</output>
