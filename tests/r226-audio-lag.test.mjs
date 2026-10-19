// R2.0.26 — le son reste décalé après une pause malgré R2.0.25 (retour de l'utilisateur : « On a toujours le décalage
// après une pause », ≥ 1 s, Mac et iPhone, application installée et onglet Safari / Chrome).
//
// Second pass (.planning/debug/sound-lag-after-pause.md): Chromium with the real autoplay policy shows no lag on any way
// back from the MENU (every cue on a running context at its currentTime, output lag 35-50 ms); a ≥ 1 s lag is out of
// reach of a running Blink context. What the R2.0.25 audio still allowed: a cue started on a context that is not live
// (suspended, iOS « interrupted », or « running » with a clock that does not move) is held at the frozen currentTime and
// heard whenever the context next starts — a tap later, ≈ 1 s; and a running WebKit context that drifts late (known
// engine behaviour, up to 1.5 s) was neither measured nor rebuilt, only blindly replaced on resume.
//
// Locks: a cue is never heard late (started on a non-live context it is revoked unless the context runs within
// LATE_CUE_GRACE_MS; the context is asked to resume); a stalled clock is not live; the output lag measured with
// getOutputTimestamp rebuilds the context at the next gesture when it grows LAG_LIMIT_S above what the context started
// with (or starts that late, bounded retries — no rebuild loop on a slow route); the diagnostic overlay text (?debug=audio)
// and its wiring in main.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AudioManager, LATE_CUE_GRACE_MS, CLOCK_STALL_MS, LAG_LIMIT_S, LAG_SETTLE_S, MAX_LAG_RETRIES,
  outputLag, audioDebugEnabled, audioDebugLines,
} from '../.compiled/audio.js';

const param = (value = 1) => ({ value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });

/**
 * Fake browser: a wall clock (`env.now`, ms) and AudioContexts whose state, clock and output lag are driven by the test.
 * `lead` (s) = how late the device plays what the context renders: getOutputTimestamp() reports the context time being
 * heard now = currentTime − lead. A `stalled` context keeps its clock still even when `running`.
 */
