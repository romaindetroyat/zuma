// R2.0.18 — tunnels et priorités CURV, vies, pièces, décompte multi-chaînes (spike 03, D-23 / D-27 / D-28 / D-30)
// Octet A du CURV = tunnel (ni impact de projectile, ni point le plus proche), octet B = priorité de dessin 0..3 ;
// priorité d'une bille = max des priorités à ses deux bords (± 16) ; une vie à chaque multiple de 50 000 points
// franchi (sans plafond, y compris par le décompte du STATS) ; pièces : 10 s visibles, une tentative à 1/180 par tick
// dès 780 ticks après la précédente apparition, rien en ZUMA, `dist` en % de progression ; décompte de fin de niveau
// à un marqueur par chaîne, avancés ensemble.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION } from '../.compiled/core.js';
import { parseCurve } from '../tools/import-original.mjs';

const straight = (length = 640) => new Track([[0, 240], [length, 240]]);
const frog = { x: 320, y: 400 };
/** Short tracks sit entirely inside the original slow zone (600 + 500 px): fixtures that measure travel disable it. */
const quiet = { ...CANDIDATE, speed: 0, powerChance: 0, target: 99999, endSlowFactor: 1 };
const fixture = (balls, extra = {}, current = 0, length = 640) => {
  const g = new ZumaEngine(straight(length), frog, { ...quiet, ...extra }, 7);
  g.feeding = false;
  g.loadFixture({ balls, current, next: 1, stream: false });
  return g;
};
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const ofKind = (g, kind) => g.events.filter(e => e.kind === kind);
/** Steps until an event of `kind` is emitted (inclusive); returns the event or throws. */
const stepUntil = (g, kind, limit) => {
  for (let i = 0; i < limit; i++) {
    const before = g.events.length;
    g.step();
    const e = g.events.slice(before).find(ev => ev.kind === kind);
    if (e) return e;
  }
  throw new Error(`no ${kind} within ${limit} ticks`);
};
/** Points sampled every pixel from x0 to x1 on y, flags from `flag(x)`. */
const sampled = (x1, y, flag = () => 0, x0 = 0) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, flag(x0 + i)]);

// ------------------------------------------------------------ format CURV (0x4178c0) : x, y, A, B puis dx, dy, A, B

/** CURV v2 at the real layout: header, control block, count, float x / y, first A / B, then (count − 1) × [dx, dy, A, B]. */
const curvBuffer = (controls, first, firstA, firstB, quads) => {
  const size = 12 + 8 + controls.length * 10 + 12 + 2 + quads.length * 4;
  const buf = Buffer.alloc(size);
  buf.write('CURV', 0, 'latin1');
  buf.writeInt32LE(2, 4);
  buf.writeInt32LE(1, 8);
  buf.writeInt32LE(controls.length * 10 + 4, 12);
  buf.writeInt32LE(controls.length, 16);
  let pos = 20;
  for (const [x, y] of controls) { buf.writeInt32LE(x, pos); buf.writeInt32LE(y, pos + 4); pos += 10; }
  buf.writeInt32LE(quads.length + 1, pos);
  buf.writeFloatLE(first[0], pos + 4);
  buf.writeFloatLE(first[1], pos + 8);
  buf.writeUInt8(firstA, pos + 12);
  buf.writeUInt8(firstB, pos + 13);
  pos += 14;
  for (const [dx, dy, a, b] of quads) { buf.writeInt8(dx, pos); buf.writeInt8(dy, pos + 1); buf.writeUInt8(a, pos + 2); buf.writeUInt8(b, pos + 3); pos += 4; }
  assert.equal(pos, size);
  return buf;
};

test('parseCurve: first point x, y, A, B then dx, dy, A, B per point; flags = A | min(3, B) << 1, nothing left over', () => {
  const buf = curvBuffer([[10, 20], [60, 20]], [10, 20], 0, 1, [[100, 0, 0, 0], [100, 0, 1, 0], [0, 100, 0, 3], [-100, 0, 1, 9]]);
  const curve = parseCurve(buf);
  assert.equal(curve.version, 2);
  assert.deepEqual(curve.controls, [[10, 20], [60, 20]]);
  assert.deepEqual(curve.points, [[10, 20, 2], [11, 20, 0], [12, 20, 1], [12, 21, 6], [11, 21, 7]], 'B bounded to 3 (T-05-28)');
  assert.equal(curve.trailing, 0, 'the whole file is consumed (the old reader left 2 bytes)');
  const src = fs.readFileSync('tools/import-original.mjs', 'utf8');
  assert.match(src, /Math\.min\(3, [^)]*\) << 1/, 'priority on bits 1–2');
});

