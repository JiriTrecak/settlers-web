import { canTraverse } from './navigation';
import type { Entity, Point } from './state';

export const POSITION_SCALE = 1000;
export const UNIT_RADIUS = 200;
export type FixedPoint = {x: number; y: number};
export const fixed = (p: Point): FixedPoint => ({x: p.x * POSITION_SCALE, y: p.y * POSITION_SCALE});
export const motionCell = (p: FixedPoint) => Math.floor((p.y + 500) / 1000) * 256 + Math.floor((p.x + 500) / 1000);
export const precise = (e: Entity): Point => e.unit?.position
  ? {x: e.unit.position.x / POSITION_SCALE, y: e.unit.position.y / POSITION_SCALE} : e;
export const atPoint = (e: Entity, p: Point) => {
  const position = e.unit?.position;
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
export function clearRay(from: FixedPoint, to: FixedPoint, step: (a: number, b: number) => boolean): boolean {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
  let x = Math.floor((from.x + 500) / 1000), y = Math.floor((from.y + 500) / 1000);
  const tx = Math.floor((to.x + 500) / 1000), ty = Math.floor((to.y + 500) / 1000);
  if (Math.min(x, y, tx, ty) < 0 || Math.max(x, y, tx, ty) > 255) return false;
  if (!step(y * 256 + x, y * 256 + x)) return false;
  let crossX = sx ? Math.abs(x * 1000 + sx * 500 - from.x) : 0;
  let crossY = sy ? Math.abs(y * 1000 + sy * 500 - from.y) : 0;
  while (x !== tx || y !== ty) {
    const prior = y * 256 + x;
    const vertical = x === tx ? 1 : y === ty ? -1 : !sx ? 1 : !sy ? -1 : crossX * ay - crossY * ax;
    if (vertical <= 0) {x += sx; crossX += 1000;}
    if (vertical >= 0) {y += sy; crossY += 1000;}
    if (!canTraverse(256, prior, y * 256 + x, step)) return false;
  }
  return true;
}

/** Sweep a conservative square footprint around the center line. */
export function clearSweep(from: FixedPoint, to: FixedPoint, step: (a: number, b: number) => boolean): boolean {
  for (const [x, y] of [[0, 0], [-UNIT_RADIUS, -UNIT_RADIUS], [UNIT_RADIUS, -UNIT_RADIUS], [-UNIT_RADIUS, UNIT_RADIUS], [UNIT_RADIUS, UNIT_RADIUS]]) {
    if (!clearRay({x: from.x + x, y: from.y + y}, {x: to.x + x, y: to.y + y}, step)) return false;
  }
  return true;
}
