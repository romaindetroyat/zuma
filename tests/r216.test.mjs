// R2.0.16 — règles d'exécution de l'original (spike D-12) : cinématique du pousseur (rampe, arrêt après
// insertion, zone lente, ZUMA conditionnel), arrivée rapide calculée, « PARTEZ » et chronomètre, couleurs
// repeat / single, munitions (D-14), décompte de fin de niveau, ACE TIME, pièce, configFromSettings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION, endZoneFactor, feedSpeed, aceTimeBonus, defaultParTime } from '../.compiled/core.js';
import { configFromSettings } from '../.compiled/main.js';

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
  // (The front segment stays inside the 640 px canvas: projectiles die past its margin.)
  const front = fixture([{ color: 0, s: 300 }, { color: 1, s: 332 }, { color: 2, s: 600 }, { color: 0, s: 632 }], { speed: 50 }, 3, 2000);
  const far = stepUntil((front.command({ kind: 'shoot', x: 632, y: 240 }), front), 'insert', 120);
  assert.ok(far.x > 500, `landed on the front segment (x ${far.x})`);
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
  assert.equal(longer.g.backwardsTicks, 500 - longer.zuma.tick, 'a longer rollback already running is kept (it counted down meanwhile)');
  assert.equal(longer.g.zumaSlowLeft, 1000 - longer.zuma.tick);
  assert.ok(longer.g.backwardsTicks > 30 && longer.g.zumaSlowLeft > 60);
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

// ------------------------------------------------------------ §2 arrivée rapide (`start` %), « PARTEZ », chronomètre (D-13)

test('feedSpeed: original initial speed of the fast feed (0x4050e7–0x405144), px/s, never below the cruise speed', () => {
  near(feedSpeed(50, 0.35 * 2762), 1520, 1e-6, 'level 1-1 on the spiral: 15.2 px/maj');
  near(feedSpeed(50, 700), 1310, 1e-6);
  near(feedSpeed(60, 224), 810, 1e-6);
  near(feedSpeed(0, 0), 180, 1e-6, 'd = 0: 0.1 × ⌊18⌋ px/maj');
  for (const [v, d] of [[50, 10], [500, 50], [3000, 1], [2000, 0]]) assert.ok(feedSpeed(v, d) >= v, `feedSpeed(${v}, ${d}) ≥ ${v}`);
  assert.equal(feedSpeed(50, Number.NaN), 0, 'non-finite distance → 0');
  assert.equal(feedSpeed(50, -1), 0, 'negative distance → 0');
  assert.equal(feedSpeed(50, Number.POSITIVE_INFINITY), 0);
});

test('CANDIDATE: startFraction, feedMaxTicks and goMargin replace start / feedSpeed', () => {
  assert.equal(CANDIDATE.startFraction, 0.35);
  assert.equal(CANDIDATE.feedMaxTicks, 300, '500 maj × 0.6');
  assert.equal(CANDIDATE.goMargin, 10, '0.1 px/maj × 100');
  assert.equal('feedSpeed' in CANDIDATE, false);
  assert.equal('start' in CANDIDATE, false);
});

const feedConfig = { ...CANDIDATE, speed: 50, startFraction: 0.35, endSlowFactor: 1, total: 200, powerChance: 0, target: 99999 };
const spacingOk = g => {
  const s = g.balls.map(b => b.s);
  for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i] - s[i - 1] - CANDIDATE.ballSpacing) < 1e-6, `gap ${i} = ${s[i] - s[i - 1]}`);
};

