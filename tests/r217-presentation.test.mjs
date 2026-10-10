// R2.0.17 — présentation : textes et sons du score, STATS D-20, compte à rebours D-21, roulement, netteté D-19 (plan 05-08)
// Libellés originaux (« +N » couleur de la bille, COMBO x, BONUS … SAUT sans montant, ENCHAÎNEMENT x), `gapbonus1`
// différé de 0 / 150 / 300 ms, grille du STATS, formateur unique, astuce sur deux lignes, décompte borné avec
// mode rapide, rampe du roulement armée une fois par cible, filtre pixel-art 2 × et composition à l'échelle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundCues, ballCss, PARTICLE_RGB } from '../.compiled/feedback.js';
import { clampDelay } from '../.compiled/audio.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);
const read = file => fs.readFileSync(file, 'utf8');
/** Body of a `case '<kind>'` block of the compiled handleEvents, up to the next `case '`. */
const caseBlock = (src, kind) => {
  const start = src.indexOf(`case '${kind}'`);
  assert.ok(start > 0, `case '${kind}' compiled`);
  const end = src.indexOf("case '", start + 8);
  return src.slice(start, end > 0 ? end : undefined);
};

// ---------------------------------------------------------------- sons du score (recherche 02 Q1–Q2)

test('cues: gapbonus1 once per gap up to three, at 0 / 150 / 300 ms (15 / 30 maj) and 0 / +2 / +3 semitones', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'gap', count: 1 }), [{ key: 'gap', gain: 1, rate: 1, delay: 0 }]);
  const two = soundCues({ tick: 1, kind: 'gap', count: 2 });
  assert.equal(two.length, 2);
  near(two[1].rate, Math.pow(2, 2 / 12), 1e-12, '+2 semitones');
  assert.equal(two[1].delay, 0.15, '15 maj = 150 ms');
  assert.equal(two[1].key, 'gap');
  const three = soundCues({ tick: 1, kind: 'gap', count: 3 });
  assert.equal(three.length, 3);
  near(three[2].rate, Math.pow(2, 3 / 12), 1e-12, '+3 semitones');
  assert.equal(three[2].delay, 0.3, '30 maj = 300 ms');
  assert.deepEqual(three.map(c => c.delay), [0, 0.15, 0.3]);
  assert.equal(soundCues({ tick: 1, kind: 'gap', count: 7 }).length, 3, 'never more than three');
  assert.ok(three[0].rate < three[1].rate && three[1].rate < three[2].rate, 'rising pitch (r213 lock)');
  for (const c of three) assert.equal(c.gain, 1);
});

test('cues: chain1 at chain − 5 semitones from the 5th hit; BALLDESTROYED1..5 by combo with chime1 at 2 × combo semitones and 0.4 + 0.2 × combo', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'streak', streak: 5, points: 100 }), [{ key: 'streak', gain: 1, rate: 1 }]);
  near(soundCues({ tick: 1, kind: 'streak', streak: 7 })[0].rate, Math.pow(2, 2 / 12), 1e-12, 'chain 7 → +2');
  assert.equal(soundCues({ tick: 1, kind: 'streak', streak: 4 })[0].rate, 1, 'bounded at 5');
  assert.deepEqual(soundCues({ tick: 1, kind: 'destroy', depth: 1 }), [{ key: 'destroy1', gain: 1, rate: 1 }, { key: 'combo', gain: 0.4, rate: 1 }]);
  const d3 = soundCues({ tick: 1, kind: 'destroy', depth: 3 });
  assert.equal(d3[0].key, 'destroy3');
  near(d3[1].gain, 0.8, 1e-12, 'combo 2 → 0.4 + 0.4');
  near(d3[1].rate, Math.pow(2, 4 / 12), 1e-12, 'combo 2 → +4 semitones');
  const d6 = soundCues({ tick: 1, kind: 'destroy', depth: 6 });
  assert.equal(d6[0].key, 'destroy5');
  assert.equal(d6[1].gain, 1, 'volume capped at 1');
});

test('audio.play honours SoundCue.delay, clamped to 0..1 s (T-05-24)', () => {
  assert.equal(clampDelay(undefined), 0);
  assert.equal(clampDelay(NaN), 0);
  assert.equal(clampDelay(-1), 0);
  assert.equal(clampDelay(2), 1);
  assert.equal(clampDelay(0.15), 0.15);
  const audio = read('.compiled/audio.js');
  const start = audio.indexOf('play(cue)');
  assert.ok(start > 0, 'AudioManager.play compiled');
  const body = audio.slice(start, audio.indexOf('setLoop(key, level)', start));
  assert.match(body, /cue\.delay/, 'play reads the delay');
  assert.match(body, /start\(now \+ delay\)/, 'the buffer source starts at now + delay');
  assert.match(body, /clampDelay\(/, 'delay clamped');
});

// ---------------------------------------------------------------- textes flottants (recherche 02 Q1–Q2)

test('ballCss: the « +N » takes the colour of the ball (PARTICLE_RGB), white outside the table', () => {
  assert.equal(ballCss(0), '#1980ff');
  assert.equal(ballCss(1), '#ffff00');
  assert.equal(ballCss(2), '#ff0000');
  assert.equal(ballCss(5), '#ffffff');
  assert.equal(ballCss(9), '#ffffff');
  assert.equal(ballCss(-1), '#ffffff');
  assert.equal(ballCss(NaN), '#ffffff');
  for (let c = 0; c < PARTICLE_RGB.length; c++) assert.equal(ballCss(c), '#' + PARTICLE_RGB[c].toString(16).padStart(6, '0'));
});

test('main.js: « +N » in the ball colour, COMBO x{depth} on a reaction, BONUS … SAUT without amount, ENCHAÎNEMENT x{chain} — pack strings first', () => {
  const main = read('.compiled/main.js');
  const destroy = caseBlock(main, 'destroy');
  assert.doesNotMatch(destroy, /ENCHAÎNEMENT/, 'the reaction is a COMBO, not a chain');
  assert.match(destroy, /this\.strings\?\.COMBO \?\? 'COMBO'/, 'COMBO from strings.json');
  assert.match(destroy, /x\$\{depth\}/, 'COMBO x{depth}');
  assert.match(destroy, /ballCss\(/, '« +N » in the ball colour');
  assert.match(destroy, /\+\$\{e\.points\}/, 'the amount is the match total');
  const gap = caseBlock(main, 'gap');
  assert.match(gap, /GAP_BONUS/);
  assert.match(gap, /DOUBLE_GAP_BONUS/);
  assert.match(gap, /TRIPLE_GAP_BONUS/);
  assert.doesNotMatch(gap, /\+\$\{/, 'no amount in the gap text (it is in the « +N »)');
  assert.match(gap, /BONUS SAUT/, 'fallback without the pack');
  const streak = caseBlock(main, 'streak');
  assert.match(streak, /CHAIN_BONUS/);
  assert.match(streak, /x\$\{/, 'ENCHAÎNEMENT x{chain}');
  assert.doesNotMatch(streak, /COMBO/, 'consecutive hits are a chain, not a combo');
});
