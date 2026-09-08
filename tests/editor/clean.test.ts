import { emptyLandscape, parseLandscape } from "../../src/shared/landscape/curve";
import { describe, expect, it } from "vitest";
import { CleanTool, wipeStamps, eraseCover } from "../../src/editor/clean/clean";

describe("clean", () => {
  it("wipes stamps inside the disc and keeps the rest", () => {
    const stamps = [
      { id: "a", asset: "pine", x: 10, y: 10 },
      { id: "b", asset: "pine", x: 10.2, y: 10.1 },
      { id: "c", asset: "rock", x: 20, y: 20 },
    ];
    const next = wipeStamps(stamps, [{ x: 10.5, z: 10.5 }], 2, "objects");
    expect(next.map((s) => s.id)).toEqual(["c"]);
  });

  it("removes foliage stamps while retaining rocks", () => {
    const stamps = [{ id: "a", asset: "pine", x: 10, y: 10 }, {id:"b",asset:"rock",x:10,y:10}, {id:"m",asset:"mushroom-chunky-red",x:10,y:10}];
    expect(wipeStamps(stamps, [{ x: 10.5, z: 10.5 }], 4, "foliage").map(s=>s.id)).toEqual(["b"]);
  });

  it("interpolates a stroke so a skip still hits", () => {
    const tool = new CleanTool();
    tool.setRadius(2);
    const stamps = [
      { id: "a", asset: "pine", x: 5, y: 5 },
      { id: "b", asset: "pine", x: 8, y: 5 },
    ];
    tool.beginStroke();
    expect(tool.stroke(5.5, 5.5, stamps)).toHaveLength(1);
    const mid = tool.stroke(8.5, 5.5, stamps.filter((s) => s.id !== "a"));
    expect(mid?.map((s) => s.id) ?? []).toEqual([]);
  });
});

it('cuts persistent holes only in intersecting cover and leaves new planting untouched', () => {
  const p={x:10,z:10,radius:5,density:2,seed:1,flowers:.2};
  const far={...p,x:100};
  const next=eraseCover([p,far],[{x:10,z:10}],2);
  expect(next[0]!.exclusions).toEqual([{x:10,z:10,radius:2}]);
  expect(next[1]).toBe(far);
  expect(p).not.toHaveProperty('exclusions');
  expect(eraseCover(next,[{x:10,z:10}],2)[0]).toBe(next[0]);
});

it('round trips cover exclusions and rejects corrupt radii', () => {
  const patch={x:10,z:10,radius:5,density:2,seed:1,flowers:.2};
  const landscape={...emptyLandscape(),cover:eraseCover([patch],[{x:10,z:10}],2)};
  expect(parseLandscape(JSON.parse(JSON.stringify(landscape)))).toEqual(landscape);
  landscape.cover[0]!.exclusions![0]!.radius=-1;
  expect(parseLandscape(landscape)).toBeUndefined();
});
