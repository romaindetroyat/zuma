/** Browser entry point: game flow, input, HUD/STATS panels and PWA wiring. */
import { CANDIDATE, ENGINE_VERSION, Track, ZumaEngine, defaultParTime, type EngineConfig, type GameEvent, type Point } from './core.js';
import { EXPLOSION_RGB, makeColorBurst, soundCues, type ColorBurst } from './feedback.js';
import { LEVELS, levelFor, type LevelDef } from './levels.js';
import { AudioManager, loopLevels, warningLevel } from './audio.js';
import { OriginalPack, bitmapUrl, tintSheet, type PackGraphics, type PackSettings } from './original.js';
import { loadBitmapFont } from './bitmapfont.js';
import { STATS_ORDER, TIP_KEYS, bestTime, bestTimeKey, composeStatsDialog, loadStatsKit, statsValues, type ButtonState, type StatsKit, type StatsValues } from './statsdialog.js';
import { FROG_FRONT, HUD_HEIGHT, Renderer, WIDTH, HEIGHT, type FloatingText, type Fx, type HudState, type LevelView, type RenderAssets } from './render.js';

declare const __BUILD__: string;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

interface ResolvedLevel {
  /** Stable identifier for per-level persistence (pack graphics id, or `proc-N`). */
  id: string;
  label: string;
  name: string;
  tracks: Track[];
  frog: Point;
  config: Partial<EngineConfig>;
  graphics: PackGraphics | null;
  parTime: number | null;
}

interface Progress { stage: number; level: number }

const TIPS = [
  'Les balles de même couleur s\'attirent et créent des réactions en chaîne.',
  'Tirez à travers un trou dans la chaîne pour un bonus saut.',
  'Bouton droit ou Espace pour échanger la balle courante et la suivante.',
  'La balle RALENTIR divise la vitesse de la chaîne par quatre.',
  'La balle RETOUR fait reculer toutes les portions de chaîne.',
  'La balle VISÉE trace votre tir et accélère le projectile.',
  'Détruisez une balle BOMBE pour souffler ses voisines.',
  'Ne laissez pas les balles atteindre le crâne !',
];

