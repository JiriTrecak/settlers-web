import { describe, it, expect } from "vitest";
import {
  emptyUtcMap,
  parseUtcMap,
  stringifyUtcMap,
} from "../../src/shared/map/utcmap";
import { playableMapError, mapRevision } from "../../src/shared/map/playable";
import { WORLDROOT_MAP } from "../../src/shared/match/worldroot";
import { World } from "../../src/sim/world/world";
describe("authored playable maps", () => {
  it("creates a dry map with two persisted distinct starts", () => {
    const map = emptyUtcMap();
    expect(playableMapError(map)).toBeNull();
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.playerStarts).toEqual(
      map.playerStarts,
    );
  });
  it("accepts Worldroot Hollow", () =>
    expect(playableMapError(WORLDROOT_MAP)).toBeNull());
  it("rejects missing starts, submerged forts, overlap and edge starts", () => {
    const map = emptyUtcMap();
    expect(playableMapError({ ...map, playerStarts: [] })).not.toBeNull();
    expect(playableMapError({ ...map, waterLevel: 1 })).not.toBeNull();
    expect(
      playableMapError({
        ...map,
        playerStarts: [
          { ...emptyUtcMap().playerStarts[0]!, player: 1, x: 38, z: 38 },
          { ...emptyUtcMap().playerStarts[1]!, player: 2, x: 38, z: 38 },
        ],
      }),
    ).not.toBeNull();
    expect(
      playableMapError({
        ...map,
        playerStarts: [
          { ...emptyUtcMap().playerStarts[0]!, player: 1, x: 1, z: 1 },
          { ...emptyUtcMap().playerStarts[1]!, player: 2, x: 38, z: 38 },
        ],
      }),
    ).not.toBeNull();
  });
  it("uses file starts for deterministic colonies and changes revision when starts change", () => {
    const map = {
      ...emptyUtcMap(),
      playerStarts: [
        { ...emptyUtcMap().playerStarts[0]!, player: 1, x: 80, z: 80 },
        { ...emptyUtcMap().playerStarts[1]!, player: 2, x: 170, z: 170 },
      ],
    };
    const slots = [
      { player: 0, kind: "human" as const },
      { player: 1, kind: "ai" as const },
    ];
    const a = new World({ map, slots, seed: 1 }),
      b = new World({ map, slots, seed: 1 });
    expect(
      a.settlement!.entities.find(
        (e) => e.placement === map.playerStarts[0]!.mainFort,
      )!.x,
    ).toBe(80);
    for (let i = 0; i < 100; i++) {
      a.tick();
      b.tick();
    }
    expect(a.checksum()).toBe(b.checksum());
    expect(mapRevision(map)).not.toBe(mapRevision(emptyUtcMap()));
  });
});
