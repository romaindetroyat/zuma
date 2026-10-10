// R2.0.14 — insertion animée, tir depuis la bouche, trame de roulement
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';
import { rollFrame, BALL_CIRCUMFERENCE } from '../.compiled/feedback.js';

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

test('rollFrame is monotone in s, wraps around the circumference and covers every frame', () => {
  const frames = 50;
  const c = BALL_CIRCUMFERENCE;
  assert.ok(Math.abs(c - 2 * Math.PI * 16) < 1e-12);
  const forward = [];
  for (let s = 0; s < c - 1e-9; s += 0.5) forward.push(rollFrame(s, frames));
  for (let i = 1; i < forward.length; i++) assert.ok(forward[i] >= forward[i - 1], `forward frame dropped at ${i}`);
  assert.deepEqual([...new Set(forward)].sort((a, b) => a - b), Array.from({ length: frames }, (_, i) => i));
  const backward = [];
  for (let s = c - 0.25; s > 0; s -= 0.5) backward.push(rollFrame(s, frames));
  for (let i = 1; i < backward.length; i++) assert.ok(backward[i] <= backward[i - 1], `backward frame rose at ${i}`);
  assert.equal(rollFrame(-1, frames), rollFrame(c - 1, frames), 'negative s wraps');
  assert.equal(rollFrame(123.4, 1), 0);
  assert.equal(rollFrame(123.4, 0), 0);
  assert.equal(rollFrame(20, frames, 2 * c), rollFrame(10, frames), 'custom circumference scales the frame');
});

test('advancing balls roll forward, recoiling balls roll backwards', () => {
  assert.ok(rollFrame(28, 50) > rollFrame(20, 50), 'advance increases the frame');
  // r213 "local recoil" fixture: the destruction behind the rear segment makes it roll back.
  const g = fixture([{ color: 3, s: 100 }, { color: 2, s: 132 }, { color: 0, s: 164 }, { color: 0, s: 196 }, { color: 3, s: 228 }]);
  const rear = g.balls[0];
  const startFrame = rollFrame(rear.s, 50);
  g.command({ kind: 'shoot', x: 180, y: 240 });
  run(g, 30);
  assert.ok(g.events.some(e => e.kind === 'destroy'));
  assert.ok(rear.s < 100, `rear ball recoiled (${rear.s})`);
  assert.ok(rear.s > 0, 'no wrap-around over the recoil distance');
  assert.ok(rollFrame(rear.s, 50) < startFrame, `frame ${rollFrame(rear.s, 50)} < ${startFrame} after recoil`);
});

// ---------------------------------------------------------------- plan 04-06
// Colour generation driven by the original `repeat` / `single` settings.

