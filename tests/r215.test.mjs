// R2.0.15 — pièces aux TreasurePoints, décompte de fin de niveau, bonus de temps d'expert, « PARTEZ », zumaslow/zumaback
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION, aceTimeBonus } from '../.compiled/core.js';
import { soundCues, coinFrame, sparkleFrame } from '../.compiled/feedback.js';

const straight = (length = 640) => new Track([[0, 240], [length, 240]]);
const frog = { x: 320, y: 400 };
const quiet = { ...CANDIDATE, speed: 0, feedSpeed: 0, powerChance: 0, target: 99999 };
const fixture = (balls, extra = {}, current = 0) => {
  const g = new ZumaEngine(straight(), frog, { ...quiet, ...extra }, 7);
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

const atLeast = (v, min) => { const a = v.split('.').map(Number), b = min.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); } return true; };
test('baseline R2.0.15 is preserved by the current engine version', () => {
  assert.ok(atLeast(ENGINE_VERSION, '2.0.15'), ENGINE_VERSION); // R2.0.16: the exact lock moved to r216
});

// ------------------------------------------------------------------ pièces (D-07, D-09)

test('coins: without treasure points nothing happens and the colour sequence is untouched', () => {
  const g = fixture([{ color: 0, s: 100 }, { color: 1, s: 132 }]);
  run(g, 2000);
  assert.equal(g.coin, null);
  assert.equal(g.events.filter(e => String(e.kind).startsWith('coin')).length, 0);
  const streamed = (withTreasure) => {
    // R2.0.16: 2000 px track — the fast feed now decelerates naturally and the last 1100 px of a track are slow.
    const e = new ZumaEngine(straight(2000), frog, { ...CANDIDATE, total: 30, speed: 60, powerChance: 0 }, 11);
    if (withTreasure) e.setTreasure([]);
    run(e, 400);
    return e.balls.map(b => b.color);
  };
  const a = streamed(false), b = streamed(true);
  assert.ok(a.length >= 15, `${a.length} balls streamed`);
  assert.deepEqual(a, b, 'an empty treasure list must not consume the RNG');
});

test('coins: a coin appears from 180 ticks, then ≥ 780 ticks after the previous appearance, stays 600 ticks, one at a time', () => {
  // R2.0.18 (D-28, spike 03 Q4): 0x417580 — visible 1 000 maj (600 ticks), an attempt at 1/180 per tick once 1 300 maj
  // (780 ticks) have passed since the previous appearance; replaces the 540–900-tick gap after the vanish (D-07).
  const g = fixture([{ color: 0, s: 100 }]);
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  assert.equal(g.coin, null);
  const first = stepUntil(g, 'coin-appear', 3000);
  assert.ok(first.tick >= 180, `first coin at tick ${first.tick}`);
  assert.deepEqual([first.x, first.y], [100, 100]);
  assert.ok(g.coin && g.coin.x === 100 && g.coin.y === 100 && g.coin.id === first.id);
  const vanish = stepUntil(g, 'coin-vanish', 700);
  assert.equal(vanish.tick, first.tick + CANDIDATE.coinVisibleTicks);
  assert.equal(CANDIDATE.coinVisibleTicks, 600);
  assert.equal(vanish.id, first.id);
  assert.equal(g.coin, null);
  const second = stepUntil(g, 'coin-appear', 3000);
  assert.ok(second.tick - first.tick >= 780, `second coin ${second.tick - first.tick} ticks after the first appearance`);
  assert.notEqual(second.id, first.id);
  run(g, 6000);
  let visible = 0;
  for (const e of g.events) {
    if (e.kind === 'coin-appear') visible++;
    if (e.kind === 'coin-vanish' || e.kind === 'coin') visible--;
    assert.ok(visible >= 0 && visible <= 1, 'never two coins at once');
  }
  assert.ok(ofKind(g, 'coin-appear').length >= 4);
});

