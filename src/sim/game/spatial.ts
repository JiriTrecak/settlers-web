import {SectorNavigation} from './sectorNavigation';
import {WalkSurfaces} from '../../shared/map/walkSurfaces';
import {TacticalTerrain,MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';
import {UnitIndex} from "./unitIndex";
import {bridgeSurfaces,applyBridgeSurfaces} from '../../shared/map/bridgeSurface';
import {applySceneryBlockers} from '../../shared/map/sceneryCollision';
import {
  clearSweep,
  clearRay,
  fixed,
  precise,
  type FixedPoint,
} from "./motion";
import type { ContentRegistry } from "../../content/registry";
import { sampleHeight, decodeHeight, HEIGHT_ORIGIN, WADING_DEPTH_CM } from "../../shared/map/height";
import type { UtcMap } from "../../shared/map/utcmap";
import { Navigation } from "./navigation";
import { alive, type Entity, type Point } from "./state";

export const cell = (p: Point, size = 256) => p.y * size + p.x;
export const point = (i: number, size = 256): Point => ({
  x: i % size,
  y: Math.floor(i / size),
});
export const distance2 = (a: Point, b: Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export class Spatial {
  private unitIndex:UnitIndex|null=null;
  /** Scoped to one synchronous planning or movement pass; other queries use live entities. */
  beginUnitMovement(){this.unitIndex=new UnitIndex(this.units(),this.size,this.ignoresUnits);}
  updateUnitMovement(e:Entity){this.unitIndex?.update(e);}
  endUnitMovement(){this.unitIndex=null;}

  readonly layers: WalkSurfaces | undefined;
  readonly size: number;
  readonly heights: Int16Array;
  readonly terrain: Uint8Array;
  readonly sea: number;
  readonly decks: Uint8Array;
  readonly occupied: Int32Array;
  readonly resources: Int32Array;
  readonly navigation: Navigation;
  readonly sectors: SectorNavigation;
  readonly routing={searches:0,expanded:0,coarseExpanded:0,fallbacks:0};
  readonly tactical: TacticalTerrain;
  private blockedCells=new Set<number>();
  constructor(
    map: UtcMap,
    readonly registry: ContentRegistry,
    private readonly entities: () => readonly Entity[],
    readonly ignoresUnits: (e: Entity) => boolean = () => false,
    private readonly units: () => readonly Entity[] = () => entities().filter(e => e.unit),
  ) {
    this.size = map.size;
    this.heights = new Int16Array(this.size * this.size);
    this.terrain = new Uint8Array(this.size * this.size);
    const verts = this.size + 33;
    const h = map.height ? decodeHeight(map.height, this.size) : null,
      sea = Math.round((map.waterLevel ?? 0) * 100);
    this.sea = sea;
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        const i = y * this.size + x;
        this.heights[i] = Math.round(
          (h?.[(y - HEIGHT_ORIGIN) * verts + x - HEIGHT_ORIGIN] ?? 0) * 100,
        );
        this.terrain[i] = this.heights[i] >= sea - WADING_DEPTH_CM ? 1 : 0;
      }
    const surfaces=bridgeSurfaces(map.stamps,(x,z)=>h?sampleHeight(h,x,z,this.size):0);
    if(surfaces.length){
      applySceneryBlockers(map,this.terrain);
      this.layers=new WalkSurfaces(this.size,this.heights,this.terrain,surfaces);
      this.decks=new Uint8Array(this.size*this.size);
      for(const node of this.layers.nodes)if(node.surface)this.decks[node.cell]=1;
    }else{
      this.decks=applyBridgeSurfaces(this.size,surfaces,this.terrain,this.heights);
      applySceneryBlockers(map,this.terrain);
    }
    const capacity=this.layers?.nodes.length ?? this.size*this.size;
    this.occupied=new Int32Array(capacity);this.resources=new Int32Array(capacity);
    this.tactical=new TacticalTerrain(this.size,this.heights);
    this.sectors = new SectorNavigation(this.size,i=>this.walkable(i),(a,b)=>this.walkable(b)&&Math.abs(this.heights[a]!-this.heights[b]!)<=MAX_GROUND_STEP_CM,
      this.layers?{count:this.layers.nodes.length,cell:id=>this.layers!.nodes[id]!.cell,
        neighbors:id=>this.layers!.neighbors(id,n=>!!this.occupied[n.id]||!!this.resources[n.id])}:undefined);
    this.navigation = new Navigation(
      this.size,
      (a, b) =>
        this.walkable(b) && Math.abs(this.heights[a]! - this.heights[b]!) <= MAX_GROUND_STEP_CM,
      (a,b)=>this.sectors.connected(a,b),
      true,
    );
  }
  attackClear(origin:Point,target:Entity,ranged:boolean):boolean {
    const center=precise(target),f=this.registry.get(target.definition).footprint;
    const rotated=Math.round(target.rotation/90)%2!==0;
    const halfX=f?(rotated?f.depth:f.width)/2:0,halfY=f?(rotated?f.width:f.depth)/2:0;
    const end={...(target.surface?{surface:target.surface}:{}),x:Math.max(center.x-halfX,Math.min(center.x+halfX,origin.x)),y:Math.max(center.y-halfY,Math.min(center.y+halfY,origin.y))};
    const terrain=this.layers??this.tactical;
    return ranged?terrain.shotClear(origin,end):terrain.meleeClear(origin,end);
  }
  cell(p: Point) {
    return this.layers ? this.layers.node(p) ?? -1 : cell(p, this.size);
  }
  point(i: number) {
    const p=this.layers?.nodes[i];
    return p?{x:p.x,y:p.y,...(p.surface?{surface:p.surface}:{})}:point(i, this.size);
  }
  validPoint(p:Point):boolean {
    return p.x>=0&&p.y>=0&&p.x<this.size&&p.y<this.size && (!p.surface || !!this.layers&&this.layers.node({x:Math.round(p.x),y:Math.round(p.y),surface:p.surface})!==undefined);
  }
  validNode(id:number):boolean {return Number.isInteger(id)&&id>=0&&id<this.occupied.length;}
  findPath(start:number,goal:number,blocked?:ReadonlySet<number>,maxCost=Infinity):number[]|null {
    if(!this.validNode(start)||!this.validNode(goal))return null;
    if(!this.layers){
      const dx=Math.abs(start%this.size-goal%this.size),dy=Math.abs(Math.floor(start/this.size)-Math.floor(goal/this.size));
      const corridor=Math.max(dx,dy)>=32?this.sectors.corridor(start,goal):undefined;
      this.routing.coarseExpanded+=corridor?this.sectors.diagnostics.expandedRegions:0;
      if(corridor===null)return null;
      this.routing.searches++;
      const route=this.navigation.path(start,goal,blocked,maxCost,corridor);
      this.routing.expanded+=this.navigation.lastExpanded;
      if(route!==null||!corridor)return route;
      // Temporary traffic may block every portal on the preferred corridor.
      // Preserve reachability with a full search instead of reporting failure.
      this.routing.fallbacks++;this.routing.searches++;
      const fallback=this.navigation.path(start,goal,blocked,maxCost);
      this.routing.expanded+=this.navigation.lastExpanded;return fallback;
    }
    const from=this.point(start),to=this.point(goal),corridor=Math.max(Math.abs(from.x-to.x),Math.abs(from.y-to.y))>=32?this.sectors.corridor(start,goal):undefined;
    if(corridor===null)return null;
    this.routing.coarseExpanded+=corridor?this.sectors.diagnostics.expandedRegions:0;
    const blockedNode=(n:import('../../shared/map/walkSurfaces').SurfaceNode)=>!!this.occupied[n.id]||!!this.resources[n.id]||!!blocked?.has(n.id);
    this.routing.searches++;
    const route=this.layers.path(from,to,n=>blockedNode(n)||!!corridor&&!corridor[this.sectors.sector(n.id)],maxCost);
    this.routing.expanded+=this.layers.lastExpanded;
    if(route!==null||!corridor)return route?.map(n=>n.id)??null;
    this.routing.fallbacks++;this.routing.searches++;
    const fallback=this.layers.path(from,to,blockedNode,maxCost);this.routing.expanded+=this.layers.lastExpanded;
    return fallback?.map(n=>n.id)??null;
  }
  visible(a:Point,b:Point){return (this.layers??this.tactical).visible(a,b);}
  private readonly layerViews=new Map<string,readonly number[]>();
  visibleNodes(origin:Point,radius:number):readonly number[]|Uint32Array{
    if(!this.layers)return this.tactical.visibleCells(origin,radius);
    const key=`${origin.x}:${origin.y}:${origin.surface??""}:${radius}`,cached=this.layerViews.get(key);if(cached)return cached;
    const out:number[]=[];
    for(let y=Math.max(0,Math.ceil(origin.y-radius));y<=Math.min(this.size-1,Math.floor(origin.y+radius));y++)
      for(let x=Math.max(0,Math.ceil(origin.x-radius));x<=Math.min(this.size-1,Math.floor(origin.x+radius));x++){
        if((x-origin.x)**2+(y-origin.y)**2>radius*radius)continue;
        for(const id of this.layers.at(x,y))if(this.visible(origin,this.layers.nodes[id]!))out.push(id);
      }
    if(this.layerViews.size>=256)this.layerViews.delete(this.layerViews.keys().next().value!);
    this.layerViews.set(key,out);return out;
  }
  height(p:Point){return this.layers?.height(p)??this.heights[Math.round(p.y)*this.size+Math.round(p.x)]!/100;}
  pointsAt(x:number,y:number):Point[]{return this.layers?this.layers.at(x,y).map(i=>this.point(i)):[{x,y}];}
  footprint(e: Pick<Entity, "definition" | "x" | "y" | "rotation" | "surface">): number[] {
    const d = this.registry.get(e.definition),
      f = d.footprint;
    if (!f) return [this.cell(e)];
    const swap = Math.round(e.rotation / 90) % 2 !== 0,
      w = swap ? f.depth : f.width,
      h = swap ? f.width : f.depth,
      result: number[] = [];
    for (let y = e.y - Math.floor(h / 2); y <= e.y + Math.floor(h / 2); y++)
      for (let x = e.x - Math.floor(w / 2); x <= e.x + Math.floor(w / 2); x++)
        result.push(
          x < 0 || x >= this.size || y < 0 || y >= this.size
            ? -1
            : y * this.size + x,
        );
    return result;
  }
  entrance(e: Pick<Entity, "definition" | "x" | "y" | "rotation">): Point {
    const offset = this.registry.get(e.definition).entrance ?? { x: 0, y: 0 },
      r = ((Math.round(e.rotation / 90) % 4) + 4) % 4;
    const x = [offset.x, offset.y, -offset.x, -offset.y][r],
      y = [offset.y, -offset.x, -offset.y, offset.x][r];
    return { x: e.x + x, y: e.y + y };
  }
  rebuild() {
    const previous=this.blockedCells,next=new Set<number>();
    this.occupied.fill(0);
    this.resources.fill(0);
    for (const e of this.entities())
      if (alive(e)) {
        if (this.registry.get(e.definition).kind === "building")
          for (const i of this.footprint(e))
            if (i >= 0) {this.occupied[i] = e.id;next.add(i);}
        if (e.resource && e.resource.amount > 0)
          for (const i of this.footprint(e))
            if (i >= 0) {this.resources[i] = e.id;next.add(i);}
      }
    this.blockedCells=next;
    const added=[...next].filter(cell=>!previous.has(cell)),removed=[...previous].filter(cell=>!next.has(cell));
    this.navigation.invalidate([...added,...removed]);
    this.sectors.invalidate([...added,...removed]);
    this.sectors.prepare();
  }
  walkable(i: number) {
    return (
      i >= 0 &&
      i < this.occupied.length &&
      (this.layers?this.layers.walkable(i):!!this.terrain[i]) &&
      !this.occupied[i] &&
      !this.resources[i]
    );
  }
  free(p: Point, except?: number) {
    const mover = except == null ? undefined : this.unitIndex?.entities.get(except) ?? this.units().find(e => e.id === except);
    return (
      p.x >= 0 &&
      p.x < this.size &&
      p.y >= 0 &&
      p.y < this.size &&
      this.walkable(this.cell(p)) &&
      (!!mover && this.ignoresUnits(mover) || !Array.from(this.unitIndex ? [...this.unitIndex.inCell(p.x,p.y),...this.unitIndex.reservedInCell(p.x,p.y)] : this.units()).some(
        (e) =>
          e.unit &&
          alive(e) &&
          !e.unit.contained &&
          !e.unit.release &&
          !this.ignoresUnits(e) &&
          e.id !== except &&
          (e.surface === p.surface || !!this.layers&&Math.abs(this.height(precise(e))-this.height(p))<2) &&
          ((e.x === p.x && e.y === p.y) ||
            (!!e.unit.detour?.yielding && e.unit.detour.waypoint===this.cell(p))),
      ))
    );
  }
  nearest(origin: Point, max = 12, except?: number): Point | null {
    for (let r = 0; r <= max; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.abs(dx) + Math.abs(dy) === r) {
            const p = { x: origin.x + dx, y: origin.y + dy, ...(origin.surface?{surface:origin.surface}:{}) };
            if (this.free(p, except)) return p;
          }
    return null;
  }
  private probes:{entity:Entity;blocked?:Set<number>;pocket?:ReadonlySet<number>|null}|undefined;
  /** Only failed candidate probes may repeat inside this synchronous scope.
   * Jobs/units must not change before the successful final probe ends it. */
  routeBatch<T>(entity:Entity,query:()=>T):T {
    const previous=this.probes;this.probes={entity};
    try{return query();}finally{this.probes=previous;}
  }
  private routeBlockers(entity:Entity,avoidUnits:boolean):Set<number> {
    if(!avoidUnits||this.ignoresUnits(entity))return new Set();
    if(this.probes?.entity===entity&&this.probes.blocked)return this.probes.blocked;
    const blocked=new Set<number>();
    for(const unit of this.units()){
      if(unit.id===entity.id||!unit.unit||!alive(unit)||unit.unit.contained||unit.unit.release||this.ignoresUnits(unit))continue;
      blocked.add(this.cell(unit));
      if(unit.unit.detour?.yielding)blocked.add(unit.unit.detour.waypoint);
    }
    if(this.probes?.entity===entity)this.probes.blocked=blocked;
    return blocked;
  }
  route(e: Entity, destination: Point, avoidUnits = e.unit?.order?.type !== "move" && e.unit?.order?.type !== "attack", maxCost = Infinity): boolean {
    if (
      !e.unit ||
      destination.x < 0 ||
      destination.x > this.size - 1 ||
      destination.y < 0 ||
      destination.y > this.size - 1
    )
      return false;
    if (e.unit.idle) e.unit.idle.walking = false;
    if(this.cell(destination)<0||this.cell(e)<0)return false;
    const goal=this.cell(destination),blocked=this.routeBlockers(e,avoidUnits);
    const from = e.unit.position ?? fixed(e);
    if(avoidUnits&&Number.isFinite(maxCost)){
      // Recompute the terrain-only budget so successive traffic retries cannot
      // ratchet the allowed detour farther and farther away from the corridor.
      const terrainPath=this.clearSegment(from,fixed(destination))?[goal]:this.findPath(this.cell(e),goal);
      if(terrainPath===null)return false;
      let length=0,anchor=from;
      for(const i of terrainPath){const p=fixed(this.point(i));length+=Math.hypot(p.x-anchor.x,p.y-anchor.y);anchor=p;}
      maxCost=Math.min(maxCost,Math.ceil(length*1.25/1000+4)*1000);
    }
    const direct = this.clearSegment(from, fixed(destination), blocked);
    if(!direct&&!this.layers&&this.probes?.entity===e&&avoidUnits){
      if(this.probes.pocket===undefined)this.probes.pocket=this.navigation.reachablePocket(this.cell(e),blocked);
      if(this.probes.pocket&&!this.probes.pocket.has(goal))return false;
    }
    // Every A* route starts at one of the eight neighboring cell centers.
    // If an interrupted sub-cell position cannot join any of those (or its own
    // center), all resulting routes would be rejected by the smoothing loop.
    // Prove that once up front instead of searching hundreds of tree targets.
    if (!direct && !this.clearSegment(from, fixed(e), blocked)) {
      let exit = false;
      for (let dy = -1; dy <= 1 && !exit; dy++)
        for (let dx = -1; dx <= 1 && !exit; dx++) {
          if (!dx && !dy) continue;
          const x = e.x + dx, y = e.y + dy;
          if (x >= 0 && y >= 0 && x < this.size && y < this.size &&
              this.clearSegment(from, fixed({x,y,...(e.surface?{surface:e.surface}:{})}), blocked)) exit = true;
        }
      if (!exit) return false;
    }
    const path = direct
      ? [goal]
      : this.findPath(this.cell(e), goal, blocked, maxCost);
    if (path === null) return false;
    const waypoints: number[] = [];
    let anchor = from;
    for (let i = 0; i < path.length;) {
      let farthest = i;
      if (!this.clearSegment(anchor, fixed(this.point(path[i])), blocked)) {
        // A* starts at a cell center, but an interrupted mover may be beside a
        // corner inside that cell. Join the corridor via its checked center
        // instead of rejecting a reachable route or snapping the unit there.
        const center = fixed(this.point(this.cell(e)));
        if (i !== 0 || !this.clearSegment(anchor, center, blocked) ||
            !this.clearSegment(center, fixed(this.point(path[i])), blocked)) return false;
        waypoints.push(this.cell(e));
        anchor = center;
      }
      // Farther candidates progressively straighten the A* corridor.
      while (
        farthest + 1 < path.length &&
        this.clearSegment(
          anchor,
          fixed(this.point(path[farthest + 1])),
          blocked,
        )
      )
        farthest++;
      const next = path[farthest];
      waypoints.push(next);
      anchor = fixed(this.point(next));
      i = farthest + 1;
    }
    if (
      !waypoints.length &&
      (from.x !== destination.x * 1000 || from.y !== destination.y * 1000)
    )
      waypoints.push(goal);
    e.unit.route = waypoints;
    delete e.unit.detour;
    e.unit.position ??= from;
    e.unit.goal = goal;
    return true;
  }
  clearSegment(
    from: FixedPoint,
    to: FixedPoint,
    blocked?: ReadonlySet<number>,
  ) {
    if(this.layers){
      const graph=this.layers;
      const layerPoint=(p:FixedPoint)=>({x:Math.floor((p.x+500)/1000),y:Math.floor((p.y+500)/1000),...(p.surface?{surface:p.surface}:{})});
      const start=graph.node(layerPoint(from)),goal=graph.node(layerPoint(to));
      if(start===undefined||goal===undefined)return false;
      const blockedNode=(n:import('../../shared/map/walkSurfaces').SurfaceNode)=>!this.walkable(n.id)||!!blocked?.has(n.id);
      const node=(cell:number,surface:string|undefined)=>graph.node({x:cell%this.size,y:Math.floor(cell/this.size),surface});
      const step=(a:number,b:number)=>{
        const na=node(a,from.surface),nb=node(b,from.surface);if(na===undefined||nb===undefined)return false;
        return graph.step(na,nb,blockedNode);
      };
      if(from.surface!==to.surface){
        // Never smooth past a portal. The crossing is a single cardinal edge.
        if(!graph.step(start,goal,blockedNode))return false;
      }else if(!clearRay(from,to,step,this.size))return false;
      // Sweep the same physical footprint used on ordinary terrain. At a
      // portal its leading/trailing corners can already touch the other floor
      // before the center changes surface. Only an adjacent legal portal edge
      // permits that fallback; side rails and unrelated overlapping floors do not.
      const candidates=(cell:number)=>{
        const result:number[]=[];
        for(const id of [node(cell,from.surface),node(cell,to.surface)])
          if(id!==undefined&&this.walkable(id)&&!result.includes(id))result.push(id);
        if(!result.length){
          for(const id of graph.at(cell%this.size,Math.floor(cell/this.size)))
            if((graph.step(start,id)||graph.step(goal,id))&&this.walkable(id))result.push(id);
        }
        return result;
      };
      return clearSweep(from,to,(a,b)=>candidates(a).some(na=>candidates(b).some(nb=>graph.step(na,nb))),this.size);

    }
    const terrainStep = (a: number, b: number) =>
      this.walkable(b) && Math.abs(this.heights[a] - this.heights[b]) <= MAX_GROUND_STEP_CM;
    return (
      clearSweep(from, to, terrainStep, this.size) &&
      (!blocked ||
        clearRay(
          from,
          to,
          (a, b) => terrainStep(a, b) && !blocked.has(b),
          this.size,
        ))
    );
  }
  /** Change layer only when the fixed-point mover actually crosses its portal cell. */
  adoptSurface(from:FixedPoint,to:FixedPoint,goal:FixedPoint):void {
    if(!this.layers)return;
    const cell=(p:FixedPoint)=>({x:Math.floor((p.x+500)/1000),y:Math.floor((p.y+500)/1000)});
    const p=cell(to),end=cell(goal);
    const surface=from.surface!==goal.surface && p.x===end.x&&p.y===end.y ? goal.surface : from.surface;
    if(surface)to.surface=surface;else delete to.surface;
  }
  /** Optional diagnostics collect every physical blocker without changing the
   * ordinary movement query's allocation-free, first-collision fast path. */
  unitSegmentClear(from: FixedPoint, to: FixedPoint, except: number, blockers?: number[]): boolean {
    const initialCount=blockers?.length ?? 0;
    const mover = this.unitIndex?.entities.get(except) ?? this.units().find(e => e.id === except);
    if (mover && this.ignoresUnits(mover)) return true;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      square = dx * dx + dy * dy;
    const candidates=this.unitIndex?.within(Math.min(from.x,to.x)-400,Math.min(from.y,to.y)-400,Math.max(from.x,to.x)+400,Math.max(from.y,to.y)+400) ?? this.units();
    for (const unit of candidates) {
      if (
        unit.id === except ||
        !unit.unit ||
        !alive(unit) ||
        unit.unit.contained ||
        unit.unit.release
        || this.ignoresUnits(unit)
      )
        continue;
      if(this.layers && Math.abs(this.height(precise(unit))-this.height({x:from.x/1000,y:from.y/1000,surface:from.surface}))>=2)continue;
      const p = unit.unit.position ?? fixed(unit);
      if (
        p.x < Math.min(from.x, to.x) - 400 ||
        p.x > Math.max(from.x, to.x) + 400 ||
        p.y < Math.min(from.y, to.y) - 400 ||
        p.y > Math.max(from.y, to.y) + 400
      )
        continue;
      const t = square
        ? Math.max(
            0,
            Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / square),
          )
        : 0;
      if (
        (p.x - from.x - t * dx) ** 2 + (p.y - from.y - t * dy) ** 2 <
        400 ** 2
      ) {
        if (!blockers) return false;
        blockers.push(unit.id);
      }
    }
    return (blockers?.length ?? 0) === initialCount;
  }
  range(a: Entity, b: Entity) { return this.pointRange(precise(a), b); }
  pointRange(pa: Point, b: Entity) {
    const f = this.registry.get(b.definition).footprint;
    const pb = precise(b);
    let dx = Math.abs(pa.x - pb.x),
      dy = Math.abs(pa.y - pb.y);
    if (f) {
      dx = Math.max(
        0,
        dx - (Math.round(b.rotation / 90) % 2 ? f.depth : f.width) / 2,
      );
      dy = Math.max(
        0,
        dy - (Math.round(b.rotation / 90) % 2 ? f.width : f.depth) / 2,
      );
    }
    return dx * dx + dy * dy;
  }
}
