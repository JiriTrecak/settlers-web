import { describe, expect, it } from "vitest";
import { CommandBoard } from "../../src/session/command/board";
import { FOOD, MILITARY, PRODUCTION } from "../../src/session/command/pages";
import {
  COMMAND_CORNER,
  COMMAND_FOOD,
  COMMAND_MILITARY,
  COMMAND_NEAR_CORNER,
  COMMAND_PRODUCTION,
  COMMAND_SLOTS,
  COMMAND_TOOLS,
} from "../../src/ui/control/types";
import type { BoardContext, CountPair, PlaceTool } from "../../src/session/command/types";

function board() {
  const armed: (PlaceTool | null)[] = [];
  const ratios: number[] = [];
  const masons: number[] = [];
  const destroyed: number[] = [];
  const cleared: number[] = [];
  const b = new CommandBoard({
    armPlace: (tool) => {
      armed.push(tool);
    },
    bumpDiggerRatio: (dir) => {
      ratios.push(dir);
    },
    bumpBricklayerRatio: (dir) => {
      masons.push(dir);
    },
    destroySelected: () => {
      destroyed.push(1);
    },
    clearSelection: () => {
      cleared.push(1);
    },
  });
  return { b, armed, ratios, masons, destroyed, cleared };
}

function n(have: number, queued = have): CountPair {
  return { have, queued };
}

function ctx(partial: Partial<BoardContext> = {}): BoardContext {
  return {
    selection: { type: "none" },
    counts: {},
    units: {},
    canCommand: true,
    placeTool: null,
    diggerRatio: 0.25,
    diggerCap: 0,
    bricklayerRatio: 0.25,
    bricklayerCap: 0,
    ...partial,
  };
}

