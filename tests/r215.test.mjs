// R2.0.15 — pièces aux TreasurePoints, décompte de fin de niveau, bonus de temps d'expert, « PARTEZ », zumaslow/zumaback
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
