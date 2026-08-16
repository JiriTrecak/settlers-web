import { describe, expect, it } from "vitest";
import {
  catalogItems,
  collapseSettlerDirections,
  groupSettlerProfessions,
  matchesRace,
  searchItems,
  type Sprite,
} from "./sprite";

function sprite(partial: Partial<Sprite> & Pick<Sprite, "id" | "title">): Sprite {
  return {
    category: "buildings",
    subtitle: "",
    tags: ["building", "roman", "lumberjack"],
    path: `${partial.id}.png`,
    width: 8,
    height: 8,
    offsetX: 0,
    offsetY: 0,
    ...partial,
  };
}

function settler(civ: string, type: string, action: string, mat: string, dir: string, frame = 0): Sprite {
  const group = `settlers/${civ}/${type}/${action}/${mat}/${dir}`;
  return sprite({
    id: `${group}/${String(frame).padStart(3, "0")}`,
    category: "settlers",
    title: `${type} ${action}`,
    subtitle: `${civ} · ${dir} · ${mat}`,
    tags: ["settler", civ, type, action, mat, dir],
    group,
    frame,
    frames: 2,
  });
}

describe("catalog items", () => {
  it("groups variants and searches by name", () => {
    const items = catalogItems([
      sprite({ id: "building/roman/lumberjack/built", title: "lumberjack", group: "buildings/roman/lumberjack", variant: "built", subtitle: "roman · built" }),
      sprite({ id: "building/roman/lumberjack/scaffold", title: "lumberjack", group: "buildings/roman/lumberjack", variant: "scaffold", subtitle: "roman · scaffold" }),
      sprite({ id: "landscape/grass", title: "grass", category: "landscape", tags: ["landscape", "grass"] }),
    ]);
    expect(items).toHaveLength(2);
    const lj = items.find((i) => i.id === "buildings/roman/lumberjack")!;
    expect(lj.sprites).toHaveLength(2);
    expect(lj.cover.variant).toBe("built");
    expect(searchItems(items, "lumberjack").map((i) => i.id)).toEqual(["buildings/roman/lumberjack"]);
    expect(searchItems(items, "grass roman")).toHaveLength(0);
  });

  it("collapses settler directions into one animation card", () => {
    const items = catalogItems([
      settler("roman", "alchemist", "idle", "none", "e", 0),
      settler("roman", "alchemist", "idle", "none", "e", 1),
      settler("roman", "alchemist", "idle", "none", "w", 0),
      settler("roman", "alchemist", "raise", "gems", "e", 0),
      settler("egyptian", "alchemist", "idle", "none", "e", 0),
    ]);
    const clips = collapseSettlerDirections(items);
    expect(clips.map((c) => c.id).sort()).toEqual([
      "settlers/egyptian/alchemist/idle/none",
      "settlers/roman/alchemist/idle/none",
      "settlers/roman/alchemist/raise/gems",
    ]);
    const idle = clips.find((c) => c.id === "settlers/roman/alchemist/idle/none")!;
    expect(idle.title).toBe("idle");
    expect(idle.sprites.map((s) => s.variant)).toEqual(["e", "e", "w"]);
  });

  it("groups settlers by profession", () => {
    const clips = collapseSettlerDirections(
      catalogItems([
        settler("roman", "alchemist", "idle", "none", "e"),
        settler("roman", "alchemist", "raise", "gems", "e"),
        settler("roman", "bearer", "walk", "stone", "e"),
      ]),
    );
    const profs = groupSettlerProfessions(clips);
    expect(profs.map((p) => p.title)).toEqual(["alchemist", "bearer"]);
    expect(profs[0]!.folder).toBe(true);
    expect(profs[0]!.subtitle).toBe("2 animations");
  });

  it("race filter keeps shared settlers", () => {
    const items = catalogItems([
      sprite({ id: "buildings/roman/lumberjack", title: "lumberjack", group: "buildings/roman/lumberjack" }),
      sprite({ id: "buildings/egyptian/lumberjack", title: "lumberjack", group: "buildings/egyptian/lumberjack", tags: ["building", "egyptian"] }),
      settler("shared", "donkey", "walk", "none", "e"),
    ]);
    const roman = items.filter((i) => matchesRace(i, "roman"));
    expect(roman.map((i) => i.id).sort()).toEqual(["buildings/roman/lumberjack", "settlers/shared/donkey/walk/none/e"]);
  });
});
