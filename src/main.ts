/** Browser entry point: game flow, input, HUD/STATS panels and PWA wiring. */
import { CANDIDATE, ENGINE_VERSION, Track, ZumaEngine, type EngineConfig, type GameEvent, type Point } from './core.js';
import { EXPLOSION_RGB, makeColorBurst, soundCues, type ColorBurst } from './feedback.js';
import { LEVELS, levelFor, type LevelDef } from './levels.js';
import { AudioManager, loopLevels } from './audio.js';
import { OriginalPack, tintSheet, type PackGraphics, type PackSettings, type StatsArt } from './original.js';
import { FROG_FRONT, HUD_HEIGHT, Renderer, WIDTH, HEIGHT, type FloatingText, type Fx, type HudState, type LevelView, type RenderAssets } from './render.js';

declare const __BUILD__: string;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

interface ResolvedLevel {
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
  /** Original STATS dialog (cleaned picture + measured slots); null → vector STATS panel. */
  private statsArt: StatsArt | null = null;
  private statsArtApplied = false;
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
  private fx: Fx = { bursts: [], floats: [], tongueStart: -Infinity };
  private message: { text: string; sub: string | null; until: number } | null = null;
  private endAt: number | null = null;
  private seed = Date.now() >>> 0;
  private pointer: Point = { x: WIDTH / 2, y: HEIGHT };
  private best = 0;
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
    try { this.best = Number(localStorage.getItem('zuma.best') ?? 0) || 0; } catch { /* storage unavailable */ }
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
      this.renderer.assets = await this.loadAssets(this.pack);
      // Cleaned in the background: the first STATS opened before it is ready uses the vector panel.
      void this.pack.statsArt().then(art => { this.statsArt = art; });
    }
    const badge = document.getElementById('build');
    if (badge) badge.textContent = `R${ENGINE_VERSION} · ${BUILD}${this.pack ? ' · ressources originales' : ' · rendu vectoriel'}`;
    this.loading = false;
    await this.newGame();
    document.getElementById('boot')?.classList.add('hidden');
    requestAnimationFrame(t => this.loop(t));
  }

  // ----------------------------------------------------------------- assets

  private async loadAssets(pack: OriginalPack): Promise<RenderAssets> {
    const [balls, ballShadow, bomb, slow, backwards, accuracy, hole, grey, frogPad, tongue, eyeblink, menubar, gauge, gaugeGreen, lives] = await Promise.all([
      pack.ballSheets(),
      pack.shadow('_ballshadow'),
      pack.powerIcons('bomb'),
      pack.powerIcons('slow'),
      pack.powerIcons('backwards'),
      pack.powerIcons('accuracy'),
      pack.masked('hole'),
      pack.sheet('grayplosion', 86),
      pack.masked('smallfrogonpad'),
      pack.masked('tongue'),
      pack.keyed('eyeblink'),
      pack.masked('menubar'),
      pack.masked('gauge'),
      pack.masked('gaugegreen', '_gauge'),
      pack.masked('toadlives'),
    ]);
    const explosions = grey ? EXPLOSION_RGB.map(rgb => tintSheet(grey, rgb)) : EXPLOSION_RGB.map(() => null);
    return { balls, ballShadow, powers: { bomb, slow, backwards, accuracy }, hole, explosions, frogPad, tongue, eyeblink, menubar, gauge, gaugeGreen, lives };
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
        return {
          label: `${this.progress.stage + 1}-${idx + 1}`,
          name: graphics.name,
          tracks,
          frog: graphics.frog,
          config: configFromSettings(settings, this.progress.stage),
          graphics,
          parTime: settings?.partime ?? null,
        };
      }
    }
    const def: LevelDef = levelFor(this.levelIndex);
    return {
      label: `${this.levelIndex + 1}`,
      name: def.name,
      tracks: [new Track(def.track)],
      frog: def.frog,
      config: { colors: def.colors, start: def.start, total: def.total, target: def.target, speed: def.speed },
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
    this.engine = engine;
    this.fx = { bursts: [], floats: [], tongueStart: -Infinity };
    this.endAt = null;
    this.paused = false;
    const art = this.pack && this.level.graphics ? await this.pack.levelArt(this.level.graphics) : null;
    const view: LevelView = { name: this.level.name, tracks: this.level.tracks, frog: this.level.frog, art, skullRotation: this.level.graphics?.skullRotation ?? null };
    this.renderer.setLevel(view);
    this.showMessage(this.level.name, `Niveau ${this.level.label}`, 150);
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
      this.audio.setLoop('warning', 0);
    }
    this.frame++;
    this.fx.bursts = this.fx.bursts.filter(b => engine.tick - b.start < 40);
    this.fx.floats = this.fx.floats.filter(f => engine.tick - f.start < 70);
    this.renderer.draw(engine, this.fx, this.hud(engine), this.frame);
  }

  /**
   * Rolling loop from the fastest ball displacement since the previous frame,
   * warning loop from the head ball's distance to the skull (D-08). Recoil adds no sound (D-09).
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
    const lv = loopLevels({ speed: moved / seconds, feedSpeed: engine.config.feedSpeed, headDistance, playing: engine.state === 'playing' });
    this.audio.setLoop('rolling', lv.rolling);
    this.audio.setLoop('warning', lv.warning);
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
        case 'zuma':
          this.showMessage('ZUMA !', 'Videz la chaîne', 120);
          break;
        case 'lost':
          this.showMessage('Perdu…', engine.lives >= 0 ? 'La chaîne a atteint le crâne' : 'Partie terminée', 180);
          break;
        case 'won':
          this.showMessage('Niveau terminé !', `Bonus ${engine.config.levelBonus}`, 180);
          break;
      }
    }
  }

  private float(text: string, x: number, y: number, color: string, tick: number): void {
    const f: FloatingText = { text, x: Math.max(60, Math.min(WIDTH - 60, x)), y: Math.max(HUD_HEIGHT + 20, y), start: tick, color };
    this.fx.floats.push(f);
  }

  private checkOutcome(engine: ZumaEngine): void {
    if (engine.state === 'playing' || engine.state === 'draining') return;
    if (this.endAt === null) this.endAt = this.frame + 90;
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
    on('result-continue', () => void this.closeStats());
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

  private openStats(outcome: 'live' | 'won' | 'lost' | 'gameover'): void {
    const engine = this.engine;
    if (!engine || this.statsOpen) return;
    this.statsOutcome = outcome;
    this.statsOpen = true;
    this.audio.stopLoops();
    if (engine.score > this.best) {
      this.best = engine.score;
      try { localStorage.setItem('zuma.best', String(this.best)); } catch { /* storage unavailable */ }
    }
    const title = document.getElementById('results-title');
    if (title) {
      title.textContent = outcome === 'won' ? 'NIVEAU TERMINÉ' : outcome === 'lost' ? 'VIE PERDUE' : outcome === 'gameover' ? 'PARTIE TERMINÉE' : 'STATISTIQUES';
    }
    const s = engine.stats;
    const seconds = Math.round(engine.tick / engine.config.tickHz);
    const parTime = this.level?.parTime ?? null;
    const values: Record<string, string> = {
      'result-points': String(engine.score),
      'result-combo': String(s.combos),
      'result-coins': '0',
      'result-gaps': String(s.gaps),
      'result-chain': String(s.maxStreak),
      'result-combo-max': String(s.maxCombo),
      'result-time': formatSeconds(seconds),
      'result-objective': parTime ? formatSeconds(Math.round(parTime)) : '—',
      // The original prints « PAS DE BONUS »; « AUCUN » keeps the live value inside the painted frame.
      'result-expert': outcome === 'won' ? `+${engine.config.levelBonus}` : 'AUCUN',
      'result-record': String(this.best),
    };
    for (const [id, text] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }
    const tip = document.getElementById('stats-tip-text');
    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const ok = document.getElementById('result-continue');
    if (ok) ok.textContent = outcome === 'won' ? 'Niveau suivant' : outcome === 'lost' ? 'Réessayer' : outcome === 'gameover' ? 'Nouvelle partie' : 'OK';
    const panel = document.getElementById('stats');
    const original = this.statsArt !== null;
    panel?.classList.toggle('stats-original', original);
    if (this.statsArt) this.layoutOriginalStats(this.statsArt);
    panel?.classList.add('open');
    if (original) this.revealStats();
  }

  /**
   * Lays the live values inside the original dialog: the cleaned picture as inline
   * background, each `strong#result-*` on the band of the erased digits (right-aligned,
   * painted colour, size relative to the stage height) and the OK control on the painted button.
   */
  private layoutOriginalStats(art: StatsArt): void {
    if (this.statsArtApplied) return;
    const dialog = document.querySelector<HTMLElement>('#stats .zuma-stats');
    if (!dialog) return;
    dialog.style.backgroundImage = `url("${art.url}")`;
    const pct = (v: number): string => `${(v * 100).toFixed(2)}%`;
    for (const [key, id] of Object.entries(STATS_SLOT_IDS)) {
      const slot = art.layout.slots[key];
      const el = document.getElementById(id);
      if (!slot || !el) continue;
      const { box } = slot;
      el.style.left = pct(box.x);
      el.style.right = pct(1 - box.x - box.w);
      el.style.top = pct(box.y);
      el.style.height = pct(box.h);
      el.style.fontSize = `${(slot.fontSize * 100).toFixed(2)}cqh`;
      el.style.color = slot.color;
      el.style.justifyContent = slot.align === 'left' ? 'flex-start' : 'flex-end';
    }
    const ok = document.getElementById('result-continue');
    if (ok) {
      ok.style.left = pct(art.layout.ok.x);
      ok.style.top = pct(art.layout.ok.y);
      ok.style.width = pct(art.layout.ok.w);
      ok.style.height = pct(art.layout.ok.h);
    }
    this.statsArtApplied = true;
  }

  /** Progressive reveal of the live values (90 ms per line), as in the reference build. */
  private revealStats(): void {
    this.clearStatsReveal();
    Object.values(STATS_SLOT_IDS).forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      this.statsTimers.push(window.setTimeout(() => el.classList.add('stats-reveal'), 90 * (i + 1)));
    });
  }

  private clearStatsReveal(): void {
    for (const t of this.statsTimers) clearTimeout(t);
    this.statsTimers = [];
    for (const id of Object.values(STATS_SLOT_IDS)) document.getElementById(id)?.classList.remove('stats-reveal');
  }

  private async closeStats(): Promise<void> {
    document.getElementById('stats')?.classList.remove('open');
    this.clearStatsReveal();
    this.statsOpen = false;
    const outcome = this.statsOutcome;
    this.statsOutcome = 'live';
    if (outcome === 'won') await this.nextLevel();
    else if (outcome === 'lost') await this.retryLevel();
    else if (outcome === 'gameover') await this.newGame();
  }
}

