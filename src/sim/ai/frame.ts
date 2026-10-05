import {formDefinition} from '../abilities/forms';
import {SimulationProfiler} from '../profiling';
import {PlacementSearch} from './placementSearch';
import {resourceBlocksCell,resourceCollisionCells} from '../../shared/map/resourceClearance';
import {WalkSurfaces} from '../../shared/map/walkSurfaces';
import {unitDimensions} from '../../content/unitScale';
import {MAX_GROUND_STEP_CM,MAX_FOUNDATION_RELIEF_CM} from '../../shared/map/tacticalTerrain';
import {prerequisiteReason} from "../../content/prerequisites";
import { armorMultiplier, resolveDamage } from "../game/damage";
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
  ...(p.surface?{surface:p.surface}:{}),
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
    abilityEvents: [],
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
            ...(e.surface?{surface:e.surface}:{}),
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
  readonly placementSearch=new PlacementSearch();
  readonly layers?: WalkSurfaces;
  constructor(readonly map: MapBriefing) {
    const { size, land, heights } = map;
    this.regions = new Int32Array(size * size);
    if(map.surfaces.length){
      this.layers=new WalkSurfaces(size,Int16Array.from(heights),Uint8Array.from(land),map.surfaces,Math.round(unitDimensions(map.unitScale??1).height*100));
      return;
    }
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
            Math.abs(heights[a]! - heights[b]!) > MAX_GROUND_STEP_CM
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
    if(this.layers){
      const from=this.layers.node(integerPoint(a)),to=this.layers.node(integerPoint(b));
      return from!==undefined&&to!==undefined&&this.layers.connected(from,to);
    }
    return (
      this.inside(a) &&
      this.inside(b) &&
      !!this.regions[this.index(a)] &&
      this.regions[this.index(a)] === this.regions[this.index(b)]
    );
  }
}
type BlockerRecord={x:number;y:number;rotation:number;building:boolean;width:number;depth:number;radius:number|undefined;scale:number;cells:number[]};
/** Per-controller, derived from its authorized observation only. Reference counts
 * preserve overlaps; copy-on-write sets keep previously constructed frames valid. */
