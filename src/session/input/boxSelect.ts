/**
 * Screen-space marquee hit test. MapInput draws the rect; Session picks units.
 */
import { HEX_DELTAS, type GridPos } from "../../shared";
import { isControllable, type SettlerKind } from "../../sim";

export type ScreenPt = { x: number; y: number };

/** Below this, shift+drag is a click. */
export const BOX_CLICK_PX = 4;

export function isClick(a: ScreenPt, b: ScreenPt): boolean {
  return Math.abs(b.x - a.x) < BOX_CLICK_PX && Math.abs(b.y - a.y) < BOX_CLICK_PX;
}

export function inBox(p: ScreenPt, a: ScreenPt, b: ScreenPt): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
}

export type MarqueeUnit = {
  id: number;
  pos: GridPos;
  inside: boolean;
  player: number;
  type: string;
};

/** Own controllable outdoor units whose tile origin sits in the screen rect. */
export function idsInMarquee(
  movables: readonly MarqueeUnit[],
  a: ScreenPt,
  b: ScreenPt,
  me: number,
  toScreen: (pos: GridPos) => ScreenPt,
): number[] {
  if (isClick(a, b)) return [];
  const out: number[] = [];
  for (const m of movables) {
    if (m.inside || m.player !== me || !isControllable(m.type as SettlerKind)) continue;
    if (inBox(toScreen(m.pos), a, b)) out.push(m.id);
  }
  return out;
}

/** BFS ring around `center`, closest first. Caller filters walkable. */
export function tilesAround(center: GridPos, n: number): GridPos[] {
  if (n <= 0) return [];
  const out: GridPos[] = [];
  const seen = new Set<string>([`${center.x},${center.y}`]);
  const q: GridPos[] = [center];
  for (let i = 0; i < q.length && out.length < n; i++) {
    const p = q[i]!;
    out.push(p);
    for (const d of HEX_DELTAS) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return out;
}
