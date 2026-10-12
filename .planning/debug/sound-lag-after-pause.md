---
status: awaiting_human_verify
trigger: "Quand on met le jeu en pause en appuyant sur Menu, et qu'on reprend le jeu, le son est décalé des actions. C'est vrai sur Mac et sur iphone. Corrige ça pour que le son ne se décale pas en cas de pause"
created: 2026-10-12T00:00:00Z
updated: 2026-10-12T15:10:00Z
---

## Current Focus

hypothesis: the lag is in the output pipeline of the long-lived AudioContext (WebKit never reclaims write-ahead added by render underruns; only a new context resets it); the game code queues nothing
test: real devices — Safari macOS and iPhone, pause with MENU ≥ 10 s, resume, compare the shot sound with the frog's shot before / after
expecting: same reaction before and after the pause
next_action: wait for the user's check on Mac and iPhone (R2.0.25 build by the orchestrator)

reasoning_checkpoint:
  hypothesis: "Sounds lag after a pause because the AudioContext kept running silent through the pause and its output pipeline slipped; on WebKit the write-ahead of the GPU-process ring buffer only grows (each underrun adds one hardware buffer, nothing shrinks it), so every later sound is heard late until a new AudioContext is made"
  confirming_evidence:
    - "Chromium probe: event → start() < 0.2 ms and when == ctx.currentTime before and after an 8 s menu pause; no live source, no queued event, no ctx clock drift — the game adds no delay"
    - "WebKit source (RemoteAudioDestinationManager::render / RemoteAudioDestinationProxy::renderAudio): reader advances only on successful fetch, writer always advances by the frames consumed; counters reset only for a new destination; suspend/resume keeps them"
    - "The menu pause is the only long silent stretch of a running context in this game (the rolling loop sounds whenever the chain moves)"
  falsification_test: "If, with the fix, the lag is still heard right after « Retour au jeu » on Safari, the slip is not in the context's pipeline (e.g. route / Bluetooth latency or a visual delay) — or it is reintroduced within seconds of play"
  fix_rationale: "Every return from a pause swaps in a fresh AudioContext (made inside the resuming gesture, unlocked like the first: silent one-sample source + resume), carrying over decoded buffers and volume; whatever latency the old pipeline accumulated is dropped with it, on any engine"
  blind_spots: "WebKit could not be run here (only Chromium in /opt/pw-browsers, bugs.webkit.org blocked): the exact trigger of the underruns during a silent pause is inferred, not observed; Safari versions older than WebKit main may differ in detail; the transient-activation duration of Safari decides whether Escape-closing renews at once or at the next click"

## Symptoms

expected: after pausing with MENU (OPTIONS dialog) and resuming, each sound plays at the moment of its action (shot, insert, explosion)
actual: after resume the sounds lag behind the actions, persistently (not a single burst)
errors: none
reproduction: start a level, press MENU (or Space/Enter/Escape/long press), wait, press « Retour au jeu », shoot
started: reported on R2.0.24 (deployed), Mac and iPhone

## Eliminated

- hypothesis: scheduled sources / beats whose start times run ahead of ctx.currentTime, or engine events accumulated during the pause and replayed on resume
  evidence: Chromium probe — every start has when == ctx.currentTime (delay only for extralife/gap by design); no engine step while menuOpen (loop() skips engine.step and zeroes the accumulator), 0 live sources during the pause
  timestamp: 2026-10-12T15:20Z

- hypothesis: anti-burst guard / warning scheduler mixing performance.now() and ctx.currentTime
  evidence: cueAllowed only drops a merge within 250 ms (never defers); the warning beat runs on window.setTimeout and calls play() at ctx.currentTime; pulse('warning', 0) clears it every paused frame
  timestamp: 2026-10-12T15:20Z

- hypothesis: gain ramps / setValueAtTime piling up on the rolling loop
  evidence: stopLoops() at openMenu stops and disconnects the loop; resume creates a new source with one 50 ms ramp (rampPlan armed once per target change)
  timestamp: 2026-10-12T15:20Z

- hypothesis: suspending the AudioContext on pause and resuming it on unpause would fix it
  evidence: WebKit suspend()/resume() stop and restart the AudioOutputUnit without resetting m_startFrame / m_currentFrame (the write-ahead and its stale content survive); a restart is another chance of underrun ("common at stream start"); it would also silence the menu clicks — rejected in favour of a fresh context
  timestamp: 2026-10-12T15:45Z

## Evidence

- timestamp: 2026-10-12T15:00Z
  checked: knowledge base (.planning/debug/knowledge-base.md)
  found: file absent — no known pattern
  implication: open-ended investigation

- timestamp: 2026-10-12T15:05Z
  checked: src/audio.ts play()/setLoop()/pulse()/stopLoops(), src/main.ts loop(), openMenu/closeMenu, togglePause, playCue/cueAllowed
  found: play() starts every one-shot at ctx.currentTime + clampDelay(delay) (delay only for extralife/gap, ≤ 1 s); while menuOpen the loop runs no engine step (no events accumulated, accumulator reset to 0), calls setLoop('rolling', 0) (no-op once stopLoops released the loop) and pulse('warning', 0) (clears the setTimeout); openMenu calls stopLoops(); cueAllowed only drops cues (never delays them); nothing touches the AudioContext on open/close (no suspend/resume)
  implication: no app-side queue can build up during the pause; the context simply runs silent for the whole pause

