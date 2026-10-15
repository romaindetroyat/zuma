// R2.0.27 (candidate) — end-of-track slow zone with a split chain (debug session slowdown-full-chain).
// Static analysis of the executable (scratchpad disassembly, addresses in the debug file):
//  - 0x418780 computes the pusher target from curve+0x68, an integer head written at 0x418a77 by the pusher loop;
//  - that head is the FIRST ball from the rear whose « linked to the next ball » flag (ball+0x30) is clear
//    (0x418a28–0x418a3c), the last ball only when every link is set (0x418a44–0x418a66);
//  - ball+0x30 gates the next / previous neighbours (0x408680, 0x4085e0), is set on contact (0x418a09, 0x40acbd,
//    0x421980, 0x408700) and cleared for the ball behind a removed ball (0x423970 → 0x408760(0) at 0x4239ed):
//    links survive the 40 maj of destruction and break at the removal.
// So the slow zone follows the front of the REAR (pushed) segment: a segment parked near the skull does not slow
// down the segment the pusher pushes. R2.0.26 used the most advanced ball of the whole chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';
import { configFromSettings } from '../.compiled/main.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);
const frog = { x: 320, y: 400 };
// 2000 px straight track: danger line at 1400, slow band [900, 1400], speed 50 px/s, slowfactor 4.
const CONFIG = { ...CANDIDATE, speed: 50, endSlowFactor: 4, dangerDistance: 600, slowDistance: 500, powerChance: 0, target: 99999 };

/** Balls of one segment, rear to front, `n` balls whose front is at `head`; colours cycle from `c0` (never 3 alike). */
const segment = (head, n, c0 = 0) => Array.from({ length: n }, (_, i) => ({ color: (c0 + i) % 3, s: head - 32 * (n - 1 - i) }));

/** Engine on the straight track with `balls` (rear to front), feed over, pusher at `speed` px/s. */
function board(balls, speed) {
  const g = new ZumaEngine(new Track([[0, 240], [2000, 240]]), frog, CONFIG, 7);
  g.feeding = false;
  g.loadFixture({ balls, current: 0, next: 1, stream: false });
  g.step();
  g.chains[0].speed = speed;
  return g;
}

/** Positions of the first `n` balls (the rear segment) after each of `ticks` ticks. */
function rearTrace(g, n, ticks) {
  const out = [];
  for (let t = 0; t < ticks; t++) {
    g.step();
    out.push(g.chains[0].balls.slice(0, n).map(b => b.s));
  }
  return out;
}

test('a segment parked past the danger line does not slow the rear segment down (0x418a28: head = front of the rear linked run)', () => {
  const rear = segment(600, 5);
  const g = board([...rear, ...segment(1800, 5, 1)], 50);
  const h0 = g.chains[0].balls[4].s;
  for (let t = 0; t < 120; t++) g.step();
  near(g.chains[0].speed, 50, 1e-9, 'rear head at 600 (before the band): the target is the cruise speed, not 50 / 4');
  near(g.chains[0].balls[4].s - h0, 100, 1, '2 s at 50 px/s');
  assert.ok(g.chains[0].balls.slice(5).every((b, i) => b.s === segment(1800, 5, 1)[i].s), 'the front segment stays parked');
});

test('the rear segment moves exactly as if the parked front segment did not exist (before the band, in the band)', () => {
  for (const head of [600, 1000, 1200]) {
    const rear = segment(head, 5);
    const split = rearTrace(board([...rear, ...segment(1900, 3, 1)], 50), 5, 240);
    const alone = rearTrace(board(rear.map(b => ({ ...b })), 50), 5, 240);
    for (let t = 0; t < split.length; t++) {
      for (let i = 0; i < 5; i++) near(split[t][i], alone[t][i], 1e-9, `rear head ${head}, tick ${t + 1}, ball ${i}`);
    }
  }
});

