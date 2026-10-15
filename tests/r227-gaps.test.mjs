// R2.0.27 — second audit of gap shots (« tirs dans les brèches ») against inner.exe (scoring-audit, second pass).
// The original moves a flying projectile once per 100 Hz update (0x401fa0, firespeed px, no sweep) and, per update:
// off-screen test (x < 0, y < 0, x − 16 > 640, y − 16 > 480 → miss, 0x4237a9–0x423800), contact on the curves in order
// (0x421e10: first ball of the raw list within 32 px, not exploding, whose insertion-side point trunc(pos) ± 16 is not a
// tunnel point, 0x405d00), and only without contact the gap detector of every curve (0x414c60): it first re-tests the
// sample it fired on last (projectile+0xa0 + 4 × curve, 0x401f30 / 0x401f10) and does nothing while the projectile is
// still within 16 px of it; otherwise the first curve POINT 1, 33, 65… (screen point, tunnel points skipped) within
// 16 px gives the gap between the first ball beyond it and its list predecessor (centre width, key = front ball).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';

/** firespeed 6 px per update (configFromSettings: 6 × 100 / 60 = 10 px per 60 Hz tick). */
const cfg = { ...CANDIDATE, speed: 0, powerChance: 0, coinChance: 0, target: 99999, endSlowFactor: 1, projectileSpeed: 10 };
const ofKind = (g, kind) => g.events.filter(e => e.kind === kind);
const stepUntil = (g, kind, limit) => {
  for (let i = 0; i < limit; i++) {
    const before = g.events.length;
    g.step();
    const e = g.events.slice(before).find(ev => ev.kind === kind);
    if (e) return e;
  }
  throw new Error(`no ${kind} within ${limit} ticks`);
};
const engine = (tracks, frog, fixtures, extra = {}) => {
  const g = new ZumaEngine(tracks.map(t => new Track(t)), frog, { ...cfg, ...extra }, 5);
  g.feeding = false;
  fixtures.forEach((balls, i) => g.loadFixture({ balls, current: 0, next: 0, stream: false }, g.chains[i]));
  return g;
};
/** Flies `p` until it is gone or `stop(p)`; returns the largest gap count seen. */
const fly = (g, p, stop = () => false, limit = 200) => {
  let seen = 0;
  for (let i = 0; i < limit && g.projectiles.includes(p) && !stop(p); i++) {
    g.step();
    seen = Math.max(seen, p.gaps);
  }
  return seen;
};

/** Lower leg y = 240 (s 0..640), right leg, upper leg y = 100 (x = 640 − (s − 780)). Sparse: arc-length samples. */
const RECT = [[0, 240], [640, 240], [640, 100], [0, 100]];

test('the projectile moves once per 100 Hz update (firespeed px, 0x401fa0): positions start + 6·k, never a 10 px tick step', () => {
  const g = engine([RECT], { x: 336.5, y: 400 }, [[{ color: 1, s: 250 }, { color: 2, s: 400 }]]);
  g.command({ kind: 'shoot', x: 336.5, y: 0 });
  g.step();
  const p = g.projectiles[0];
  for (let i = 0; i < 12; i++) {
    const travelled = 384 - p.y;
    assert.ok(Math.abs(travelled / 6 - Math.round(travelled / 6)) < 1e-9, `y = ${p.y}: a whole number of 6 px updates from the muzzle (384)`);
    g.step();
  }
});

test('a gap sample grazed between two 60 Hz positions is still seen at 100 Hz: 15.5 px from the path → BONUS SAUT, « +N » = points added', () => {
  // Sample s = 321 at (321, 240); vertical path x = 336.5 → 15.5 px: inside the 16 px disc over 7.9 px of flight.
  // 6 px updates land at y = 240; 10 px ticks jump from 244 to 234 (both 16.0+ px away).
  const lower = [{ color: 1, s: 250 }, { color: 2, s: 400 }];
  const upper = [{ color: 0, s: 1068 }, { color: 0, s: 1100 }];
  const g = engine([RECT], { x: 336.5, y: 400 }, [[...lower, ...upper]]);
  g.command({ kind: 'shoot', x: 336.5, y: 0 });
  const insert = stepUntil(g, 'insert', 80);
  const ball = g.balls.find(b => b.id === insert.id);
  assert.equal(ball.gapCount, 1, 'the gap 250 … 400 was crossed');
  assert.equal(ball.gapBonus, 350, 'w = 150 → ⌊500 × (300 − 86) / 300⌋₁₀ = 350');
  const score = g.score;
  const destroy = stepUntil(g, 'destroy', 60);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 350);
  assert.equal(destroy.points, 30 + 350, 'the « +N » text shows 10 × n + gap bonus (0x420c49 formats the same edx as AddScore)');
  assert.equal(g.score - score, destroy.points, 'displayed amount = amount added to the score');
  const gap = ofKind(g, 'gap').at(-1);
  assert.equal(gap.count, 1, 'BONUS SAUT (single), no amount of its own');
  assert.equal(gap.points, 350);
});