// ------------------------------------------------------------ Track : tunnel, priorité, priorité de bille (0x405c10)

const flagged = () => new Track(sampled(200, 0, x => (x >= 60 && x <= 80 ? 1 : 0) | (x >= 100 && x <= 150 ? 2 : 0) | (x >= 190 ? 6 : 0)));

test('Track: tunnelAt = bit 0, priorityAt = bits 1–2, layerAt keeps the raw flags', () => {
  const t = flagged();
  assert.equal(t.tunnelAt(70), true);
  assert.equal(t.tunnelAt(90), false);
  assert.equal(t.priorityAt(120), 1);
  assert.equal(t.priorityAt(195), 3);
  assert.equal(t.priorityAt(-5), 0, 'outside the track → 0');
  assert.equal(t.priorityAt(90), 0);
  assert.equal(t.layerAt(195), 6, 'raw flags unchanged');
  assert.equal(t.layerAt(70), 1);
});

test('Track.ballPriority: max of the priorities at s − 16 and s + 16 (radius 0x401720), not of a window', () => {
  const t = flagged();
  assert.equal(t.ballPriority(90), 1, 'front edge at 106');
  assert.equal(t.ballPriority(160), 1, 'rear edge at 144');
  assert.equal(t.ballPriority(170), 0, 'edges at 154 and 186');
  assert.equal(t.ballPriority(178), 3, 'front edge at 194');
  assert.equal(t.ballPriority(125, 0), 1, 'explicit radius');
  assert.equal(t.ballPriority(-100), 0);
});

test('Track.nearest(p, skipTunnel): segments whose two vertices are in a tunnel are ignored (0x414d6e)', () => {
  const t = flagged();
  const plain = t.nearest({ x: 70, y: 10 });
  assert.ok(Math.abs(plain.s - 70) < 1e-9);
  assert.ok(Math.abs(plain.dist - 10) < 1e-9);
  const skip = t.nearest({ x: 70, y: 10 }, true);
  assert.ok(skip.s <= 60 || skip.s >= 80, `outside the tunnel (${skip.s})`);
  assert.ok(skip.dist > 10);
  const all = new Track([[0, 0, 1], [10, 0, 1]]);
  assert.deepEqual(all.nearest({ x: 5, y: 5 }, true), { s: 0, dist: Infinity }, 'nothing left');
});

// ------------------------------------------------------------ collision : une bille en tunnel n'est pas touchable (0x408f52)

const tunnelLine = () => new Track(sampled(640, 240, x => (x >= 300 && x <= 400 ? 1 : 0)));
const tunnelFixture = s => {
  const g = new ZumaEngine(tunnelLine(), frog, quiet, 7);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 1, s }], current: 0, next: 0, stream: false });
  return g;
};

test('collision: a projectile flies through a ball sitting in a tunnel and misses; outside the tunnel it lands as before', () => {
  const g = tunnelFixture(350);
  g.command({ kind: 'shoot', x: 350, y: 240 });
  run(g, 120);
  assert.equal(ofKind(g, 'insert').length, 0, 'never hit');
  assert.equal(ofKind(g, 'miss').length, 1, 'the shot leaves the board');
  assert.equal(g.balls.length, 1);
  assert.equal(g.balls[0].s, 350, 'the ball did not move');
  const h = tunnelFixture(200);
  h.command({ kind: 'shoot', x: 200, y: 240 });
  stepUntil(h, 'insert', 60);
  assert.equal(h.balls.length, 2, 'landed at the contact');
  const core = fs.readFileSync('.compiled/core.js', 'utf8');
  assert.match(core, /tunnelAt\(b\.s\)\)\s*continue/, 'contact loop skips tunnel balls');
  assert.match(core, /nearest\(p, true\)/, 'trackGap ignores tunnel points');
});

// ------------------------------------------------------------ vies (0x417380)

