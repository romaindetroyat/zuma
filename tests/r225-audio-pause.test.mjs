// R2.0.25 — son décalé après une pause (signalement de l'utilisateur, Mac et iPhone) : « Quand on met le jeu en pause en
// appuyant sur Menu, et qu'on reprend le jeu, le son est décalé des actions ».
//
// Diagnosis (.planning/debug/sound-lag-after-pause.md): the game schedules every cue at ctx.currentTime and queues
// nothing while paused (checked in Chromium: event → start() < 0.2 ms, same latency before and after an 8 s pause). The
// lag lives in the output pipeline of the long-lived AudioContext: on WebKit (Safari macOS, every iOS browser) Web Audio
// is rendered into a ring buffer read by the GPU process; each render underrun adds one hardware buffer of write-ahead
// that is never given back, and only a new AudioContext starts again at the minimal lead (suspend / resume keeps it).
//
// Locks: resuming from a pause (MENU closed, P, live STATS closed) hands the audio a fresh AudioContext created inside
// the gesture — primed (silent one-sample source) and resumed like the first unlock, master volume and decoded buffers
// carried over, the old context released (loops stopped, closed) — or at the next gesture when the page has no transient
// activation (Escape is not an activation); never throws; and the wiring in the compiled main.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AudioManager, OLD_CONTEXT_RELEASE_MS, hasTransientActivation } from '../.compiled/audio.js';

const param = (value = 1) => ({ value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });

/** EventTarget that counts its live listeners per type. */
class Target extends EventTarget {
  live = new Map();
  addEventListener(type, fn, opts) { this.live.set(type, (this.live.get(type) ?? 0) + 1); super.addEventListener(type, fn, opts); }
  removeEventListener(type, fn, opts) { this.live.set(type, Math.max(0, (this.live.get(type) ?? 0) - 1)); super.removeEventListener(type, fn, opts); }
  count(type) { return this.live.get(type) ?? 0; }
}

/**
 * Fake AudioContext modelling the WebKit output pipeline: `lead` (frames written ahead of what the device plays) only
 * grows (underrun()) and is never reclaimed while the context lives; a source is heard `latencyOf(start)` seconds after
 * its start time.
 */
