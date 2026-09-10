import { isStunned } from "./effects";
import {
  fixed,
  lengthCeil,
  motionCell,
  POSITION_SCALE,
  type FixedPoint,
} from "./motion";
import type { ContentRegistry } from "../../content/registry";
import type { Owner, Placement } from "../../content/schema";
import type { UtcMap } from "../../shared/map/utcmap";
import { Spatial } from "./spatial";
import { entityStats } from "./stats";
import {
  add,
  alive,
  type Entity,
  type Fact,
  type GameState,
  type Point,
} from "./state";

/** Shared native services; never exposed to HUD, player commands, or content JSON. */
export class GameContext {
  readonly spatial: Spatial;
  private index = new Map<number, Entity>();
  constructor(
    readonly state: GameState,
    readonly registry: ContentRegistry,
    map: UtcMap,
  ) {
    this.reindex();
    this.spatial = new Spatial(map, registry, () => state.entities);
  }
  reindex() {
    this.index = new Map(this.state.entities.map((e) => [e.id, e]));
  }
  get(id: number | null | undefined) {
    return id ? this.index.get(id) : undefined;
  }
  def(e: Entity) {
    return this.registry.get(e.definition);
  }
  stats(e: Entity) {
    return entityStats(this.def(e), e, this.registry);
  }
  live() {
    return this.state.entities.filter(alive);
  }
  ready(e: Entity) {
    return alive(e) && e.readyTick <= this.state.tick;
  }
  create(p: Placement, complete = true): Entity {
    const d = this.registry.get(p.definition),
      initial = p.initialState,
      e: Entity = {
        id: this.state.nextId++,
        readyTick: this.state.tick + 1,
        placement: p.id || null,
        definition: d.id,
        owner: p.owner,
        x: p.position.x,
        y: p.position.y,
        rotation: p.rotation,
        hp: d.body ? (initial?.health ?? d.body.maxHp) : null,
        inventory: { ...initial?.inventory },
        ...(p.appearance ? { appearance: { ...p.appearance } } : {}),
      };
    if (d.kind === "unit") { e.unit = this.freshUnit(); e.regeneration = { health: 0, mana: 0 }; }
    if (d.behaviors.spellcasting)
      e.spellcasting = {
        mana: this.stats(e).maxMana,
        learned: {},
        cooldowns: {},
        pending: null,
      };
    if (d.behaviors.progression) e.progression = { experience: 0 };
    if (d.behaviors.inventory)
      e.equipment = Array(d.behaviors.inventory.slots).fill(null);
    if (d.kind === "building" && !complete) {
      const hp = Math.max(
        1,
        Math.floor(
          (d.body!.maxHp * this.registry.rules.constructionHpPermille) / 1000,
        ),
      );
      e.hp = hp;
      e.construction = { progress: 0, supportedHp: hp };
    }
    if (d.behaviors.revival) e.revival = { queue: [] };
    if (d.behaviors.production)
      e.production = {
        paused: false,
        queue: [],
        active: null,
        staff: null,
        produced: 0,
        rally: null,
        status: "Idle",
      };
    if (d.yield)
      e.resource = { amount: initial?.amount ?? d.yield!, growingUntil: null };
    if (d.kind === "item") e.item = { quantity: initial?.quantity ?? 1 };
    this.state.entities.push(e);
    this.index.set(e.id, e);
    return e;
  }
  freshUnit(): NonNullable<Entity["unit"]> {
    return {
      order: null,
      route: [],
      goal: null,
      position: null,
      segment: null,
      employment: null,
      job: null,
      cargo: null,
      pendingMove: null,
      contained: null,
      release: null,
      target: null,
      cooldown: 0,
      camp: null,
      returning: false,
      retryAt: 0,
      idle: null,
    };
  }
  remove(e: Entity) {
    this.state.entities.splice(this.state.entities.indexOf(e), 1);
    this.index.delete(e.id);
  }
  event(
    owner: Owner,
    message: string,
    type: Fact["type"] = "command",
    item?: string,
    amount?: number,
  ) {
    this.state.facts.push({
      id: this.state.nextFact++,
      tick: this.state.tick,
      owner,
      type,
      message,
      ...(item && amount ? { item, amount } : {}),
    });
    if (this.state.facts.length > 128) this.state.facts.shift();
    if (
      item &&
      amount &&
      (type === "lost" || type === "consumed" || type === "produced")
    )
      add(this.state.accounting[type], item, amount);
  }
  release(e: Entity, at: Point) {
    if (!e.unit) return;
    e.unit.idle = null;
    e.unit.position = null;
    e.unit.segment = null;
    e.unit.contained = null;
    e.unit.job = null;
    e.unit.employment = null;
    e.unit.order = null;
    e.unit.route = [];
    e.unit.goal = null;
    const pos = this.spatial.nearest(at, 12, e.id);
    if (pos) {
      e.x = pos.x;
      e.y = pos.y;
      e.unit.release = null;
    } else e.unit.release = { ...at };
  }
  activeUnits() {
    return this.live().filter(
      (e) => this.ready(e) && e.unit && !e.unit.contained && !e.unit.release,
    );
  }
  move() {
    const units = this.activeUnits();
    const occupied = new Set(units.map((e) => this.spatial.cell(e)));
    for (const e of this.live()) {
      const u = e.unit;
      if (!u) continue;
      if (u.release) {
        const p = this.spatial.nearest(u.release, 12, e.id);
        if (p) {
          e.x = p.x;
          e.y = p.y;
          u.position = null;
          u.segment = null;
          u.release = null;
          occupied.add(this.spatial.cell(e));
        }
        continue;
      }
      if (
        !this.ready(e) ||
        u.contained ||
        e.spellcasting?.pending ||
        isStunned(e, this.registry)
      )
        continue;
      const movement = this.def(e).behaviors.movement;
      const speed = u.idle?.walking
        ? (movement?.walkSpeed ?? movement?.speed)
        : movement?.speed;
      if (!speed || !u.route.length) continue;
      occupied.delete(this.spatial.cell(e));
      try {
        let budget = (speed * POSITION_SCALE) / 40;
        u.position ??= fixed(e);
        while (budget > 0 && u.route.length) {
          const current: FixedPoint = u.position!;
          const next = u.route[0],
            goal = fixed({
              x: next % this.spatial.size,
              y: Math.floor(next / this.spatial.size),
            });
          if (!u.segment || u.segment.to !== next) {
            const length = lengthCeil(goal.x - current.x, goal.y - current.y);
            if (!length) {
              u.route.shift();
              u.segment = null;
              continue;
            }
            u.segment = { from: { ...current }, to: next, length, progress: 0 };
          }
          const segment = u.segment;
          const distance = segment.length - segment.progress;
          const travel = Math.min(budget, distance),
            progress = segment.progress + travel;
          const proposed: FixedPoint =
            progress === segment.length
              ? goal
              : {
                  x:
                    segment.from.x +
                    Math.round(
                      ((goal.x - segment.from.x) * progress) / segment.length,
                    ),
                  y:
                    segment.from.y +
                    Math.round(
                      ((goal.y - segment.from.y) * progress) / segment.length,
                    ),
                };
          if (!this.spatial.clearSegment(current, proposed)) {
            u.route = [];
            u.segment = null;
            u.retryAt = this.state.tick + 20;
            break;
          }
          if (
            !this.spatial.clearSegment(current, proposed, occupied) ||
            !this.spatial.unitSegmentClear(current, proposed, e.id)
          ) {
            if (this.state.tick >= u.retryAt && u.goal !== null) {
              const desired = {
                x: u.goal % this.spatial.size,
                y: Math.floor(u.goal / this.spatial.size),
              };
              const target = this.spatial.nearest(desired, 3, e.id);
              if (target) this.spatial.route(e, target);
              {
                // Stable yielding lets opposing friendly traffic pass without teleports.
                const near = units.find(
                  (b) =>
                    b.id < e.id &&
                    b.owner === e.owner &&
                    b.unit!.route.length &&
                    Math.abs(b.x - e.x) <= 1 &&
                    Math.abs(b.y - e.y) <= 1,
                );
                if (near) {
                  const aside = [
                    { x: e.x, y: e.y - 1 },
                    { x: e.x - 1, y: e.y },
                    { x: e.x + 1, y: e.y },
                    { x: e.x, y: e.y + 1 },
                  ].find(
                    (p) =>
                      this.spatial.free(p, e.id) &&
                      this.spatial.clearSegment(
                        u.position!,
                        fixed(p),
                        occupied,
                      ) &&
                      this.spatial.unitSegmentClear(
                        u.position!,
                        fixed(p),
                        e.id,
                      ),
                  );
                  if (aside) u.route.unshift(this.spatial.cell(aside));
                }
              }
              u.retryAt = this.state.tick + 20;
            }
            break;
          }
          segment.progress = progress;
          u.position = proposed;
          const index = motionCell(proposed, this.spatial.size);
          e.x = index % this.spatial.size;
          e.y = Math.floor(index / this.spatial.size);
          budget -= travel;
          if (travel === distance) {
            u.route.shift();
            u.segment = null;
          }
        }
      } finally {
        occupied.add(this.spatial.cell(e));
      }
    }
  }
}