test('fast feed: the chain arrives at feedSpeed(speed, startFraction × length), decelerates naturally and « PARTEZ » fires at speed + goMargin', () => {
  const g = new ZumaEngine(straight(2000), frog, feedConfig, 11);
  g.step();
  assert.equal(g.chains[0].speed, feedSpeed(50, 700), 'v0 on the first tick');
  assert.ok(g.feeding);
  let previous = g.chains.every(c => c.speed <= 60);
  let go = null;
  for (let i = 0; i < 400 && !go; i++) {
    const before = g.events.length;
    g.step();
    go = g.events.slice(before).find(e => e.kind === 'go') ?? null;
    if (!go) {
      previous = g.chains.every(c => c.speed <= 60);
      assert.ok(!previous, `no go although every chain is at ≤ 60 px/s at tick ${g.tick}`);
    }
  }
  assert.ok(go, 'go emitted');
  assert.equal(g.feeding, false);
  assert.equal(g.goTick, go.tick);
  assert.equal(previous, false, 'the tick before go, some chain was still above speed + goMargin');
  assert.ok(g.chains.every(c => c.speed <= 60), 'at go every chain is at ≤ speed + goMargin');
  const head = headS(g) / 2000;
  assert.ok(head >= 0.35 && head <= 0.5, `head at ${(head * 100).toFixed(1)} % of the track at go`);
  spacingOk(g);
  run(g, 100);
  assert.equal(g.chains[0].speed, 50, 'settled on the cruise speed');
  assert.equal(ofKind(g, 'go').length, 1, 'go emitted once');
  spacingOk(g);
});

test('fast feed: feedMaxTicks forces « PARTEZ » after 5 s whatever the speed', () => {
  const g = new ZumaEngine(straight(10000), frog, { ...feedConfig, chainDecel: 1 }, 11);
  const go = stepUntil(g, 'go', 400);
  assert.equal(go.tick, 300);
  assert.equal(g.goTick, 300);
  assert.ok(g.chains[0].speed > 1000, 'still fast: the guard fired, not the speed condition');
});

test('fast feed: with two chains, « PARTEZ » waits for both', () => {
  const g = new ZumaEngine([straight(2000), new Track([[0, 300], [1500, 300]])], frog, feedConfig, 9);
  let oneEarly = false;
  let go = null;
  for (let i = 0; i < 400 && !go; i++) {
    const before = g.events.length;
    g.step();
    go = g.events.slice(before).find(e => e.kind === 'go') ?? null;
    const under = g.chains.map(c => c.speed <= 60);
    if (!go && under.some(Boolean) && !under.every(Boolean)) oneEarly = true;
  }
  assert.ok(go, 'go emitted');
  assert.ok(oneEarly, 'the shorter track settled first without triggering go');
  assert.ok(g.chains.every(c => c.speed <= 60));
});

test('level clock (D-13): levelTicks = tick − goTick, nothing without a fast feed', () => {
  const silent = new ZumaEngine(straight(2000), frog, feedConfig, 11);
  silent.feeding = false;
  run(silent, 50);
  assert.equal(ofKind(silent, 'go').length, 0);
  assert.equal(silent.goTick, 0);
  assert.equal(silent.levelTicks, 50);
  const g = new ZumaEngine(straight(2000), frog, feedConfig, 11);
  const go = stepUntil(g, 'go', 400);
  assert.equal(g.levelTicks, 0);
  run(g, 37);
  assert.equal(g.levelTicks, 37);
  assert.equal(g.levelTicks, g.tick - go.tick);
});

/** A level fed then cleared: go first (speed 0 → the chain stops), then the r215 clearedLevel scenario. */
const fedAndCleared = (extra = {}) => {
  const g = new ZumaEngine(straight(2000), frog, { ...quiet, target: 30, total: 2, levelBonus: 500, ...extra }, 5);
  const go = stepUntil(g, 'go', 400);
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  g.command({ kind: 'shoot', x: 336, y: 240 });
  const destroy = stepUntil(g, 'destroy', 60);
  g.config.total = 99;
  const clearing = stepUntil(g, 'clearing', 60);
  return { g, go, destroy, clearing };
};

