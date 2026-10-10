// R2.0.17 — score original : bonus de saut, matches, enchaînement (spike 02, D-22)
// Le bonus de saut est calculé à l'insertion depuis la largeur minimale des brèches traversées, armé sur la
// bille et payé par le match qui la détruit (gardé contre sa couleur, effacé sinon) ; un match vaut
// 10 × n + 100 × combo + saut, plus (chain + 5) × 10 dès le 5ᵉ tir réussi consécutif pour un match direct.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION, gapBonusPoints } from '../.compiled/core.js';

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

// ------------------------------------------------------------ barème du saut (0x421cac–0x421d2b)

test('gapBonusPoints: max(10, ⌊500 × (300 − max(0, w − 64)) / 300⌋₁₀) × gaps — the original table', () => {
  assert.equal(gapBonusPoints(64, 1), 500);
  assert.equal(gapBonusPoints(0, 1), 500);
  assert.equal(gapBonusPoints(100, 1), 440);
  assert.equal(gapBonusPoints(150, 1), 350);
  assert.equal(gapBonusPoints(200, 1), 270);
  assert.equal(gapBonusPoints(250, 1), 190);
  assert.equal(gapBonusPoints(300, 1), 100);
  assert.equal(gapBonusPoints(364, 1), 10);
  assert.equal(gapBonusPoints(1000, 1), 10, 'never below 10 per gap');
  assert.equal(gapBonusPoints(100, 2), 880, 'double gap: the narrowest gap × 2');
  assert.equal(gapBonusPoints(100, 3), 1320);
  assert.equal(gapBonusPoints(100, 0), 0, 'no gap → nothing');
  assert.equal(gapBonusPoints(NaN, 1), 500, 'non-measurable width counts as 0');
  assert.equal(gapBonusPoints(-5, 1), 500, 'negative width counts as 0');
  assert.equal(gapBonusPoints(Infinity, 1), 10, 'infinite width → the floor');
  for (let w = 0; w <= 400; w += 4) {
    const p = gapBonusPoints(w, 1);
    assert.equal(p % 10, 0, `multiple of 10 (${w} → ${p})`);
    assert.ok(p >= 10 && p <= 500, `within 10..500 (${w} → ${p})`);
    if (w > 0) assert.ok(p <= gapBonusPoints(w - 4, 1), `non-increasing in the width (${w})`);
  }
});

// ------------------------------------------------------------ fixture « rectangle » : brèche de 64 px en bas, série en haut

/** Lower leg y = 240 (s 0..640), right leg, upper leg y = 100 (s 780..1420, x = 640 − (s − 780)). A shot at (320, 100) crosses s = 320 and lands at s = 1100. */
const RECT = [[0, 240], [640, 240], [640, 100], [0, 100]];
/** Free width 380 − 284 − 32 = 64 px of track between the two balls' edges. */
const LOWER = [{ color: 1, s: 284 }, { color: 2, s: 380 }];
const rect = (balls, current, next = current, points = RECT) => {
  const g = new ZumaEngine(new Track(points), frog, quiet, 3);
  g.feeding = false;
  g.loadFixture({ balls, current, next, stream: false });
  return g;
};

test('gap bonus: a shot through a 64 px gap that completes a run pays 500 with the match, never at the insertion', () => {
  const g = rect([...LOWER, { color: 1, s: 1036 }, { color: 0, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 0);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  g.step();
  assert.equal(g.projectiles.length, 1);
  assert.equal(g.projectiles[0].gapMinWidth, Infinity, 'no gap crossed yet');
  const insert = stepUntil(g, 'insert', 60);
  assert.equal(ofKind(g, 'gap').length, 0, 'nothing at the insertion');
  assert.equal(g.score, 0, 'no points at the insertion');
  assert.equal(g.stats.gaps, 0);
  const inserted = g.balls.find(b => b.id === insert.id);
  assert.equal(inserted.gapBonus, 500, 'bonus armed on the ball (0x421d27)');
  assert.equal(inserted.gapCount, 1);
  const destroy = stepUntil(g, 'destroy', 60);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 500);
  assert.equal(destroy.gapCount, 1);
  assert.equal(destroy.chainBonus, 0);
  assert.equal(destroy.points, 530, '10 × 3 + 500');
  assert.equal(g.score, 530);
  assert.equal(g.levelScore, 530, 'the gauge gets the gap points too');
  const gaps = ofKind(g, 'gap');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].tick, destroy.tick, 'gap emitted with the match');
  assert.ok(gaps[0].tick > insert.tick, 'never at the insert tick');
  assert.equal(gaps[0].count, 1);
  assert.equal(gaps[0].points, 500);
  assert.equal(g.stats.gaps, 1, 'one SAUTS per match');
  assert.equal(inserted.gapBonus, undefined, 'cleared once paid');
  assert.equal(inserted.gapCount, undefined);
});

