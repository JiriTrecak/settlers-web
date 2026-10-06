import {snapPlacement} from '../../shared/spatial/placement';
import { content } from "../../content/builtin";
import { expandMap, validatePlacements } from "../../content/map";
import { CAMP_LOOT, campComposition, compositionMembers } from "../../content/campCompositions";
import { campSchema, placementSchema, type Placement } from "../../content/schema";
import type { UtcMap } from "../../shared/map/utcmap";

export type EntityAuthoringState = Pick<
  UtcMap,
  "entities" | "camps" | "playerStarts" | "mission"
>;

/** Keep entity/spawn undo independent of later terrain, scenery and lighting edits. */
export function entityAuthoringState(map: UtcMap): EntityAuthoringState {
  return structuredClone({
    mission: map.mission,
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
  const definition = content.get(p.definition);
  if (definition.kind === 'building') p.rotation = Math.round(p.rotation / 90) * 90;
  p.position = snapPlacement(definition, p.position, p.rotation);
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
export type CampStamp = {
  composition: string;
  position: { x: number; y: number };
  /** Degrees; the melee line faces this way, ranged members stand behind the leader. */
  rotation?: number;
  /** `camp/<name>`; re-stamping an existing ID replaces that camp. */
  id?: string;
  leash?: number;
  lootPool?: string;
  legendary?: boolean;
};

/** Stamp a whole themed camp: leader at home, melee arc in front, ranged arc behind, one camp record. */
export function placeCamp(map: UtcMap, stamp: CampStamp): UtcMap {
  const composition = campComposition(stamp.composition),
    rotation = stamp.rotation ?? 0,
    id = stamp.id ?? freeCampId(map, composition.id);
  if (!id.startsWith("camp/")) throw new Error("Camp IDs start with camp/");
  const cleared = map.camps.some((c) => c.id === id) ? deleteCamp(map, id) : map,
    members = compositionMembers(composition, (d) => {
      const def = content.get(d);
      return (def.level ?? 1) * 1e5 + (def.body?.maxHp ?? 0);
    }),
    [leader, ...rest] = members,
    melee = rest.filter((d) => {
      const combat = content.get(d).behaviors.combat;
      return !combat?.projectile && !combat?.shell;
    }),
    ranged = rest.filter((d) => !melee.includes(d)),
    face = (rotation * Math.PI) / 180,
    // Rendered bodies read ~1.5× their declared collision radius; space rings so models don't interpenetrate.
    body = (d: string) => (content.get(d).dimensions?.radius ?? 0.6) * 1.5,
    widest = Math.max(0, ...rest.map(body)),
    radius = Math.max(2.6, body(leader!) + widest + 0.8),
    gap = widest * 2 + 0.4,
    taken = new Set<string>(),
    slots: { definition: string; x: number; y: number }[] = [];
  const put = (definition: string, x: number, y: number) => {
    let px = Math.round(x),
      py = Math.round(y);
    // Integer placements: nudge outward until the cell is free so two members never share one.
    for (let k = 1; taken.has(`${px},${py}`); k++) {
      px = Math.round(stamp.position.x + ((x - stamp.position.x) * (radius + k)) / radius);
      py = Math.round(stamp.position.y + ((y - stamp.position.y) * (radius + k)) / radius);
    }
    taken.add(`${px},${py}`);
    slots.push({ definition, x: px, y: py });
  };
  const arc = (defs: string[], centre: number) =>
    defs.forEach((d, i) => {
      const spread = Math.min(Math.PI * 0.95, Math.max(defs.length * 0.75, ((defs.length - 1) * gap) / radius)),
        a = centre + (defs.length > 1 ? (i / (defs.length - 1) - 0.5) * spread : 0);
      put(d, stamp.position.x + Math.cos(a) * radius, stamp.position.y + Math.sin(a) * radius);
    });
  put(leader!, stamp.position.x, stamp.position.y);
  arc(melee, face);
  arc(ranged, face + Math.PI);
  const base = id.replace(/^camp\//, "camp."),
    placements = slots.map((s, i) =>
      placementSchema.parse({
        id: `${base}.${i}`,
        definition: s.definition,
        position: { x: s.x, y: s.y },
        rotation,
        owner: "none",
      }),
    );
  const next: UtcMap = {
    ...cleared,
    entities: [...cleared.entities, ...placements],
    camps: [
      ...cleared.camps,
      campSchema.parse({
        id,
        members: placements.map((p) => p.id),
        home: { ...stamp.position },
        aggroRange: Math.max(...members.map((d) => content.get(d).behaviors.combat?.aggroRange ?? 8)),
        leash: stamp.leash ?? 18,
        aggression: "players",
        lootPool: stamp.lootPool ?? (stamp.legendary ? "loot.camp.legendary" : CAMP_LOOT[composition.difficulty]),
        ...(stamp.legendary ? { legendary: true } : {}),
      }),
    ],
  };
  validatePlacements(next, content);
  return next;
}
function freeCampId(map: UtcMap, name: string): string {
  for (let n = 1; ; n++) if (!map.camps.some((c) => c.id === `camp/${name}-${n}`)) return `camp/${name}-${n}`;
}
/** Remove a camp record together with every member placement it owns. */
export function deleteCamp(map: UtcMap, campId: string): UtcMap {
  const camp = map.camps.find((c) => c.id === campId);
  if (!camp) throw new Error(`Unknown camp: ${campId}`);
  const members = new Set(camp.members),
    next = {
      ...map,
      entities: map.entities.filter((e) => !members.has(e.id)),
      camps: map.camps.filter((c) => c.id !== campId),
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

export function renameEntity(map:UtcMap,id:string,nextId:string):UtcMap {
  if(!/^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/.test(nextId))throw new Error("Use a letter, then letters, digits, dots, dashes or underscores (max 120).");
  if(nextId===id)return map;
  if(!map.entities.some(p=>p.id===id))throw new Error("Select an authored entity.");
  if(expandMap(map,content).some(p=>p.id===nextId))throw new Error("That entity ID already exists.");
  const next={...map,...(map.mission?.company?{mission:{...map.mission,company:map.mission.company.map(tag=>tag===id?nextId:tag)}}:{}),entities:map.entities.map(p=>p.id===id?{...p,id:nextId}:p),camps:map.camps.map(c=>({...c,members:c.members.map(m=>m===id?nextId:m)})),playerStarts:map.playerStarts.map(s=>s.mainFort===id?{...s,mainFort:nextId}:s)};
  validatePlacements(next,content);return next;
}
