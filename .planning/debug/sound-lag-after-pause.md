---
status: awaiting_human_verify
trigger: "Quand on met le jeu en pause en appuyant sur Menu, et qu'on reprend le jeu, le son est décalé des actions. C'est vrai sur Mac et sur iphone. Corrige ça pour que le son ne se décale pas en cas de pause"
created: 2026-10-12T00:00:00Z
updated: 2026-10-13T05:40:00Z
---

## Current Focus

second_pass: true — user on R2.0.25: « On a toujours le décalage après une pause » (≥ 1 s, clearly visible; Mac and iPhone; installed app and Safari / Chrome tab; R2.0.25 installed before testing)
hypothesis: the ≥ 1 s lag is not reproducible in Blink and cannot be produced by the game's scheduling; it comes from the audio engine of the device — either a context that is not live when a cue starts (suspended / interrupted / stalled clock: the cue waits and sounds at the next start, ≈ one tap later) or a running WebKit context whose output drifts late (known, unfixed WebKit behaviour, up to 1.5 s); R2.0.25's blind swap on resume neither prevented the first nor caught a drift that comes back later
test: R2.0.26 build on the user's devices, with https://zuma-49c.pages.dev/?debug=audio opened in Safari (Mac and iPhone): play, MENU ≥ 10 s, « Retour au jeu », shoot; read the overlay (state, retard, départ, reconstructions, sons annulés)
expecting: no late sound; if a lag is still heard, the overlay screenshot says which branch (retard ≫ départ → measured drift, rebuilt at the next tap; sons annulés > 0 → non-live context; retard normal while heard late → the lag is outside what WebKit reports, e.g. Bluetooth / AirPlay route)
next_action: wait for the user's check (R2.0.26 build and deploy by the orchestrator) and, if the lag persists, the ?debug=audio screenshot

reasoning_checkpoint:
  hypothesis: "Sounds are heard ≥ 1 s late after a pause because the cue is started on a context that is not live (held at its frozen currentTime and heard when the context next starts) or because the running WebKit context's output drifted late; R2.0.25 neither guarded the first nor measured the second"
  confirming_evidence:
    - "R2.0.25 play() starts every cue at ctx.currentTime whatever ctx.state is; nothing watched the clock or the output timestamp"
    - "Chromium, real autoplay policy: a cue played on a context that cannot resume is held (start logged on state=suspended, when == frozen currentTime) — R2.0.25 would play it at the next resume; with R2.0.26 it is revoked after 100 ms (revoked=1) and the next click plays on time"
    - "Chromium: every way back from the MENU (Escape, Enter, click, tap; 4 / 8 / 40 s) is on time (lag 35-50 ms), so the ≥ 1 s comes from the device's engine, consistent with WebKit reports of 1-1.5 s AudioContext delays (Apple forums 699192, WebKit bug 221334)"
  falsification_test: "With R2.0.26 the user still hears ≥ 1 s late sounds while the ?debug=audio overlay shows state running, retard close to départ and sons annulés 0 → the lag is in a part of the output path WebKit does not report (route / Bluetooth / AirPlay) and neither branch is the cause"
  fix_rationale: "Revoking cues the clock did not reach in time removes the 'heard a tap later' mechanism at its root, whatever suspends the context; measuring getOutputTimestamp against the context's own start and rebuilding at the next gesture self-heals a drifting pipeline instead of guessing when it drifts; the overlay turns the next report into data"
  blind_spots: "No WebKit engine here (only Chromium in /opt/pw-browsers): whether WebKit's getOutputTimestamp reflects the GPU-process ring-buffer write-ahead is unverified; the user's output route (AirPods, AirPlay, HDMI) is unknown; « Chrome » may be Chrome on iPhone (WebKit)"

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

- hypothesis: (second pass, B) Blink reproduces a ≥ 1 s lag after a pause with the real autoplay policy
  evidence: Chromium 1194 without --autoplay-policy, real clicks / taps / keys, Escape / Enter / click / touch tap on « Retour au jeu », pauses 4 / 8 / 40 s: every cue on a running context at when == currentTime, 1-23 ms after the input; getOutputTimestamp lag 35-50 ms before and after; a running Blink context cannot hold more than its FIFO (≈ 0.25 s)
  timestamp: 2026-10-13T05:20Z

- hypothesis: (second pass, A) R2.0.25's fresh context stays suspended in Chrome because the gesture gate fails
  evidence: Chrome starts contexts on sticky activation: ctx#2 is 'running' at construction on every path; Escape is not an activation (userActivation.isActive false) → swap deferred to the next pointerdown, which has one; unlock listeners are re-armed by syncListeners. (In WebKit a new context starts on window.hasTransientActivation() — 5 s window — not checked on device.)
  timestamp: 2026-10-13T05:20Z

