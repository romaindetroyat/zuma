// R2.0.21 — arrêt du pousseur au retrait de la bille arrière (recherche 06 Q5c, D-09).
// Règle originale (0x423a10) : quand une bille en destruction atteint 40 maj et que son nœud est le premier de la
// liste (0x423abc–0x423ac7, la bille que pousse le pousseur), mSpeed = 0 et arrêt = max(arrêt, 40 maj)
// (0x423ac9–0x423ad6), puis retrait (0x423970). Une insertion n'arrête jamais le pousseur (les recherches 01 §1 et 04
// avaient placé ce code dans l'insertion). Conversions : 40 maj × 0,6 = 24 ticks ; 0,005 px/maj² × 10 000 = 50 px/s².
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION } from '../.compiled/core.js';

const straight = (length = 640, y = 240) => new Track([[0, y], [length, y]]);
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
const headS = g => Math.max(...g.balls.map(b => b.s));
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Three balls cruising on a 2000 px track at 50 px/s (level 1-1 `speed` 0.5); colour 3 is absent (r216 fixture). */
const cruise = (extra = {}) => fixture([{ color: 0, s: 300 }, { color: 1, s: 332 }, { color: 2, s: 364 }], { speed: 50, ...extra }, 3, 2000);
/** Two colour-0 balls at the rear (the first one is the ball the pusher pushes), then 1 and 2; a 0 lands against them. */
const rearMatch = () => fixture([{ color: 0, s: 300 }, { color: 0, s: 332 }, { color: 1, s: 364 }, { color: 2, s: 396 }], { speed: 50 }, 0, 2000);

/**
 * Shoots a 0 into `g` at x and returns { destroy, removal }: the tick of the `destroy` event and the tick the
 * destroyed balls left `chain.balls` (destroyTicks later), with a per-tick trace of the pusher in between.
 */
const destroyAndRemove = (g, x, chainIndex = 0) => {
  g.command({ kind: 'shoot', x, y: 240 });
  const destroy = stepUntil(g, 'destroy', 120);
  const chain = g.chains[chainIndex];
  const ids = new Set(destroy.ids);
  const trace = [];
  for (let i = 0; i < 60; i++) {
    g.step();
    trace.push({ tick: g.tick, stopTicks: chain.stopTicks, speed: chain.speed });
    if (!chain.balls.some(b => ids.has(b.id))) return { destroy, removal: g.tick, trace };
  }
  throw new Error('destroyed balls never removed');
};

// ------------------------------------------------------------ source and configuration

test('pusherStopTicks keeps its value (40 maj × 0.6 = 24) and land() no longer arms the pusher stop', () => {
  assert.equal(CANDIDATE.pusherStopTicks, 24, '40 maj × 0.6');
  const src = read('.compiled/core.js');
  const i = src.indexOf('    land(');
  assert.ok(i > 0, 'land( found in the compiled engine');
  const body = src.slice(i, src.indexOf('\n    }\n', i));
  assert.doesNotMatch(body, /pusherStopTicks/, 'no stop armed by an insertion (D-09)');
  assert.doesNotMatch(body, /stopTicks/, 'land() does not touch the pusher counter at all');
  const removals = src.slice(src.indexOf('    processRemovals('), src.indexOf('\n    }\n', src.indexOf('    processRemovals(')));
  assert.match(removals, /pusherStopTicks/, 'the stop is armed where the destroyed balls leave the chain');
});

// ------------------------------------------------------------ insertion: no stop

