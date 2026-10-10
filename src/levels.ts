/** Level catalogue: track geometry, colour count, chain length and speeds. */
import type { Point } from './core.js';

export interface LevelDef {
  name: string;
  track: Point[];
  frog: Point;
  colors: number;
  start: number;
  total: number;
  /** Points to score in the level to enter ZUMA mode (≈ 10 per destroyed ball). */
  target: number;
  speed: number;
}

const CENTRE: Point = { x: 320, y: 262 };

/** Centripetal Catmull-Rom sampling of a control polyline, ~4 px between samples. */
export function smooth(controls: Point[], step = 4): Point[] {
  if (controls.length < 3) return controls.slice();
  const pts = [controls[0], ...controls, controls[controls.length - 1]];
  const out: Point[] = [];
  for (let i = 1; i + 2 < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.max(2, Math.ceil(segLen / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export interface SpiralOptions {
  centre?: Point;
  rx0: number;
  ry0: number;
  rx1: number;
  ry1: number;
  turns: number;
  startAngle: number;
  clockwise?: boolean;
  leadIn?: Point;
}

/** Elliptical spiral winding inward around the frog. */
export function spiral(o: SpiralOptions): Point[] {
  const c = o.centre ?? CENTRE;
  const dir = o.clockwise === false ? -1 : 1;
  const pts: Point[] = [];
  if (o.leadIn) pts.push(o.leadIn);
  const samples = Math.ceil(o.turns * 120);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const angle = o.startAngle + dir * t * o.turns * Math.PI * 2;
    const rx = o.rx0 + (o.rx1 - o.rx0) * t;
    const ry = o.ry0 + (o.ry1 - o.ry0) * t;
    pts.push({ x: c.x + Math.cos(angle) * rx, y: c.y + Math.sin(angle) * ry });
  }
  return pts;
}

export const LEVELS: LevelDef[] = [
  {
    name: 'Spirale du temple',
    track: spiral({ rx0: 300, ry0: 205, rx1: 92, ry1: 72, turns: 2.1, startAngle: Math.PI, leadIn: { x: -40, y: 262 } }),
    frog: CENTRE,
    colors: 4,
    start: 18,
    total: 56,
    target: 360,
    speed: 22,
  },
  {
    name: 'Rivière de pierre',
    track: smooth([
      { x: -40, y: 90 }, { x: 120, y: 80 }, { x: 320, y: 70 }, { x: 540, y: 90 }, { x: 600, y: 180 },
      { x: 580, y: 300 }, { x: 540, y: 420 }, { x: 320, y: 450 }, { x: 110, y: 420 }, { x: 60, y: 300 },
      { x: 90, y: 170 }, { x: 200, y: 150 }, { x: 440, y: 160 }, { x: 500, y: 260 }, { x: 440, y: 360 },
      { x: 240, y: 370 }, { x: 190, y: 290 },
    ]),
    frog: CENTRE,
    colors: 4,
    start: 20,
    total: 64,
    target: 420,
    speed: 24,
  },
  {
    name: 'Serpent des sables',
    track: spiral({ rx0: 305, ry0: 210, rx1: 96, ry1: 74, turns: 2.6, startAngle: 0, clockwise: false, leadIn: { x: 680, y: 262 } }),
    frog: CENTRE,
    colors: 5,
    start: 22,
    total: 72,
    target: 480,
    speed: 26,
  },
  {
    name: 'Anneaux jumeaux',
    track: smooth([
      { x: 320, y: -40 }, { x: 330, y: 60 }, { x: 150, y: 90 }, { x: 60, y: 200 }, { x: 70, y: 330 },
      { x: 180, y: 430 }, { x: 320, y: 445 }, { x: 460, y: 430 }, { x: 570, y: 330 }, { x: 580, y: 200 },
      { x: 490, y: 90 }, { x: 400, y: 120 }, { x: 440, y: 230 }, { x: 420, y: 340 }, { x: 320, y: 380 },
      { x: 210, y: 340 }, { x: 180, y: 240 }, { x: 230, y: 175 },
    ]),
    frog: CENTRE,
    colors: 5,
    start: 24,
    total: 80,
    target: 540,
    speed: 28,
  },
  {
    name: 'Œil du jaguar',
    track: spiral({ rx0: 310, ry0: 215, rx1: 95, ry1: 72, turns: 3.1, startAngle: Math.PI / 2, leadIn: { x: 320, y: 520 } }),
    frog: CENTRE,
    colors: 6,
    start: 26,
    total: 90,
    target: 600,
    speed: 30,
  },
  {
    name: 'Couloir des ombres',
    track: smooth([
      { x: -40, y: 420 }, { x: 100, y: 430 }, { x: 300, y: 440 }, { x: 520, y: 430 }, { x: 590, y: 340 },
      { x: 560, y: 220 }, { x: 540, y: 110 }, { x: 420, y: 70 }, { x: 230, y: 70 }, { x: 90, y: 100 },
      { x: 60, y: 220 }, { x: 110, y: 330 }, { x: 230, y: 360 }, { x: 410, y: 350 }, { x: 460, y: 260 },
      { x: 420, y: 170 }, { x: 300, y: 150 }, { x: 210, y: 200 },
    ]),
    frog: CENTRE,
    colors: 6,
    start: 28,
    total: 100,
    target: 680,
    speed: 32,
  },
];

/** Levels beyond the catalogue cycle through it with a faster, longer chain. */
export function levelFor(index: number): LevelDef {
  const base = LEVELS[index % LEVELS.length];
  const lap = Math.floor(index / LEVELS.length);
  if (lap === 0) return base;
  return {
    ...base,
    name: `${base.name} ${'I'.repeat(Math.min(3, lap + 1))}`,
    colors: Math.min(6, base.colors + lap),
    total: base.total + 12 * lap,
    target: base.target + 80 * lap,
    speed: base.speed + 4 * lap,
  };
}
