import type {Bounds} from './footprint';

/** Construction tolerates rolling ground, but not a terrain tier or a sharp ledge.
 * Heights are integer centimetres, shared by simulation, AI and map validation. */
export const MAX_FOUNDATION_RELIEF_CM = 200;
export const MAX_FOUNDATION_STEP_CM = 40;

/** Inclusive navigation-cell bounds. Water, occupancy and access are separate checks. */
export function foundationTerrainFits(bounds:Bounds,heightCm:(x:number,y:number)=>number):boolean {
 let low=Infinity,high=-Infinity;
 for(let y=bounds.minY;y<=bounds.maxY;y++)for(let x=bounds.minX;x<=bounds.maxX;x++){
  const h=heightCm(x,y);
  if(!Number.isFinite(h))return false;
  low=Math.min(low,h);high=Math.max(high,h);
  if(high-low>MAX_FOUNDATION_RELIEF_CM)return false;
  if(x>bounds.minX&&Math.abs(h-heightCm(x-1,y))>MAX_FOUNDATION_STEP_CM)return false;
  if(y>bounds.minY&&Math.abs(h-heightCm(x,y-1))>MAX_FOUNDATION_STEP_CM)return false;
 }
 return low!==Infinity;
}
