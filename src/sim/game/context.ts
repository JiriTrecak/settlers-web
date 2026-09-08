import type { ContentRegistry } from "../../content/registry";
import type { Owner, Placement } from "../../content/schema";
import type { UtcMap } from "../../shared/map/utcmap";
import { Spatial, cell } from "./spatial";
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
    if (d.kind === "unit") e.unit = this.freshUnit();
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
    if (d.kind === "resource")
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
      credit: 0,
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
    for (const e of this.live()) {
      const u = e.unit;
      if (!u) continue;
      if (u.release) {
        const p = this.spatial.nearest(u.release, 12, e.id);
        if (p) {
          e.x = p.x;
          e.y = p.y;
          u.release = null;
        }
        continue;
      }
      if (!this.ready(e) || u.contained) continue;
      const speed = this.def(e).behaviors.movement?.speed;
      if (!speed || !u.route.length) continue;
      u.credit += speed;
      if (u.credit < 40) continue;
      u.credit -= 40;
      const next = u.route[0]!,
        p = { x: next % 256, y: Math.floor(next / 256) };
      if (
        !this.spatial.walkable(next) ||
        Math.abs(this.spatial.heights[cell(e)] - this.spatial.heights[next]) >
          90
      ) {
        u.route = [];
        u.retryAt = this.state.tick + 20;
        continue;
      }
      if (!this.spatial.free(p, e.id)) {
        const blocker = this.state.entities.find(
          (b) =>
            b.unit &&
            !b.unit.contained &&
            !b.unit.release &&
            b.x === p.x &&
            b.y === p.y &&
            alive(b),
        );
        // In a head-on meeting the higher ID yields one cardinal step. Both positions remain exclusive.
        if (
          blocker &&
          blocker.owner === e.owner &&
          blocker.id < e.id &&
          blocker.unit!.route[0] === cell(e)
        ) {
          const aside = [
            { x: e.x, y: e.y - 1 },
            { x: e.x - 1, y: e.y },
            { x: e.x + 1, y: e.y },
            { x: e.x, y: e.y + 1 },
          ].find(
            (q) =>
              this.spatial.free(q, e.id) &&
              Math.abs(
                this.spatial.heights[cell(e)] - this.spatial.heights[cell(q)],
              ) <= 90,
          );
          if (aside) {
            u.route.unshift(cell(e));
            e.x = aside.x;
            e.y = aside.y;
            continue;
          }
        }
        if (this.state.tick >= u.retryAt && u.goal !== null) {
          const goal = this.spatial.nearest(
            { x: u.goal % 256, y: Math.floor(u.goal / 256) },
            3,
            e.id,
          );
          if (goal) this.spatial.route(e, goal);
          u.retryAt = this.state.tick + 20;
        }
        continue;
      }
      u.route.shift();
      e.x = p.x;
      e.y = p.y;
    }
  }
}