class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly audio = new AudioManager();
  private pack: OriginalPack | null = null;
  /** Original strings (`strings.json`) for the in-game messages (GET_READY / GO); null without the pack. */
  private strings: Record<string, string> | null = null;
  /** Native STATS (D-01): original pieces + fonts + strings; null → vector STATS panel. */
  private statsKit: StatsKit | null = null;
  private statsCanvas: HTMLCanvasElement | null = null;
  private statsUrl: string | null = null;
  private statsRevealed = 0;
  private statsButton: ButtonState = 'normal';
  private statsTip = '';
  private statsValues: StatsValues | null = null;
  /** Composition sequence and the sequence currently displayed: an encoded picture is applied only if it is newer than the one shown (monotonic), never dropped just because a newer composition started. */
  private statsRender = 0;
  private statsShown = 0;
  private statsTimers: number[] = [];
  private engine: ZumaEngine | null = null;
  private level: ResolvedLevel | null = null;
  private progress: Progress = { stage: 0, level: 0 };
  private levelIndex = 0;
  private lives = CANDIDATE.lives;
  private carriedScore = 0;
  private paused = false;
  private statsOpen = false;
  private menuOpen = false;
  private frame = 0;
  private accumulator = 0;
  private lastTime = 0;
  private fx: Fx = { bursts: [], floats: [], tongueStart: -Infinity, threat: 0 };
  private message: { text: string; sub: string | null; until: number } | null = null;
  private endAt: number | null = null;
  private seed = Date.now() >>> 0;
  private pointer: Point = { x: WIDTH / 2, y: HEIGHT };
  private loading = true;
  /** « Pixels nets »: integer CSS scale with image-rendering: pixelated (persisted as zuma.pixelated). */
  private pixelated = false;
  /** Ball id → arc position at the previous frame, to measure the chain speed for the rolling loop. */
  private lastPositions = new Map<number, number>();

  constructor() {
    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, null);
    try { this.pixelated = localStorage.getItem('zuma.pixelated') === '1'; } catch { /* storage unavailable */ }
    this.bindInput();
    this.bindPanels();
    this.syncPixelsLabel();
    this.bindScaling();
    this.applyScaling();
  }

  // ---------------------------------------------------------------- scaling

  /** Matches the canvas backing store to the displayed size and devicePixelRatio (or an integer CSS scale). */
  private applyScaling(): void {
    const stage = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    if (this.pixelated) {
      const k = Math.max(1, Math.floor(Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT)));
      stage?.style.setProperty('--k', String(k));
      stage?.classList.add('pixelated');
      this.renderer.resize(WIDTH * k, dpr, true);
      return;
    }
    stage?.classList.remove('pixelated');
    stage?.style.removeProperty('--k');
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width || WIDTH, dpr, false);
  }

  private bindScaling(): void {
    window.addEventListener('resize', () => this.applyScaling());
    const stage = this.canvas.parentElement;
    if (typeof ResizeObserver !== 'undefined' && stage) new ResizeObserver(() => this.applyScaling()).observe(stage);
    // devicePixelRatio has no change event: re-arm a one-shot media query at each new ratio.
    const watchDpr = (): void => {
      if (typeof matchMedia !== 'function') return;
      matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { this.applyScaling(); watchDpr(); }, { once: true });
    };
    watchDpr();
  }

  private togglePixels(): void {
    this.pixelated = !this.pixelated;
    try { localStorage.setItem('zuma.pixelated', this.pixelated ? '1' : '0'); } catch { /* storage unavailable */ }
    this.syncPixelsLabel();
    this.applyScaling();
  }

  private syncPixelsLabel(): void {
    const btn = document.getElementById('menu-pixels');
    if (btn) btn.textContent = this.pixelated ? 'Pixels nets : activés' : 'Pixels nets : désactivés';
  }

  async start(): Promise<void> {
    this.pack = await OriginalPack.load();
    await this.audio.discover();
    if (this.pack) {
      this.strings = await this.pack.strings();
      this.renderer.assets = await this.loadAssets(this.pack);
      // Loaded in the background: a STATS opened before the kit is ready uses the vector panel.
      void loadStatsKit(this.pack).then(kit => { this.statsKit = kit; });
    }
    const badge = document.getElementById('build');
    if (badge) badge.textContent = `R${ENGINE_VERSION} · ${BUILD}${this.pack ? ' · ressources originales' : ' · rendu vectoriel'}`;
    this.loading = false;
    await this.newGame();
    document.getElementById('boot')?.classList.add('hidden');
    requestAnimationFrame(t => this.loop(t));
  }

  /** Read-only view for review (`?debug=1`, T-05-10): the running engine and the resolved level. */
  debugState(): { engine: ZumaEngine | null; level: ResolvedLevel | null } {
    return { engine: this.engine, level: this.level };
  }

  // ----------------------------------------------------------------- assets

  private async loadAssets(pack: OriginalPack): Promise<RenderAssets> {
    const [balls, ballShadow, bomb, slow, backwards, accuracy, hole, pitcover, grey, frogPad, tongue, eyeblink, menubar, gauge, gaugeGreen, lives, coin, sparkle, titleFont, textFont, floatFont] = await Promise.all([
      pack.ballSheets(),
      pack.shadow('_ballshadow'),
      pack.powerIcons('bomb'),
      pack.powerIcons('slow'),
      pack.powerIcons('backwards'),
      pack.powerIcons('accuracy'),
      pack.masked('hole'),
      pack.sheet('pitcover', 88, '_pitcover'),
      pack.sheet('grayplosion', 86),
      pack.masked('smallfrogonpad'),
      pack.masked('tongue'),
      pack.keyed('eyeblink'),
      pack.masked('menubar'),
      pack.masked('gauge'),
      pack.masked('gaugegreen', '_gauge'),
      pack.masked('toadlives'),
      pack.sheet('coin', 36, '_coin'),
      pack.image('sparkle'),
      loadBitmapFont(pack, 'nativealienextended18'),
      loadBitmapFont(pack, 'cancun12'),
      loadBitmapFont(pack, 'cancunfloat14'),
    ]);
    const explosions = grey ? EXPLOSION_RGB.map(rgb => tintSheet(grey, rgb)) : EXPLOSION_RGB.map(() => null);
    const fonts = titleFont || textFont || floatFont ? { title: titleFont, text: textFont, float: floatFont } : null;
    return { balls, ballShadow, powers: { bomb, slow, backwards, accuracy }, hole, pitcover, explosions, frogPad, tongue, eyeblink, menubar, gauge, gaugeGreen, lives, coin, sparkle, fonts };
  }

  // ----------------------------------------------------------------- levels

  private async resolveLevel(): Promise<ResolvedLevel> {
    if (this.pack?.hasStages) {
      const stages = this.pack.data.stages;
      const stage = stages[Math.min(this.progress.stage, stages.length - 1)];
      const idx = Math.min(this.progress.level, stage.levels.length - 1);
      const graphics = this.pack.graphics(stage.levels[idx]);
      const settings = this.pack.settings(stage.settings[idx]);
      if (graphics && graphics.curveFiles.length > 0) {
        const tracks = await this.pack.tracks(graphics);
        const config = configFromSettings(settings, this.progress.stage, tracks.length);
        return {
          id: graphics.id,
          label: `${this.progress.stage + 1}-${idx + 1}`,
          name: graphics.name,
          tracks,
          frog: graphics.frog,
          config,
          graphics,
          parTime: config.parTime ?? null,
        };
      }
    }
    const def: LevelDef = levelFor(this.levelIndex);
    return {
      id: `proc-${this.levelIndex + 1}`,
      label: `${this.levelIndex + 1}`,
      name: def.name,
      tracks: [new Track(def.track)],
      frog: def.frog,
      config: { colors: def.colors, startFraction: def.startFraction, total: def.total, target: def.target, speed: def.speed },
      graphics: null,
      parTime: null,
    };
  }

  private async newGame(): Promise<void> {
    this.progress = this.requestedProgress();
    this.levelIndex = 0;
    this.lives = CANDIDATE.lives;
    this.carriedScore = 0;
    await this.startLevel();
  }

  /**
   * `?level=S-L` (e.g. `1-3`) opens a pack level directly for review. Ignored
   * without a pack, when malformed or out of the pack's stage/level bounds (T-04-10).
   */
  private requestedProgress(): Progress {
    const first: Progress = { stage: 0, level: 0 };
    if (!this.pack?.hasStages) return first;
    let raw: string | null = null;
    try { raw = new URLSearchParams(location.search).get('level'); } catch { return first; }
    if (!raw || !/^\d+-\d+$/.test(raw)) return first;
    const [stage, level] = raw.split('-').map(Number);
    const stages = this.pack.data.stages;
    if (stage < 1 || stage > stages.length) return first;
    if (level < 1 || level > stages[stage - 1].levels.length) return first;
    return { stage: stage - 1, level: level - 1 };
  }

  private async startLevel(): Promise<void> {
    this.audio.stopLoops();
    this.lastPositions.clear();
    this.level = await this.resolveLevel();
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    // With the original sprite the projectile leaves from the measured mouth offset (ROADMAP SC2).
    const engine = new ZumaEngine(this.level.tracks, this.level.frog, {
      ...this.level.config,
      lives: this.lives,
      muzzleOffset: this.renderer.assets?.frogPad ? FROG_FRONT : CANDIDATE.muzzleOffset,
    }, this.seed);
    engine.score = this.carriedScore;
    // Coin spots of the pack level (D-07); an empty list keeps the engine free of extra RNG draws.
    engine.setTreasure(this.level.graphics?.treasure ?? []);
    this.engine = engine;
    this.fx = { bursts: [], floats: [], tongueStart: -Infinity, threat: 0 };
    this.endAt = null;
    this.paused = false;
    const art = this.pack && this.level.graphics ? await this.pack.levelArt(this.level.graphics) : null;
    const view: LevelView = { name: this.level.name, tracks: this.level.tracks, frog: this.level.frog, art, skullRotation: this.level.graphics?.skullRotation ?? null };
    this.renderer.setLevel(view);
    // « Attention » (D-11) stays up for the whole fast feed; the `go` event replaces it with « PARTEZ ».
    this.showMessage(this.strings?.GET_READY ?? 'Attention', `${this.level.name} — Niveau ${this.level.label}`, 100000);
    this.audio.play({ key: 'gamestart', gain: 0.7, rate: 1 });
  }

  private async nextLevel(): Promise<void> {
    if (!this.engine) return;
    this.carriedScore = this.engine.score;
    this.lives = this.engine.lives;
    if (this.pack?.hasStages) {
      const stages = this.pack.data.stages;
      const stage = stages[Math.min(this.progress.stage, stages.length - 1)];
      if (this.progress.level + 1 < stage.levels.length) this.progress.level++;
      else if (this.progress.stage + 1 < stages.length) this.progress = { stage: this.progress.stage + 1, level: 0 };
      else this.progress = { stage: 0, level: 0 };
    } else {
      this.levelIndex++;
    }
    await this.startLevel();
  }

  private async retryLevel(): Promise<void> {
    if (!this.engine) return;
    this.lives = this.engine.lives;
    await this.startLevel();
  }

  // ------------------------------------------------------------------- loop

  private loop(time: number): void {
    requestAnimationFrame(t => this.loop(t));
    const engine = this.engine;
    if (!engine || !this.level) return;
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    const tickLength = 1 / engine.config.tickHz;
    if (!this.paused && !this.statsOpen && !this.menuOpen) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= tickLength && steps < 6) {
        engine.step();
        this.handleEvents(engine.drainEvents(), engine);
        this.accumulator -= tickLength;
        steps++;
      }
      this.checkOutcome(engine);
      if (steps > 0) this.updateLoops(engine, steps);
    } else {
      this.accumulator = 0;
      this.audio.setLoop('rolling', 0);
      this.audio.pulse('warning', 0);
    }
    this.frame++;
    this.fx.bursts = this.fx.bursts.filter(b => engine.tick - b.start < 40);
    this.fx.floats = this.fx.floats.filter(f => engine.tick - f.start < 70);
    this.renderer.draw(engine, this.fx, this.hud(engine), this.frame);
  }

  /**
   * Rolling loop on whenever the fastest ball moved more than ROLLING_MIN_SPEED since the
   * previous frame (D-17), warning beat from the head ball's distance to the skull (D-08;
   * the original interval since 05-06: 4.1 s at 600 px down to 0.6 s). The pit cover opens
   * over the same 600 px (`fx.threat`). Recoil adds no sound (D-09).
   */
  private updateLoops(engine: ZumaEngine, steps: number): void {
    const seconds = steps / engine.config.tickHz;
    const positions = new Map<number, number>();
    let moved = 0;
    let headDistance: number | null = null;
    for (const chain of engine.chains) {
      let head = -Infinity;
      for (const ball of engine.alive(chain)) {
        positions.set(ball.id, ball.s);
        const last = this.lastPositions.get(ball.id);
        if (last !== undefined) moved = Math.max(moved, Math.abs(ball.s - last));
        head = Math.max(head, ball.s);
      }
      if (head > -Infinity) {
        const d = chain.track.length - head;
        headDistance = headDistance === null ? d : Math.min(headDistance, d);
      }
    }
    this.lastPositions = positions;
    const playing = engine.state === 'playing';
    const lv = loopLevels({ speed: moved / seconds, playing });
    this.audio.setLoop('rolling', lv.rolling);
    // The lid follows the chain's proximity even while it drains into the pit; the beat only plays live (D-08).
    this.fx.threat = warningLevel(headDistance, true);
    this.audio.pulse('warning', playing ? this.fx.threat : 0);
  }

  private hud(engine: ZumaEngine): HudState {
    const msg = this.message && this.frame < this.message.until ? this.message : null;
    return {
      levelLabel: this.level?.label ?? '',
      lives: Math.max(0, engine.lives),
      score: engine.score,
      progress: engine.zumaMode ? 1 : Math.min(1, engine.levelScore / engine.config.target),
      zuma: engine.zumaMode,
      message: this.paused && !msg ? 'PAUSE' : msg?.text ?? null,
      subMessage: msg?.sub ?? null,
    };
  }

  private showMessage(text: string, sub: string | null, frames: number): void {
    this.message = { text, sub, until: this.frame + frames };
  }

  private handleEvents(events: GameEvent[], engine: ZumaEngine): void {
    for (const e of events) {
      for (const cue of soundCues(e)) this.audio.play(cue);
      switch (e.kind) {
        case 'fire':
          this.fx.tongueStart = engine.tick;
          break;
        case 'destroy': {
          const ids = e.ids as number[];
          const chain = engine.chains[Number(e.chain) || 0];
          for (const id of ids) {
            const ball = chain.balls.find(b => b.id === id);
            if (!ball) continue;
            const p = chain.track.pointAt(ball.s);
            this.fx.bursts.push(makeColorBurst({ id: ball.id, x: p.x, y: p.y, color: ball.color }, engine.tick) as ColorBurst);
          }
          const depth = Number(e.depth);
          const label = depth > 1 ? `ENCHAÎNEMENT x${depth}  +${e.points}` : `+${e.points}`;
          this.float(label, Number(e.x), Number(e.y), depth > 1 ? '#ffd166' : '#ffffff', engine.tick);
          break;
        }
        case 'gap': {
          const n = Number(e.count);
          const label = n >= 3 ? 'BONUS TRIPLE SAUT' : n === 2 ? 'BONUS DOUBLE SAUT' : 'BONUS SAUT';
          this.float(`${label} +${100 * n}`, Number(e.x), Number(e.y) - 20, '#7ee8fa', engine.tick);
          break;
        }
        case 'streak':
          this.float(`COMBO x${e.streak}`, Number(e.x), Number(e.y) - 36, '#ff9f68', engine.tick);
          break;
        case 'power-activate': {
          const names: Record<string, string> = { bomb: 'BOMBE', slow: 'Balle RALENTIR', backwards: 'Balle RETOUR', accuracy: 'Balle VISÉE' };
          this.float(names[String(e.power)] ?? String(e.power), Number(e.x), Number(e.y) - 24, '#c3f584', engine.tick);
          break;
        }
        case 'go':
          this.showMessage(this.strings?.GO ?? 'PARTEZ', null, 45);
          break;
        case 'coin':
          this.float(`+${e.points}`, Number(e.x), Number(e.y) - 20, '#ffd45a', engine.tick);
          break;
        case 'cleanup':
          // End-of-level tally (D-10): one « +10 » per step along the track; the rising bonuspop comes from soundCues.
          this.float(`+${e.points}`, Number(e.x), Number(e.y) - 16, '#fff1a8', engine.tick);
          break;
        case 'zuma':
          this.showMessage('ZUMA !', 'Videz la chaîne', 120);
          break;
        case 'lost':
          this.showMessage('Perdu…', engine.lives >= 0 ? 'La chaîne a atteint le crâne' : 'Partie terminée', 180);
          break;
        case 'won': {
          const timeBonus = Number(e.timeBonus) || 0;
          this.showMessage('Niveau terminé !', timeBonus > 0 ? `Bonus de temps +${timeBonus}` : `Bonus ${Number(e.levelBonus) || engine.config.levelBonus}`, 180);
          break;
        }
      }
    }
  }

  private float(text: string, x: number, y: number, color: string, tick: number): void {
    const f: FloatingText = { text, x: Math.max(60, Math.min(WIDTH - 60, x)), y: Math.max(HUD_HEIGHT + 20, y), start: tick, color };
    this.fx.floats.push(f);
  }

  private checkOutcome(engine: ZumaEngine): void {
    if (engine.state === 'playing' || engine.state === 'clearing' || engine.state === 'draining') return;
    // D-10: the STATS open 60 ticks after the tally reaches the skull, 90 after a loss.
    if (this.endAt === null) this.endAt = this.frame + (engine.state === 'won' ? 60 : 90);
    if (this.frame < this.endAt) return;
    this.endAt = Infinity;
    this.openStats(engine.state === 'won' ? 'won' : engine.state === 'gameover' ? 'gameover' : 'lost');
  }

  // ------------------------------------------------------------------ input

  private canvasPoint(ev: MouseEvent | Touch): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - rect.left) / rect.width) * WIDTH, y: ((ev.clientY - rect.top) / rect.height) * HEIGHT };
  }

  private bindInput(): void {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', ev => ev.preventDefault());
    canvas.addEventListener('mousemove', ev => {
      this.pointer = this.canvasPoint(ev);
      this.engine?.command({ kind: 'aim', ...this.pointer });
    });
    canvas.addEventListener('mousedown', ev => {
      ev.preventDefault();
      this.audio.unlock();
      const p = this.canvasPoint(ev);
      if (ev.button === 2) { this.engine?.command({ kind: 'swap' }); return; }
      if (ev.button !== 0) return;
      this.press(p);
    });
    canvas.addEventListener('touchstart', ev => {
      ev.preventDefault();
      this.audio.unlock();
      const t = ev.changedTouches[0];
      if (!t) return;
      const p = this.canvasPoint(t);
      this.pointer = p;
      this.engine?.command({ kind: 'aim', ...p });
      this.press(p);
    }, { passive: false });
    window.addEventListener('keydown', ev => {
      if (ev.repeat) return;
      if (ev.code === 'Space') { ev.preventDefault(); this.engine?.command({ kind: 'swap' }); }
      else if (ev.code === 'KeyP') this.togglePause();
      else if (ev.code === 'Escape') this.toggleMenu();
      else if (ev.code === 'KeyM') this.toggleSound();
    });
  }

  private press(p: Point): void {
    if (this.statsOpen || this.menuOpen || this.loading) return;
    const button = this.renderer.hitTest(p.x, p.y);
    if (button === 'menu') { this.toggleMenu(); return; }
    if (button === 'stats') { this.openStats('live'); return; }
    if (this.paused) { this.togglePause(); return; }
    if (p.y < HUD_HEIGHT) return;
    this.engine?.command({ kind: 'shoot', x: p.x, y: p.y });
  }

  private togglePause(): void {
    if (this.statsOpen || this.menuOpen) return;
    this.paused = !this.paused;
    if (this.paused) this.audio.stopLoops();
  }

  private toggleSound(): void {
    this.audio.enabled = !this.audio.enabled;
    const btn = document.getElementById('menu-sound');
    if (btn) btn.textContent = this.audio.enabled ? 'Son : activé' : 'Son : coupé';
  }

  // ----------------------------------------------------------------- panels

  private bindPanels(): void {
    const on = (id: string, handler: () => void): void => {
      document.getElementById(id)?.addEventListener('click', () => { this.audio.unlock(); handler(); });
    };
    on('result-continue', () => {
      if (this.statsKit) this.audio.play({ key: 'button', gain: 1, rate: 1 });
      void this.closeStats();
    });
    // Painted OK states (D-05): the transparent control only reports hover / press.
    const ok = document.getElementById('result-continue');
    if (ok) {
      const set = (state: ButtonState) => (): void => {
        if (!this.statsKit || !this.statsOpen || this.statsButton === state) return;
        this.statsButton = state;
        this.renderStats();
      };
      ok.addEventListener('mouseenter', set('hover'));
      ok.addEventListener('mouseleave', set('normal'));
      ok.addEventListener('mousedown', set('pressed'));
      ok.addEventListener('mouseup', set('hover'));
      ok.addEventListener('touchstart', set('pressed'), { passive: true });
      ok.addEventListener('touchend', set('normal'), { passive: true });
    }
    on('menu-resume', () => this.toggleMenu());
    on('menu-new', () => { this.toggleMenu(); void this.newGame(); });
    on('menu-sound', () => this.toggleSound());
    on('menu-pixels', () => this.togglePixels());
    on('menu-fullscreen', () => {
      const root = document.documentElement;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.();
    });
  }

  private toggleMenu(): void {
    if (this.statsOpen) return;
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) this.audio.stopLoops();
    document.getElementById('menu')?.classList.toggle('open', this.menuOpen);
  }

  private statsOutcome: 'live' | 'won' | 'lost' | 'gameover' = 'live';

  /**
   * Opens the STATS dialog. The ten values go to the `strong#result-*` of the structure
   * (vector panel) and, with the kit, into the composed 640×480 picture laid as the inline
   * background of `.zuma-stats` (D-01). The best time per level is persisted under
   * zuma.best.<id> on a win and always displayed as RECORD (D-04).
   */
  private openStats(outcome: 'live' | 'won' | 'lost' | 'gameover'): void {
    const engine = this.engine;
    if (!engine || this.statsOpen) return;
    this.statsOutcome = outcome;
    this.statsOpen = true;
    this.audio.stopLoops();
    const kit = this.statsKit;
    const strings = kit?.strings ?? null;
    const won = outcome === 'won';
    const s = engine.stats;
    const seconds = Math.round(engine.tick / engine.config.tickHz);
    const key = bestTimeKey(this.level?.id ?? 'unknown');
    const stored = readBestTime(key);
    const best = bestTime(stored, seconds, won);
    if (won && best !== stored) {
      try { localStorage.setItem(key, String(best)); } catch { /* storage unavailable */ }
    }
    const values = statsValues({
      levelScore: engine.levelScore, combos: s.combos, coins: s.coins, gaps: s.gaps, maxStreak: s.maxStreak, maxCombo: s.maxCombo,
      seconds, parTime: this.level?.parTime ?? 0, timeBonus: engine.timeBonus, won, bestSeconds: best,
      noBonusLabel: strings?.NO_TIME_BONUS ?? 'PAS DE BONUS',
    });
    this.statsValues = values;
    const title = document.getElementById('results-title');
    if (title) title.textContent = strings?.STATS ?? 'STATISTIQUES';
    for (const [field, id] of Object.entries(RESULT_IDS)) {
      const el = document.getElementById(id);
      if (el) el.textContent = values[field as keyof StatsValues];
    }
    this.statsTip = pickTip(strings);
    const tip = document.getElementById('stats-tip-text');
    if (tip) tip.textContent = this.statsTip;
    const ok = document.getElementById('result-continue');
    if (ok) ok.textContent = outcome === 'won' ? 'Niveau suivant' : outcome === 'lost' ? 'Réessayer' : outcome === 'gameover' ? 'Nouvelle partie' : 'OK';
    const panel = document.getElementById('stats');
    panel?.classList.toggle('stats-original', kit !== null);
    if (kit) {
      this.statsRevealed = 0;
      this.statsButton = 'normal';
      this.renderStats();
      this.revealStats();
    } else {
      const dialog = document.querySelector<HTMLElement>('#stats .zuma-stats');
      if (dialog) dialog.style.backgroundImage = '';
    }
    panel?.classList.add('open');
  }

  /** Composes the dialog for the current reveal / button state and lays it as the inline background. */
  private renderStats(): void {
    const kit = this.statsKit;
    const values = this.statsValues;
    const dialog = document.querySelector<HTMLElement>('#stats .zuma-stats');
    if (!kit || !values || !dialog || !this.statsOpen) return;
    this.statsCanvas = composeStatsDialog(kit, values, { revealed: this.statsRevealed, button: this.statsButton, tip: this.statsTip }, this.statsCanvas ?? undefined);
    const seq = ++this.statsRender;
    void preload(bitmapUrl(this.statsCanvas)).then(url => {
      if (!this.statsOpen || seq <= this.statsShown) { revokeUrl(url); return; }
      this.statsShown = seq;
      const previous = this.statsUrl;
      this.statsUrl = url;
      dialog.style.backgroundImage = `url("${url}")`;
      revokeUrl(previous);
    });
  }

  /** Reveals the ten values one line every 90 ms with a `pop` (D-05); timers are purged by closeStats(). */
  private revealStats(): void {
    this.clearStatsTimers();
    for (let i = 1; i <= STATS_ORDER.length; i++) {
      this.statsTimers.push(window.setTimeout(() => {
        this.statsRevealed = i;
        this.renderStats();
        this.audio.play({ key: 'pop', gain: 0.8, rate: 1 });
      }, 90 * i));
    }
  }

  private clearStatsTimers(): void {
    for (const t of this.statsTimers) clearTimeout(t);
    this.statsTimers = [];
  }

  private async closeStats(): Promise<void> {
    document.getElementById('stats')?.classList.remove('open');
    this.clearStatsTimers();
    this.statsOpen = false;
    this.statsShown = ++this.statsRender; // drop any composition still being encoded
    const dialog = document.querySelector<HTMLElement>('#stats .zuma-stats');
    if (dialog) dialog.style.backgroundImage = '';
    revokeUrl(this.statsUrl);
    this.statsUrl = null;
    const outcome = this.statsOutcome;
    this.statsOutcome = 'live';
    if (outcome === 'won') await this.nextLevel();
    else if (outcome === 'lost') await this.retryLevel();
    else if (outcome === 'gameover') await this.newGame();
  }
}

