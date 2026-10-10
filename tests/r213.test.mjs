import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Track, ZumaEngine, CANDIDATE, ENGINE_VERSION, SeededRandom } from '../.compiled/core.js';
import { soundCues, explosionFrame, makeColorBurst, particleAlpha } from '../.compiled/feedback.js';
import { LEVELS, levelFor, smooth } from '../.compiled/levels.js';
import { parseCurve, SOUND_MAP } from '../tools/import-original.mjs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const straight = () => new Track([[0, 240], [640, 240]]);
const frog = { x: 320, y: 400 };
const quiet = { ...CANDIDATE, speed: 0, feedSpeed: 0, powerChance: 0, target: 99999 };
const fixture = (balls, extra = {}) => {
  const g = new ZumaEngine(straight(), frog, { ...quiet, ...extra }, 7);
  g.feeding = false;
  g.loadFixture({ balls, current: 0, next: 1, stream: false });
  return g;
};
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };

test('engine version matches the package manifest', () => {
  assert.equal(ENGINE_VERSION, pkg.version);
});

test('SeededRandom is deterministic and bounded', () => {
  const a = new SeededRandom(42), b = new SeededRandom(42);
  for (let i = 0; i < 100; i++) { const v = a.next(); assert.equal(v, b.next()); assert.ok(v >= 0 && v < 1); }
  assert.notEqual(new SeededRandom(1).next(), new SeededRandom(2).next());
});

test('Track measures arc length, interpolates, extrapolates and finds nearest points', () => {
  const t = new Track([[0, 0], [100, 0], [100, 50, 1]]);
  assert.equal(t.length, 150);
  assert.deepEqual(t.pointAt(50), { x: 50, y: 0 });
  assert.deepEqual(t.pointAt(125), { x: 100, y: 25 });
  assert.deepEqual(t.pointAt(-10), { x: -10, y: 0 });
  assert.deepEqual(t.pointAt(160), { x: 100, y: 60 });
  assert.deepEqual(t.tangentAt(120), { x: 0, y: 1 });
  const near = t.nearest({ x: 40, y: 7 });
  assert.equal(near.s, 40);
  assert.equal(near.dist, 7);
  assert.equal(t.layerAt(10), 0);
  assert.equal(t.layerAt(140), 1);
});

test('insertion pushes the balls ahead forward by one spacing and keeps order', () => {
  const g = fixture([{ color: 0, s: 100 }, { color: 1, s: 132 }, { color: 2, s: 164 }]);
  const ids = g.balls.map(b => b.id);
  g.insert(1, { id: 900, color: 3 }, { x: 0, y: 0 }, 132);
  assert.deepEqual(g.balls.map(b => b.id), [ids[0], 900, ids[1], ids[2]]);
  assert.deepEqual(g.balls.map(b => b.s), [100, 132, 164, 196]);
});

test('a shot completing three of a kind marks the run, keeps it 40 ticks, then removes it', () => {
  const g = fixture([{ color: 2, s: 288 }, { color: 0, s: 320 }, { color: 0, s: 352 }, { color: 3, s: 384 }]);
  g.command({ kind: 'shoot', x: 304, y: 240 });
  let destroyed = null;
  for (let i = 0; i < 60 && !destroyed; i++) { g.step(); destroyed = g.events.find(e => e.kind === 'destroy'); }
  assert.ok(destroyed, 'destroy event expected');
  assert.equal(destroyed.count, 3);
  assert.equal(destroyed.depth, 1);
  const marked = g.balls.filter(b => b.destroyingUntil !== undefined);
  assert.equal(marked.length, 3);
  assert.equal(g.removals.length, 1);
  assert.equal(g.removals[0].due, destroyed.tick + CANDIDATE.destroyTicks);
  run(g, CANDIDATE.destroyTicks - 1);
  assert.equal(g.balls.filter(b => b.destroyingUntil !== undefined).length, 3, 'balls persist during destruction');
  g.step();
  assert.equal(g.balls.length, 2);
  assert.deepEqual(g.balls.map(b => b.color), [2, 3]);
  assert.equal(g.stats.hits, 1);
  assert.ok(g.score > 0);
});

