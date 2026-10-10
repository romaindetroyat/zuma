// R2.0.16 — règles d'exécution de l'original (spike D-12) : cinématique du pousseur (rampe, arrêt après
// insertion, zone lente, ZUMA conditionnel), arrivée rapide calculée, « PARTEZ » et chronomètre, couleurs
// repeat / single, munitions (D-14), décompte de fin de niveau, ACE TIME, pièce, configFromSettings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE, endZoneFactor } from '../.compiled/core.js';

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
const headS = g => Math.max(...g.balls.map(b => b.s));
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);

// ------------------------------------------------------------ §1 cadence et pousseur, §4 zone lente, §6 ZUMA

test('CANDIDATE carries the original pusher kinematics converted to 60 Hz', () => {
  assert.equal(CANDIDATE.chainAccel, 50, '0.005 px/maj² × 10 000 = 50 px/s²');
  assert.equal(CANDIDATE.chainDecel, 1000, '0.1 px/maj² × 10 000 = 1000 px/s²');
  assert.equal(CANDIDATE.pusherStopTicks, 24, '40 maj × 0.6');
  assert.equal(CANDIDATE.slowDistance, 500);
  assert.equal(CANDIDATE.dangerDistance, 600);
  assert.equal(CANDIDATE.endSlowFactor, 4);
  assert.equal(CANDIDATE.slowFactor, 4, 'the SLOW power-up keeps its own factor');
  assert.equal(CANDIDATE.zumaCoverage, 0.5);
  assert.equal(CANDIDATE.zumaSlowFactor, 0.25);
  assert.equal(CANDIDATE.zumaBackTicks, 180, '300 maj × 0.6');
  assert.equal(CANDIDATE.zumaSlowTicks, 660, '1100 maj × 0.6');
});

/** Three balls cruising on a 2000 px track at 50 px/s (level 1-1 `speed` 0.5); colour 3 is absent. */
const cruise = (extra = {}) => fixture([{ color: 0, s: 300 }, { color: 1, s: 332 }, { color: 2, s: 364 }], { speed: 50, ...extra }, 3, 2000);

test('cruise: speed 50 px/s moves the chain 50 px per second and Chain.speed reports it', () => {
  const g = cruise();
  assert.equal(g.chains[0].speed, null, 'lazy until the first step');
  run(g, 60);
  near(headS(g), 364 + 50, 0.5, 'head after 60 ticks');
  assert.equal(g.chains[0].speed, 50);
  assert.equal(g.chains[0].stopTicks, 0);
});

test('ramp: the pusher accelerates at 50 px/s² towards its target and decelerates at 1000 px/s²', () => {
  const g = cruise();
  run(g, 1);
  g.chains[0].speed = 0;
  let max = 0;
  for (let i = 0; i < 30; i++) { g.step(); max = Math.max(max, g.chains[0].speed); }
  near(g.chains[0].speed, 25, 1e-6, '30 ticks at +50 px/s²');
  for (let i = 0; i < 30; i++) { g.step(); max = Math.max(max, g.chains[0].speed); }
  assert.equal(g.chains[0].speed, 50, 'clamped on the target');
  run(g, 20);
  assert.equal(g.chains[0].speed, 50);
  assert.ok(max <= 50, `never above the target (${max})`);
  const fast = cruise();
  run(fast, 1);
  fast.chains[0].speed = 500;
  fast.step();
  near(fast.chains[0].speed, 500 - 1000 / 60, 1e-6, 'one tick at −1000 px/s²');
  let ticks = 1;
  while (fast.chains[0].speed > 50 && ticks < 100) { fast.step(); ticks++; }
  assert.ok(ticks <= 28, `back to 50 px/s within 28 ticks (${ticks})`);
  assert.equal(fast.chains[0].speed, 50);
});

test('pusher stop: an insertion into the rear segment halts the pusher 24 ticks, then it restarts from 0', () => {
  const g = cruise();
  const witness = cruise();
  g.command({ kind: 'shoot', x: 400, y: 240 });
  const insert = stepUntil(g, 'insert', 40);
  run(witness, insert.tick);
  assert.equal(g.chains[0].stopTicks, 24, 'armed on the insert tick');
  assert.equal(g.chains[0].speed, 0);
  const inserted = g.balls.find(b => b.color === 3);
  assert.ok(inserted && inserted.s === headS(g), 'the shot landed ahead of the head (new head)');
  const h0 = headS(g);
  const w0 = headS(witness);
  for (let i = 0; i < 24; i++) {
    g.step();
    witness.step();
    assert.equal(g.chains[0].speed, 0, `pusher stopped at tick ${g.tick}`);
    assert.equal(g.chains[0].stopTicks, 23 - i);
  }
  assert.ok(headS(g) - h0 < 20, `only the opening slot moved the head (${headS(g) - h0} px)`);
  near(headS(witness) - w0, 20, 1e-6, 'witness: 24 ticks at 50 px/s');
  run(g, 60);
  assert.equal(g.chains[0].stopTicks, 0);
  near(g.chains[0].speed, 50, 1, '60 ticks after the stop the pusher is back at +50 px/s² × 1.2 s');
  // An insertion into a segment that is not the pushed one does not arm the stop.
  const front = fixture([{ color: 0, s: 300 }, { color: 1, s: 332 }, { color: 2, s: 900 }, { color: 0, s: 932 }], { speed: 50 }, 3, 2000);
  const far = stepUntil((front.command({ kind: 'shoot', x: 932, y: 240 }), front), 'insert', 120);
  assert.ok(far.x > 800, `landed on the front segment (x ${far.x})`);
  assert.equal(front.chains[0].stopTicks, 0);
  assert.equal(front.chains[0].speed, 50);
  // The test hook insert() arms nothing either.
  const hook = cruise();
  run(hook, 1);
  hook.insert(0, { id: 900, color: 3 }, { x: 0, y: 0 }, 268);
  assert.equal(hook.chains[0].stopTicks, 0);
});