test('an insertion into the rear segment no longer stops the pusher (stopTicks 0, speed 50 throughout)', () => {
  const g = cruise();
  const witness = cruise();
  g.command({ kind: 'shoot', x: 400, y: 240 });
  const insert = stepUntil(g, 'insert', 40);
  run(witness, insert.tick);
  assert.equal(g.chains[0].stopTicks, 0, 'nothing armed on the insert tick');
  assert.equal(g.chains[0].speed, 50, 'speed unchanged on the insert tick');
  const inserted = g.balls.find(b => b.color === 3);
  assert.ok(inserted && inserted.s === headS(g), 'the shot landed ahead of the head (new head, rear segment)');
  const h0 = headS(g);
  const w0 = headS(witness);
  for (let i = 0; i < 24; i++) {
    g.step();
    witness.step();
    assert.equal(g.chains[0].stopTicks, 0, `tick ${g.tick}: no stop`);
    assert.equal(g.chains[0].speed, 50, `tick ${g.tick}: cruising`);
  }
  near(headS(witness) - w0, 20, 1e-6, 'witness: 24 ticks at 50 px/s');
  const lag = Math.abs((headS(g) - h0) - (headS(witness) - w0));
  assert.ok(lag < 20, `the head advances like the witness, up to the opening slot (${lag} px)`);
});

test('an insertion that makes no match never arms anything later either (until the slot is settled)', () => {
  const g = cruise();
  g.command({ kind: 'shoot', x: 400, y: 240 });
  stepUntil(g, 'insert', 40);
  for (let i = 0; i < 60; i++) {
    g.step();
    assert.equal(g.chains[0].stopTicks, 0, `tick ${g.tick}`);
  }
  assert.equal(ofKind(g, 'destroy').length, 0);
});

// ------------------------------------------------------------ removal of the rear ball: stop

test('removal of the rear ball: no stop during the destruction, 24 ticks at speed 0 from the removal, then a restart from 0', () => {
  const g = rearMatch();
  const rear = g.balls[0];
  const { destroy, removal, trace } = destroyAndRemove(g, 330);
  assert.ok(destroy.ids.includes(rear.id), 'the destroyed run includes the rearmost ball');
  assert.equal(removal - destroy.tick, CANDIDATE.destroyTicks, 'removed destroyTicks (40 maj × 0.6) after the match');
  for (const row of trace.slice(0, -1)) {
    assert.equal(row.stopTicks, 0, `tick ${row.tick}: the destruction itself does not stop the pusher`);
    assert.equal(row.speed, 50, `tick ${row.tick}: speed kept during the destruction`);
  }
  assert.equal(g.chains[0].stopTicks, 24, 'armed on the removal tick');
  assert.equal(g.chains[0].speed, 0, 'mSpeed = 0 (0x423ac9)');
  assert.ok(!g.balls.some(b => b.id === rear.id), 'the rear ball is gone');
  for (let i = 0; i < 24; i++) {
    g.step();
    assert.equal(g.chains[0].speed, 0, `tick ${g.tick}: pusher stopped`);
    assert.equal(g.chains[0].stopTicks, 23 - i);
  }
  run(g, 60);
  assert.equal(g.chains[0].stopTicks, 0);
  near(g.chains[0].speed, 50, 1, '60 ticks after the stop: back to 50 px/s at +50 px/s² from 0 (0x423ca4–0x423caa)');
});

test('the stop restarts the pusher from 0: the speed ramps at 50 px/s² right after the 24 ticks', () => {
  const g = rearMatch();
  destroyAndRemove(g, 330);
  run(g, 24);
  assert.equal(g.chains[0].speed, 0);
  g.step();
  near(g.chains[0].speed, 50 / 60, 1e-9, 'first tick after the stop: +50 px/s² × 1/60 s');
  run(g, 29);
  near(g.chains[0].speed, 25, 1e-6, '30 ticks after the stop: 25 px/s');
});

test('removal of a block in the middle (the rear ball survives) stops nothing', () => {
  const g = fixture([{ color: 2, s: 300 }, { color: 0, s: 332 }, { color: 0, s: 364 }, { color: 1, s: 396 }, { color: 3, s: 428 }], { speed: 50 }, 0, 2000);
  const rear = g.balls[0];
  const { destroy } = destroyAndRemove(g, 360);
  assert.equal(destroy.count, 3, 'three 0 destroyed');
  assert.ok(!destroy.ids.includes(rear.id), 'the rear ball (colour 2) is not part of the run');
  assert.ok(g.balls.some(b => b.id === rear.id), 'the rear ball stays');
  assert.equal(g.chains[0].stopTicks, 0, 'no stop at the removal');
  assert.equal(g.chains[0].speed, 50, 'speed unchanged at the removal');
  run(g, 30);
  assert.equal(g.chains[0].stopTicks, 0);
});