test('coins: a treasure point is only chosen once the head of its curve has passed dist % of the track', () => {
  // R2.0.18 (spike 03 Q4, 0x40a900): `dist` is a percentage of progression, not a clearance in px.
  const blocked = fixture([{ color: 0, s: 320 }]);
  blocked.setTreasure([{ x: 320, y: 240, curve: 0, dist: 60 }]);
  run(blocked, 4000);
  assert.equal(ofKind(blocked, 'coin-appear').length, 0, 'head at 50 % < 60 %');
  assert.equal(blocked.coin, null);
  const free = fixture([{ color: 0, s: 320 }]);
  free.setTreasure([{ x: 320, y: 240, curve: 0, dist: 0 }]);
  run(free, 4000);
  assert.ok(ofKind(free, 'coin-appear').length >= 1, 'dist 0 is always free');
  const farEnough = fixture([{ color: 0, s: 320 }]);
  farEnough.setTreasure([{ x: 320, y: 190, curve: 0, dist: 40 }]);
  run(farEnough, 4000);
  assert.ok(ofKind(farEnough, 'coin-appear').length >= 1, 'head at 50 % frees dist 40');
});

test('coins: setTreasure sanitises the pack data (curve clamped, dist defaulted, junk ignored)', () => {
  const g = fixture([{ color: 0, s: 100 }]);
  g.setTreasure([
    { x: 10, y: 20, curve: 7, dist: 30 },
    { x: 30, y: 40, curve: 0, dist: NaN },
    { x: 'a', y: 20, curve: 0, dist: 0 },
    { x: 50, y: 60, curve: -2, dist: -5 },
  ]);
  assert.deepEqual(g.treasure, [
    { x: 10, y: 20, curve: 0, dist: 30 },
    { x: 30, y: 40, curve: 0, dist: 0 },
    { x: 50, y: 60, curve: 0, dist: 0 },
  ]);
});

test('coins: a projectile within 18 px grabs the coin (+500, stats.coins), keeps the streak and flies on', () => {
  // R2.0.16: coinPoints 500 = max(500, 100 × ⌊score / 600⌋) at level 1-1 (0x4233fb), no longer the D-09 hypothesis of 100.
  const g = fixture([{ color: 0, s: 100 }]);
  g.setTreasure([{ x: 320, y: 200, curve: 0, dist: 0 }]);
  g.spawnCoinForTest(0);
  assert.ok(g.coin && g.coin.x === 320 && g.coin.y === 200);
  assert.equal(ofKind(g, 'coin-appear').length, 1);
  g.streak = 3;
  const score = g.score, levelScore = g.levelScore;
  g.command({ kind: 'shoot', x: 320, y: 0 });
  const grab = stepUntil(g, 'coin', 40);
  const p = g.projectiles[0];
  assert.ok(p, 'projectile continues after the grab');
  assert.ok(Math.hypot(p.x - 320, p.y - 200) < CANDIDATE.coinRadius, 'grabbed at the tick the projectile came within coinRadius');
  assert.equal(grab.points, 500);
  assert.deepEqual([grab.x, grab.y], [320, 200]);
  assert.equal(g.score, score + 500);
  assert.equal(g.levelScore, levelScore + 500);
  assert.equal(g.stats.coins, 1);
  assert.equal(g.coin, null);
  assert.equal(g.streak, 3, 'the streak is preserved');
  g.step();
  assert.equal(g.projectiles.length, 1, 'still flying one tick later');
  const miss = stepUntil(g, 'miss', 60);
  assert.ok(miss);
  assert.equal(g.streak, 0, 'a later miss still resets the streak');
  assert.equal(g.stats.coins, 1);
});

test('coins: losing the chain removes the coin with a coin-vanish', () => {
  const g = fixture([{ color: 0, s: 600 }, { color: 1, s: 632 }], { speed: 600, endSlowFactor: 1 }); // R2.0.16: no slow zone on the short track
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  g.spawnCoinForTest(0);
  const id = g.coin.id;
  run(g, 1);
  assert.equal(g.state, 'draining');
  assert.equal(g.coin, null);
  const vanish = ofKind(g, 'coin-vanish');
  assert.equal(vanish.length, 1);
  assert.equal(vanish[0].id, id);
});