- hypothesis: (second pass, C) a performance.now-derived schedule, a delay field, the warning beat or the rAF loop delays cues by ~1 s after a pause
  evidence: only extralife / gap cues have a delay (≤ 0.6 s, by design, before and after a pause alike); cueAllowed only drops; the warning beat calls play() at currentTime; loop() runs no engine step while paused (no event backlog); sound and picture come from the same engine step
  timestamp: 2026-10-13T05:25Z

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

- timestamp: 2026-10-13T05:45Z
  checked: R2.0.26 end to end in Chromium (build --local, ?level=1-1&debug=1&debug=audio, real clicks): normal play, MENU 6 s + Enter, a cue on a context forced suspended with resume() refused, then an injected 1.2 s output lag (getOutputTimestamp shifted)
  found: normal play lag 35-37 ms, ref 35-37 ms, 0 revoked; after the pause ctx#2 (rebuild 'pause'), lag 36 ms; the cue on the stuck context was started at state=suspended, when == frozen currentTime and revoked after the grace (revoked=1), the next click resumed the context and played on time; with 1.2 s injected the overlay showed « retard 1236 ms (départ 35 ms) … à refaire: lag », the next click rebuilt the context (ctx#3, rebuilds 2 (lag)) and the lag fell back to 35 ms; overlay drawn top-left only with ?debug=audio
  implication: both mechanisms work on a real engine; npm test 627/627 (r226: 11 tests), check and guard green

## Resolution

root_cause: (second pass) The game's scheduling is on time (Chromium: every cue at currentTime, 35-50 ms output lag, on every way back from a pause). The ≥ 1 s lag lives in the device's audio engine, and R2.0.25 left two doors open: (1) play() started cues at ctx.currentTime whatever the context state — on a context that is not live (suspended, iOS « interrupted », or « running » with a stalled clock) the cue waited at the frozen time and was heard when the context next started, i.e. about one tap (≈ 1 s) later; (2) a running WebKit context whose output drifts late (WebKit reports of 1-1.5 s AudioContext delays) was replaced only blindly at the moment of resume, never measured, so a drift that appears or comes back later stayed for the rest of the level. R2.0.25's first-pass analysis (WebKit ring-buffer write-ahead that only grows) remains a plausible source of (2) but was not observable here.
fix: R2.0.26 — src/audio.ts: every one-shot is watched until its context's clock passes its start (track / settlePending); one still waiting LATE_CUE_GRACE_MS (100 ms) after it was due is revoked (stop(0) + output disconnected) and the context is asked to resume — never heard late, a context that starts within the grace (Safari's first gesture) still plays it. AudioManager.tick(), called every frame from main.ts loop(): clock watch (running but not moving for CLOCK_STALL_MS = stalled, not live), output lag = currentTime − (contextTime + (now − performanceTime)/1000) from getOutputTimestamp once the clock passed 1 s; the median of the first 10 samples is the context's reference; a 15-frame median LAG_LIMIT_S (150 ms) above it, a reference 150 ms above the latency the browser reports (≤ MAX_LAG_RETRIES = 2 contexts in a row: no rebuild loop on a slow Bluetooth / AirPlay route), a clock stalled or a context not running 1 s after a gesture resume → rebuild at the next gesture (unlock(), listeners re-armed while a rebuild waits; at most one automatic request per 3 s). R2.0.25's fresh context on resume is kept. ?debug=audio (audioDebugEnabled) draws audioDebugLines(diagnostics()) top-left: state, currentTime, sample rate, base/output latency, measured lag and the context's reference, contexts created, rebuilds and last reason, pending rebuild, revoked / pending cues, transient activation, sound on/volume. Decoded buffers, « Sons » volume and the iOS unlock (playback session, silent buffer, silent <audio>, resume in gesture) unchanged.
verification: tests/r226-audio-lag.test.mjs (11 tests, RED first: fake AudioContext with suspended / interrupted / stalled states and getOutputTimestamp) + r225 (8) green; npm test 627/627, npm run check, npm run -s guard green; Chromium E2E (see last evidence): stuck-context cue revoked and next click on time, injected 1.2 s lag rebuilt at the next click back to 35 ms. Real WebKit (Mac Safari, iPhone) still to be checked by the user, with ?debug=audio if anything is still late.
files_changed: [src/audio.ts, src/main.ts, tests/r225-audio-pause.test.mjs, tests/r226-audio-lag.test.mjs]
