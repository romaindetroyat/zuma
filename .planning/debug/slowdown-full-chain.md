---
status: awaiting_human_verify
trigger: "J'ai l'impression que lorsque la ligne est assez pleine, la vitesse ralentit considérablement, rendant le jeu plus facile. Le phénomène existe sans doute dans l'original, mais j'ai l'impression que c'est exagéré."
created: 2026-10-15T00:00:00Z
updated: 2026-10-15T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED and fixed — the slow-zone head was the most advanced ball of the whole chain instead of the
  front of the rear linked run (0x418a28–0x418a77)
test: tests/r227-slowzone.test.mjs (5 tests, 1 on the private pack), RED 4/5 before the fix, GREEN after
expecting: user confirms that a broken chain near the skull no longer « freezes » the balls behind
next_action: human verification in the real game (see « Vérification humaine »), then archive to resolved/

reasoning_checkpoint:
  hypothesis: "Our pusher target applies the end-of-track slow zone to the most advanced ball of the whole chain;
    the original (0x418a28–0x418a69) applies it to the front ball of the rear linked run (ball+0x30 link flags,
    cleared only by a removal 0x4239ed, set by contact). After a gap whose front segment is in the band or past the
    danger line, our rear (pushed) segment is slowed down to speed ÷ slowfactor while the original's keeps its own
    target (cruise until its own front enters the band)."
  confirming_evidence:
    - "0x408680 / 0x4085e0: +0x30 gates next / prev neighbours = link to the next ball; 0x408700 recomputes it by contact, 0x423970 → 0x408760(0) clears the link of the ball behind a removed ball"
    - "0x418a28–0x418a3c: [ebp-4] = first ball from the rear with +0x30 == 0; 0x418a44–0x418a66: otherwise the last node; 0x418a6c–0x418a77: +0x68 = _ftol(pos)"
    - "headless gap scenario on 6 pack boards (front segment head 300 px before the skull, rear segment head 1 600 px): rear segment at exactly speed ÷ slowfactor in the engine (25–40 % of cruise) vs 85–100 % of cruise with the original rule; rejoin 1.8–2.3 × longer in the engine"
    - "unbroken chain: engine = model within ±0.5 px/s per band, so the rest of 0x418780 is already right"
  falsification_test: "if the original kept +0x30 set across a removed ball (no 0x408760(0) in 0x423970), the head would stay the overall front — refuted by 0x4239ed–0x4239f1"
  fix_rationale: "computing the head as the front of the rear run of balls in contact (raw curve list, exploding balls included because their links survive until the removal) gives the pushed segment its own target exactly like 0x418780; no other term changes"
  blind_spots: "link flags are emulated by a contact test (CONTACT_EPS 0.5 px) instead of being stored; the original pushes exploding balls along during the 40 maj (D-34 territory, untouched here); 1.005 px per point kept as 1 px; the danger sound (0x418a74, same head) is not implemented in the PWA"

## Symptoms

expected: speed near the skull reduced like in Zuma Deluxe (slowfactor / slowdistance / danger)
actual: when the chain is long (head close to the skull) the speed drops a lot; feels exaggerated vs the original
errors: none
reproduction: play an adventure level, let the chain approach the skull
started: perceived after R2.0.24 (pusher unclamped −0.1 px/maj step) — not certain

## Eliminated

- hypothesis: "slow zone applied too early / too wide, or slowfactor applied twice"
  evidence: "0x4187ef–0x418832 single division, band [nb − danger − slowdistance, nb − danger]; engine per-band speeds equal the model within 0.5 px/s"
  timestamp: 2026-10-15
- hypothesis: "the −0.1 / +0.005 px/maj convergence undershoots longer in the engine than in the original"
  evidence: "same per-update rule (once per curve update, 0x423cfd); float32 / integer-head model vs engine on 6 boards: time in band + past danger within ±0.4 s, band speeds within ±0.5 px/s"
  timestamp: 2026-10-15
- hypothesis: "post-stop recovery slower than the original (D-09 / recoil stops)"
  evidence: "0x423ca4–0x423cac resets m to 0 when the stop counter ends, then +0.005 px/maj = 50 px/s²: identical to stopTicks + chainAccel"
  timestamp: 2026-10-15
- hypothesis: "another adventure slowdown tied to chain length / coverage"
  evidence: "the < 30 % catch-up needs board+0x187 (Gauntlet only, 0x44bbf0); ZUMA × 0.25 (> 50 % coverage, 0x40a980) is already ours"
  timestamp: 2026-10-15

## Evidence

- timestamp: 2026-10-15
  checked: 0x418780–0x418838 (target), constants 0x54cb38 = 0.25, 0x54c7e0 = 0.1, 0x54cb28 = 0.005
  found: t = desc+0x20 speed (+ accrate ≤ maxspeed, 0 in adventure); × 0.25 while curve+0x58 (ZUMA slow counter) > 0;
    D = curve+0x70, S = desc+0x44 slowdistance (int), h = curve+0x68 (int head, previous update): h < D − S → t;
    h ≥ D → t / desc+0x3c (slowfactor, one division); else f = (S − D + h) / S (int / int), t (1 − f) + f t / sf (linear).
    Then m > target → m −= 0.1 (no clamp), m < target → m = min(target, m + 0.005): once per curve update (0x423cfd).
  implication: one division by slowfactor, linear band, factor never applied twice
