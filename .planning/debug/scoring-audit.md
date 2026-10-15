---
status: awaiting_human_verify (second pass on gap shots fixed on q-gap, 2026-10-15)
trigger: "« J'ai l'impression que les scores ne reflètent pas vraiment les scores du jeu d'origine. Je voudrais que tu vérifies notamment les scores attribués quand on tire dans les brèches. J'ai l'impression que c'est sous noté... »"
created: 2026-10-12T00:00:00Z
updated: 2026-10-15T00:00:00Z
second_trigger: "« Je doute aussi de la qualité du calcul des points lors de tirs dans les brèches, et je doute aussi que toutes les brèches soient bien considérées. J'ai l'impression que parfois ça compte comme une brèche alors que ça ne devrait pas, et parfois l'inverse. »"
---

## Current Focus

Fix committed on `q-score` (cb06aff RED, 7f48733 GREEN). 585/585 tests, check and guard green. Waiting for the user to check
gap play in a real game (R2.0.24 build by the orchestrator). **FLAG**: the per-gap amounts go DOWN (the original measures
the gap between centres); the under-scoring the user feels comes from the chain (ENCHAÎNEMENT) being broken by gap-closing
shots, which goes UP. See « Pour l'utilisateur » and « Decision for the user ».

reasoning_checkpoint:
  hypothesis: "Gap play was under-scored because settle() reset the chain on every shot that did not match — including the 'waiting' shot that lands across a gap from its colour and makes the segments attract — and dropped that shot's gap bonus, whereas the original keeps both (0x421d55–0x421db9), adds 1 to the chain when that ball is destroyed (0x4212d4) and pays (chain + 5) × 10 on the contact match (0x420bcf, combo 0). Independently, our gap geometry differed from 0x414c60 (free width instead of centre distance, landing gap kept, exploding balls ignored, detection on collision ticks)."
  confirming_evidence:
    - "0x421d59–0x421db9: waiting requires neighbour+0x30 == 0 = NOT touching (0x401820 tolerance 5 → |Δ| < 42), sets +0x32 and returns before 0x401ac0 (chain reset)"
    - "0x4212d4–0x4212e1: each +0x32 ball of a matched group adds 1 to board+0x188 before 0x420b80; 0x420bcf–0x420bfc: chain bonus when chain > 4 and combo == 0, whatever the caller (0x42198f contact or 0x421d3c insertion)"
    - "0x414e19: w = ball.pos − prev.pos (centres); 0x422032 removes the landing gap; 0x414c60 walks the raw list (exploding balls +0x38 included); 0x423749–0x4237a5: detector skipped on an update with a collision"
    - "harness (2 200 shots, 22 pack levels): armed gap bonus before 162 250 vs original-emulation 110 100; after 108 370 vs 110 100"
  falsification_test: "If 0x420b80 were not reached from 0x42198f, or if 0x4085e0(…, 0) skipped exploding balls, the chain/exploding parts would be wrong — checked: 0x42198f calls 0x421240 → 0x421333 calls 0x420b80; flag 0 returns the raw list predecessor (0x40861a–0x40863c)."
  fix_rationale: "Rules transcribed, no multiplier: 0x414c60 detector + 0x422032 removal in trackGap/land; 0x421d55 waiting, 0x4212d4 increment, 0x420bcf chain bonus moved into destroyRun, 0x408e30 reset walk in onJunction."
  blind_spots: "Real-player shot distribution (harness and bot are synthetic); the attraction arming of a shot still uses our contact test instead of the 42-px tolerance of the same branch; ball+0x30 is a cached flag in the original (recomputed live here); procedural tracks sample by arc length (identical to point indices on pack curves within 0.5 %)."

## Symptoms

expected: scores (especially gap shots, « tirs dans les brèches ») match Zuma Deluxe
actual: user feels gap shots are under-scored
errors: none
reproduction: shoot through / into gaps between chain segments, compare with memory of the original
started: since R2.0.17 gap rule (05-RESEARCH-02, D-22)

## Rule table — original (re-derived from inner.exe) vs ours