/** Streams `count` colours from the spawn hole without moving the chain (the chain is emptied every tick). */
const streamColours = (count, extra = {}, seed = 11) => {
  const g = new ZumaEngine(straight(), frog, { ...quiet, ...extra, total: Number.POSITIVE_INFINITY }, seed);
  const chain = g.chains[0];
  const colours = [];
  while (colours.length < count) {
    chain.balls = [];
    g.step();
    for (const b of [...chain.balls].sort((a, b) => a.id - b.id)) colours.push(b.color);
  }
  return colours.slice(0, count);
};
const repeats = (colours) => colours.filter((c, i) => i > 0 && c === colours[i - 1]).length;
const longestRun = (colours) => {
  let best = 0;
  let run = 0;
  for (let i = 0; i < colours.length; i++) {
    run = i > 0 && colours[i] === colours[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
};

test('repeatChance repeats the previous colour at the configured rate and allows runs of three or more', () => {
  assert.equal(CANDIDATE.repeatChance, 0.5);
  assert.equal(CANDIDATE.singleChance, 0);
  const colours = streamColours(4000, { repeatChance: 0.5, singleChance: 0, colors: 4 });
  assert.equal(colours.length, 4000);
  assert.ok(colours.every(c => c >= 0 && c < 4));
  const share = repeats(colours) / (colours.length - 1);
  assert.ok(share >= 0.46 && share <= 0.54, `immediate repeat share ${share.toFixed(3)}`);
  assert.ok(longestRun(colours) >= 3, `longest run ${longestRun(colours)}`);
});

test('repeatChance 0 never repeats the previous colour', () => {
  const colours = streamColours(4000, { repeatChance: 0, singleChance: 0, colors: 4 });
  assert.equal(repeats(colours), 0);
});

test('singleChance 1 isolates every ball: no neighbour shares its colour', () => {
  const colours = streamColours(4000, { repeatChance: 0.5, singleChance: 1, colors: 4 });
  assert.equal(repeats(colours), 0);
});

test('singleChance injects isolated balls between runs', () => {
  // A single is different from the ball before it and forces the next one to differ too.
  // Two states: normal (single 0.5 → forced, else repeat 0.9) and forced (always differs, back to normal).
  // Stationary share of normal = 2/3, so the expected immediate repeat share is 2/3 × 0.5 × 0.9 = 0.30.
  const colours = streamColours(4000, { repeatChance: 0.9, singleChance: 0.5, colors: 4 });
  const share = repeats(colours) / (colours.length - 1);
  assert.ok(share > 0.26 && share < 0.34, `repeat share ${share.toFixed(3)}`);
  assert.ok(longestRun(colours) >= 3);
  // Isolated balls exist: a colour different from both neighbours.
  assert.ok(colours.some((c, i) => i > 0 && i + 1 < colours.length && c !== colours[i - 1] && c !== colours[i + 1]));
});

test('colour generation is deterministic for a given seed', () => {
  const a = streamColours(500, { repeatChance: 0.5, singleChance: 0.08, colors: 5 }, 42);
  const b = streamColours(500, { repeatChance: 0.5, singleChance: 0.08, colors: 5 }, 42);
  assert.deepEqual(a, b);
  const c = streamColours(500, { repeatChance: 0.5, singleChance: 0.08, colors: 5 }, 43);
  assert.notDeepEqual(a, c);
});

test('level 1-1 settings (repeat 50, 4 colours) show a run of three among the first 30 balls on three seeds', () => {
  for (const seed of [1, 2, 3]) {
    const colours = streamColours(30, { repeatChance: 0.5, singleChance: 0, colors: 4 }, seed);
    assert.ok(longestRun(colours) >= 3, `seed ${seed}: longest run ${longestRun(colours)}`);
  }
});

// The ZUMA gauge counts the points scored in the level (original `score` setting), not destroyed balls.
test('ZUMA mode starts when the level score reaches target (points), not after a ball count', () => {
  const track = new Track([[0, 240], [640, 240], [640, 100], [0, 100]]);
  const g = new ZumaEngine(track, frog, { ...quiet, target: 100 }, 3);
  g.feeding = false;
  g.score = 5000; // carried over from previous levels: must not count towards the gauge
  const destroyThree = () => {
    g.loadFixture({ balls: [{ color: 0, s: 304 }, { color: 0, s: 336 }], current: 0, next: 1, stream: false });
    g.command({ kind: 'shoot', x: 320, y: 240 });
    run(g, 40);
    assert.ok(g.events.some(e => e.kind === 'destroy' && e.count === 3), 'three balls destroyed');
  };
  destroyThree();
  assert.equal(g.levelScore, 30);
  assert.equal(g.zumaMode, false);
  destroyThree();
  assert.equal(g.levelScore, 60);
  assert.equal(g.destroyedCount, 6, 'destroyedCount keeps counting balls for the statistics');
  assert.equal(g.zumaMode, false, '60 points < target 100');
  assert.ok(!g.events.some(e => e.kind === 'zuma'));
  // Gap on the lower segment (s 132 → 500), then a run of four on the upper segment: 100 + 40 + 10 points.
  g.loadFixture({
    balls: [{ color: 1, s: 100 }, { color: 2, s: 132 }, { color: 3, s: 500 }, { color: 1, s: 532 }, { color: 0, s: 1058 }, { color: 0, s: 1090 }, { color: 0, s: 1122 }],
    current: 0, next: 1, stream: false,
  });
  g.command({ kind: 'shoot', x: 320, y: 100 });
  run(g, 60);
  assert.ok(g.events.some(e => e.kind === 'gap'), 'gap bonus');
  assert.ok(g.events.some(e => e.kind === 'destroy' && e.count === 4), 'four balls destroyed');
  assert.equal(g.levelScore, 210);
  assert.equal(g.score, 5210);
  assert.ok(g.zumaMode);
  assert.equal(g.events.filter(e => e.kind === 'zuma').length, 1, 'zuma emitted once');
  // Further points never re-emit the event.
  g.loadFixture({ balls: [{ color: 0, s: 304 }, { color: 0, s: 336 }], current: 0, next: 1, stream: false });
  g.command({ kind: 'shoot', x: 320, y: 240 });
  run(g, 40);
  assert.equal(g.levelScore, 240);
  assert.equal(g.events.filter(e => e.kind === 'zuma').length, 0, 'loadFixture cleared events; no second zuma');
});
