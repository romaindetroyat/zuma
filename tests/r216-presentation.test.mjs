// R2.0.16 — présentation : alerte, roulement, ZUMA, décompte, STATS (plan 05-06)
// Alerte `warning1` à 600 px avec l'intervalle original et un gain constant (U15, §5) ; roulement binaire
// à gain constant avec fondu (U18, D-17) ; bannière ZUMA (U20, D-16) ; décompte « +100 » + étincelles + pops
// indépendants (U16, §7) ; compte à rebours du bonus de temps dans l'écran STATS (U17, §8) ; couleurs, titre
// doré, interligne et valeurs des STATS épinglées de bout en bout (U19, D-18) ; TEMPS depuis « PARTEZ » (D-13).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as audio from '../.compiled/audio.js';

const { WARNING_DISTANCE, WARNING_GAIN, warningLevel, warningIntervalAt, warningInterval, warningGain, loopLevels, ROLLING_GAIN, ROLLING_MIN_SPEED, ROLLING_FADE_SECONDS } = audio;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);

// ---------------------------------------------------------------- alerte (U15, §5)

test('warningLevel: 0 at 600 px (the original `danger` setting), 1 at the skull, cut while draining', () => {
  assert.equal(WARNING_DISTANCE, 600);
  assert.equal(warningLevel(600, true), 0, 'threshold');
  assert.equal(warningLevel(0, true), 1, 'at the skull');
  assert.equal(warningLevel(300, true), 0.5, 'half-way');
  assert.equal(warningLevel(10, false), 0, 'cut while draining / paused');
  assert.equal(warningLevel(null, true), 0, 'no ball → no warning');
});

test('warningIntervalAt: max(0.1 + 4·rem/600, (rem/11 + 60)/100) s — 4.1 s at 600 px, 0.6 s at the skull, monotone', () => {
  assert.equal(warningIntervalAt(600), 4.1);
  assert.equal(warningIntervalAt(300), 2.1);
  near(warningIntervalAt(100), 0.1 + 4 * 100 / 600, 1e-9, '100 px');
  near(warningIntervalAt(100), 0.7667, 5e-5, '≈ 0.7667 s');
  near(warningIntervalAt(50), (50 / 11 + 60) / 100, 1e-9, 'the trail light term wins near the skull');
  near(warningIntervalAt(50), 0.6455, 5e-5, '≈ 0.6455 s');
  assert.equal(warningIntervalAt(0), 0.6);
  assert.equal(warningIntervalAt(-20), 0.6, 'clamped past the skull');
  assert.equal(warningIntervalAt(900), 4.1, 'clamped at WARNING_DISTANCE');
  assert.equal(warningIntervalAt(NaN), 0.6, 'non-finite → skull');
  let previous = Infinity;
  for (let rem = 0; rem <= 600; rem += 10) {
    const v = warningIntervalAt(rem);
    assert.ok(v <= previous + 1e-12, `non-increasing in rem (${rem} px: ${v} > ${previous})`);
    assert.ok(v >= 0.6 && v <= 4.1, 'within [0.6, 4.1]');
    previous = v;
  }
  assert.equal(warningInterval(0), 4.1, 'level 0 = entering the zone');
  assert.equal(warningInterval(1), 0.6, 'level 1 = at the skull');
  assert.equal(warningInterval(0.5), 2.1);
});

test('warningGain is constant (the original does not modulate the volume); FAR / NEAR constants are gone', () => {
  assert.equal(WARNING_GAIN, 1);
  assert.equal(warningGain(0), 1);
  assert.equal(warningGain(1), 1);
  assert.equal(warningGain(), 1);
  for (const name of ['WARNING_GAIN_FAR', 'WARNING_GAIN_NEAR', 'WARNING_INTERVAL_FAR', 'WARNING_INTERVAL_NEAR']) {
    assert.equal(audio[name], undefined, `${name} no longer exported`);
  }
});

// ---------------------------------------------------------------- roulement (U18, D-17)

test('loopLevels: rolling is binary — on above ROLLING_MIN_SPEED while playing, off otherwise', () => {
  assert.equal(ROLLING_GAIN, 0.6);
  assert.equal(ROLLING_MIN_SPEED, 2);
  assert.equal(ROLLING_FADE_SECONDS, 0.15);
  assert.equal(loopLevels({ speed: 0, playing: true }).rolling, 0);
  assert.equal(loopLevels({ speed: 2, playing: true }).rolling, 0, 'threshold is exclusive');
  assert.equal(loopLevels({ speed: 2.01, playing: true }).rolling, 1);
  assert.equal(loopLevels({ speed: 900, playing: true }).rolling, 1);
  assert.equal(loopLevels({ speed: 50, playing: false }).rolling, 0, 'silent when not playing');
  assert.equal(loopLevels({ speed: NaN, playing: true }).rolling, 0, 'non-finite → silent');
  assert.deepEqual(Object.keys(loopLevels({ speed: 50, playing: true })), ['rolling']);
});

test('audio.js: setLoop fades with linearRampToValueAtTime / ROLLING_FADE_SECONDS at pitch 1; main.js no longer feeds feedSpeed', () => {
  const src = fs.readFileSync('.compiled/audio.js', 'utf8');
  const start = src.indexOf('setLoop(key, level)');
  assert.ok(start > 0, 'AudioManager.setLoop compiled');
  const end = src.indexOf('pulse(key, level)', start);
  const body = src.slice(start, end);
  assert.match(body, /linearRampToValueAtTime/, 'ramps (attack and fade) are linear');
  assert.match(body, /ROLLING_FADE_SECONDS/, 'fade-out length is the constant');
  assert.match(body, /ROLLING_GAIN/, 'the loop plays at ROLLING_GAIN');
  assert.doesNotMatch(body, /playbackRate\.value =/, 'pitch stays at 1');
  assert.doesNotMatch(src, /LOOP_BASE/, 'LOOP_BASE replaced by ROLLING_GAIN');
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.doesNotMatch(main, /feedSpeed/, 'no feedSpeed in main.js');
  assert.match(main, /loopLevels\(\{ speed: moved \/ seconds, playing \}\)/, 'measured displacement drives the loop');
});