| Rule | Original (address, instruction) | Before (R2.0.23) | After (q-score) |
|---|---|---|---|
| Points per ball | 10 × n: `lea ecx,[edi+edi*4]; lea eax,[eax+ecx*2]; lea edx,[eax+eax*4]` = 10·(n + 10·combo) (0x420bc3–0x420bdc); n = board+0x25c, +1 per ball in 0x41aa20 (0x41aa51) | 10 × n | = |
| Combo | + 100 × combo, combo = ball+0x48 (0 for a shot) (same lea chain) | 100 × (depth − 1) | = |
| Chain (ENCHAÎNEMENT) bonus | `cmp [ecx+0x188],4; jle; cmp edi,ebx(combo); jne` → `(chain + 5) × 10` (`add eax,5; lea eax,[eax+eax*4]; add eax,eax`, 0x420bcf–0x420bfc): from the 5th, only when combo = 0, for ANY caller of 0x421240 (shot 0x421d3c, attraction contact 0x42198f) | 5th+, shot matches only | 5th+, any depth-1 match (shot or contact) |
| Chain counter | +1 per shot before the match test (0x421d32), −1 if no match (0x421d4c); +1 per waiting ball destroyed in a group (0x4212d4–0x4212e1); reset by 0x401ac0 on: miss off-screen (0x42388e), non-waiting no-match landing (0x421dbf), waiting ball left alive at a contact (0x408e4f) | reset on every no-match landing | as original |
| Waiting ball (keeps gap bonus + chain) | same-colour neighbour NOT touching: prev+0x30 == 0 or ball+0x30 == 0 (0x421d59 / 0x421d8b), +0x30 = 0x401820(…, 5): `lea edx,[ecx+ecx*1+0x20]` → \|Δ\| < 42 | same-colour neighbour TOUCHING (inverted); chain reset anyway | as original (`linked()`, 42 px) |
| Gap width w | `fld [ebx+0xc]; fsub [eax+0xc]` = front ball pos − list predecessor pos = CENTRE distance, ftol (0x414e19–0x414e1f), `jle` if ≤ 0 | free width (centre − 32) | centre distance |
| Gap detection | 0x414c60: curve points idx 1, 1+32, … (`[ebp-0x18]` = 2 × 0x401720 = 32), tunnel byte +0x20 skipped, first with d² < 16² (0x414d74–0x414d9d); front ball = first of the raw list (exploding included) with pos > idx, prev = 0x4085e0(ball, 0); AddGap(curve, w, key = ball+4 id) dedup (0x414660); only on updates where 0x421e10 hit nothing on any curve (0x423749–0x4237a5) | nearest track point ≤ 16 px, band ≥ 24 px from both alive balls, centre distance > 64, on every tick incl. the hit tick, alive balls only | as original (arc-length samples) |
| Landing gap | removed: key = hit ball (inserted behind) or its successor (ahead) → 0x40a770 (0x42201c–0x422032) | kept | removed |
| n multiplier | min width over the list (0x40a810), `cmp ecx,1; jle; imul eax,ecx` (0x421d1c–0x421d24) | = | = |
| Gap amount | `w' = max(0, w − 0x40)`; `(0x1f4 or 0xfa) × (0x12c − w') / 300` (magic 0x1b4e81b5 >> 5), `/10 × 10`, min 10 (0x421cb3–0x421d16); base 250 only with board+0x187 (gauntlet) | same formula on free width | same formula on centre width |
| When paid | sum of +0x5c over the group, max of +0x5e (0x4212f0–0x4212ff) → 0x420b80; cleared on non-waiting landing (0x421dc4) and at 0x408e30 | paid on match | = (+ waiting rules) |
| Coin | `max(500, 100 × ⌊(board+0x160 − board+0x164) / 600⌋)` = level `score` target (0x4233fb–0x423440; 200 floor in gauntlet) | max(500, 100⌊target/600⌋) | = |
| Extra life | ⌊new/50 000⌋ − ⌊old/50 000⌋ (magic 0x14f8b589 >> 12, 0x41739b–0x4173bd), none with +0x186/+0x187 | = | = |
| ACE TIME | t > par → 0, else 100 × (1 − trunc(trunc(−25 000 × (1 − t/par)) / 100)) (0x401cb0, K = −25 000 @0x54c678) = 100 (1 + ⌊250 (1 − t/par)⌋) | = | = |
| Level bonus | per curve (100 − 0x40a900) × 100, 0x40a900 = 0 when the curve is empty (0x428700–0x428712) → 10 000 / curve | 10 000 × curves | = |
| End tally | 60 px steps (`mov esi,0x3c` 0x4215a3), +100 each (`push 0x64` 0x4216d9 / 0x421737) | = | = |

## Discrepancies ranked by impact on total score

1. **Gap width = centre distance (over-paid before).** Every gap bonus was computed one ball width too wide in our favour
   (+0 … +53 per gap). Bot replay (22 pack stage levels × 3 seeds, 90 s, tools/sim-difficulty bot, target disabled):
   gap points 1 002 640 → 774 950 (−23 %), total 1 808 360 → 1 582 100 (−12.5 %); gap points are > 50 % of the bot's
   score, so this is the largest lever — and it goes DOWN.
