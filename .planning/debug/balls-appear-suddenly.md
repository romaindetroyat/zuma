---
status: awaiting_human_verify
trigger: "« J'ai parfois un bug d'affichages des lignes, des boules... certaines apparaissent subitement »"
created: 2026-10-12T04:41:07Z
updated: 2026-10-12T07:15:00Z
---

## Current Focus

hypothesis: four independent mechanisms make balls appear / disappear / be drawn off-track without a legitimate cause (ranked by visibility x frequency): H-swap (new level drawn over the previous board), H-spawn (mid-track refill burst), H-recoil (recoil teleport of the rear chain), H-entrance (balls drawn before the curve start on inversespiral)
test: tests/r223-appear.test.mjs — one RED test per mechanism, then the minimal fix of each, then npm test / check / guard and the detector + Chromium probes again
expecting: RED x4 before, GREEN x4 after, detector: 0 mid-track refill bursts, 0 teleports > 30 px after « PARTEZ », 0 APPEAR at s < 0; swap-probe: 0 mismatched frames
next_action: write tests/r223-appear.test.mjs and run it against the current .compiled (must fail on the 4 locks)

reasoning_checkpoint:
  hypothesis: "(1) startLevel assigns the new engine before awaiting levelArt, so frames draw the new chains with the previous LevelView; (2) spawnBalls places every new ball at rear.s - spacing in a loop, so when the rearmost (queued) ball is destroyed the whole stretch entrance..next ball is refilled in one tick; (3) pushBehind walks the list order and resolves in one tick overlaps between alive and exploding balls that predate the recoil, shifting the rear chain by ~one spacing per overlap (97 px observed); (4) boardBalls draws balls from s = -16, extrapolated before the curve start, which on inversespiral is outside the skull cutout."
  confirming_evidence:
    - "swap-probe: 25 frames (400 ms) with view 1-1 / engine 1-2, screenshot of the claw chain over the spiral board; 1 frame even on localhost without delay"
    - "replay 2-5/1000: destroy(4) includes queued ball 160@-14; t1372 spawnBalls creates 25 balls 735..-22 in one tick; Chromium frame 16 -> 43 balls"
    - "replay 1-1/16838: list ...21@850,20x@844,59x@876,19x@908,16@882...; t370 recoil -> 19x set to 849.4 ... 21 to 753.4, maxMove 99.1 px in node and Chromium"
    - "cover-start: cutout coverage 0.40 at s=-16 on inversespiral, zoomed frame shows the ball popping above the skull; original 0x418510 places pending balls at waypoint 1 only"
  falsification_test: "after each fix the matching RED test turns green AND the detector/probes on the same seeds no longer report the event; if a burst/teleport/pop is still reported on those seeds the mechanism is wrong or incomplete"
  fix_rationale: "(1) build the art before publishing level/engine/view together (no await in between) — removes the state where engine and view disagree; (2) a ball is placed right behind the rear ball only while that rear ball is the last one fed through the entrance, otherwise it enters behind the entrance (0x418510 never places a ball mid-track) — removes mid-track creation without touching the contiguous fast feed; (3) a ball pushed by pushBehind never moves more than the ball in front of it moved this step — identical result when there was no overlap (r219 recoil through exploding balls kept), no instant resolution of pre-existing overlaps; (4) draw a ball only once it is on the curve (s >= 0), like the original that never draws pending balls."
  blind_spots: "the original's exact handling of exploding balls during attraction/insertion growth (why alive balls can roll through exploding ones) is not established — fix (3) removes the teleport but leaves the visual overlap of a fading ball; the bot is not a human player (frequency of each mechanism in real play unknown); H-swap duration depends on the device / network; the user's level and device are still unknown."

## Symptoms

expected: balls of the chain roll in continuously from the entrance hole, pass under tunnels only at tunnel mouths, never pop in/out mid-track; curve "lines" drawn consistently
actual: "sometimes" (intermittent) display bug of lines and balls; some balls appear suddenly
errors: none reported
reproduction: unknown (no level, device or screenshot given yet)
started: reported on R2.0.22 (deployed, branch claude/blissful-edison-qmc2f8)

