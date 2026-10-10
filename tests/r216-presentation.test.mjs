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
  // Shrinks as the chain approaches: non-decreasing in the remaining distance, 0..600 by steps of 10.
  let previous = -Infinity;
  for (let rem = 0; rem <= 600; rem += 10) {
    const v = warningIntervalAt(rem);
    assert.ok(v >= previous - 1e-12, `non-decreasing in rem (${rem} px: ${v} < ${previous})`);
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

// ---------------------------------------------------------------- ZUMA / décompte (U16, U20, D-16, §7)
import { soundCues, makeSparks } from '../.compiled/feedback.js';

test('cues: the tally step is silent, cleanup-pop plays bonuspop at 0.5 without pitch, zuma / won keep chant4 / chant5', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup', progress: 0.5 }), [], 'the « +100 » step makes no sound (0x421550)');
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup-pop', index: 3, progress: 0.4 }), [{ key: 'bonuspop', gain: 0.5, rate: 1 }]);
  assert.deepEqual(soundCues({ tick: 1, kind: 'zuma', coverage: 0.6, pushback: true }), [{ key: 'zuma', gain: 1, rate: 1 }]);
  assert.equal(soundCues({ tick: 1, kind: 'won' })[0].key, 'levelwin');
  assert.deepEqual(soundCues({ tick: 1, kind: 'clearing', x: 0, y: 0, chain: 0, levelBonus: 10000 }), []);
});

test('makeSparks: 5 white sparkles within ± 10 px of the step, deterministic from (step, tick), no Math.random', () => {
  const burst = makeSparks(100, 200, 3, 500);
  assert.equal(burst.particles.length, 5);
  assert.equal(burst.color, 5, 'white');
  assert.equal(burst.start, 500);
  assert.equal(burst.id, 3);
  for (const p of burst.particles) {
    assert.ok(Math.abs(p.x - 100) <= 10, `|x − 100| ≤ 10 (${p.x})`);
    assert.ok(Math.abs(p.y - 200) <= 10, `|y − 200| ≤ 10 (${p.y})`);
    assert.ok(p.size === 1 || p.size === 2, 'size 1 or 2');
    assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy));
  }
  assert.deepEqual(makeSparks(100, 200, 3, 500), burst, 'deterministic');
  assert.notDeepEqual(makeSparks(100, 200, 4, 500).particles, burst.particles, 'another step → other sparkles');
  const src = fs.readFileSync('.compiled/feedback.js', 'utf8');
  const start = src.indexOf('export function makeSparks(');
  assert.ok(start > 0, 'makeSparks compiled');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.doesNotMatch(body, /Math\.random/, 'presentation RNG only (SeededRandom)');
  assert.match(body, /SeededRandom/, 'seeded from step and tick');
});

test('main.js: ZUMA banner, sparkles and « +100 » per tally step, STATS at won, TEMPS from the level clock; render.js pulses the full gauge', () => {
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.match(main, /'ZUMA !'/, 'built-in banner label (strings.json has no ZUMA key)');
  assert.match(main, /makeSparks\(/, 'sparkles pushed into fx.bursts');
  assert.doesNotMatch(main, /Niveau terminé/, 'D-15 message replaced by the STATS count-up');
  assert.doesNotMatch(main, /Bonus de temps/, 'no separate time bonus announcement');
  assert.doesNotMatch(main, /Videz la chaîne/, 'no sub-line under ZUMA !');
  assert.match(main, /Math\.floor\(engine\.levelTicks \/ engine\.config\.tickHz\)/, 'TEMPS = ⌊levelTicks / tickHz⌋ (D-13)');
  assert.doesNotMatch(main, /engine\.tick \/ engine\.config\.tickHz/, 'the raw tick is not the level clock');
  assert.match(main, /engine\.state === 'won' \? 0 :/, 'the STATS open at won without extra delay (the engine already waited 50 updates)');
  assert.match(main, /'#ffff00'/, 'the « +100 » is yellow (0xffff00)');
  const render = fs.readFileSync('.compiled/render.js', 'utf8');
  assert.equal((render.match(/0\.55 \+ 0\.45 \* Math\.sin\(frame \/ 4\)/g) || []).length, 2, 'gauge pulse amplitude ≥ 0.4 in both HUD branches');
});