test('level clock (D-13): frozen at clearTick − goTick during the tally and after won', () => {
  const { g, go, clearing } = fedAndCleared({ parTime: 25 });
  assert.ok(go.tick > 0);
  assert.equal(g.clearTick, clearing.tick);
  const frozen = clearing.tick - go.tick;
  assert.equal(g.levelTicks, frozen);
  run(g, 10);
  assert.equal(g.levelTicks, frozen, 'frozen during the tally');
  const won = stepUntil(g, 'won', 400);
  assert.equal(g.state, 'won');
  assert.equal(g.levelTicks, frozen, 'frozen after won');
  assert.equal(won.seconds, frozen / CANDIDATE.tickHz);
});

// ------------------------------------------------------------ §3 couleurs `repeat` / `single`, munitions (D-14)

/**
 * Streams `n` colours on a long straight track at exactly one ball per tick (32 px/tick) without
 * ever emptying the chain, so the `single` repair rule sees the real rear groups; returns the
 * colours in spawn order.
 */
const streamColours = (n, extra = {}, seed = 11) => {
  const g = new ZumaEngine(straight(32 * n + 1000), frog, { ...quiet, speed: 32 * CANDIDATE.tickHz, total: n, ...extra }, seed);
  g.feeding = false;
  run(g, n + 5);
  assert.equal(g.balls.length, n, 'every streamed ball is still on the track');
  return g.balls.map(b => b.color).reverse();
};
const runLengths = colours => {
  const runs = [];
  for (let i = 0; i < colours.length; i++) {
    if (i > 0 && colours[i] === colours[i - 1]) runs[runs.length - 1]++;
    else runs.push(1);
  }
  return runs;
};
const repeatShare = colours => colours.filter((c, i) => i > 0 && c === colours[i - 1]).length / (colours.length - 1);

test('colours: CANDIDATE keeps repeatChance 0.5, singleLimit 10 (repair off), no singleChance', () => {
  assert.equal(CANDIDATE.repeatChance, 0.5);
  assert.equal(CANDIDATE.singleLimit, 10);
  assert.equal('singleChance' in CANDIDATE, false);
});

test('colours: repeatChance is the only repetition draw; singleLimit 0 repairs every isolated rear ball', () => {
  const none = streamColours(300, { repeatChance: 0, singleLimit: 10, colors: 4 });
  assert.ok(runLengths(none).every(l => l === 1), 'repeat 0 and repair off: no immediate repetition');
  const pairs = streamColours(300, { repeatChance: 0, singleLimit: 0, colors: 4 });
  assert.ok(runLengths(pairs).every(l => l === 2), `single 0: every run has exactly two balls (${runLengths(pairs).slice(0, 12)})`);
  const share = repeatShare(streamColours(4000, { repeatChance: 0.51, singleLimit: 10, colors: 4 }));
  assert.ok(share >= 0.47 && share <= 0.55, `repeat 50 → (50 + 1) / 100: immediate repeat share ${share.toFixed(3)}`);
  const a = streamColours(400, { repeatChance: 0.51, singleLimit: 3, colors: 5 }, 42);
  assert.deepEqual(a, streamColours(400, { repeatChance: 0.51, singleLimit: 3, colors: 5 }, 42), 'deterministic for a seed');
  assert.notDeepEqual(a, streamColours(400, { repeatChance: 0.51, singleLimit: 3, colors: 5 }, 43));
});

