import { describe, expect, it } from "vitest";
import { BrushMask } from "../../src/editor/brush/brush";
import { BrushKit, pickSlot } from "../../src/editor/brush/kit";
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
    const poses = scatterBrush(mask, [], [{ id: "s1", asset: "pine", pct: 100, scale: 1.4 }], rng(7));
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
      { id: "a", asset: "a", pct: 80, scale: 1 },
      { id: "b", asset: "b", pct: 20, scale: 0.5 },
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
        { id: "s1", asset: "pine", pct: 70, scale: 1 },
        { id: "s2", asset: "pine-dark", pct: 30, scale: 0.6 },
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

  it("keeps water on wet and land on dry", () => {
    const mask = new BrushMask();
    mask.radius = 5;
    mask.density = 2;
    mask.dab(20, 20, false);
    const wet = (x: number, _z: number) => x >= 20;
    const kind = (id: string) => (id === "lily" ? ("water" as const) : ("prop" as const));
    const water = scatterBrush(mask, [], [{ id: "s1", asset: "lily", pct: 100, scale: 1 }], rng(11), { wet, kind });
    expect(water.length).toBeGreaterThan(0);
    for (const p of water) expect(p.x + 0.5).toBeGreaterThanOrEqual(20);
    expect(scatterBrush(mask, [], [{ id: "s1", asset: "lily", pct: 100, scale: 1 }], rng(11), { wet: () => false, kind })).toHaveLength(0);
    expect(scatterBrush(mask, [], [{ id: "s1", asset: "pine", pct: 100, scale: 1 }], rng(11), { wet: () => true, kind })).toHaveLength(0);
    const land = scatterBrush(mask, [], [{ id: "s1", asset: "pine", pct: 100, scale: 1 }], rng(11), { wet: () => false, kind });
    expect(land.length).toBeGreaterThan(0);
  });

  it("lets the same asset sit in two slots", () => {
    const kit = new BrushKit();
    kit.add("pine");
    kit.add("pine");
    kit.setScale(kit.slots[1]!.id, 0.8);
    expect(kit.slots).toHaveLength(2);
    expect(kit.slots[0]?.asset).toBe("pine");
    expect(kit.slots[1]?.asset).toBe("pine");
    expect(kit.slots[0]?.scale).toBe(1);
    expect(kit.slots[1]?.scale).toBe(0.8);
    expect(kit.slots[0]?.id).not.toBe(kit.slots[1]?.id);
  });

  it("reads old presets that have no slot id", () => {
    const list = parsePresets(
      JSON.stringify([
        { id: "p", name: "Old", radius: 4, density: 0.4, slots: [{ asset: "pine", pct: 100 }] },
      ]),
    );
    expect(list[0]?.slots[0]?.asset).toBe("pine");
    expect(list[0]?.slots[0]?.id).toBeTruthy();
    expect(list[0]?.slots[0]?.scale).toBe(1);
  });
});
