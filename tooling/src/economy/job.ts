/**
 * Function-tab machines. Authoring only — World still switches on worker kind.
 * One hut, one job. Stacks / door / flag are separate cells on the draft.
 *
 * Reads sim `BuildingDef` field names and writes the authoring draft shape
 * (`door` / `flag` / `viewDistance` / `requestStacks`).
 */
import { buildings as simBuildings, type BuildingKind } from "../../../src/sim/data/buildings";
import { settlers, type SettlerKind } from "../../../src/sim/data/settlers";
import type { BuildingDef, SettlerDef } from "../../../src/sim/data/types";

export const MACHINES = [
  "house",
  "military",
  "gather",
  "mine",
  "convert",
  "store",
  "recruit",
  "heal",
  "temple",
  "ship",
] as const;
export type Machine = (typeof MACHINES)[number];

export const MACHINE_LABEL: Record<Machine, string> = {
  house: "House",
  military: "Military",
  gather: "Gather",
  mine: "Mine",
  convert: "Convert",
  store: "Store",
  recruit: "Recruit",
  heal: "Heal",
  temple: "Temple",
  ship: "Ship",
};

export const GATHER_TARGETS = ["tree", "stone", "plant", "crop", "grape", "fish", "water"] as const;
export type GatherTarget = (typeof GATHER_TARGETS)[number];

export const DEPOSITS = ["coal", "iron", "gold", "gems", "brimstone"] as const;
export type Deposit = (typeof DEPOSITS)[number];

export const SPAWNS = ["bearer", "donkey"] as const;
export type SpawnKind = (typeof SPAWNS)[number];

export const CONVERT_MODES = ["saw", "craft"] as const;
export type ConvertMode = (typeof CONVERT_MODES)[number];

/** Sim goods plus a few authoring-only names (ingots, wine, aliases) until World grows them. */
export const GOODS = [
  "trunk",
  "plank",
  "stone",
  "axe",
  "hammer",
  "blade",
  "pick",
  "saw",
  "coal",
  "ironore",
  "goldore",
  "iron",
  "goldbar",
  "crop",
  "flour",
  "bread",
  "fish",
  "meat",
  "pig",
  "water",
  "wine",
  "scythe",
  "fishingrod",
] as const;
export type GoodId = (typeof GOODS)[number];

export const WORKERS = [
  "lumberjack",
  "stonecutter",
  "forester",
  "sawmiller",
  "miner",
  "farmer",
  "miller",
  "baker",
  "fisherman",
  "pig_farmer",
  "slaughterer",
  "waterworker",
  "smelter",
  "toolsmith",
  "weaponsmith",
  "healer",
  "priest",
] as const;
export type WorkerId = (typeof WORKERS)[number];

export const PLACE_GROUNDS = ["grass", "earth", "flattened", "mountain", "desert", "dryGrass", "sand", "snow"] as const;

export type Job =
  | { type: "house"; spawn: SpawnKind; beds: number; produceMs: number }
  | { type: "military"; garrison: number; occupies: boolean }
  | { type: "gather"; target: GatherTarget; radius: number }
  | { type: "mine"; deposit: Deposit }
  | { type: "convert"; mode: ConvertMode; inputs: GoodId[]; output: GoodId; durationMs: number }
  | { type: "store" }
  | { type: "recruit"; from: string; to: string; consume: GoodId[] }
  | { type: "heal" }
  | { type: "temple" }
  | { type: "ship" };

export function isMachine(value: string): value is Machine {
  return (MACHINES as readonly string[]).includes(value);
}

export function isGood(value: string): value is GoodId {
  return (GOODS as readonly string[]).includes(value);
}

export function isWorker(value: string): value is WorkerId {
  return (WORKERS as readonly string[]).includes(value);
}

export function defaultJob(type: Machine): Job {
  switch (type) {
    case "house":
      return { type: "house", spawn: "bearer", beds: 10, produceMs: 2000 };
    case "military":
      return { type: "military", garrison: 1, occupies: true };
    case "gather":
      return { type: "gather", target: "tree", radius: 30 };
    case "mine":
      return { type: "mine", deposit: "coal" };
    case "convert":
      return { type: "convert", mode: "craft", inputs: ["flour", "water"], output: "bread", durationMs: 7000 };
    case "store":
      return { type: "store" };
    case "recruit":
      return { type: "recruit", from: "bearer", to: "swordsman", consume: ["blade"] };
    case "heal":
      return { type: "heal" };
    case "temple":
      return { type: "temple" };
    case "ship":
      return { type: "ship" };
  }
}

