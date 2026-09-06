/**
 * Named brush kits in localStorage. Save / load / delete from the brush dock.
 */
import type { BrushSlot } from "./kit";

export const BRUSH_PRESET_KEY = "utc.brush-presets";

export type BrushPreset = {
  readonly id: string;
  readonly name: string;
  readonly radius: number;
  readonly density: number;
  readonly slots: readonly BrushSlot[];
};

export class BrushPresetStore {
  list: BrushPreset[] = [];
  active: string | null = null;

  constructor(private readonly store: Pick<Storage, "getItem" | "setItem"> | null = defaultStore()) {
    this.list = parsePresets(this.read());
  }

  save(name: string, spec: { radius: number; density: number; slots: readonly BrushSlot[] }): BrushPreset {
    const title = name.trim() || "Untitled";
    const existing = this.list.find((p) => p.name.toLowerCase() === title.toLowerCase());
    const next: BrushPreset = {
      id: existing?.id ?? crypto.randomUUID(),
      name: title,
      radius: spec.radius,
      density: spec.density,
      slots: spec.slots.map((s) => ({ asset: s.asset, pct: s.pct, scale: s.scale })),
    };
    this.list = existing ? this.list.map((p) => (p.id === existing.id ? next : p)) : [...this.list, next];
    this.active = next.id;
    this.write();
    return next;
  }

  remove(id: string): void {
    this.list = this.list.filter((p) => p.id !== id);
    if (this.active === id) this.active = this.list[0]?.id ?? null;
    this.write();
  }

  get(id: string): BrushPreset | undefined {
    return this.list.find((p) => p.id === id);
  }

  private read(): string {
    try {
      return this.store?.getItem(BRUSH_PRESET_KEY) ?? "";
    } catch {
      return "";
    }
  }

  private write(): void {
    try {
      this.store?.setItem(BRUSH_PRESET_KEY, stringifyPresets(this.list));
    } catch {
      /* quota / private mode */
    }
  }
}

export function parsePresets(raw: string): BrushPreset[] {
  if (!raw.trim()) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: BrushPreset[] = [];
    for (const item of data) {
      const p = parseOne(item);
      if (p) out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

export function stringifyPresets(list: readonly BrushPreset[]): string {
  return JSON.stringify(list);
}

function parseOne(raw: unknown): BrushPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string" || !o.name.trim()) return null;
  if (typeof o.radius !== "number" || typeof o.density !== "number") return null;
  if (!Array.isArray(o.slots)) return null;
  const slots: BrushSlot[] = [];
  for (const s of o.slots) {
    if (!s || typeof s !== "object") return null;
    const slot = s as Record<string, unknown>;
    if (typeof slot.asset !== "string" || typeof slot.pct !== "number") return null;
    const scale = slot.scale;
    if (scale !== undefined && (typeof scale !== "number" || !Number.isFinite(scale))) return null;
    slots.push({ asset: slot.asset, pct: slot.pct, scale: typeof scale === "number" ? scale : 1 });
  }
  return { id: o.id, name: o.name.trim(), radius: o.radius, density: o.density, slots };
}

function defaultStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
