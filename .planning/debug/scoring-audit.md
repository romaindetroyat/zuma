---
status: resolved (user kept the original gap amounts, 2026-10-12)
trigger: "« J'ai l'impression que les scores ne reflètent pas vraiment les scores du jeu d'origine. Je voudrais que tu vérifies notamment les scores attribués quand on tire dans les brèches. J'ai l'impression que c'est sous noté... »"
created: 2026-10-12T00:00:00Z
updated: 2026-10-12T12:00:00Z
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
