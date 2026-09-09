import { atPoint, precise } from "./motion";
import { summarizeGoods, type GoodsSummary } from "./goodsView";
import { simulationHash } from "./checksum";
import { z } from "zod";
import type { Owner, Stock } from "../../content/schema";
import { ownerSchema, ownerSlot } from "../../content/schema";
import { territoryBorder } from "../../shared/settlement/territoryBorder";
import { GameContext } from "./context";
import { type Entity, type Fact, type GameState } from "./state";

export type EntityView = {
  id: number;
  definition: string;
  owner: Owner;
  x: number;
  y: number;
  rotation: number;
  hp: number | null;
  appearance?: Entity["appearance"];
  remembered?: boolean;
  inventory?: Stock;
  construction?: { progress: number };
  resource?: Entity["resource"];
  item?: Entity["item"];
  unit?: {
    moving: boolean;
    strolling?: boolean;
    contained: boolean;
    cargo: NonNullable<Entity["unit"]>["cargo"];
    target: number | null;
    commandedTarget?: number | null;
    work?: { animation: "build" | "chop"; x: number; y: number };
    cooldown: number;
  };
  production?: Entity["production"];
  job?: string;
};
export type FogView = { cells: Uint8Array; revision: number; owner: number };
export type SettlementView = {
  goods?: GoodsSummary[];
  revision: number;
  entities: readonly EntityView[];
  territory: Int16Array;
  territoryBorders?: Uint8Array;
  fog?: FogView;
  outcome: GameState["outcome"];
  events: readonly Fact[];
  /** Ephemeral, visibility-filtered presentation cues; never targetable entities. */
  deaths?: readonly EntityView[];
  objectives: Readonly<Record<string, number>>;
};
type Memory = {
  owner: Owner;
  cells: Uint8Array;
  territory: Int16Array;
  borders: Uint8Array;
  entities: Map<number, EntityView>;
};
const memoryEntity = z
  .object({
    id: z.number().int().positive(),
    definition: z.string(),
    owner: ownerSchema,
    x: z.number().int().min(0).max(255),
    y: z.number().int().min(0).max(255),
    rotation: z.number(),
    hp: z.number().int().nonnegative().nullable(),
    appearance: z
      .object({ asset: z.string().optional(), scale: z.number().optional() })
      .optional(),
    construction: z
      .object({ progress: z.number().int().nonnegative() })
      .optional(),
    resource: z
      .object({
        amount: z.number().int().nonnegative(),
        growingUntil: z.number().int().nullable(),
      })
      .optional(),
    item: z.object({ quantity: z.number().int().positive() }).optional(),
  })
  .strict();
export const knowledgeSchema = z.array(
  z
    .object({
      owner: ownerSchema,
      cells: z.array(z.number().int().min(0).max(2)).length(65536),
      territory: z.array(z.number().int().min(-1).max(7)).length(65536),
      borders: z.array(z.number().int().min(0).max(4)).length(65536),
      entities: z.array(memoryEntity),
    })
    .strict(),
);