test('colours: singleLimit between 1 and 9 repairs isolated rear balls while the ten rear groups hold at most singleLimit singles', () => {
  const limited = runLengths(streamColours(400, { repeatChance: 0, singleLimit: 3, colors: 4 }));
  const off = runLengths(streamColours(400, { repeatChance: 0, singleLimit: 10, colors: 4 }));
  const singles = runs => runs.filter(l => l === 1).length;
  assert.ok(singles(limited) < singles(off), `${singles(limited)} isolated runs with single 3 < ${singles(off)} with repair off`);
  for (let i = 0; i + 10 <= limited.length; i++) assert.ok(singles(limited.slice(i, i + 10)) <= 4, `window ${i}: ≤ singleLimit + 1 isolated runs`);
  // Threshold (0x414bec–0x414c1f): six isolated groups at the entrance, previous colour 0, repeat never.
  const entrance = (singleLimit, balls) => {
    const g = new ZumaEngine(straight(2000), frog, { ...quiet, repeatChance: 0, singleLimit, total: 100, colors: 4 }, 3);
    g.feeding = false;
    g.loadFixture({ balls: balls.map((b, i) => (typeof b === 'number' ? { color: b, s: 32 * i } : b)), current: 2, next: 2, stream: true });
    g.chains[0].lastSpawnColor = 0;
    g.step();
    assert.equal(g.balls.length, balls.length + 1, 'one ball streamed');
    return g.balls[0].color;
  };
  const sixSingles = [0, 1, 0, 1, 0, 1, 2, 2, 2];
  assert.equal(entrance(0, sixSingles), 0, 'single 0: always repairs');
  assert.equal(entrance(8, sixSingles), 0, '6 isolated groups ≤ 8: repairs');
  assert.equal(entrance(6, sixSingles), 0, '6 ≤ 6: repairs');
  assert.notEqual(entrance(3, sixSingles), 0, '6 > 3: a different colour');
  assert.notEqual(entrance(10, sixSingles), 0, '10 = repair off');
  assert.notEqual(entrance(0, [0, 0, 1, 0, 1]), 0, 'the rear group is not isolated: no repair');
  assert.equal(entrance(0, [{ color: 0, s: 0 }, { color: 1, s: 32 }, { color: 1, s: 300 }]), 0, 'runs follow the list, physical gaps are ignored (0x402040)');
  assert.notEqual(entrance(0, [{ color: 0, s: 0 }, { color: 0, s: 300 }, { color: 1, s: 332 }]), 0, 'two rear zeros across a gap form one group: no repair');
});

test('ammo (D-14): current and next are replaced on the tick a destruction is marked, every tick, the flying projectile untouched', () => {
  const g = fixture([{ color: 0, s: 300 }, { color: 0, s: 332 }, { color: 1, s: 364 }, { color: 1, s: 396 }, { color: 1, s: 428 }], {}, 1, 2000);
  g.next = 1;
  g.command({ kind: 'shoot', x: 396, y: 240 });
  g.step();
  assert.equal(g.current, 1, 'the next ball (colour 1) is loaded');
  run(g, CANDIDATE.fireCooldownTicks);
  g.current = 1;
  g.command({ kind: 'shoot', x: 0, y: 400 });
  g.step();
  const flying = g.projectiles.find(p => p.vx < 0 && Math.abs(p.vy) < 1e-9);
  assert.ok(flying && flying.color === 1, 'a second colour-1 projectile flies away from the track');
  const destroy = stepUntil(g, 'destroy', 60);
  assert.equal(destroy.count, 4);
  assert.ok(g.balls.filter(b => b.destroyingUntil !== undefined).length === 4, 'marked, not yet removed');
  assert.equal(g.balls.length, 6, 'nothing removed on the destroy tick');
  assert.notEqual(g.current, 1, 'current replaced on the destroy tick');
  assert.notEqual(g.next, 1, 'next replaced on the destroy tick');
  assert.equal(g.current, 0);
  assert.equal(g.next, 0);
  const recolors = ofKind(g, 'recolor').filter(e => e.tick === destroy.tick);
  assert.deepEqual(recolors.map(e => e.slot).sort(), ['current', 'next']);
  assert.equal(flying.color, 1, 'the projectile in flight keeps its colour (r206)');
  const miss = stepUntil(g, 'miss', 80);
  assert.equal(miss.id, flying.id);
  assert.equal(flying.color, 1);
  // Every tick: an absent current is replaced by a present colour; an empty chain draws nothing.
  const live = fixture([{ color: 0, s: 300 }, { color: 1, s: 332 }], {}, 0, 2000);
  for (let i = 0; i < 20; i++) {
    live.current = 3;
    const before = live.events.length;
    live.step();
    assert.ok([0, 1].includes(live.current), `tick ${live.tick}: current ${live.current}`);
    assert.equal(live.events.slice(before).filter(e => e.kind === 'recolor' && e.slot === 'current').length, 1);
  }
  const empty = fixture([], {}, 3, 2000);
  run(empty, 10);
  assert.equal(empty.current, 3, 'no present colour: current unchanged');
  assert.equal(ofKind(empty, 'recolor').length, 0);
});