2. **Landing gap + collision-tick detection (over-paid before).** Harness: 72 of 438 gap shots were paid by us only
   (shot landing into the gap it flew through, or gap seen on the hit tick); now 4 vs 8 residual differences out of
   ~365 (60 Hz / 10 px steps vs 100 Hz / 6 px).
3. **Chain broken by gap-closing shots (under-paid before) — the user's « brèches » case.** A shot that lands across a
   gap from its colour (segments then attract) reset our ENCHAÎNEMENT and lost its gap bonus; the original keeps both,
   adds 1 when the ball is destroyed and pays the chain bonus on the contact match. Per occurrence with a running
   chain k ≥ 4, we lost (k+6)×10 on the contact match plus every chain bonus of the next 4 hits: e.g. k = 6 →
   120 + 130 + 140 + 150 + 160 ≈ 700 points; r224 fixture (chain 4): contact match 540 → 580 and chain 5 instead of 0.
   The fixed bot rarely plays this shot (chain bonus 43 210 → 44 640, +3 %), a player who aims at gaps on purpose does.
4. **Exploding run counts as 32 px gaps (under-paid before).** During the 40 maj (24 ticks) of an explosion the balls stay
   in the list; a shot over them sees w = 32 → 500 (× n). We paid 440/390/340 (3/4/5-ball run) from the live edges.
5. **Touching pair is not waiting (over-paid before).** A ball landing against one touching ball of its colour kept its
   bonus with us (paid again by the next match: 1 030 in r217); the original clears it (470 now).

Formulas for points per ball, combo, chain amount, coin, extra life, ACE TIME, level bonus and tally already matched.

## Pour l'utilisateur — valeurs typiques d'un tir à travers une brèche (original, base 500)

Largeur mesurée entre les CENTRES des deux billes qui bordent la brèche (une bille = 32 px) :

| Billes manquantes | Centres | BONUS SAUT (par brèche) | Avant (R2.0.23) |
|---|---|---|---|
| 1 | 64 | 500 (passage quasi impossible sans toucher) | 500 |
| 2 | 96 | 440 | 500 |
| 3 | 128 | 390 | 440 |
| 4 | 160 | 340 | 390 |
| 5 | 192 | 280 | 340 |
| 6 | 224 | 230 | 280 |
| 8 | 288 | 120 | 180 |
| 10 | 352 | 20 | 70 |
| ≥ 11 | ≥ 384 | 10 | 20 puis 10 |
| série en train d'exploser | 32 | 500 | 340–440 |

× 2 (DOUBLE) / × 3 (TRIPLE) sur la brèche la plus étroite ; payé uniquement si la bille tirée participe à une
destruction ; la brèche dans laquelle la bille se pose ne compte jamais. Exemple : un tir à travers une brèche de 2
billes qui complète un trio = 30 + 440 = « +470 ».

## Decision for the user (flag)

The disassembly does not support « gap bonus too low »: per gap the original pays LESS than R2.0.23 did. What was really
under-scored is the ENCHAÎNEMENT around gap-closing shots (fixed) and shots over a run that is exploding (fixed). If the
user, after playing R2.0.24, prefers the previous per-gap amounts, the one-line revert is in `trackGap`
(`w = trunc(next.s − prev.s)` → `− ballSpacing`) with the test values of r213/r214/r217/r224 restored — but that would
depart from the original. D-22 (« montant selon le spike 02 ») is respected: spike 02 left the unit/measure of w open
(B1), this audit closes it.

## Eliminated

- hypothesis: the gap amount formula itself (500 base, w − 64, /300, ⌊⌋₁₀, min 10, × n) is wrong
  evidence: 0x421cb3–0x421d24 re-read, identical to gapBonusPoints
  timestamp: 2026-10-12
- hypothesis: curve units differ from px (w would need scaling)
  evidence: pack curves 1.005 px per point on 8 curves
  timestamp: 2026-10-12
- hypothesis: other score sources (per ball, combo, coin, life, ACE, level bonus, tally) are under-valued
  evidence: constants re-derived at 0x420bc3, 0x4233fb, 0x41739b, 0x401cb0, 0x428700, 0x4215a3/0x4216d9, all equal to core.ts / configFromSettings
  timestamp: 2026-10-12

## Evidence

