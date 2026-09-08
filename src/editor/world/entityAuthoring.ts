import { content } from "../../content/builtin";
import { expandMap, validatePlacements } from "../../content/map";
import { placementSchema, type Placement } from "../../content/schema";
import type { UtcMap } from "../../shared/map/utcmap";

export type EntityAuthoringState = Pick<
  UtcMap,
  "entities" | "camps" | "playerStarts"
>;

/** Keep entity/spawn undo independent of later terrain, scenery and lighting edits. */
export function entityAuthoringState(map: UtcMap): EntityAuthoringState {
  return structuredClone({
    entities: map.entities,
    camps: map.camps,
    playerStarts: map.playerStarts,
  });
}
export function restoreEntityAuthoring(
  map: UtcMap,
  state: EntityAuthoringState,
): UtcMap {
  const next = { ...map, ...structuredClone(state) };
  validatePlacements(next, content);
  return next;
}

/** Entity authoring is a transaction over authored records, never runtime entity mutation. */
export function putEntity(map: UtcMap, raw: unknown): UtcMap {
  const p = placementSchema.parse(raw);
  if (p.id.startsWith("start."))
    throw new Error("Move setup members with the spawn tool");
  const old = map.entities.find((e) => e.id === p.id),
    d = content.get(p.definition);
  let camps = map.camps
    .map((c) => ({ ...c, members: c.members.filter((id) => id !== p.id) }))
    .filter((c) => c.members.length);
  if (d.behaviors.campDefense) {
    if (p.owner !== "none")
      throw new Error(
        "Camp units must be unowned. Use a controlled definition for player units.",
      );
    const camp = map.camps.find((c) => c.members.includes(p.id));
    if (camp && old) {
      const surviving = camps.find((c) => c.id === camp.id);
      if (surviving) surviving.members.push(p.id);
      else camps.push({ ...camp, members: [p.id], home: { ...p.position } });
    } else
      camps.push({
        id: `camp/${p.id}`,
        members: [p.id],
        home: { ...p.position },
        aggroRange: d.behaviors.combat!.aggroRange,
        leash: 18,
        aggression: "players",
      });
  }
  const next = {
    ...map,
    entities: old
      ? map.entities.map((e) => (e.id === p.id ? p : e))
      : [...map.entities, p],
    camps,
  };
  validatePlacements(next, content);
  return next;
}
export function deleteEntity(map: UtcMap, id: string): UtcMap {
  if (map.playerStarts.some((s) => s.mainFort === id))
    throw new Error("The main fort is required. Move its spawn instead.");
  const next = {
    ...map,
    entities: map.entities.filter((e) => e.id !== id),
    camps: map.camps
      .map((c) => ({ ...c, members: c.members.filter((m) => m !== id) }))
      .filter((c) => c.members.length),
  };
  validatePlacements(next, content);
  return next;
}
export function authoredEntity(map: UtcMap, id: string): Placement | undefined {
  return expandMap(map, content).find((p) => p.id === id);
}