/** Layout slot keys (stats_layout.json) → ids of the R2.0.12 STATS structure, in reveal order. */
const STATS_SLOT_IDS: Record<string, string> = {
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

/** « 29 s » under a minute, « 1:42 » beyond, like the original dialog. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Maps original level settings (100 Hz update units) onto the engine configuration.
 * Interpretation (documented in README « Réglages originaux »): `score` = points to fill the
 * gauge (ZUMA mode), `repeat` = % chance of repeating the previous colour, `single` = % chance
 * of an isolated ball. The level bonus stays a fixed 1000 points: `score` is an objective, not a bonus.
 */
export function configFromSettings(settings: PackSettings | undefined, stage: number): Partial<EngineConfig> {
  const s = settings ?? { id: 'default' };
  const colors = s.colors ?? (stage < 3 ? 4 : stage < 6 ? 5 : 6);
  const powerfreq = s.powerfreq ?? 3000;
  return {
    colors: Math.max(3, Math.min(6, colors)),
    start: s.start ?? 35,
    total: Number.POSITIVE_INFINITY,
    target: s.score ?? 1000,
    repeatChance: Math.max(0, Math.min(1, (s.repeat ?? 50) / 100)),
    singleChance: Math.max(0, Math.min(1, (s.single ?? 0) / 100)),
    speed: (s.speed ?? 0.5) * 100,
    slowFactor: Math.max(1, s.slowfactor ?? 4),
    projectileSpeed: ((s.firespeed ?? 6) * 100) / 60,
    powerGuardTicks: Math.round(powerfreq * 0.3),
    powerChance: 1 / Math.max(60, powerfreq * 0.3),
    levelBonus: 1000,
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
  } catch (error) {
    reportBootError(error);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
  }
}

export { LEVELS };
