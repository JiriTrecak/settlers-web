import {prerequisiteReason} from "../../content/prerequisites";
import { armorMultiplier, guardReduction, resolveDamage } from "../game/damage";
import type { ContentRegistry } from "../../content/registry";
import { type Owner, type Definition } from "../../content/schema";
import type { SettlementView, EntityView } from "../game/observation";
import type { Point } from "../game/state";
import type { MapBriefing } from "./briefing";

export const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const integerPoint = (p: Point): Point => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
});
export function entrance(d: Definition, p: Point, r = 0): Point {
  const o = d.entrance ?? { x: 0, y: 0 },
    i = ((Math.round(r / 90) % 4) + 4) % 4;
  return {
    x: p.x + [o.x, o.y, -o.x, -o.y][i]!,
    y: p.y + [o.y, -o.x, -o.y, o.x][i]!,
  };
}
export function footprint(d: Definition, p: Point, r = 0): Point[] {
  const f = d.footprint ?? { width: 1, depth: 1 },
    swap = Math.round(r / 90) % 2 !== 0,
    w = swap ? f.depth : f.width,
    h = swap ? f.width : f.depth,
    out: Point[] = [];
  for (let y = p.y - Math.floor(h / 2); y <= p.y + Math.floor(h / 2); y++)
    for (let x = p.x - Math.floor(w / 2); x <= p.x + Math.floor(w / 2); x++)
      out.push({ x, y });
  return out;
}
/** Explicit AI input boundary. Enemy private data and presentation-only death cues are excluded. */
export function playerObservation(
  view: SettlementView,
  owner: Owner,
): SettlementView {
  return {
    ...view,
    events: [],
    visuals: [],
    deaths: [],
    entities: view.entities.map((e) =>
      e.owner === owner
        ? e
        : {
            id: e.id,
            definition: e.definition,
            owner: e.owner,
            x: e.x,
            y: e.y,
            rotation: e.rotation,
            hp: e.hp,
            stats: e.stats,
            hostile: e.hostile,
            remembered: e.remembered,
            construction: e.construction,
            resource: e.resource,
            item: e.item,
            ...(e.unit
              ? {
                  unit: {
                    moving: e.unit.moving,
                    contained: e.unit.contained,
                    cargo: null,
                    target: null,
                    cooldown: 0,
                  },
                }
              : {}),
          },
    ),
  };
}
/** Static, authorized geography. Components use the same slopes/corner rules as movement. */
export class Geography {
  readonly regions: Int32Array;
  constructor(readonly map: MapBriefing) {
    const { size, land, heights } = map;
    this.regions = new Int32Array(size * size);
    let region = 0;
    const queue = new Int32Array(size * size);
    for (let start = 0; start < land.length; start++) {
      if (!land[start] || this.regions[start]) continue;
      let head = 0,
        tail = 1;
      queue[0] = start;
      this.regions[start] = ++region;
      while (head < tail) {
        const a = queue[head++]!,
          x = a % size,
          y = Math.floor(a / size);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx!,
            ny = y + dy!;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const b = ny * size + nx;
          if (
            !land[b] ||
            this.regions[b] ||
            Math.abs(heights[a]! - heights[b]!) > 90
          )
            continue;
          this.regions[b] = region;
          queue[tail++] = b;
        }
      }
    }
  }
  index(p: Point) {
    return Math.round(p.y) * this.map.size + Math.round(p.x);
  }
  inside(p: Point) {
    return p.x >= 0 && p.y >= 0 && p.x < this.map.size && p.y < this.map.size;
  }
  connected(a: Point, b: Point) {
    return (
      this.inside(a) &&
      this.inside(b) &&
      !!this.regions[this.index(a)] &&
      this.regions[this.index(a)] === this.regions[this.index(b)]
    );
  }
}
export class Frame {
  readonly own: EntityView[];
  readonly workers: EntityView[];
  readonly army: EntityView[];
  readonly buildings: EntityView[];
  readonly hostiles: EntityView[];
  readonly byId: Map<number, EntityView>;
  readonly stores: EntityView[];
  readonly resources: EntityView[];
  readonly bank: Record<string, number> = {};
  private _blocked: Set<number> | null = null;
  get blocked() {
    if (!this._blocked) {
      this._blocked = new Set<number>();
      for (const e of this.view.entities)
        if (
          this.def(e).kind === "building" ||
          (e.resource && e.resource.amount > 0)
        )
          for (const p of footprint(this.def(e), integerPoint(e), e.rotation))
            if (this.geo.inside(p)) this._blocked.add(this.geo.index(p));
    }
    return this._blocked;
  }
  readonly home: Point;
  constructor(
    readonly view: SettlementView,
    readonly owner: Owner,
    readonly registry: ContentRegistry,
    readonly geo: Geography,
    readonly tick: number,
  ) {
    this.byId = new Map(view.entities.map((e) => [e.id, e]));
    this.own = view.entities.filter((e) => e.owner === owner && e.hp !== 0);
    this.workers = this.own.filter(
      (e) =>
        e.control &&
        this.def(e).behaviors.playerControl &&
        this.def(e).behaviors.work &&
        !e.unit?.contained,
    );
    this.army = this.own.filter(
      (e) =>
        e.control &&
        this.def(e).behaviors.playerControl &&
        this.def(e).behaviors.combat &&
        !this.def(e).behaviors.work &&
        !e.unit?.contained,
    );
    this.buildings = this.own.filter((e) => this.def(e).kind === "building");
    this.stores = this.buildings.filter(
      (e) => !e.construction && this.def(e).behaviors.storage?.dropoff,
    );
    const homeStore = this.stores.find(s => this.def(s).behaviors.production?.population) ?? this.stores[0];
    this.home = homeStore
      ? entrance(
          this.def(homeStore),
          homeStore,
          homeStore.rotation,
        )
      : integerPoint(this.own[0] ?? geo.map.starts[0]!);
    this.hostiles = view.entities.filter(
      (e) => !e.remembered && e.hostile && e.hp !== 0,
    );
    this.resources = view.entities.filter(
      (e) => e.resource && e.resource.amount > 0 && !e.resource.growingUntil,
    );
    for (const s of this.stores)
      for (const [id, n] of Object.entries(s.inventory ?? {}))
        this.bank[id] = (this.bank[id] ?? 0) + n;
  }
  def(e: EntityView) {
    return this.registry.get(e.definition);
  }
  free(e: EntityView) {
    return (
      !!e.control &&
      !e.control.order &&
      !e.control.orderQueue.length &&
      !e.control.job &&
      e.control.employment === null &&
      !e.control.pendingMove &&
      !e.control.releasing &&
      !e.unit?.cargo &&
      !e.unit?.casting &&
      !e.control.stunned
    );
  }
  visible(p: Point) {
    return this.geo.inside(p) && this.view.fog?.cells[this.geo.index(p)] === 2;
  }
  available(d: Pick<Definition,"requires">) { return !prerequisiteReason(d,this.owner,this.own,this.registry); }
  accepts(item: string) { return this.stores.some(s => this.def(s).behaviors.storage!.accepts.includes(item)); }
  canAfford(d: Definition, reserve: Record<string, number> = {}) {
    return this.available(d) && (d.creation?.items ?? []).every(
      (c) => (this.bank[c.item] ?? 0) >= (reserve[c.item] ?? 0) + c.amount,
    );
  }
  power(e: EntityView) {
    return this.nominalPower(
      this.def(e),
      e.hp ?? 0,
      e.stats?.damage,
      e.stats?.armor,
      e.stats?.cooldownTicks,
    );
  }
  nominalPower(
    d: Definition,
    hp = d.body?.maxHp ?? 0,
    damage = d.behaviors.combat?.damage ?? 0,
    armor = d.body?.armor ?? 0,
    cooldownTicks = d.behaviors.combat?.cooldownTicks ?? 1,
  ) {
    const c = d.behaviors.combat;
    if (!c) return 0;
    return (
      Math.sqrt(
        (Math.max(0, hp) / armorMultiplier(this.registry.rules, armor) * damage * 40) / cooldownTicks,
      ) * (c.range > 3 ? 1.2 : 1)
    );
  }
  damage(target: EntityView, raw: number, type: string) {
    const body = this.def(target).body!;
    return resolveDamage(this.registry.rules, {
      armorType: body.armorType, armor: target.stats?.armor ?? body.armor,
      reductionPermille: guardReduction(this.registry.rules, target.effects),
    }, raw, type);
  }
  nearestSafe(p: Point) {
    const base = integerPoint(p);
    for (let r = 0; r <= 8; r++)
      for (let y = base.y - r; y <= base.y + r; y++)
        for (let x = base.x - r; x <= base.x + r; x++) {
          if (r && Math.abs(x - base.x) !== r && Math.abs(y - base.y) !== r)
            continue;
          const q = { x, y };
          if (
            this.geo.inside(q) &&
            this.geo.connected(this.home, q) &&
            !this.blocked.has(this.geo.index(q))
          )
            return q;
        }
    return this.home;
  }
  /** Local placement view: no authoritative canBuild query, including resource buffers and entrances. */
  placeable(d: Definition, p: Point, r: number) {
    if (!this.available(d)) return false;
    if (d.placementNear && !this.resources.some(e => !e.remembered && e.definition === d.placementNear!.source && distance(e,p) <= d.placementNear!.radius)) return false;
    const cells = footprint(d, p, r),
      heights = this.geo.map.heights;
    if (
      cells.some(
        (q) =>
          !this.geo.inside(q) ||
          !this.geo.map.land[this.geo.index(q)] ||
          this.blocked.has(this.geo.index(q)) ||
          !this.view.fog?.cells[this.geo.index(q)],
      )
    )
      return false;
    const hs = cells.map((q) => heights[this.geo.index(q)]!);
    if (Math.max(...hs) - Math.min(...hs) > 100) return false;
    if (
      this.own.some(
        (e) =>
          e.unit && !e.unit.contained && cells.some((q) => distance(q, e) < 1),
      )
    )
      return false;
    for (const res of this.resources) {
      const clearance = this.def(res).constructionClearance ?? 0;
      if (
        clearance &&
        cells.some(
          (q) =>
            distance(q, res) <=
            clearance +
              Math.max(
                this.def(res).footprint?.width ?? 1,
                this.def(res).footprint?.depth ?? 1,
              ) /
                2,
        )
      )
        return false;
    }
    // Leave a two-cell service lane around every existing building, especially its door.
    for (const b of this.buildings) {
      const bf = this.def(b),
        door = entrance(bf, integerPoint(b), b.rotation);
      if (cells.some((q) => distance(q, door) < 4)) return false;
      const occupied = footprint(bf, integerPoint(b), b.rotation);
      if (
        cells.some((q) =>
          occupied.some(
            (a) => Math.max(Math.abs(q.x - a.x), Math.abs(q.y - a.y)) <= 2,
          ),
        )
      )
        return false;
    }
    const door = entrance(d, p, r);
    if (
      !this.geo.connected(this.home, door) ||
      this.blocked.has(this.geo.index(door))
    )
      return false;
    // Outposts check a local approach after the terrain-connectivity check above.
    // A home-centered flood would reject every remote resource site.
    const approach = d.placementNear ? this.nearestSafe({x:p.x,y:p.y+12}) : this.home;
    // Bounded flood verifies a usable doorway without reading hidden blockers.
    const proposed = new Set(cells.map((q) => this.geo.index(q))),
      seen = new Set<number>(),
      queue = [integerPoint(approach)];
    for (let i = 0; i < queue.length && i < 4096; i++) {
      const a = queue[i]!;
      if (distance(a, door) < 1) return true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const q = { x: a.x + dx!, y: a.y + dy! },
          idx = this.geo.index(q);
        if (
          !this.geo.inside(q) ||
          distance(q, approach) > (d.placementNear ? 24 : 44) ||
          seen.has(idx) ||
          proposed.has(idx) ||
          this.blocked.has(idx) ||
          !this.geo.map.land[idx] ||
          Math.abs(heights[idx]! - heights[this.geo.index(a)]!) > 90
        )
          continue;
        seen.add(idx);
        queue.push(q);
      }
    }
    return false;
  }
}