export function parseJob(raw: unknown): Job | null {
  if (typeof raw !== "object" || raw == null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string" || !isMachine(o.type)) return null;
  switch (o.type) {
    case "house": {
      const spawn = o.spawn === "donkey" ? "donkey" : "bearer";
      const beds = asPos(o.beds) ?? 10;
      const produceMs = asPos(o.produceMs) ?? 2000;
      return { type: "house", spawn, beds, produceMs };
    }
    case "military":
      return {
        type: "military",
        garrison: asPos(o.garrison) ?? 0,
        occupies: o.occupies !== false,
      };
    case "gather":
      return {
        type: "gather",
        target: isGather(o.target) ? o.target : "tree",
        radius: asPos(o.radius) ?? 0,
      };
    case "mine":
      return { type: "mine", deposit: isDeposit(o.deposit) ? o.deposit : "coal" };
    case "convert": {
      const inputs = asGoods(o.inputs);
      const output = typeof o.output === "string" && isGood(o.output) ? o.output : "plank";
      return {
        type: "convert",
        mode: o.mode === "saw" ? "saw" : "craft",
        inputs: inputs.length > 0 ? inputs : ["trunk"],
        output,
        durationMs: asPos(o.durationMs) ?? 7000,
      };
    }
    case "store":
      return { type: "store" };
    case "recruit":
      return {
        type: "recruit",
        from: typeof o.from === "string" && o.from ? o.from : "bearer",
        to: typeof o.to === "string" && o.to ? o.to : "swordsman",
        consume: asGoods(o.consume),
      };
    case "heal":
      return { type: "heal" };
    case "temple":
      return { type: "temple" };
    case "ship":
      return { type: "ship" };
  }
}

/** Sim def wins; otherwise catalog-id heuristics. */
export function jobOf(kind: string): Job {
  if (kind in simBuildings) return jobFromDef(simBuildings[kind as BuildingKind]);
  return jobFromKind(kind);
}

export function sitesOf(kind: string): {
  worker: string | null;
  viewDistance: number;
  ground: string[];
  door: { dx: number; dy: number };
  flag: { dx: number; dy: number };
  workSpot: { dx: number; dy: number; direction: string } | null;
  workCenter: { dx: number; dy: number } | null;
  request: { dx: number; dy: number; material: string }[];
  offer: { dx: number; dy: number; material: string }[];
} {
  const empty = {
    worker: null as string | null,
    viewDistance: 0,
    ground: ["grass", "earth", "flattened"],
    door: { dx: 0, dy: 0 },
    flag: { dx: 0, dy: 0 },
    workSpot: null as { dx: number; dy: number; direction: string } | null,
    workCenter: null as { dx: number; dy: number } | null,
    request: [] as { dx: number; dy: number; material: string }[],
    offer: [] as { dx: number; dy: number; material: string }[],
  };
  if (!(kind in simBuildings)) return empty;
  const def: BuildingDef = simBuildings[kind as BuildingKind];
  return {
    worker: def.worker,
    viewDistance: def.viewDistance,
    ground: [...def.ground],
    door: { dx: def.door.dx, dy: def.door.dy },
    flag: { dx: def.flag.dx, dy: def.flag.dy },
    workSpot: def.workSpot ? { dx: def.workSpot.dx, dy: def.workSpot.dy, direction: def.workSpot.direction } : null,
    workCenter: def.workCenter ? { dx: def.workCenter.dx, dy: def.workCenter.dy } : null,
    request: def.requestStacks.map((s) => ({ dx: s.dx, dy: s.dy, material: s.material })),
    offer: def.offerStacks.map((s) => ({ dx: s.dx, dy: s.dy, material: s.material })),
  };
}

function jobFromDef(def: BuildingDef): Job {
  if (def.beds) {
    return { type: "house", spawn: "bearer", beds: def.beds, produceMs: def.produceMs ?? 2000 };
  }
  if (def.mine) {
    return { type: "mine", deposit: def.mine };
  }
  if (def.occupies || (def.garrison ?? 0) > 0) {
    return { type: "military", garrison: def.garrison ?? 0, occupies: def.occupies === true };
  }
  if (def.workRadius > 0) {
    return { type: "gather", target: gatherTargetOf(def.kind, def.worker), radius: def.workRadius };
  }
  if (def.requestStacks.length > 0) {
    const inputs = uniqueGoods(def.requestStacks.map((s) => s.material));
    const output = def.offerStacks[0]?.material;
    const durationMs = durationOf(def.worker);
    const mode: ConvertMode = def.requestStacks.length > 1 ? "craft" : "saw";
    return {
      type: "convert",
      mode,
      inputs: inputs.length > 0 ? inputs : ["trunk"],
      output: output && isGood(output) ? output : "plank",
      durationMs,
    };
  }
  return jobFromKind(def.kind);
}

function jobFromKind(kind: string): Job {
  switch (kind) {
    case "small_livinghouse":
    case "medium_livinghouse":
    case "big_livinghouse":
      return { type: "house", spawn: "bearer", beds: kind === "small_livinghouse" ? 10 : 20, produceMs: 2000 };
    case "donkey_farm":
      return { type: "house", spawn: "donkey", beds: 6, produceMs: 4000 };
    case "tower":
    case "lookout_tower":
    case "big_tower":
    case "castle":
      return {
        type: "military",
        garrison: kind === "castle" ? 8 : kind === "big_tower" ? 3 : kind === "lookout_tower" ? 0 : 1,
        occupies: kind !== "lookout_tower",
      };
    case "stock":
    case "marketplace":
    case "harbor":
      return { type: "store" };
    case "barrack":
    case "barracks":
      return { type: "recruit", from: "bearer", to: "swordsman", consume: ["blade"] };
    case "hospital":
      return { type: "heal" };
    case "temple":
    case "big_temple":
      return { type: "temple" };
    case "shipyard":
    case "dockyard":
      return { type: "ship" };
    case "coalmine":
      return { type: "mine", deposit: "coal" };
    case "ironmine":
      return { type: "mine", deposit: "iron" };
    case "goldmine":
      return { type: "mine", deposit: "gold" };
    case "ironmelt":
      return { type: "convert", mode: "craft", inputs: ["ironore", "coal"], output: "iron", durationMs: 7000 };
    case "goldmelt":
      return { type: "convert", mode: "craft", inputs: ["goldore", "coal"], output: "goldbar", durationMs: 7000 };
    case "toolsmith":
      return { type: "convert", mode: "craft", inputs: ["iron"], output: "pick", durationMs: 7000 };
    case "weaponsmith":
      return { type: "convert", mode: "craft", inputs: ["iron", "coal"], output: "blade", durationMs: 7000 };
    case "winegrower":
      return { type: "gather", target: "grape", radius: 8 };
    case "lumberjack":
      return { type: "gather", target: "tree", radius: 30 };
    case "stonecutter":
      return { type: "gather", target: "stone", radius: 20 };
    case "forester":
      return { type: "gather", target: "plant", radius: 18 };
    case "farm":
      return { type: "gather", target: "crop", radius: 6 };
    case "fisher":
      return { type: "gather", target: "fish", radius: 30 };
    case "waterworks":
      return { type: "gather", target: "water", radius: 20 };
    default:
      return { type: "gather", target: "tree", radius: 0 };
  }
}

function gatherTargetOf(kind: string, worker: string | null): GatherTarget {
  if (worker === "lumberjack" || kind === "lumberjack") return "tree";
  if (worker === "stonecutter" || kind === "stonecutter") return "stone";
  if (worker === "forester" || kind === "forester") return "plant";
  if (worker === "farmer" || kind === "farm") return "crop";
  if (worker === "fisherman" || kind === "fisher") return "fish";
  if (worker === "waterworker" || kind === "waterworks") return "water";
  if (kind === "winegrower") return "grape";
  return "tree";
}

function durationOf(worker: string | null): number {
  if (!worker || !(worker in settlers)) return 7000;
  const def: SettlerDef = settlers[worker as SettlerKind];
  return def.chopMs ?? 7000;
}

function uniqueGoods(values: readonly string[]): GoodId[] {
  const out: GoodId[] = [];
  for (const v of values) {
    if (!isGood(v) || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

function asGoods(value: unknown): GoodId[] {
  if (!Array.isArray(value)) return [];
  const out: GoodId[] = [];
  for (const item of value) {
    if (typeof item === "string" && isGood(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

function asPos(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function isGather(value: unknown): value is GatherTarget {
  return typeof value === "string" && (GATHER_TARGETS as readonly string[]).includes(value);
}

function isDeposit(value: unknown): value is Deposit {
  return typeof value === "string" && (DEPOSITS as readonly string[]).includes(value);
}