test('coins: coin points fill the ZUMA gauge', () => {
  const g = fixture([{ color: 0, s: 100 }], { target: 100 });
  g.setTreasure([{ x: 320, y: 200, curve: 0, dist: 0 }]);
  g.spawnCoinForTest(0);
  g.command({ kind: 'shoot', x: 320, y: 0 });
  stepUntil(g, 'coin', 40);
  assert.ok(g.zumaMode);
  assert.equal(ofKind(g, 'zuma').length, 1);
});

// -------------------------------------------- fin de niveau : clearing, décompte, bonus de temps (D-04, D-10)

test('aceTimeBonus: original formula — 0 past the par time, otherwise 100 × (1 + ⌊250 × (1 − ⌊t⌋ / par)⌋)', () => {
  // R2.0.16: replaces the « 10 points per remaining second, floor 100 » hypothesis (0x401cb0, r216).
  assert.equal(aceTimeBonus(24, 25), 1100);
  assert.equal(aceTimeBonus(20, 25), 5100);
  assert.equal(aceTimeBonus(25, 25), 100);
  assert.equal(aceTimeBonus(26, 25), 0);
  assert.equal(aceTimeBonus(0, 25), 25100);
  assert.equal(aceTimeBonus(10, 0), 0);
  assert.equal(aceTimeBonus(NaN, 25), 0);
  assert.equal(aceTimeBonus(0.5, 25), 25100);
});

/** r213 « ZUMA mode stops the feed… » fixture, run through the tally until `won`. */
const clearedLevel = (extra = {}) => {
  // R2.0.16: 2000 px track (endSlowFactor 1 in `quiet` is moot at speed 0; the tally needs room for its 60 px steps).
  const g = new ZumaEngine(straight(2000), frog, { ...quiet, target: 30, total: 2, levelBonus: 500, ...extra }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  g.command({ kind: 'shoot', x: 336, y: 240 });
  const destroy = stepUntil(g, 'destroy', 60);
  g.config.total = 99;
  const clearing = stepUntil(g, 'clearing', 60);
  return { g, destroy, clearing };
};

test('clearing: the tally walks 60 px every 2.4 ticks at +100 from the last explosion, ignores input and wins with the bonuses', () => {
  // R2.0.16: original cadence (60 px / 4 maj / +100, first step +20 maj, STATS +50 maj) and level bonus credited at clearing (r216).
  const { g, destroy, clearing } = clearedLevel({ parTime: 25 });
  assert.equal(g.state, 'clearing');
  assert.equal(clearing.tick, destroy.tick + CANDIDATE.destroyTicks, 'clearing starts the tick the run is removed');
  assert.equal(clearing.chain, 0);
  assert.equal(g.balls.length, 0);
  assert.equal(g.projectiles.length, 0);
  const steps = Math.ceil((g.track.length - destroy.x) / CANDIDATE.cleanupStepPx);
  assert.ok(g.cleanup && g.cleanup.steps === steps && g.cleanup.step === 0);
  // Input is ignored while clearing and no ball appears.
  const before = g.events.length;
  g.command({ kind: 'shoot', x: 320, y: 0 });
  g.command({ kind: 'swap' });
  g.step();
  assert.equal(g.events.slice(before).filter(e => e.kind === 'fire' || e.kind === 'swap').length, 0);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.spawned, 2);
  const scoreBefore = 30 + 500; // one run of three + the level bonus of one curve, credited at clearing
  assert.equal(g.score, scoreBefore);
  assert.equal(clearing.levelBonus, 500);
  const won = stepUntil(g, 'won', 400);
  const cleanups = ofKind(g, 'cleanup');
  assert.equal(cleanups.length, steps);
  cleanups.forEach((c, i) => {
    const s = g.track.length - CANDIDATE.cleanupStepPx * (steps - i - 1);
    assert.equal(c.tick, clearing.tick + Math.ceil(CANDIDATE.cleanupStartTicks + CANDIDATE.cleanupStepTicks * i - 1e-9), `cleanup ${i} tick`);
    assert.equal(c.points, CANDIDATE.cleanupPoints);
    assert.equal(c.step, i + 1);
    assert.equal(c.steps, steps);
    assert.equal(c.chain, 0);
    assert.ok(Math.abs(c.progress - (i + 1) / steps) < 1e-9);
    if (i > 0) assert.ok(c.progress > cleanups[i - 1].progress, 'progress strictly increasing');
    assert.deepEqual([c.x, c.y], [g.track.pointAt(s).x, g.track.pointAt(s).y]);
  });
  assert.equal(cleanups[cleanups.length - 1].progress, 1);
  assert.equal(g.state, 'won');
  assert.equal(g.balls.length, 0);
  assert.equal(g.cleanup, null);
  const timeBonus = aceTimeBonus(g.levelTicks / CANDIDATE.tickHz, 25); // D-13: level clock, frozen at clearing
  assert.ok(timeBonus >= 100, 'won well under the 25 s partime');
  assert.equal(won.levelBonus, 500);
  assert.equal(won.timeBonus, timeBonus);
  assert.equal(won.seconds, g.levelTicks / CANDIDATE.tickHz);
  assert.equal(g.timeBonus, timeBonus);
  assert.equal(g.cleanupScore, steps * 100);
  assert.equal(g.score, scoreBefore + steps * 100, 'the time bonus is credited later through creditBonus (STATS count-up)');
  assert.equal(won.score, g.score);
  assert.equal(won.tick, cleanups[cleanups.length - 1].tick + CANDIDATE.cleanupEndTicks);
});