- timestamp: 2026-10-12
  checked: 0x414660 (AddGap), its only caller 0x414c60 (gap detector), caller 0x423787 (projectile update)
  found: detector runs per curve only on updates where 0x421e10 found no collision on any curve (0x423749–0x4237a5). It scans curve points idx = 1, 1+32, 1+64… (step 2×radius, radius 0x401720 = 16), skipping tunnel points (+0x20), first point with dist² < 16² wins; ball = first ball with pos > idx, prev = 0x4085e0(ball,0) (list predecessor, no segment test); w = ftol(ball.pos − prev.pos) (0x414e19–0x414e1f) = CENTRE-TO-CENTRE distance in curve points; w ≤ 0 → nothing; AddGap(curve, w, key = ball+4 = unique ball id (0x408587)) dedups by key.
  implication: original w is centre distance, ours was centre distance − 32 → our bonus was higher for the same gap (up to +50/gap).
- timestamp: 2026-10-12
  checked: pack curves point spacing
  found: avg 1.005 px between consecutive points on 8 curves → curve-point units ≈ px (B1 confirmed modulo 0.5 %)
  implication: no unit scaling issue
- timestamp: 2026-10-12
  checked: 0x421e10 collision handler, 0x422001–0x422032; 0x4017b0 (d² < 4 × (16 + 0)², 4.0 @0x54c550)
  found: on hit, the gap the ball is inserted into is removed from the list (key = hit ball id when inserted behind, next ball id when inserted ahead → 0x40a770); collision distance 32
  implication: landing in a gap never pays for that gap; ours kept it (trackGap ran before the hit test in the same tick, no removal)
- timestamp: 2026-10-12
  checked: 0x421d55–0x421dd2 with 0x408700/0x401820
  found: ball+0x30 = "touches next" = |trunc(a.pos) − trunc(b.pos)| < 2×5 + 32 = 42. Waiting (keep bonus, keep chain, attraction v=1) only when prev same colour AND prev+0x30 == 0 (NOT touching), or next same colour AND ball+0x30 == 0. Otherwise 0x401ac0 (chain reset) + bonus cleared.
  implication: our settle() kept the bonus when the same-colour neighbour TOUCHES and dropped it when it is across a gap — inverted; and always reset the chain.
- timestamp: 2026-10-12
  checked: 0x420b80–0x420c3a, 0x421240–0x421333, 0x421cac–0x421d2b, 0x4233fb–0x423445, 0x417380, 0x401cb0 (K = −25000 @0x54c678), 0x428705–0x428712, 0x40a900
  found: match = 10(n + 10·combo) + gapSum (+ (chain+5)·10 if chain > 4 and combo == 0); gap pts = max(10, ⌊base(300 − max(0,w−64))/300⌋₁₀)·n, base 500 (250 gauntlet); coin max(500, 100⌊target/600⌋) (200 floor in gauntlet); life every 50 000; ACE 100(1+⌊250(1−t/par)⌋); level bonus (100 − pct)·100 per curve, pct = 0 when empty
  implication: formulas in core.ts match; only gap geometry / waiting conditions differ
- timestamp: 2026-10-12
  checked: harness scratchpad/gap-harness.mjs (22 pack levels × 100 shots, 60 % aimed at gap centres), emulating 0x414c60 at 6 px sub-steps next to the engine
  found: before — shots with a gap: ours 438, original 367; armed bonus ours 162 250 vs 110 100; same gap 61 free → 500 vs 93 centres → 450, 137 → 370 vs 169 → 320; 72 only-ours, 1 only-original. After — 363 vs 367, 108 370 vs 110 100, 4 only-ours, 8 only-original
  implication: before the fix we over-paid gap AMOUNTS; after, the engine matches the emulation within 1.6 %
- timestamp: 2026-10-12
  checked: 0x41aa20 / 0x401600 (+0x38 = 1 exploding), 0x4085e0 flag 0 vs 1
  found: exploding balls stay in the curve list; the detector walks it raw → a shot over a run that is exploding sees w = 32 → 500 per gap; collision skips +0x38 balls (0x421f0c)
  implication: ours (alive list) paid 440/390/340 there instead of 500 — under-paid in that window
- timestamp: 2026-10-12
  checked: 0x408e30 (called after every attraction contact, 0x4219d6/0x4219ec)
  found: walks back from the arrived head; every still-waiting ball whose attraction is over loses +0x32 → 0x401ac0 (chain reset) + gap bonus cleared; stops at a ball with pending attraction (+0x3c > 0) behind a gap
  implication: waiting keeps the chain only until the contact; if the contact does not destroy it, the chain resets then
