import { Vector3, type Camera } from "three";

export type UnitPickBody = {id: number; position: Vector3; height: number};
type Viewport = {left: number; top: number; width: number; height: number};

/** A padded screen-space capsule. CSS pixels keep clicks comfortable at every render resolution. */
export function pickUnitBody(bodies: Iterable<UnitPickBody>, camera: Camera, viewport: Viewport, x: number, y: number): number | null {
  const foot = new Vector3(), head = new Vector3();
  let best: number | null = null, bestDistance = Infinity, bestDepth = Infinity;
  for (const body of bodies) {
    foot.copy(body.position).project(camera);
    head.copy(body.position).add(new Vector3(0, body.height, 0)).project(camera);
    if (foot.z < -1 || foot.z > 1 || head.z < -1 || head.z > 1) continue;
    const fx = viewport.left + (foot.x + 1) * viewport.width / 2;
    const fy = viewport.top + (1 - foot.y) * viewport.height / 2;
    const hx = viewport.left + (head.x + 1) * viewport.width / 2;
    const hy = viewport.top + (1 - head.y) * viewport.height / 2;
    const dx = hx - fx, dy = hy - fy, length2 = dx * dx + dy * dy;
    // Include the body width plus a forgiving margin, with a 28px minimum diameter.
    const radius = Math.max(14, Math.sqrt(length2) * .24 + 7);
    const t = length2 ? Math.max(0, Math.min(1, ((x - fx) * dx + (y - fy) * dy) / length2)) : 0;
    const distance = (x - fx - t * dx) ** 2 + (y - fy - t * dy) ** 2;
    if (distance > radius * radius) continue;
    if (distance < bestDistance || (distance === bestDistance && (foot.z < bestDepth || (foot.z === bestDepth && body.id < best!)))) {
      best = body.id; bestDistance = distance; bestDepth = foot.z;
    }
  }
  return best;
}