test('extra lives: one per multiple of 50 000 crossed, several at once, no cap, from creditBonus too; none without crossing', () => {
  assert.equal(CANDIDATE.extraLifeEvery, 50_000);
  const g = fixture([]);
  g.score = 49_990;
  g.creditBonus(30);
  assert.equal(g.lives, CANDIDATE.lives + 1);
  assert.deepEqual(ofKind(g, 'extra-life').map(({ lives, count }) => ({ lives, count })), [{ lives: CANDIDATE.lives + 1, count: 1 }]);
  g.events = [];
  g.creditBonus(100);
  assert.equal(ofKind(g, 'extra-life').length, 0, 'no multiple crossed → no event');
  g.score = 0;
  g.creditBonus(100_010);
  assert.equal(g.lives, CANDIDATE.lives + 3);
  assert.deepEqual(ofKind(g, 'extra-life').map(e => e.count), [2], 'two at once');
  const h = fixture([]);
  for (let i = 0; i < 10; i++) h.creditBonus(50_000);
  assert.equal(h.lives, CANDIDATE.lives + 10, 'no cap');
  assert.equal(ofKind(h, 'extra-life').length, 10);
  const off = fixture([], { extraLifeEvery: 0 });
  off.creditBonus(500_000);
  assert.equal(off.lives, CANDIDATE.lives, 'extraLifeEvery 0 disables');
  assert.equal(ofKind(off, 'extra-life').length, 0);
});

test('extra lives: a match taking the score from 49 990 to 50 020 emits extra-life at the destroy tick', () => {
  const g = fixture([{ color: 0, s: 100 }, { color: 0, s: 132 }], {}, 0);
  g.score = 49_990;
  g.command({ kind: 'shoot', x: 164, y: 240 });
  const destroy = stepUntil(g, 'destroy', 120);
  assert.equal(destroy.points, 30);
  assert.equal(g.score, 50_020);
  const life = ofKind(g, 'extra-life');
  assert.equal(life.length, 1);
  assert.equal(life[0].tick, destroy.tick);
  assert.equal(life[0].lives, CANDIDATE.lives + 1);
  assert.equal(g.lives, CANDIDATE.lives + 1);
});

// ------------------------------------------------------------ pièces (0x417580, spike 03 Q4, D-28)

test('CANDIDATE: coins visible 600 ticks, first attempt at 180, then 780 ticks after the previous appearance at 1/180 per tick', () => {
  assert.equal(CANDIDATE.coinVisibleTicks, 600, '1 000 maj × 0.6');
  assert.equal(CANDIDATE.coinFirstTicks, 180, '300 maj × 0.6');
  assert.equal(CANDIDATE.coinRetryTicks, 780, '1 300 maj × 0.6');
  assert.ok(Math.abs(CANDIDATE.coinChance - 1 / 180) < 1e-12, '1/300 per maj ≈ 1/180 per tick');
  assert.equal('coinMinGapTicks' in CANDIDATE, false);
  assert.equal('coinMaxGapTicks' in CANDIDATE, false);
});

test('coins: first appearance ≥ 180, appearances ≥ 780 apart, natural vanish exactly 600 ticks later, one at a time, ≈ 960 ticks apart on average', () => {
  const g = fixture([{ color: 0, s: 100 }]);
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  run(g, 20_000);
  const appear = ofKind(g, 'coin-appear');
  const vanish = ofKind(g, 'coin-vanish');
  assert.ok(appear[0].tick >= 180, `first at ${appear[0].tick}`);
  for (let i = 1; i < appear.length; i++) assert.ok(appear[i].tick - appear[i - 1].tick >= 780, `gap ${i}: ${appear[i].tick - appear[i - 1].tick}`);
  for (const v of vanish) {
    const a = appear.find(e => e.id === v.id);
    assert.equal(v.tick - a.tick, 600, 'visible 10 s');
  }
  let visible = 0;
  for (const e of g.events) {
    if (e.kind === 'coin-appear') visible++;
    if (e.kind === 'coin-vanish' || e.kind === 'coin') visible--;
    assert.ok(visible >= 0 && visible <= 1, 'never two coins at once');
  }
  assert.ok(appear.length >= 14 && appear.length <= 30, `${appear.length} appearances in 20 000 ticks`);
});

test('coins: with coinChance 1 the cadence is exact — 180, then appearance + 780 whether the coin vanished or was grabbed', () => {
  const g = fixture([{ color: 0, s: 100 }], { coinChance: 1 });
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  run(g, 1800);
  assert.deepEqual(ofKind(g, 'coin-appear').map(e => e.tick), [180, 960, 1740]);
  assert.deepEqual(ofKind(g, 'coin-vanish').map(e => e.tick), [780, 1560]);
  // Grabbed 20-odd ticks after a spawn at t0: the next coin still comes at t0 + 780, not grab + 780.
  const h = fixture([{ color: 0, s: 100 }], { coinChance: 1 });
  h.setTreasure([{ x: 320, y: 200, curve: 0, dist: 0 }]);
  run(h, 10);
  h.spawnCoinForTest(0);
  const t0 = h.tick;
  h.command({ kind: 'shoot', x: 320, y: 0 });
  const grab = stepUntil(h, 'coin', 60);
  assert.ok(grab.tick > t0);
  const next = stepUntil(h, 'coin-appear', 1000);
  assert.equal(next.tick, t0 + 780, 'the grab does not move the retry deadline');
});

