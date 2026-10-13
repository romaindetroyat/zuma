---
status: investigating
trigger: "Quand on met le jeu en pause en appuyant sur Menu, et qu'on reprend le jeu, le son est décalé des actions. C'est vrai sur Mac et sur iphone. Corrige ça pour que le son ne se décale pas en cas de pause"
created: 2026-10-12T00:00:00Z
updated: 2026-10-13T05:10:00Z
---

## Current Focus

second_pass: true (user on R2.0.25: « On a toujours le décalage après une pause » — ≥ 1 s late, Mac + iPhone, installed app and Safari/Chrome tab)
hypothesis: (A) cues started on a context that is not running (suspended / interrupted) queue at a frozen currentTime and sound only when a later gesture resumes it; (B) reproduce in Chromium with the real autoplay policy; (C) any other ~1 s delay
test: Chromium (no --autoplay-policy flag), real clicks / keys, per-cue log of ctx.state, currentTime, getOutputTimestamp
expecting: a cue logged with state != running or a currentTime that does not advance → A confirmed
next_action: write the Playwright probe in the scratchpad and run it against dist/ (build --local) on port 87xx

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

- timestamp: 2026-10-13T05:20Z
  checked: (second pass) Chromium 1194 headless WITH the real autoplay policy (no --autoplay-policy flag), build --local R2.0.25, level 1-1, real mouse clicks / touchscreen taps / keys; hooks on AudioContext construction + statechange, AudioBufferSourceNode/Oscillator start (state, currentTime, when, getOutputTimestamp), navigator.userActivation per event; close paths Escape, Enter (« Retour au jeu » focused), mouse click on « Retour au jeu », touch tap on it; pauses 4 s, 8 s, 40 s
  found: every cue before and after the pause starts on a running context at when == currentTime, 1-23 ms after the pointerdown; getOutputTimestamp: currentTime − contextTime = 0.04 s, performance.now − performanceTime 0-10 ms (lag ≈ 35-50 ms) before and after; Escape keydown has no transient activation (userActivation.isActive false) → swap deferred to the next shot's pointerdown (ctx#2 created running at once, sticky activation); Enter / click / tap → ctx#2 created running inside the gesture; old context closed 1.5 s later; during the 40 s silent pause currentTime lost ≈ 90 ms against the wall clock (render discontinuities while silent) but nothing is late afterwards
  implication: no ≥ 1 s lag reproducible in Blink (headless, fake output device); the R2.0.25 swap works there. A Blink running context cannot hold more than its FIFO (≈ 0.25 s) of write-ahead, so a ≥ 1 s persistent lag on "Chrome" is either Chrome on iOS (WebKit) or a context whose clock is not running (cues queued at a frozen currentTime and heard at the next resume)

- timestamp: 2026-10-13T05:30Z
  checked: web (Apple developer forums 699192, WebKit bug 221334)
  found: reports of WebKit AudioContexts with "extreme delay (up to ~1500 ms)" on iPhone (Chrome iOS = WebKit), more readily after the audio-producing page sat idle; Mac Safari "almost always around a 1 second delay" in an A/V sync test (bug 221334, still NEW)
  implication: a ≥ 1 s output delay of a *running* WebKit context is a known, unfixed engine behaviour, i.e. outside the game's scheduling; the game can only detect it (getOutputTimestamp, clock stalls) and rebuild, or refuse to play late

- timestamp: 2026-10-13T05:35Z
  checked: R2.0.25 AudioManager.play() / setLoop / unlock / resumeAfterPause
  found: play() schedules at ctx.currentTime whatever ctx.state is (suspended / interrupted / a running context whose clock is stalled) — such a cue is held at the frozen time and heard whenever the context next starts (the next gesture: about one tap later, ≈ 1 s); nothing measures the real output delay; the swap is blind (always on resume, never when lag appears later); no on-device diagnostic
  implication: the fix must (1) never let a cue be heard late: a cue started while the context is not live is revoked if the context does not start within a short grace, (2) measure the output lag and rebuild the context in the next gesture when it is too high, (3) expose a diagnostic overlay for the user's devices

## Resolution

root_cause: Not in the game logic — every cue already starts at ctx.currentTime and nothing is queued during the pause (measured in Chromium). The single AudioContext created at the first gesture lived for the whole session and ran silent through the MENU pause; on WebKit (Safari macOS and every iPhone browser) its output pipeline only ever gains latency — the GPU process reads a ring buffer that the WebContent process fills, each render underrun adds one hardware buffer of write-ahead that is never reclaimed, and suspend()/resume() keep it — so once the pipeline slipped during the pause every later sound was heard late by the same amount.
fix: AudioManager.resumeAfterPause() (src/audio.ts) — on every return to the game from a pause (closeMenu, togglePause un-pausing, closeStats of the live STATS; src/main.ts) a fresh AudioContext replaces the old one, created inside the resuming gesture and unlocked like the first (playback session kept, silent one-sample source, resume(), gesture listeners re-armed while it does not run); decoded AudioBuffers and the « Sons » volume are carried over; loops/pulses stop at once, the old context is closed OLD_CONTEXT_RELEASE_MS = 1500 ms later so the « Retour au jeu » click plays out. Without transient activation (navigator.userActivation.isActive false — e.g. Escape, iOS touch pointerdown) the swap waits for the next unlock() that has one; a context younger than 1.5 s is kept (at most two contexts at once); a decode cut short by the swap does not demote its key to the synth. No suspend on pause.
verification: tests/r225-audio-pause.test.mjs (8 tests; fake AudioContext whose write-ahead never shrinks: 173 ms late after the pause without the fix vs 2.7 ms before it → equal with the fix); npm test 615/615, npm run check, npm run -s guard green; Chromium end-to-end (build --local, Playwright): menu 8 s → Escape → new context running, old one closed after 1.5 s, shots after resume start on the new context at its currentTime with the reused buffers, latency estimate 33-40 ms as before. Real WebKit (Mac Safari, iPhone) still to be checked by the user.
files_changed: [src/audio.ts, src/main.ts, tests/r225-audio-pause.test.mjs]
