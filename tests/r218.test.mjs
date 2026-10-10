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

// ------------------------------------------------------------ baseline

test('baseline 2.0.18: ENGINE_VERSION and package.json agree', () => {
  assert.equal(ENGINE_VERSION, '2.0.18');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.version, '2.0.18');
  assert.match(pkg.description, /^Zuma R2\.0\.18 — /);
});