test('dense curves (pack, ≈ 1 px per point): the detector samples curve POINTS 1, 33, 65… (screen points), not arc lengths', () => {
  // 1.2 px per point: point 1 + 32k sits at x = 1.2 + 38.4k (…, 308.4, 346.8, 385.2…), the arc sample at 1 + 32k.
  const dense = Array.from({ length: 534 }, (_, i) => [i * 1.2, 240]);
  const balls = [{ color: 1, s: 250 }, { color: 2, s: 450 }];
  // x = 327.6 is 19.2 px from points 257 (308.4) and 289 (346.8), but 6.6 px from the arc length 321.
  const g = engine([dense], { x: 327.6, y: 400 }, [balls]);
  g.command({ kind: 'shoot', x: 327.6, y: 0 });
  g.step();
  const p = g.projectiles[0];
  assert.equal(fly(g, p, q => q.y < 150), 0, 'no curve point within 16 px: no gap');
  const h = engine([dense], { x: 346.8, y: 400 }, [balls]);
  h.command({ kind: 'shoot', x: 346.8, y: 0 });
  h.step();
  const q = h.projectiles[0];
  assert.equal(fly(h, q, r => r.y < 150), 1, 'over point 289 (x = 346.8): the gap 250 … 450');
  assert.deepEqual(q.gapWidths, [200]);
});

test('the detector stays silent while the projectile is still on the sample that fired (projectile+0xa0, 0x401f30): no second gap when the ball ahead changes', () => {
  // Exploding run 272…368 under the sample s = 321 (not hittable, still in the list): w = 32 → key = ball 336.
  const balls = [{ color: 1, s: 240 }, { color: 3, s: 272 }, { color: 3, s: 304 }, { color: 3, s: 336 }, { color: 3, s: 368 }, { color: 2, s: 400 }];
  const g = engine([[[0, 240], [640, 240]]], { x: 321, y: 400 }, [balls]);
  for (const b of g.balls) if (b.color === 3) b.destroyingUntil = 1e9;
  g.command({ kind: 'shoot', x: 321, y: 0 });
  g.step();
  const p = g.projectiles[0];
  fly(g, p, q => q.gaps >= 1);
  assert.equal(p.gaps, 1);
  assert.ok(Math.hypot(p.x - 321, p.y - 240) < 16, 'still on the sample');
  // The run slides forward by 20 px: the first ball beyond s = 321 is now the former 304 (another key).
  for (const b of g.balls) b.s += 20;
  fly(g, p, q => q.y < 150);
  assert.equal(p.gaps, 1, 'one gap: the original does not look again before the projectile left the sample');
  assert.equal(p.gapWidths.length, 1);
});

test('off-screen like the original (0x4237a9): x < 0 or y < 0 is a miss at once; x − 16 > 640 or y − 16 > 480 too — no 64 px margin', () => {
  // Ball centre at x = −30: the projectile reaches x = 4 (34 px away) then −2 → removed before any contact.
  const left = engine([[[-200, 240], [640, 240]]], { x: 320, y: 240 }, [[{ color: 1, s: 170 }]]);
  left.command({ kind: 'shoot', x: 0, y: 240 });
  stepUntil(left, 'miss', 80);
  assert.equal(ofKind(left, 'insert').length, 0, 'never hit');
  // Right side: centre up to 656 is still on the board; a ball at x = 670 is hit from x = 642.
  const right = engine([[[0, 240], [700, 240]]], { x: 320, y: 240 }, [[{ color: 1, s: 670 }]]);
  right.command({ kind: 'shoot', x: 640, y: 240 });
  stepUntil(right, 'insert', 80);
  assert.equal(ofKind(right, 'miss').length, 0);
});

test('contact skips a ball whose INSERTION-SIDE point (trunc(pos) ± 16) is a tunnel point (0x405d00), not the ball centre', () => {
  const tunnel = Array.from({ length: 641 }, (_, x) => [x, 240, x >= 300 && x <= 400 ? 1 : 0]);
  // Centre 310 in the tunnel, rear side 294 outside: hit from behind.
  const a = engine([tunnel], { x: 296, y: 400 }, [[{ color: 1, s: 310 }]]);
  a.command({ kind: 'shoot', x: 296, y: 0 });
  const insert = stepUntil(a, 'insert', 80);
  assert.equal(a.balls.length, 2, `landed (${insert.id})`);
  // Centre 290 outside, front side 306 in the tunnel: the projectile flies through.
  const b = engine([tunnel], { x: 304, y: 400 }, [[{ color: 1, s: 290 }]]);
  b.command({ kind: 'shoot', x: 304, y: 0 });
  stepUntil(b, 'miss', 80);
  assert.equal(ofKind(b, 'insert').length, 0, 'never hit');
});

test('contact takes the curves in order and the FIRST ball of the list within 32 px (0x423749, 0x421eb8), not the nearest one', () => {
  // Path y = 222 from x = 383 leftwards; at x = 323 both A (300, 240) at 29.2 px and B (305, 200) at 28.4 px touch.
  const g = engine([[[0, 240], [640, 240]], [[0, 200], [640, 200]]], { x: 399, y: 222 }, [[{ color: 1, s: 300 }], [{ color: 2, s: 305 }]]);
  g.command({ kind: 'shoot', x: 0, y: 222 });
  const insert = stepUntil(g, 'insert', 80);
  assert.equal(insert.chain, 0, 'curve 0 is tested first');
  assert.equal(g.chains[0].balls.length, 2);
  assert.equal(g.chains[1].balls.length, 1);
});