test('clearing: without partime the time bonus is 0', () => {
  const { g } = clearedLevel({ parTime: 0 });
  const won = stepUntil(g, 'won', 400);
  assert.equal(won.timeBonus, 0);
  assert.equal(g.timeBonus, 0);
  assert.equal(g.score, 30 + 500 + g.cleanupScore);
});

test('clearing: a board emptied without an explosion walks the whole track from its start', () => {
  // R2.0.18 (D-30): a chain without a destruction in the level has its marker start at the beginning of its
  // track (aligned so that the last step lands on the skull) instead of making no step.
  const g = fixture([{ color: 0, s: 100 }]);
  g.zumaMode = true;
  g.balls = [];
  g.step();
  assert.equal(g.state, 'clearing');
  const clearing = ofKind(g, 'clearing');
  assert.equal(clearing.length, 1);
  const steps = Math.ceil(g.track.length / CANDIDATE.cleanupStepPx);
  assert.equal(g.cleanup.steps, steps);
  assert.equal(g.cleanup.markers[0].s, g.track.length - steps * CANDIDATE.cleanupStepPx);
  assert.deepEqual([clearing[0].x, clearing[0].y], [g.track.pointAt(g.cleanup.markers[0].s).x, g.track.pointAt(g.cleanup.markers[0].s).y]);
  const won = stepUntil(g, 'won', 400);
  const cleanups = ofKind(g, 'cleanup');
  assert.equal(cleanups.length, steps);
  assert.equal(won.tick, cleanups[cleanups.length - 1].tick + CANDIDATE.cleanupEndTicks);
  assert.equal(ofKind(g, 'won').length, 1);
  assert.equal(g.cleanupScore, steps * 100);
});

test('clearing: the coin on the board vanishes when the level is cleared', () => {
  const g = fixture([{ color: 0, s: 100 }]);
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  g.spawnCoinForTest(0);
  g.zumaMode = true;
  g.balls = [];
  g.step();
  assert.equal(g.coin, null);
  assert.equal(ofKind(g, 'coin-vanish').length, 1);
});

// ------------------------------------------------------------- « PARTEZ » (D-11), zumaslow / zumaback (GAME-01)

test('go: emitted exactly once, the tick the fast intro feed ends', () => {
  const g = new ZumaEngine(straight(), frog, { ...CANDIDATE, start: 5, total: 9, speed: 60, feedSpeed: 600, powerChance: 0 }, 11);
  let endTick = 0;
  for (let i = 0; i < 200 && g.feeding; i++) { g.step(); if (!g.feeding) endTick = g.tick; }
  assert.ok(endTick > 0, 'feeding ended');
  run(g, 300);
  const go = ofKind(g, 'go');
  assert.equal(go.length, 1);
  assert.equal(go[0].tick, endTick);
  const silent = new ZumaEngine(straight(), frog, { ...CANDIDATE, start: 5, total: 9, speed: 60, feedSpeed: 600, powerChance: 0 }, 11);
  silent.feeding = false;
  run(silent, 300);
  assert.equal(ofKind(silent, 'go').length, 0);
});