- timestamp: 2026-10-12
  checked: bot replay scratchpad/bot-score.mjs (sim-difficulty bot, 22 levels × 3 seeds, 90 s, miss 0.3, shot every 30 ticks), old vs new .compiled
  found: identical play (match10n 586 180, combo 175 100, 36 163 shots); gap 1 002 640 → 774 950; chain 43 210 → 44 640; total 1 808 360 → 1 582 100
  implication: net effect on a non-gap-seeking bot is −12.5 %; the chain fix only shows for deliberate gap-closing play

## Resolution

root_cause: trackGap measured the free width (centre − 32) on a continuous band, on the hit tick too, kept the landing gap and ignored exploding balls, whereas 0x414c60/0x422032 measure centre to centre on 32-px curve samples only on updates without collision, over the raw list, and drop the landing gap; settle() treated a touching same-colour pair as « waiting » and reset the chain on every no-match landing, whereas 0x421d55 keeps chain + gap bonus only for a ball across a gap from its colour (centres ≥ 42 px), 0x4212d4 adds 1 per waiting ball destroyed, 0x420bcf pays the chain bonus on the contact match and 0x408e30 resets when the contact leaves the ball alive.
fix: core.ts — trackGap rewritten after 0x414c60 (cached samples, raw list, centre width, front-ball key) and called only when no chain was hit; land() removes the landing gap; Projectile.gapWidths; Ball.waiting; settle() waiting rule with linked() (42 px); destroyRun() adds 1 per waiting ball and computes the chain bonus for any depth-1 match (emits `streak`); onJunction() → endWaiting() (0x408e30).
verification: tests/r224-scoring.test.mjs 6 RED → GREEN; r213/r214/r217/r218 expectations moved to the centre width; npm test 585/585, npm run check, npm run -s guard green; harness ours vs original-emulation 108 370 / 110 100.
files_changed: [src/core.ts, tests/r224-scoring.test.mjs, tests/r213.test.mjs, tests/r214.test.mjs, tests/r217.test.mjs, tests/r218.test.mjs]

## Second pass (2026-10-15) — gap detection, multiplicity, sampling

Current Focus (second pass):
hypothesis: CONFIRMED — our gap detection differed from the original in five places the first pass had not read or
  had approximated: (a) projectile+0xa0 per-curve sample memory (0x401f30/0x401f10), (b) samples = curve POINT indices,
  (c) one projectile update per 100 Hz maj (6 px) instead of one 10 px step per 60 Hz tick, (d) off-screen bounds,
  (e) contact = first ball of the curves in order, tunnel tested at the insertion-side point (0x405d00).
