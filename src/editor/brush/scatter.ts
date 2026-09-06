/**
 * Turn a painted brush mask into stamp poses. Density is expected hits per painted cell.
 */
import { inStamp, sitAllowed, type AssetType } from "../../shared";
import type { BrushMask } from "./brush";
import { pickSlot, type BrushSlot } from "./kit";

export type BrushPose = { x: number; y: number; yaw: number; asset: string; scale: number };

const MIN_DIST = 0.85;

export type ScatterRules = {
  wet?: (x: number, z: number) => boolean;
  kind?: (id: string) => AssetType | undefined;
};

export function scatterBrush(
  mask: BrushMask,
  existing: readonly { x: number; y: number }[],
  slots: readonly BrushSlot[],
  rng: () => number = Math.random,
  rules: ScatterRules = {},
): BrushPose[] {
  const out: BrushPose[] = [];
  const spots = existing.map((s) => ({ x: s.x + 0.5, y: s.y + 0.5 }));
  const { origin, span, weights, density } = mask;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (w < 0.08) continue;
    const tries = poisson(w * density, rng);
    const cx = origin + (i % span);
    const cz = origin + Math.floor(i / span);
    for (let t = 0; t < tries; t++) {
      const x = cx + rng();
      const y = cz + rng();
      if (!inStamp(Math.floor(x), Math.floor(y))) continue;
      if (mask.sample(x, y) < 0.12) continue;
      if (tooClose(x, y, spots)) continue;
      const slot = pickSlot(slots, rng);
      if (!slot) continue;
      if (rules.wet && !sitAllowed(rules.kind?.(slot.asset), rules.wet(x, y))) continue;
      const pose = { x: x - 0.5, y: y - 0.5, yaw: rng() * Math.PI * 2, asset: slot.asset, scale: slot.scale };
      out.push(pose);
      spots.push({ x, y });
    }
  }
  return out;
}

function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function tooClose(x: number, y: number, spots: readonly { x: number; y: number }[]): boolean {
  const min2 = MIN_DIST * MIN_DIST;
  for (const s of spots) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < min2) return true;
  }
  return false;
}
