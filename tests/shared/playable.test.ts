import {flatTerrainData} from '../../src/shared/map/terrainData';
import { describe, it, expect } from "vitest";
import {
  emptyUtcMap,
  parseUtcMap,
  stringifyUtcMap,
} from "../../src/shared/map/utcmap";
import { playableMapError, mapRevision } from "../../src/shared/map/playable";
import { World } from "../../src/sim/world/world";
import {testContent} from '../fixtures/content';
import {placementOccupancyError,expandMap} from '../../src/content/map';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {footprintCellBounds} from '../../src/shared/spatial/footprint';
// playableMapError has no registry parameter (ENGINE-COUPLED to shipped content), so its cases below use only
// content-free maps: empty canvases, starts and terrain. Placement-level rules are checked with the test registry.
describe("authored playable maps", () => {
  it('rejects an adjacent resource clipping a starting body even when its centre cell is free',()=>{
    const blank=emptyUtcMap(),hero=expandMap(blank,testContent).find(p=>p.owner==='player.1'&&testContent.get(p.definition).hero)!;
    // A tree leaves the mine-facing formation unchanged, isolating body clearance.
    const node=testContent.get('resource.test.forest-tree');
    const position=snapPlacement(node,{x:hero.position.x+2,y:hero.position.y});
    const map={...blank,entities:[{id:'node',definition:node.id,owner:'none' as const,rotation:0,position}]};
    const bounds=footprintCellBounds(position,node.footprint);
    expect(hero.position.x).toBeLessThan(bounds.minX);
    expect(placementOccupancyError(map,testContent)).toBe(`${hero.id}: body overlaps node`);
    map.entities[0].position.x+=4;
    expect(placementOccupancyError(map,testContent)).toBeNull();
  });
  it("accepts a fresh dry canvas and persists its two distinct starts", () => {
    const map = emptyUtcMap();
    expect(playableMapError(map)).toBeNull();
    expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.playerStarts).toEqual(
      map.playerStarts,
    );
  });
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
    const a = new World({ map, slots, seed: 1, registry: testContent }),
      b = new World({ map, slots, seed: 1, registry: testContent });
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