## Eliminated

- hypothesis: H4 rAF catch-up (tab hidden / slow frame) makes balls jump
  evidence: main.ts caps dt at 0.1 s and 6 steps per frame; detector max 6-tick displacement = 240 px but only during the fast intro feed (35-45 px/tick by design, feedSpeed); after « PARTEZ » the largest legit per-tick motion is the attraction (<= 28 px/tick). A catch-up frame scales motion, it never creates/teleports balls. Not a creator of sudden balls.
  timestamp: 2026-10-12T05:20Z

- hypothesis: H1 tunnel / priority passes (D-23) draw a hidden ball at the wrong time
  evidence: tunnel-probe (real cutout alpha, 9 tunnel boards x 2 seeds x 120 s): 0 visibility pops caused by a pass change after « PARTEZ ».
  timestamp: 2026-10-12T06:15Z

- hypothesis: same-chain overlap of settled alive balls (resolveForward failure)
  evidence: OVERLAP_ALIVE = 0 over 304 runs (80 pack levels x 4 seeds x up to 240 s).
  timestamp: 2026-10-12T05:20Z

- hypothesis: D-35 ZUMA pushback deleting balls is a bug
  evidence: every entrance VANISH (32 cases) is a `ball-exit` at s < 1 in ZUMA mode on boards whose start is at the screen edge (1-4 x=648, 2-5, 9-7, 12-7); this is the original rule (0x423b60 -> 0x423970, 05-RESEARCH-04 Q5) — faithful, not a regression.
  timestamp: 2026-10-12T05:20Z

## Evidence

- timestamp: 2026-10-12T04:50Z
  checked: src/render.ts boardBalls/drawBoardBall/drawPasses
  found: a ball is drawn iff -r <= s <= length + r (r = 16); position = track.pointAt(s) (extrapolated before 0), or insertionPose(width, enterFrom, slot) while width < 1; pass = track.ballPriority(s) = max(priority(s-16), priority(s+16)); exploding balls fade (alpha, scale) over destroyTicks. No hole/cover is drawn at the track START in pack mode (drawHoles only draws the skull end).
  implication: any change of s across -16, any discontinuity of s, or any ball created with s >= -16 shows up immediately on screen when the start of the track is on screen.

- timestamp: 2026-10-12T04:50Z
  checked: src/core.ts spawnBalls (l.931-942)
  found: `while (chain.spawned < total) { rear = min-s ball (exploding included); s = rear ? rear.s - 32 : 0; if (rear && s < -32) break; unshift(ball at s) }` -> it loops until the rear ball is in [-32, 0): if the rear ball is ever at s = X >> 0 it creates ceil(X/32) balls in a single tick at X-32, X-64, ... (mid-track, already visible).
  implication: candidate mechanism for "balls appear suddenly" whenever the rearmost (queued) ball disappears while the next ball is far along the track.

- timestamp: 2026-10-12T04:50Z
  checked: src/core.ts runAround / destroyRun / blast / moveProjectiles
  found: moveProjectiles skips balls with s < 0 (cannot be hit) but runAround does not check s: a match at the rear extends into the queued ball(s) at s in [-32, 0) if same colour and touching; blast() takes every alive ball within 72 px, s < 0 included. While exploding, the rear ball still counts as `rear` in spawnBalls (no spawn for 24 ticks); after processRemovals the rear jumps forward.
  implication: two concrete triggers for the refill burst in normal play (rear-group match, bomb near the entrance).

- timestamp: 2026-10-12T04:50Z
  checked: pack curves (25 curve files)
  found: several tracks START ON or at the edge of the screen: inversespiral (244,170, tunnel+pri0 under a cutout), snakepit-1 (494.7,-10.3), tiltspiral (296.9,-11.6), turnaround (69.9,495), coaster (-15,63.6), claw (-20,133.6); all curves have ~1 px vertex spacing (layerAt nearest-vertex is exact enough).
  implication: on most boards the first ~50-100 px of track are visible; balls created there pop in.

