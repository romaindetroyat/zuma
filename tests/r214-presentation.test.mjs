// R2.0.14 — présentation et audio (plan 04-03) : insertion interpolée, offsets de la grenouille
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertionPose } from '../.compiled/feedback.js';
import { FROG_FRONT, FROG_BACK } from '../.compiled/render.js';

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
import { pickFormat, loopLevels, warningLevel, warningInterval, warningGain, WARNING_DISTANCE, WARNING_INTERVAL_FAR, WARNING_INTERVAL_NEAR } from '../.compiled/audio.js';
import { soundCues } from '../.compiled/feedback.js';

test('pickFormat picks the first format canPlayType accepts', () => {
  const safari = mime => (mime.startsWith('audio/mp4') ? 'maybe' : '');
  const chrome = mime => (mime.startsWith('audio/ogg') ? 'probably' : 'maybe');
  assert.equal(pickFormat(['ogg', 'm4a'], safari), 'm4a', 'Safari: no Vorbis, AAC in MP4');
  assert.equal(pickFormat(['ogg', 'm4a'], chrome), 'ogg', 'Chrome/Firefox: first accepted format wins');
  assert.equal(pickFormat(['ogg'], () => ''), null, 'nothing playable → null');
  assert.equal(pickFormat(['flac', 'ogg'], chrome), 'ogg', 'unknown formats are ignored');
});

test('loopLevels: rolling follows the chain speed (the warning is a pulse, not a loop)', () => {
  const base = { speed: 0, feedSpeed: 360, playing: true };
  assert.deepEqual(loopLevels(base), { rolling: 0 }, 'no warning entry any more');
  assert.equal(loopLevels({ ...base, speed: 360 }).rolling, 1, 'full gain at feedSpeed');
  assert.equal(loopLevels({ ...base, speed: 900 }).rolling, 1, 'clamped above feedSpeed');
  assert.equal(loopLevels({ ...base, speed: 180 }).rolling, 0.5, 'proportional below');
  assert.equal(loopLevels({ ...base, speed: 180, feedSpeed: 0 }).rolling, 0, 'feedSpeed <= 0 → silent');
  assert.equal(loopLevels({ ...base, speed: 180, playing: false }).rolling, 0, 'no rolling when not playing');
});

// Plan 04-05: the original `warning1` is a 0.37 s hit repeated faster and louder as the head nears the skull.
test('warningLevel: 0 outside WARNING_DISTANCE, 1 at the skull, cut while draining', () => {
  assert.equal(WARNING_DISTANCE, 220);
  assert.equal(warningLevel(400, true), 0, 'far away');
  assert.equal(warningLevel(220, true), 0, 'threshold');
  assert.equal(warningLevel(110, true), 0.5, 'half-way');
  assert.equal(warningLevel(0, true), 1, 'at the skull');
  assert.equal(warningLevel(-10, true), 1, 'clamped past the skull');
  assert.equal(warningLevel(50, false), 0, 'cut while draining/paused');
  assert.equal(warningLevel(null, true), 0, 'no ball → no warning');
});

test('warningInterval shrinks monotonically from 1.1 s to 0.22 s; warningGain rises from 0.35 to 1', () => {
  assert.equal(WARNING_INTERVAL_FAR, 1.1);
  assert.equal(WARNING_INTERVAL_NEAR, 0.22);
  assert.equal(warningInterval(0), 1.1);
  assert.equal(warningInterval(1), 0.22);
  assert.equal(warningInterval(-1), 1.1, 'clamped below');
  assert.equal(warningInterval(2), 0.22, 'clamped above');
  assert.equal(warningInterval(NaN), 1.1, 'NaN treated as 0');
  let previous = Infinity;
  for (let i = 0; i <= 20; i++) {
    const v = warningInterval(i / 20);
    assert.ok(v < previous, `strictly decreasing at level ${i / 20}`);
    assert.ok(v >= 0.22 && v <= 1.1, 'within bounds');
    previous = v;
  }
  assert.equal(warningGain(0), 0.35);
  assert.equal(warningGain(1), 1);
  assert.ok(warningGain(0.5) > 0.35 && warningGain(0.5) < 1, 'gain rises with the threat');
  assert.ok(warningGain(0.25) < warningGain(0.75), 'monotone');
});

test('gap keeps its original cue and recoil adds none (D-09)', () => {
  assert.equal(soundCues({ tick: 1, kind: 'gap', count: 1 })[0].key, 'gap');
  assert.deepEqual(soundCues({ tick: 1, kind: 'power-activate', power: 'backwards' }).map(c => c.key), ['powerback']);
});

// ---------------------------------------------------------------- STATS (plan 04-04, D-14)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Track, ZumaEngine, CANDIDATE } from '../.compiled/core.js';
import { formatSeconds } from '../.compiled/main.js';
import { extractStatsImage, importStats, STATS_LAYOUT } from '../tools/import-r212-stats.mjs';

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

// 1×1 transparent PNG (68 bytes) standing for the proprietary picture.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const fakeStandalone = `<html><head><style>.zuma-stats:before{display:none}
.zuma-stats:before{content:"";position:absolute;inset:0;background-image:url(data:image/png;base64,${TINY_PNG});background-size:100% 100%}</style></head><body></body></html>`;

test('import-r212-stats extracts the STATS picture and writes the measured layout', () => {
  assert.equal(extractStatsImage('<style>.zuma-stats:before{display:none}</style>'), null, 'no data URL → null');
  const image = extractStatsImage(fakeStandalone);
  assert.equal(image.mime, 'image/png');
  assert.equal(image.ext, '.png');
  assert.equal(image.buffer.toString('base64'), TINY_PNG, 'the last .zuma-stats:before data URL is decoded as-is');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-stats-'));
  const src = path.join(dir, 'standalone.html');
  fs.writeFileSync(src, fakeStandalone);
  const out = path.join(dir, 'extra');
  const written = importStats(src, out);
  assert.deepEqual(written.size, { width: 1, height: 1 });
  assert.equal(fs.readFileSync(path.join(out, 'stats_bg.png')).toString('base64'), TINY_PNG);
  const layout = JSON.parse(fs.readFileSync(path.join(out, 'stats_layout.json'), 'utf8'));
  assert.deepEqual(Object.keys(layout.slots).sort(), ['bonus', 'chain', 'coins', 'comboMax', 'combos', 'gaps', 'objective', 'points', 'record', 'time']);
  for (const [key, slot] of Object.entries(layout.slots)) {
    for (const r of [slot.box, slot.erase, slot.patch]) for (const v of Object.values(r)) assert.ok(v >= 0 && v <= 1, `${key}: fractions`);
    assert.equal(slot.erase.w, slot.patch.w, `${key}: patch cloned 1:1`);
    assert.equal(slot.erase.h, slot.patch.h, `${key}: patch cloned 1:1`);
    assert.ok(slot.box.x + slot.box.w > slot.erase.x, `${key}: the live value ends on the erased digits`);
    assert.match(slot.color, /^#[0-9a-f]{6}$/);
    assert.ok(slot.fontSize > 0.02 && slot.fontSize < 0.05, `${key}: font size as a fraction of the height`);
  }
  assert.ok(layout.hudStrip.y === 0 && layout.hudStrip.h > 0.08 && layout.hudStrip.h < 0.1, 'HUD strip ≈ 44/480');
  assert.deepEqual(layout, STATS_LAYOUT);
  fs.rmSync(dir, { recursive: true, force: true });
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
