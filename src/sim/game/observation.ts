import { workerPopulation, gathererCount } from "./population";
import type { VisualCue } from "./visualCues";
import { isStunned } from "./effects";
import { atPoint, precise } from "./motion";
import { summarizeGoods, type GoodsSummary } from "./goodsView";
import { simulationHash } from "./checksum";
import { z } from "zod";
import type { Owner, Stock } from "../../content/schema";
import { ownerSchema, ownerSlot } from "../../content/schema";
import { GameContext } from "./context";
import { type Entity, type Fact, type GameState } from "./state";
import { resolvedStatsSchema, type entityStats } from "./stats";

export type EntityView = {
  /** Owner-private control state, shared by command adapters; never parse job labels. */
  control?: {
    order: NonNullable<Entity["unit"]>["order"];
    employment: number | null;
    job: {
      type: import("./state").Job["type"];
      target: number;
      source: number | null;
      item: string | null;
      phase: import("./state").Job["phase"];
    } | null;
    pendingMove: NonNullable<Entity["unit"]>["pendingMove"];
    releasing: boolean;
    stunned: boolean;
  };
  effects?: Entity["effects"];
  hostile?: boolean;
  id: number;
  definition: string;
  owner: Owner;
  x: number;
  y: number;
  rotation: number;
  hp: number | null;
  stats?: ReturnType<typeof entityStats>;
  progression?: Entity["progression"];
  equipment?: Entity["equipment"];
  spellcasting?: Entity["spellcasting"];
  appearance?: Entity["appearance"];
  remembered?: boolean;
  inventory?: Stock;
  construction?: { progress: number };
  resource?: Entity["resource"];
  gathering?: { workers: number; capacity: number };
  item?: Entity["item"];
  unit?: {
    moving: boolean;
    strolling?: boolean;
    casting?: { ability: string; resolveTick: number };
    contained: boolean;
    cargo: NonNullable<Entity["unit"]>["cargo"];
    target: number | null;
    commandedTarget?: number | null;
    work?: { animation: "build" | "chop"; x: number; y: number };
    cooldown: number;
    shot?: { tick: number; x: number; y: number };
  };
  production?: Entity["production"];
  revival?: Entity["revival"];
  job?: string;
};
export type FogView = { cells: Uint8Array; revision: number; owner: number };
const observedDeathSchema = z
  .object({
    id: z.int().positive(),
    definition: z.string(),
    x: z.number(),
    y: z.number(),
    tick: z.int().nonnegative(),
  })
  .strict();
type ObservedDeath = z.infer<typeof observedDeathSchema>;
export type SettlementView = {
  /** Bounded, saved eyewitness reports. AI can confirm kills without reading hidden deaths. */
  observedDeaths?: readonly ObservedDeath[];
  fallenHeroes?: readonly EntityView[];
  visuals?: VisualCue[];
  goods?: GoodsSummary[];
  population?: ReturnType<typeof workerPopulation>;
  revision: number;
  entities: readonly EntityView[];
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
  visibleCells: number[];
  entities: Map<number, EntityView>;
  observedDeaths: ObservedDeath[];
};
const memoryEntity = z
  .object({
    id: z.number().int().positive(),
    definition: z.string(),
    owner: ownerSchema,
    x: z.number().int().min(0).max(511),
    y: z.number().int().min(0).max(511),
    rotation: z.number(),
    hp: z.number().int().nonnegative().nullable(),
    stats: resolvedStatsSchema.optional(),
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
    gathering: z
      .object({
        workers: z.number().int().nonnegative(),
        capacity: z.number().int().positive(),
      })
      .strict()
      .optional(),
    item: z.object({ quantity: z.number().int().positive() }).optional(),
  })
  .strict();
export const knowledgeSchema = z.array(
  z
    .object({
      owner: ownerSchema,
      cells: z.array(z.number().int().min(0).max(2)).max(262144),
      entities: z.array(memoryEntity),
      observedDeaths: z.array(observedDeathSchema).max(1280),
    })
    .strict(),
);