- timestamp: 2026-10-12T04:50Z
  checked: src/main.ts loop (l.534-572)
  found: dt = min(0.1 s, frame delta); at most 6 engine steps per rAF frame; accumulator reset while paused/STATS/menu; off-level screens keep lastTime fresh.
  implication: catch-up after a hidden tab / slow frame is bounded to 6 ticks (100 ms) of motion per drawn frame; to be quantified by the detector (max 6-tick displacement).

- timestamp: 2026-10-12T05:20Z
  checked: detector scratchpad/detect.mjs, 80 pack levels x 4 seeds x 240 s, bot shooting every 9-33 ticks (70 % aimed at a visible ball, 80 % of those of its colour), lives 99
  found: TOTAL appear 5249 (mostly entrance), appearSpawnMid 125, vanish 45 (32 entrance ball-exit, 13 mid-track), jump>12px 5705 (feed + attraction), overlap 0, burst 1605 (mostly 2-ball intro / dual chains). Mid-game multi-ball refill bursts on ONE chain: 2-5/1000 t1372 (25 balls, s -22..746, 24 visible), 6-2/1000 t422 (16, 14 visible), 6-4/1000 t953 (8), 9-4/1000 t265 (7), 2-5/8919 t1585 (5), 3-5, 6-4, 6-5 (3 each).
  implication: H-spawn confirmed by observation, ~8 occurrences / 304 runs.

- timestamp: 2026-10-12T05:25Z
  checked: replay.mjs 2-5 (snakepit, chain 1 starts at (137,485) on the bottom edge) seed 1000 t1100-1373
  found: t1347 destroy(4) marks 160@-14.0 (queued ball, s<0), 154@18, 159@50, 136@82 — the run reached the queued ball; next alive ball is 26@767. For 24 ticks the exploding 160 stays `rear` (no spawn); t1371 removal; t1372 spawnBalls creates 25 balls at 735, 703, ..., 9.5, -22.5 in ONE tick.
  implication: mechanism of H-spawn fully explained: runAround/blast include not-yet-entered balls (s<0) and spawnBalls refills mid-track.

- timestamp: 2026-10-12T05:30Z
  checked: original Zuma.exe 0x418510 (pending ball entry, scratchpad/exe/dis.txt)
  found: the front pending ball is positioned with 0x407400(ball, 1.0f) = waypoint 1 (curve start); it is added only if the first ball's position >= 1.0 and 0x401820 says it does not overlap the first ball; one ball per maj; never anywhere else.
  implication: the original never creates a ball mid-track; our `rear.s - spacing` loop is a deviation once the rearmost ball has been removed.

- timestamp: 2026-10-12T05:35Z
  checked: JUMP > 25 px after « PARTEZ », tagged with list order and recoils
  found: 6 teleports of 47-99 px in ONE tick, all backwards, all with `chain.balls` out of s order before the step and a contact recoil running: 1-1/16838 t370 (99 px, 26 balls, 3 balls pushed from s 10-52 to below -16 = vanish, reappear later), 2-2/24757 t1146 (97), 3-2/16838 t504 (94), 5-5/24757 t169 (97), 9-4/8919 t1018 (97), 12-4/8919 t367 (48).
  implication: second, independent mechanism (H-recoil).

- timestamp: 2026-10-12T05:40Z
  checked: replay2.mjs 1-1 seed 16838 t300-371
  found: t355 shot match marks 20@844.4, 59@876.4, 19@908.4 exploding (they stay put). Insertion growth in the segment behind pushes alive 21 forward to 850.2 (into exploding 20), and the attracted segment led by 16 (attract from an earlier removal, bounded only by ALIVE balls) rolls back through 19 and 59 to 882.2. List order is now ...21@850, 20x@844, 59x@876, 19x@908, 16@882... t369 junction 21|16 -> recoil on 31 (50 px/s). t370 applyRecoils -> pushBehind(list, idx) walks LIST order: 19x (908, "behind" 16) is set to 849.4, 59x to 817.4, 20x to 785.4, 21 to 753.4, and every ball behind follows: the whole rear chain jumps back 97 px in one tick (61 from -11.5 to -110.6, 53 from 52.5 to -46.6).
  implication: pushBehind resolves in one tick overlaps that predate the recoil (alive balls that rolled through stationary exploding balls), each costing up to a spacing; r219 locks that the recoil pushes exploding balls too, so the fix must keep that and only stop the instant resolution.

