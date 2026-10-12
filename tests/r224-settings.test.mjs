// R2.0.24 (candidate) — audit of the original per-level settings (debug session level-settings-audit).
// Static analysis of the executable (scratchpad disassembly, addresses in the debug file):
//  - a <Settings> element starts from the built-in defaults (0x4293d0 → 0x41aae0 / 0x40b070) and only overrides the
//    attributes it carries (0x40d3e0); no inheritance from the previous element nor from `level1`; a stage level is a
//    copy of its Settings plus the graphics fields (0x42c26a, 0x42c295); duplicated attributes: the last wins (0x4c444a);
//  - `speed` is px (curve points, 1.005 px each) per 100 Hz update; no stage or difficulty scaling in adventure;
//  - adventure colours are min(6, 4 + ⌊stage / 3⌋) whatever the Settings say (0x420021–0x420068);
//  - the pusher loses 0.1 px/maj per update WITHOUT clamping on its target, then climbs back at 0.005 px/maj
//    (0x4188a7–0x4188e6): below a decreasing target (the slow-zone band) it runs a sawtooth under the target.
// The per-level locks read the private pack when present (never committed) and are skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';
import { configFromSettings } from '../.compiled/main.js';

const PACK_DIR = new URL('../private_assets/pack/', import.meta.url);
const PACK_JSON = new URL('pack.json', PACK_DIR);
const HAS_PACK = fs.existsSync(PACK_JSON);
const pack = HAS_PACK ? JSON.parse(fs.readFileSync(PACK_JSON, 'utf8')) : null;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);
const straight = (length = 2000) => new Track([[0, 240], [length, 240]]);
const frog = { x: 320, y: 400 };

/** Built-in per-curve and level defaults of the executable (0x40b070, 0x41aae0) for the attributes adventure uses. */
const DEFAULTS = { speed: 0.5, start: 40, repeat: 40, single: 10, slowfactor: 4, slowspeed: 0, danger: 600, slowdistance: 500, score: 1000, zumaback: 300, zumaslow: 1100, firespeed: 6, partime: 0 };
/** The original's resolution of one Settings element: defaults, then the element's own attributes (nothing else). */
const resolve = settings => ({ ...DEFAULTS, ...settings });
/** Adventure colours (0x420021–0x420068): 4 + ⌊stage / 3⌋, at most 6, stage 0-based. */
const adventureColors = stage => Math.min(6, 4 + Math.floor(stage / 3));
const defaultParTime = (score, curves) => Math.ceil(((score * 35) / 1000) * (curves > 1 ? 0.95 * curves : 1) / 5) * 5;

// ------------------------------------------------------------------------------------------- colours (no pack)

test('adventure colours: min(6, 4 + ⌊stage / 3⌋) for every temple, the Settings `colors` attribute is ignored (0x420053)', () => {
  for (let stage = 0; stage < 13; stage++) {
    const expected = adventureColors(stage);
    assert.equal(configFromSettings({ id: 'x' }, stage).colors, expected, `stage ${stage + 1} without colors`);
    for (const colors of [2, 4, 6, 9]) {
      assert.equal(configFromSettings({ id: 'x', colors }, stage).colors, expected, `stage ${stage + 1}, colors="${colors}" overwritten`);
    }
  }
});

test('an absent attribute resolves to the built-in default (0x40b070 / 0x41aae0), never to another Settings element', () => {
  const c = configFromSettings({ id: 'lvl13' }, 0);
  assert.equal(c.speed, 50, 'speed 0.5 px/maj');
  assert.equal(c.startFraction, 0.4, 'start 40 %');
  assert.equal(c.repeatChance, 0.41, 'repeat 40 → (40 + 1) / 100, not the 50 of level1 / lvl11');
  assert.equal(c.singleLimit, 10, 'single 10 = off');
  assert.equal(c.endSlowFactor, 4, 'slowfactor 4.0');
  assert.equal(c.target, 1000);
  assert.equal(c.zumaBackTicks, 180, 'zumaback 300 maj');
  assert.equal(c.zumaSlowTicks, 660, 'zumaslow 1100 maj');
  assert.equal(c.dangerDistance, 600);
  assert.equal(c.slowDistance, 500);
  near(c.projectileSpeed, 10, 1e-9, 'firespeed 6 px/maj = 10 px/tick');
});

// --------------------------------------------------------------------------- pusher kinematics (no pack)

/** One ball cruising on a 2000 px track, slow zone off unless `extra` says otherwise. */
const pusher = (extra = {}, s = 300) => {
  const g = new ZumaEngine(straight(), frog, { ...CANDIDATE, speed: 15, powerChance: 0, target: 99999, endSlowFactor: 1, ...extra }, 7);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s }], current: 0, next: 1, stream: false });
  g.step();
  return g;
};

