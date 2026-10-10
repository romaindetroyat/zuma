// R2.0.15 — pièces aux TreasurePoints, décompte de fin de niveau, bonus de temps d'expert, « PARTEZ », zumaslow/zumaback
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE, aceTimeBonus } from '../.compiled/core.js';
import { soundCues, coinFrame, sparkleFrame } from '../.compiled/feedback.js';

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

// ------------------------------------------------------------------ pièces (D-07, D-09)

test('coins: without treasure points nothing happens and the colour sequence is untouched', () => {
  const g = fixture([{ color: 0, s: 100 }, { color: 1, s: 132 }]);
  run(g, 2000);
  assert.equal(g.coin, null);
  assert.equal(g.events.filter(e => String(e.kind).startsWith('coin')).length, 0);
  const streamed = (withTreasure) => {
    const e = new ZumaEngine(straight(), frog, { ...CANDIDATE, start: 5, total: 30, speed: 60, feedSpeed: 600, powerChance: 0 }, 11);
    if (withTreasure) e.setTreasure([]);
    run(e, 400);
    return e.balls.map(b => b.color);
  };
  const a = streamed(false), b = streamed(true);
  assert.ok(a.length >= 15, `${a.length} balls streamed`);
  assert.deepEqual(a, b, 'an empty treasure list must not consume the RNG');
});

test('coins: a coin appears 540–900 ticks after the previous one, stays 360 ticks, one at a time', () => {
  const g = fixture([{ color: 0, s: 100 }]);
  g.setTreasure([{ x: 100, y: 100, curve: 0, dist: 0 }]);
  assert.equal(g.coin, null);
  const first = stepUntil(g, 'coin-appear', 1000);
  assert.ok(first.tick >= 540 && first.tick <= 900, `first coin at tick ${first.tick}`);
  assert.deepEqual([first.x, first.y], [100, 100]);
  assert.ok(g.coin && g.coin.x === 100 && g.coin.y === 100 && g.coin.id === first.id);
  const vanish = stepUntil(g, 'coin-vanish', 400);
  assert.equal(vanish.tick, first.tick + CANDIDATE.coinVisibleTicks);
  assert.equal(vanish.id, first.id);
  assert.equal(g.coin, null);
  const second = stepUntil(g, 'coin-appear', 1000);
  assert.ok(second.tick - vanish.tick >= 540 && second.tick - vanish.tick <= 900, `second coin ${second.tick - vanish.tick} ticks after the vanish`);
  assert.notEqual(second.id, first.id);
  run(g, 3000);
  let visible = 0;
  for (const e of g.events) {
    if (e.kind === 'coin-appear') visible++;
    if (e.kind === 'coin-vanish' || e.kind === 'coin') visible--;
    assert.ok(visible >= 0 && visible <= 1, 'never two coins at once');
  }
  assert.ok(ofKind(g, 'coin-appear').length >= 4);
});