- timestamp: 2026-10-15
  checked: 0x404fc0–0x405054 (curve+0x70) and defaults 0x40b070
  found: curve+0x70 = point count (36-byte points, 0x38e38e39) − desc+0x1c danger (600); nb − 1 if danger ≤ 0
  implication: band = [nb − danger − slowdistance, nb − danger] in curve points; ours = same in px (1.005 px / point)
- timestamp: 2026-10-15
  checked: 0x42ad86–0x42adaf
  found: for each of 3 curves (stride 0x7c): slowspeed (+0x40) ≠ 0 → slowfactor = speed / slowspeed
  implication: configFromSettings mapping right (ours clamps ≥ 1, no adventure level is affected)
- timestamp: 2026-10-15
  checked: 0x418838–0x4188a4 coverage catch-up; writers of board+0x187
  found: needs board+0x187 (0x41cc1e init, 0x44bbf0 Gauntlet only) and board+0xf0 > 300; < 30 % → target + t (30 − p) / 10, m += 0.03
  implication: Gauntlet only, confirmed; no other chain-length / ball-count term in adventure
- timestamp: 2026-10-15
  checked: 0x423c8c–0x423cac, 0x423ac7–0x423ad6, 0x40ad04–0x40ad15 and call order 0x423cf6 → 0x418780 → 0x40ab60
  found: stop counter curve+0x54 decremented once per update; when it reaches 0, m = 0; m keeps being converged
    meanwhile but only the reset at the end matters; rear-ball removal: m = 0, +0x54 ≥ 40; recoil: +0x6c, +0x54 ≥ 20
  implication: our stop handling (speed 0 for 24 / 12 ticks, ramp from 0 at 50 px/s²) is equivalent
- timestamp: 2026-10-15
  checked: 0x40a980 (ZUMA), 0x40a900 coverage
  found: coverage (int %) > 50 → curve+0x5c = zumaback, curve+0x58 = zumaslow; +0x58 > 0 → target × 0.25
  implication: ZUMA slowdown matches ours (zumaSlowLeft, × 0.25, 660 ticks)
- timestamp: 2026-10-15
  checked: engine (R2.0.26) vs independent float32 100 Hz model with integer head, no shooting, 1-1 3-4 6-4 9-7 12-1 13-1
  found: time to skull −1.8 … +0.4 % of the model; mean speed per 100 px distance band identical within ±0.5 px/s
    in the slow band and past the danger line on all six boards; time spent in band + past danger within ±0.4 s
  implication: with an unbroken chain our slowdown matches the original (incl. the −0.1/+0.005 sawtooth)
- timestamp: 2026-10-15
  checked: head selection 0x418905–0x418a69 and ball+0x30 accessors 0x4085e0 / 0x408680 / 0x408700 / 0x408760
  found: ball+0x30 = « linked to the next ball » (0x408680 returns next only if this+0x30, 0x4085e0 prev only if
    prev+0x30, 0x408700 recomputes it with the contact test 0x401820, 0x418a09 sets it when the pusher loop pushes the
    next ball and plays SOUND_BALLCLICK1 the first time). +0x68 = ⌊pos⌋ of the FIRST ball from the rear whose link is
    clear (the front of the pushed rear segment), the last ball only when every link is set
  implication: the original slows the pusher according to the front of the REAR segment; ours uses the most advanced
    alive ball of the whole chain → after a gap, the rear segment crawls at the front segment's slow-zone speed
- timestamp: 2026-10-15
  checked: 0x423970 (removal of a destroyed ball)
  found: 0x4239ed–0x4239f1 push 0; call 0x408760 → link of the ball behind the removed one cleared; marking a match
    does not touch links
  implication: links (hence the head) survive the 40 maj of destruction and break at the removal
- timestamp: 2026-10-15
  checked: gap scenario, 6 pack boards, engine R2.0.26 vs original rule (independent 100 Hz model)
  found: rear segment at speed ÷ slowfactor (25–40 % of cruise) vs 85–100 % of cruise; rejoin 1.8–2.3 × longer
  implication: confirmed discrepancy, large and directly felt when a chain is broken near the skull
- timestamp: 2026-10-15
  checked: fixed-bot simulator tools/sim-difficulty.mjs, same 6 boards, 8 seeds, 240 s, before / after
  found: effective chain speed 30.7–78.6 % → 49.7–78.6 % of cruise (largest gains on the fast late boards: +19 to
    +23 points); bot losses 18 → 23 out of 48 games; the 1-1 bot run (never split near the skull) unchanged
  implication: the game was easier than the original whenever the chain was broken with its front near the skull

## Resolution

