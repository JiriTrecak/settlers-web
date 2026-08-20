/**
 * MaxRects BSSF. No rotate — nearest-neighbor frames must stay upright.
 * `pad` is a 1px edge-clone gutter so zoomed UVs don't bleed.
 */
export type Size = { w: number; h: number };

export type PackedFrame = {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PackedPage = {
  frames: PackedFrame[];
  /** Occupied texels including pad, not the sprite pixels. */
  filled: number;
};

type Rect = { x: number; y: number; w: number; h: number };

export function packPages(sizes: readonly Size[], page: number, pad: number): {
  pages: PackedPage[];
  skipped: number[];
} {
  const skipped: number[] = [];
  const pending: { i: number; w: number; h: number }[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]!;
    if (s.w + pad * 2 > page || s.h + pad * 2 > page || s.w <= 0 || s.h <= 0) skipped.push(i);
    else pending.push({ i, w: s.w, h: s.h });
  }
  pending.sort((a, b) => {
    const as = Math.max(a.w, a.h);
    const bs = Math.max(b.w, b.h);
    return bs - as || b.w * b.h - a.w * a.h || a.i - b.i;
  });
  const pages: PackedPage[] = [];
  let rest = pending;
  while (rest.length > 0) {
    const { placed, leftover } = packOne(rest, page, pad);
    if (placed.frames.length === 0) {
      for (const r of leftover) skipped.push(r.i);
      break;
    }
    pages.push(placed);
    rest = leftover;
  }
  return { pages, skipped };
}

function packOne(
  items: readonly { i: number; w: number; h: number }[],
  page: number,
  pad: number,
): { placed: PackedPage; leftover: { i: number; w: number; h: number }[] } {
  const free: Rect[] = [{ x: 0, y: 0, w: page, h: page }];
  const frames: PackedFrame[] = [];
  const leftover: { i: number; w: number; h: number }[] = [];
  let filled = 0;
  for (const item of items) {
    const bw = item.w + pad * 2;
    const bh = item.h + pad * 2;
    const slot = findSlot(free, bw, bh);
    if (!slot) {
      leftover.push(item);
      continue;
    }
    frames.push({ i: item.i, x: slot.x + pad, y: slot.y + pad, w: item.w, h: item.h });
    filled += bw * bh;
    splitFree(free, { x: slot.x, y: slot.y, w: bw, h: bh });
  }
  return { placed: { frames, filled }, leftover };
}

function findSlot(free: readonly Rect[], w: number, h: number): Rect | null {
  let best: Rect | null = null;
  let bestSs = Infinity;
  let bestLs = Infinity;
  for (const f of free) {
    if (w > f.w || h > f.h) continue;
    const ss = Math.min(f.w - w, f.h - h);
    const ls = Math.max(f.w - w, f.h - h);
    if (ss < bestSs || (ss === bestSs && ls < bestLs)) {
      best = f;
      bestSs = ss;
      bestLs = ls;
    }
  }
  return best;
}

function splitFree(free: Rect[], used: Rect): void {
  const next: Rect[] = [];
  for (const f of free) {
    if (!overlap(f, used)) {
      next.push(f);
      continue;
    }
    if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    const ur = used.x + used.w;
    const fr = f.x + f.w;
    if (ur < fr) next.push({ x: ur, y: f.y, w: fr - ur, h: f.h });
    if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    const ub = used.y + used.h;
    const fb = f.y + f.h;
    if (ub < fb) next.push({ x: f.x, y: ub, w: f.w, h: fb - ub });
  }
  free.length = 0;
  free.push(...prune(next));
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function contains(a: Rect, b: Rect): boolean {
  return a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
}

function prune(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!;
    if (a.w <= 0 || a.h <= 0) continue;
    let inside = false;
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      if (contains(rects[j]!, a)) {
        inside = true;
        break;
      }
    }
    if (!inside) out.push(a);
  }
  return out;
}

/** Copy `src` into `dest` at (dx, dy) and clone the edge into a `pad` gutter. */
export function blitPadded(
  dest: Uint8ClampedArray,
  destW: number,
  destH: number,
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  pad: number,
): void {
  const x0 = dx - pad;
  const y0 = dy - pad;
  const x1 = dx + srcW + pad;
  const y1 = dy + srcH + pad;
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= destH) continue;
    const sy = clamp(y - dy, 0, srcH - 1);
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= destW) continue;
      const sx = clamp(x - dx, 0, srcW - 1);
      const si = (sy * srcW + sx) * 4;
      const di = (y * destW + x) * 4;
      dest[di] = src[si]!;
      dest[di + 1] = src[si + 1]!;
      dest[di + 2] = src[si + 2]!;
      dest[di + 3] = src[si + 3]!;
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
