// R2.0.14 — présentation et audio (plan 04-03) : insertion interpolée, offsets de la grenouille
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertionPose } from '../.compiled/feedback.js';
import { readFileSync } from 'node:fs';
import { FROG_FRONT, FROG_BACK, pitCoverFrame } from '../.compiled/render.js';

const from = { x: 100, y: 300 };
const to = { x: 220, y: 180 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('insertionPose starts at the landing point and ends on the track', () => {
  assert.deepEqual(insertionPose(0, from, to), { x: from.x, y: from.y, scale: 1 });
  assert.deepEqual(insertionPose(1, from, to), { x: to.x, y: to.y, scale: 1 });
  // Out-of-range widths are clamped.
  assert.deepEqual(insertionPose(-0.5, from, to), { x: from.x, y: from.y, scale: 1 });
  assert.deepEqual(insertionPose(1.5, from, to), { x: to.x, y: to.y, scale: 1 });
});

test('insertionPose closes in on the track monotonically with a slight swell', () => {
  let previous = Infinity;
  for (let i = 0; i <= 20; i++) {
    const pose = insertionPose(i / 20, from, to);
    const d = dist(pose, to);
    assert.ok(d <= previous + 1e-9, `distance to the slot decreases (w=${i / 20}: ${d} > ${previous})`);
    assert.ok(pose.scale >= 1 && pose.scale <= 1.15, `scale stays within 1..1.15 (w=${i / 20}: ${pose.scale})`);
    previous = d;
  }
  assert.ok(insertionPose(0.5, from, to).scale > 1, 'the ball swells mid-way');
  // Ease-out: more than half the distance is covered in the first half of the growth.
  assert.ok(dist(insertionPose(0.5, from, to), to) < dist(from, to) / 2, 'ease-out curve');
});

test('frog offsets measured on SMALLFROGonPAD are exported by the renderer', () => {
  assert.equal(FROG_FRONT, 24, 'mouth: 24 px ahead of the sprite centre');
  assert.equal(FROG_BACK, 26, 'hatch: 26 px behind the sprite centre');
});

// ---------------------------------------------------------------- audio (D-06, D-08, D-09)
import { pickFormat, loopLevels, warningLevel, warningInterval, warningGain, WARNING_DISTANCE, WARNING_GAIN, ROLLING_GAIN } from '../.compiled/audio.js';
import { soundCues } from '../.compiled/feedback.js';

test('pickFormat picks the first format canPlayType accepts', () => {
  const safari = mime => (mime.startsWith('audio/mp4') ? 'maybe' : '');
  const chrome = mime => (mime.startsWith('audio/ogg') ? 'probably' : 'maybe');
  assert.equal(pickFormat(['ogg', 'm4a'], safari), 'm4a', 'Safari: no Vorbis, AAC in MP4');
  assert.equal(pickFormat(['ogg', 'm4a'], chrome), 'ogg', 'Chrome/Firefox: first accepted format wins');
  assert.equal(pickFormat(['ogg'], () => ''), null, 'nothing playable → null');
  assert.equal(pickFormat(['flac', 'ogg'], chrome), 'ogg', 'unknown formats are ignored');
});

test('loopLevels: rolling is on whenever the chain moves (the warning is a pulse, not a loop)', () => {
  // R2.0.16 (D-17): binary level at a constant ROLLING_GAIN above 2 px/s instead of a gain proportional to feedSpeed.
  const base = { speed: 0, playing: true };
  assert.deepEqual(loopLevels(base), { rolling: 0 }, 'no warning entry any more');
  assert.equal(loopLevels({ ...base, speed: 360 }).rolling, 1, 'on at cruise speed');
  assert.equal(loopLevels({ ...base, speed: 900 }).rolling, 1, 'on at feed speed');
  assert.equal(loopLevels({ ...base, speed: 1 }).rolling, 0, 'off under 2 px/s (recoil settling, stop)');
  assert.equal(loopLevels({ ...base, speed: 180, playing: false }).rolling, 0, 'no rolling when not playing');
  assert.equal(ROLLING_GAIN, 0.6, 'constant loop gain');
});

// Plan 04-05: the original `warning1` is a 0.37 s hit repeated faster and louder as the head nears the skull.
test('warningLevel: 0 outside WARNING_DISTANCE, 1 at the skull, cut while draining', () => {
  // R2.0.16 (U15, §5): the zone is the original `danger` setting, 600 px (was 220).
  assert.equal(WARNING_DISTANCE, 600);
  assert.equal(warningLevel(1000, true), 0, 'far away');
  assert.equal(warningLevel(600, true), 0, 'threshold');
  assert.equal(warningLevel(300, true), 0.5, 'half-way');
  assert.equal(warningLevel(0, true), 1, 'at the skull');
  assert.equal(warningLevel(-10, true), 1, 'clamped past the skull');
  assert.equal(warningLevel(50, false), 0, 'cut while draining/paused');
  assert.equal(warningLevel(null, true), 0, 'no ball → no warning');
});

test('warningInterval shrinks monotonically from 4.1 s to 0.6 s; warningGain is constant', () => {
  // R2.0.16 (U15, §5): the original delay is 100 + 4000 × rem / danger ms, floored by the trail light
  // (rem / 11 + 60 updates); the volume is not modulated (the 0.35 → 1 ramp was ours). Table in r216-presentation.
  assert.equal(warningInterval(0), 4.1);
  assert.equal(warningInterval(1), 0.6);
  assert.equal(warningInterval(-1), 4.1, 'clamped below');
  assert.equal(warningInterval(2), 0.6, 'clamped above');
  assert.equal(warningInterval(NaN), 4.1, 'NaN treated as 0');
  let previous = Infinity;
  for (let i = 0; i <= 20; i++) {
    const v = warningInterval(i / 20);
    assert.ok(v < previous, `strictly decreasing at level ${i / 20}`);
    assert.ok(v >= 0.6 && v <= 4.1, 'within bounds');
    previous = v;
  }
  assert.equal(WARNING_GAIN, 1);
  assert.equal(warningGain(0), 1);
  assert.equal(warningGain(1), 1);
  assert.equal(warningGain(0.5), 1, 'constant');
});

test('pitCoverFrame: closed lid at threat 0, last frame at the skull, monotone in between', () => {
  assert.equal(pitCoverFrame(0, 12), 0);
  assert.equal(pitCoverFrame(1, 12), 11);
  assert.equal(pitCoverFrame(0.5, 12), 5);
  assert.equal(pitCoverFrame(0.75, 12), 8, 'near → frame ≥ 8');
  assert.equal(pitCoverFrame(-1, 12), 0, 'clamped below');
  assert.equal(pitCoverFrame(2, 12), 11, 'clamped above');
  assert.equal(pitCoverFrame(NaN, 12), 0, 'NaN → closed');
  assert.equal(pitCoverFrame(1, 1), 0, 'single-frame sheet');
  let previous = -1;
  for (let i = 0; i <= 20; i++) {
    const f = pitCoverFrame(i / 20, 12);
    assert.ok(f >= previous, 'non-decreasing');
    previous = f;
  }
});

// Plan 04-05 Task 2b (U11): BackgroundAlpha layers are drawn static — no drift / zoom of the screen on level 1-3.
test('drawOverlays draws the BackgroundAlpha layers at their fixed (x, y), without oscillation', () => {
  const src = readFileSync('.compiled/render.js', 'utf8');
  const start = src.search(/\n\s*drawOverlays\(view\) \{/);
  assert.ok(start > 0, 'Renderer.drawOverlays(view) is compiled (method definition, not the call site)');
  const end = src.indexOf('drawCutouts(', start);
  const body = src.slice(start, end);
  assert.doesNotMatch(body, /Math\.(sin|cos)/, 'no oscillation');
  assert.doesNotMatch(body, /wobble|phase|frame/, 'no time-dependent offset');
  assert.doesNotMatch(body, /\bvx\b|\bvy\b/, 'the (vx, vy) vector is not applied');
  assert.doesNotMatch(body, /scale\(/, 'no scaling');
  assert.match(body, /drawImage\(o\.image, o\.x, o\.y\)/, 'drawn exactly at (x, y)');
});

test('gap keeps its original cue and recoil adds none (D-09)', () => {
  assert.equal(soundCues({ tick: 1, kind: 'gap', count: 1 })[0].key, 'gap');
  assert.deepEqual(soundCues({ tick: 1, kind: 'power-activate', power: 'backwards' }).map(c => c.key), ['powerback']);
});

// ---------------------------------------------------------------- STATS (plan 04-04, D-14; picture mode replaced by the native dialog in 05-03)
import fs from 'node:fs';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';
import { formatSeconds } from '../.compiled/main.js';

const RESULT_IDS = ['result-points', 'result-combo', 'result-coins', 'result-gaps', 'result-chain', 'result-combo-max', 'result-time', 'result-objective', 'result-expert', 'result-record'];

test('index.html carries the R2.0.12 STATS structure with one OK', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  for (const id of RESULT_IDS) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  assert.equal((html.match(/id="result-continue"/g) || []).length, 1);
  for (const cls of ['stats-idol', 'stats-columns', 'stats-left', 'stats-right', 'stats-rule', 'stats-gap', 'stats-tip', 'stats-ok']) assert.match(html, new RegExp(`class="${cls}`), cls);
  const css = fs.readFileSync('public/style.css', 'utf8');
  assert.match(css, /#stats\.stats-original/, 'pack mode lays the values inside the original dialog');
  assert.doesNotMatch(css, /url\(/, 'the picture never comes from the stylesheet');
});

test('Stats.combos counts the destructions caused by a previous destruction (STATS « COMBOS »)', () => {
  const quiet = { ...CANDIDATE, speed: 0, feedSpeed: 0, powerChance: 0, target: 99999 };
  const g = new ZumaEngine(new Track([[0, 240], [640, 240]]), { x: 320, y: 400 }, quiet, 7);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 1, s: 200 }, { color: 1, s: 232 }, { color: 0, s: 264 }, { color: 0, s: 296 }, { color: 1, s: 328 }], current: 0, next: 1, stream: false });
  assert.equal(g.stats.combos, 0);
  g.command({ kind: 'shoot', x: 280, y: 240 });
  for (let i = 0; i < 24; i++) g.step();
  assert.equal(g.stats.matches, 1, 'first destruction (depth 1)');
  assert.equal(g.stats.combos, 0, 'a direct destruction is not a combo');
  for (let i = 0; i < 200; i++) g.step();
  assert.equal(g.stats.maxCombo, 2, 'the neighbours merged into a depth-2 destruction');
  assert.equal(g.stats.combos, 1, 'exactly one combo counted');
});

test('formatSeconds prints « 29 s » under a minute and « 1:42 » beyond', () => {
  assert.equal(formatSeconds(29), '29 s');
  assert.equal(formatSeconds(0), '0 s');
  assert.equal(formatSeconds(102), '1:42');
  assert.equal(formatSeconds(60), '1:00');
  assert.equal(formatSeconds(-3), '0 s');
});
