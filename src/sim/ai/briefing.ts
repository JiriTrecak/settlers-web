import { fingerprint, type ContentRegistry } from "../../content/registry";
import type { UtcMap } from "../../shared/map/utcmap";
import { decodeHeight, HEIGHT_ORIGIN } from "../../shared/map/height";
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
  fingerprint: string;
  heights: readonly number[];
  land: readonly number[];
  starts: readonly Point[];
  camps: readonly CampSite[];
  resources: readonly ResourceSite[];
}>;
/** Authored baseline only. No runtime entities, owner assignments, camp survival or loot RNG. */
export function createMapBriefing(
  map: UtcMap,
  registry: ContentRegistry,
): MapBriefing {
  const heights: number[] = [],
    land: number[] = [],
    h = map.height ? decodeHeight(map.height, map.size) : null,
    vertices = map.size + 33,
    sea = Math.round((map.waterLevel ?? 0) * 100);
  for (let y = 0; y < map.size; y++)
    for (let x = 0; x < map.size; x++) {
      const n = Math.round(
        (h?.[(y - HEIGHT_ORIGIN) * vertices + x - HEIGHT_ORIGIN] ?? 0) * 100,
      );
      heights.push(n);
      land.push(n > sea + 10 ? 1 : 0);
    }
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
    heights: Object.freeze(heights),
    land: Object.freeze(land),
    starts: Object.freeze(starts),
    camps: Object.freeze(camps),
    resources: Object.freeze(resources),
  };
  return Object.freeze({ ...data, fingerprint: fingerprint(data) });
}
