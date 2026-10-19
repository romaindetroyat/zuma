// R2.0.20 — UAT 9 (quick 261011-ios-sound-menu) : « sur mon iPhone le son ne semble pas fonctionner ».
// Session audio `playback` (le jeu sonne interrupteur silencieux activé), source silencieuse d'un échantillon démarrée
// dans le geste, `<audio>` silencieux joué une fois sur WebKit (iOS < 16.4 : canal média), écouteurs de geste gardés
// jusqu'à `running` puis retirés (réarmés après `interrupted`), reprise sur visibilitychange / pageshow.
// Tout est vérifié ici avec un AudioContext, un document et un élément audio factices : le vrai iPhone reste l'UAT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, AUDIO_SESSION_TYPE, setAudioSession, primeContext, primeMediaChannel, isWebKit, SILENT_WAV } from '../.compiled/audio.js';

/** EventTarget that counts its live listeners per type. */
class Target extends EventTarget {
  live = new Map();
  addEventListener(type, fn, opts) {
    this.live.set(type, (this.live.get(type) ?? 0) + 1);
    super.addEventListener(type, fn, opts);
  }
  removeEventListener(type, fn, opts) {
    this.live.set(type, Math.max(0, (this.live.get(type) ?? 0) - 1));
    super.removeEventListener(type, fn, opts);
  }
  count(type) { return this.live.get(type) ?? 0; }
}

const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });

