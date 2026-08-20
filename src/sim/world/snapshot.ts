/**
 * Full World blob for save/load. Not a replay — restore skips re-sim.
 * Bump `SAVE_FORMAT_VERSION` (session/save) when this shape changes.
 */
import type { Action, Direction } from "../../shared";
import type { BuildingFlag, BuildingState } from "../building/building";
import type { BuildingKind } from "../data/buildings";
import { buildings } from "../data/buildings";
import type { SettlerKind } from "../data/settlers";
import { settlers } from "../data/settlers";
import type { Goods } from "../data/types";
import type { Job } from "../job/job";
import type { MapObjectView } from "../object/object";
import type { MovableAction, MovableMaterial } from "../movable/movable";
import type { MatchOutcome } from "./world";

export type PosSnap = { x: number; y: number };

export type BuildingSnap = {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  player: number;
  hq: boolean;
  doorHealth: number;
  doorRegen: number;
  state: BuildingState;
  produceWait: number;
  produced: number;
  constructionProgress: number;
  remainingMaterialActions: number;
  landClaimed: boolean;
  fogDistance: number;
  flattenHeight: number;
  /** Outdoor search origin. Defaults to hut origin when missing (old saves). */
  workX: number;
  workY: number;
};

export type MovableSnap = {
  id: number;
  type: SettlerKind;
  workplaceId: number | null;
  pos: PosSnap;
  from: PosSnap;
  direction: Direction;
  action: MovableAction;
  moveProgress: number;
  stepTicks: number;
  player: number;
  job: Job | null;
  workElapsed: number;
  material: MovableMaterial;
  restLeft: number;
  inside: boolean;
  flockDelayMs: number;
  flockLeft: number;
  health: number;
  forcedUntil: PosSnap | null;
  queue: PosSnap[];
  stepElapsed: number;
  stepping: boolean;
  marked: PosSnap | null;
  pathFail: PosSnap | null;
  pathRetry: number;
};

export type FogHiddenSnap = {
  i: number;
  landscape: number;
  height: number;
  object?: MapObjectView;
  building?: {
    id: number;
    kind: BuildingKind;
    x: number;
    y: number;
    player: number;
    state: BuildingState;
    buildProgress: number;
    flag: BuildingFlag | null;
  };
};

export type FogLayerSnap = {
  player: number;
  generation: number;
  sight: string;
  hidden: string;
  dirty: string;
  refs: { i: number; v: number[] }[];
  tiles: FogHiddenSnap[];
};

export type LandOccupySnap = { player: number; x: number; y: number; radius: number };

export type QueuedSnap = { tick: number; player: number; action: Action; seq: number };

export type LoggedSnap = { tick: number; player: number; action: Action };

export type WorldSnapshot = {
  width: number;
  height: number;
  tickIndex: number;
  rng: number;
  nextId: number;
  nextSeq: number;
  gridRevision: number;
  buildingRevision: number;
  objectRevision: number;
  landscape: string;
  heightmap: string;
  objects: MapObjectView[];
  buildings: BuildingSnap[];
  units: MovableSnap[];
  marks: PosSnap[];
  land: {
    generation: number;
    owner: string;
    towers: string;
    occupies: LandOccupySnap[];
  };
  fog: FogLayerSnap[];
  fogAt: { id: number; x: number; y: number }[];
  hqPlayers: number[];
  diggerRatios: number[];
  bricklayerRatios: number[];
  outcome: MatchOutcome | null;
  pending: QueuedSnap[];
  applied: LoggedSnap[];
};

const JOB_TYPES = new Set<Job["type"]>([
  "chop",
  "cut",
  "pickup",
  "drop",
  "deliver",
  "saw",
  "occupy",
  "build",
  "plant",
  "pioneer",
  "flatten",
  "equip",
  "attack",
  "assault",
]);

const BUILDING_KINDS = new Set<string>(Object.keys(buildings));
const SETTLER_KINDS = new Set<string>(Object.keys(settlers));
const BUILDING_STATES = new Set(["plan", "building", "built"]);
const ACTIONS = new Set(["idle", "walk", "work"]);
const DIRS = new Set(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

export function isBuildingKind(v: unknown): v is BuildingKind {
  return typeof v === "string" && BUILDING_KINDS.has(v);
}

export function isSettlerKind(v: unknown): v is SettlerKind {
  return typeof v === "string" && SETTLER_KINDS.has(v);
}

export function parsePos(raw: unknown): PosSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  return { x: o.x, y: o.y };
}

export function parseJob(raw: unknown): Job | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string" || !JOB_TYPES.has(o.type as Job["type"])) return null;
  return raw as Job;
}