function fakeEnv({ activation = true, timestamp = true, startState = 'running', baseLatency = 0.005, outputLatency = 0.02 } = {}) {
  const wall = { now: 0 };
  const sources = [];
  const log = [];
  class FakeContext extends EventTarget {
    static instances = [];
    state = 'suspended';
    sampleRate = 48000;
    currentTime = 0;
    baseLatency = baseLatency;
    outputLatency = outputLatency;
    lead = 0.03;
    stalled = false;
    closed = false;
    destination = { name: 'destination' };
    constructor() {
      super();
      FakeContext.instances.push(this);
      // `startState` running: the browser starts it on its own (Chrome, sticky activation); else it waits for resume().
      this.autoStart = startState === 'running';
    }
    setState(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
    createGain() {
      const node = { gain: param(), disconnected: false, connect(n) { return n; }, disconnect() { node.disconnected = true; } };
      return node;
    }
    createBuffer(channels, length, rate) { return { length, numberOfChannels: channels, sampleRate: rate, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return this.source({ buffer: null, loop: false, playbackRate: param() }); }
    createOscillator() { return this.source({ type: 'sine', frequency: param() }); }
    source(fields) {
      const ctx = this;
      const src = {
        ...fields, out: null, when: null, stopAt: null, calledAt: null,
        connect(n) { src.out = n; return n; }, disconnect() {},
        start(t = 0) { src.when = t; src.calledAt = wall.now; sources.push(src); src.ctx = ctx; },
        stop(t = 0) { src.stopAt = t; },
      };
      return src;
    }
    resume() {
      log.push(['resume', this, wall.now]);
      return Promise.resolve().then(() => {
        if (this.closed || this.refuse) return;
        this.setState('running');
      });
    }
    close() {
      this.closed = true;
      return Promise.resolve().then(() => this.setState('closed'));
    }
  }
  if (timestamp) {
    FakeContext.prototype.getOutputTimestamp = function () {
      return { contextTime: Math.max(0, this.currentTime - this.lead), performanceTime: wall.now };
    };
  }
  const navigator = { audioSession: { type: 'auto' }, userActivation: { isActive: activation, hasBeenActive: true } };
  const env = { AudioContext: FakeContext, navigator, document: null, window: new EventTarget(), webkit: false, now: () => wall.now };
  return { env, FakeContext, sources, log, navigator, wall };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const FIRE = { length: 4800, numberOfChannels: 1, sampleRate: 48000, duration: 0.1 };
const fire = { key: 'fire', gain: 1, rate: 1 };

/** A source is silenced for good when it stops no later than it starts, or its output node is disconnected. */
const revoked = src => (src.stopAt !== null && src.stopAt <= src.when) || src.out?.disconnected === true;

/** Advances the wall clock by `ms` in 16 ms frames: running, non-stalled contexts advance their clock; tick() every frame. */
function frames(fake, audio, ms) {
  for (let t = 0; t < ms; t += 16) {
    fake.wall.now += 16;
    for (const c of fake.FakeContext.instances) if (c.state === 'running' && !c.stalled) c.currentTime += 0.016;
    audio.tick();
  }
}

/** An AudioManager unlocked on a running fake context, with the decoded `fire` pack sound. */
async function ready(opts) {
  const fake = fakeEnv(opts);
  const audio = new AudioManager('assets/', fake.env);
  audio.bindUnlock(fake.env.window);
  audio.unlock();
  await flush();
  audio.available.add('fire');
  audio.buffers.set('fire', FIRE);
  return { audio, ...fake };
}

// --------------------------------------------------------------- never heard late

test('a cue started on a context that is not running is revoked if the context does not run within the grace (never heard a tap later)', async () => {
  const fake = await ready();
  const { audio, FakeContext, sources, log } = fake;
  const ctx = FakeContext.instances[0];
  frames(fake, audio, 2000);
  ctx.setState('interrupted'); // iOS: the system took the audio away; Safari: a context left suspended
  const resumes = log.filter(e => e[0] === 'resume').length;
  audio.play(fire);
  const shot = sources[sources.length - 1];
  assert.equal(shot.ctx, ctx);
  assert.ok(log.filter(e => e[0] === 'resume').length > resumes, 'the context is asked to resume');
  frames(fake, audio, LATE_CUE_GRACE_MS + 40);
  assert.equal(revoked(shot), true, 'revoked before the context runs again');
  // A tap one second later resumes the context: the old shot must not sound now.
  fake.wall.now += 1000;
  audio.unlock();
  await flush();
  assert.equal(audio.state, 'running');
  assert.equal(revoked(shot), true);
  audio.play(fire);
  assert.equal(revoked(sources[sources.length - 1]), false, 'the next cue on the running context plays');
});

test('a cue started while the context is starting (Safari: first gesture, fresh context) is kept when it runs within the grace', async () => {
  const fake = fakeEnv();
  const { env, FakeContext, sources } = fake;
  const audio = new AudioManager('assets/', env);
  audio.available.add('fire');
  audio.unlock(); // suspended until resume() resolves
  audio.buffers.set('fire', FIRE);
  assert.equal(audio.state, 'suspended');
  audio.play(fire);
  const click = sources[sources.length - 1];
  fake.wall.now += 30;
  await flush();
  assert.equal(FakeContext.instances[0].state, 'running');
  frames(fake, audio, 500);
  assert.equal(revoked(click), false, 'heard ≤ 30 ms late rather than dropped');
});

test('a running context whose clock does not move is not live: its cues are revoked and it is rebuilt at the next gesture', async () => {
  const fake = await ready();
  const { audio, FakeContext, sources } = fake;
  frames(fake, audio, 2000);
  const ctx = FakeContext.instances[0];
  ctx.stalled = true; // state stays « running », currentTime frozen
  frames(fake, audio, CLOCK_STALL_MS + 50);
  audio.play(fire);
  const shot = sources[sources.length - 1];
  frames(fake, audio, LATE_CUE_GRACE_MS + 40);
  assert.equal(revoked(shot), true, 'not heard when the clock starts again');
  frames(fake, audio, 1500);
  assert.equal(audio.diagnostics().renewPending, 'stall');
  audio.unlock(); // next tap (transient activation)
  assert.equal(FakeContext.instances.length, 2, 'fresh context');
  await flush();
  frames(fake, audio, 100);
  audio.play(fire);
  const next = sources[sources.length - 1];
  assert.equal(next.ctx, FakeContext.instances[1]);
  assert.equal(revoked(next), false);
});

test('a cue on a live context is never revoked, delayed cues included', async () => {
  const fake = await ready();
  const { audio, sources } = fake;
  frames(fake, audio, 2000);
  audio.play(fire);
  audio.play({ ...fire, delay: 0.6 });
  frames(fake, audio, 1000);
  assert.ok(sources.slice(-2).every(s => !revoked(s)));
  assert.equal(audio.diagnostics().revoked, 0);
});

// --------------------------------------------------------------- measured output lag

test('outputLag: currentTime − (contextTime + time since performanceTime); null without a usable timestamp', () => {
  assert.ok(Math.abs(outputLag(10, { contextTime: 9.96, performanceTime: 1000 }, 1005) - 0.035) < 1e-9);
  assert.ok(Math.abs(outputLag(31.2, { contextTime: 30, performanceTime: 5000 }, 5000) - 1.2) < 1e-9);
  assert.equal(outputLag(10, { contextTime: 0, performanceTime: 0 }, 1000), null, 'not started yet');
  assert.equal(outputLag(10, undefined, 1000), null);
  assert.equal(outputLag(10, { contextTime: NaN, performanceTime: 1 }, 1000), null);
});

test('an output lag grown LAG_LIMIT_S above the context\'s own start rebuilds it at the next gesture (self-healing)', async () => {
  const fake = await ready();
  const { audio, FakeContext, sources, wall } = fake;
  frames(fake, audio, (LAG_SETTLE_S + 1) * 1000);
  const d0 = audio.diagnostics();
  assert.ok(Math.abs(d0.lag - 0.03) < 0.005, `lag measured (${d0.lag})`);
  assert.ok(Math.abs(d0.lagRef - 0.03) < 0.005, 'reference = what the context started with');
  assert.equal(d0.renewPending, null);
  FakeContext.instances[0].lead = 1.2; // WebKit: the pipeline slipped during the pause
  frames(fake, audio, 1000);
  assert.ok(audio.diagnostics().lag > 1.1);
  assert.equal(audio.diagnostics().renewPending, 'lag');
  assert.equal(FakeContext.instances.length, 1, 'never outside a gesture');
  audio.unlock(); // the next tap
  assert.equal(FakeContext.instances.length, 2);
  await flush();
  frames(fake, audio, 100);
  audio.play(fire);
  assert.equal(sources[sources.length - 1].ctx, FakeContext.instances[1], 'cues go to the fresh context');
  const d1 = audio.diagnostics();
  assert.equal(d1.rebuilds, 1);
  assert.equal(d1.lastRebuild, 'lag');
  assert.equal(d1.renewPending, null);
  assert.ok(wall.now > 0);
});

test('no rebuild loop: a route that is slow from the start (Bluetooth, AirPlay) is the reference, retries bounded', async () => {
  const fake = fakeEnv();
  fake.FakeContext.prototype.lead = 0;
  const { env, FakeContext } = fake;
  // Every context is 0.6 s late from its first sample and the browser does not report it in outputLatency.
  const Base = env.AudioContext;
  env.AudioContext = class extends Base { constructor() { super(); this.lead = 0.6; this.outputLatency = 0; } };
  const audio = new AudioManager('assets/', env);
  audio.unlock();
  await flush();
  for (let i = 0; i < 6; i++) {
    frames(fake, audio, (LAG_SETTLE_S + 4) * 1000);
    audio.unlock(); // a tap every few seconds
    await flush();
  }
  assert.ok(FakeContext.instances.length <= 1 + MAX_LAG_RETRIES, `at most ${MAX_LAG_RETRIES} retries (${FakeContext.instances.length - 1})`);
  assert.equal(audio.diagnostics().renewPending, null, 'then left alone');
  // A route whose latency the browser reports (outputLatency) is expected: no retry at all.
  const fake2 = fakeEnv({ outputLatency: 0.6 });
  fake2.env.AudioContext = class extends fake2.FakeContext { constructor() { super(); this.lead = 0.62; } };
  const audio2 = new AudioManager('assets/', fake2.env);
  audio2.unlock();
  await flush();
  frames(fake2, audio2, (LAG_SETTLE_S + 3) * 1000);
  audio2.unlock();
  assert.equal(fake2.FakeContext.instances.length, 1);
});

test('without getOutputTimestamp (older Safari) nothing is measured, nothing rebuilt, nothing throws', async () => {
  const fake = await ready({ timestamp: false });
  const { audio, FakeContext } = fake;
  assert.doesNotThrow(() => frames(fake, audio, 4000));
  audio.unlock();
  assert.equal(FakeContext.instances.length, 1);
  assert.equal(audio.diagnostics().lag, null);
  assert.doesNotThrow(() => new AudioManager('assets/', {}).tick());
  assert.equal(new AudioManager('assets/', {}).diagnostics().state, 'none');
});

// --------------------------------------------------------------- diagnostic overlay (?debug=audio)

test('?debug=audio: enabled only by that query value', () => {
  assert.equal(audioDebugEnabled('?debug=audio'), true);
  assert.equal(audioDebugEnabled('?level=1-1&debug=audio'), true);
  assert.equal(audioDebugEnabled('?debug=1'), false);
  assert.equal(audioDebugEnabled(''), false);
  assert.equal(audioDebugEnabled(undefined), false);
});

test('overlay text: state, clock, latencies, measured lag, rebuilds, revoked cues', async () => {
  const fake = await ready();
  const { audio } = fake;
  frames(fake, audio, 3000);
  const lines = audioDebugLines(audio.diagnostics());
  const text = lines.join('\n');
  assert.ok(lines.length >= 4 && lines.length <= 8, 'a small corner block');
  assert.match(text, /running/);
  assert.match(text, /t=\d+\.\d{2}/);
  assert.match(text, /base 5 ms/);
  assert.match(text, /sortie 20 ms/);
  assert.match(text, /retard 3\d ms/);
  assert.match(text, /reconstructions 0/);
  assert.match(text, /annulés 0/);
  assert.doesNotThrow(() => audioDebugLines(new AudioManager('assets/', {}).diagnostics()));
  assert.match(audioDebugLines(new AudioManager('assets/', {}).diagnostics()).join('\n'), /none/);
});

// ------------------------------------------------------------ wiring in main.js

test('main.js: the audio monitor runs every frame; the overlay is drawn only with ?debug=audio', () => {
  const main = fs.readFileSync(new URL('../.compiled/main.js', import.meta.url), 'utf8');
  const loop = main.slice(main.indexOf('    loop(time) {'), main.indexOf('\n    }', main.indexOf('    loop(time) {')));
  assert.match(loop, /this\.audio\.tick\(\)/, 'tick() every frame, every screen');
  assert.match(loop, /if \(this\.audioDebug\)\s*this\.drawAudioDebug\(\)/);
  assert.match(main, /audioDebug = [^;]*audioDebugEnabled\(location\.search\)/);
  assert.match(main, /audioDebugLines\(this\.audio\.diagnostics\(\)\)/);
});
