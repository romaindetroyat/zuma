---
status: awaiting_human_verify
trigger: "Ici, on voit les vitesses de chacun des niveaux. Adapte notre jeu à ça (levels.xml joint)"
created: 2026-10-12T00:00:00Z
updated: 2026-10-12T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the per-level values were already resolved and converted like the original; the felt speed
  differed because the pusher clamped its deceleration on the target (original 0x4188a7–0x4188e6 does not), plus a
  0.5 % px/point offset in the intro burst distance. Settings `colors` is ignored in adventure (0x420021–0x420068).
test: tests/r224-settings.test.mjs (9 tests; the 3 per-level tests read the private pack and skip without it)
expecting: user confirms the chain speed / slowdown before the skull now feels like the original
next_action: human verification in the real game (see « Vérification humaine »), then archive to resolved/

reasoning_checkpoint:
  hypothesis: "Our chain crosses the slow-zone band faster than the original because updatePusher clamped the
    −0.1 px/maj step on the target; the original subtracts it unclamped then climbs back at +0.005 px/maj (clamped),
    a sawtooth whose mean sits up to ≈ 0.05 px/maj under a decreasing target."
  confirming_evidence:
    - "0x4188a7–0x4188bc: fcomp m/target, test ah,0x41, jne → skip only when m ≤ target; else m − 0.1 stored, no clamp"
    - "0x4188bf–0x4188e6: m < target → m + 0.005, clamped to the target on this branch only"
    - "independent 100 Hz model of 0x405060 + 0x418780 vs engine: time to the skull −2.4 … −14.2 % before, −0.1 … −3.2 % after; GO within 0.03 s both"
  falsification_test: "engine skull times still > 2 % off the model on most boards after the per-maj unclamped step (observed: 73/76 within 2 %)"
  fix_rationale: "same per-maj rule and same burst distance unit as the original; the settings values and units were already right"
  blind_spots: "the original's head (+0x68 = first never-contacted ball, else the front ball), 1.005 px per curve point, float32 rounding; the SLOW power-up of the original is not analysed (our SLOW now shares the unclamped step)"

## Symptoms

expected: each adventure level plays with the speed / start / slowfactor / etc. of levels.xml
actual: the user feels our level speeds do not match levels.xml
errors: none
reproduction: play adventure levels and compare with the original
started: unknown

## Eliminated

- hypothesis: "<Settings> inherit unspecified attributes from the previous element or from `level1`"
  evidence: "0x4293d0 builds a fresh default LevelDesc for every element (0x429428 call 0x41aae0 → per-curve defaults 0x40b070); 0x40d3e0 writes a field only when its attribute exists; the only inheritance is an explicit settings=\"id\" attribute (0x4296a1–0x429798, map at this+0x54, copy 0x41e790), unused in levels.xml. A stage level = copy of its Settings desc (0x42c1b8 lookup, 0x42c26a 0x41e790) + graphics fields only (0x42c295 0x41e910: curve name, danger, drawcurve/drawtunnels, curvecolor, skullrot), then stage index +0xa4 / level number +0xa8 (0x42c2e5)"
  timestamp: 2026-10-12
- hypothesis: "speed is scaled at runtime by stage, temple or LevelProgression difficulty"
  evidence: "0x418780 target = speed (+ accrate ≤ maxspeed, none in adventure) × 0.25 (zumaslow) × slow zone; the coverage catch-up (0x418838–0x4188a4, < 30 %) needs board+0x187, written only by 0x44bba0 whose single caller is the Gauntlet screen (0x44a4fd); adventure load 0x41fdd0 → 0x420004 (board+0x1a8 = 0) copies the stage desc (0x4058a0) and rewrites colours only. `difficulty` / LevelProgression `standard` (level1–30) and `dual` (dual1–24) feed the Gauntlet branch (0x41fe0a–0x41ffca) — never adventure"
  timestamp: 2026-10-12
- hypothesis: "our speed units are wrong (× 60 instead of × 100) or the per-level speed is lost on the way to the engine"
  evidence: "100 Hz confirmed (research 05, 0x433a20 ×10 ms); headless run of the 76 boards: open-track pusher speed = speed × 100 px/s exactly before and after; GO within 0.03 s of the model"
  timestamp: 2026-10-12
