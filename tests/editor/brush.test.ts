import { describe, expect, it } from "vitest";
import { BrushMask } from "../../src/editor/brush/brush";
import { pickSlot } from "../../src/editor/brush/kit";
import { BrushPresetStore, parsePresets, stringifyPresets } from "../../src/editor/brush/presets";
import { scatterBrush } from "../../src/editor/brush/scatter";

function rng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("brush mask", () => {
  it("paints a soft disc and shift-erases it", () => {
    const mask = new BrushMask();
    mask.radius = 3;
    mask.dab(10.5, 10.5, false);
    expect(mask.sample(10.5, 10.5)).toBeGreaterThan(0.4);
    expect(mask.sample(12.5, 10.5)).toBeGreaterThan(0);
    expect(mask.sample(20, 20)).toBe(0);
    mask.dab(10.5, 10.5, true);
    mask.dab(10.5, 10.5, true);
    expect(mask.sample(10.5, 10.5)).toBeLessThan(0.2);
  });

  it("scatter emits poses inside the paint and respects density", () => {
    const mask = new BrushMask();
    mask.radius = 4;
    mask.density = 1.2;
    mask.dab(20, 20, false);
    const poses = scatterBrush(mask, [], [{ asset: "pine", pct: 100, scale: 1.4 }], rng(7));
    expect(poses.length).toBeGreaterThan(2);
    for (const p of poses) {
      expect(mask.sample(p.x + 0.5, p.y + 0.5)).toBeGreaterThan(0.1);
      expect(p.yaw).toBeGreaterThanOrEqual(0);
      expect(p.asset).toBe("pine");
      expect(p.scale).toBe(1.4);
    }
  });

  it("pickSlot follows weights", () => {
    const slots = [
      { asset: "a", pct: 80, scale: 1 },
      { asset: "b", pct: 20, scale: 0.5 },
    ];
    let a = 0;
    const r = rng(3);
    for (let i = 0; i < 400; i++) if (pickSlot(slots, r)?.asset === "a") a++;
    expect(a).toBeGreaterThan(250);
    expect(a).toBeLessThan(370);
  });

  it("roundtrips named presets", () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    const a = new BrushPresetStore(store);
    a.save("Grove", {
      radius: 4,
      density: 0.5,
      slots: [
        { asset: "pine", pct: 70, scale: 1 },
        { asset: "pine-dark", pct: 30, scale: 0.6 },
      ],
    });
    const raw = stringifyPresets(a.list);
    const list = parsePresets(raw);
    expect(list[0]?.name).toBe("Grove");
    expect(list[0]?.slots).toHaveLength(2);
    expect(list[0]?.slots[1]?.scale).toBe(0.6);
    const b = new BrushPresetStore(store);
    expect(b.list[0]?.name).toBe("Grove");
  });
});