test('exploding balls keep the run linked until their removal, then the rear segment gets its own target (0x4239ed)', () => {
  // 40 balls, front at 1800 (past the danger line), rear at 552; balls 5–7 explode: the rear segment (0–4, front at 680)
  // is before the band once they are removed. Neighbours 4 and 8 have different colours (no attraction).
  const balls = segment(1800, 40);
  const g = board(balls, 12.5);
  const chain = g.chains[0];
  const run = chain.balls.slice(5, 8);
  assert.notEqual(chain.balls[4].color, chain.balls[8].color);
  const due = g.tick + CONFIG.destroyTicks;
  for (const b of run) b.destroyingUntil = due;
  chain.removals.push({ ids: run.map(b => b.id), leftId: chain.balls[4].id, rightId: chain.balls[8].id, shotId: -1, depth: 1, due });
  const during = [];
  while (g.tick < due - 1) { g.step(); during.push(chain.speed); }
  assert.ok(during.every(v => Math.abs(v - 12.5) < 1e-9), `links survive the destruction: the head is still the front at 1800 (${Math.max(...during)})`);
  g.step();
  assert.equal(chain.balls.length, 37, 'removed');
  for (let t = 0; t < 90; t++) g.step();
  near(chain.speed, 50, 1e-9, 'after the removal the rear segment (front at ≈ 685) climbs to the cruise speed at 50 px/s²');
});

test('an unbroken chain still follows its head (one run: the last ball, 0x418a44)', () => {
  const g = board(segment(1380, 8), 50);
  for (let t = 0; t < 600; t++) g.step();
  const head = Math.max(...g.chains[0].balls.map(b => b.s));
  assert.ok(head > 1400, 'reached the danger line');
  assert.ok(g.chains[0].speed <= 12.5 + 1e-9, `÷ 4 past the danger line (${g.chains[0].speed})`);
});

// ---------------------------------------------------------------------------- real curves (private pack)

const PACK_DIR = new URL('../private_assets/pack/', import.meta.url);
const HAS_PACK = fs.existsSync(new URL('pack.json', PACK_DIR));
const pack = HAS_PACK ? JSON.parse(fs.readFileSync(new URL('pack.json', PACK_DIR), 'utf8')) : null;

test('pack boards: a split chain near the skull — rear segment speed and rejoin time match the original rule', { skip: !HAS_PACK }, () => {
  for (const label of ['1-1', '12-1']) {
    const [st, lv] = label.split('-').map(Number);
    const stage = pack.stages[st - 1];
    const graphics = pack.graphics[stage.levels[lv - 1]];
    const settings = pack.settings[stage.settings[lv - 1]];
    const points = JSON.parse(fs.readFileSync(new URL(graphics.curveFiles[0], PACK_DIR), 'utf8')).points;
    const track = new Track(points);
    const cfg = { ...configFromSettings(settings, st - 1, graphics.curveFiles.length), powerChance: 0, target: 1e9 };
    const L = track.length;
    const tracks = graphics.curveFiles.map((f, i) => (i === 0 ? track : new Track(JSON.parse(fs.readFileSync(new URL(f, PACK_DIR), 'utf8')).points)));
    const g = new ZumaEngine(tracks, graphics.frog, cfg, 3);
    g.feeding = false;
    g.loadFixture({ balls: [...segment(L - 1600, 15), ...segment(L - 300, 8, 1)], current: 0, next: 1, stream: false });
    g.step();
    g.chains[0].speed = cfg.speed;
    const chain = g.chains[0];
    const s0 = chain.balls[14].s;
    let join = null;
    for (let t = 1; t <= 60 * 60 && join === null; t++) {
      g.step();
      if (chain.balls[15].s - chain.balls[14].s <= 33) join = t / 60;
    }
    // Original rule, 100 Hz, head = ⌊front of the rear segment⌋ (1 px per point).
    const v = cfg.speed / 100;
    const D = L - cfg.dangerDistance;
    const S = cfg.slowDistance;
    let m = v;
    let pos = s0;
    let model = null;
    for (let k = 1; k <= 100 * 60 && model === null; k++) {
      const h = Math.trunc(pos);
      let target = v;
      if (h >= D - S) target = h >= D ? v / cfg.endSlowFactor : v * (1 - (h - D + S) / S) + ((h - D + S) / S) * (v / cfg.endSlowFactor);
      if (m > target) m -= 0.1;
      if (m < target) m = Math.min(target, m + 0.005);
      pos += m;
      if (L - 300 - 32 * 7 - pos <= 32) model = k / 100;
    }
    assert.ok(join !== null && model !== null, `${label}: both rejoin within 60 s`);
    near(join / model, 1, 0.02, `${label}: rejoin ${join} s vs original rule ${model} s`);
  }
});