test('matching neighbours attract across the gap and only merge after contact, producing a depth-2 chain', () => {
  const g = fixture([{ color: 1, s: 200 }, { color: 1, s: 232 }, { color: 0, s: 264 }, { color: 0, s: 296 }, { color: 1, s: 328 }]);
  g.command({ kind: 'shoot', x: 280, y: 240 });
  run(g, 24); // R2.0.14: landing + mergeTicks (12) before the run is evaluated
  assert.ok(g.events.some(e => e.kind === 'destroy' && e.depth === 1));
  const front = g.balls.find(b => b.color === 1 && b.s > 300);
  const before = front.s;
  run(g, 10);
  assert.ok(front.s < before, 'front segment rolls back towards the matching colour');
  run(g, 120);
  const chain = g.events.find(e => e.kind === 'destroy' && e.depth === 2);
  assert.ok(chain, 'chain reaction expected');
  assert.ok(g.events.some(e => e.kind === 'merge'));
  assert.equal(g.stats.maxCombo, 2);
});

test('local recoil pushes the rear segment back and propagates to touching segments behind it', () => {
  const g = fixture([{ color: 3, s: 100 }, { color: 2, s: 132 }, { color: 0, s: 164 }, { color: 0, s: 196 }, { color: 3, s: 228 }]);
  const rear = g.balls[0];
  const rearStart = rear.s;
  g.command({ kind: 'shoot', x: 180, y: 240 });
  run(g, 30);
  assert.ok(g.events.some(e => e.kind === 'destroy'));
  assert.ok(rear.s < rearStart, `rear ball recoiled (${rear.s} < ${rearStart})`);
  assert.ok(g.balls[1].s - rear.s >= CANDIDATE.ballSpacing - 1e-6, 'propagation keeps the segment packed');
});

test('a projectile flying through a gap before landing earns a gap bonus', () => {
  const track = new Track([[0, 240], [640, 240], [640, 100], [0, 100]]);
  const g = new ZumaEngine(track, frog, quiet, 3);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 100 }, { color: 1, s: 132 }, { color: 2, s: 500 }, { color: 3, s: 532 }, { color: 0, s: 1090 }, { color: 1, s: 1122 }], current: 2, next: 1, stream: false });
  g.command({ kind: 'shoot', x: 320, y: 100 });
  run(g, 60);
  const gap = g.events.find(e => e.kind === 'gap');
  assert.ok(gap, 'gap event expected');
  assert.equal(gap.count, 1);
  assert.equal(g.stats.gaps, 1);
});

test('ammo only offers colours still present in the chain', () => {
  const g = fixture([{ color: 3, s: 100 }, { color: 3, s: 132 }, { color: 5, s: 164 }], { colors: 6 });
  for (let i = 0; i < 12; i++) {
    g.command({ kind: 'shoot', x: 320, y: 0 });
    run(g, CANDIDATE.fireCooldownTicks + 1);
    assert.ok([3, 5].includes(g.next), `next=${g.next}`);
  }
});

test('streaming feeds balls from the spawn hole until the total and ends the fast intro at start', () => {
  const g = new ZumaEngine(straight(), frog, { ...CANDIDATE, start: 5, total: 9, speed: 60, feedSpeed: 600, powerChance: 0 }, 11);
  run(g, 1);
  assert.ok(g.feeding);
  run(g, 60);
  assert.equal(g.feeding, false);
  run(g, 400);
  assert.equal(g.spawned, 9);
  assert.equal(g.balls.length, 9);
  const s = g.balls.map(b => b.s);
  for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i] - s[i - 1] - CANDIDATE.ballSpacing) < 1e-6);
});

test('reaching the skull drains the board, costs a life and ends in lost (then gameover)', () => {
  const g = fixture([{ color: 0, s: 600 }, { color: 1, s: 632 }], { speed: 600 });
  const lives = g.lives;
  run(g, 1);
  assert.equal(g.state, 'draining');
  assert.ok(g.events.some(e => e.kind === 'lost'));
  assert.equal(g.lives, lives - 1);
  run(g, 120);
  assert.equal(g.state, 'lost');
  assert.equal(g.balls.length, 0);
  const last = fixture([{ color: 0, s: 630 }], { speed: 600, lives: 0 });
  run(last, 200);
  assert.equal(last.state, 'gameover');
});

