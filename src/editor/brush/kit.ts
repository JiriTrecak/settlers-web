/**
 * Weighted asset set the foliage brush scatters from.
 * Slots are addressed by id — same asset can appear twice at different scales.
 */
export type BrushSlot = {
  readonly id: string;
  readonly asset: string;
  /** Relative chance. Normalized at pick time. */
  readonly pct: number;
  readonly scale: number;
};

export const BRUSH_SCALE_MIN = 0.2;
export const BRUSH_SCALE_MAX = 4;

export class BrushKit {
  slots: BrushSlot[] = [];

  add(asset: string): void {
    this.slots = [...this.slots, { id: mintSlotId(), asset, pct: 100, scale: 1 }];
  }

  remove(id: string): void {
    this.slots = this.slots.filter((s) => s.id !== id);
  }

  clear(): void {
    this.slots = [];
  }

  setPct(id: string, pct: number): void {
    const n = Math.min(100, Math.max(1, Math.round(pct)));
    this.slots = this.slots.map((s) => (s.id === id ? { ...s, pct: n } : s));
  }

  setScale(id: string, scale: number): void {
    const n = clampScale(scale);
    this.slots = this.slots.map((s) => (s.id === id ? { ...s, scale: n } : s));
  }

  load(slots: readonly BrushSlot[]): void {
    this.slots = slots
      .filter((s) => s.asset && Number.isFinite(s.pct))
      .map((s) => ({
        id: s.id || mintSlotId(),
        asset: s.asset,
        pct: Math.min(100, Math.max(1, Math.round(s.pct))),
        scale: clampScale(s.scale ?? 1),
      }));
  }

  pick(rng: () => number = Math.random): BrushSlot | null {
    return pickSlot(this.slots, rng);
  }
}

export function pickSlot(slots: readonly BrushSlot[], rng: () => number): BrushSlot | null {
  let total = 0;
  for (const s of slots) if (s.pct > 0) total += s.pct;
  if (total <= 0) return null;
  let n = rng() * total;
  for (const s of slots) {
    if (s.pct <= 0) continue;
    n -= s.pct;
    if (n <= 0) return s;
  }
  return slots[slots.length - 1] ?? null;
}

export function mintSlotId(): string {
  return crypto.randomUUID();
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(BRUSH_SCALE_MAX, Math.max(BRUSH_SCALE_MIN, Math.round(n * 10) / 10));
}