test('a bomb whose blast removes the rear ball stops the pusher at the removal too', () => {
  const g = fixture([{ color: 1, s: 300 }, { color: 2, s: 332 }, { color: 0, s: 364, power: 'bomb' }, { color: 0, s: 396 }, { color: 3, s: 428 }], { speed: 50 }, 0, 2000);
  const rear = g.balls[0];
  g.command({ kind: 'shoot', x: 390, y: 240 });
  const destroy = stepUntil(g, 'destroy', 120);
  assert.ok(!destroy.ids.includes(rear.id), 'the match itself does not contain the rear ball');
  const bomb = ofKind(g, 'power-bomb').at(-1);
  assert.ok(bomb && bomb.count >= 2, 'the bomb blast took the rear balls');
  assert.equal(g.chains[0].stopTicks, 0, 'nothing armed when the bomb goes off');
  run(g, CANDIDATE.destroyTicks - 1);
  assert.ok(g.balls.some(b => b.id === rear.id), 'still exploding one tick before the removal');
  assert.equal(g.chains[0].stopTicks, 0);
  g.step();
  assert.ok(!g.balls.some(b => b.id === rear.id), 'removed');
  assert.equal(g.chains[0].stopTicks, 24, 'pusher stopped 24 ticks');
  assert.equal(g.chains[0].speed, 0);
});

test('outside play (clearing / draining) the removal of the rear ball arms nothing', () => {
  for (const state of ['draining', 'clearing']) {
    const g = rearMatch();
    const rear = g.balls[0];
    g.command({ kind: 'shoot', x: 330, y: 240 });
    const destroy = stepUntil(g, 'destroy', 120);
    assert.ok(destroy.ids.includes(rear.id));
    g.state = state; // the level ended while the rear ball was still exploding
    run(g, CANDIDATE.destroyTicks);
    assert.ok(!g.chains[0].balls.some(b => b.id === rear.id), `${state}: removed`);
    assert.equal(g.chains[0].stopTicks, 0, `${state}: no stop armed`);
  }
});

test('several chains: only the pusher of the chain whose rear ball is removed stops', () => {
  const g = new ZumaEngine([straight(2000, 240), straight(2000, 100)], frog, { ...quiet, speed: 50 }, 7);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 300 }, { color: 0, s: 332 }, { color: 1, s: 364 }, { color: 2, s: 396 }], current: 0, next: 1, stream: false }, g.chains[0]);
  g.loadFixture({ balls: [{ color: 1, s: 100 }, { color: 2, s: 132 }, { color: 3, s: 164 }], stream: false }, g.chains[1]);
  g.current = 0;
  const { destroy, removal } = destroyAndRemove(g, 330);
  assert.equal(destroy.chain, 0, 'the match is on the first chain');
  assert.ok(removal > destroy.tick);
  assert.equal(g.chains[0].stopTicks, 24, 'first chain stopped');
  assert.equal(g.chains[0].speed, 0);
  assert.equal(g.chains[1].stopTicks, 0, 'second chain untouched');
  assert.equal(g.chains[1].speed, 50);
});

// ------------------------------------------------------------ baseline

// R2.0.22: r222 locks '2.0.22'; this one only checks that the baseline moved past 2.0.21 and still agrees with the package.
test('baseline 2.0.21 superseded: ENGINE_VERSION is newer and agrees with package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(ENGINE_VERSION > '2.0.21', ENGINE_VERSION);
  assert.equal(pkg.version, ENGINE_VERSION);
  assert.match(pkg.description, new RegExp(`^Zuma R${ENGINE_VERSION.replaceAll('.', '\\.')} `));
});
