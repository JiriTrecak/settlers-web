import type { Entity, Point } from './state';
import {unitDimensions} from '../../content/unitScale';

export const POSITION_SCALE = 1000;
const BASE_UNIT_RADIUS = unitDimensions(1).radius * POSITION_SCALE;
export type FixedPoint = {x: number; y: number; surface?:string};
export const fixed = (p: Point): FixedPoint => ({x: p.x * POSITION_SCALE, y: p.y * POSITION_SCALE, ...(p.surface?{surface:p.surface}:{})});
export const motionCell = (p: FixedPoint,size=256) => Math.floor((p.y + 500) / 1000) * size + Math.floor((p.x + 500) / 1000);
export const precise = (e: Entity): Point => ({
  x:e.unit?.position ? e.unit.position.x/POSITION_SCALE : e.x,
  y:e.unit?.position ? e.unit.position.y/POSITION_SCALE : e.y,
  ...(e.surface?{surface:e.surface}:{}),
});
export const atPoint = (e: Entity, p: Point) => {
  const position = e.unit?.position;
  if(e.surface!==p.surface)return false;
  return position ? position.x === p.x * POSITION_SCALE && position.y === p.y * POSITION_SCALE : e.x === p.x && e.y === p.y;
};
export function lengthCeil(dx: number, dy: number) {
  const square = dx * dx + dy * dy;
  let length = Math.floor(Math.sqrt(square));
  while (length * length < square) length++;
  while (length && (length - 1) * (length - 1) >= square) length--;
  return length;
}

/** Integer supercover DDA: every crossed cell and exact corner is checked. */
export function clearRay(from: FixedPoint, to: FixedPoint, step: (a: number, b: number) => boolean,size=256): boolean {
  return clearRayCoordinates(from.x,from.y,to.x,to.y,step,size);
}
/** Rasterize the actual sub-cell polyline, rather than connecting rounded mesh
 * corners (which can cut across an obstacle). Only accepted center cells enter
 * the route; diagonal side-cell validation is not mistaken for path traversal. */
export function appendRayCells(from:FixedPoint,to:FixedPoint,step:(a:number,b:number)=>boolean,size:number,path:number[]):boolean {
  return clearRayCoordinates(from.x,from.y,to.x,to.y,step,size,cell=>path.push(cell));
}
function clearRayCoordinates(fromX:number,fromY:number,toX:number,toY:number,step:(a:number,b:number)=>boolean,size:number,visit?:(cell:number)=>void):boolean {
  const dx = toX - fromX, dy = toY - fromY;
  const ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
  let x = Math.floor((fromX + 500) / 1000), y = Math.floor((fromY + 500) / 1000);
  const tx = Math.floor((toX + 500) / 1000), ty = Math.floor((toY + 500) / 1000);
  if (Math.min(x, y, tx, ty) < 0 || Math.max(x, y, tx, ty) >= size) return false;
  if (!step(y * size + x, y * size + x)) return false;
  let crossX = sx ? Math.abs(x * 1000 + sx * 500 - fromX) : 0;
  let crossY = sy ? Math.abs(y * 1000 + sy * 500 - fromY) : 0;
  while (x !== tx || y !== ty) {
    const prior = y * size + x;
    const vertical = x === tx ? 1 : y === ty ? -1 : !sx ? 1 : !sy ? -1 : crossX * ay - crossY * ax;
    if (vertical <= 0) {x += sx; crossX += 1000;}
    if (vertical >= 0) {y += sy; crossY += 1000;}
    const next = y * size + x;
    // DDA already established adjacency, bounds and which axes crossed.
    // Recomputing those from cell IDs repeats divisions for every footprint ray.
    if (!step(prior, next)) return false;
    if (vertical === 0) {
      const sideX = prior + sx, sideY = prior + sy * size;
      if (!step(prior, sideX) || !step(prior, sideY) ||
          !step(sideX, next) || !step(sideY, next)) return false;
    }
    visit?.(y*size+x);
  }
  return true;
}

// Derived geometry only. Bound the cache for custom content with many body sizes.
const sweepPatterns=new Map<number,readonly (readonly number[])[]>();
function sweepPattern(radius:number):readonly (readonly number[])[]{
  const cached=sweepPatterns.get(radius);if(cached)return cached;
  const offsets = [[0, 0], [-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]];
  // Wider bodies must not straddle an obstacle between their center/corners.
  // Sample the interior as well, with strictly sub-cell gaps between rays.
  if (radius >= 500) {
    const divisions = Math.ceil(2 * radius / 900);
    for (let x = 0; x <= divisions; x++) for (let y = 0; y <= divisions; y++)
      offsets.push([Math.round(-radius + 2 * radius * x / divisions), Math.round(-radius + 2 * radius * y / divisions)]);
  }
  // The interior lattice also contains all four corners (and, for even
  // divisions, the center). Trace each physical ray once, in its original order.
  const seen=new Set<string>(),unique=offsets.filter(([x,y])=>{
    const key=`${x}/${y}`;if(seen.has(key))return false;seen.add(key);return true;
  });
  if(sweepPatterns.size>=32)sweepPatterns.delete(sweepPatterns.keys().next().value!);
  sweepPatterns.set(radius,unique);return unique;
}
/** Sweep a conservative square footprint around the center line. */
export function clearSweep(from: FixedPoint, to: FixedPoint, step: (a: number, b: number) => boolean,size=256,radius=BASE_UNIT_RADIUS): boolean {
  for (const [x, y] of sweepPattern(radius)) {
    if (!clearRayCoordinates(from.x+x,from.y+y,to.x+x,to.y+y,step,size)) return false;
  }
  return true;
}