test('gap bonus: a shot through a gap that lands beside no ball of its colour pays nothing and loses its bonus', () => {
  const g = rect([...LOWER, { color: 1, s: 1036 }, { color: 0, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 3);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const insert = stepUntil(g, 'insert', 60);
  run(g, 20);
  assert.equal(ofKind(g, 'gap').length, 0);
  assert.equal(ofKind(g, 'destroy').length, 0);
  assert.equal(g.score, 0);
  assert.equal(g.stats.gaps, 0);
  const inserted = g.balls.find(b => b.id === insert.id);
  assert.ok(inserted, 'the ball sits in the chain');
  assert.equal(inserted.gapBonus, undefined, 'bonus cleared (0x421dbc)');
  assert.equal(inserted.gapCount, undefined);
  assert.equal(g.streak, 0);
});

test('gap bonus: a ball landed against its colour keeps its bonus; the later match pays the sum of both balls as one gap', () => {
  const g = rect([...LOWER, { color: 1, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 0, 0);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const first = stepUntil(g, 'insert', 60);
  run(g, 20);
  assert.equal(ofKind(g, 'destroy').length, 0, 'two balls of colour 0: no match');
  assert.equal(ofKind(g, 'gap').length, 0);
  assert.equal(g.score, 0);
  const waiting = g.balls.find(b => b.id === first.id);
  assert.equal(waiting.gapBonus, 500, 'waiting ball keeps its bonus (0x421d59)');
  assert.equal(waiting.gapCount, 1);
  assert.equal(g.current, 0);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const destroy = stepUntil(g, 'destroy', 80);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 1000, '500 + 500');
  assert.equal(destroy.gapCount, 1);
  assert.equal(destroy.points, 1030);
  assert.equal(g.score, 1030);
  const gaps = ofKind(g, 'gap');
  assert.equal(gaps.length, 1, 'one gap event for the match');
  assert.equal(gaps[0].points, 1000);
  assert.equal(gaps[0].count, 1);
  assert.equal(g.stats.gaps, 1, 'one match with a gap');
});

test('double gap: two gaps of 64 and 100 px pay 500 × 2 (the narrowest, not 500 + 440) with count 2', () => {
  // Lower leg y 240 (s 0..640), middle leg y 170 (s 710..1350, x = 640 − (s − 710)), upper leg y 100 (s 1420..2060, x = s − 1420).
  // The shot at (320, 100) crosses s = 320 and s = 1030 and lands at s = 1740.
  const track = [[0, 240], [640, 240], [640, 170], [0, 170], [0, 100], [640, 100]];
  const g = rect([
    ...LOWER,
    { color: 3, s: 994 }, { color: 2, s: 1126 }, // free width 1126 − 994 − 32 = 100
    { color: 1, s: 1676 }, { color: 0, s: 1708 }, { color: 0, s: 1740 }, { color: 1, s: 1772 },
  ], 0, 0, track);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const insert = stepUntil(g, 'insert', 80);
  const inserted = g.balls.find(b => b.id === insert.id);
  assert.equal(inserted.gapCount, 2);
  assert.equal(inserted.gapBonus, 1000);
  const destroy = stepUntil(g, 'destroy', 60);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 1000);
  assert.equal(destroy.gapCount, 2);
  assert.equal(destroy.points, 1030);
  const gap = ofKind(g, 'gap')[0];
  assert.ok(gap, 'gap event');
  assert.equal(gap.count, 2);
  assert.equal(gap.points, 1000);
  assert.equal(g.stats.gaps, 1);
});

test('trackGap keeps the narrowest gap crossed in Projectile.gapMinWidth; the insert() hook arms nothing', () => {
  const g = rect([...LOWER, { color: 1, s: 1036 }, { color: 0, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 0);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  g.step();
  const p = g.projectiles[0];
  assert.equal(p.gapMinWidth, Infinity);
  assert.equal(p.gaps, 0);
  // From y = 384 at 12 px/tick: y = 240 ± 16 is reached after 11..13 ticks.
  run(g, 14);
  assert.equal(p.gaps, 1);
  assert.equal(p.gapMinWidth, 64, 'next.s − prev.s − ballSpacing');
  const hook = g.insert(0, { id: 999, color: 0 }, { x: 0, y: 0 }, 10);
  assert.equal(hook.gapBonus, undefined);
  assert.equal(hook.gapCount, undefined);
});

// ------------------------------------------------------------ score des matches (0x420b80)

test('match score: 10 × n for a direct run of 3, 4 or 5 — no bonus beyond three balls', () => {
  for (const n of [3, 4, 5]) {
    const balls = Array.from({ length: n - 1 }, (_, i) => ({ color: 0, s: 336 - 32 * (n - 2 - i) }));
    const g = fixture(balls, {}, 0, 2000);
    g.command({ kind: 'shoot', x: 320, y: 240 });
    const destroy = stepUntil(g, 'destroy', 60);
    assert.equal(destroy.count, n, `run of ${n}`);
    assert.equal(destroy.depth, 1);
    assert.equal(destroy.points, 10 * n, `10 × ${n}`);
    assert.equal(destroy.gapPoints, 0);
    assert.equal(destroy.chainBonus, 0);
    assert.equal(destroy.streak, 1);
    assert.equal(g.score, 10 * n);
  }
});

test('chain reaction: depth 2 adds 100, depth 3 adds 200 (COMBO x2 / x3), depth = combo + 1', () => {
  const g = fixture([{ color: 2, s: 136 }, { color: 2, s: 168 }, { color: 1, s: 200 }, { color: 1, s: 232 }, { color: 0, s: 264 }, { color: 0, s: 296 }, { color: 1, s: 328 }, { color: 2, s: 360 }], {}, 0, 2000);
  g.command({ kind: 'shoot', x: 280, y: 240 });
  run(g, 400);
  const destroys = ofKind(g, 'destroy');
  assert.deepEqual(destroys.map(e => e.depth), [1, 2, 3]);
  for (const e of destroys) {
    assert.equal(e.count, 3);
    assert.equal(e.points, 10 * e.count + 100 * (e.depth - 1), `depth ${e.depth}`);
    assert.equal(e.chainBonus, 0, 'no chain bonus under 5 consecutive hits');
  }
  assert.deepEqual(destroys.map(e => e.points), [30, 130, 230]);
  assert.equal(g.score, 390);
  assert.equal(g.stats.maxCombo, 3);
  assert.equal(g.stats.combos, 2);
});

// ------------------------------------------------------------ enchaînement (0x420bee–0x420bfc)

/** One direct run of three per shot: the fixture is reloaded (streak and score survive loadFixture). */
const hit = g => {
  g.loadFixture({ balls: [{ color: 0, s: 304 }, { color: 0, s: 336 }], current: 0, next: 0, stream: false });
  g.command({ kind: 'shoot', x: 320, y: 240 });
  return stepUntil(g, 'destroy', 60);
};

test('chain bonus: (chain + 5) × 10 from the 5th consecutive hit on a direct match, reset by a miss, never on a chain reaction', () => {
  const g = fixture([], {}, 0, 2000);
  const hits = [];
  for (let i = 0; i < 4; i++) hits.push(hit(g));
  for (const [i, e] of hits.entries()) {
    assert.equal(e.chainBonus, 0, `hit ${i + 1}: no bonus`);
    assert.equal(e.points, 30);
    assert.equal(e.streak, i + 1);
    assert.equal(ofKind(g, 'streak').length, 0, `hit ${i + 1}: no streak event`);
  }
  const fifth = hit(g);
  assert.equal(fifth.chainBonus, 100, '(5 + 5) × 10');
  assert.equal(fifth.points, 130);
  assert.equal(fifth.streak, 5);
  const streak5 = ofKind(g, 'streak');
  assert.equal(streak5.length, 1);
  assert.equal(streak5[0].streak, 5);
  assert.equal(streak5[0].points, 100);
  assert.equal(streak5[0].tick, fifth.tick, 'with the match');
  assert.ok(Number.isFinite(streak5[0].x) && Number.isFinite(streak5[0].y));
  const sixth = hit(g);
  assert.equal(sixth.chainBonus, 110, '(6 + 5) × 10');
  assert.equal(sixth.points, 140);
  assert.equal(ofKind(g, 'streak')[0].points, 110);
  assert.equal(g.score, 30 * 4 + 130 + 140);
  assert.equal(g.levelScore, g.score, 'the gauge gets every point');
  assert.equal(g.stats.maxStreak, 6);
  // A miss resets the chain.
  g.loadFixture({ balls: [{ color: 0, s: 1500 }], current: 0, next: 0, stream: false });
  g.command({ kind: 'shoot', x: 320, y: 0 });
  stepUntil(g, 'miss', 80);
  assert.equal(g.streak, 0);
  assert.equal(hit(g).chainBonus, 0, 'back to one hit');
});

test('chain bonus: a match from a chain reaction (depth > 1) during a chain ≥ 5 adds nothing; the direct match does', () => {
  const g = fixture([], {}, 0, 2000);
  for (let i = 0; i < 5; i++) hit(g);
  assert.equal(g.streak, 5);
  const before = g.score;
  g.loadFixture({ balls: [{ color: 1, s: 200 }, { color: 1, s: 232 }, { color: 0, s: 264 }, { color: 0, s: 296 }, { color: 1, s: 328 }], current: 0, next: 0, stream: false });
  g.command({ kind: 'shoot', x: 280, y: 240 });
  run(g, 300);
  const destroys = ofKind(g, 'destroy');
  assert.deepEqual(destroys.map(e => e.depth), [1, 2]);
  assert.equal(destroys[0].chainBonus, 110, '6th consecutive hit: (6 + 5) × 10');
  assert.equal(destroys[0].points, 140);
  assert.equal(destroys[1].chainBonus, 0, 'chain reaction: no chain bonus');
  assert.equal(destroys[1].points, 130, '10 × 3 + 100');
  const streaks = ofKind(g, 'streak');
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].streak, 6);
  assert.equal(g.score - before, 270);
  assert.equal(g.stats.combos, 1);
  assert.equal(g.stats.maxStreak, 6);
});

// ------------------------------------------------------------ baseline

test('baseline 2.0.17 (superseded): ENGINE_VERSION and package.json agree; the old rules are gone from the compiled core', () => {
  // R2.0.18: the baseline moved on (r218 locks '2.0.18'); this test keeps the manifest / engine agreement and the ordering.
  assert.ok(ENGINE_VERSION > '2.0.17');
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).version, ENGINE_VERSION);
  const core = fs.readFileSync('.compiled/core.js', 'utf8');
  assert.match(core, /export function gapBonusPoints\(/);
  assert.match(core, /gapMinWidth/);
  assert.doesNotMatch(core, /100 \* p\.gaps/, 'no flat 100 per gap at the insertion');
  assert.doesNotMatch(core, /50 \* \(this\.streak - 4\)/, 'no 50 × (streak − 4)');
  assert.doesNotMatch(core, /10 \* Math\.max\(0, run\.length - 3\)/, 'no bonus beyond three balls');
});
