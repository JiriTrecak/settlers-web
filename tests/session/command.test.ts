import { describe, expect, it } from "vitest";
import { CommandBoard } from "../../src/session/command/board";
import { PLACEABLE } from "../../src/session/command/pages";
import { COMMAND_CORNER, COMMAND_NEAR_CORNER, COMMAND_SLOTS } from "../../src/ui/control/types";
import type { BoardContext, PlaceTool } from "../../src/session/command/types";

function board() {
  const armed: (PlaceTool | null)[] = [];
  const b = new CommandBoard({
    armPlace: (tool) => {
      armed.push(tool);
    },
  });
  return { b, armed };
}

function ctx(partial: Partial<BoardContext> = {}): BoardContext {
  return {
    selection: { type: "none" },
    counts: {},
    units: {},
    canCommand: true,
    placeTool: null,
    ...partial,
  };
}

describe("command board", () => {
  it("idle is Recruit + Build on the bottom row", () => {
    const { b } = board();
    b.sync(ctx());
    const page = b.page;
    expect(page.id).toBe("idle");
    expect(page.slots).toHaveLength(COMMAND_SLOTS);
    expect(page.slots.filter(Boolean)).toHaveLength(2);
    expect(page.slots[COMMAND_NEAR_CORNER]?.id).toBe("page.recruit");
    expect(page.slots[COMMAND_CORNER]?.id).toBe("page.build");
  });

  it("Build opens placeable huts with owned counts", () => {
    const { b } = board();
    b.sync(ctx({ counts: { lumberjack: 2, tower: 1 } }));
    b.invoke("page.build");
    const page = b.page;
    expect(page.id).toBe("build");
    for (let i = 0; i < PLACEABLE.length; i++) {
      const slot = page.slots[i]!;
      expect(slot.id).toBe(`build.${PLACEABLE[i]!.kind}`);
      expect(slot.icon).toMatch(/\/built(\/00)?\.png$/);
      expect(slot.count).toBe(PLACEABLE[i]!.kind === "lumberjack" ? 2 : PLACEABLE[i]!.kind === "tower" ? 1 : 0);
    }
    expect(page.slots[COMMAND_CORNER]?.id).toBe("page.back");
  });

  it("build id arms and toggles the place tool", () => {
    const { b, armed } = board();
    b.sync(ctx());
    b.invoke("page.build");
    b.invoke("build.lumberjack");
    expect(armed.at(-1)).toEqual({ type: "building", kind: "lumberjack" });
    b.sync(ctx({ placeTool: { type: "building", kind: "lumberjack" } }));
    b.invoke("build.lumberjack");
    expect(armed.at(-1)).toBeNull();
  });

  it("Recruit opens Swordsman and arms the spawn tool", () => {
    const { b, armed } = board();
    b.sync(ctx({ units: { swordsman: 8 } }));
    b.invoke("page.recruit");
    const page = b.page;
    expect(page.id).toBe("recruit");
    expect(page.slots[0]).toMatchObject({
      id: "recruit.swordsman",
      label: "Swordsman",
      count: 8,
      armed: false,
    });
    expect(page.slots[0]?.icon).toMatch(/swordsman-l1\/idle\/none\/se\/0+\.png$/);
    b.invoke("recruit.swordsman");
    expect(armed.at(-1)).toEqual({ type: "unit", kind: "swordsman", count: 1 });
    b.sync(ctx({ placeTool: { type: "unit", kind: "swordsman", count: 1 }, units: { swordsman: 8 } }));
    expect(b.page.slots[0]?.armed).toBe(true);
    b.invoke("recruit.swordsman");
    expect(armed.at(-1)).toBeNull();
  });

  it("pop leaves the build page; unit select clears the drill", () => {
    const { b } = board();
    b.sync(ctx());
    b.invoke("page.build");
    expect(b.pop()).toBe(true);
    expect(b.page.id).toBe("idle");
    b.invoke("page.build");
    b.sync(ctx({ selection: { type: "units", types: ["swordsman"] } }));
    expect(b.page.id).toBe("units");
    expect(b.page.slots.every((s) => s == null)).toBe(true);
    expect(b.selectionView).toMatchObject({ type: "units", title: "Swordsman" });
  });
});