- timestamp: 2026-10-12T05:45Z
  checked: src/main.ts startLevel (l.501-530) + dispatch/applyEffect (l.950-966)
  found: dispatch switches the screen to 'level' synchronously, then beginRun -> startLevel is async: `this.engine = new ZumaEngine(new tracks)` (l.515) happens BEFORE `await this.pack.levelArt(graphics)` (l.524) and `renderer.setLevel(view)` (l.526). While the art of a level not yet in the image cache loads (background + cutouts fetched/decoded), every rAF frame steps the new engine and draws its chains with the PREVIOUS level's view (background, tunnel cutouts, skull holes).
  implication: third candidate (H-swap): on the first visit of a level, the new chain is drawn over the previous board for N frames, then the board switches and the chain is already advanced. To confirm in Chromium.

- timestamp: 2026-10-12T06:00Z
  checked: Chromium (dist --local on :8431, ?level=1-1&debug=1), scratchpad/swap-probe.mjs: wraps Renderer.draw, starts 1-2 (claw) via game.beginRun with the claw art delayed 400 ms by page.route
  found: 25 consecutive drawn frames (400 ms) where the renderer's view is still 1-1 « Spirale du destin » while the engine drawn is 1-2's (2 -> 18 balls drawn, engine advanced 24 ticks); screenshot shots-r223/before/swap-1-mismatch-1.png shows the claw chain as a line of balls off the track over the spiral board, with the old « ATTENTION / SPIRALE DU DESTIN NIVEAU 1-1 » banner. Without any added latency on localhost: still 1 mismatched frame.
  implication: H-swap CONFIRMED in the real renderer; it happens on the first visit of every new level (art not in the image cache) and lasts as long as the art takes to load/decode.

- timestamp: 2026-10-12T06:05Z
  checked: Chromium frame-probe.mjs (engine rebuilt in page like detect.mjs, game loop stopped, Renderer.draw with the pack)
  found: 2-5 seed 1000 t1371 -> t1372: chain 1 goes from 16 to 43 balls in one frame; screenshots before/2-5-seed1000-t1371.png / t1372.png show the whole outer left loop filled at once. 1-1 seed 16838 t369 -> t370: maxMove 99.1 px, 3 drawn balls vanish (identical to node).
  implication: H-spawn and H-recoil reproduce in the real renderer.

- timestamp: 2026-10-12T06:15Z
  checked: Chromium tunnel-probe.mjs on the 9 tunnel boards (2-2, 2-4, 3-2, 3-4, 3-5, 5-6, 6-6, 8-7, 9-7) x 2 seeds x 120 s: per-ball visible fraction from the real cutout alpha (pass >= 1 -> above, pass 0 -> 1 - mean cutout alpha on the disc)
  found: after « PARTEZ », 0 visibility pops caused by a pass change (flipPops = 0 over 4 237 pass flips); the 18 pops left are attraction moves of 12-20 px/tick through a tunnel mouth with the same pass.
  implication: H1 (D-23 passes) eliminated as a cause.

- timestamp: 2026-10-12T06:20Z
  checked: cover-start.mjs on 9-7 (inversespiral, start (244,170) in the middle of the board under the skull cutout) + frame-probe 9-7 seed 1000 t312/t313
  found: cutout coverage of a ball at s=-16/-8/0/16 = 0.40/0.73/0.98/1.00. The renderer draws balls from s >= -16, extrapolated BEFORE the first curve point, i.e. above the carved skull, off the track: each new ball pops in there 60 % visible then slides under the cutout (shots-r223/before/9-7-seed1000-t313-zoom.png). Detector: 74-82 APPEAR events per run on 9-7 / 12-7 (one per entering ball).
  implication: fourth mechanism (H-entrance), on the inversespiral boards (9-7, 12-7) for every entering ball. The original never draws a pending ball: 0x418510 puts it on the curve at waypoint 1 (cover 0.98 there), and balls under 1 px leave the curve.

