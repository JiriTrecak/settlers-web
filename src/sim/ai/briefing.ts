import {sourceHeight} from '../../shared/map/importedTerrain';
import {sourceWater} from '../../shared/map/importedWater';
import {bridgeSurfaces,type BridgeSurface} from '../../shared/map/bridgeSurface';
import {applySceneryBlockers} from '../../shared/map/sceneryCollision';
import { fingerprint, type ContentRegistry } from "../../content/registry";
import type { UtcMap } from "../../shared/map/utcmap";
import { sampleHeight, decodeHeight, HEIGHT_ORIGIN, WADING_DEPTH_CM } from "../../shared/map/height";
import type { Point } from "../game/state";

export type CampSite = Readonly<{
  id: string;
  point: Point;
  radius: number;
  composition: readonly string[];
}>;
export type ResourceSite = Readonly<{
  id: string;
  definition: string;
  point: Point;
}>;
export type MapBriefing = Readonly<{
  size: number;
  unitScale?: number;
  fingerprint: string;
  heights: readonly number[];
  land: readonly number[];
  surfaces: readonly BridgeSurface[];
  starts: readonly Point[];
  camps: readonly CampSite[];
  resources: readonly ResourceSite[];
}>;
/** Authored baseline only. No runtime entities, owner assignments, camp survival or loot RNG. */
export function createMapBriefing(
  map: UtcMap,
  registry: ContentRegistry,
): MapBriefing {
  const compiled=projectScene(map);if(compiled)map={...map,stamps:compiled.stamps};
  const heights: number[] = [],
    land: number[] = [],
    h = map.height ? decodeHeight(map.height, map.size) : null,
    vertices = map.size + 33,
    sea = Math.round((map.waterLevel ?? 0) * 100);
  const imported=map.landscape?.importedTerrain,source=compiled?{sample:(x:number,z:number)=>compiled.field.sample(x,z)}:imported?sourceHeight(imported):undefined,water=compiled?{sample:(x:number,z:number)=>compiled.field.waterAt(x,z)}:imported?sourceWater(imported):undefined;
  for (let y = 0; y < map.size; y++)
    for (let x = 0; x < map.size; x++) {
      const n = Math.round(
        (source?.sample(x,y)??h?.[(y - HEIGHT_ORIGIN) * vertices + x - HEIGHT_ORIGIN] ?? 0) * 100,
      );
      heights.push(n);
      land.push(n >= (water?Math.round(water.sample(x,y)*100):sea) - WADING_DEPTH_CM ? 1 : 0);
    }
  if(imported)for(let z=0;z<map.size;z++)for(let x=0;x<map.size;x++)if(x<imported.origin[0]||z<imported.origin[1]||x>=imported.origin[0]+imported.blocks[0]*16||z>=imported.origin[1]+imported.blocks[1]*16)land[z*map.size+x]=0;
  const surfaces=bridgeSurfaces(map.stamps,(x,z)=>source?.sample(x,z)??(h?sampleHeight(h,x,z,map.size):0));
  applySceneryBlockers(map, land);
  const placements = new Map(map.entities.map((p) => [p.id, p]));
  const camps = map.camps
    .filter((c) => c.aggression === "players" && c.mapKnowledge !== "hidden")
    .map((c) =>
      Object.freeze({
        id: c.id,
        point: Object.freeze({ ...c.home }),
        radius: Math.min(c.leash, 16),
        composition: Object.freeze(
          c.members
            .map((id) => placements.get(id))
            .filter((p) => p && p.mapKnowledge !== "hidden")
            .map((p) => p!.definition)
            .sort(),
        ),
      }),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const resources = map.entities
    .filter(
      (p) => !!registry.get(p.definition).yield && p.mapKnowledge !== "hidden",
    )
    .map((p) =>
      Object.freeze({
        id: p.id,
        definition: p.definition,
        point: Object.freeze({ ...p.position }),
      }),
    );
  const starts = map.playerStarts
    .map((p) => Object.freeze({ x: p.x, y: p.z }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const data = {
    size: map.size,
    unitScale: registry.rules.unitScale,
    heights: Object.freeze(heights),
    land: Object.freeze(land),
    surfaces: Object.freeze(surfaces),
    starts: Object.freeze(starts),
    camps: Object.freeze(camps),
    resources: Object.freeze(resources),
  };
  return Object.freeze({ ...data, fingerprint: fingerprint(data) });
}
import {projectScene} from '../../shared/authoring/project';