export class ObservedBlockers {
  private readonly records=new Map<number,BlockerRecord>();
  private readonly counts=new Map<number,number>();
  private cells=new Set<number>();
  readonly work={checked:0,rebuilt:0,removed:0};
  update(frame:Frame):ReadonlySet<number>{
    const seen=new Set<number>();let changed=false;
    this.work.checked=0;this.work.rebuilt=0;this.work.removed=0;
    const ownCells=()=>{if(!changed){this.cells=new Set(this.cells);changed=true;}};
    const remove=(record:BlockerRecord)=>{
      ownCells();for(const cell of record.cells){const n=this.counts.get(cell)!-1;if(n){this.counts.set(cell,n);}else{this.counts.delete(cell);this.cells.delete(cell);}}
    };
    for(const e of frame.view.entities){
      const d=frame.def(e),building=d.kind==='building';
      if(!building&&!(e.resource&&e.resource.amount>0))continue;
      seen.add(e.id);this.work.checked++;
      const x=Math.round(e.x),y=Math.round(e.y),width=d.footprint?.width??1,depth=d.footprint?.depth??1,radius=d.collisionRadius,scale=e.appearance?.scale??1;
      const old=this.records.get(e.id);
      if(old&&old.x===x&&old.y===y&&old.rotation===e.rotation&&old.building===building&&old.width===width&&old.depth===depth&&old.radius===radius&&old.scale===scale)continue;
      if(old)remove(old);else ownCells();
      const p={x,y};
      const cells=(building?footprint(d,p,e.rotation):resourceCollisionCells(p,d.footprint,radius,scale,e.rotation)).filter(q=>frame.geo.inside(q)).map(q=>frame.geo.index(q));
      this.records.set(e.id,{x:p.x,y:p.y,rotation:e.rotation,building,width,depth,radius,scale,cells});this.work.rebuilt++;
      for(const cell of cells){this.counts.set(cell,(this.counts.get(cell)??0)+1);this.cells.add(cell);}
    }
    for(const [id,record] of this.records)if(!seen.has(id)){remove(record);this.records.delete(id);this.work.removed++;}
    return this.cells;
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
  private _blocked: ReadonlySet<number> | null = null;
  get blocked() {
    if (!this._blocked) {
      this._blocked = this.profile.measure('Known blocker footprints',()=>this.blockers.update(this));
      this.profile.count('Blocker records checked',this.blockers.work.checked);
      this.profile.count('Blocker footprints rebuilt',this.blockers.work.rebuilt);
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
    private readonly blockers=new ObservedBlockers(),
    readonly profile=new SimulationProfiler(),
  ) {
    this.placeable=this.profile.wrap('Building site checks',this.placeable.bind(this));
    this.doorReachable=this.profile.wrap('Building approach search',this.doorReachable.bind(this));
    this.nearestSafe=this.profile.wrap('Safe position search',this.nearestSafe.bind(this));
    this.nearestResource=this.profile.wrap('Harvest target selection',this.nearestResource.bind(this));
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
    const homeStore = this.stores.find(s => this.def(s).supplyProvided) ?? this.stores[0];
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
    // Use the same spendable balance as commands, including hall training escrow.
    for (const goods of view.goods ?? []) this.bank[goods.item] = goods.available;
  }
  def(e: EntityView) {
    return formDefinition(this.registry.get(e.definition),e,this.registry);
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
    }, raw, type);
  }
  /** Only one target is used. Preserve the former distance sort and its tie
   * policy without sorting/allocating the entire known-resource candidate list. */
  nearestResource(origin:Point,accept:(resource:EntityView)=>boolean,tieById=true):EntityView|undefined {
    let best:EntityView|undefined,bestDistance=Infinity,eligible=0;
    for(const resource of this.resources){
      if(!accept(resource))continue;
      eligible++;
      const d=distance(resource,origin);
      if(!best||d<bestDistance||(tieById&&d===bestDistance&&resource.id<best.id)){best=resource;bestDistance=d;}
    }
    this.profile.count('Known resources considered',this.resources.length);
    this.profile.count('Resource distance evaluations',eligible);
    return best;
  }
  nearestSafe(p: Point) {
    const base = integerPoint(p);
    for (let r = 0; r <= 8; r++)
      for (let y = base.y - r; y <= base.y + r; y++)
        for (let x = base.x - r; x <= base.x + r; x++) {
          if (r && Math.abs(x - base.x) !== r && Math.abs(y - base.y) !== r)
            continue;
          const q = { x, y, ...(base.surface?{surface:base.surface}:{}) };
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
    this.profile.count('Candidates checked');
    if (!this.available(d) || p.surface) return false;
    if (d.placementNear && !this.resources.some(e => !e.remembered && e.definition === d.placementNear!.source && distance(e,p) <= d.placementNear!.radius)) return false;
    const cells = footprint(d, p, r),
      heights = this.geo.map.heights;
    if (
      cells.some(
        (q) =>
          !this.geo.inside(q) ||
          !this.geo.map.land[this.geo.index(q)] ||
          (this.geo.layers?.at(q.x,q.y).length ?? 1)>1 ||
          this.blocked.has(this.geo.index(q)) ||
          !this.view.fog?.cells[this.geo.index(q)],
      )
    )
      return false;
    const hs = cells.map((q) => heights[this.geo.index(q)]!);
    if (Math.max(...hs) - Math.min(...hs) > MAX_FOUNDATION_RELIEF_CM) return false;
    if (
      this.own.some(
        (e) =>
          e.unit && !e.unit.contained && cells.some((q) => distance(q, e) < 1),
      )
    )
      return false;
    for (const res of this.resources) {
      const definition=this.def(res),clearance=definition.constructionClearance;
      if(clearance!==undefined&&cells.some(q=>resourceBlocksCell(q,res,definition.footprint,clearance,res.rotation)))return false;
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
    return this.doorReachable(cells,approach,door,!!d.placementNear);
  }
  private doorReachable(cells:Point[],approach:Point,door:Point,outpost:boolean){
    // Bounded flood verifies a usable doorway without reading hidden blockers.
    return this.geo.placementSearch.reachable(this.geo.map,this.blocked,new Set(cells.map(q=>this.geo.index(q))),approach,door,outpost?24:44,this.profile);
  }
}