test('pusher above its target: −0.1 px/maj per update without clamping, then +0.005 px/maj back to it (0x4188a7–0x4188e6)', () => {
  const g = pusher();
  g.chains[0].speed = 50;
  const seen = [];
  for (let i = 0; i < 60; i++) { g.step(); seen.push(g.chains[0].speed); }
  const min = Math.min(...seen);
  near(min, 10.5, 1e-9, '50 → 40 → 30 → 20 → 10 (below 15), then +0.5 in the same update');
  assert.ok(seen.every(v => v >= 10.5 - 1e-9), 'never more than one step under the target');
  assert.equal(seen[seen.length - 1], 15, 'back on the target, clamped from below');
  const climb = seen.findIndex(v => v === 15) - seen.indexOf(min);
  assert.ok(climb >= 4 && climb <= 6, `9 updates (≈ 5.4 ticks) at +0.5 px/s from 10.5 to 15 (${climb} ticks)`);
});

test('the fast feed still lands exactly on the cruise speed: V − v is a whole number of 0.1 px/maj steps', () => {
  const g = pusher({ speed: 50 });
  g.chains[0].speed = 1520; // 1-1: 15.2 px/maj
  const seen = [];
  for (let i = 0; i < 120; i++) { g.step(); seen.push(g.chains[0].speed); }
  assert.ok(Math.min(...seen) >= 50 - 1e-6, `no dip under 50 px/s (${Math.min(...seen)})`);
  assert.equal(seen[seen.length - 1], 50);
  const reached = seen.findIndex(v => Math.abs(v - 50) < 1e-6);
  assert.ok(reached >= 87 && reached <= 89, `147 updates ≈ 88.2 ticks (${reached + 1})`);
});

/**
 * Independent 100 Hz model of the original pusher on a straight track (positions in px, 1 px per point):
 * 0x418780 target with the slow-zone interpolation on the head, 0x4188a7–0x4188e6 update, then head += m.
 */
function modelHead({ speed, slowfactor, head, m, length, majs }) {
  const v = speed / 100;
  const dangerStart = length - 600;
  const zoneStart = dangerStart - 500;
  let mm = m / 100;
  for (let k = 0; k < majs; k++) {
    let target = v;
    if (head >= zoneStart) {
      if (head < dangerStart) {
        const f = (head - zoneStart) / 500;
        target = v * (1 - f) + (f * v) / slowfactor;
      } else target = v / slowfactor;
    }
    if (mm > target) mm -= 0.1;
    if (mm < target) mm = Math.min(target, mm + 0.005);
    head += mm;
  }
  return head;
}

test('slow-zone band: the chain runs the original sawtooth under the decreasing target (10 s at 50 px/s, slowfactor 4)', () => {
  const g = pusher({ speed: 50, endSlowFactor: 4 }, 880);
  g.chains[0].speed = 50;
  const h0 = Math.max(...g.balls.map(b => b.s));
  for (let i = 0; i < 600; i++) g.step();
  const travelled = Math.max(...g.balls.map(b => b.s)) - h0;
  const model = modelHead({ speed: 50, slowfactor: 4, head: h0, m: 50, length: 2000, majs: 1000 }) - h0;
  near(travelled, model, 3, 'engine vs 100 Hz model (px)');
  const clamped = (() => { // the R2.0.23 rule: the speed follows the target exactly
    let head = h0;
    for (let k = 0; k < 1000; k++) head += (50 / 100) * (head < 900 ? 1 : 1 - ((Math.min(head, 1400) - 900) / 500) * 0.75);
    return head - h0;
  })();
  assert.ok(travelled < clamped - 25, `slower than a chain glued to its target (${travelled.toFixed(1)} vs ${clamped.toFixed(1)} px)`);
});

// ---------------------------------------------------------------------------- per-level locks (private pack)

/** Every adventure board of the pack: label, stage, level, Settings id and attributes, curves (Track + point count). */
function packBoards() {
  const boards = [];
  pack.stages.forEach((st, stage) => st.levels.forEach((graphicsId, level) => {
    const graphics = pack.graphics[graphicsId];
    const id = st.settings[level];
    const curves = graphics.curveFiles.map(f => JSON.parse(fs.readFileSync(new URL(f, PACK_DIR), 'utf8')).points);
    boards.push({ label: `${stage + 1}-${level + 1}`, stage, level, id, settings: pack.settings[id], graphics, curves });
  }));
  return boards;
}

