// R2.0.19 — destruction, attraction, rebond au contact, recul ZUMA, sortie par l'entrée, pièce, vies
// (spike 04, D-31 / D-33 / D-34 / D-35).
// Une bille détruite reste 40 maj (24 ticks) sans que rien ne bouge ; à la fin de la destruction, deux bords de même
// couleur déclenchent l'attraction du segment avant (compteur v = 10, ⌊v/8⌋ px par maj puis v += 1, sans plafond) ;
// une bille tirée sans alignement contre une brèche de sa couleur arme v = 1 ; au contact d'une attraction, la bille
// la plus avancée du segment arrivé recule 30 maj à max(0,5 ; 1,5 × profondeur) px/maj en poussant toute la chaîne
// derrière elle, pousseur arrêté au moins 20 maj ; plus aucun recul au moment du match.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION } from '../.compiled/core.js';

const straight = (length = 640, y = 240) => new Track([[0, y], [length, y]]);
const frog = { x: 320, y: 400 };
/** Short tracks sit entirely inside the original slow zone (600 + 500 px): fixtures that measure travel disable it. */
const quiet = { ...CANDIDATE, speed: 0, powerChance: 0, target: 99999, endSlowFactor: 1 };
const fixture = (balls, extra = {}, current = 0, length = 640, at = frog) => {
  const g = new ZumaEngine(straight(length), at, { ...quiet, ...extra }, 7);
  g.feeding = false;
  g.loadFixture({ balls, current, next: current, stream: false });
  return g;
};
/** Fixture whose frog sits right below `x`: a shot at (x, 240) flies straight up and lands at s = x. */
const below = (x, balls, extra = {}, current = 0, length = 640) => fixture(balls, extra, current, length, { x, y: 400 });
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
const balls = spec => spec.map(([color, s]) => ({ color, s }));
const byId = (g, id, chain = 0) => g.chains[chain].balls.find(b => b.id === id);
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected} ± ${tol}`);

/** Reference attraction (0x421800): maj count to close a free gap of `gap` px from v0, ⌊v/8⌋ px then v += 1 per maj. */
const majProfile = (gap, v0) => {
  let d = 0, v = v0, m = 0;
  while (d < gap) { d += Math.floor(v / 8); v++; m++; }
  return m;
};
/** Same profile in ticks, with the engine's maj clock (+100/60 per tick, whole maj steps) starting at `clock0`. */
const attractTicks = (gap, v0, clock0) => {
  let d = 0, v = v0, clock = clock0;
  for (let t = 1; t < 1000; t++) {
    clock += 100 / 60;
    const steps = Math.floor(clock + 1e-9);
    clock -= steps;
    for (let m = 0; m < steps; m++) {
      d += Math.floor(v / 8);
      v++;
      if (d >= gap) return t;
    }
  }
  throw new Error('no contact');
};

/** « bords 2 / 2 »: 2@100, 0@132, 0@164, 2@196, 3@228, a 0 shot between 0@164 and 2@196 destroys three 0s. */
const edges22 = (extra = {}) => below(180, balls([[2, 100], [0, 132], [0, 164], [2, 196], [3, 228]]), extra, 0);
/** Shoots and steps to the `destroy`; returns it with the ids of the rear ball and of the front segment. */
const shootToDestroy = (g, x) => {
  g.command({ kind: 'shoot', x, y: 240 });
  return stepUntil(g, 'destroy', 60);
};

// ------------------------------------------------------------ configuration

test('CANDIDATE: destruction 24 ticks (40 maj), attraction counters 10 / 1, contact recoil 18 ticks at max(50, 150 × depth), stop 12', () => {
  assert.equal(CANDIDATE.destroyTicks, 24, '40 maj × 0.6 (0x423a62)');
  assert.equal(CANDIDATE.attractStartAfterMatch, 10);
  assert.equal(CANDIDATE.attractStartAfterShot, 1);
  assert.equal(CANDIDATE.contactRecoilTicks, 18, '30 maj × 0.6');
  assert.equal(CANDIDATE.contactRecoilMin, 50, '0.5 px/maj');
  assert.equal(CANDIDATE.contactRecoilPerDepth, 150, '1.5 px/maj');
  assert.equal(CANDIDATE.contactPusherStopTicks, 12, '20 maj × 0.6');
  for (const gone of ['attractSpeed', 'recoilSpeed', 'recoilTicks']) assert.equal(gone in CANDIDATE, false, `${gone} removed`);
  assert.equal(majProfile(96, 10), 34, 'reference: 96 px from v = 10 in 34 maj');
  assert.equal(majProfile(32, 10), 18, 'reference: 32 px from v = 10 in 18 maj');
  assert.equal(majProfile(32, 1), 26, 'reference: 32 px from v = 1 in 26 maj');
});

// ------------------------------------------------------------ destruction : 24 ticks, rien ne bouge

test('no movement at match time: the rear ball and the front segment keep their place for the 24 destruction ticks', () => {
  const g = edges22();
  const destroy = shootToDestroy(g, 180);
  assert.equal(destroy.depth, 1);
  assert.equal(destroy.count, 3);
  const T = destroy.tick;
  assert.equal(g.removals.length, 1);
  assert.equal(g.removals[0].due, T + 24);
  const rear = g.balls[0];
  const front = g.balls.filter(b => b.destroyingUntil === undefined && b.s > 150);
  assert.deepEqual(front.map(b => b.color), [2, 3]);
  const at = [rear.s, ...front.map(b => b.s)];
  assert.deepEqual(at, [100, 228, 260]);
  for (let t = T + 1; t <= T + 23; t++) {
    g.step();
    assert.deepEqual([rear.s, ...front.map(b => b.s)], at, `tick ${t}: nothing moves while the run explodes`);
    assert.equal(g.balls.filter(b => b.destroyingUntil !== undefined).length, 3, `tick ${t}: the run is still there`);
  }
  assert.equal(g.chains[0].recoils.length, 0, 'no recoil armed at match time (0x4219a6 / 0x40abde are the only writers)');
  g.step();
  assert.equal(g.tick, T + 24);
  assert.equal(g.balls.length, 3, 'removed at T + 24');
});

// ------------------------------------------------------------ attraction après la destruction (v = 10)

test('attraction after the destruction: front segment still until the removal, then accelerating back, contact at R + 20 / 21 (34 maj)', () => {
  const g = edges22();
  const T = shootToDestroy(g, 180).tick;
  run(g, 24);
  const R = g.tick;
  assert.equal(R, T + 24);
  const rear = g.balls[0];
  const head = g.balls[1];
  assert.deepEqual(g.balls.map(b => [b.color, b.s]), [[2, 100], [2, 228], [3, 260]]);
  assert.equal(head.attract, 10, 'the front edge gets v = 10 (0x423a95)');
  const expected = R + attractTicks(96, 10, g.majClock);
  const pos = [head.s];
  let merge = null;
  for (let i = 0; i < 40 && !merge; i++) {
    const before = g.events.length;
    g.step();
    pos.push(head.s);
    merge = g.events.slice(before).find(e => e.kind === 'merge') ?? null;
  }
  assert.ok(merge, 'merge expected');
  assert.equal(merge.tick, expected, 'contact tick from the reference profile');
  assert.ok(merge.tick === R + 20 || merge.tick === R + 21, `contact at R + ${merge.tick - R}`);
  assert.deepEqual([merge.leftId, merge.rightId], [rear.id, head.id]);
  assert.equal(rear.s, 100, 'the rear segment did not move');
  assert.equal(head.s, 132, 'exact contact');
  const steps = pos.slice(1).map((p, i) => pos[i] - p);
  assert.ok(steps[0] > 0 && steps[0] <= 2, `first tick ${steps[0]} px`);
  const k = steps.length - 1; // contact tick (bounded)
  const first3 = steps[0] + steps[1] + steps[2];
  const last3 = steps[k - 1] + steps[k - 2] + steps[k - 3];
  assert.ok(last3 > 3 * first3, `accelerating without cap: last three ticks ${last3} px vs first three ${first3} px`);
  assert.equal(head.attract, undefined, 'v cleared at the contact');
});

test('attraction: a 32 px free gap closes in 11 ± 1 ticks (18 maj)', () => {
  const g = edges22();
  const T = shootToDestroy(g, 180).tick;
  run(g, 1);
  // Front segment moved 64 px back before the removal: the free gap left is 32 px.
  for (const b of g.balls) if (b.destroyingUntil === undefined && b.s > 150) b.s -= 64;
  run(g, T + 24 - g.tick);
  const R = g.tick;
  const clock = g.majClock;
  const merge = stepUntil(g, 'merge', 30);
  assert.equal(merge.tick, R + attractTicks(32, 10, clock), 'reference profile');
  assert.ok(Math.abs(merge.tick - R - 11) <= 1, `contact at R + ${merge.tick - R}`);
});

test('no attraction between edges of different colours, nor across a gap loaded without destruction', () => {
  const g = below(180, balls([[2, 100], [0, 132], [0, 164], [1, 196], [3, 228]]), {}, 0);
  const T = shootToDestroy(g, 180).tick;
  run(g, T + 24 - g.tick);
  assert.deepEqual(g.balls.map(b => [b.color, b.s]), [[2, 100], [1, 228], [3, 260]]);
  run(g, 120);
  assert.deepEqual(g.balls.map(b => [b.color, b.s]), [[2, 100], [1, 228], [3, 260]], 'the gap stays open');
  assert.equal(ofKind(g, 'merge').length, 0);
  const loaded = fixture(balls([[2, 100], [2, 228], [3, 260]]));
  run(loaded, 120);
  assert.deepEqual(loaded.balls.map(b => b.s), [100, 228, 260], 'a loaded gap between two 2s does not close');
});

// ------------------------------------------------------------ tir sans alignement contre une brèche de sa couleur (v = 1)

test('a shot ball without a match bordering a gap of its colour arms v = 1: still 4 ticks, contact 15–17 ticks after settle, match at the junction', () => {
  const g = below(148, balls([[0, 100], [1, 132], [1, 228], [3, 260]]), {}, 1);
  const target = g.balls[2];
  g.command({ kind: 'shoot', x: 148, y: 240 });
  let settled = null;
  for (let i = 0; i < 40 && !settled; i++) {
    g.step();
    const shot = g.balls.find(b => b.color === 1 && b.s > 140 && b.s < 200);
    if (shot && shot.width === 1) settled = g.tick;
  }
  assert.ok(settled, 'the shot ball settled');
  assert.equal(ofKind(g, 'destroy').length, 0, 'two 1s in contact: no match');
  assert.deepEqual(g.balls.map(b => [b.color, b.s]), [[0, 100], [1, 132], [1, 164], [1, 228], [3, 260]]);
  assert.equal(target.attract, 1, 'v = 1 on the head of the front segment (0x421dae)');
  const clock = g.majClock;
  for (let i = 0; i < 4; i++) {
    g.step();
    assert.equal(target.s, 228, `tick ${i + 1}: ⌊v/8⌋ = 0 for the first 7 maj`);
  }
  const merge = stepUntil(g, 'merge', 30);
  assert.equal(merge.tick - settled, attractTicks(32, 1, clock), 'reference profile (26 maj)');
  assert.ok(merge.tick - settled >= 15 && merge.tick - settled <= 17, `contact ${merge.tick - settled} ticks after settle`);
  const destroy = ofKind(g, 'destroy');
  assert.equal(destroy.length, 1, 'three 1s at the junction');
  assert.equal(destroy[0].tick, merge.tick);
  assert.equal(destroy[0].count, 3);
});

// ------------------------------------------------------------ rebond au contact (0x4219a0, 0x40ab60)

test('contact recoil without a match: the most advanced ball of the arrived segment gets { ticks 18, speed 50 }, the whole chain rolls back 15 px', () => {
  const g = edges22();
  const T = shootToDestroy(g, 180).tick;
  run(g, T + 24 - g.tick);
  const [rear, edge, head] = g.balls;
  const merge = stepUntil(g, 'merge', 30);
  assert.deepEqual(g.chains[0].recoils, [{ id: head.id, ticks: 18, speed: 50 }], 'armed at the contact tick on the head');
  const at = { rear: rear.s, head: head.s };
  assert.deepEqual([rear.s, edge.s, head.s], [100, 132, 164]);
  run(g, 18);
  near(at.rear - rear.s, 15, 1, 'rear ball pushed back');
  near(at.head - head.s, 15, 1, 'head rolled back');
  assert.equal(g.chains[0].recoils.length, 0);
  const still = [rear.s, edge.s, head.s];
  run(g, 30);
  assert.deepEqual([rear.s, edge.s, head.s], still, 'nothing moves afterwards (speed 0)');
  assert.equal(merge.tick > T, true);
});

/** Chain fixture: 1@68, 2@100, 2@132, 0@164, 0@196, 2@228, 3@260, 1@292, a 0 shot between 0@196 and 2@228. */
const chainFixture = (extra = {}) => below(212, balls([[1, 68], [2, 100], [2, 132], [0, 164], [0, 196], [2, 228], [3, 260], [1, 292]]), extra, 0);

test('contact recoil with a chain reaction: speed 150 × depth, 45 px in 18 ticks, the rear ball pushed through the exploding balls', () => {
  const g = chainFixture();
  const first = shootToDestroy(g, 212);
  assert.equal(first.depth, 1);
  const rear = g.balls[0];
  const head = g.balls[g.balls.length - 1];
  assert.equal(head.color, 1);
  const merge = stepUntil(g, 'merge', 80);
  const second = ofKind(g, 'destroy').find(e => e.depth === 2);
  assert.ok(second, 'depth-2 destruction at the junction');
  assert.equal(second.tick, merge.tick);
  assert.equal(second.count, 3);
  assert.deepEqual(g.chains[0].recoils, [{ id: head.id, ticks: 18, speed: 150 }]);
  const at = { rear: rear.s, head: head.s };
  const exploding = g.balls.filter(b => b.destroyingUntil !== undefined).map(b => b.s);
  run(g, 1);
  const moved = g.balls.filter(b => b.destroyingUntil !== undefined).map(b => b.s);
  assert.ok(moved.every((s, i) => s < exploding[i]), 'the exploding balls are pushed too');
  run(g, 17);
  near(at.head - head.s, 45, 1, 'head');
  near(at.rear - rear.s, 45, 1, 'rear ball');
});

test('a ball that already recoils does not get a second recoil', () => {
  const g = chainFixture();
  shootToDestroy(g, 212);
  const head = g.balls[g.balls.length - 1];
  run(g, 24);
  g.chains[0].recoils.push({ id: head.id, ticks: 40, speed: 1 });
  stepUntil(g, 'merge', 40);
  assert.equal(g.chains[0].recoils.length, 1);
  assert.equal(g.chains[0].recoils[0].speed, 1, 'the running recoil is kept');
});

test('pusher stop: speed 0 during the recoil and at least 12 ticks after its last move, then restarting from 0', () => {
  const g = chainFixture({ speed: 50 });
  shootToDestroy(g, 212);
  stepUntil(g, 'merge', 120);
  const chain = g.chains[0];
  assert.equal(chain.recoils.length, 1);
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const recoiling = chain.recoils.length > 0;
    g.step();
    rows.push({ recoiling, speed: chain.speed });
  }
  const last = rows.map(r => r.recoiling).lastIndexOf(true);
  assert.equal(last, 17, 'the recoil lasts 18 ticks');
  for (let i = 0; i <= last + 12; i++) assert.equal(rows[i].speed, 0, `row ${i}: pusher stopped`);
  const restart = rows.findIndex(r => r.speed > 0);
  assert.ok(restart > last + 12, `restart at row ${restart}`);
  assert.ok(rows[restart].speed <= CANDIDATE.chainAccel / 60 + 1e-9, `restarts from 0 (${rows[restart].speed})`);
});

test('the pusher catching a still segment emits merge but arms no recoil', () => {
  const g = fixture(balls([[0, 100], [1, 200]]), { speed: 50 });
  stepUntil(g, 'merge', 200);
  assert.equal(g.chains[0].recoils.length, 0);
});
