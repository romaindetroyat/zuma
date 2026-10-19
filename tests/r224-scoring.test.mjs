// R2.0.24 — audit du score contre l'exécutable original (session de débogage scoring-audit).
// Bonus de saut : le détecteur 0x414c60 (échantillons de courbe tous les 32 px, rayon 16, liste brute des billes —
// billes en explosion comprises —, largeur = distance entre CENTRES, seulement aux mises à jour sans collision,
// clé = bille avant) et 0x422032 (la brèche où la bille se pose ne compte jamais). Bille « en attente »
// (0x421d55–0x421db9) : posée sans match face à une bille de sa couleur de l'autre côté d'une brèche (centres à 42 px
// ou plus) — elle garde son bonus de saut ET l'enchaînement ; détruite plus tard, elle ajoute 1 à l'enchaînement
// (0x4212d4) et le match de contact paie (chain + 5) × 10 dès 5 (0x420bcf, combo 0) ; un contact qui ne la détruit
// pas remet l'enchaînement à zéro (0x408e30). Une bille collée à une seule bille de sa couleur n'est pas en attente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';

const frog = { x: 320, y: 400 };
const quiet = { ...CANDIDATE, speed: 0, powerChance: 0, target: 99999, endSlowFactor: 1 };
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const ofKind = (g, kind) => g.events.filter(e => e.kind === kind);
const stepUntil = (g, kind, limit) => {
  for (let i = 0; i < limit; i++) {
    const before = g.events.length;
    g.step();
    const e = g.events.slice(before).find(ev => ev.kind === kind);
    if (e) return e;
  }
  throw new Error(`no ${kind} within ${limit} ticks`);
};

/** Lower leg y = 240 (s 0..640), right leg, upper leg y = 100 (x = 640 − (s − 780)). A shot at x = 320 crosses s = 320, lands near s = 1100. */
const RECT = [[0, 240], [640, 240], [640, 100], [0, 100]];
/** Centres 284 and 380: the original width is 96 (centre distance), not the free 64. */
const LOWER = [{ color: 1, s: 284 }, { color: 2, s: 380 }];
const rect = (balls, current, { next = current, frogAt = frog, points = RECT } = {}) => {
  const g = new ZumaEngine(new Track(points), frogAt, quiet, 3);
  g.feeding = false;
  g.loadFixture({ balls, current, next, stream: false });
  return g;
};

