// R2.0.14 — insertion animée, tir depuis la bouche, trame de roulement
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';

const straight = () => new Track([[0, 240], [640, 240]]);
const frog = { x: 320, y: 400 };
const quiet = { ...CANDIDATE, speed: 0, feedSpeed: 0, powerChance: 0, target: 99999 };
const fixture = (balls, extra = {}, current = 0) => {
  const g = new ZumaEngine(straight(), frog, { ...quiet, ...extra }, 7);
  g.feeding = false;
  g.loadFixture({ balls, current, next: 1, stream: false });
  return g;
};
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
/** Steps until the first chain holds `count` balls; returns the landing tick. */
const stepUntilBalls = (g, count, limit = 60) => {
  for (let i = 0; i < limit; i++) {
    g.step();
    if (g.balls.length === count) return g.tick;
  }
  throw new Error(`no landing within ${limit} ticks`);
};

test('an inserted ball opens its slot over mergeTicks', () => {
  // Colour 3 is absent from the chain: nothing can match, only the geometry is observed.
  const g = fixture([{ color: 0, s: 288 }, { color: 1, s: 320 }, { color: 2, s: 352 }], {}, 3);
  const front = g.balls[2];
  g.command({ kind: 'shoot', x: 320, y: 240 });
  const landing = stepUntilBalls(g, 4);
  const inserted = g.balls.find(b => b.color === 3);
  assert.ok(inserted, 'shot ball joined the chain');
  assert.equal(inserted.width, 0, 'a landing ball starts with width 0');
  assert.ok(inserted.enterFrom && typeof inserted.enterFrom.x === 'number', 'enterFrom records the landing point');
  assert.equal(front.s, 352, 'the ball ahead has not moved yet on the landing tick');
  run(g, 6);
  assert.ok(Math.abs(inserted.width - 0.5) < 1e-9, `width grows linearly (${inserted.width})`);
  assert.ok(front.s > 352 && front.s < 384, `the ball ahead slides progressively (${front.s})`);
  run(g, 6);
  assert.equal(g.tick, landing + CANDIDATE.mergeTicks);
  assert.equal(inserted.width, 1, 'width is clamped to exactly 1 once the slot is open');
  assert.equal(inserted.enterFrom, undefined, 'enterFrom is dropped once settled');
  assert.ok(Math.abs(front.s - 384) < 1e-6, `the ball ahead ends one spacing further (${front.s})`);
  const s = g.balls.map(b => b.s);
  for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i] - s[i - 1] - CANDIDATE.ballSpacing) < 1e-6, `gap ${i} = ${s[i] - s[i - 1]}`);
  assert.ok(!g.events.some(e => e.kind === 'destroy'), 'no match for an absent colour');
});

test('run detection waits until the slot is open', () => {
  const g = fixture([{ color: 0, s: 304 }, { color: 0, s: 336 }]);
  g.command({ kind: 'shoot', x: 320, y: 240 });
  const landing = stepUntilBalls(g, 3);
  assert.ok(!g.events.some(e => e.kind === 'destroy'), 'no destruction on the landing tick');
  assert.equal(g.stats.hits, 0);
  run(g, CANDIDATE.mergeTicks - 1);
  assert.ok(!g.events.some(e => e.kind === 'destroy'), 'still no destruction one tick before the slot is open');
  g.step();
  const destroyed = g.events.find(e => e.kind === 'destroy');
  assert.ok(destroyed, 'destroy event expected once the slot is open');
  assert.equal(destroyed.tick, landing + CANDIDATE.mergeTicks);
  assert.equal(destroyed.count, 3);
  assert.equal(g.stats.hits, 1);
});

test('insert() stays instantaneous for fixtures', () => {
  const g = fixture([{ color: 0, s: 288 }, { color: 1, s: 320 }]);
  const ball = g.insert(1, { id: 99, color: 2 }, { x: 0, y: 0 }, 320);
  assert.equal(ball.width, 1);
  assert.equal(ball.enterFrom, undefined);
  assert.deepEqual(g.balls.map(b => b.id), [g.balls[0].id, 99, g.balls[2].id]);
  assert.equal(g.balls[2].s, 352, 'the ball ahead is pushed immediately, without a step');
});

test('projectiles leave from muzzleOffset', () => {
  assert.equal(CANDIDATE.mergeTicks, 12);
  assert.equal(CANDIDATE.muzzleOffset, CANDIDATE.ballRadius);
  const far = fixture([], { muzzleOffset: 24 });
  far.command({ kind: 'shoot', x: 320, y: 0 });
  far.step();
  assert.equal(far.projectiles.length, 1);
  assert.ok(Math.abs(far.projectiles[0].y - (400 - 24 - CANDIDATE.projectileSpeed)) < 1e-9, `y=${far.projectiles[0].y}`);
  assert.equal(far.projectiles[0].x, 320);
  const near = fixture([]);
  near.command({ kind: 'shoot', x: 320, y: 0 });
  near.step();
  assert.ok(Math.abs(near.projectiles[0].y - (400 - CANDIDATE.ballRadius - CANDIDATE.projectileSpeed)) < 1e-9, `y=${near.projectiles[0].y}`);
});