test('endZoneFactor: linear slow zone over slowDistance before the danger line, then 1 / endSlowFactor', () => {
  assert.equal(endZoneFactor(0, 2000, 500, 600, 4), 1);
  assert.equal(endZoneFactor(900, 2000, 500, 600, 4), 1);
  assert.equal(endZoneFactor(1150, 2000, 500, 600, 4), 0.625);
  assert.equal(endZoneFactor(1400, 2000, 500, 600, 4), 0.25);
  assert.equal(endZoneFactor(1999, 2000, 500, 600, 4), 0.25);
  assert.equal(endZoneFactor(1999, 2000, 500, 600, 1), 1, 'endSlowFactor 1 disables the zone');
  assert.equal(endZoneFactor(1999, 2000, 500, 600, 0.5), 1, 'factors below 1 never speed the chain up');
  assert.equal(endZoneFactor(10, 600, 500, 600, 4), 0.25, 'a track shorter than dangerDistance is slow everywhere');
  assert.equal(endZoneFactor(40, 640, 500, 600, 4), 0.25, 'danger line of a 640 px track = 40 px');
  near(endZoneFactor(10, 640, 500, 600, 4), 1 - 0.94 + 0.94 / 4, 1e-12, '30 px before the danger line of a 640 px track');
  assert.equal(endZoneFactor(1400, 2000, 0, 600, 4), 0.25, 'slowDistance 0: hard step at the danger line');
  assert.equal(endZoneFactor(1399, 2000, 0, 600, 4), 1);
  const g = fixture([{ color: 0, s: 1400 }], { speed: 60, endSlowFactor: 4 }, 1, 2000);
  run(g, 30);
  assert.equal(g.chains[0].speed, 15, '60 px/s ÷ 4 at the danger line');
  const mid = fixture([{ color: 0, s: 1150 }], { speed: 60, endSlowFactor: 4 }, 1, 2000);
  run(mid, 1);
  near(mid.chains[0].speed, 37.5, 1e-9, 'half-way through the slow zone');
});

/** r215 « zumaBackTicks / zumaSlowTicks » fixture, on a track of `length` px. */
const zumaFixture = (length, extra = {}, prepare = () => {}) => {
  const g = new ZumaEngine(straight(length), frog, { ...quiet, target: 30, total: 2, levelBonus: 500, ...extra }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  prepare(g);
  g.command({ kind: 'shoot', x: 336, y: 240 });
  const zuma = stepUntil(g, 'zuma', 60);
  return { g, zuma };
};

test('ZUMA: pushback and ×0.25 slowdown only when the head covers more than half of the track', () => {
  const { g, zuma } = zumaFixture(640, { zumaBackTicks: 30, zumaSlowTicks: 60 });
  assert.equal(g.backwardsTicks, 30);
  assert.equal(g.zumaSlowLeft, 60);
  assert.equal(g.slowTicks, 0, 'the SLOW power-up is not touched');
  assert.equal(zuma.pushback, true);
  near(zuma.coverage, headS(g) / 640, 1e-9, 'coverage = most advanced ball / track length');
  assert.ok(zuma.coverage > 0.5 && zuma.coverage < 0.65, `coverage ${zuma.coverage}`);
  const far = zumaFixture(2000, { zumaBackTicks: 30, zumaSlowTicks: 60 });
  assert.equal(far.g.backwardsTicks, 0);
  assert.equal(far.g.zumaSlowLeft, 0);
  assert.equal(far.zuma.pushback, false);
  assert.ok(far.zuma.coverage < 0.5 && far.zuma.coverage > 0.15, `coverage ${far.zuma.coverage}`);
  assert.ok(far.g.zumaMode, 'ZUMA mode itself does not depend on the coverage');
  const longer = zumaFixture(640, { zumaBackTicks: 30, zumaSlowTicks: 60 }, e => { e.backwardsTicks = 500; e.zumaSlowLeft = 1000; });
  assert.equal(longer.g.backwardsTicks, 500, 'a longer rollback already running is kept');
  assert.equal(longer.g.zumaSlowLeft, 1000);
  const defaults = zumaFixture(640);
  assert.equal(defaults.g.backwardsTicks, CANDIDATE.zumaBackTicks);
  assert.equal(defaults.g.zumaSlowLeft, CANDIDATE.zumaSlowTicks);
});

test('ZUMA slowdown: the target is speed × 0.25 while zumaSlowLeft runs, cumulated with the SLOW power-up', () => {
  const g = fixture([{ color: 0, s: 300 }, { color: 1, s: 332 }], { speed: 60 }, 3, 2000);
  g.zumaSlowLeft = 1000;
  run(g, 60);
  assert.equal(g.chains[0].speed, 15);
  assert.equal(g.zumaSlowLeft, 940, 'counted down every tick');
  g.slowTicks = 1000;
  run(g, 10);
  assert.equal(g.chains[0].speed, 3.75, '60 × 0.25 ÷ 4');
  g.slowTicks = 0;
  g.zumaSlowLeft = 0;
  run(g, 120);
  assert.equal(g.chains[0].speed, 60, 'back to the nominal speed at +50 px/s²');
});