export function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  return raw as Action;
}

export function parseLogged(raw: unknown): LoggedSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.tick !== "number" || typeof o.player !== "number") return null;
  const action = parseAction(o.action);
  if (!action) return null;
  return { tick: o.tick, player: o.player, action };
}

export function parseQueued(raw: unknown): QueuedSnap | null {
  const e = parseLogged(raw);
  if (!e) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.seq !== "number") return null;
  return { ...e, seq: o.seq };
}

export function parseOutcome(raw: unknown): MatchOutcome | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.winner !== null && typeof o.winner !== "number") return undefined;
  if (!Array.isArray(o.defeated) || o.defeated.some((p) => typeof p !== "number")) return undefined;
  return { winner: o.winner, defeated: o.defeated as number[] };
}

function parseBuilding(raw: unknown): BuildingSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "number" || !isBuildingKind(o.kind)) return null;
  if (typeof o.x !== "number" || typeof o.y !== "number" || typeof o.player !== "number") return null;
  if (typeof o.hq !== "boolean" || typeof o.state !== "string" || !BUILDING_STATES.has(o.state)) return null;
  if (typeof o.doorHealth !== "number" || typeof o.doorRegen !== "number") return null;
  if (typeof o.produceWait !== "number" || typeof o.produced !== "number") return null;
  if (typeof o.constructionProgress !== "number" || typeof o.remainingMaterialActions !== "number") return null;
  if (typeof o.landClaimed !== "boolean" || typeof o.fogDistance !== "number" || typeof o.flattenHeight !== "number") {
    return null;
  }
  const workX = typeof o.workX === "number" ? o.workX : o.x;
  const workY = typeof o.workY === "number" ? o.workY : o.y;
  return {
    id: o.id,
    kind: o.kind,
    x: o.x,
    y: o.y,
    player: o.player,
    hq: o.hq,
    doorHealth: o.doorHealth,
    doorRegen: o.doorRegen,
    state: o.state,
    produceWait: o.produceWait,
    produced: o.produced,
    constructionProgress: o.constructionProgress,
    remainingMaterialActions: o.remainingMaterialActions,
    landClaimed: o.landClaimed,
    fogDistance: o.fogDistance,
    flattenHeight: o.flattenHeight,
    workX,
    workY,
  } as BuildingSnap;
}

function parseMovable(raw: unknown): MovableSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "number" || !isSettlerKind(o.type) || typeof o.player !== "number") return null;
  const pos = parsePos(o.pos);
  const from = parsePos(o.from);
  if (!pos || !from) return null;
  if (typeof o.direction !== "string" || !DIRS.has(o.direction)) return null;
  if (typeof o.action !== "string" || !ACTIONS.has(o.action)) return null;
  if (typeof o.moveProgress !== "number" || typeof o.stepTicks !== "number") return null;
  if (o.workplaceId !== null && typeof o.workplaceId !== "number") return null;
  if (o.job !== null && !parseJob(o.job)) return null;
  if (typeof o.workElapsed !== "number" || typeof o.material !== "string") return null;
  if (typeof o.restLeft !== "number" || typeof o.inside !== "boolean") return null;
  if (typeof o.flockDelayMs !== "number" || typeof o.flockLeft !== "number" || typeof o.health !== "number") return null;
  if (o.forcedUntil !== null && !parsePos(o.forcedUntil)) return null;
  if (!Array.isArray(o.queue)) return null;
  const queue: PosSnap[] = [];
  for (const p of o.queue) {
    const pos2 = parsePos(p);
    if (!pos2) return null;
    queue.push(pos2);
  }
  if (typeof o.stepElapsed !== "number" || typeof o.stepping !== "boolean") return null;
  if (o.marked !== null && !parsePos(o.marked)) return null;
  if (o.pathFail !== null && !parsePos(o.pathFail)) return null;
  if (typeof o.pathRetry !== "number") return null;
  return {
    id: o.id,
    type: o.type,
    workplaceId: o.workplaceId as number | null,
    pos,
    from,
    direction: o.direction as Direction,
    action: o.action as MovableAction,
    moveProgress: o.moveProgress,
    stepTicks: o.stepTicks,
    player: o.player,
    job: o.job as Job | null,
    workElapsed: o.workElapsed,
    material: o.material as MovableMaterial | Goods,
    restLeft: o.restLeft,
    inside: o.inside,
    flockDelayMs: o.flockDelayMs,
    flockLeft: o.flockLeft,
    health: o.health,
    forcedUntil: o.forcedUntil as PosSnap | null,
    queue,
    stepElapsed: o.stepElapsed,
    stepping: o.stepping,
    marked: o.marked as PosSnap | null,
    pathFail: o.pathFail as PosSnap | null,
    pathRetry: o.pathRetry,
  };
}

