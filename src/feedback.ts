  if(event.kind==='power-activate'){const key=({bomb:'powerbomb',slow:'powerslow',backwards:'powerback',accuracy:'poweraccuracy'} as Record<string,string>)[String(event.power)];return key?[{key,gain:1,rate:1}]:[];}\n/** Presentation rules anchored to M11_*.asm.txt. Never consume the simulation RNG here.
 * Timing in ticks is static evidence; the conversion to seconds follows the still-candidate engine Hz. */
import {SeededRandom,type GameEvent} from './core.js';
export interface SoundCue {key:string;gain:number;rate:number}
export function soundCues(event:GameEvent):SoundCue[] {
  const simple:Record<string,string>={fire:'fire',insert:'insert',merge:'merge',swap:'swap',zuma:'zuma',won:'levelwin'};
  if(simple[event.kind])return [{key:simple[event.kind],gain:1,rate:1}];
  if(event.kind==='streak'){const n=Math.max(5,Math.trunc(Number(event.streak)||5));return [{key:'streak',gain:1,rate:Math.pow(2,(n-5)/12)}];}
  if(event.kind==='gap'){const count=Math.max(1,Math.trunc(Number(event.count)||1));return Array.from({length:Math.min(3,count)},(_,i)=>({key:'gap',gain:1,rate:Math.pow(2,(i===0?0:i+1)/12)}));}
  if(event.kind!=='destroy')return [];
  const index=Math.max(0,Math.trunc(Number(event.depth)||1)-1);
  return [{key:'destroy'+Math.min(5,index+1),gain:1,rate:1},{key:'combo',gain:Math.min(1,.4+.2*index),rate:Math.pow(2,Math.min(index,24)/6)}];
}
export const EXPLOSION_RGB=[0x80ffff,0xffff40,0xffaaaa,0x80ff80,0xff80ff,0xffffff] as const;
export const PARTICLE_RGB=[0x1980ff,0xffff00,0xff0000,0x00ff00,0xff00ff,0xffffff] as const;
export const EXPLOSION_FRAME_TICKS=3,EXPLOSION_FRAME_COUNT=13,PARTICLE_LIFE_TICKS=40,PARTICLE_COUNT=60;
export function explosionFrame(counter:number):number {const frame=Math.floor(counter/EXPLOSION_FRAME_TICKS);return counter>=0&&frame<EXPLOSION_FRAME_COUNT?frame:-1;}
export function particleAlpha(counter:number):number {return Math.max(0,Math.min(1,(PARTICLE_LIFE_TICKS-counter)/20));}
export function particleColor(color:number):string {const rgb=PARTICLE_RGB[color]??0xffffff;const r=Math.min(255,((rgb>>16)&255)+200),g=Math.min(255,((rgb>>8)&255)+200),b=Math.min(255,(rgb&255)+200);return `rgb(${r},${g},${b})`;}
export interface BurstParticle {x:number;y:number;vx:number;vy:number;size:number}
export interface ColorBurst {id:number;x:number;y:number;color:number;start:number;particles:BurstParticle[]}
export function makeColorBurst(ball:{id:number;x:number;y:number;color:number},tick:number):ColorBurst {
  const random=new SeededRandom((Math.imul(ball.id,0x45d9f3b)^Math.imul(tick,0x119de1f3))>>>0),ri=(n:number)=>Math.floor(random.next()*n);
  const particles=Array.from({length:PARTICLE_COUNT},()=>{const angle=Math.fround(ri(360)*3.141590118408203/180),speed=Math.fround(ri(500)/500);const vx=Math.fround(Math.fround(Math.cos(angle))*speed),vy=Math.fround(Math.fround(Math.sin(angle))*speed),offset=ri(30);return{x:Math.fround(ball.x+offset*vx),y:Math.fround(ball.y+offset*vy),vx,vy,size:ri(10)<2?2:1};});
  return {...ball,start:tick,particles};
}