// ------------------------------------------------------------ §7 décompte et bonus de niveau, §8 ACE TIME, §9 pièce (D-09)

test('aceTimeBonus: original formula (0x401cb0) t > par ? 0 : 100 × (1 + ⌊250 × (1 − ⌊t⌋ / par)⌋)', () => {
  assert.equal(aceTimeBonus(24, 25), 1100);
  assert.equal(aceTimeBonus(20, 25), 5100);
  assert.equal(aceTimeBonus(25, 25), 100);
  assert.equal(aceTimeBonus(26, 25), 0);
  assert.equal(aceTimeBonus(0, 25), 25100);
  assert.equal(aceTimeBonus(24.9, 25), 1100, 'whole seconds');
  assert.equal(aceTimeBonus(5, 0), 0, 'no par time');
  assert.equal(aceTimeBonus(NaN, 25), 0);
  assert.equal(aceTimeBonus(10, 130), 23100, '100 × (1 + ⌊250 × 120 / 130⌋)');
});

test('defaultParTime: ⌈score × 35 / 1000 × (curves > 1 ? 0.95 × curves : 1)⌉₅ (0x42ad12, hypothesis A7)', () => {
  assert.equal(defaultParTime(1000, 1), 35);
  assert.equal(defaultParTime(4500, 1), 160);
  assert.equal(defaultParTime(2000, 2), 135, '70 × 1.9 = 133 → 135');
  assert.equal(defaultParTime(0, 1), 0);
  assert.equal(defaultParTime(NaN, 1), 0);
  for (const [score, curves] of [[1234, 1], [999, 3], [5000, 2]]) assert.equal(defaultParTime(score, curves) % 5, 0, `${score} / ${curves}: multiple of 5`);
});

test('CANDIDATE: tally cadence, level bonus and coin value of the original', () => {
  assert.equal(CANDIDATE.cleanupStepPx, 60);
  assert.equal(CANDIDATE.cleanupStepTicks, 2.4, '4 maj × 0.6');
  assert.equal(CANDIDATE.cleanupStartTicks, 12, '20 maj × 0.6');
  assert.equal(CANDIDATE.cleanupEndTicks, 30, '50 maj × 0.6');
  assert.equal(CANDIDATE.cleanupPopTicks, 6, '10 maj × 0.6');
  assert.equal(CANDIDATE.cleanupPoints, 100);
  assert.equal(CANDIDATE.levelBonus, 10000, '(100 − coverage) × 100 per curve, coverage 0 once empty (A3)');
  assert.equal(CANDIDATE.coinPoints, 500);
});