- hypothesis: "duplicated `repeat` keeps the first value (40)"
  evidence: "XML AddAttribute 0x4c4390: std::map insert 0x416ec0; on collision (bl = 0) the existing value is reassigned 0x4c444a–0x4c446a → last wins (50); importer attrs() also keeps the last"
  timestamp: 2026-10-12

## Evidence

- timestamp: 2026-10-12
  checked: per-curve defaults 0x40b070 (floats 0x54c85c / 0x54c858 / 0x54c854 / 0x54c850)
  found: danger 600, speed 0.5, start 40, mergespeed 0.05, balls 0, repeat 40, single 10, colors 4, slowfactor 4.0, slowspeed 0, slowdistance 500, accrate 0, score 1000, skullrot −1, zumaback 300, zumaslow 1100, maxspeed 100, bomb/slow/acc/backfreq 3000; level defaults 0x41aae0: firespeed 6, partime 0, treasurefreq 300
  implication: configFromSettings defaults match the executable
- timestamp: 2026-10-12
  checked: adventure colours 0x420004–0x420068
  found: colors of every curve = min(6, 4 + ⌊desc+0xa4 / 3⌋) (imul 0x55555556 = ÷ 3), desc+0xa4 = 0-based stage written at 0x42c2e5; the Settings `colors` is overwritten
  implication: 4 / 5 / 6 by temple is the original rule (was a « public sources » fallback); `colors` in Settings ignored
- timestamp: 2026-10-12
  checked: pusher update 0x4188a7–0x4188e6 (constants 0x54c7e0 = 0.1, 0x54cb28 = 0.005)
  found: m > target → m −= 0.1 unclamped; then m < target → m = min(target, m + 0.005)
  implication: sawtooth under a decreasing target; our engine clamped (Math.max(target, …)) and ran through the band ≈ 4–6 px/s faster
- timestamp: 2026-10-12
  checked: intro burst 0x405060 (via 0x4181c2 after 0x4181ab head = 0)
  found: d = ⌊nbPoints × start / 100⌋ (0x404ed0 = point count, 0x51eb851f ÷ 100), V = v + 0.1 × ⌊18 + 0.5 (√((v + 20)² + 80 d) − (v + 20))⌋ (_ftol), decelerated by the same 0.1 px/maj rule
  implication: our feedSpeed formula was right; the distance used px (1.005 × points) → sometimes one 0.1 px/maj step more (≈ 23 px further on 11-7)
- timestamp: 2026-10-12
  checked: unquoted values (powerfreq=2500) and Gauntlet-only settings
  found: importer attrs() accepts `name=value`; powerfreq is set only on level16–30 / dual13–24 (Gauntlet); in adventure every board uses the default 3000
  implication: no adventure impact; the original power-up spawn model (one draw per type, 0x40ae70) stays a deferred item (05 deferred-items.md)
- timestamp: 2026-10-12
  checked: pack curves point spacing
  found: 1.0047–1.0053 px per point on all 25 curves
  implication: px/maj ≈ points/maj (0.5 %), kept as an approximation except for the burst distance

## Resolution