root_cause: La zone lente de fin de piste prenait comme tête la bille la plus avancée de TOUTE la chaîne. L'original
  (0x418780, tête curve+0x68 écrite en 0x418a28–0x418a77) prend la première bille, depuis l'arrière, dont le lien vers
  la suivante (ball+0x30) est rompu : la tête du tronçon arrière, celui que pousse le pousseur. Le lien est posé au
  contact et rompu pour la bille qui précède une bille retirée (0x423970 → 0x408760(0)) ; il survit donc aux 40 maj de
  destruction. Dès qu'une chaîne pleine était coupée, le tronçon arrière rampait à speed ÷ slowfactor (25–40 % de la
  croisière) à cause du tronçon avant garé près du crâne, alors que l'original le pousse à sa propre cible (85–100 %
  de la croisière tant que sa tête n'est pas dans la bande) : le recollage prenait 1,8 à 2,3 fois plus de temps.
  Le reste de la règle (bande linéaire de slowdistance avant la ligne danger, une seule division par slowfactor,
  pas −0,1 / +0,005 px/maj par mise à jour, arrêts et redémarrage à 0, ZUMA × 0,25) était déjà conforme : sans tir,
  moteur = modèle à ±0,5 px/s par tranche de 100 px et −1,8 … +0,4 % sur le temps jusqu'au crâne.
fix: ZumaEngine.slowZoneHead — parcours de la liste de la courbe (billes en destruction comprises) depuis l'arrière ;
  la tête est la première bille qui n'est pas au contact de la suivante (écart > gap + CONTACT_EPS), sinon la dernière.
  pusherTarget l'utilise pour endZoneFactor ; updatePusher / pusherTarget n'ont plus besoin de la liste des vivantes.
  README « Réglages originaux » (ligne slowfactor) mis à jour.
verification: tests/r227-slowzone.test.mjs RED 4/5 avant (le témoin « chaîne entière » passe), 5/5 après ;
  npm test 633/633 (dont les verrous r224 sur le pack : temps jusqu'au crâne inchangés), npm run check, npm run -s guard
  verts. Mesures sans navigateur sur 1-1, 3-4, 6-4, 9-7, 12-1, 13-1 : sans tir identiques avant / après ; chaîne coupée
  (tronçon avant à 300 px du crâne, arrière à 1 600 px) : vitesse du tronçon arrière = modèle de l'original à ±0,1 px/s,
  recollage à ±0,5 s (avant : 25–40 % de la croisière au lieu de 85–100 %).
files_changed: [src/core.ts, tests/r227-slowzone.test.mjs, README.md]

## Ce que perçoit le joueur

- Chaîne entière (non coupée) : rien ne change ; le ralentissement près du crâne est celui de l'original, et il est
  fort par construction : de la ligne de danger (600 px du crâne) au crâne la chaîne roule à speed ÷ slowfactor
  (÷ 4 par défaut, 12,5 px/s au 1-1), et la bande de 500 px avant cette ligne est parcourue avec la dent de scie de
  l'original (jusqu'à 0,1 px/maj sous la cible). Sur les six plateaux mesurés, 74 à 96 % du temps jusqu'au crâne sans
  tir se passe dans la bande ou au-delà.
- Chaîne coupée près du crâne (le cas « ligne pleine » où l'on joue) : avant, tout ce qui était derrière la coupure
  rampait au ralenti du crâne ; maintenant le tronçon arrière revient à sa propre vitesse et recolle 2 fois plus vite,
  comme dans l'original. Le jeu redevient plus difficile dans cette situation.

## Écarts restants (documentés, non corrigés)

- Liens émulés par contact (CONTACT_EPS 0,5 px) au lieu d'un drapeau mémorisé ; identique dans tous les cas mesurés.
- Pendant les 40 maj de destruction, l'original pousse aussi les billes qui explosent (boucle 0x418943–0x418a3f) ; le
  moteur les laisse en place (D-34). Hors périmètre (zone de la session parallèle sur les trous).
- Le son d'alerte de la ligne de danger (0x418a74, même tête) n'existe pas dans la PWA.
- 1 point de courbe = 1,005 px gardé comme 1 px (0,5 %), comme en R2.0.24.
- Notes de version : ligne à ajouter au prochain baseline (R2.0.27, orchestrateur).

## Vérification humaine

1. `npm run dev`, 9-7 ou 12-1 : laisser la chaîne approcher du crâne (moins de 600 px), puis casser la chaîne en son
   milieu sans attraction (couleurs différentes de part et d'autre) : le tronçon arrière doit continuer à avancer à
   vitesse normale jusqu'au recollage, puis tout ralentit de nouveau.
2. Sans tirer (1-1) : la chaîne ralentit dans le dernier tiers et met toujours ≈ 83 s pour atteindre le crâne.

## Commits (branche q-slow)

- 9a6933f test(r227): RED locks for the slow-zone head of a split chain (front of the rear linked run, 0x418a28)
- f2ced74 fix(r227): the slow zone follows the front of the rear linked segment, not the whole chain's head (test 3 scenario moved to balls 5–7 so the rear front stays before the band)