describe("command board", () => {
  it("idle is Tools + Recruit + Production / Food / Military", () => {
    const { b } = board();
    b.sync(ctx({ units: { digger: n(4) } }));
    const page = b.page;
    expect(page.id).toBe("idle");
    expect(page.slots).toHaveLength(COMMAND_SLOTS);
    expect(page.slots.filter(Boolean)).toHaveLength(5);
    expect(page.slots[COMMAND_TOOLS]).toMatchObject({ id: "page.tools" });
    expect(page.slots[COMMAND_TOOLS]?.count).toBeUndefined();
    expect(page.slots[COMMAND_NEAR_CORNER]?.id).toBe("page.recruit");
    expect(page.slots[COMMAND_PRODUCTION]).toMatchObject({ id: "page.production", hotkey: "p" });
    expect(page.slots[COMMAND_FOOD]).toMatchObject({ id: "page.food", hotkey: "f" });
    expect(page.slots[COMMAND_MILITARY]).toMatchObject({ id: "page.military", hotkey: "m" });
  });

  it("Production lists wood / mines / smelters; unimplemented stay visible and locked", () => {
    const { b } = board();
    b.sync(ctx({ counts: { lumberjack: n(2), tower: n(1) } }));
    b.invoke("page.production");
    const page = b.page;
    expect(page.id).toBe("production");
    expect(page.slots[0]).toMatchObject({ id: "build.lumberjack", label: "Lumberjack", count: 2, enabled: true });
    expect(page.slots[1]).toMatchObject({ id: "locked.buildings/roman/stock", label: "Store", enabled: false });
    expect(page.slots[1]?.icon).toMatch(/stock\/built/);
    expect(page.slots[2]).toMatchObject({ id: "build.sawmill", enabled: true });
    expect(page.slots[3]).toMatchObject({ id: "build.forester", enabled: true });
    expect(page.slots[4]).toMatchObject({ id: "locked.buildings/roman/coalmine", enabled: false });
    expect(page.slots[5]).toMatchObject({ id: "build.ironmine", enabled: true });
    expect(page.slots[6]).toMatchObject({ id: "build.goldmine", enabled: true });
    expect(page.slots[7]).toMatchObject({ id: "build.stonecutter", enabled: true });
    expect(page.slots[8]).toMatchObject({ id: "locked.buildings/roman/ironmelt", enabled: false });
    expect(page.slots[9]).toMatchObject({ id: "locked.buildings/roman/goldmelt", enabled: false });
    expect(page.slots[10]).toMatchObject({ id: "locked.buildings/roman/toolsmith", enabled: false });
    expect(page.slots[COMMAND_CORNER]?.id).toBe("page.back");
    expect(PRODUCTION).toHaveLength(11);
  });

  it("build id arms and toggles the place tool", () => {
    const { b, armed } = board();
    b.sync(ctx());
    b.invoke("page.production");
    b.invoke("build.lumberjack");
    expect(armed.at(-1)).toEqual({ type: "building", kind: "lumberjack" });
    b.sync(ctx({ placeTool: { type: "building", kind: "lumberjack" } }));
    b.invoke("build.lumberjack");
    expect(armed.at(-1)).toBeNull();
  });

  it("Recruit opens Swordsman, Pioneer, Geologist and arms the spawn tool", () => {
    const { b, armed } = board();
    b.sync(ctx({ units: { swordsman: n(8), pioneer: n(1) } }));
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
    expect(page.slots[1]).toMatchObject({ id: "recruit.pioneer", label: "Pioneer", hotkey: "c", count: 1 });
    expect(page.slots[2]).toMatchObject({ id: "recruit.geologist", label: "Geologist", hotkey: "g" });
    b.invoke("recruit.swordsman");
    expect(armed.at(-1)).toEqual({ type: "unit", kind: "swordsman", count: 1 });
    b.sync(ctx({ placeTool: { type: "unit", kind: "swordsman", count: 1 }, units: { swordsman: n(8) } }));
    expect(b.page.slots[0]?.armed).toBe(true);
    b.invoke("recruit.swordsman");
    expect(armed.at(-1)).toBeNull();
  });

  it("Recruit C/G arms pioneer / geologist", () => {
    const { b, armed } = board();
    b.sync(ctx());
    b.invoke("page.recruit");
    expect(b.key("c")).toBe(true);
    expect(armed.at(-1)).toEqual({ type: "unit", kind: "pioneer", count: 1 });
    expect(b.key("g")).toBe(true);
    expect(armed.at(-1)).toEqual({ type: "unit", kind: "geologist", count: 1 });
    b.sync(ctx({ placeTool: { type: "unit", kind: "geologist", count: 1 } }));
    expect(b.page.slots[2]?.armed).toBe(true);
    expect(b.key("g")).toBe(true);
    expect(armed.at(-1)).toBeNull();
  });

  it("pop leaves the build page; unit select clears the drill", () => {
    const { b } = board();
    b.sync(ctx());
    b.invoke("page.production");
    expect(b.pop()).toBe(true);
    expect(b.page.id).toBe("idle");
    b.invoke("page.production");
    b.sync(ctx({ selection: { type: "units", types: ["swordsman"] } }));
    expect(b.page.id).toBe("units");
    expect(b.page.slots.every((s) => s == null)).toBe(true);
    expect(b.selectionView).toMatchObject({ type: "units", title: "Swordsman" });
  });

  it("selected hut is Delete + Cancel; Cancel leaves like Back", () => {
    const { b, destroyed, cleared } = board();
    b.sync(ctx({ selection: { type: "building", kind: "lumberjack", state: "built", owned: true, workArea: true } }));
    const page = b.page;
    expect(page.id).toBe("hut");
    expect(page.slots[0]).toMatchObject({ id: "hut.destroy", label: "Delete", enabled: true, kind: "do" });
    expect(page.slots[1]).toMatchObject({ id: "hut.area", label: "Area", enabled: true, kind: "toggle", armed: false });
    expect(page.slots[COMMAND_CORNER]).toMatchObject({ id: "page.back", label: "Cancel", kind: "page" });
    b.invoke("hut.destroy");
    expect(destroyed).toEqual([1]);
    b.invoke("page.back");
    expect(cleared).toEqual([1]);
  });

  it("Area arms the work-area tool on outdoor huts only", () => {
    const { b, armed } = board();
    b.sync(ctx({ selection: { type: "building", kind: "lumberjack", state: "built", owned: true, workArea: true } }));
    b.invoke("hut.area");
    expect(armed.at(-1)).toEqual({ type: "workArea" });
    b.sync(ctx({ selection: { type: "building", kind: "lumberjack", state: "built", owned: true, workArea: true }, placeTool: { type: "workArea" } }));
    expect(b.page.slots[1]?.armed).toBe(true);
    b.invoke("hut.area");
    expect(armed.at(-1)).toBeNull();

    b.sync(ctx({ selection: { type: "building", kind: "tower", state: "built", owned: true, workArea: false } }));
    expect(b.page.slots[1]).toBeNull();
    b.invoke("hut.area");
    expect(armed.at(-1)).toBeNull();
  });

  it("foreign hut cannot Delete; Cancel still works", () => {
    const { b, destroyed, cleared } = board();
    b.sync(ctx({ selection: { type: "building", kind: "tower", state: "built", owned: false, workArea: false } }));
    expect(b.page.slots[0]).toMatchObject({ id: "hut.destroy", enabled: false });
    b.invoke("hut.destroy");
    expect(destroyed).toEqual([]);
    b.invoke("page.back");
    expect(cleared).toEqual([1]);
  });

  it("Back on a drill does not clear selection", () => {
    const { b, cleared } = board();
    b.sync(ctx());
    b.invoke("page.production");
    b.invoke("page.back");
    expect(b.page.id).toBe("idle");
    expect(cleared).toEqual([]);
  });

  it("Tools opens Digger and Bricklayer rows and bumps both ratios", () => {
    const { b, ratios, masons } = board();
    b.sync(ctx({ units: { digger: n(2), bricklayer: n(4) }, diggerRatio: 0.25, bricklayerRatio: 0.25 }));
    b.invoke("page.tools");
    const page = b.page;
    expect(page.id).toBe("tools");
    expect(page.slots[0]).toMatchObject({ id: "tools.digger.dec", enabled: true });
    expect(page.slots[1]).toMatchObject({ id: "tools.digger", count: 2, enabled: false });
    expect(page.slots[2]).toMatchObject({ id: "tools.digger.inc", enabled: true });
    expect(page.slots[4]).toMatchObject({ id: "tools.bricklayer.dec", enabled: true });
    expect(page.slots[5]).toMatchObject({ id: "tools.bricklayer", count: 4, enabled: false });
    expect(page.slots[6]).toMatchObject({ id: "tools.bricklayer.inc", enabled: true });
    b.invoke("tools.digger.inc");
    b.invoke("tools.digger.dec");
    b.invoke("tools.bricklayer.inc");
    b.invoke("tools.bricklayer.dec");
    expect(ratios).toEqual([1, -1]);
    expect(masons).toEqual([1, -1]);
    b.sync(ctx({ diggerRatio: 0, bricklayerRatio: 0 }));
    b.invoke("page.tools");
    expect(b.page.slots[0]?.enabled).toBe(false);
    expect(b.page.slots[2]?.enabled).toBe(true);
    expect(b.page.slots[4]?.enabled).toBe(false);
    expect(b.page.slots[6]?.enabled).toBe(true);
  });

  it("Tools badge uses the cap as the right-hand number", () => {
    const { b } = board();
    b.sync(ctx({ units: { digger: n(0) }, diggerCap: 4, bricklayerCap: 4 }));
    b.invoke("page.tools");
    expect(b.page.slots[1]).toMatchObject({ id: "tools.digger", count: 0, queued: 4 });
    expect(b.page.slots[5]).toMatchObject({ id: "tools.bricklayer", count: 0, queued: 4 });
  });

  it("in-flight counts pass through as count + queued", () => {
    const { b } = board();
    b.sync(ctx({ counts: { lumberjack: n(0, 1) }, units: { digger: n(0, 1), swordsman: n(2, 3) } }));
    b.invoke("page.production");
    expect(b.page.slots[0]).toMatchObject({ id: "build.lumberjack", count: 0, queued: 1 });
    b.pop();
    b.invoke("page.tools");
    expect(b.page.slots[1]).toMatchObject({ id: "tools.digger", count: 0, queued: 1 });
    b.pop();
    b.invoke("page.recruit");
    expect(b.page.slots[0]).toMatchObject({ id: "recruit.swordsman", count: 2, queued: 3 });
  });

  it("hotkeys follow the current page: P/B then L/W/F/S", () => {
    const { b, armed } = board();
    b.sync(ctx());
    expect(b.key("l")).toBe(false);
    expect(b.key("p")).toBe(true);
    expect(b.page.id).toBe("production");
    expect(b.page.slots[0]).toMatchObject({ id: "build.lumberjack", hotkey: "l" });
    expect(b.page.slots[2]).toMatchObject({ id: "build.sawmill", hotkey: "w" });
    expect(b.page.slots[3]).toMatchObject({ id: "build.forester", hotkey: "f" });
    expect(b.page.slots[7]).toMatchObject({ id: "build.stonecutter", hotkey: "s" });
    expect(b.key("L")).toBe(true);
    expect(armed.at(-1)).toEqual({ type: "building", kind: "lumberjack" });
    expect(b.key("w")).toBe(true);
    expect(armed.at(-1)).toEqual({ type: "building", kind: "sawmill" });
    expect(b.key("b")).toBe(false);
    b.pop();
    expect(b.key("b")).toBe(true);
    expect(b.page.id).toBe("production");
    b.sync(ctx({ selection: { type: "building", kind: "tower", state: "built", owned: true, workArea: false } }));
    expect(b.key("b")).toBe(false);
    expect(b.key("t")).toBe(false);
  });

  it("idle F/M open Food and Military; locked cards do not arm", () => {
    const { b, armed } = board();
    b.sync(ctx({ counts: { farm: n(1), tower: n(1) } }));
    expect(b.key("f")).toBe(true);
    expect(b.page.id).toBe("food");
    expect(FOOD).toHaveLength(11);
    expect(b.page.slots[0]).toMatchObject({ id: "build.farm", label: "Farm", hotkey: "a", count: 1, enabled: true });
    expect(b.page.slots[3]).toMatchObject({ id: "build.waterworks", enabled: true });
    expect(b.page.slots[7]).toMatchObject({ id: "locked.buildings/roman/winegrower", enabled: false });
    expect(b.page.slots[9]).toMatchObject({ id: "build.small_livinghouse", enabled: true });
    expect(b.key("a")).toBe(true);
    expect(armed.at(-1)).toEqual({ type: "building", kind: "farm" });
    b.pop();
    expect(b.key("m")).toBe(true);
    expect(b.page.id).toBe("military");
    expect(MILITARY).toHaveLength(11);
    expect(b.page.slots[0]).toMatchObject({ id: "build.tower", label: "Tower", hotkey: "t", count: 1, enabled: true });
    expect(b.page.slots[1]).toMatchObject({ id: "locked.buildings/roman/lookout_tower", enabled: false });
    expect(b.page.slots[4]).toMatchObject({ id: "locked.buildings/roman/barrack", enabled: false });
    b.invoke("locked.buildings/roman/lookout_tower");
    expect(armed.at(-1)).toEqual({ type: "building", kind: "farm" });
    expect(b.key("t")).toBe(true);
    expect(armed.at(-1)).toEqual({ type: "building", kind: "tower" });
    b.sync(ctx({ placeTool: { type: "building", kind: "tower" }, counts: { farm: n(1), tower: n(1) } }));
    expect(b.key("t")).toBe(true);
    expect(armed.at(-1)).toBeNull();
    expect(b.pop()).toBe(true);
    expect(b.page.id).toBe("idle");
  });

  it("selectionView copies hut needs and produces", () => {
    const { b } = board();
    b.sync(
      ctx({
        selection: {
          type: "building",
          kind: "mill",
          state: "built",
          owned: true,
          workArea: false,
          needs: [{ material: "crop", have: 2, max: 8, icon: "props/stack-crop/000.png" }],
          produces: [{ material: "flour", have: 0, max: 8, icon: "props/stack-flour/000.png" }],
        },
      }),
    );
    expect(b.selectionView).toMatchObject({
      type: "building",
      title: "Mill",
      state: "built",
      needs: [{ material: "crop", have: 2, max: 8 }],
      produces: [{ material: "flour", have: 0, max: 8 }],
    });
  });

  it("disabled slots do not eat the hotkey", () => {
    const { b } = board();
    b.sync(ctx({ canCommand: false }));
    expect(b.page.slots[COMMAND_PRODUCTION]).toMatchObject({ id: "page.production", hotkey: "p", enabled: false });
    expect(b.key("p")).toBe(false);
    expect(b.key("b")).toBe(false);
    expect(b.key("b")).toBe(false);
    expect(b.page.id).toBe("idle");
  });
});