/** r215 clearedLevel on a 2000 px track: a run of three, then the tally up to `won`. */
const clearedLevel = (extra = {}) => {
  const g = new ZumaEngine(straight(2000), frog, { ...quiet, target: 30, total: 2, levelBonus: 500, parTime: 25, ...extra }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  g.command({ kind: 'shoot', x: 336, y: 240 });
  const destroy = stepUntil(g, 'destroy', 60);
  g.config.total = 99;
  const clearing = stepUntil(g, 'clearing', 60);
  return { g, destroy, clearing };
};

test('tally: +levelBonus per curve at clearing, then 60 px steps every 2.4 ticks at +100 from +12, pops every 6 ticks, won 30 ticks after the last step', () => {
  const { g, destroy, clearing } = clearedLevel();
  const C = clearing.tick;
  assert.equal(g.clearTick, C);
  assert.equal(clearing.levelBonus, 500);
  assert.equal(g.score, 30 + 500, 'the level bonus is credited when the board is cleared');
  assert.equal(g.levelScore, 530);
  const steps = Math.ceil((2000 - destroy.x) / 60);
  assert.ok(g.cleanup && g.cleanup.steps === steps && g.cleanup.step === 0);
  // R2.0.18 (D-30): one marker per chain, the single chain's marker is cleanup.markers[0].
  assert.equal(g.cleanup.markers[0].s, 2000 - 60 * steps, 'the marker is aligned so that the last step lands on the skull');
  assert.deepEqual([clearing.x, clearing.y], [2000 - 60 * steps, 240]);
  const won = stepUntil(g, 'won', 400);
  const cleanups = ofKind(g, 'cleanup');
  assert.equal(cleanups.length, steps);
  let score = 530;
  cleanups.forEach((c, i) => {
    const k = i + 1;
    assert.equal(c.tick, C + Math.ceil(12 + 2.4 * (k - 1) - 1e-9), `step ${k} tick`);
    assert.equal(c.points, 100);
    assert.equal(c.step, k);
    assert.equal(c.steps, steps);
    assert.equal(c.chain, 0);
    near(c.progress, k / steps, 1e-9);
    assert.equal(c.x, 2000 - 60 * (steps - k), `step ${k} position`);
    assert.equal(c.y, 240);
    score += 100;
  });
  assert.deepEqual(cleanups.slice(0, 6).map(c => c.tick - C), [12, 15, 17, 20, 22, 24]);
  assert.equal(cleanups[steps - 1].x, 2000, 'last step on the skull');
  const lastStep = cleanups[steps - 1].tick;
  const pops = ofKind(g, 'cleanup-pop');
  const lastNominal = C + 12 + 2.4 * (steps - 1);
  const expectedPops = [];
  for (let t = C + 12.6; t <= lastNominal + 1e-9; t += 6) expectedPops.push(Math.ceil(t - 1e-9));
  assert.deepEqual(pops.map(p => p.tick), expectedPops, 'pops from +12.6 every 6 ticks up to the last step');
  assert.deepEqual(pops.map(p => p.index), expectedPops.map((_, i) => i));
  for (const p of pops) assert.ok(p.progress >= 0 && p.progress <= 1);
  assert.ok(pops.length >= 2 && pops[pops.length - 1].tick <= lastStep);
  assert.equal(won.tick, lastStep + 30);
  assert.equal(g.state, 'won');
  assert.equal(g.cleanup, null);
  assert.equal(g.cleanupScore, steps * 100);
  const timeBonus = aceTimeBonus(Math.floor(g.levelTicks / 60), 25);
  assert.ok(timeBonus >= 23100, `cleared in ${g.levelTicks} ticks: ${timeBonus}`);
  assert.equal(won.timeBonus, timeBonus);
  assert.equal(g.timeBonus, timeBonus);
  assert.equal(won.levelBonus, 500);
  assert.equal(won.seconds, g.levelTicks / 60);
  assert.equal(g.score, score, 'the time bonus is NOT in the score at won');
  assert.equal(won.score, 30 + 500 + steps * 100);
  assert.equal(g.timeBonusCredited, 0);
  const events = g.events.length;
  g.creditBonus(100);
  assert.equal(g.score, score + 100);
  assert.equal(g.levelScore, score + 100);
  assert.equal(g.timeBonusCredited, 100);
  assert.equal(g.events.length, events, 'creditBonus emits nothing');
  for (const bad of [NaN, -5, 0, Infinity]) g.creditBonus(bad);
  assert.equal(g.score, score + 100, 'non-finite or non-positive points are ignored');
  assert.equal(g.timeBonusCredited, 100);
});

test('tally: without parTime the time bonus is 0; the level bonus counts every curve', () => {
  const { g } = clearedLevel({ parTime: 0 });
  const won = stepUntil(g, 'won', 400);
  assert.equal(won.timeBonus, 0);
  assert.equal(g.timeBonus, 0);
  assert.equal(g.score, 30 + 500 + g.cleanupScore);
  const dual = new ZumaEngine([straight(2000), new Track([[0, 300], [1500, 300]])], frog, { ...quiet, levelBonus: 500 }, 1);
  dual.feeding = false;
  dual.loadFixture({ balls: [], stream: false });
  dual.zumaMode = true;
  dual.step();
  const clearing = ofKind(dual, 'clearing');
  assert.equal(clearing.length, 1);
  assert.equal(clearing[0].levelBonus, 1000, '500 × 2 curves');
  assert.equal(dual.score, 1000);
});

test('tally: a board emptied without an explosion walks the whole track from its start and wins 30 ticks after the last step', () => {
  // R2.0.18 (D-30): the marker of a chain without a destruction starts at the beginning of its track (no longer « no step »).
  const g = fixture([{ color: 0, s: 100 }], {}, 0, 2000);
  g.zumaMode = true;
  g.balls = [];
  g.step();
  assert.equal(g.state, 'clearing');
  const clearing = ofKind(g, 'clearing');
  assert.equal(clearing.length, 1);
  const steps = Math.ceil(2000 / 60);
  assert.equal(g.cleanup.steps, steps);
  assert.deepEqual([clearing[0].x, clearing[0].y], [2000 - 60 * steps, 240]);
  const won = stepUntil(g, 'won', 400);
  const C = clearing[0].tick;
  assert.equal(won.tick, C + Math.ceil(12 + 2.4 * (steps - 1) - 1e-9) + 30);
  assert.equal(ofKind(g, 'cleanup').length, steps);
  assert.ok(ofKind(g, 'cleanup-pop').length >= 2);
  assert.equal(g.cleanupScore, steps * 100);
  assert.equal(g.score, CANDIDATE.levelBonus + steps * 100);
});

// ------------------------------------------------------------ configFromSettings (GAME-01, T-05-13), baseline

test('baseline R2.0.16 — superseded', () => {
  // R2.0.17: the baseline moved on (r217 locks '2.0.17'); this test keeps the manifest / engine agreement and the ordering.
  assert.ok(ENGINE_VERSION > '2.0.16', 'the R2.0.16 rules below still hold in the newer baseline');
  assert.equal(ENGINE_VERSION, JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
});

test('configFromSettings: level 1-1 (lvl11) → the original rules in engine units', () => {
  const c = configFromSettings({ id: 'lvl11', speed: 0.5, start: 35, score: 1000, repeat: 50, colors: 4, firespeed: 6, partime: 25 }, 0);
  near(c.speed, 50, 1e-9, '0.5 px/maj × 100');
  assert.equal(c.startFraction, 0.35);
  assert.equal(c.repeatChance, 0.51, '(repeat + 1) / 100');
  assert.equal(c.singleLimit, 10);
  assert.equal(c.endSlowFactor, 4);
  assert.equal(c.slowDistance, 500);
  assert.equal(c.dangerDistance, 600);
  assert.equal(c.parTime, 25);
  assert.equal(c.coinPoints, 500, 'max(500, 100 × ⌊1000 / 600⌋)');
  assert.equal(c.levelBonus, 10000);
  assert.equal(c.zumaBackTicks, 180, '300 maj by default');
  assert.equal(c.zumaSlowTicks, 660, '1100 maj by default');
  assert.equal(c.target, 1000);
  assert.equal(c.colors, 4);
  assert.equal(c.projectileSpeed, 10, '6 px/maj → 600 px/s → 10 px/tick');
  assert.equal(c.total, Number.POSITIVE_INFINITY);
  for (const key of ['start', 'feedSpeed', 'singleChance', 'slowFactor']) assert.equal(key in c, false, `${key} is not written`);
});

test('configFromSettings: lvl35 (single 8, zumaslow / zumaback, partime 130, score 4500)', () => {
  const c = configFromSettings({ id: 'lvl35', speed: 0.6, start: 45, score: 4500, single: 8, zumaslow: 500, zumaback: 200, partime: 130 }, 3);
  assert.equal(c.startFraction, 0.45);
  assert.equal(c.singleLimit, 8);
  assert.equal(c.repeatChance, 0.41, 'repeat defaults to 40');
  assert.equal(c.zumaSlowTicks, 300);
  assert.equal(c.zumaBackTicks, 120);
  assert.equal(c.parTime, 130);
  assert.equal(c.coinPoints, 700, '100 × ⌊4500 / 600⌋');
  assert.equal(c.colors, 5);
  near(c.speed, 60, 1e-9);
});

test('configFromSettings: defaults and bounds (T-05-13)', () => {
  const d = configFromSettings({ id: 'x' }, 0);
  assert.equal(d.startFraction, 0.4, 'start defaults to 40 %');
  assert.equal(d.repeatChance, 0.41);
  assert.equal(d.singleLimit, 10);
  assert.equal(d.parTime, 35, 'defaultParTime(1000, 1)');
  assert.equal(d.coinPoints, 500);
  assert.equal(d.endSlowFactor, 4);
  assert.equal(d.zumaBackTicks, 180);
  assert.equal(d.zumaSlowTicks, 660);
  assert.equal(configFromSettings(undefined, 0).parTime, 35, 'no settings → defaults');
  assert.equal(configFromSettings({ id: 'x', score: 2000 }, 0, 2).parTime, 135, 'two curves');
  const one = (settings, key) => configFromSettings({ id: 'x', ...settings }, 0)[key];
  assert.equal(one({ start: 200 }, 'startFraction'), 1);
  assert.equal(one({ start: -5 }, 'startFraction'), 0);
  assert.equal(one({ start: 'abc' }, 'startFraction'), 0.4);
  assert.equal(one({ single: 150 }, 'singleLimit'), 10);
  assert.equal(one({ single: -5 }, 'singleLimit'), 0);
  assert.equal(one({ single: 2.7 }, 'singleLimit'), 2);
  assert.equal(one({ slowfactor: 0.5 }, 'endSlowFactor'), 1);
  assert.equal(one({ slowfactor: 3.5 }, 'endSlowFactor'), 3.5);
  assert.equal(one({ slowspeed: 0.25, speed: 0.5 }, 'endSlowFactor'), 2, 'slowspeed → speed / slowspeed (0x42ad98)');
  assert.equal(one({ slowspeed: 2, speed: 0.5 }, 'endSlowFactor'), 1, 'never below 1');
  assert.equal(one({ danger: 400, slowdistance: 100 }, 'dangerDistance'), 400);
  assert.equal(one({ danger: 400, slowdistance: 100 }, 'slowDistance'), 100);
  assert.equal(one({ danger: -1 }, 'dangerDistance'), 600);
  assert.equal(one({ slowdistance: Number.NaN }, 'slowDistance'), 500);
  assert.equal(one({ repeat: 150 }, 'repeatChance'), 1);
  assert.equal(one({ repeat: -10 }, 'repeatChance'), 0);
  assert.equal(one({ partime: -3 }, 'parTime'), 35);
  assert.equal(one({ partime: Number.NaN }, 'parTime'), 35);
  assert.equal(one({ score: 3600 }, 'coinPoints'), 600);
  assert.equal(one({ score: 3600 }, 'target'), 3600);
  assert.equal(one({ zumaslow: Number.NaN }, 'zumaSlowTicks'), 660, 'non-finite → default, not 0');
  assert.equal(one({ zumaslow: -10 }, 'zumaSlowTicks'), 0, 'negative → 0');
  assert.equal(one({ zumaback: Number.POSITIVE_INFINITY }, 'zumaBackTicks'), 180);
  assert.equal(one({ colors: 9 }, 'colors'), 6);
  assert.equal(one({ colors: 1 }, 'colors'), 3);
});
