// R2.0.19 — présentation : sons du power-up, du contact et de l'impact, compteur de vies et barre du haut
// (spike 04, D-32 / D-33 / D-34).
// Aucun son quand une bille devient power-up ; le contact entre deux segments joue `ballclick1` à 0,8 au plus une fois
// toutes les 250 ms, l'impact d'un projectile sur la chaîne `ballclick2` ; la barre du haut montre vies − 1 grenouilles
// (trois au plus, puis une et « xN »), clignotantes 1,5 s après une vie gagnée, et ses éléments sont recalés sur les
// ovales de `Menubar.jpg`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundCues, cueAllowed, CUE_GUARD_MS } from '../.compiled/feedback.js';
import { SOUND_MAP } from '../tools/import-original.mjs';

const read = file => fs.readFileSync(file, 'utf8');
/** Body of a compiled method / function from its signature up to the next line starting at the same indent with `}`. */
const body = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} compiled`);
  const indent = src.slice(src.lastIndexOf('\n', start) + 1, start).match(/^\s*/)[0];
  const end = src.indexOf(`\n${indent}}`, start);
  return src.slice(start, end > 0 ? end : undefined);
};
const ev = (kind, extra = {}) => ({ tick: 1, kind, ...extra });

// ---------------------------------------------------------------- sons (D-32, D-34)

test('power-spawn plays nothing (0x40ae70 → 0x401430 read no SOUND_*); the activation keeps its sound', () => {
  assert.deepEqual(soundCues(ev('power-spawn', { power: 'slow' })), []);
  assert.deepEqual(soundCues(ev('power-activate', { power: 'slow' })), [{ key: 'powerslow', gain: 1, rate: 1 }]);
  assert.deepEqual(soundCues(ev('power-activate', { power: 'bomb' })), [{ key: 'powerbomb', gain: 1, rate: 1 }]);
});

test('contact = merge at 0.8 (BALLCLICK1 volume 0.80), impact = insert at 1, ball-exit silent', () => {
  assert.deepEqual(soundCues(ev('merge', { leftId: 1, rightId: 2, chain: 0 })), [{ key: 'merge', gain: 0.8, rate: 1 }]);
  assert.deepEqual(soundCues(ev('insert', { id: 3 })), [{ key: 'insert', gain: 1, rate: 1 }]);
  assert.deepEqual(soundCues(ev('ball-exit', { chain: 0, id: 4, color: 1 })), []);
});

test('SOUND_MAP: insert → ballclick2 (projectile impact, 0x42203c), merge → ballclick1 (contact, 0x42196b), no powerup; nothing else moves', () => {
  assert.equal(SOUND_MAP.insert, 'ballclick2');
  assert.equal(SOUND_MAP.merge, 'ballclick1');
  assert.equal('powerup' in SOUND_MAP, false);
  // R2.0.18 map without `powerup`, insert / merge swapped.
  const expected = {
    fire: 'fireball1', insert: 'ballclick2', merge: 'ballclick1', swap: 'pop', zuma: 'chant4',
    levelwin: 'chant5', lose: 'chant14', gameover: 'chant8', destroy1: 'ballsdestroyed1',
    destroy2: 'ballsdestroyed2', destroy3: 'ballsdestroyed3', destroy4: 'ballsdestroyed4',
    destroy5: 'ballsdestroyed5', combo: 'chime1', streak: 'chain1', gap: 'gapbonus1',
    powerbomb: 'bombexplode', powerslow: 'slowdown1', powerback: 'reverse1',
    poweraccuracy: 'accuracy3', gamestart: 'chant1', levelup: 'chant2', warning: 'warning1',
    rolling: 'rolling', extralife: 'extralife', bonuspop: 'endoflevelpop1', button: 'button1',
    button2: 'button2', coin: 'coingrab', frogland: 'frogland2', earthquake: 'earthquake',
    lighttrail: 'lighttrail2', trailend: 'chant3', templecomplete: 'chant6', choral: 'choral1', ufo: 'ufo1',
    coinappear: 'jewelappear', coinvanish: 'gemvanishes', pop: 'pop',
  };
  assert.deepEqual({ ...SOUND_MAP }, expected);
});

test('cueAllowed: merge at most once per 250 ms (0x401c70), other keys always, non-finite clock allowed without state', () => {
  assert.deepEqual({ ...CUE_GUARD_MS }, { merge: 250 });
  const m = new Map();
  assert.equal(cueAllowed(m, 'merge', 1000), true);
  assert.equal(cueAllowed(m, 'merge', 1100), false);
  assert.equal(cueAllowed(m, 'merge', 1249), false);
  assert.equal(cueAllowed(m, 'merge', 1250), true);
  assert.equal(cueAllowed(m, 'merge', 1300), false, 'the guard restarts from the last play');
  for (let t = 0; t < 1000; t += 10) assert.equal(cueAllowed(m, 'insert', t), true, 'insert has no guard');
  const n = new Map();
  assert.equal(cueAllowed(n, 'merge', NaN), true);
  assert.equal(n.size, 0, 'nothing recorded for a non-finite clock');
  assert.equal(cueAllowed(n, 'merge', 5), true);
});

test('main.js plays every cue through cueAllowed; audio.js has no powerup fallback', () => {
  const main = read('.compiled/main.js');
  const handle = body(main, 'handleEvents(events, engine) {');
  assert.match(handle, /soundCues\(e\)\)[\s{]*this\.playCue\(cue\)/, 'event cues go through playCue');
  assert.doesNotMatch(handle, /this\.audio\.play\(/, 'no direct play in handleEvents');
  const play = body(main, 'playCue(cue) {');
  const guard = play.indexOf('cueAllowed(');
  assert.ok(guard > 0 && guard < play.indexOf('this.audio.play(cue)'), 'cueAllowed before audio.play');
  assert.match(play, /performance\.now\(\)/);
  const audio = read('.compiled/audio.js');
  assert.doesNotMatch(audio, /\bpowerup\s*:/, 'no powerup synth');
});

test('local pack (when present): insert.ogg is ballclick2, merge.ogg is ballclick1, no powerup in the manifest', { skip: !fs.existsSync('private_assets/pack/sounds/manifest.json') }, () => {
  const pack = 'private_assets/pack/sounds/';
  const original = 'private_assets/original/sounds/';
  if (fs.existsSync(original + 'ballclick2.ogg')) {
    assert.ok(fs.readFileSync(pack + 'insert.ogg').equals(fs.readFileSync(original + 'ballclick2.ogg')), 'insert.ogg = ballclick2.ogg');
    assert.ok(fs.readFileSync(pack + 'merge.ogg').equals(fs.readFileSync(original + 'ballclick1.ogg')), 'merge.ogg = ballclick1.ogg');
  }
  const manifest = JSON.parse(read(pack + 'manifest.json'));
  assert.equal('powerup' in manifest.sounds, false);
});