function fakeEnv({ webkit = false, session = true } = {}) {
  const navigator = session ? { audioSession: { type: 'auto' } } : {};
  const log = [];
  class FakeContext extends Target {
    static instances = [];
    state = 'suspended';
    sampleRate = 44100;
    currentTime = 0;
    destination = { name: 'destination' };
    constructor() {
      super();
      this.sessionAtCreation = navigator.audioSession?.type;
      FakeContext.instances.push(this);
    }
    createGain() { return { gain: param(), connect: n => n, disconnect() {} }; }
    createBuffer(channels, length, rate) {
      log.push(['buffer', channels, length, rate]);
      return { length, numberOfChannels: channels, sampleRate: rate, getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      const src = { buffer: null, connect(n) { log.push(['connect', n === this.ctx?.destination]); return n; }, start(t) { log.push(['start', src.buffer?.length, t]); }, playbackRate: param() };
      src.ctx = this;
      return src;
    }
    resume() {
      log.push(['resume', this.state]);
      return Promise.resolve().then(() => {
        this.state = 'running';
        this.dispatchEvent(new Event('statechange'));
      });
    }
  }
  const elements = [];
  const document = new Target();
  document.visibilityState = 'visible';
  document.createElement = tag => {
    const el = {
      tag, attrs: {}, muted: false, volume: 1, src: '', plays: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      play() { this.plays.push({ muted: this.muted, src: this.src }); return Promise.resolve(); },
    };
    elements.push(el);
    return el;
  };
  const window = new Target();
  return { env: { AudioContext: FakeContext, navigator, document, window, webkit }, FakeContext, log, elements, document, window, navigator };
}

const flush = () => new Promise(r => setTimeout(r, 0));

test('AUDIO_SESSION_TYPE is playback (UAT 9: the game sounds even with the silent switch on; D-38 §6 revised from 05-14 ambient)', () => {
  assert.equal(AUDIO_SESSION_TYPE, 'playback');
  const nav = { audioSession: { type: 'auto' } };
  assert.equal(setAudioSession(nav), true);
  assert.equal(nav.audioSession.type, 'playback');
});

test('setAudioSession never throws: no navigator, no audioSession, throwing getter, read-only type', () => {
  assert.equal(setAudioSession(undefined), false);
  assert.equal(setAudioSession(null), false);
  assert.equal(setAudioSession({}), false);
  assert.equal(setAudioSession({ get audioSession() { throw new Error('denied'); } }), false);
  const frozen = { audioSession: Object.freeze({ type: 'auto' }) };
  assert.doesNotThrow(() => setAudioSession(frozen));
  const throwing = { audioSession: { set type(_v) { throw new Error('nope'); }, get type() { return 'auto'; } } };
  assert.equal(setAudioSession(throwing), false);
});

test('primeContext starts a 1-sample silent buffer source on the destination, synchronously; false without the API', () => {
  const { FakeContext, log } = fakeEnv();
  const ctx = new FakeContext();
  assert.equal(primeContext(ctx), true);
  assert.deepEqual(log[0], ['buffer', 1, 1, 44100], 'one sample, one channel, at the context rate');
  assert.ok(log.some(e => e[0] === 'start' && e[1] === 1), 'one-sample source started');
  assert.equal(primeContext(null), false);
  assert.equal(primeContext({ createBuffer() { throw new Error('x'); } }), false);
});

test('SILENT_WAV is a valid tiny PCM WAV data URL', () => {
  assert.match(SILENT_WAV, /^data:audio\/wav;base64,/);
  const bytes = Buffer.from(SILENT_WAV.split(',')[1], 'base64');
  assert.equal(bytes.toString('latin1', 0, 4), 'RIFF');
  assert.equal(bytes.toString('latin1', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8, 'RIFF size');
  assert.equal(bytes.readUInt16LE(20), 1, 'PCM');
  assert.ok(bytes.length < 256);
});

test('primeMediaChannel plays a silent inline <audio> once, muted then unmuted, volume 0; never throws', () => {
  const { document, elements } = fakeEnv();
  assert.equal(primeMediaChannel(document), true);
  assert.equal(elements.length, 1);
  const el = elements[0];
  assert.equal(el.tag, 'audio');
  assert.equal(el.src, SILENT_WAV);
  assert.ok('playsinline' in el.attrs && 'webkit-playsinline' in el.attrs, 'playsinline');
  assert.equal(el.volume, 0);
  assert.equal(el.plays.length, 1);
  assert.equal(el.plays[0].muted, true, 'play() called muted');
  assert.equal(el.muted, false, 'then unmuted');
  assert.equal(primeMediaChannel(null), false);
  assert.equal(primeMediaChannel({ createElement() { throw new Error('no DOM'); } }), false);
  assert.doesNotThrow(() => primeMediaChannel({ createElement: () => ({ setAttribute() {}, play() { throw new Error('NotAllowed'); } }) }));
  assert.doesNotThrow(() => primeMediaChannel({ createElement: () => ({ setAttribute() {}, play: () => Promise.reject(new Error('NotAllowed')) }) }));
  assert.doesNotThrow(() => primeMediaChannel({ createElement: () => ({ setAttribute() {}, play: () => undefined }) }));
});

test('isWebKit: feature detection on WebKit-only globals (GestureEvent, webkitAudioContext), no user agent', () => {
  assert.equal(isWebKit({ GestureEvent: function GestureEvent() {} }), true);
  assert.equal(isWebKit({ webkitAudioContext: function () {} }), true);
  assert.equal(isWebKit({ AudioContext: function () {}, navigator: { userAgent: 'iPhone Safari' } }), false);
  assert.equal(isWebKit(undefined), false);
});

test('unlock(): session set to playback before the context exists, silent buffer started inside the call, suspended context resumed', () => {
  const { env, FakeContext, log, navigator } = fakeEnv();
  const audio = new AudioManager('assets/', env);
  audio.unlock();
  assert.equal(FakeContext.instances.length, 1);
  assert.equal(navigator.audioSession.type, 'playback');
  assert.equal(FakeContext.instances[0].sessionAtCreation, 'playback', 'session type set before new AudioContext()');
  assert.ok(log.some(e => e[0] === 'start' && e[1] === 1), 'one-sample source started synchronously in the gesture');
  assert.ok(log.some(e => e[0] === 'resume'), 'resume() called in the gesture');
  audio.unlock();
  assert.equal(FakeContext.instances.length, 1, 'one context');
});

test('unlock(): an interrupted context (iOS call / lock) is resumed', async () => {
  const { env, FakeContext, log } = fakeEnv();
  const audio = new AudioManager('assets/', env);
  audio.unlock();
  await flush();
  assert.equal(audio.state, 'running');
  FakeContext.instances[0].state = 'interrupted';
  log.length = 0;
  audio.unlock();
  assert.ok(log.some(e => e[0] === 'resume' && e[1] === 'interrupted'));
});

test('unlock() on WebKit plays the silent <audio> once (media channel for iOS < 16.4); never elsewhere', () => {
  const webkit = fakeEnv({ webkit: true });
  const a = new AudioManager('assets/', webkit.env);
  a.unlock();
  a.unlock();
  assert.equal(webkit.elements.filter(e => e.tag === 'audio' && e.src === SILENT_WAV).length, 1, 'once');
  const other = fakeEnv({ webkit: false });
  new AudioManager('assets/', other.env).unlock();
  assert.equal(other.elements.filter(e => e.src === SILENT_WAV).length, 0);
});

test('bindUnlock: touchend / pointerup / click kept until the context runs, then removed; re-armed when interrupted', async () => {
  const { env, window, FakeContext } = fakeEnv();
  const audio = new AudioManager('assets/', env);
  audio.bindUnlock();
  for (const type of ['touchend', 'pointerup', 'click']) assert.equal(window.count(type), 1, type);
  window.dispatchEvent(new Event('touchend'));
  assert.equal(FakeContext.instances.length, 1, 'gesture created the context');
  await flush();
  assert.equal(audio.state, 'running');
  for (const type of ['touchend', 'pointerup', 'click']) assert.equal(window.count(type), 0, `${type} removed once running`);
  const ctx = FakeContext.instances[0];
  ctx.state = 'interrupted';
  ctx.dispatchEvent(new Event('statechange'));
  for (const type of ['touchend', 'pointerup', 'click']) assert.equal(window.count(type), 1, `${type} re-armed after interruption`);
  window.dispatchEvent(new Event('click'));
  await flush();
  for (const type of ['touchend', 'pointerup', 'click']) assert.equal(window.count(type), 0, `${type} removed again`);
});

test('bindUnlock: resume on visibilitychange (visible only) and on pageshow', async () => {
  const { env, window, document, FakeContext, log } = fakeEnv();
  const audio = new AudioManager('assets/', env);
  audio.bindUnlock();
  audio.unlock();
  await flush();
  const ctx = FakeContext.instances[0];
  ctx.state = 'suspended';
  log.length = 0;
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(log.filter(e => e[0] === 'resume').length, 0, 'not while hidden');
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(log.filter(e => e[0] === 'resume').length, 1, 'visible → resume');
  await flush();
  ctx.state = 'interrupted';
  log.length = 0;
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(log.filter(e => e[0] === 'resume').length, 1, 'pageshow → resume');
});

test('no exception when the APIs are missing (no AudioContext, no document, no window, no navigator)', () => {
  const audio = new AudioManager('assets/', {});
  assert.doesNotThrow(() => audio.unlock());
  assert.doesNotThrow(() => audio.bindUnlock());
  assert.doesNotThrow(() => audio.play({ key: 'fire', gain: 1, rate: 1 }));
  assert.equal(audio.state, 'none');
  const bare = new AudioManager();
  assert.doesNotThrow(() => bare.unlock(), 'Node default environment');
  const throwing = new AudioManager('assets/', { AudioContext: class { constructor() { throw new Error('blocked'); } } });
  assert.doesNotThrow(() => throwing.unlock());
});