- timestamp: 2026-10-12T15:20Z
  checked: headless Chromium 1194 (Playwright), dist built with --local, level 1-1, 3 shots, Escape (menu) 8 s, Escape, 3 shots; hooks on AudioBufferSourceNode/Oscillator start + Game.playCue
  found: every cue: engine event → src.start() within 0.1-0.2 ms, when == ctx.currentTime exactly, before and after the pause; ctx.currentTime vs performance.now drift over the 8.3 s pause = +2.9 ms; getOutputTimestamp latency estimate 32-40 ms before, during and after (baseLatency 0.01, outputLatency 0.032 constant); live sources 0 during the pause, ≤ 5 at any time; rolling loop restarted with when=0 on resume
  implication: the application layer is clean and Chromium headless (fake output) shows no lag — the lag must come from the real output pipeline of the browser, not from the game code; cannot reproduce here because WebKit is not available (only Chromium in /opt/pw-browsers)

- timestamp: 2026-10-12T15:40Z
  checked: WebKit source (GitHub main): WebKit/WebProcess/GPU/media/RemoteAudioDestinationProxy.cpp, WebKit/GPUProcess/media/RemoteAudioDestinationManager.cpp, WebCore/platform/audio/CARingBuffer.cpp, PushPullFIFO.cpp, AudioDestinationResampler.cpp (path used by Safari macOS and iOS: Web Audio renders in the WebContent process into a 2 s shared CARingBuffer read by the GPU process)
  found: GPU render(): `if (m_ringBuffer->fetchIfHasEnoughData(ioData, n, m_startFrame)) m_startFrame += n; else fadeOutToSilence(...)` then ALWAYS `incrementTotalFrameCount(n); m_renderSemaphore.signal()`; the WebContent thread renders `totalFrameCount - m_lastFrameCount` frames and stores them at m_currentFrame += n. The writer advances by every hardware buffer consumed, the reader only on a successful fetch, so each underrun ("common at stream start or under load", says the source) adds n frames to the write-ahead permanently; nothing ever shrinks it — m_startFrame / m_currentFrame are only zeroed when a new destination (new AudioContext) is created; suspend()/resume() stop and restart the AudioOutputUnit but keep both counters (the stale write-ahead is even replayed on restart)
  implication: on WebKit the output latency of a long-lived AudioContext is monotonic; once the pipeline has slipped (e.g. during the long silent stretch of the pause, or the unit restarting), every later sound is late by the same amount — the reported « persistent lag after pause » on Mac and iPhone; an AudioContext suspend/resume around the pause would NOT reset it (and adds a stream restart, i.e. one more chance of underrun); only a fresh AudioContext starts again at the minimal lead

- timestamp: 2026-10-12T15:45Z
  checked: WebKit AudioContext.cpp (shouldDocumentAllowWebAudioToAutoPlay, willBeginPlayback, constructor), MediaSessionManagerCocoa::updateSessionState, WebPageProxy::updateThrottleState
  found: a new AudioContext starts rendering only with transient activation (window->hasTransientActivation()) or after resume() inside one; AudioBuffers are context-independent; while the page is not audible the UI process drops the « View is playing audio » foreground assertion after 10 s; the preferred hardware buffer stays 128 frames while an AudioContext session exists; the session category is pinned by navigator.audioSession.type = 'playback' (categoryOverride), so closing one context while another exists does not deactivate the iOS audio session
  implication: a fresh context must be created inside the gesture that resumes the game (or deferred to the next gesture when navigator.userActivation.isActive is false); the decoded buffers, the volume and the iOS unlock (playback session, silent buffer, resume) can be carried over

## Resolution

root_cause: Not in the game logic — every cue already starts at ctx.currentTime and nothing is queued during the pause (measured in Chromium). The single AudioContext created at the first gesture lived for the whole session and ran silent through the MENU pause; on WebKit (Safari macOS and every iPhone browser) its output pipeline only ever gains latency — the GPU process reads a ring buffer that the WebContent process fills, each render underrun adds one hardware buffer of write-ahead that is never reclaimed, and suspend()/resume() keep it — so once the pipeline slipped during the pause every later sound was heard late by the same amount.
fix: AudioManager.resumeAfterPause() (src/audio.ts) — on every return to the game from a pause (closeMenu, togglePause un-pausing, closeStats of the live STATS; src/main.ts) a fresh AudioContext replaces the old one, created inside the resuming gesture and unlocked like the first (playback session kept, silent one-sample source, resume(), gesture listeners re-armed while it does not run); decoded AudioBuffers and the « Sons » volume are carried over; loops/pulses stop at once, the old context is closed OLD_CONTEXT_RELEASE_MS = 1500 ms later so the « Retour au jeu » click plays out. Without transient activation (navigator.userActivation.isActive false — e.g. Escape, iOS touch pointerdown) the swap waits for the next unlock() that has one; a context younger than 1.5 s is kept (at most two contexts at once); a decode cut short by the swap does not demote its key to the synth. No suspend on pause.
verification: tests/r225-audio-pause.test.mjs (8 tests; fake AudioContext whose write-ahead never shrinks: 173 ms late after the pause without the fix vs 2.7 ms before it → equal with the fix); npm test 615/615, npm run check, npm run -s guard green; Chromium end-to-end (build --local, Playwright): menu 8 s → Escape → new context running, old one closed after 1.5 s, shots after resume start on the new context at its currentTime with the reused buffers, latency estimate 33-40 ms as before. Real WebKit (Mac Safari, iPhone) still to be checked by the user.
files_changed: [src/audio.ts, src/main.ts, tests/r225-audio-pause.test.mjs]