test('coins: a treasure point is only chosen when no alive ball of its curve is closer than dist', () => {
  const blocked = fixture([{ color: 0, s: 320 }]);
  blocked.setTreasure([{ x: 320, y: 240, curve: 0, dist: 40 }]);
  run(blocked, 2000);
  assert.equal(ofKind(blocked, 'coin-appear').length, 0, 'the ball sits on the point');
  assert.equal(blocked.coin, null);
  const free = fixture([{ color: 0, s: 320 }]);
  free.setTreasure([{ x: 320, y: 240, curve: 0, dist: 0 }]);
  run(free, 2000);
  assert.ok(ofKind(free, 'coin-appear').length >= 1, 'dist 0 is always free');
  const farEnough = fixture([{ color: 0, s: 320 }]);
  farEnough.setTreasure([{ x: 320, y: 190, curve: 0, dist: 40 }]);
  run(farEnough, 2000);
  assert.ok(ofKind(farEnough, 'coin-appear').length >= 1, 'a ball 50 px away does not block dist 40');
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

test('coins: a projectile within 18 px grabs the coin (+100, stats.coins), keeps the streak and flies on', () => {
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
  assert.equal(grab.points, 100);
  assert.deepEqual([grab.x, grab.y], [320, 200]);
  assert.equal(g.score, score + 100);
  assert.equal(g.levelScore, levelScore + 100);
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
  const g = fixture([{ color: 0, s: 600 }, { color: 1, s: 632 }], { speed: 600 });
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

test('aceTimeBonus: 0 without partime or past it, otherwise 10 points per remaining second, floor 100', () => {
  assert.equal(aceTimeBonus(20, 25), 100);
  assert.equal(aceTimeBonus(5, 25), 200);
  assert.equal(aceTimeBonus(25, 25), 100);
  assert.equal(aceTimeBonus(26, 25), 0);
  assert.equal(aceTimeBonus(10, 0), 0);
  assert.equal(aceTimeBonus(NaN, 25), 0);
  assert.equal(aceTimeBonus(0.5, 25), 240);
});

/** r213 « ZUMA mode stops the feed… » fixture, run through the tally until `won`. */
const clearedLevel = (extra = {}) => {
  const g = new ZumaEngine(straight(), frog, { ...quiet, target: 30, total: 2, levelBonus: 500, ...extra }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  g.command({ kind: 'shoot', x: 336, y: 240 });
  const destroy = stepUntil(g, 'destroy', 60);
  g.config.total = 99;
  const clearing = stepUntil(g, 'clearing', 60);
  return { g, destroy, clearing };
};

test('clearing: the tally starts at the last explosion, scores 10 per ball slot every 4 ticks and wins with the bonuses', () => {
  const { g, destroy, clearing } = clearedLevel({ parTime: 25 });
  assert.equal(g.state, 'clearing');
  assert.equal(clearing.tick, destroy.tick + CANDIDATE.destroyTicks, 'clearing starts the tick the run is removed');
  assert.deepEqual([clearing.x, clearing.y, clearing.chain], [destroy.x, destroy.y, 0]);
  assert.equal(g.balls.length, 0);
  assert.equal(g.projectiles.length, 0);
  const steps = Math.ceil((g.track.length - destroy.x) / CANDIDATE.ballSpacing);
  assert.ok(g.cleanup && g.cleanup.steps === steps && g.cleanup.step === 0);
  // Input is ignored while clearing and no ball appears.
  const before = g.events.length;
  g.command({ kind: 'shoot', x: 320, y: 0 });
  g.command({ kind: 'swap' });
  g.step();
  assert.equal(g.events.slice(before).filter(e => e.kind === 'fire' || e.kind === 'swap').length, 0);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.spawned, 2);
  const scoreBefore = 30; // one run of three
  assert.equal(g.score, scoreBefore);
  const won = stepUntil(g, 'won', 200);
  const cleanups = ofKind(g, 'cleanup');
  assert.equal(cleanups.length, steps);
  let s = destroy.x;
  cleanups.forEach((c, i) => {
    s = Math.min(g.track.length, s + CANDIDATE.ballSpacing);
    assert.equal(c.tick, clearing.tick + 4 * (i + 1), `cleanup ${i} tick`);
    assert.equal(c.points, 10);
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
  const timeBonus = aceTimeBonus(won.tick / CANDIDATE.tickHz, 25);
  assert.ok(timeBonus >= 100, 'won well under the 25 s partime');
  assert.equal(won.levelBonus, 500);
  assert.equal(won.timeBonus, timeBonus);
  assert.equal(won.seconds, won.tick / CANDIDATE.tickHz);
  assert.equal(g.timeBonus, timeBonus);
  assert.equal(g.cleanupScore, steps * 10);
  assert.equal(g.score, scoreBefore + steps * 10 + 500 + timeBonus);
  assert.equal(won.score, g.score);
  assert.ok(won.tick >= cleanups[cleanups.length - 1].tick);
});

test('clearing: without partime the time bonus is 0', () => {
  const { g } = clearedLevel({ parTime: 0 });
  const won = stepUntil(g, 'won', 200);
  assert.equal(won.timeBonus, 0);
  assert.equal(g.timeBonus, 0);
  assert.equal(g.score, 30 + g.cleanupScore + 500);
});

test('clearing: a board emptied without an explosion wins on the next tick without any cleanup step', () => {
  const g = fixture([{ color: 0, s: 100 }]);
  g.zumaMode = true;
  g.balls = [];
  g.step();
  assert.equal(g.state, 'clearing');
  const clearing = ofKind(g, 'clearing');
  assert.equal(clearing.length, 1);
  assert.deepEqual([clearing[0].x, clearing[0].y], [g.track.pointAt(g.track.length).x, g.track.pointAt(g.track.length).y]);
  assert.equal(g.cleanup.steps, 0);
  g.step();
  assert.equal(g.state, 'won');
  assert.equal(ofKind(g, 'cleanup').length, 0);
  assert.equal(ofKind(g, 'won').length, 1);
  assert.equal(g.cleanupScore, 0);
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

test('zumaBackTicks / zumaSlowTicks arm the rollback and the slow phase when ZUMA mode starts (max with running values)', () => {
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
  assert.equal(g.slowTicks, 60);
  const longer = make({ zumaBackTicks: 30, zumaSlowTicks: 60 }, e => { e.slowTicks = 1000; e.backwardsTicks = 500; });
  assert.ok(longer.slowTicks > 60 && longer.backwardsTicks > 30, 'a longer running power is kept');
  const plain = make({});
  assert.equal(plain.backwardsTicks, 0);
  assert.equal(plain.slowTicks, 0);
});

// ------------------------------------------------------------- cues et trames (feedback.ts)

test('feedback: coin and cleanup cues, coinFrame and sparkleFrame', () => {
  assert.equal(soundCues({ tick: 1, kind: 'coin-appear' })[0].key, 'coinappear');
  assert.equal(soundCues({ tick: 1, kind: 'coin' })[0].key, 'coin');
  assert.equal(soundCues({ tick: 1, kind: 'coin-vanish' })[0].key, 'coinvanish');
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup', progress: 0 }), [{ key: 'bonuspop', gain: 1, rate: 1 }]);
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup', progress: 1 }), [{ key: 'bonuspop', gain: 1, rate: 1.5 }]);
  assert.equal(soundCues({ tick: 1, kind: 'cleanup', progress: 0.5 })[0].rate, 1.25);
  assert.equal(soundCues({ tick: 1, kind: 'cleanup', progress: 7 })[0].rate, 1.5);
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