function parseFogLayer(raw: unknown): FogLayerSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.player !== "number" || typeof o.generation !== "number") return null;
  if (typeof o.sight !== "string" || typeof o.hidden !== "string" || typeof o.dirty !== "string") return null;
  if (!Array.isArray(o.refs) || !Array.isArray(o.tiles)) return null;
  return o as unknown as FogLayerSnap;
}

/** Strict parse. Wrong shape → null (caller treats as incompatible version). */
export function parseWorldSnapshot(raw: unknown): WorldSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.width !== "number" || typeof o.height !== "number") return null;
  if (o.width < 2 || o.height < 2) return null;
  if (typeof o.tickIndex !== "number" || typeof o.rng !== "number") return null;
  if (typeof o.nextId !== "number" || typeof o.nextSeq !== "number") return null;
  if (typeof o.gridRevision !== "number" || typeof o.buildingRevision !== "number" || typeof o.objectRevision !== "number") {
    return null;
  }
  if (typeof o.landscape !== "string" || typeof o.heightmap !== "string") return null;
  if (!Array.isArray(o.objects) || !Array.isArray(o.buildings) || !Array.isArray(o.units)) return null;
  if (!Array.isArray(o.marks) || !Array.isArray(o.fog) || !Array.isArray(o.fogAt)) return null;
  if (!Array.isArray(o.hqPlayers) || !Array.isArray(o.diggerRatios) || !Array.isArray(o.bricklayerRatios)) return null;
  if (!Array.isArray(o.pending) || !Array.isArray(o.applied)) return null;
  if (!o.land || typeof o.land !== "object") return null;
  const land = o.land as Record<string, unknown>;
  if (typeof land.generation !== "number" || typeof land.owner !== "string" || typeof land.towers !== "string") return null;
  if (!Array.isArray(land.occupies)) return null;
  const outcome = parseOutcome(o.outcome);
  if (outcome === undefined) return null;
  const buildingsSnap: BuildingSnap[] = [];
  for (const b of o.buildings) {
    const p = parseBuilding(b);
    if (!p) return null;
    buildingsSnap.push(p);
  }
  const units: MovableSnap[] = [];
  for (const u of o.units) {
    const p = parseMovable(u);
    if (!p) return null;
    units.push(p);
  }
  const marks: PosSnap[] = [];
  for (const m of o.marks) {
    const p = parsePos(m);
    if (!p) return null;
    marks.push(p);
  }
  const fog: FogLayerSnap[] = [];
  for (const f of o.fog) {
    const p = parseFogLayer(f);
    if (!p) return null;
    fog.push(p);
  }
  const pending: QueuedSnap[] = [];
  for (const e of o.pending) {
    const p = parseQueued(e);
    if (!p) return null;
    pending.push(p);
  }
  const applied: LoggedSnap[] = [];
  for (const e of o.applied) {
    const p = parseLogged(e);
    if (!p) return null;
    applied.push(p);
  }
  const fogAt: { id: number; x: number; y: number }[] = [];
  for (const f of o.fogAt) {
    if (!f || typeof f !== "object") return null;
    const r = f as Record<string, unknown>;
    if (typeof r.id !== "number" || typeof r.x !== "number" || typeof r.y !== "number") return null;
    fogAt.push({ id: r.id, x: r.x, y: r.y });
  }
  if (o.diggerRatios.some((n) => typeof n !== "number") || o.bricklayerRatios.some((n) => typeof n !== "number")) {
    return null;
  }
  if (o.hqPlayers.some((n) => typeof n !== "number")) return null;
  return {
    width: o.width,
    height: o.height,
    tickIndex: o.tickIndex,
    rng: o.rng,
    nextId: o.nextId,
    nextSeq: o.nextSeq,
    gridRevision: o.gridRevision,
    buildingRevision: o.buildingRevision,
    objectRevision: o.objectRevision,
    landscape: o.landscape,
    heightmap: o.heightmap,
    objects: o.objects as MapObjectView[],
    buildings: buildingsSnap,
    units,
    marks,
    land: {
      generation: land.generation,
      owner: land.owner,
      towers: land.towers,
      occupies: land.occupies as LandOccupySnap[],
    },
    fog,
    fogAt,
    hqPlayers: o.hqPlayers as number[],
    diggerRatios: o.diggerRatios as number[],
    bricklayerRatios: o.bricklayerRatios as number[],
    outcome,
    pending,
    applied,
  };
}