## Detector
<!-- tools used (session scratchpad /tmp/claude-0/-home-user-zuma/10af772b-439d-52df-b16e-f3c5e1ea6b00/scratchpad, not committed: they read the private pack) -->

- detect.mjs <repo> [--seeds --horizon --levels --json]: every pack level built like main.ts (configFromSettings, treasure points, lives 99), seeds 1000 + 7919 k, bot shooting every 9-33 ticks (70 % at a visible ball, 80 % of those of its colour, 10 % swaps, else random point). Per tick it mirrors Renderer.boardBalls/drawBoardBall (render.js rule when exported, insertionPose, destroy fade) and flags: APPEAR (ball drawn now, not last tick, >= 25 % on screen, classified spawn mid-track / entrance / other), VANISH (drawn last tick, gone now, not at the end of its fade, entrance / mid / skull), JUMP (> 12 px in one tick after « PARTEZ », tagged list-unsorted / recoil / pushback / RECUL), OVERLAP of settled alive balls, SPAWN_BURST (several balls created in one tick), pass flips, max 6-tick displacement (worst rAF catch-up). 304 runs in ~100 s.
- replay.mjs / replay2.mjs <repo> <label> <seed> <from> <to>: same bot, per-tick dump of each chain (ids, s, exploding x, width w, colour, attract A, recoils, events).
- swap-probe.mjs <port> <out> <delayMs>: Chromium on dist --local, wraps Renderer.draw and counts frames whose LevelView does not belong to the engine drawn, while 1-2's art is delayed by page.route.
- frame-probe.mjs <port> <out> <label> <seed> <tick>: rebuilds the detector's engine in the page, stops the game loop, draws t-1 / t with the game's Renderer and the pack, screenshots + max move / appeared / vanished.
- tunnel-probe.mjs / cover-start.mjs / entrance-probe.mjs: real cutout alpha -> visible fraction of each ball (pass changes, curve start, first drawn frame).
- Screenshots: scratchpad/shots-r223/before and /after (never committed).

## Ranking (visibility x frequency, evidence)

1. H-swap — new level's chains drawn over the previous board (balls lined up off the track, wrong banner) for as long as the art loads, then the board switches and the chain is already advanced: EVERY first visit of a level; 25 frames at 400 ms latency, 1 frame on localhost. Best match for « affichage des lignes, des boules ».
2. H-spawn — up to 25 balls created at once along the track (2-5 seed 1000 t1372; 6-2: 16; 6-4: 8; 9-4: 7): ~8 / 304 runs of 4 min, more on boards where the bot clears the rear group; triggered by a match reaching the queued ball or a bomb near the entrance.
3. H-recoil — rear chain teleported back 47-99 px in one frame, balls near the entrance vanish then come back: 6 / 304 runs (1-1, 2-2, 3-2, 5-5, 9-4, 12-4).
4. H-entrance — every entering ball pops in above the skull on 9-7 and 12-7 only (inversespiral), 60 % visible.

## Questions for the user (to narrow down if it still happens)

- Which level(s) (S-L shown at the top) and was it right after a level started (first seconds, « ATTENTION ») or in the middle of play?
- Did the balls appear in a whole row at once along the track (refill), jump backwards (recoil), or show up off the track over a different board (level switch)?
- Device / browser / installed PWA or browser tab, and was the network slow (first visit of that level)?
- A screenshot or screen recording; failing that, the score and the moment (after a bomb? after clearing the balls near the entrance?).

## Resolution

