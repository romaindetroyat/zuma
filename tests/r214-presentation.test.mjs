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
import { pickFormat, loopLevels, WARNING_DISTANCE } from '../.compiled/audio.js';
import { soundCues } from '../.compiled/feedback.js';

test('pickFormat picks the first format canPlayType accepts', () => {
  const safari = mime => (mime.startsWith('audio/mp4') ? 'maybe' : '');
  const chrome = mime => (mime.startsWith('audio/ogg') ? 'probably' : 'maybe');
  assert.equal(pickFormat(['ogg', 'm4a'], safari), 'm4a', 'Safari: no Vorbis, AAC in MP4');
  assert.equal(pickFormat(['ogg', 'm4a'], chrome), 'ogg', 'Chrome/Firefox: first accepted format wins');
  assert.equal(pickFormat(['ogg'], () => ''), null, 'nothing playable → null');
  assert.equal(pickFormat(['flac', 'ogg'], chrome), 'ogg', 'unknown formats are ignored');
});

test('loopLevels: rolling follows the chain speed, warning the distance to the skull', () => {
  const base = { speed: 0, feedSpeed: 360, headDistance: 400, playing: true };
  assert.deepEqual(loopLevels(base), { rolling: 0, warning: 0 });
  assert.equal(loopLevels({ ...base, speed: 360 }).rolling, 1, 'full gain at feedSpeed');
  assert.equal(loopLevels({ ...base, speed: 900 }).rolling, 1, 'clamped above feedSpeed');
  assert.equal(loopLevels({ ...base, speed: 180 }).rolling, 0.5, 'proportional below');
  assert.equal(loopLevels({ ...base, speed: 180, feedSpeed: 0 }).rolling, 0, 'feedSpeed <= 0 → silent');
  assert.equal(loopLevels({ ...base, speed: 180, playing: false }).rolling, 0, 'no rolling when not playing');
  assert.equal(loopLevels({ ...base, headDistance: 100 }).warning, 1, 'head within 160 px of the skull');
  assert.equal(loopLevels({ ...base, headDistance: 160 }).warning, 0, 'threshold is exclusive');
  assert.equal(loopLevels({ ...base, headDistance: 100, playing: false }).warning, 0, 'cut while draining/paused');
  assert.equal(loopLevels({ ...base, headDistance: null }).warning, 0, 'no ball → no warning');
  assert.equal(WARNING_DISTANCE, 160);
});

test('gap keeps its original cue and recoil adds none (D-09)', () => {
  assert.equal(soundCues({ tick: 1, kind: 'gap', count: 1 })[0].key, 'gap');
  assert.deepEqual(soundCues({ tick: 1, kind: 'power-activate', power: 'backwards' }).map(c => c.key), ['powerback']);
});