test: independent emulator + differential harness (scratchpad gap2/emu.mjs, gap2/diff.mjs)
expecting: 0 mismatches after the fix — obtained (21 098 shots, 18 874 landed, 1 050 gap shots, 0 mismatches)
next_action: user plays R2.0.27 gap shots (see « Pour l'utilisateur — second passage »)

reasoning_checkpoint:
  hypothesis: "Gap shots were sometimes counted when the original would not (and the reverse) because trackGap /
    moveProjectiles sampled the projectile every 10 px at 60 Hz, placed the 32-px samples by arc length, had no
    'still on the same sample' memory, kept a 64-px off-screen margin and chose the nearest ball with a centre tunnel
    test — whereas 0x423330 updates every 6 px at 100 Hz, 0x414c60 samples curve points with the +0xa0 memory, 0x4237a9
    removes the projectile at x<0/y<0/x−16>640/y−16>480 and 0x421e10 takes the first ball of the curves in order whose
    insertion side (0x405d00) is not a tunnel."
  confirming_evidence:
    - "0x414cc4–0x414d1e: cache read 0x401f30 (proj+0xa0+4c), early return while d² < 16², reset 0x401f10(c,0); 0x414dc5 stores the firing index"
    - "0x414d2b–0x414daa: index step [ebp-0x18] = 32, byte offset step 36·32, tunnel byte +0x20 of the 36-byte point"
    - "0x401fa0: pos += v once per 0x423330 call (one per update); 0x4237a9–0x423800 bounds with Widget +0x38/+0x3c = 640/480 (Resize 0x4abf3a)"
    - "0x421eb8–0x421fd9: first node of the raw list with 0x4017b0 true, +0x34/+0x38 clear, 0x405d00(ball, side) false → trunc(pos) ± 16 tunnel byte"
    - "harness before: 128 mismatches / 18 972 landed (FP 30, FN 42, count 24, amount 32); after: 0 / 18 874"
  falsification_test: "Any shot where the emulator (built from the pseudo-code below, not from core.ts) and the engine disagree after the fix — none in 21 098 shots on 22 pack levels; the ours-model variant reproduced the old engine on 21 078/21 078 shots, so the emulator does model the engine's inputs."
  fix_rationale: "Each rule is transcribed at its address; nothing is tuned. Amount formula and centre width untouched (user decision)."
  blind_spots: "Engine chain physics feed both sides (same timeline), so chain-motion fidelity is out of scope here; ball +0x34 (unknown flag excluding contact) not modelled; 'ahead' uses our tangent dot product where 0x421f87 uses a cross product with the 0x406070 vector (same convention as land()); the original's balls with pos < 1 are queued outside the list — ours keeps one queued ball at s < 0, only relevant for a sample at point 1 (entrance)."

### Evidence (second pass)

- timestamp: 2026-10-15
  checked: 0x414c60 head (0x414cc4–0x414d1e) and 0x401f30 / 0x401f10
  found: `cached = proj[0xa0 + 4·curve]`; if 0 < cached < nPoints and dist²(points[cached], proj) < 16² → return
  (nothing); else proj[0xa0 + 4·curve] = 0, then scan; the scan stores the index that fired (0x414dc5) before walking
  the balls. Missed by the first pass.
  implication: while the projectile stays on a sample, a change of the ball ahead of it (exploding run removed, chain
  moving) cannot add a second gap; ours (no cache) counted DOUBLE there.
- timestamp: 2026-10-15
  checked: 0x414d40–0x414daa
  found: the samples are curve POINT indices 1 + 32k (36-byte points, byte +0x20 = tunnel), compared with the ball
  position in point units; ours sampled arc length 1 + 32k → on pack curves (1.005 px per point) the sample disc
  drifts by 0.16 px per sample, ≈ 10–15 px at the far end of a curve.
- timestamp: 2026-10-15
  checked: 0x423330 / 0x401fa0 / 0x4237a9–0x423800 / 0x421e10 / 0x405d00 / Widget::Resize 0x4abf3a (+0x38 = width, +0x3c = height)
  found: one move per 100 Hz update (pos += v, no sweep); miss when x < 0 or y < 0 or x − 16 > 640 or y − 16 > 480;
  contact = curves in order, FIRST ball of the raw list within 32 px (d² < 4·16²), not exploding, insertion-side point
  trunc(pos) ± 16 not a tunnel point (0x405d00; the centre test 0x408f52 is the aim-guide ray 0x408f00, not contact).
  implication: ours moved 10 px per 60 Hz tick (disc chords < 10 px skipped), kept a 64 px margin on every side, took
  the nearest ball and tested the tunnel at the ball centre.
- timestamp: 2026-10-15
  checked: differential harness scratchpad/gap2/diff.mjs + emu.mjs (independent emulator; engine timeline recorded at
  each projectile update; ours-model variant reproduces the engine on 21 078/21 078 shots), 3 seeds × 22 levels ×
  (fixture + play), ~21 000 shots
  found: before — 154 mismatching shots out of ~19 000 landed (1 037 ours gap shots / 1 071 original): false negatives
  63, false positives 29, wrong count 25, wrong amount 37. Attribution (one factor reverted): sampling cadence ~68,
  sample positions ~77, collision tunnel side ~22, collision order ~2, bounds ~5, cache ~4 (all DOUBLE → single).
- timestamp: 2026-10-15
  checked: 0x420b80 display
  found: one « +%d » (0x54cdd4, wide) of edx = 10n + 100·combo + gap sum + chain bonus, the same edx passed to AddScore
  0x417380; GAP_BONUS / DOUBLE / TRIPLE strings carry no amount (count ≤ 1 / 2 / ≥ 3, max over the group)
  implication: main.ts already shows `+${points}` = addScore(points) and label-only gap texts — no display mismatch.

### Original rule — exact pseudo-code (second pass)

```
every 100 Hz update, for each flying projectile P (0x423330):
  P.pos += P.v                                   # 0x401fa0, |v| = firespeed (6 px), no sweep
  if coin within 16+20: grab, P destroyed         # 0x4233b6–0x4236eb
  if P.x < 0 or P.y < 0 or P.x−16 > 640 or P.y−16 > 480: miss, chain := 0   # 0x4237a9–0x42388e
  for curve c in order: if Contact(c, P): return  # 0x423749–0x42376f — no gap detection this update
  for curve c in order: GapDetector(c, P)         # 0x423773–0x4237a5

Contact(c, P):                                   # 0x421e10
  for ball b in c.list (rear → front, exploding included):
    if |P − b| < 32 and not b.exploding (+0x38) and not b+0x34 (and neighbours' +0x34):
      ahead := side of P along the curve at b    # 0x406070 / 0x421f87
      if point(trunc(b.pos) ± 16).tunnel: continue   # 0x405d00 — insertion side, not the centre
      remove gap key (ahead ? next(b).id : b.id) from P.gaps        # 0x42201c–0x422032
      start insertion; return true
  return false

GapDetector(c, P):                               # 0x414c60
  i := P.hold[c]                                 # 0x401f30, projectile+0xa0+4c
  if 0 < i < nPoints:
    if |point[i] − P| < 16: return               # still on the sample that fired last
    P.hold[c] := 0                               # 0x401f10
  for i = 1, 33, 65, … < nPoints:                # step 2 × radius (0x401720 = 16)
    if point[i].tunnel: continue                 # byte +0x20
    if |point[i] − P| < 16:
      P.hold[c] := i                             # 0x414dc5
      front := first ball of the raw list with pos > i (exploding included); none → return
      prev  := raw list predecessor of front (0x4085e0 flag 0); none → return
      w := trunc(front.pos − prev.pos); w ≤ 0 → return      # centre to centre, 0x414e19
      AddGap(c, w, key = front.id) unless key listed          # 0x414660 (dedup by ball id only)
      return                                     # only the first sample in range

end of insertion (0x421c12–0x421d2b):
  n := |P.gaps|, w := min width (0x40a810)
  if n ≥ 1: ball.gap := max(10, ⌊⌊500·(300 − max(0, w − 64))/300⌋/10⌋·10) × (n > 1 ? n : 1), ball.gapCount := n
  chain += 1; if match (0x421240): pay → return
  chain −= 1; waiting (same-colour neighbour across a gap, centres ≥ 42): keep ball.gap, keep chain
  else: chain := 0, ball.gap := 0
paid (0x4212f0): sum of ball.gap over the destroyed group, max gapCount → GAP / DOUBLE / TRIPLE text; « +total » =
  10n + 100·combo + gap sum + chain bonus = the amount added (0x420c19 / 0x420c49)
```

What counts as a gap (answers to the second report):
- between which balls: the first ball of the curve list beyond the sample under the projectile and its list predecessor
  — whatever the distance: two touching balls give w = 32 (but a projectile 16 px from a sample between touching balls
  always touches one of them first, so in practice only real holes or exploding runs are crossed);
- exploding balls: still in the list → a run being destroyed reads as 32-px gaps (500 each);
- gap in front of the head / behind the rear ball / before the entrance: never (no front or no predecessor);
- two curves: each curve has its own detector and memory; keys are global ball ids;
- tunnels: tunnel points are never samples, so a gap whose samples are all in a tunnel is invisible; cutouts (drawing
  only) do not matter;
- same gap twice: no — one key per front ball, plus the per-curve memory while the projectile is on the sample;
- n = number of distinct keys left at the end (landing gap removed), the amount uses the NARROWEST of them × n;
- paid only when the shot ball itself is destroyed in a match (its own insertion match, the contact match of a
  waiting ball, or a later match that includes it while it waits) — not for other destructions it causes.

### Differential results (harness gap2/diff.mjs, 3 seeds × 22 pack levels × fixture + play, ~21 000 shots)

| | before (R2.0.26) | after (q-gap) |
|---|---|---|
| landed shots compared | 18 972 | 18 874 |
| gap shots ours / original | 1 037 / 1 049 | 1 050 / 1 050 |
| false positives (ours counts a gap, original not) | 30 | 0 |
| false negatives (original counts, ours not) | 42 | 0 |
| wrong multiplicity (single vs DOUBLE/TRIPLE) | 24 | 0 |
| wrong amount (same n, other width) | 32 | 0 |
| armed gap points ours / original | 350 050 / 355 230 | 352 850 / 352 850 |
| gap points actually paid ours / original for the same shots | 46 840 / 41 590 | 43 270 / 43 270 |

Cause (single factor reverted that explains the mismatch): sample positions (arc length vs curve points) 72, 60 Hz /
10 px sampling 44, contact tunnel side / order 24, off-screen margin 5, sample memory 4 (all DOUBLE → single). Bot replay
(tools/sim-difficulty bot, 66 runs × 90 s): total 1 635 790 → 1 638 890 (+0.2 %), gap 800 280 → 801 610, gap matches
2 868 → 2 774 — the average is unchanged, individual shots are now decided like the original.

Examples (before; level, seed, fire tick, start, direction):
- false negative, 60 Hz sampling: riverbed (stage 0) play seed 1007, tick 1255, from (283.82, 251.37) dir (0.6139,
  −0.7894): the original sees gap 0:79 (w 96 → 440) at its 42nd update; our 10-px steps jump over the 16-px disc → 0.
- false positive, sample positions: tiltspiral (stage 1) fixture seed 1050, tick 1753, (235.86, 262.78) dir (−0.3836,
  0.9235): our arc sample is on the path (gap w 193 → 280), the curve point the original uses is ≥ 16 px away → 0.
- wrong amount, sample positions: tiltspiral fixture seed 1050, tick 1590: same gap seen 2 updates earlier by the
  original, w 200 → 270 vs ours 203 → 260.
- DOUBLE instead of single, sample memory: tiltspiral (stage 4) play seed 2201, tick 516: projectile over an exploding
  run, the ball ahead of the sample changes while the projectile is still on it → without the memory key 0:12 then
  0:11 (DOUBLE, 1 000), the original 500.
- false positive, contact tunnel side: underover (stage 1) play seed 1054, tick 552: the original touches ball 50 two
  ticks earlier (its insertion side is outside the tunnel, its centre inside) and lands into gap 0:46 (removed → 0);
  we flew on and paid 250.
- false positive, bounds: triangle (stage 2) play seed 1101, tick 706: the original leaves the board at y < 0; we hit a
  ball 10 px above the top edge and paid 500.

### Resolution (second pass)

root_cause: moveProjectiles/trackGap approximated 0x423330/0x414c60: one 10-px step per 60 Hz tick instead of one
  firespeed step per 100 Hz update, gap samples by arc length instead of curve points, no per-curve « still on the
  sample » memory (projectile+0xa0), 64-px off-screen margin instead of x<0/y<0/x−16>640/y−16>480, nearest ball with a
  centre tunnel test instead of the first ball of the curves in order with the insertion-side test (0x405d00).
fix: core.ts — moveProjectiles runs majSteps × updateProjectile (move vx·tickHz/100, original bounds, coin, contact
  first-in-order with trunc(s) ± r tunnel test, gap detector); trackGap keeps Projectile.gapHold per curve;
  gapSamples uses curve points on dense curves (≤ 2 px per point), arc length on sparse polylines. Amount formula,
  centre width, landing removal, waiting and pay rules unchanged.
verification: tests/r227-gaps.test.mjs 7 RED → GREEN; r214 (first-tick position = one update), r216-presentation
  (contact one tick later: levelTicks 46 → 47), r218 (contact source pattern → insertion side) updated; npm test
  635/635, npm run check, npm run -s guard green; harness 0 mismatches after (128 before).
files_changed: [src/core.ts, tests/r227-gaps.test.mjs, tests/r214.test.mjs, tests/r216-presentation.test.mjs, tests/r218.test.mjs]

### Pour l'utilisateur — second passage (ce qui compte comme une brèche)

Une brèche compte quand la bille tirée passe, sans rien toucher à ce moment-là, à moins de 16 px d'un des points de
contrôle du rail (un tous les 32 points, hors tunnels) et qu'il y a une bille devant ce point et une bille derrière lui
sur le même rail. La largeur est la distance entre les centres de ces deux billes (une série en train d'exploser compte
comme une brèche de 32 → 500). Chaque brèche ne compte qu'une fois ; la brèche dans laquelle la bille finit par se
poser ne compte pas ; il n'y a pas de brèche devant la tête ni derrière la dernière bille. Le bonus (le plus étroit ×
nombre de brèches) n'est payé que si la bille tirée est elle-même détruite (son trio, ou plus tard si elle attend de
l'autre côté d'une brèche de sa couleur). Le « +N » affiché est exactement ce qui s'ajoute au score.
Ce qui changeait « parfois oui, parfois non » : la bille avançait par sauts de 10 px (le jeu original : 6 px) et
sautait par-dessus certains points de contrôle ; ces points étaient placés quelques pixels à côté de ceux du jeu (jusqu'à
10–15 px au bout du rail) ; une même brèche pouvait compter deux fois au-dessus d'une série qui explose ; une bille
dont le centre est en tunnel mais pas le côté où l'on entre n'était pas touchable (et l'inverse) ; et une bille pouvait
toucher une bille hors de l'écran. Les montants par brèche sont inchangés.