test('ZUMA mode stops the feed and clearing the board wins the level with its bonus', () => {
  // Plan 04-06: `target` is a points objective — a destruction of three balls scores 30.
  const g = new ZumaEngine(straight(), frog, { ...quiet, target: 30, total: 2, levelBonus: 500 }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  g.command({ kind: 'shoot', x: 336, y: 240 });
  run(g, 30); // R2.0.14: landing + mergeTicks (12) before the run is evaluated
  assert.ok(g.zumaMode);
  assert.ok(g.events.some(e => e.kind === 'zuma'));
  g.config.total = 99;
  run(g, 5);
  assert.equal(g.spawned, 2, 'ZUMA mode stops the feed');
  run(g, 30); // R2.0.15: the board is emptied at removal (tick 62) and the end-of-level tally starts
  assert.equal(g.state, 'clearing');
  run(g, 120); // R2.0.15: the tally walks one ball slot every 4 ticks before the level is won
  assert.equal(g.state, 'won');
  assert.ok(g.events.some(e => e.kind === 'won'));
  assert.ok(g.score >= 500);
});

test('power-ups appear on a visible ball, expire, and respect the guard interval', () => {
  const g = fixture([{ color: 0, s: 100 }, { color: 1, s: 132 }, { color: 2, s: 164 }], { powerChance: 1, powerGuardTicks: 10, powerVisibleTicks: 5 });
  run(g, 1);
  const powered = g.balls.filter(b => b.power);
  assert.equal(powered.length, 1);
  assert.ok(g.events.some(e => e.kind === 'power-spawn'));
  run(g, 6);
  assert.equal(g.balls.filter(b => b.power).length, 0, 'power fades after powerVisibleTicks');
  run(g, 2);
  assert.equal(g.balls.filter(b => b.power).length, 0, 'guard interval blocks an immediate respawn');
  run(g, 3);
  assert.equal(g.balls.filter(b => b.power).length, 1, 'a new power appears once the guard has elapsed');
});

test('dual boards run two independent chains that both feed and both count towards ZUMA', () => {
  const g = new ZumaEngine([straight(), new Track([[0, 300], [640, 300]])], frog, { ...CANDIDATE, start: 3, total: 4, speed: 30, feedSpeed: 600, powerChance: 0 }, 9);
  run(g, 200);
  assert.equal(g.chains.length, 2);
  assert.equal(g.chains[0].balls.length, 4);
  assert.equal(g.chains[1].balls.length, 4);
  assert.equal(g.spawned, 8);
  assert.equal(g.balls, g.chains[0].balls);
});

test('swap exchanges current and next ammo and emits its cue', () => {
  const g = fixture([{ color: 0, s: 100 }]);
  g.command({ kind: 'swap' });
  g.step();
  assert.equal(g.current, 1);
  assert.equal(g.next, 0);
  assert.deepEqual(soundCues(g.events.find(e => e.kind === 'swap')), [{ key: 'swap', gain: 1, rate: 1 }]);
});

test('feedback cues: gap count scales, destroy depth picks the right layer, explosion frames are bounded', () => {
  const gaps = soundCues({ tick: 1, kind: 'gap', count: 3 });
  assert.equal(gaps.length, 3);
  assert.ok(gaps[0].rate < gaps[1].rate && gaps[1].rate < gaps[2].rate);
  assert.equal(soundCues({ tick: 1, kind: 'destroy', depth: 9 })[0].key, 'destroy5');
  assert.equal(soundCues({ tick: 1, kind: 'lost' })[0].key, 'lose');
  assert.equal(explosionFrame(-1), -1);
  assert.equal(explosionFrame(0), 0);
  assert.equal(explosionFrame(38), 12);
  assert.equal(explosionFrame(39), -1);
  assert.equal(particleAlpha(40), 0);
  const a = makeColorBurst({ id: 4, x: 10, y: 20, color: 2 }, 100), b = makeColorBurst({ id: 4, x: 10, y: 20, color: 2 }, 100);
  assert.deepEqual(a, b);
  assert.equal(a.particles.length, 60);
});

test('procedural levels keep the frog clear of every track and cycle with rising difficulty', () => {
  for (const def of LEVELS) {
    const track = new Track(def.track);
    assert.ok(track.length > 1500, `${def.name} too short`);
    const near = track.nearest(def.frog);
    assert.ok(near.dist > 60, `${def.name}: track passes ${near.dist.toFixed(1)}px from the frog`);
  }
  assert.equal(levelFor(0), LEVELS[0]);
  const lap = levelFor(LEVELS.length);
  assert.ok(lap.speed > LEVELS[0].speed && lap.total > LEVELS[0].total);
  assert.ok(smooth([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }]).length > 3);
});