/** StatsValues fields → ids of the R2.0.12 STATS structure. */
const RESULT_IDS: Record<keyof StatsValues, string> = {
  points: 'result-points',
  combos: 'result-combo',
  coins: 'result-coins',
  gaps: 'result-gaps',
  chain: 'result-chain',
  comboMax: 'result-combo-max',
  time: 'result-time',
  objective: 'result-objective',
  bonus: 'result-expert',
  record: 'result-record',
};

/** Stored best time (seconds) or null when absent, unreadable or not a positive number (T-05-08). */
function readBestTime(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Resolves once the browser has decoded the picture, so the background swap never paints an empty frame. */
function preload(url: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

function revokeUrl(url: string | null): void {
  if (!url || !url.startsWith('blob:')) return;
  try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
}

/** An original tip (strings.json, `&cr;` → space) when the kit is loaded, else one of the built-in tips. */
function pickTip(strings: Record<string, string> | null): string {
  const pool = strings ? TIP_KEYS.map(k => strings[k]).filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  const list = pool.length > 0 ? pool : TIPS;
  return list[Math.floor(Math.random() * list.length)].replace(/&cr;/g, ' ');
}

export { formatSeconds } from './statsdialog.js';

/**
 * Maps original level settings onto the engine configuration (README « Réglages originaux »).
 * Units: the original simulates at 100 Hz (1 maj = 10 ms); px/maj × 100 = px/s, maj × 0.6 = ticks.
 * `speed` px/maj → px/s; `start` % of the curve length → `startFraction`; `repeat` → `(repeat + 1) / 100`
 * (hypothesis A1: the pack's last duplicated attribute wins); `single` → `singleLimit` (repair
 * threshold, 10 = off); `slowfactor` / `slowspeed` (→ speed / slowspeed) → `endSlowFactor` of the
 * end-of-track slow zone (the SLOW power-up keeps `CANDIDATE.slowFactor`); `danger` / `slowdistance`
 * → px; `zumaback` / `zumaslow` (300 / 1100 maj by default) → ticks; `partime` (s) or, when absent,
 * `defaultParTime(score, curves)` (hypothesis A7); `score` → `target` and `coinPoints` =
 * max(500, 100 × ⌊score / 600⌋); `levelBonus` 10 000 per curve (hypothesis A3).
 * Every value is untrusted pack data (T-05-13): finite, bounded, defaulted.
 */
export function configFromSettings(settings: PackSettings | undefined, stage: number, curves = 1): Partial<EngineConfig> {
  const s: PackSettings = settings ?? { id: 'default' };
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  /** 100 Hz steps × 0.6 → 60 Hz ticks; absent or non-finite → `fallback` steps, negative → 0. */
  const ticks = (v: unknown, fallback: number): number => {
    const steps = num(v, fallback);
    return steps > 0 ? Math.round(steps * 0.6) : 0;
  };
  const nonNeg = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const colors = num(s.colors, stage < 3 ? 4 : stage < 6 ? 5 : 6);
  const powerfreq = num(s.powerfreq, 3000);
  const speed = num(s.speed, 0.5); // px/maj
  const target = num(s.score, 1000);
  const slowspeed = num(s.slowspeed, 0);
  const partime = num(s.partime, 0);
  return {
    colors: clamp(Math.trunc(colors), 3, 6),
    startFraction: clamp(num(s.start, 40) / 100, 0, 1),
    total: Number.POSITIVE_INFINITY,
    target,
    repeatChance: clamp((num(s.repeat, 40) + 1) / 100, 0, 1),
    singleLimit: Math.trunc(clamp(num(s.single, 10), 0, 10)),
    speed: speed * 100,
    endSlowFactor: slowspeed > 0 ? Math.max(1, speed / slowspeed) : Math.max(1, num(s.slowfactor, 4)),
    dangerDistance: nonNeg(s.danger, 600),
    slowDistance: nonNeg(s.slowdistance, 500),
    projectileSpeed: (num(s.firespeed, 6) * 100) / 60,
    powerGuardTicks: Math.round(powerfreq * 0.3),
    powerChance: 1 / Math.max(60, powerfreq * 0.3),
    levelBonus: 10000,
    parTime: partime > 0 ? partime : defaultParTime(target, curves),
    coinPoints: Math.max(500, 100 * Math.floor(target / 600)),
    zumaBackTicks: ticks(s.zumaback, 300),
    zumaSlowTicks: ticks(s.zumaslow, 1100),
  };
}

/** Shows a fatal initialisation error in the boot overlay instead of leaving a black canvas. */
function reportBootError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Zuma: échec du démarrage', error);
  const boot = document.getElementById('boot');
  const text = document.getElementById('boot-message');
  if (boot) boot.classList.remove('hidden');
  if (boot) boot.classList.add('error');
  if (text) text.textContent = `Échec du démarrage : ${message}`;
}

if (typeof document !== 'undefined' && document.getElementById('game')) {
  try {
    const game = new Game();
    game.start().catch(reportBootError);
    // `?debug=1` (T-05-10): read-only handle for review scripts, same trust model as `?level=`.
    try {
      if (new URLSearchParams(location.search).get('debug') === '1') (window as unknown as { __zuma?: unknown }).__zuma = { game };
    } catch { /* no location */ }
  } catch (error) {
    reportBootError(error);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
  }
}

export { LEVELS };
