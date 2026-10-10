import {flatTerrainData} from '../../src/shared/map/terrainData';
import { describe, it, expect } from "vitest";
import {
  emptyUtcMap,
  parseUtcMap,
  stringifyUtcMap,
} from "../../src/shared/map/utcmap";
import { playableMapError, mapRevision } from "../../src/shared/map/playable";
import { World } from "../../src/sim/world/world";
import {content} from '../../src/content/builtin';
import {placementOccupancyError,expandMap} from '../../src/content/map';
import {snapPlacement} from '../../src/shared/spatial/placement';
describe("authored playable maps", () => {
  it('rejects an adjacent resource clipping a starting body even when its centre cell is free',()=>{
    const blank=emptyUtcMap(),hero=expandMap(blank,content).find(p=>p.owner==='player.1'&&content.get(p.definition).hero)!;
    const node=content.get('building.neutral.amber-mine');
    const position=snapPlacement(node,{x:hero.position.x+3.5,y:hero.position.y-.5});
    const map={...blank,entities:[{id:'node',definition:node.id,owner:'none' as const,rotation:0,position}]};
    expect(placementOccupancyError(map,content)).toMatch(/body overlaps node/);
    expect(playableMapError(map)).toMatch(/body overlaps node/);
    map.entities[0].position.x+=4;
    expect(playableMapError(map)).toBeNull();
  });
  it("creates a dry map with two persisted distinct starts", () => {
    const map = emptyUtcMap();
    expect(playableMapError(map)).toBeNull();
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.playerStarts).toEqual(
      map.playerStarts,
    );
  });
  it("accepts a fresh authored canvas", () =>
    expect(playableMapError(emptyUtcMap())).toBeNull());
  it("rejects missing starts, submerged forts, overlap and edge starts", () => {
    const map = emptyUtcMap();
    expect(playableMapError({ ...map, playerStarts: [] })).not.toBeNull();
    expect(playableMapError({ ...map, authoring:{version:1,objects:[],terrain:flatTerrainData(map.size,0,1)} })).not.toBeNull();
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
        { ...emptyUtcMap().playerStarts[0]!, player: 1, x: 81.5, z: 81.5 },
        { ...emptyUtcMap().playerStarts[1]!, player: 2, x: 169.5, z: 169.5 },
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
    ).toBe(81.5);
    for (let i = 0; i < 100; i++) {
      a.tick();
      b.tick();
    }
    expect(a.checksum()).toBe(b.checksum());
    expect(mapRevision(map)).not.toBe(mapRevision(emptyUtcMap()));
  });
});