test('coins: no attempt once the ZUMA gauge is full; a coin already visible stays until its deadline', () => {
  const g = fixture([{ color: 0, s: 100 }], { coinChance: 1 });
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  g.zumaMode = true;
  run(g, 5000);
  assert.equal(ofKind(g, 'coin-appear').length, 0);
  const h = fixture([{ color: 0, s: 100 }], { coinChance: 1 });
  h.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  h.spawnCoinForTest(0);
  const t0 = h.tick;
  h.zumaMode = true;
  const v = stepUntil(h, 'coin-vanish', 700);
  assert.equal(v.tick, t0 + 600);
  run(h, 3000);
  assert.equal(ofKind(h, 'coin-appear').length, 1, 'only the spawned one');
});

test('coins: dist = percentage of its curve the chain head must have passed (0x40a900); dist 0 always free, no ball → only dist 0', () => {
  const at = (dist, balls = [{ color: 0, s: 256 }]) => {
    const g = fixture(balls);
    g.setTreasure([{ x: 100, y: 100, curve: 0, dist }]);
    run(g, 5000);
    return ofKind(g, 'coin-appear').length;
  };
  assert.ok(at(40) >= 1, 'head at 256 / 640 = 40 % frees dist 40');
  assert.equal(at(41), 0, 'dist 41 is never chosen');
  assert.ok(at(0) >= 1);
  assert.equal(at(10, []), 0, 'no ball on the curve → not free');
  assert.ok(at(0, []) >= 1, 'dist 0 → free without balls');
  const g = fixture([]);
  g.setTreasure([{ x: 1, y: 2, curve: 0, dist: 150 }, { x: 3, y: 4, curve: 0, dist: -5 }, { x: 5, y: 6, curve: 0, dist: 32 }]);
  assert.deepEqual(g.treasure.map(p => p.dist), [100, 0, 32], 'dist bounded to 0..100');
});

// ------------------------------------------------------------ décompte multi-chaînes (D-30, U33)

const lower = () => new Track([[0, 240], [2000, 240]]);
const upper = () => new Track([[0, 100], [2000, 100]]);
/** Two chains: chain 0 (y 240) gets a run at 320–352, chain 1 (y 100) a run at 560–592; both destroyed by shots, then the tally. */
const dualCleared = (upperBalls = [{ color: 1, s: 560 }, { color: 1, s: 592 }]) => {
  const g = new ZumaEngine([lower(), upper()], frog, { ...quiet, target: 30, levelBonus: 500 }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: upperBalls.length ? 1 : 0, next: 0, stream: false }, g.chains[0]);
  g.loadFixture({ balls: upperBalls, stream: false }, g.chains[1]);
  g.current = upperBalls.length ? 1 : 0;
  g.next = 0;
  const destroys = [];
  if (upperBalls.length) {
    g.command({ kind: 'shoot', x: 576, y: 100 });
    destroys[1] = stepUntil(g, 'destroy', 120);
    assert.equal(destroys[1].chain, 1);
    run(g, 10);
  }
  g.current = 0;
  g.command({ kind: 'shoot', x: 336, y: 240 });
  destroys[0] = stepUntil(g, 'destroy', 120);
  assert.equal(destroys[0].chain, 0);
  const clearing = stepUntil(g, 'clearing', 120);
  return { g, destroys, clearing };
};

