/**
 * Select / move / rotate authored stamps. Drag moves; Shift-drag orbits yaw around the stamp.
 */
import { inStamp, type MapStamp } from "../../shared";

export const YAW_STEP = Math.PI / 12;

export class SelectTool {
  id: string | null = null;
  private grab: Grab | null = null;

  get grabbing(): boolean {
    return this.grab !== null;
  }

  clear(): void {
    this.id = null;
    this.grab = null;
  }

  select(id: string | null): void {
    this.id = id;
    this.grab = null;
  }

  begin(stamp: MapStamp, hit: { x: number; z: number }, rotate: boolean): void {
    this.id = stamp.id;
    this.grab = {
      mode: rotate ? "rotate" : "move",
      sx: stamp.x,
      sy: stamp.y,
      hx: hit.x,
      hz: hit.z,
      yaw: stamp.yaw ?? 0,
      a0: Math.atan2(hit.x - (stamp.x + 0.5), hit.z - (stamp.y + 0.5)),
    };
  }

  drag(hit: { x: number; z: number }): { x: number; y: number; yaw: number } | null {
    const g = this.grab;
    if (!g) return null;
    if (g.mode === "move") return { x: g.sx + (hit.x - g.hx), y: g.sy + (hit.z - g.hz), yaw: g.yaw };
    const a = Math.atan2(hit.x - (g.sx + 0.5), hit.z - (g.sy + 0.5));
    return { x: g.sx, y: g.sy, yaw: g.yaw + (a - g.a0) };
  }

  end(): void {
    this.grab = null;
  }
}

export function nearestStamp(stamps: readonly MapStamp[], x: number, z: number, max = 1.6): MapStamp | null {
  let best: MapStamp | null = null;
  let bestD = max;
  for (const s of stamps) {
    const d = Math.hypot(s.x + 0.5 - x, s.y + 0.5 - z);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

export function wrapYaw(rad: number): number {
  const t = rad % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

export function withPose(stamp: MapStamp, x: number, y: number, yaw: number): MapStamp | null {
  if (!inStamp(x, y)) return null;
  const y0 = wrapYaw(yaw);
  const { yaw: _oldYaw, ...rest } = stamp;
  const next: MapStamp = { ...rest, x, y };
  const out = y0 < 1e-4 || Math.abs(y0 - Math.PI * 2) < 1e-4 ? next : { ...next, yaw: y0 };
  return stamp.scale !== undefined && stamp.scale !== 1 ? { ...out, scale: stamp.scale } : out;
}

type Grab = {
  mode: "move" | "rotate";
  sx: number;
  sy: number;
  hx: number;
  hz: number;
  yaw: number;
  a0: number;
};