/** Simulation-owned knowledge. No UI consumer receives authoritative entity objects. */
export class Observation {
  private readonly memories: Memory[];
  private readonly sensorSignatures = new Map<Owner, string>();
  private readonly deathCues: {
    entity: EntityView;
    tick: number;
    viewers: Owner[];
  }[] = [];
  recordDeath(e: Entity) {
    if (!e.unit || e.unit.contained) return;
    this.deathCues.push({
      entity: this.describe(e, false),
      tick: this.c.state.tick,
      viewers: this.memories
        .filter(
          (m) => e.owner === m.owner || this.previouslyVisible(m.owner, e),
        )
        .map((m) => m.owner),
    });
    for (const m of this.memories)
      if (e.owner === m.owner || this.previouslyVisible(m.owner, e)) {
        m.observedDeaths.push({
          id: e.id,
          definition: e.definition,
          x: e.x,
          y: e.y,
          tick: this.c.state.tick,
        });
        if (m.observedDeaths.length > 1280) m.observedDeaths.shift();
      }
    this.cache.clear();
  }
  private readonly cache = new Map<Owner | undefined, SettlementView>();
  constructor(
    private readonly c: GameContext,
    owners: readonly Owner[],
    private readonly available: (e: Entity, item: string) => number,
    private readonly hostility?: (owner: Owner, e: Entity) => boolean,
  ) {
    this.memories = owners.map((owner) => ({
      owner,
      cells: new Uint8Array(this.c.spatial.size ** 2),
      visibleCells: [],
      entities: new Map(),
      observedDeaths: [],
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
  currentlyVisible(owner: Owner, indices: readonly number[]) {
    const memory = this.memories.find((m) => m.owner === owner);
    return !!memory && indices.every((i) => i >= 0 && memory.cells[i] === 2);
  }
  private describe(
    e: Entity,
    privateData: boolean,
    observer?: Owner,
  ): EntityView {
    const result: EntityView = {
      id: e.id,
      definition: e.definition,
      owner: e.owner,
      x: precise(e).x,
      y: precise(e).y,
      rotation: e.rotation,
      hp: e.hp,
      ...(observer ? { hostile: this.hostility?.(observer, e) ?? false } : {}),
      ...(this.c.def(e).body ? { stats: this.c.stats(e) } : {}),
      ...(privateData && e.revival
        ? { revival: structuredClone(e.revival) }
        : {}),
      ...(privateData && e.progression
        ? { progression: { ...e.progression } }
        : {}),
      ...(privateData && e.spellcasting
        ? { spellcasting: structuredClone(e.spellcasting) }
        : {}),
      ...(privateData && e.equipment ? { equipment: [...e.equipment] } : {}),
      ...(e.appearance ? { appearance: { ...e.appearance } } : {}),
      ...(e.construction
        ? { construction: { progress: e.construction.progress } }
        : {}),
      ...(e.resource ? { resource: { ...e.resource } } : {}),
      ...(this.c.def(e).gatheringCapacity
        ? {
            gathering: {
              workers: gathererCount(this.c.state, e.id),
              capacity: this.c.def(e).gatheringCapacity!,
            },
          }
        : {}),
      ...(e.item ? { item: { ...e.item } } : {}),
    };
    if (e.unit)
      result.unit = {
        moving: e.unit.route.length > 0,
        strolling: !!e.unit.idle?.walking,
        ...(e.spellcasting?.pending
          ? {
              casting: {
                ability: e.spellcasting.pending.ability,
                resolveTick: e.spellcasting.pending.resolveTick,
              },
            }
          : {}),
        contained: !!(e.unit.contained || e.unit.release),
        cargo: e.unit.cargo ? { ...e.unit.cargo } : null,
        target: privateData ? e.unit.target : null,
        commandedTarget:
          privateData && e.unit.order?.type === "attack"
            ? e.unit.order.target
            : null,
        cooldown: e.unit.cooldown,
        ...(e.unit.shot &&
        (!observer || e.unit.shot.viewers.includes(observer)) &&
        this.c.state.tick - e.unit.shot.tick < 24
          ? {
              shot: {
                tick: e.unit.shot.tick,
                x: e.unit.shot.x,
                y: e.unit.shot.y,
              },
            }
          : {}),
      };
    if (
      e.unit &&
      result.unit &&
      !result.unit.moving &&
      !result.unit.contained &&
      (e.unit.goal === null ||
        atPoint(e, {
          x: e.unit.goal % this.c.spatial.size,
          y: Math.floor(e.unit.goal / this.c.spatial.size),
        }))
    ) {
      const job = this.c.state.jobs.find((j) => j.id === e.unit!.job);
      const workplace = this.c.get(job?.target);
      const creation =
        job?.type === "construct" || job?.type === "repair"
          ? workplace && this.c.def(workplace).creation
          : job?.type === "harvest" && job.phase !== "return" && job.item
            ? this.c.registry.get(job.item).creation
            : undefined;
      const target =
        job?.type === "harvest" ? this.c.get(job.source) : workplace;
      if (
        creation &&
        "workAnimation" in creation &&
        creation.workAnimation &&
        target
      )
        result.unit.work = {
          animation: creation.workAnimation,
          x: target.x,
          y: target.y,
        };
    }
    if (privateData) {
      if (e.effects) result.effects = structuredClone(e.effects);
      if (e.unit) {
        const j = this.c.state.jobs.find((j) => j.id === e.unit!.job);
        result.control = {
          order: structuredClone(e.unit.order),
          employment: e.unit.employment,
          job: j
            ? {
                type: j.type,
                target: j.target,
                source: j.source,
                item: j.item,
                phase: j.phase,
              }
            : null,
          pendingMove: e.unit.pendingMove ? { ...e.unit.pendingMove } : null,
          releasing: !!e.unit.release,
          stunned: isStunned(e, this.c.registry),
        };
      }
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
    while (
      this.deathCues.length &&
      this.c.state.tick - this.deathCues[0].tick > 80
    )
      this.deathCues.shift();
    for (const m of this.memories) {
      m.observedDeaths = m.observedDeaths.filter(
        (d) => this.c.state.tick - d.tick <= 400,
      );
      const sensors = this.c
        .live()
        .filter(
          (e) => e.owner === m.owner && !e.unit?.contained && !e.unit?.release,
        );
      const signature = sensors
        .map((e) => `${e.id}:${e.x}:${e.y}:${this.c.def(e).vision ?? 0}`)
        .join(";");
      const visionChanged = this.sensorSignatures.get(m.owner) !== signature;
      this.sensorSignatures.set(m.owner, signature);
      if (visionChanged) {
        m.cells = m.cells.slice();
        for (const i of m.visibleCells) m.cells[i] = 1;
        m.visibleCells = [];
        for (const sensor of sensors) {
          const r = this.c.def(sensor).vision ?? 0;
          for (let dy = -r; dy <= r; dy++) {
            const y = sensor.y + dy;
            if (y < 0 || y >= this.c.spatial.size) continue;
            const span = Math.floor(Math.sqrt(r * r - dy * dy));
            const lo = y * this.c.spatial.size + Math.max(0, sensor.x - span),
              hi =
                y * this.c.spatial.size +
                Math.min(this.c.spatial.size - 1, sensor.x + span);
            for (let i = lo; i <= hi; i++)
              if (m.cells[i] !== 2) {
                m.cells[i] = 2;
                m.visibleCells.push(i);
              }
          }
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
        known.set(e.id, this.describe(e, !owner || e.owner === owner, owner));
    const result: SettlementView = {
      observedDeaths: m ? m.observedDeaths.map((d) => ({ ...d })) : [],
      fallenHeroes: this.c.state.entities
        .filter((e) => e.fallen && (!owner || e.owner === owner))
        .map((e) => this.describe(e, true, owner)),
      visuals: this.c.state.visuals
        .filter((v) => !owner || v.viewers.includes(owner))
        .map((v) => structuredClone(v)),
      deaths: this.deathCues
        .filter((cue) => !owner || cue.viewers.includes(owner))
        .map((cue) => cue.entity),
      ...(owner
        ? {
            population: workerPopulation(this.c.live(), owner, this.c.registry),
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
      ...(m
        ? {
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
    // The visible-cell index is a derived acceleration structure. Its insertion
    // order differs after restore and must not participate in lockstep state.
    return simulationHash(
      this.memories.map(({ visibleCells: _index, ...memory }) => memory),
    );
  }
  snapshot() {
    return this.memories.map((m) => ({
      owner: m.owner,
      cells: Array.from(m.cells),
      entities: [...m.entities.values()].map((e) => structuredClone(e)),
      observedDeaths: m.observedDeaths.map((d) => ({ ...d })),
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
      if (row.cells.length !== this.c.spatial.size ** 2)
        throw new Error("Invalid knowledge dimensions");
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
    this.sensorSignatures.clear();
    this.deathCues.length = 0;
    for (const m of this.memories) {
      const row = rows.find((r) => r.owner === m.owner)!;
      m.cells = Uint8Array.from(row.cells);
      m.visibleCells = [];
      for (let i = 0; i < m.cells.length; i++)
        if (m.cells[i] === 2) m.visibleCells.push(i);
      m.entities = new Map(row.entities.map((e) => [e.id, e]));
      m.observedDeaths = row.observedDeaths.map((d) => ({ ...d }));
    }
    this.cache.clear();
  }
}
