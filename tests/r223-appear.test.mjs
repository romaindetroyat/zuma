// R2.0.23 (debug session balls-appear-suddenly) — « certaines boules apparaissent subitement ».
// Four independent causes found by a headless detector over every pack level and confirmed in Chromium:
// 1. a new level's chains were drawn over the previous board while its art loaded (startLevel published the engine
//    before awaiting levelArt);
// 2. once the rearmost balls (the queued one included) were destroyed, spawnBalls refilled the whole stretch from the
//    entrance to the next ball in a single tick (25 balls in one frame on 2-5) — the original only ever enters a pending
//    ball at the start of the curve (0x418510, waypoint 1);
// 3. a contact recoil resolved in one tick the overlaps left by alive balls that had rolled into exploding ones, so the
//    whole rear chain jumped back by up to ~100 px;
// 4. balls were drawn from s = −radius, extrapolated before the curve start: on inversespiral the start is under the
//    skull cutout and every entering ball popped in above it, off the track.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';
import * as render from '../.compiled/render.js';

const straight = (length = 640, y = 240) => new Track([[0, y], [length, y]]);
const frog = { x: 320, y: 400 };
const quiet = { ...CANDIDATE, speed: 0, powerChance: 0, target: 99999, endSlowFactor: 1 };
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
/** Body of a compiled method, up to the closing brace at its indentation. */
const method = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature.trim()} compiled`);
  const end = src.indexOf('\n    }', start);
  return src.slice(start, end > 0 ? end : undefined);
};

// ------------------------------------------------------------------- 2. entry of the stream at the entrance

test('the rear group and the queued ball destroyed: the next balls enter at the entrance, none is created mid-track', () => {
  const g = new ZumaEngine(straight(), frog, quiet, 7);
  g.feeding = false;
  // Queued ball at −10 (not yet on the curve), two balls on the curve, then the front segment far ahead.
  g.loadFixture({ balls: [{ color: 0, s: -10 }, { color: 1, s: 22 }, { color: 2, s: 54 }, { color: 3, s: 300 }, { color: 3, s: 332 }], stream: true });
  const front = g.balls.slice(3).map(b => ({ b, s: b.s }));
  g.activatePowerForTest('bomb', 1); // the bomb takes −10, 22 and 54 (within 72 px), not the front segment
  assert.deepEqual(g.balls.filter(b => b.destroyingUntil !== undefined).map(b => b.s), [-10, 22, 54]);
  const known = new Set(g.balls.map(b => b.id));
  for (let t = 0; t < 60; t++) {
    g.step();
    const created = g.balls.filter(b => !known.has(b.id));
    for (const b of created) {
      assert.ok(b.s <= 0, `tick ${g.tick}: ball ${b.id} created at s = ${b.s.toFixed(1)}, on the visible curve`);
      known.add(b.id);
    }
    assert.ok(created.length <= 2, `tick ${g.tick}: ${created.length} balls created at once`);
  }
  assert.ok(g.balls.some(b => b.s < 0), 'the stream goes on from the entrance');
  for (const { b, s } of front) assert.equal(b.s, s, 'the front segment stays where it was (speed 0, nothing pushes it)');
});

test('the fast feed stays one contiguous chain even when it outruns a spacing per tick (several balls fed per tick)', () => {
  const g = new ZumaEngine(straight(4000), frog, { ...quiet, speed: 3000 }, 7); // 50 px per tick > 32 px spacing
  g.feeding = false;
  for (let t = 0; t < 40; t++) {
    g.step();
    const alive = g.alive();
    for (let i = 1; i < alive.length; i++) {
      assert.ok(Math.abs(alive[i].s - alive[i - 1].s - 32) < 1e-6, `tick ${g.tick}: gap ${alive[i].s - alive[i - 1].s} between ${i - 1} and ${i}`);
    }
  }
  assert.ok(g.alive().length > 50, 'balls were fed every tick');
});

// --------------------------------------------------------------------- 3. recoil without a teleport

test('a contact recoil moves the balls behind it at most by its own step, even through overlapping exploding balls', () => {
  const g = new ZumaEngine(straight(), frog, quiet, 7);
  g.feeding = false;
  // State captured on 1-1 seed 16838 tick 369 (detector), reduced: alive R1 R2 | exploding X1 X2 X3 left in place while
  // the alive balls rolled into them (the list is no longer in curve order) | alive F F2, F2 recoiling.
  g.loadFixture({ balls: [36, 68, 64, 96, 128, 100, 132].map((s, i) => ({ color: i % 4, s })), stream: false });
  const [r1, r2, x1, x2, x3, f, f2] = g.balls;
  for (const x of [x1, x2, x3]) x.destroyingUntil = g.tick + 20;
  g.chains[0].recoils.push({ id: f2.id, ticks: 18, speed: 50 });
  const before = new Map(g.balls.map(b => [b.id, b.s]));
  g.step();
  const step = 50 / 60;
  for (const b of [r1, r2, f, f2]) {
    const moved = before.get(b.id) - b.s;
    assert.ok(moved <= step + 1e-9, `ball at ${before.get(b.id)} moved ${moved.toFixed(2)} px back in one tick (recoil step ${step.toFixed(2)})`);
  }
  assert.ok(Math.abs(before.get(f2.id) - f2.s - step) < 1e-9, 'the recoiling ball rolls back its step');
  assert.ok(before.get(f.id) - f.s > 0, 'the ball behind in contact is pushed');
});

// ------------------------------------------------------------------ 1. the level view swaps with the engine

test('main.js startLevel: the level, the engine and the renderer view are published together, after the last await', () => {
  const body = method(read('.compiled/main.js'), '    async startLevel() {');
  const lastAwait = body.lastIndexOf('await ');
  assert.ok(lastAwait > 0, 'startLevel awaits the level and its art');
  for (const marker of ['this.level = ', 'this.engine = engine', 'this.renderer.setLevel(']) {
    const at = body.indexOf(marker);
    assert.ok(at > 0, `${marker} in startLevel`);
    assert.ok(at > lastAwait, `${marker} comes after the last await: no frame may draw the new engine with the previous board`);
  }
  assert.match(body, /levelArt\(/, 'the art is still loaded there');
});

// ----------------------------------------------------------------- 4. no ball drawn before the curve start

test('render: before its first point a curve is not extrapolated when it starts on the board; off-stage starts slide in as before', () => {
  assert.equal(typeof render.boardBallVisible, 'function', 'boardBallVisible exported by render.js');
  assert.equal(typeof render.onStage, 'function', 'onStage exported by render.js');
  const { boardBallVisible, onStage } = render;
  // Start on the board (inversespiral (244, 170), under the skull cutout): drawn only once on the curve.
  assert.equal(boardBallVisible(-16, 1000, 16, true), false, 'queued ball before an on-board start: not drawn');
  assert.equal(boardBallVisible(-0.5, 1000, 16, true), false);
  assert.equal(boardBallVisible(0, 1000, 16, true), true, 'on the curve from s = 0 (the original enters a ball at waypoint 1)');
  // Start off the stage (every other pack curve): the ball slides in from the edge, unchanged.
  assert.equal(boardBallVisible(-16, 1000, 16, false), true);
  assert.equal(boardBallVisible(-16.5, 1000, 16, false), false);
  for (const onBoard of [true, false]) {
    assert.equal(boardBallVisible(500, 1000, 16, onBoard), true);
    assert.equal(boardBallVisible(1016, 1000, 16, onBoard), true, 'into the skull up to one radius past the end, as before');
    assert.equal(boardBallVisible(1017, 1000, 16, onBoard), false);
    assert.equal(boardBallVisible(Number.NaN, 1000, 16, onBoard), false, 'non-finite → not drawn');
  }
  assert.equal(onStage({ x: 244, y: 170 }), true);
  for (const p of [{ x: 137.41, y: 485.19 }, { x: -20.08, y: 133.6 }, { x: 667.04, y: 13.29 }, { x: 296.92, y: -11.6 }, { x: Number.NaN, y: 0 }]) assert.equal(onStage(p), false, JSON.stringify(p));
  const src = read('src/render.ts');
  const body = method(src, '  private boardBalls(');
  assert.match(body, /onStage\(track\.points\[0\]\)/, 'boardBalls reads where the curve starts');
  assert.match(body, /boardBallVisible\(ball\.s, track\.length, r, startOnStage\)/, 'boardBalls uses the rule');
});