/** Simulation-owned knowledge. No UI consumer receives authoritative entity objects. */
export class Observation {
  private readonly memories: Memory[];
  private readonly deathCues: { entity: EntityView; tick: number; viewers: Owner[] }[] = [];
  recordDeath(e: Entity) {
    if (!e.unit || e.unit.contained) return;
    this.deathCues.push({ entity: this.describe(e, false), tick: this.c.state.tick,
      viewers: this.memories.filter(m => e.owner === m.owner || this.previouslyVisible(m.owner, e)).map(m => m.owner) });
    this.cache.clear();
  }
  private readonly cache = new Map<Owner | undefined, SettlementView>();
  constructor(
    private readonly c: GameContext,
    owners: readonly Owner[],
    private readonly available: (e: Entity, item: string) => number,
  ) {
    this.memories = owners.map((owner) => ({
      owner,
      cells: new Uint8Array(65536),
      territory: new Int16Array(65536).fill(-1),
      borders: new Uint8Array(65536),
      entities: new Map(),
    }));
  }
  visible(owner: Owner, e: Entity): boolean {
    if (e.owner === owner) return true;
    return this.c
      .live()
      .some(
        (sensor) =>
          sensor.owner === owner &&
          !sensor.unit?.contained &&
          !sensor.unit?.release &&
          this.c.spatial.range(sensor, e) <=
            (this.c.def(sensor).vision ?? 0) ** 2,
      );
  }
  previouslyVisible(owner: Owner, e: Entity): boolean {
    if (e.owner === owner) return true;
    const m = this.memories.find((p) => p.owner === owner);
    return (
      !!m && this.c.spatial.footprint(e).some((i) => i >= 0 && m.cells[i] === 2)
    );
  }
  explored(owner: Owner, indices: readonly number[]) {
    const m = this.memories.find((p) => p.owner === owner);
    return !!m && indices.every((i) => i >= 0 && m.cells[i] > 0);
  }
  private describe(e: Entity, privateData: boolean): EntityView {
    const result: EntityView = {
      id: e.id,
      definition: e.definition,
      owner: e.owner,
      x: precise(e).x,
      y: precise(e).y,
      rotation: e.rotation,
      hp: e.hp,
      ...(e.appearance ? { appearance: { ...e.appearance } } : {}),
      ...(e.construction
        ? { construction: { progress: e.construction.progress } }
        : {}),
      ...(e.resource ? { resource: { ...e.resource } } : {}),
      ...(e.item ? { item: { ...e.item } } : {}),
    };
    if (e.unit)
      result.unit = {
        moving: e.unit.route.length > 0,
        strolling: !!e.unit.idle?.walking,
        contained: !!(e.unit.contained || e.unit.release),
        cargo: e.unit.cargo ? { ...e.unit.cargo } : null,
        target: privateData ? e.unit.target : null,
        commandedTarget: privateData && e.unit.order?.type === "attack" ? e.unit.order.target : null,
        cooldown: e.unit.cooldown,
      };
    if (e.unit && result.unit && !result.unit.moving && !result.unit.contained &&
      (e.unit.goal === null || atPoint(e, {x: e.unit.goal % 256, y: Math.floor(e.unit.goal / 256)}))) {
      const job = this.c.state.jobs.find(j => j.id === e.unit!.job);
      const workplace = this.c.get(job?.target);
      const creation = job?.type === "construct" || job?.type === "repair"
        ? workplace && this.c.def(workplace).creation
        : job?.type === "harvest" && job.phase !== "return" && workplace?.production?.active
          ? this.c.registry.get(workplace.production.active.definition).creation : undefined;
      const target = job?.type === "harvest" ? this.c.get(job.source) : workplace;
      if (creation && "workAnimation" in creation && creation.workAnimation && target)
        result.unit.work = {animation: creation.workAnimation, x: target.x, y: target.y};
    }
    if (privateData) {
      result.inventory = { ...e.inventory };
      if (e.production) result.production = structuredClone(e.production);
      const job = this.c.state.jobs.find((j) => j.id === e.unit?.job),
        workplace = this.c.get(e.unit?.employment),
        label = workplace
          ? this.c.def(workplace).behaviors.production?.jobName
          : null;
      result.job = e.unit?.pendingMove
        ? "Delivering before move"
        : e.unit?.release
          ? "Waiting for release"
          : e.unit?.contained
            ? "Training"
            : e.unit?.cargo && !job
              ? "Cargo blocked"
              : job
                ? `${label ? label + " · " : ""}${job.type}`
                : label
                  ? `${label} · waiting`
                  : e.unit?.order
                    ? "Following order"
                    : "Available";
    }
    return result;
  }
  update() {
    this.cache.clear();
    while (this.deathCues.length && this.c.state.tick - this.deathCues[0].tick > 80) this.deathCues.shift();
    for (const m of this.memories) {
      m.cells = m.cells.slice();
      m.territory = m.territory.slice();
      m.borders = m.borders.slice();
      for (let i = 0; i < 65536; i++) if (m.cells[i] === 2) m.cells[i] = 1;
      for (const sensor of this.c
        .live()
        .filter(
          (e) => e.owner === m.owner && !e.unit?.contained && !e.unit?.release,
        )) {
        const r = this.c.def(sensor).vision ?? 0;
        for (let dy = -r; dy <= r; dy++) {
          const y = sensor.y + dy;
          if (y < 0 || y >= 256) continue;
          const span = Math.floor(Math.sqrt(r * r - dy * dy));
          m.cells.fill(
            2,
            y * 256 + Math.max(0, sensor.x - span),
            y * 256 + Math.min(255, sensor.x + span) + 1,
          );
        }
      }
      for (const [id, e] of m.entities)
        if (this.c.spatial.footprint(e).some((i) => i >= 0 && m.cells[i] === 2))
          m.entities.delete(id);
      for (const e of this.c.live())
        if (
          !e.unit &&
          (e.resource || this.c.def(e).kind === "building") &&
          this.c.spatial.footprint(e).some((i) => i >= 0 && m.cells[i] === 2)
        )
          m.entities.set(e.id, this.describe(e, false));
      for (let i = 0; i < 65536; i++)
        if (m.cells[i] === 2) {
          m.territory[i] = this.c.spatial.territory[i];
          m.borders[i] = territoryBorder(
            this.c.spatial.territory,
            i % 256,
            Math.floor(i / 256),
          );
        }
    }
  }
  view(owner?: Owner): SettlementView {
    const cached = this.cache.get(owner);
    if (cached) return cached;
    const m = this.memories.find((p) => p.owner === owner),
      known = new Map<number, EntityView>();
    if (owner !== undefined && !m) throw new Error("Unknown observation owner");
    if (m)
      for (const [id, e] of m.entities)
        known.set(id, { ...structuredClone(e), remembered: true });
    for (const e of this.c.live())
      if (!owner || e.owner === owner || this.previouslyVisible(owner, e))
        known.set(e.id, this.describe(e, !owner || e.owner === owner));
    const result: SettlementView = {
      deaths: this.deathCues.filter(cue => !owner || cue.viewers.includes(owner)).map(cue => cue.entity),
      ...(owner
        ? {
            goods: summarizeGoods(
              this.c.live(),
              owner,
              this.c.registry,
              this.available,
            ),
          }
        : {}),
      revision: this.c.state.tick,
      entities: [...known.values()].sort((a, b) => a.id - b.id),
      territory: m ? m.territory : this.c.spatial.territory.slice(),
      ...(m
        ? {
            territoryBorders: m.borders,
            fog: {
              cells: m.cells,
              revision: this.c.state.tick,
              owner: ownerSlot(m.owner),
            },
          }
        : {}),
      outcome: structuredClone(this.c.state.outcome),
      events: this.c.state.facts
        .filter((f) => !owner || f.owner === owner)
        .map((f) => ({ ...f })),
      objectives: owner
        ? { [owner]: this.c.state.objectives[owner] }
        : { ...this.c.state.objectives },
    };
    this.cache.set(owner, result);
    return result;
  }
  checksum() {
    return simulationHash(this.memories);
  }
  snapshot() {
    return this.memories.map((m) => ({
      owner: m.owner,
      cells: Array.from(m.cells),
      territory: Array.from(m.territory),
      borders: Array.from(m.borders),
      entities: [...m.entities.values()].map((e) => structuredClone(e)),
    }));
  }
  validateSnapshot(raw: unknown) {
    const rows = knowledgeSchema.parse(raw);
    if (
      rows.length !== this.memories.length ||
      new Set(rows.map((r) => r.owner)).size !== rows.length ||
      this.memories.some((m) => !rows.some((r) => r.owner === m.owner))
    )
      throw new Error("Invalid knowledge owners");
    for (const row of rows) {
      const ids = new Set<number>();
      for (const e of row.entities) {
        const d = this.c.registry.get(e.definition);
        if (
          ids.has(e.id) ||
          !["resource", "building"].includes(d.kind) ||
          (e.hp !== null && (!d.body || e.hp > d.body.maxHp))
        )
          throw new Error("Invalid remembered entity");
        ids.add(e.id);
      }
    }
    return rows;
  }
  restore(raw: unknown) {
    const rows = this.validateSnapshot(raw);
    this.deathCues.length = 0;
    for (const m of this.memories) {
      const row = rows.find((r) => r.owner === m.owner)!;
      m.cells = Uint8Array.from(row.cells);
      m.territory = Int16Array.from(row.territory);
      m.borders = Uint8Array.from(row.borders);
      m.entities = new Map(row.entities.map((e) => [e.id, e]));
    }
    this.cache.clear();
  }
}
