/** Browser entry point: game flow, input, HUD/STATS panels and PWA wiring. */
import { CANDIDATE, ENGINE_VERSION, Track, ZumaEngine, type EngineConfig, type GameEvent, type Point } from './core.js';
import { EXPLOSION_RGB, makeColorBurst, soundCues, type ColorBurst } from './feedback.js';
import { LEVELS, levelFor, type LevelDef } from './levels.js';
import { AudioManager } from './audio.js';
import { OriginalPack, tintSheet, type PackGraphics, type PackSettings } from './original.js';
import { HUD_HEIGHT, Renderer, WIDTH, HEIGHT, type FloatingText, type Fx, type HudState, type LevelView, type RenderAssets } from './render.js';

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
  private fx: Fx = { bursts: [], floats: [] };
  private message: { text: string; sub: string | null; until: number } | null = null;
  private endAt: number | null = null;
  private seed = Date.now() >>> 0;
  private pointer: Point = { x: WIDTH / 2, y: HEIGHT };
  private best = 0;
  private loading = true;

  constructor() {
    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, null);
    try { this.best = Number(localStorage.getItem('zuma.best') ?? 0) || 0; } catch { /* storage unavailable */ }
    this.bindInput();
    this.bindPanels();
  }

  async start(): Promise<void> {
    this.pack = await OriginalPack.load();
    await this.audio.discover();
    if (this.pack) this.renderer.assets = await this.loadAssets(this.pack);
    const badge = document.getElementById('build');
    if (badge) badge.textContent = `R${ENGINE_VERSION} · ${BUILD}${this.pack ? ' · ressources originales' : ' · rendu vectoriel'}`;
    this.loading = false;
    await this.newGame();
    requestAnimationFrame(t => this.loop(t));
  }

  // ----------------------------------------------------------------- assets

  private async loadAssets(pack: OriginalPack): Promise<RenderAssets> {
    const [balls, ballShadow, bomb, slow, backwards, accuracy, hole, grey, frogPad, tongue, menubar, gauge, gaugeGreen, lives] = await Promise.all([
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
      pack.masked('menubar'),
      pack.masked('gauge'),
      pack.masked('gaugegreen', '_gauge'),
      pack.masked('toadlives'),
    ]);
    const explosions = grey ? EXPLOSION_RGB.map(rgb => tintSheet(grey, rgb)) : EXPLOSION_RGB.map(() => null);
    return { balls, ballShadow, powers: { bomb, slow, backwards, accuracy }, hole, explosions, frogPad, tongue, menubar, gauge, gaugeGreen, lives };
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
    this.progress = { stage: 0, level: 0 };
    this.levelIndex = 0;
    this.lives = CANDIDATE.lives;
    this.carriedScore = 0;
    await this.startLevel();
  }

  private async startLevel(): Promise<void> {
    this.level = await this.resolveLevel();
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    const engine = new ZumaEngine(this.level.tracks, this.level.frog, { ...this.level.config, lives: this.lives }, this.seed);
    engine.score = this.carriedScore;
    this.engine = engine;
    this.fx = { bursts: [], floats: [] };
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
    } else {
      this.accumulator = 0;
    }
    this.frame++;
    this.fx.bursts = this.fx.bursts.filter(b => engine.tick - b.start < 40);
    this.fx.floats = this.fx.floats.filter(f => engine.tick - f.start < 70);
    this.renderer.draw(engine, this.fx, this.hud(engine), this.frame);
  }

  private hud(engine: ZumaEngine): HudState {
    const msg = this.message && this.frame < this.message.until ? this.message : null;
    return {
      levelLabel: this.level?.label ?? '',
      lives: Math.max(0, engine.lives),
      score: engine.score,
      progress: engine.zumaMode ? 1 : engine.destroyedCount / engine.config.target,
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
    on('menu-fullscreen', () => {
      const root = document.documentElement;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.();
    });
  }

  private toggleMenu(): void {
    if (this.statsOpen) return;
    this.menuOpen = !this.menuOpen;
    document.getElementById('menu')?.classList.toggle('open', this.menuOpen);
  }

  private statsOutcome: 'live' | 'won' | 'lost' | 'gameover' = 'live';

  private openStats(outcome: 'live' | 'won' | 'lost' | 'gameover'): void {
    const engine = this.engine;
    if (!engine || this.statsOpen) return;
    this.statsOutcome = outcome;
    this.statsOpen = true;
    if (engine.score > this.best) {
      this.best = engine.score;
      try { localStorage.setItem('zuma.best', String(this.best)); } catch { /* storage unavailable */ }
    }
    const title = document.getElementById('stats-title');
    if (title) {
      title.textContent = outcome === 'won' ? 'Niveau terminé' : outcome === 'lost' ? 'Vie perdue' : outcome === 'gameover' ? 'Partie terminée' : 'Statistiques';
    }
    const s = engine.stats;
    const seconds = Math.round(engine.tick / engine.config.tickHz);
    const accuracy = s.shots ? Math.round((100 * s.hits) / s.shots) : 0;
    const rows: Array<[string, string]> = [
      ['Niveau', `${this.level?.label ?? ''} · ${this.level?.name ?? ''}`],
      ['Score', String(engine.score)],
      ['Meilleur score', String(this.best)],
      ['Tirs', `${s.shots} (${accuracy} % utiles)`],
      ['Groupes détruits', `${s.matches} · ${s.destroyed} balles`],
      ['Enchaînement max', `x${s.maxCombo}`],
      ['Série max', `x${s.maxStreak}`],
      ['Bonus saut', String(s.gaps)],
      ['Power-ups', `Bombe ${s.powers.bomb} · Ralentir ${s.powers.slow} · Retour ${s.powers.backwards} · Visée ${s.powers.accuracy}`],
      ['Temps', `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s${this.level?.parTime ? ` (par ${this.level.parTime} s)` : ''}`],
      ['Vies restantes', String(Math.max(0, engine.lives))],
    ];
    const list = document.getElementById('stats-data');
    if (list) {
      list.replaceChildren(...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        return [dt, dd];
      }));
    }
    const tip = document.getElementById('stats-tip');
    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const ok = document.getElementById('result-continue');
    if (ok) ok.textContent = outcome === 'won' ? 'Niveau suivant' : outcome === 'lost' ? 'Réessayer' : outcome === 'gameover' ? 'Nouvelle partie' : 'OK';
    document.getElementById('stats')?.classList.add('open');
  }

  private async closeStats(): Promise<void> {
    document.getElementById('stats')?.classList.remove('open');
    this.statsOpen = false;
    const outcome = this.statsOutcome;
    this.statsOutcome = 'live';
    if (outcome === 'won') await this.nextLevel();
    else if (outcome === 'lost') await this.retryLevel();
    else if (outcome === 'gameover') await this.newGame();
  }
}

/** Maps original level settings (100 Hz update units) onto the engine configuration. */
export function configFromSettings(settings: PackSettings | undefined, stage: number): Partial<EngineConfig> {
  const s = settings ?? { id: 'default' };
  const colors = s.colors ?? (stage < 3 ? 4 : stage < 6 ? 5 : 6);
  const powerfreq = s.powerfreq ?? 3000;
  return {
    colors: Math.max(3, Math.min(6, colors)),
    start: s.start ?? 35,
    total: Number.POSITIVE_INFINITY,
    target: s.repeat ?? 50,
    speed: (s.speed ?? 0.5) * 100,
    slowFactor: Math.max(1, s.slowfactor ?? 4),
    projectileSpeed: ((s.firespeed ?? 6) * 100) / 60,
    powerGuardTicks: Math.round(powerfreq * 0.3),
    powerChance: 1 / Math.max(60, powerfreq * 0.3),
    levelBonus: s.score ?? 1000,
  };
}

if (typeof document !== 'undefined' && document.getElementById('game')) {
  const game = new Game();
  void game.start();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
  }
}

export { LEVELS };