root_cause: Les valeurs par niveau étaient déjà résolues et converties comme dans l'original (défauts de
  l'exécutable pour un attribut absent, aucun héritage, dernier attribut dupliqué gagnant, `speed` px/maj × 100,
  aucune mise à l'échelle par étage). L'écart de vitesse venait de la cinématique du pousseur : notre moteur bornait
  la décélération de 0,1 px/maj sur la cible, l'original (0x4188a7–0x4188e6) ne la borne pas et remonte à
  +0,005 px/maj. Sous la cible décroissante de la bande lente (500 px avant la ligne de danger, là où la plupart des
  niveaux démarrent après l'arrivée rapide), la chaîne originale roule nettement sous la cible : nos chaînes
  atteignaient le crâne 2–14 % trop tôt. Secondaire : distance de l'arrivée rapide en px au lieu des points de courbe
  (1,005 px par point), et `colors` des Settings ignoré en aventure (même résultat avec ce levels.xml).
fix: ZumaEngine.updatePusher — une mise à jour par maj entière du tick, −0,1 px/maj sans butée puis +0,005 px/maj
  bornée (résidu flottant de l'arrivée ramené sur la cible) ; feedDistance — ⌊points × start / 100⌋ sur les courbes
  échantillonnées au pixel du pack, longueur en px sur les polylignes procédurales ; configFromSettings — couleurs
  min(6, 4 + ⌊étage / 3⌋) quel que soit `colors`, commentaire des règles de résolution. Importateur inchangé (aucune
  donnée nouvelle : un pack déjà installé suffit). README « Réglages originaux » mis à jour.
verification: npm test 588/588 (r224 : 9 tests, dont 3 sur le pack privé), npm run check, npm run -s guard verts.
  Mesure sans navigateur des 76 plateaux (pack réel, moteur réel, sans tir) contre un modèle 100 Hz indépendant de
  0x405060 + 0x418780 en points de courbe : temps jusqu'au crâne −14,2 … −2,4 % (moyenne −4,7 %) avant,
  −3,2 … −0,1 % (moyenne −0,7 %, 73/76 à ±2 %) après ; GO à ±0,03 s ; vitesse de croisière en piste ouverte =
  speed × 100 px/s avant comme après.
files_changed: [src/core.ts, src/main.ts (configFromSettings et son commentaire seulement), README.md,
  tests/r224-settings.test.mjs, tests/r215-presentation.test.mjs, tests/r216.test.mjs, tests/r219.test.mjs,
  tests/r221.test.mjs]

## Commits (branche q-speed)

- 2a8f6f1 test(r224): RED locks for the original per-level settings (colours, unclamped pusher step, time to skull)
- c8df8d6 fix(r224): original per-level speed kinematics and adventure colours

## Écarts restants (documentés, non corrigés)

- Le moteur mesure la piste en px ; l'original en points (1,005 px). Vitesses, `danger`, `slowdistance` et
  espacement des billes gardent l'équivalence 1 point = 1 px (≈ 0,5 %). Seule l'arrivée rapide utilise les points.
- Tête de chaîne : l'original prend la première bille jamais entrée en contact (+0x68 via 0x418a28–0x418a77), à
  défaut la bille de tête ; nous prenons la bille la plus avancée. Identique sans tir.
- `powerfreq` (défaut 3000 partout en aventure) : modèle d'apparition original (un tirage par type, 0x40ae70)
  toujours différé (05 deferred-items) ; ce n'est pas une variation par niveau.
- Le power-up RALENTIR de l'original n'est pas analysé ; le nôtre (cible ÷ 4) partage désormais le pas sans butée,
  ce qui peut faire reculer la chaîne d'environ 5 px/s pendant ≈ 0,1 s quand la cible tombe brutalement sous 10 px/s
  (ralenti ZUMA × 0,25 combiné, comme l'original le ferait avec zumaslow).
- `level1`–`level30` et `dual1`–`dual24` (progressions `standard` / `dual`, attribut `difficulty`) ne servent
  qu'au Gauntlet, absent de la PWA.
- Notes de version : ajouter la ligne « vitesse du pousseur sous la cible / couleurs par temple / arrivée rapide en
  points » dans R224_RELEASE_NOTES.md au prochain baseline (pas de bump ici).

## Vérification humaine

1. `npm run dev`, jouer 1-1 sans tirer : la chaîne ralentit dans le dernier tiers et met ≈ 83 s (contre 78 s en
   R2.0.23) pour atteindre le crâne.
2. 11-7 / 12-1 : l'arrivée rapide s'arrête ≈ 1 bille plus tôt qu'en R2.0.23.
3. Temples 4–6 : 5 couleurs ; temples 7–13 : 6 couleurs (inchangé).

## Tableau par niveau

Le tableau complet (valeurs résolues de levels.xml par niveau, avant / après, modèle) n'est pas versionné : il reproduit les réglages du pack original, qui ne doivent pas être publiés. Il est régénéré localement à partir du pack privé. Synthèse : sur les 76 plateaux de l'aventure, temps jusqu'au crâne de −3,2 % à −0,1 % du modèle de l'original (moyenne −0,7 % ; 73 sur 76 à moins de 2 %), contre −14,2 % à −2,4 % (moyenne −4,7 %) en R2.0.23.
