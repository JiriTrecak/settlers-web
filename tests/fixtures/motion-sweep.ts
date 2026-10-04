// Previous allocation-based sweep retained as an equivalence oracle.
import {canTraverse} from '../../src/sim/game/navigation';
import type {FixedPoint} from '../../src/sim/game/motion';
import {unitDimensions} from '../../src/content/unitScale';
/** Integer supercover DDA: every crossed cell and exact corner is checked. */
export function clearRay(from: FixedPoint, to: FixedPoint, step: (a: number, b: number) => boolean,size=256): boolean {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
  let x = Math.floor((from.x + 500) / 1000), y = Math.floor((from.y + 500) / 1000);
  const tx = Math.floor((to.x + 500) / 1000), ty = Math.floor((to.y + 500) / 1000);
  if (Math.min(x, y, tx, ty) < 0 || Math.max(x, y, tx, ty) >= size) return false;
  if (!step(y * size + x, y * size + x)) return false;
  let crossX = sx ? Math.abs(x * 1000 + sx * 500 - from.x) : 0;
  let crossY = sy ? Math.abs(y * 1000 + sy * 500 - from.y) : 0;
  while (x !== tx || y !== ty) {
    const prior = y * size + x;
    const vertical = x === tx ? 1 : y === ty ? -1 : !sx ? 1 : !sy ? -1 : crossX * ay - crossY * ax;
    if (vertical <= 0) {x += sx; crossX += 1000;}
    if (vertical >= 0) {y += sy; crossY += 1000;}
    if (!canTraverse(size, prior, y * size + x, step)) return false;
  }
  return true;
}

/** Sweep a conservative square footprint around the center line. */
export function clearSweep(from: FixedPoint, to: FixedPoint, step: (a: number, b: number) => boolean,size=256,radius=unitDimensions(1).radius*1000): boolean {
  const offsets = [[0, 0], [-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]];
  // Wider bodies must not straddle an obstacle between their center/corners.
  // Sample the interior as well, with strictly sub-cell gaps between rays.
  if (radius >= 500) {
    const divisions = Math.ceil(2 * radius / 900);
    for (let x = 0; x <= divisions; x++) for (let y = 0; y <= divisions; y++)
      offsets.push([Math.round(-radius + 2 * radius * x / divisions), Math.round(-radius + 2 * radius * y / divisions)]);
  }
  for (const [x, y] of offsets) {
    if (!clearRay({x: from.x + x, y: from.y + y}, {x: to.x + x, y: to.y + y}, step,size)) return false;
  }
  return true;
}