root_cause: |
  Four independent defects, all producing "balls appear/disappear suddenly" or "lines of balls drawn wrong":
  1. H-swap (src/main.ts startLevel): the new ZumaEngine is published (this.engine) before `await this.pack.levelArt()`; until the art is loaded the loop steps and draws the new level's chains over the previous level's LevelView (background, cutouts, holes, old banner). Every first visit of a level; 1 frame on localhost, 25 frames with 400 ms art latency.
  2. H-spawn (src/core.ts spawnBalls): new balls are placed at `rear.s - ballSpacing` in a loop; when the rearmost balls including the queued one (s < 0) are destroyed (match run reaching the queue — runAround does not check s — or a bomb near the entrance), the next tick creates ceil(X/32) balls along the whole track up to the next ball (25 balls in one frame on 2-5). The original (0x418510) only ever enters one pending ball per maj at waypoint 1.
  3. H-recoil (src/core.ts pushBehind): alive balls can roll into stationary exploding balls (insertion growth, attraction bounded by alive balls only), leaving chain.balls out of curve order with overlaps; the next contact recoil walks the list and resolves those overlaps in one tick, shifting the whole rear chain back by up to ~100 px and pushing balls near the entrance off screen (they come back later).
  4. H-entrance (src/render.ts boardBalls): balls are drawn from s = -r (before the curve start, extrapolated); on inversespiral (9-7, 12-7) the start lies under the skull cutout and the extrapolation leaves it, so every entering ball pops in above the skull, off the track.
fix: |
  Branch dbg-appear (worktree /home/user/zuma-dbg), TDD: RED commit f261df7 (tests/r223-appear.test.mjs, 4 failing locks + 1 contiguity guard), then GREEN:
  1. src/main.ts startLevel: `const level = await resolveLevel(); const art = await pack.levelArt(level.graphics)`, then this.level / new engine / renderer.setLevel(view) in one synchronous block (no await in between).
  2. src/core.ts spawnBalls + Chain.fedId: a new ball goes right behind the rear ball only while that rear ball is the last one fed through the entrance (fast feed stays contiguous, several per tick); otherwise it enters at s = -spacing (behind the entrance). loadFixture marks the fixture's rearmost ball as fed (fixture semantics unchanged).
  3. src/core.ts pushBehind(list, idx, moved): a pushed ball never moves more than the ball in front of it moved in this push (applyRecoils passes speed x dt, zumaPushback its 100 px/s step). Identical when no overlap predates the push; r219 "recoil pushes the exploding balls too" unchanged.
  4. src/render.ts: exported boardBallVisible(s, length, radius, startOnStage) and onStage(p); boardBalls draws s in [0, length + r] when the curve starts on the stage (only inversespiral), [-r, length + r] otherwise (unchanged elsewhere).
verification: |
  - tests/r223-appear.test.mjs: 4 RED before (tick 25 ball created at s = 12.0; ball moved 96.83 px in one tick; this.level after the last await; boardBallVisible missing), 5/5 GREEN after.
  - npm test: 578/578 pass (573 before + 5); npm run check OK; npm run -s guard: 596 tracked files, none proprietary.
  - Detector, same 304 runs (80 pack levels x 4 seeds x 240 s): mid-game refill bursts 10 -> 0, teleports > 30 px 6 -> 0, mid-track vanish 13 -> 0, post-feed appearances with >= 25 % on screen 112 -> 61 (all left on 9-7/12-7 at s >= 0, under the skull cutout: real first-frame visibility 2 % in Chromium), max per-tick jump 99.1 -> 40.7 px (intro feed only, by design).
  - Chromium swap-probe: mismatched frames 25 -> 0 with 400 ms art latency, 1 -> 0 without.
  - Chromium frame-probe 1-1 seed 16838 t369->t370: maxMove 99.1 px / 3 vanished -> 0.8 px / 0 vanished. 9-7 entrance zoom: the ball above the skull is gone (shots-r223/after/9-7-seed1000-t313-zoom.png).
  - Not verified: the user's own device / level (unknown), real-player frequency.
files_changed: [src/core.ts, src/main.ts, src/render.ts, tests/r223-appear.test.mjs]