function fakeEnv({ activation = undefined } = {}) {
  const sources = [];
  const log = [];
  class FakeContext extends EventTarget {
    static instances = [];
    state = 'suspended';
    sampleRate = 48000;
    currentTime = 0;
    baseLatency = 128 / 48000;
    lead = 128;
    closed = false;
    destination = { name: 'destination' };
    constructor() {
      super();
      FakeContext.instances.push(this);
    }
    underrun(frames) { this.lead += frames; }
    get outputDelay() { return this.lead / this.sampleRate; }
    createGain() {
      const node = { gain: param(), connected: [], connect(n) { node.connected.push(n); return n; }, disconnect() { node.connected = []; } };
      return node;
    }
    createBuffer(channels, length, rate) { return { length, numberOfChannels: channels, sampleRate: rate, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const ctx = this;
      const src = {
        buffer: null, loop: false, playbackRate: param(), stopped: false,
        connect: n => n, disconnect() {},
        start(t = 0) { const entry = { ctx, buffer: src.buffer, when: t, loop: src.loop, src }; sources.push(entry); log.push(['start', ctx, src.buffer?.length]); },
        stop() { src.stopped = true; },
      };
      return src;
    }
    createOscillator() { return { type: 'sine', frequency: param(), connect: n => n, start() {}, stop() {} }; }
    resume() {
      log.push(['resume', this]);
      return Promise.resolve().then(() => {
        if (this.closed) return;
        this.state = 'running';
        this.dispatchEvent(new Event('statechange'));
      });
    }
    close() {
      log.push(['close', this]);
      this.closed = true;
      return Promise.resolve().then(() => {
        this.state = 'closed';
        this.dispatchEvent(new Event('statechange'));
      });
    }
  }
  const navigator = { audioSession: { type: 'auto' } };
  if (activation !== undefined) navigator.userActivation = { isActive: activation, hasBeenActive: true };
  const env = { AudioContext: FakeContext, navigator, document: null, window: new Target(), webkit: false };
  return { env, FakeContext, sources, log, navigator };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const FIRE = { length: 4800, numberOfChannels: 1, sampleRate: 48000 };
const ROLLING = { length: 96000, numberOfChannels: 1, sampleRate: 48000 };

/** An AudioManager unlocked on a running fake context, with decoded `fire` and `rolling` pack sounds. */
async function ready(opts) {
  const fake = fakeEnv(opts);
  const audio = new AudioManager('assets/', fake.env);
  audio.unlock();
  await flush();
  fake.FakeContext.instances[0].currentTime = 30; // half a minute of play before the pause
  audio.available.add('fire');
  audio.buffers.set('fire', FIRE);
  audio.buffers.set('rolling', ROLLING);
  return { audio, ...fake };
}

const fire = { key: 'fire', gain: 1, rate: 1 };
/** Seconds between the start of the last source and the moment it is heard. */
const heardLate = sources => sources[sources.length - 1].ctx.outputDelay;

test('a shot after a pause is heard as soon as a shot before it (no latency carried over from the paused context)', async () => {
  const { audio, sources, FakeContext } = await ready();
  audio.play(fire);
  const before = heardLate(sources);
  // The pause: the menu opens (loops cut), the context runs silent; on WebKit the pipeline slips and never recovers.
  audio.stopLoops();
  FakeContext.instances[0].underrun(4096);
  FakeContext.instances[0].underrun(4096);
  audio.resumeAfterPause();
  audio.play(fire);
  assert.equal(heardLate(sources), before, 'same output delay after the pause as before it');
});

test('resumeAfterPause(): fresh context created, primed and resumed inside the call; volume and decoded buffers carried over; old one released', async t => {
  const { audio, sources, log, FakeContext } = await ready();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(r => setImmediate(r));
  audio.setVolume(0.4);
  audio.setLoop('rolling', 1);
  const old = FakeContext.instances[0];
  const rolling = sources.find(s => s.loop).src;
  log.length = 0;
  audio.resumeAfterPause();
  assert.equal(FakeContext.instances.length, 2, 'one new context');
  const fresh = FakeContext.instances[1];
  assert.ok(log.some(e => e[0] === 'start' && e[1] === fresh && e[2] === 1), 'silent one-sample source started on the new context in the gesture');
  assert.ok(log.some(e => e[0] === 'resume' && e[1] === fresh), 'new context resumed in the gesture');
  assert.equal(rolling.stopped, true, 'loops of the old context stopped at once');
  assert.ok(!log.some(e => e[0] === 'close'), 'the old context finishes its last one-shots (« Retour au jeu » click)…');
  t.mock.timers.tick(OLD_CONTEXT_RELEASE_MS);
  assert.ok(log.some(e => e[0] === 'close' && e[1] === old), '…then is closed');
  assert.ok(OLD_CONTEXT_RELEASE_MS >= 1000 && OLD_CONTEXT_RELEASE_MS <= 3000, 'longer than a delayed cue (≤ 1 s), short enough to free the context');
  await flush();
  assert.equal(audio.state, 'running');
  assert.equal(audio.volume, 0.4);
  const master = audio.master;
  assert.ok(Math.abs(master.gain.value - 0.32) < 1e-9, 'master gain = 0.8 × volume on the new context');
  audio.play(fire);
  const last = sources[sources.length - 1];
  assert.equal(last.ctx, fresh, 'cues start on the new context');
  assert.equal(last.buffer, FIRE, 'the decoded buffer is reused, not decoded again');
  assert.equal(last.when, fresh.currentTime);
  audio.setLoop('rolling', 1);
  assert.equal(sources[sources.length - 1].ctx, fresh, 'the rolling loop restarts on the new context');
  // MENU opened and closed again at once: the context is younger than OLD_CONTEXT_RELEASE_MS, it is kept.
  audio.resumeAfterPause();
  assert.equal(FakeContext.instances.length, 2, 'no new context for a context that has just started');
  fresh.currentTime = OLD_CONTEXT_RELEASE_MS / 1000 + 0.1;
  audio.resumeAfterPause();
  assert.equal(FakeContext.instances.length, 3, 'a longer pause renews it again');
  assert.equal(sources.filter(s => s.ctx === old && s.when > 0).length, 0);
});

test('resumeAfterPause() without transient activation (Escape is not one): deferred to the next gesture (unlock)', async () => {
  const { audio, FakeContext, navigator } = await ready({ activation: false });
  audio.resumeAfterPause();
  assert.equal(FakeContext.instances.length, 1, 'no context created outside an activation');
  navigator.userActivation.isActive = true;
  audio.unlock();
  assert.equal(FakeContext.instances.length, 2, 'the next gesture creates the fresh context');
  audio.unlock();
  assert.equal(FakeContext.instances.length, 2, 'once');
  await flush();
  assert.equal(audio.state, 'running');
});

test('deferred renewal: an unlock() without activation (iOS touch pointerdown) keeps waiting; a context that cannot start yet re-arms the gesture listeners', async () => {
  const { audio, FakeContext, navigator, env } = await ready({ activation: false });
  audio.bindUnlock(env.window);
  audio.resumeAfterPause();
  audio.unlock();
  assert.equal(FakeContext.instances.length, 1, 'never a context that the browser would leave suspended');
  // The new context is made with activation, but starts only later (WebKit: rendering starts on a posted task).
  navigator.userActivation.isActive = true;
  const Base = env.AudioContext;
  let held = null;
  env.AudioContext = class extends Base { resume() { if (!held) { held = this; return new Promise(() => {}); } return super.resume(); } };
  audio.unlock();
  assert.equal(audio.state, 'suspended');
  assert.ok(env.window.count('touchend') > 0 || env.window.count('click') > 0, 'gesture listeners armed for the new context');
  env.window.dispatchEvent(new Event('touchend'));
  await flush();
  assert.equal(audio.state, 'running', 'the next touchend starts it');
  assert.equal(env.window.count('touchend'), 0, 'listeners removed once running');
});

test('resumeAfterPause() is a no-op before the first unlock, with sound disabled by the browser, and never throws', async () => {
  const { env, FakeContext } = fakeEnv();
  const audio = new AudioManager('assets/', env);
  audio.resumeAfterPause();
  assert.equal(FakeContext.instances.length, 0, 'the first gesture creates the context, not the pause');
  assert.doesNotThrow(() => new AudioManager('assets/', {}).resumeAfterPause());
  // A constructor that fails on the second call keeps the running context.
  let calls = 0;
  const fake = fakeEnv();
  const Base = fake.FakeContext;
  fake.env.AudioContext = class extends Base { constructor() { super(); if (++calls > 1) throw new Error('NotAllowed'); } };
  const kept = new AudioManager('assets/', fake.env);
  kept.unlock();
  await flush();
  Base.instances[0].currentTime = 30;
  assert.doesNotThrow(() => kept.resumeAfterPause());
  assert.equal(calls, 2, 'a new context was attempted');
  assert.equal(kept.state, 'running', 'old context kept when a new one cannot be created');
  assert.equal(Base.instances[0].closed, false);
});

test('a decode still running on the old context does not disable its sound after the swap', async () => {
  const { audio } = await ready();
  const ctx = audio.ctx;
  let reject;
  ctx.decodeAudioData = () => new Promise((_, r) => { reject = r; });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    audio.available.add('insert');
    const loading = audio.load('insert');
    await flush();
    audio.resumeAfterPause();
    reject(new Error('InvalidStateError: context closed'));
    await loading;
    assert.equal(audio.available.has('insert'), true, 'still a pack sound: decoded again on the new context at the next cue');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('hasTransientActivation: false only when navigator.userActivation.isActive is false; never throws', () => {
  assert.equal(hasTransientActivation({ userActivation: { isActive: false } }), false);
  assert.equal(hasTransientActivation({ userActivation: { isActive: true } }), true);
  assert.equal(hasTransientActivation({}), true, 'no API (Safari < 16.4): assume the call runs in the gesture');
  assert.equal(hasTransientActivation(undefined), true);
  assert.equal(hasTransientActivation({ get userActivation() { throw new Error('x'); } }), true);
});

// ------------------------------------------------------------ wiring in main.js

/** Body of a compiled method, up to the closing brace at its indentation. */
const method = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature.trim()} compiled`);
  const end = src.indexOf('\n    }', start);
  return src.slice(start, end);
};

test('main.js: every way back into the game from a pause hands the audio a fresh context (MENU closed, P, live STATS)', () => {
  const main = fs.readFileSync(new URL('../.compiled/main.js', import.meta.url), 'utf8');
  assert.match(method(main, '    closeMenu() {'), /this\.audio\.resumeAfterPause\(\);/, 'closing the MENU');
  assert.match(method(main, '    togglePause() {'), /if \(this\.paused\)\s*this\.audio\.stopLoops\(\);\s*else\s*this\.audio\.resumeAfterPause\(\);/, 'P / tap un-pauses');
  assert.match(method(main, '    async closeStats() {'), /outcome === 'live'\)\s*this\.audio\.resumeAfterPause\(\);/, 'live STATS closed');
  // Opening the menu does not suspend the context: WebKit keeps the slipped write-ahead across suspend / resume.
  assert.doesNotMatch(method(main, '    openMenu() {'), /suspend/);
});