test('tally, two chains: one marker per chain from its own last destruction, stepping together, +100 each, shared pops, won 30 ticks after the longest', () => {
  const { g, destroys, clearing } = dualCleared();
  const C = clearing.tick;
  const steps = destroys.map(d => Math.ceil((2000 - d.x) / 60));
  assert.ok(steps[1] < steps[0], `chain 1 (${steps[1]}) shorter than chain 0 (${steps[0]})`);
  assert.equal(g.cleanup.markers.length, 2);
  g.cleanup.markers.forEach((m, i) => {
    assert.equal(m.chain, i);
    assert.equal(m.steps, steps[i]);
    assert.equal(m.step, 0);
    assert.equal(m.s, 2000 - steps[i] * 60, `marker ${i} aligned on its skull`);
  });
  assert.equal(g.cleanup.steps, Math.max(...steps));
  assert.deepEqual(clearing.markers.map(m => [m.chain, m.steps]), [[0, steps[0]], [1, steps[1]]]);
  assert.deepEqual(clearing.markers.map(m => m.y), [240, 100]);
  assert.equal(clearing.chain, 0, 'the clearing point is the marker of the last destruction');
  const scoreAtClearing = g.score;
  const won = stepUntil(g, 'won', 600);
  const cleanups = ofKind(g, 'cleanup');
  assert.equal(cleanups.length, steps[0] + steps[1]);
  for (const chain of [0, 1]) {
    const mine = cleanups.filter(c => c.chain === chain);
    assert.equal(mine.length, steps[chain]);
    mine.forEach((c, i) => {
      const k = i + 1;
      assert.equal(c.tick, C + Math.ceil(12 + 2.4 * (k - 1) - 1e-9), `chain ${chain} step ${k} tick`);
      assert.equal(c.step, k);
      assert.equal(c.steps, steps[chain]);
      assert.equal(c.points, 100);
      assert.equal(c.x, 2000 - 60 * (steps[chain] - k));
      assert.equal(c.y, chain === 0 ? 240 : 100);
      assert.ok(Math.abs(c.progress - k / steps[chain]) < 1e-9);
    });
  }
  const sameTick = cleanups.filter(c => c.chain === 1).every(c => cleanups.some(d => d.chain === 0 && d.step === c.step && d.tick === c.tick));
  assert.ok(sameTick, 'step k of both chains at the same tick');
  assert.equal(g.cleanupScore, (steps[0] + steps[1]) * 100);
  assert.equal(won.score, scoreAtClearing + (steps[0] + steps[1]) * 100);
  const lastStep = cleanups.filter(c => c.chain === 0).at(-1).tick;
  assert.equal(won.tick, lastStep + 30);
  const pops = ofKind(g, 'cleanup-pop');
  const expected = [];
  for (let t = C + 12.6; t <= C + 12 + 2.4 * (steps[0] - 1) + 1e-9; t += 6) expected.push(Math.ceil(t - 1e-9));
  assert.deepEqual(pops.map(p => p.tick), expected, 'one shared pop clock up to the last step of the longest marker');
  assert.deepEqual(pops.map(p => p.index), expected.map((_, i) => i));
});

test('tally, two chains: a chain without destruction walks its whole track from the start', () => {
  const { g, clearing } = dualCleared([]);
  const m1 = g.cleanup.markers[1];
  assert.equal(m1.steps, Math.ceil(2000 / 60));
  assert.equal(m1.s, 2000 - m1.steps * 60);
  assert.equal(clearing.chain, 0);
  stepUntil(g, 'won', 600);
  assert.equal(ofKind(g, 'cleanup').filter(c => c.chain === 1).length, Math.ceil(2000 / 60));
});

test('tally, one chain: unchanged cadence through cleanup.markers[0]; a board emptied without an explosion walks the whole track', () => {
  const g = fixture([{ color: 0, s: 100 }], {}, 0, 2000);
  g.zumaMode = true;
  g.balls = [];
  g.step();
  const clearing = ofKind(g, 'clearing')[0];
  const steps = Math.ceil(2000 / 60);
  assert.equal(g.cleanup.markers.length, 1);
  assert.equal(g.cleanup.markers[0].steps, steps);
  assert.equal(g.cleanup.markers[0].s, 2000 - steps * 60);
  const won = stepUntil(g, 'won', 400);
  const cleanups = ofKind(g, 'cleanup');
  assert.equal(cleanups.length, steps);
  assert.equal(won.tick, cleanups.at(-1).tick + 30);
  assert.equal(won.tick, clearing.tick + Math.ceil(12 + 2.4 * (steps - 1) - 1e-9) + 30);
  const core = fs.readFileSync('.compiled/core.js', 'utf8');
  assert.match(core, /coinRetryTicks/);
  assert.doesNotMatch(core, /coinMaxGapTicks|scheduleCoin/);
});

// ------------------------------------------------------------ baseline

test('baseline 2.0.18: ENGINE_VERSION and package.json agree', () => {
  assert.equal(ENGINE_VERSION, '2.0.18');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.version, '2.0.18');
  assert.match(pkg.description, /^Zuma R2\.0\.18 — /);
});