test('zumaBackTicks / zumaSlowTicks arm the rollback and the ZUMA slow phase when ZUMA mode starts (max with running values)', () => {
  // R2.0.16: the slow phase is `zumaSlowLeft` (target × 0.25), no longer the SLOW power-up `slowTicks`; the
  // 640 px fixture has its head past 50 % of the track so the pushback applies (r216 covers the other case),
  // and CANDIDATE now carries the original defaults (300 / 1100 maj → 180 / 660 ticks).
  const make = (extra, prepare = () => {}) => {
    const g = new ZumaEngine(straight(), frog, { ...quiet, target: 30, total: 2, levelBonus: 500, ...extra }, 5);
    g.feeding = false;
    g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
    prepare(g);
    g.command({ kind: 'shoot', x: 336, y: 240 });
    stepUntil(g, 'zuma', 60);
    return g;
  };
  const g = make({ zumaBackTicks: 30, zumaSlowTicks: 60 });
  assert.equal(g.backwardsTicks, 30);
  assert.equal(g.zumaSlowLeft, 60);
  assert.equal(g.slowTicks, 0, 'the SLOW power-up is not armed by a ZUMA');
  const longer = make({ zumaBackTicks: 30, zumaSlowTicks: 60 }, e => { e.zumaSlowLeft = 1000; e.backwardsTicks = 500; });
  assert.ok(longer.zumaSlowLeft > 60 && longer.backwardsTicks > 30, 'a longer running phase is kept');
  const plain = make({});
  assert.equal(plain.backwardsTicks, CANDIDATE.zumaBackTicks);
  assert.equal(plain.zumaSlowLeft, CANDIDATE.zumaSlowTicks);
});

// ------------------------------------------------------------- cues et trames (feedback.ts)

test('feedback: coin and cleanup cues, coinFrame and sparkleFrame', () => {
  assert.equal(soundCues({ tick: 1, kind: 'coin-appear' })[0].key, 'coinappear');
  assert.equal(soundCues({ tick: 1, kind: 'coin' })[0].key, 'coin');
  assert.equal(soundCues({ tick: 1, kind: 'coin-vanish' })[0].key, 'coinvanish');
  // R2.0.16 (§7): the step itself is silent; `endoflevelpop1` comes from `cleanup-pop` every 6 ticks at 0.5, pitch 1 (the rising pitch moved to the STATS count-up).
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup', progress: 0 }), []);
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup', progress: 1 }), []);
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup-pop', index: 0, progress: 0 }), [{ key: 'bonuspop', gain: 0.5, rate: 1 }]);
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup-pop', index: 9, progress: 1 }), [{ key: 'bonuspop', gain: 0.5, rate: 1 }]);
  assert.equal(soundCues({ tick: 1, kind: 'won' })[0].key, 'levelwin');
  assert.equal(coinFrame(0), 0);
  assert.equal(coinFrame(3), 1);
  assert.equal(coinFrame(89), 29);
  assert.equal(coinFrame(90), 0);
  assert.equal(coinFrame(7, 10, 2), 3);
  assert.equal(sparkleFrame(0), 0);
  assert.equal(sparkleFrame(1), 0);
  assert.equal(sparkleFrame(2), 1);
  assert.equal(sparkleFrame(27), 13);
  assert.equal(sparkleFrame(28), -1);
  assert.equal(sparkleFrame(89), -1);
  assert.equal(sparkleFrame(90), 0);
  const seen = new Map();
  for (let t = 0; t < 90; t++) { const f = sparkleFrame(t); if (f >= 0) seen.set(f, (seen.get(f) ?? 0) + 1); }
  assert.deepEqual([...seen.keys()].sort((a, b) => a - b), Array.from({ length: 14 }, (_, i) => i));
  assert.ok([...seen.values()].every(n => n === 2));
});