test('gap width = distance between the two balls\' CENTRES (0x414e19): centres 284 / 380 → w 96 → 440, match 470', () => {
  const g = rect([...LOWER, { color: 1, s: 1036 }, { color: 0, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 0);
  g.command({ kind: 'shoot', x: 320, y: 100 });
  g.step();
  const p = g.projectiles[0];
  run(g, 15);
  assert.equal(p.gaps, 1);
  assert.equal(p.gapMinWidth, 96, 'next.s − prev.s, centre to centre');
  const insert = stepUntil(g, 'insert', 60);
  const inserted = g.balls.find(b => b.id === insert.id);
  assert.equal(inserted.gapBonus, 440, '⌊500 × (300 − 32) / 300⌋₁₀');
  const destroy = stepUntil(g, 'destroy', 60);
  assert.equal(destroy.gapPoints, 440);
  assert.equal(destroy.points, 470, '10 × 3 + 440');
});

test('the gap the ball is inserted into never pays (0x422001–0x422032), even when the projectile flew through it', () => {
  // Shallow shot from the right along the track: it enters the gap 164 … 600 without touching anything, then hits the
  // rear segment's front ball (164) on its front side and is inserted INTO that gap.
  const balls = [{ color: 1, s: 100 }, { color: 0, s: 132 }, { color: 0, s: 164 }, { color: 1, s: 600 }];
  const g = rect(balls, 0, { frogAt: { x: 620, y: 300 }, points: [[0, 240], [640, 240]] });
  g.command({ kind: 'shoot', x: 164, y: 240 });
  g.step();
  const p = g.projectiles[0];
  assert.ok(p, 'projectile in flight');
  let seen = 0;
  for (let i = 0; i < 80 && g.projectiles.includes(p); i++) {
    g.step();
    seen = Math.max(seen, p.gaps);
  }
  assert.equal(seen, 1, 'the gap was registered during the flight');
  const insert = ofKind(g, 'insert')[0];
  assert.ok(insert, 'inserted');
  const inserted = g.balls.find(b => b.id === insert.id);
  assert.equal(inserted.gapBonus, undefined, 'the landing gap is removed from the list');
  const destroy = stepUntil(g, 'destroy', 60);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 0);
  assert.equal(destroy.points, 30);
  assert.equal(ofKind(g, 'gap').length, 0);
});

test('a run that is still exploding stays in the list: a shot over it sees a 32 px gap → 500 (0x414c60 raw list)', () => {
  const lower = [{ color: 1, s: 240 }, { color: 3, s: 272 }, { color: 3, s: 304 }, { color: 3, s: 336 }, { color: 3, s: 368 }, { color: 2, s: 400 }];
  const g = rect([...lower, { color: 1, s: 1036 }, { color: 0, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 0);
  for (const b of g.balls) if (b.color === 3) b.destroyingUntil = 1e9; // exploding: not hittable, still in the list
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const destroy = stepUntil(g, 'destroy', 80);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 500, 'w = 336 − 304 = 32 → 500 (not the 400 − 240 of the live edges)');
  assert.equal(destroy.points, 530);
});

test('a shot landing across a gap from its colour is « waiting »: chain and gap bonus kept; the contact match adds 1 and pays (chain + 5) × 10', () => {
  // Upper leg: rear segment …c0@1084 | gap (centres 96 apart after the insertion) | front segment c0@1212, c0@1244.
  const upper = [{ color: 2, s: 1020 }, { color: 1, s: 1052 }, { color: 0, s: 1084 }, { color: 0, s: 1212 }, { color: 0, s: 1244 }, { color: 2, s: 1276 }];
  const g = rect([...LOWER, ...upper], 0, { next: 1 });
  g.streak = 4;
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const insert = stepUntil(g, 'insert', 60);
  run(g, 12);
  assert.equal(ofKind(g, 'destroy').length, 0, 'two balls of colour 0 touching: no match at the insertion');
  const waiting = g.balls.find(b => b.id === insert.id);
  assert.equal(g.streak, 4, 'the chain is NOT reset by a waiting ball (0x421d70–0x421d81 return before 0x401ac0)');
  assert.equal(waiting.gapBonus, 440, 'the waiting ball keeps its gap bonus');
  const destroy = stepUntil(g, 'destroy', 400);
  assert.equal(destroy.count, 4, 'the contact joins 1084, the shot ball and the two front c0');
  assert.equal(destroy.depth, 1, 'combo 0');
  assert.equal(g.streak, 5, 'the waiting ball destroyed adds 1 (0x4212d4–0x4212e1)');
  assert.equal(destroy.chainBonus, 100, '(5 + 5) × 10');
  assert.equal(destroy.gapPoints, 440);
  assert.equal(destroy.points, 40 + 440 + 100);
  const streak = ofKind(g, 'streak').at(-1);
  assert.ok(streak && streak.tick === destroy.tick, 'ENCHAÎNEMENT x5 with the contact match');
  assert.equal(streak.streak, 5);
  assert.equal(g.stats.maxStreak, 5);
});

test('a ball landing against ONE touching ball of its colour (a pair, no gap) is not waiting: bonus lost, chain reset (0x421dbc)', () => {
  const g = rect([...LOWER, { color: 1, s: 1068 }, { color: 0, s: 1100 }, { color: 1, s: 1132 }], 0, { next: 0 });
  g.streak = 3;
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const first = stepUntil(g, 'insert', 60);
  run(g, 20);
  assert.equal(ofKind(g, 'destroy').length, 0);
  const pair = g.balls.find(b => b.id === first.id);
  assert.equal(pair.gapBonus, undefined, 'bonus cleared');
  assert.equal(g.streak, 0, 'chain reset');
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const destroy = stepUntil(g, 'destroy', 80);
  assert.equal(destroy.count, 3);
  assert.equal(destroy.gapPoints, 440, 'only the second shot\'s gap');
  assert.equal(destroy.points, 470);
});

test('a waiting ball that the contact does not destroy loses its waiting state then: chain reset, bonus cleared (0x408e30)', () => {
  const upper = [{ color: 2, s: 1020 }, { color: 1, s: 1052 }, { color: 2, s: 1084 }, { color: 0, s: 1212 }, { color: 1, s: 1244 }, { color: 2, s: 1276 }];
  const g = rect([...LOWER, ...upper], 0, { next: 1 });
  g.streak = 4;
  g.command({ kind: 'shoot', x: 320, y: 100 });
  const insert = stepUntil(g, 'insert', 60);
  run(g, 12);
  const ball = g.balls.find(b => b.id === insert.id);
  assert.equal(g.streak, 4, 'waiting: chain kept until the contact');
  assert.equal(ball.gapBonus, 440);
  stepUntil(g, 'merge', 400);
  assert.equal(ofKind(g, 'destroy').length, 0, 'two c0 only: no match at the contact');
  assert.equal(g.streak, 0, 'chain reset at the contact');
  assert.equal(ball.gapBonus, undefined, 'bonus cleared at the contact');
});
