import {weatherSchema,type WeatherSettings} from './weather';
import { validDecal, type GroundDecal } from './decal';
import { parseWaterStyle, type WaterStyle } from './waterStyle';
import type { RiverStroke } from './riverFlow';
/** Catmull–Rom brush centerline, sampled independently of pointer/event rate. */
export type CurvePoint = { x: number; z: number; radius?: number };
export type CurveSample = { x: number; z: number; radius: number };
export function sampleCurve(points: readonly CurvePoint[], radius = 4, spacing = 0.5): CurveSample[] {
  if (!points.length) return [];
  if (points.length === 1) return [{ ...points[0]!, radius: points[0]!.radius ?? radius }];
  const out: CurveSample[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)]!, b = points[i]!, c = points[i + 1]!, d = points[Math.min(points.length - 1, i + 2)]!;
    const count = Math.max(2, Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / spacing) * 2);
    for (let j = 0; j < count; j++) {
      const t = j / count;
      const at = (a: number, b: number, c: number, d: number) => 0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t);
      out.push({ x: at(a.x,b.x,c.x,d.x), z: at(a.z,b.z,c.z,d.z), radius: (b.radius ?? radius) * (1-t) + (c.radius ?? radius)*t });
    }
  }
  const last = points[points.length-1]!;
  out.push({ ...last, radius: last.radius ?? radius });
  return out;
}
export function curveDistance(x: number, z: number, curve: readonly CurveSample[]): number {
  let best = Infinity;
  for (let i=0; i<curve.length; i++) {
    const a=curve[i]!, b=curve[i+1] ?? a;
    const dx=b.x-a.x, dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1)));
    const r=a.radius+(b.radius-a.radius)*t;
    best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t)/Math.max(0.1,r));
  }
  return best;
}
export type TerrainLayer = 'grass' | 'sand' | 'mud' | 'rock' | 'snow';
export type TerrainStroke = { points: CurvePoint[]; radius: number; layer: TerrainLayer; opacity: number };
export type CoverExclusion = { x: number; z: number; radius: number };
export type CoverPatch = { exclusions?: CoverExclusion[]; x: number; z: number; radius: number; density: number; seed: number; flowers: number; grassScale?: number; broadRatio?: number; palette?: 'meadow' | 'straw' | 'ochre' | 'sage' | 'forest' };
export type EnvironmentState = { weather?: WeatherSettings; preset?: string; hour: number; season: 'spring' | 'summer' | 'autumn'; playing: boolean };
export type Landscape = { decals?: GroundDecal[]; water?: WaterStyle; rivers?: RiverStroke[]; strokes: TerrainStroke[]; cover: CoverPatch[]; environment: EnvironmentState };
export const emptyLandscape = (): Landscape => ({ strokes: [], cover: [], environment: { hour: 10, season: 'summer', playing: false } });
/** Strict persisted scene validation: malformed new fields never break legacy maps. */
export function parseLandscape(raw: unknown): Landscape | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o=raw as Landscape;
  if(o.decals!==undefined&&(!Array.isArray(o.decals)||o.decals.length>2048||!o.decals.every(validDecal)||new Set(o.decals.map(d=>d.id)).size!==o.decals.length))return undefined;
  if(o.water!==undefined&&!parseWaterStyle(o.water))return undefined;
  if (!Array.isArray(o.strokes) || !Array.isArray(o.cover) || !o.environment) return undefined;
  const finite=(v: unknown) => typeof v==='number' && Number.isFinite(v);
  if (!o.strokes.every(s=>s && typeof s==='object' && ['grass','sand','mud','rock','snow'].includes(s.layer) && finite(s.radius) && s.radius>0 && s.radius<=64 && finite(s.opacity) && s.opacity>=0 && s.opacity<=1 && Array.isArray(s.points) && s.points.length>0 && s.points.length<=128 && s.points.every(p=>p && typeof p==='object' && finite(p.x)&&finite(p.z)&&(p.radius===undefined||(finite(p.radius)&&p.radius>0&&p.radius<=64))))) return undefined;
  if (!o.cover.every(p=>p && typeof p==='object' && [p.x,p.z,p.radius,p.density,p.seed,p.flowers].every(finite)&&p.radius>0&&p.radius<=100&&p.density>=0&&p.density<=12&&p.flowers>=0&&p.flowers<=1&&(p.grassScale===undefined||(finite(p.grassScale)&&p.grassScale>=.2&&p.grassScale<=4))&&(p.broadRatio===undefined||(finite(p.broadRatio)&&p.broadRatio>=0&&p.broadRatio<=1))&&(p.exclusions===undefined||(Array.isArray(p.exclusions)&&p.exclusions.every(e=>e&&finite(e.x)&&finite(e.z)&&finite(e.radius)&&e.radius>0&&e.radius<=32)))&&(p.palette===undefined||['meadow','straw','ochre','sage','forest'].includes(p.palette)))) return undefined;
  if(o.rivers!==undefined && (!Array.isArray(o.rivers)||!o.rivers.every(r=>r&&typeof r==='object'&&finite(r.depth)&&finite(r.radius)&&r.radius>0&&r.radius<=64&&Array.isArray(r.points)&&r.points.length>0&&r.points.length<=128&&r.points.every(p=>p&&finite(p.x)&&finite(p.z)&&(p.radius===undefined||(finite(p.radius)&&p.radius>0&&p.radius<=64))))))return undefined;
  if (!finite(o.environment.hour)||!['spring','summer','autumn'].includes(o.environment.season)||typeof o.environment.playing!=='boolean') return undefined;
  if(o.environment.weather!==undefined&&!weatherSchema.safeParse(o.environment.weather).success)return undefined;
  if(o.environment.preset!==undefined&&(typeof o.environment.preset!=='string'||!o.environment.preset.length||o.environment.preset.length>128))return undefined;
  return o;
}

/** Rasterize only segment bounds, avoiding every-terrain-vertex × every-path-segment scans. */
export function rasterizeCurve(curve: readonly CurveSample[], verts:number, origin:number): Float32Array {
  const distance=new Float32Array(verts*verts).fill(1);
  for(let segment=0;segment<curve.length;segment++){
    const a=curve[segment]!,b=curve[segment+1]??a,r=Math.max(a.radius,b.radius,.1);
    const loX=Math.max(0,Math.floor(Math.min(a.x,b.x)-r-origin)),hiX=Math.min(verts-1,Math.ceil(Math.max(a.x,b.x)+r-origin));
    const loZ=Math.max(0,Math.floor(Math.min(a.z,b.z)-r-origin)),hiZ=Math.min(verts-1,Math.ceil(Math.max(a.z,b.z)+r-origin));
    const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz||1;
    for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
      const x=ix+origin,z=iz+origin,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length));
      const d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t)/Math.max(.1,a.radius+(b.radius-a.radius)*t),i=iz*verts+ix;
      if(d<distance[i]!)distance[i]=d;
    }
  }
  return distance;
}