test('every adventure board: StageProgression `stageN` / `diffiN` → lvlNM, resolved like the original (defaults + own attributes)', { skip: !HAS_PACK }, () => {
  const boards = packBoards();
  assert.equal(pack.stages.length, 13, '13 stages');
  for (const b of boards) {
    assert.equal(b.id, `lvl${b.stage + 1}${b.level + 1}`, `${b.label} uses its own lvlNM`);
    const r = resolve(b.settings);
    const c = configFromSettings(b.settings, b.stage, b.curves.length);
    near(c.speed, r.speed * 100, 1e-9, `${b.label} speed px/s`);
    near(c.startFraction, r.start / 100, 1e-12, `${b.label} start`);
    near(c.endSlowFactor, r.slowspeed > 0 ? r.speed / r.slowspeed : r.slowfactor, 1e-12, `${b.label} slowfactor`);
    near(c.repeatChance, (r.repeat + 1) / 100, 1e-12, `${b.label} repeat`);
    assert.equal(c.singleLimit, r.single, `${b.label} single`);
    assert.equal(c.target, r.score, `${b.label} score`);
    assert.equal(c.parTime, r.partime > 0 ? r.partime : defaultParTime(r.score, b.curves.length), `${b.label} partime`);
    assert.equal(c.zumaBackTicks, Math.round(r.zumaback * 0.6), `${b.label} zumaback`);
    assert.equal(c.zumaSlowTicks, Math.round(r.zumaslow * 0.6), `${b.label} zumaslow`);
    assert.equal(c.dangerDistance, r.danger, `${b.label} danger`);
    assert.equal(c.slowDistance, r.slowdistance, `${b.label} slowdistance`);
    near(c.projectileSpeed, (r.firespeed * 100) / 60, 1e-9, `${b.label} firespeed`);
    assert.equal(c.colors, adventureColors(b.stage), `${b.label} colours`);
  }
  // lvl11 / lvl12 carry `repeat` twice (40 then 50): the importer keeps the last one, as the XML parser (0x4c444a).
  assert.equal(pack.settings.lvl11.repeat, 50);
  assert.equal(pack.settings.lvl12.repeat, 50);
});

/**
 * Independent 100 Hz model of a whole level without shooting, in curve points (0x4181ab: head 0 → 0x405060 burst
 * V = v + 0.1 × ⌊18 + 0.5 (√((v + 20)² + 80 d) − (v + 20))⌋, d = ⌊points × start / 100⌋; then 0x418780 per update).
 * Returns GO (every curve within 0.1 px/maj of v) and the first curve's head reaching its last point, in seconds.
 */
function modelLevel(r, curves) {
  const runs = curves.map(points => {
    const nb = points.length;
    const v = r.speed;
    const a = v + 20;
    const d0 = Math.trunc((nb * r.start) / 100);
    let m = v + 0.1 * Math.trunc(18 + 0.5 * (Math.sqrt(a * a + 80 * d0) - a));
    let head = 0;
    let go = null;
    let t = 0;
    const dangerStart = nb - r.danger;
    const zoneStart = dangerStart - r.slowdistance;
    while (head < nb && t < 100 * 900) {
      t++;
      let target = v;
      if (head >= zoneStart) {
        const f = (head - zoneStart) / r.slowdistance;
        target = head < dangerStart ? v * (1 - f) + (f * v) / r.slowfactor : v / r.slowfactor;
      }
      if (m > target) m -= 0.1;
      if (m < target) m = Math.min(target, m + 0.005);
      head += m;
      if (go === null && m - v <= 0.1) go = t;
    }
    return { go: go / 100, skull: t / 100 };
  });
  return { go: Math.max(...runs.map(x => x.go)), skull: Math.min(...runs.map(x => x.skull)) };
}

/** The engine on board `b` without shooting: GO and the first chain reaching the skull, in seconds. */
function engineLevel(b) {
  const tracks = b.curves.map(p => new Track(p));
  const g = new ZumaEngine(tracks, b.graphics.frog, { ...configFromSettings(b.settings, b.stage, tracks.length), lives: 3 }, 12345);
  const hz = g.config.tickHz;
  let go = null;
  for (let t = 1; t <= hz * 600; t++) {
    g.step();
    if (go === null && !g.feeding) go = t / hz;
    if (g.state !== 'playing') return { go, skull: t / hz, cruise: g.config.speed };
  }
  return { go, skull: Infinity, cruise: g.config.speed };
}

const REPRESENTATIVE = ['1-1', '2-5', '3-5', '6-4', '9-7', '12-1', '12-5', '12-7', '13-1'];

test('representative levels: GO and time to the skull without shooting match the 100 Hz model of the original', { skip: !HAS_PACK }, () => {
  const boards = new Map(packBoards().map(b => [b.label, b]));
  for (const label of REPRESENTATIVE) {
    const b = boards.get(label);
    assert.ok(b, `${label} exists`);
    const model = modelLevel(resolve(b.settings), b.curves);
    const engine = engineLevel(b);
    near(engine.go, model.go, 0.05, `${label} GO (s)`);
    near(engine.skull / model.skull, 1, 0.02, `${label} time to the skull ${engine.skull} s vs ${model.skull} s`);
  }
});

test('every adventure board: time to the skull within 3 % of the 100 Hz model', { skip: !HAS_PACK }, () => {
  const off = [];
  for (const b of packBoards()) {
    const model = modelLevel(resolve(b.settings), b.curves);
    const engine = engineLevel(b);
    if (Math.abs(engine.skull / model.skull - 1) > 0.03) off.push(`${b.label} ${engine.skull.toFixed(1)} s vs ${model.skull.toFixed(1)} s`);
  }
  assert.deepEqual(off, [], 'boards off by more than 3 %');
});