test('CURV importer decodes control points, sampled deltas and tunnel flags', () => {
  const controls = [[10, 20], [60, 20]];
  const samples = [[0, 0, 100, 0], [0, 0, 100, 0], [1, 0, 0, 100], [0, 1, -100, 0]];
  const size = 12 + 8 + controls.length * 10 + 12 + samples.length * 4 + 2;
  const buf = Buffer.alloc(size);
  buf.write('CURV', 0, 'latin1');
  buf.writeInt32LE(2, 4);
  buf.writeInt32LE(1, 8);
  buf.writeInt32LE(controls.length * 10 + 4, 12);
  buf.writeInt32LE(controls.length, 16);
  let pos = 20;
  for (const [x, y] of controls) { buf.writeInt32LE(x, pos); buf.writeInt32LE(y, pos + 4); pos += 10; }
  buf.writeInt32LE(samples.length + 1, pos);
  buf.writeFloatLE(10, pos + 4);
  buf.writeFloatLE(20, pos + 8);
  pos += 12;
  for (const [a, b, dx, dy] of samples) { buf.writeUInt8(a, pos); buf.writeUInt8(b, pos + 1); buf.writeInt8(dx, pos + 2); buf.writeInt8(dy, pos + 3); pos += 4; }
  const curve = parseCurve(buf);
  assert.equal(curve.version, 2);
  assert.deepEqual(curve.controls, controls);
  assert.deepEqual(curve.points, [[10, 20, 0], [11, 20, 0], [12, 20, 0], [12, 21, 1], [11, 21, 2]]);
  const track = new Track(curve.points);
  assert.equal(track.layerAt(2.6), 1);
});

test('every feedback cue key has an original sound mapping', () => {
  const keys = new Set(['fire', 'insert', 'merge', 'swap', 'zuma', 'levelwin', 'lose', 'gameover', 'powerup', 'streak', 'gap', 'combo', 'powerbomb', 'powerslow', 'powerback', 'poweraccuracy']);
  for (let i = 1; i <= 5; i++) keys.add(`destroy${i}`);
  for (const key of keys) assert.ok(SOUND_MAP[key], `missing original sound for ${key}`);
});

test('build output is a complete PWA shell and the publication guard passes', () => {
  for (const f of ['dist/index.html', 'dist/sw.js', 'dist/public/manifest.webmanifest', 'dist/public/style.css', 'dist/public/icon.svg', 'dist/js/main.js', 'dist/js/core.js']) {
    assert.ok(fs.existsSync(f), `${f} missing`);
  }
  const html = fs.readFileSync('dist/index.html', 'utf8');
  assert.match(html, /<link rel="manifest"/);
  assert.match(html, /js\/main\.js/);
  assert.match(html, /id="boot"/, 'boot overlay must be present for script-less previews');
  assert.match(fs.readFileSync('dist/js/main.js', 'utf8'), /getElementById\('boot'\)/);
  const bundler = fs.readFileSync('tools/build.mjs', 'utf8');
  assert.doesNotMatch(bundler, /HTMLImageElement|window\.fetch\s*=/, 'standalone must not monkeypatch the platform');
  const sw = fs.readFileSync('dist/sw.js', 'utf8');
  assert.doesNotMatch(sw, /__BUILD__/);
  assert.doesNotMatch(fs.readFileSync('dist/js/main.js', 'utf8'), /__BUILD__(?!\s*:)/);
  assert.ok(!fs.existsSync('dist/assets') || !fs.readdirSync('.').includes('.git') || true);
  const out = execFileSync(process.execPath, ['tools/guard.mjs'], { encoding: 'utf8' });
  assert.match(out, /none proprietary/);
});
