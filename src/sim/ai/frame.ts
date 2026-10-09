import {raceAI} from '../../content/races';
import {clearLayeredSweep} from '../game/layeredSweep';
import {fixed} from '../game/motion';
import {adjacentSweep} from '../game/adjacentSweep';
import {ObservedNavigation,type ObservedMover} from './observedNavigation';
import {placementGeometryError} from '../../shared/spatial/placement';
import {locomotion} from '../game/locomotion';
import {footprintCells, footprintBounds, footprintCellBounds, navigationBodyOverlapsBounds} from '../../shared/spatial/footprint';
import {formDefinition} from '../abilities/forms';
import {SimulationProfiler} from '../profiling';
import {PlacementSearch} from './placementSearch';
import {resourceBlocksCell,resourceCollisionCells} from '../../shared/map/resourceClearance';
import {WalkSurfaces} from '../../shared/map/walkSurfaces';
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
  return footprintCells(p, d.footprint, r);
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
      this.layers=new WalkSurfaces(size,Int16Array.from(heights),Uint8Array.from(land),map.surfaces,Math.round((map.minimumUnitHeight??0)*100));
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
  private navigation:{geo:Geography;routes:ObservedNavigation}|undefined;
  routes(frame:Frame){
    const blocked=frame.blocked;
    if(this.navigation?.geo!==frame.geo)this.navigation={geo:frame.geo,routes:new ObservedNavigation(frame.geo.map,frame.geo.layers,frame.profile)};
    this.navigation.routes.update(blocked);return this.navigation.routes;
  }
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
      const x=e.x,y=e.y,width=d.footprint?.width??1,depth=d.footprint?.depth??1,radius=d.collisionRadius,scale=e.appearance?.scale??1;
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
  get aiRules(){return raceAI(this.registry.rules,this.race);}
  readonly home: Point;
  constructor(
    readonly view: SettlementView,
    readonly owner: Owner,
    readonly registry: ContentRegistry,
    readonly geo: Geography,
    readonly tick: number,
    private readonly blockers=new ObservedBlockers(),
    readonly profile=new SimulationProfiler(),
    readonly race?:string,
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
    // A surviving non-dropoff building still supplies a reachable entrance.
    // Using its center after Hall loss strands placement probes inside a blocker.
    const homeStore = this.stores.find(s => this.def(s).supplyProvided) ?? this.stores[0] ?? this.buildings[0];
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
  private rosterCache:readonly Definition[]|undefined;
  private unitRoster(){
    if(this.rosterCache)return this.rosterCache;
    const ids=new Set(this.own.map(e=>e.definition)),queue=[...ids];
    for(let i=0;i<queue.length;i++){
      const d=this.registry.get(queue[i]!);
      for(const id of [...d.behaviors.work?.builds??[],...d.behaviors.production?.outputs??[],...d.upgrade?[d.upgrade.target]:[]])
        if(!ids.has(id)){ids.add(id);queue.push(id);}
    }
    return this.rosterCache=queue.map(id=>this.registry.get(id)).filter(d=>d.kind==='unit'&&d.dimensions);
  }
  private baseBody(){
    const bodies=this.unitRoster().filter(d=>locomotion(d)==='ground').map(d=>d.dimensions!);
    return {radius:Math.max(this.registry.navigationBody.radius,...bodies.map(d=>d.radius)),height:Math.max(this.registry.navigationBody.height,...bodies.map(d=>d.height))};
  }
  prepareNavigation(){
    this.blockers.routes(this).prepare(this.unitRoster().map(d=>({x:0,y:0,...d.dimensions!,air:locomotion(d)==='air'})));
  }
  nearestSafe(p: Point,actors:readonly EntityView[]=[]) {
    const movers:ObservedMover[]=actors.map(actor=>{const d=this.def(actor),body=d.dimensions??this.registry.navigationBody;
      return {...actor,radius:body.radius,height:body.height,air:locomotion(d)==='air'};});
    const routes=movers.length?this.blockers.routes(this):undefined;
    const base = integerPoint(p);
    for (let r = 0; r <= (routes?24:8); r++)
      for (let y = base.y - r; y <= base.y + r; y++)
        for (let x = base.x - r; x <= base.x + r; x++) {
          if (r && Math.abs(x - base.x) !== r && Math.abs(y - base.y) !== r)
            continue;
          const q = { x, y, ...(base.surface?{surface:base.surface}:{}) };
          if (
            this.geo.inside(q) &&
            (!routes?this.geo.connected(this.home,q):movers.every(m=>m.air||this.geo.connected(m,q))) &&
            (!routes ? !this.blocked.has(this.geo.index(q)) : movers.every(m=>routes.fits(q,m))&&movers.every(m=>routes.reachable(m,q)))
          )
            return q;
        }
    // No verified destination is better than ordering a retreat into a pocket.
    return actors.length?integerPoint(actors[0]!):this.home;
  }
  /** Local placement view: no authoritative canBuild query, including resource buffers and entrances. */
  placeable(d: Definition, p: Point, r: number) {
    this.profile.count('Candidates checked');
    if (!this.available(d) || p.surface || placementGeometryError(d,p,r)) return false;
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
    const bounds = footprintBounds(p, d.footprint, r);
    if (this.view.entities.some(e => e.unit && !e.unit.contained && !e.remembered &&
      locomotion(this.def(e)) === 'ground' &&
      navigationBodyOverlapsBounds(e, this.def(e).dimensions!.radius, bounds))) return false;
    for (const res of this.resources) {
      const definition=this.def(res),clearance=definition.constructionClearance;
      if(clearance!==undefined&&cells.some(q=>resourceBlocksCell(q,res,definition.footprint,clearance,res.rotation)))return false;
    }
    // Preserve a lane for the largest trainable ground body, including units
    // unlocked by future upgrades. Compare rectangles rather than every pair
    // of occupied cells for every candidate.
    const body=this.baseBody(),lane=Math.ceil(body.radius*2),candidate=footprintCellBounds(p,d.footprint,r);
    for(const b of this.buildings){
      const bf=this.def(b),occupied=footprintCellBounds(b,bf.footprint,b.rotation);
      if(candidate.minX<=occupied.maxX+lane&&candidate.maxX>=occupied.minX-lane&&
         candidate.minY<=occupied.maxY+lane&&candidate.maxY>=occupied.minY-lane)return false;
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
    const map=this.geo.map,body=this.baseBody(),proposed=new Set(cells.map(q=>this.geo.index(q)));
    const baseStep=(a:number,b:number)=>!!map.land[b]&&!this.blocked.has(b)&&Math.abs(map.heights[a]!-map.heights[b]!)<=MAX_GROUND_STEP_CM;
    const sweep=(extra:ReadonlySet<number>)=>this.geo.layers?
      (a:number,b:number)=>clearLayeredSweep(this.geo.layers!,fixed({x:a%map.size,y:Math.floor(a/map.size)}),fixed({x:b%map.size,y:Math.floor(b/map.size)}),body.height,Math.round(body.radius*1000),id=>this.geo.layers!.walkable(id)&&!this.blocked.has(id)&&!extra.has(id)):
      adjacentSweep(map.size,Math.round(body.radius*1000),(a,b)=>baseStep(a,b)&&!extra.has(b));
    const current=sweep(new Set()),after=sweep(proposed);
    const nearby=(p:Point,radius:number)=>{
      const points:Point[]=[];const center=integerPoint(p);
      for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
        const q={x:center.x+x,y:center.y+y};if(this.geo.inside(q))points.push(q);
      }
      return points.sort((a,b)=>distance(a,p)-distance(b,p)||a.y-b.y||a.x-b.x);
    };
    // The rendered entrance sits just outside the footprint. A body must stand
    // farther out; neither the old doorway cell nor the Hall center is a legal
    // origin for this test.
    const origin=nearby(approach,8).find(p=>current(this.geo.index(p),this.geo.index(p)));
    if(!origin||!after(this.geo.index(origin),this.geo.index(origin)))return false;
    const goals=new Set(nearby(door,Math.ceil(body.radius)+2).filter(p=>after(this.geo.index(p),this.geo.index(p))).map(p=>this.geo.index(p)));
    if(!goals.size)return false;
    return this.geo.placementSearch.reachable(map,this.blocked,proposed,origin,door,outpost?32:60,this.profile,{step:after,goals});

  }
}
