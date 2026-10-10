import {clearLayeredSweep} from './layeredSweep';
import {footprintCellBounds} from '../../shared/spatial/footprint';
import {SimulationProfiler} from '../profiling';
import {GroundNavigation} from './groundNavigation';
import {LocalTerrainSweeps} from './localTerrainSweeps';
import {formDefinition} from '../abilities/forms';
import {farthestClearWaypoint} from './routeSmoothing';
import {adjacentSweep} from './adjacentSweep';
import {RouteCorridors} from './routeCorridors';
import {locomotion,flightHeight} from './locomotion';
import {projectScene} from '../../shared/authoring/project';
import {SectorNavigation} from './sectorNavigation';
import {WalkSurfaces} from '../../shared/map/walkSurfaces';
import {TacticalTerrain,MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';
import {UnitIndex} from "./unitIndex";
import {bridgeSurfaces,applyBridgeSurfaces} from '../../shared/map/bridgeSurface';
import {applySceneryBlockers} from '../../shared/map/sceneryCollision';
import {resourceCollisionCells} from '../../shared/map/resourceClearance';
import {
  clearSweep,
  appendRayCells,
  clearRay,
  fixed,
  precise,
  lengthCeil,
  type FixedPoint,
} from "./motion";
import type { ContentRegistry } from "../../content/registry";
import { WADING_DEPTH_CM } from "../../shared/map/height";
import type { UtcMap } from "../../shared/map/utcmap";
import { Navigation,canTraverse } from "./navigation";
import { alive, type Entity, type Point } from "./state";

export const cell = (p: Point, size = 256) => Math.round(p.y) * size + Math.round(p.x);
export const point = (i: number, size = 256): Point => ({
  x: i % size,
  y: Math.floor(i / size),
});
export const distance2 = (a: Point, b: Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
let spatialRevisions = 0;
type Body = {radius:number;height:number;formationSpacing:number;locomotion?:'ground'|'air'};
/** Sweeps only need membership, not an army-wide materialized set. */
export type CellReservations = Pick<ReadonlySet<number>,'has'>;
type Actor = Pick<Entity,'definition'> & Partial<Pick<Entity,'spellStatuses'|'unit'>>|Body;
type OccupancyInput = {id:number;definition:string;x:number;y:number;rotation:number;surface?:string;scale:number;building:boolean;resource:boolean};
/** Separating motion may escape an existing overlap; moving into it may not. */
function bodyBlocksSegment(from:FixedPoint,dx:number,dy:number,square:number,x:number,y:number,separationSquared:number):boolean {
  const sx=x-from.x,sy=y-from.y;
  if(square&&sx*sx+sy*sy<separationSquared&&sx*dx+sy*dy<=0)return false;
  const t=square?Math.max(0,Math.min(1,(sx*dx+sy*dy)/square)):0;
  return (x-from.x-t*dx)**2+(y-from.y-t*dy)**2<separationSquared;
}
export class Spatial {
  airborne(actor?:Actor){return !!actor&&('definition' in actor?locomotion(formDefinition(this.registry.get(actor.definition),actor,this.registry))==='air':actor.locomotion==='air');}
  sameLocomotion(a?:Actor,b?:Actor){return this.airborne(a)===this.airborne(b);}
  /** Air units clear every physical floor; this height never changes horizontal navigation cells. */
  airFloor(p:Point){const x=Math.max(0,Math.min(this.size-1,Math.round(p.x))),y=Math.max(0,Math.min(this.size-1,Math.round(p.y))),i=y*this.size+x;
   return Math.max(this.heights[i]!/100,this.waterHeights[i]!/100,...(this.layers?.at(x,y).map(n=>this.layers!.nodes[n]!.height/100)??[]));}
  elevation(e:Pick<Entity,'definition'|'x'|'y'|'surface'> & Partial<Pick<Entity,'spellStatuses'|'unit'>>,point:Point=e){return this.airborne(e)?this.airFloor(point)-this.height(point)+flightHeight(formDefinition(this.registry.get(e.definition),e,this.registry)):0;}
  elevatedPoint(e:Entity){const p=precise(e),elevation=this.elevation(e,p)+(e.unit?.garrison?.height??0);return elevation?{...p,elevation}:p;}
  private airNavigation:Navigation|undefined;

  dimensions(actor?:Actor):Body {return actor&&'definition' in actor ? this.registry.get(actor.definition).dimensions??this.registry.navigationBody : actor??this.registry.navigationBody;}
  private readonly bodyNavigations=new Map<string,Navigation>();
  private groundWalkable:Uint8Array|undefined;
  private readonly groundNavigations=new Map<number,GroundNavigation>();
  private readonly meshSteps=new Map<number,(a:number,b:number)=>boolean>();
  private readonly localTerrainSweeps=new Map<number,LocalTerrainSweeps>();
  private readonly maxUnitRadius:number;
  private navigationFor(actor?:Actor){
    const d=this.dimensions(actor),key=`${d.radius}/${d.height}`;
    let navigation=this.bodyNavigations.get(key);
    if(!navigation){
      const terrainStep=(a:number,b:number)=>this.walkable(b)&&Math.abs(this.heights[a]!-this.heights[b]!)<=MAX_GROUND_STEP_CM;
      const step=this.layers?(a:number,b:number)=>this.clearSegment(fixed(this.point(a)),fixed(this.point(b)),undefined,d)
        :d.radius<.5?terrainStep:adjacentSweep(this.size,Math.round(d.radius*1000),terrainStep);
      navigation=new Navigation(this.size,step,(a,b)=>this.sectors.connected(a,b),true,this.profile);
      this.bodyNavigations.set(key,navigation);
    }
    return navigation;
  }
  private movementScope=false;
  private currentUnitIndex:UnitIndex|null=null;
  private reusableUnitIndex:UnitIndex|undefined;
  /** Merely entering a planning pass does not require collision data. Materialize
   * on the first body query, using live state at that point; later moves update
   * that same index. Outside the scope queries continue to use live entities. */
  private get unitIndex():UnitIndex|null {
    if(!this.movementScope)return null;
    if(!this.currentUnitIndex)this.profile.measure('Moving-body refresh',()=>{
      const units=this.units();this.profile.count('Bodies indexed',units.length);
      if(this.reusableUnitIndex)this.reusableUnitIndex.refresh(units);
      else this.reusableUnitIndex=new UnitIndex(units,this.size,this.ignoresUnits);
      this.currentUnitIndex=this.reusableUnitIndex;
    });
    return this.currentUnitIndex;
  }
  beginUnitMovement(){
    this.movementScope=true;this.currentUnitIndex=null;
  }
  updateUnitMovement(e:Entity){this.currentUnitIndex?.update(e);}
  endUnitMovement(){this.movementScope=false;this.currentUnitIndex=null;}

  /** Live cell membership for a synchronous local decision. Includes remote
   * yield pockets, and distinguishes stacked walk surfaces at the same x/y.
   * The movement scope updates buckets after each actor; outside it use live
   * records rather than retaining an index across untracked mutations. */
  unitReservations(accept:(entity:Entity)=>boolean):CellReservations {
    const matches=(e:Entity)=>{
      this.profile.count('Local reservation candidates');
      return accept(e);
    };
    return {has:cell=>{
      const index=this.unitIndex;
      if(index){
        const p=this.point(cell);
        for(const e of index.inCell(p.x,p.y))if(this.cell(e)===cell&&matches(e))return true;
        for(const e of index.reservedAt(cell))if(matches(e))return true;
      }else for(const e of this.units())if((this.cell(e)===cell||e.unit?.detour?.yielding&&e.unit.detour.waypoint===cell)&&
        e.unit&&alive(e)&&!e.unit.contained&&!e.unit.release&&!this.ignoresUnits(e)&&matches(e))return true;
      return false;
    }};
  }

  readonly layers: WalkSurfaces | undefined;
  readonly size: number;
  /** Collision radius in fixed-point units, shared by broad/narrow phase and terrain sweeps. */
  readonly unitRadius: number;
  readonly unitHeight: number;
  readonly heights: Int16Array;
  readonly terrain: Uint8Array;
  readonly waterHeights:Int16Array;
  readonly decks: Uint8Array;
  readonly occupied: Int32Array;
  readonly resources: Int32Array;
  readonly navigation: Navigation;
  readonly sectors: SectorNavigation;
  readonly routing={searches:0,expanded:0,coarseExpanded:0,fallbacks:0,sharedCorridors:0,trafficBudgetHits:0,trafficBiasedSearches:0,
    meshSearches:0,meshExpanded:0,meshAccepted:0,meshFallbacks:0,meshRebuiltTiles:0,
    meshNoCorridor:0,meshSnapRejected:0,meshRasterRejected:0,meshBudgetRejected:0};
  readonly tactical: TacticalTerrain;
  private blockedCells=new Set<number>();
  private occupancyInputs:OccupancyInput[]=[];
  // Only overlapping cells need an owner stack. Single-owner cells continue to
  // use the existing arrays. Order matches the authoritative last-writer rule.
  private readonly occupiedOverlaps=new Map<number,number[]>();
  private readonly resourceOverlaps=new Map<number,number[]>();
  /** Changes whenever blocking occupancy is rebuilt. Drawn from a module-wide counter so a
   * restored World's fresh Spatial never repeats a revision a debug consumer has cached. */
  revision=++spatialRevisions;
  constructor(
    map: UtcMap,
    readonly registry: ContentRegistry,
    private readonly entities: () => readonly Entity[],
    readonly ignoresUnits: (e: Entity) => boolean = () => false,
    private readonly units: () => readonly Entity[] = () => entities().filter(e => e.unit),
    readonly profile=new SimulationProfiler(),
  ) {
    this.size = map.size;
    const dimensions = registry.navigationBody;
    this.unitRadius = Math.round(dimensions.radius * 1000);
    this.unitHeight = dimensions.height;
    this.maxUnitRadius=Math.round(Math.max(dimensions.radius,...registry.definitions.filter(d=>d.kind==='unit').map(d=>d.dimensions!.radius))*1000);
    const compiled=projectScene(map);map={...map,stamps:compiled.stamps};
    this.heights = new Int16Array(this.size * this.size);
    this.waterHeights=new Int16Array(this.size*this.size);
    this.terrain = new Uint8Array(this.size * this.size);
    const field=compiled.field;
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        const i = y * this.size + x;
        this.heights[i] = Math.round(field.sample(x,y)*100);
        this.waterHeights[i]=Math.round(field.waterAt(x,y)*100);
        this.terrain[i] = this.heights[i] >= this.waterHeights[i]! - WADING_DEPTH_CM ? 1 : 0;
      }
    const surfaces=bridgeSurfaces(map.stamps,(x,z)=>field.sample(x,z));
    if(surfaces.length){
      applySceneryBlockers(map,this.terrain);
      this.layers=new WalkSurfaces(this.size,this.heights,this.terrain,surfaces,Math.round(this.unitHeight*100));
      this.decks=new Uint8Array(this.size*this.size);
      for(const node of this.layers.nodes)if(node.surface)this.decks[node.cell]=1;
    }else{
      this.decks=applyBridgeSurfaces(this.size,surfaces,this.terrain,this.heights);
      applySceneryBlockers(map,this.terrain);
    }
    const capacity=this.layers?.nodes.length ?? this.size*this.size;
    this.occupied=new Int32Array(capacity);this.resources=new Int32Array(capacity);
    this.tactical=new TacticalTerrain(this.size,this.heights);this.tactical.diagnostics=this.profile;
    this.sectors = new SectorNavigation(this.size,i=>this.walkable(i),(a,b)=>this.walkable(b)&&Math.abs(this.heights[a]!-this.heights[b]!)<=MAX_GROUND_STEP_CM,
      this.layers?{count:this.layers.nodes.length,cell:id=>this.layers!.nodes[id]!.cell,
        neighbors:id=>this.layers!.neighbors(id,n=>!!this.occupied[n.id]||!!this.resources[n.id])}:undefined,this.profile);
    this.navigation = new Navigation(
      this.size,
      (a, b) =>
        this.unitRadius < 500
          ? this.walkable(b) && Math.abs(this.heights[a]! - this.heights[b]!) <= MAX_GROUND_STEP_CM
          : this.clearSegment(fixed(this.point(a)), fixed(this.point(b))),
      (a,b)=>this.sectors.connected(a,b),
      true,this.profile,
    );
  }
  attackClear(origin:Point & {elevation?:number},target:Entity,ranged:boolean):boolean {
    const center=precise(target),f=this.registry.get(target.definition).footprint;
    const rotated=Math.round(target.rotation/90)%2!==0;
    const halfX=f?(rotated?f.depth:f.width)/2:0,halfY=f?(rotated?f.width:f.depth)/2:0;
    const end:Point&{elevation?:number}={...(target.surface?{surface:target.surface}:{}),x:Math.max(center.x-halfX,Math.min(center.x+halfX,origin.x)),y:Math.max(center.y-halfY,Math.min(center.y+halfY,origin.y))};
    if(this.airborne(target))end.elevation=this.elevation(target);
    const terrain=this.layers??this.tactical;
    return ranged?terrain.shotClear(origin,end):terrain.meleeClear(origin,end);
  }
  cell(p: Point) {
    return this.layers ? this.layers.node({...p,x:Math.round(p.x),y:Math.round(p.y)}) ?? -1 : cell(p, this.size);
  }
  point(i: number) {
    const p=this.layers?.nodes[i];
    return p?{x:p.x,y:p.y,...(p.surface?{surface:p.surface}:{})}:point(i, this.size);
  }
  validPoint(p:Point):boolean {
    return p.x>=0&&p.y>=0&&p.x<this.size&&p.y<this.size && (!p.surface || !!this.layers&&this.layers.node({x:Math.round(p.x),y:Math.round(p.y),surface:p.surface})!==undefined);
  }
  validNode(id:number):boolean {return Number.isInteger(id)&&id>=0&&id<this.occupied.length;}
  findPath(start:number,goal:number,blocked?:ReadonlySet<number>,maxCost=Infinity,actor?:Actor):number[]|null {
    if(!this.validNode(start)||!this.validNode(goal))return null;
    if(!this.unitWalkable(this.point(goal),actor))return null;
    if(this.airborne(actor)){if(start>=this.size*this.size||goal>=this.size*this.size)return null;this.airNavigation??=new Navigation(this.size,()=>true,()=>true,true,this.profile);return this.airNavigation.path(start,goal,blocked,maxCost);}
    // Bridge portals retain their specialized solver.
    // Long terrain routes use the mesh; all accepted grid steps still obey the
    // very same footprint/corner rules as movement and the reference solver.
    if(!this.layers&&!blocked?.size&&this.dimensions(actor).radius<=16&&Math.max(Math.abs(start%this.size-goal%this.size),Math.abs(Math.floor(start/this.size)-Math.floor(goal/this.size)))>=16){
      const path=this.profile.measure('Ground mesh route',()=>this.meshPath(start,goal,blocked,maxCost,actor));
      if(path)return path;
      // A failed coarse route often means a base pocket enclosed by buildings.
      // Spend a bounded extra reverse probe before flooding the map. The grid
      // fallback still decides reachability, including mesh-missed passages.
      return this.findGridPath(start,goal,blocked,maxCost,actor,512);
    }
    return this.findGridPath(start,goal,blocked,maxCost,actor);
  }
  /** Crossing orders from the same controller retain exact route selection.
   * Other controllers also matter locally; their distant orders must not disable
   * convoy routing on the opposite side of the map. Bodies remain blockers in
   * either case. This gate changes search priority, never collision clearance. */
  private opposingTraffic(e:Entity,destination:Point):boolean {
    const from=precise(e),dx=destination.x-from.x,dy=destination.y-from.y;
    const minX=Math.min(from.x,destination.x)-8,maxX=Math.max(from.x,destination.x)+8;
    const minY=Math.min(from.y,destination.y)-8,maxY=Math.max(from.y,destination.y)+8;
    for(const other of this.units()){
      const u=other.unit;
      if(other.id===e.id||!u?.route.length||u.goal===null||!alive(other)||u.contained||u.release||this.ignoresUnits(other)||!this.sameLocomotion(e,other))continue;
      const p=precise(other);
      if(other.owner!==e.owner&&Math.max(Math.abs(p.x-from.x),Math.abs(p.y-from.y))>16)continue;
      const q=this.point(u.goal);
      if(dx*(q.x-p.x)+dy*(q.y-p.y)>=0)continue;
      if(maxX<Math.min(p.x,q.x)||minX>Math.max(p.x,q.x)||maxY<Math.min(p.y,q.y)||minY>Math.max(p.y,q.y))continue;
      return true;
    }
    return false;
  }
  /** Reference/fallback solver, also retained for comparative benchmarks. */
  findGridPath(start:number,goal:number,blocked?:ReadonlySet<number>,maxCost=Infinity,actor?:Actor,destinationProbeLimit=128):number[]|null {
    if(!this.validNode(start)||!this.validNode(goal)||!this.unitWalkable(this.point(goal),actor))return null;
    if(this.airborne(actor)){if(start>=this.size*this.size||goal>=this.size*this.size)return null;this.airNavigation??=new Navigation(this.size,()=>true,()=>true,true,this.profile);return this.airNavigation.path(start,goal,blocked,maxCost);}
    const navigation=this.navigationFor(actor);
    if(!this.layers){
      const dx=Math.abs(start%this.size-goal%this.size),dy=Math.abs(Math.floor(start/this.size)-Math.floor(goal/this.size));
      const corridor=Math.max(dx,dy)>=32?this.sectors.corridor(start,goal):undefined;
      this.routing.coarseExpanded+=corridor?this.sectors.diagnostics.expandedRegions:0;
      if(corridor===null)return null;
      this.routing.searches++;
      // Long retries may accept a slightly longer route for a smaller frontier.
      // A dense convoy can use that bias too, but crossing streams keep exact
      // search so changing route choices does not disrupt their yielding.
      let nearbyTraffic=0;
      if(blocked?.size)for(const cell of blocked){
        if(Math.abs(cell%this.size-start%this.size)<=8&&Math.abs(Math.floor(cell/this.size)-Math.floor(start/this.size))<=8&&++nearbyTraffic>3)break;
      }
      const convoy=Math.max(dx,dy)>=64&&nearbyTraffic>3&&!!actor&&'id' in actor&&'owner' in actor&&!this.opposingTraffic(actor as Entity,this.point(goal));
      const heuristicPermille=blocked?.size&&Math.max(dx,dy)>=64&&(nearbyTraffic<=3||convoy)?1200:1000;
      if(heuristicPermille>1000)this.routing.trafficBiasedSearches++;
      const route=navigation.path(start,goal,blocked,maxCost,corridor,heuristicPermille,destinationProbeLimit);
      this.routing.expanded+=navigation.lastExpanded;
      if(route!==null||!corridor)return route;
      // Temporary traffic may block every portal on the preferred corridor.
      // Preserve reachability with a full search instead of reporting failure.
      this.routing.fallbacks++;this.routing.searches++;
      if(heuristicPermille>1000)this.routing.trafficBiasedSearches++;
      const fallback=navigation.path(start,goal,blocked,maxCost,undefined,heuristicPermille,destinationProbeLimit);
      this.routing.expanded+=navigation.lastExpanded;return fallback;
    }
    const from=this.point(start),to=this.point(goal),corridor=Math.max(Math.abs(from.x-to.x),Math.abs(from.y-to.y))>=32?this.sectors.corridor(start,goal):undefined;
    if(corridor===null)return null;
    this.routing.coarseExpanded+=corridor?this.sectors.diagnostics.expandedRegions:0;
    const blockedNode=(n:import('../../shared/map/walkSurfaces').SurfaceNode)=>!!this.occupied[n.id]||!!this.resources[n.id]||!!blocked?.has(n.id);
    this.routing.searches++;
    const fits = (a:number,b:number) => this.clearSegment(fixed(this.point(a)),fixed(this.point(b)),undefined,actor);
    const route=this.layers.path(from,to,n=>blockedNode(n)||!!corridor&&!corridor[this.sectors.sector(n.id)],maxCost,fits);
    this.routing.expanded+=this.layers.lastExpanded;
    if(route!==null||!corridor)return route?.map(n=>n.id)??null;
    this.routing.fallbacks++;this.routing.searches++;
    const fallback=this.layers.path(from,to,blockedNode,maxCost,fits);this.routing.expanded+=this.layers.lastExpanded;
    return fallback?.map(n=>n.id)??null;
  }
  private groundNavigation(radius:number){
    let navigation=this.groundNavigations.get(radius);
    if(!navigation){
      this.groundWalkable??=Uint8Array.from(this.terrain,(_,i)=>+this.walkable(i));
      navigation=new GroundNavigation({size:this.size,radius,walkable:this.groundWalkable,heights:this.heights},this.profile);
      this.groundNavigations.set(radius,navigation);this.routing.meshRebuiltTiles+=navigation.diagnostics.rebuiltTiles;
    }
    return navigation;
  }
  private meshPath(start:number,goal:number,blocked:ReadonlySet<number>|undefined,maxCost:number,actor?:Actor):number[]|null {
    const body=this.dimensions(actor),mesh=this.groundNavigation(body.radius),before=mesh.diagnostics.rebuiltTiles;
    this.profile.measure('Mesh tile updates',()=>mesh.prepare());this.routing.meshRebuiltTiles+=mesh.diagnostics.rebuiltTiles-before;
    const a=this.point(start),b=this.point(goal);
    const result=this.profile.measure('Mesh corridor search',()=>mesh.query.computePath({x:a.x,z:a.y},{x:b.x,z:b.y}));
    this.routing.meshSearches++;this.routing.meshExpanded+=mesh.query.lastExpanded;
    const fallback=()=>{this.routing.meshFallbacks++;return null;};
    if(!result.success){this.routing.meshNoCorridor++;return fallback();}
    return this.profile.measure('Mesh route validation',()=>{
      let step=this.meshSteps.get(body.radius);
      if(!step){
        const terrainStep=(a:number,b:number)=>this.walkable(b)&&Math.abs(this.heights[a]!-this.heights[b]!)<=MAX_GROUND_STEP_CM;
        step=body.radius<.5?terrainStep:adjacentSweep(this.size,Math.round(body.radius*1000),terrainStep);this.meshSteps.set(body.radius,step);
      }
      const traverse=(a:number,b:number)=>!blocked?.has(b)&&step!(a,b),path:number[]=[];
      let previous=fixed(this.point(start));
      for(const p of result.path.slice(1)){
        const next={x:Math.round(p.x*1000),y:Math.round(p.z*1000)};
        if(!this.clearSegment(previous,next,blocked,actor)){this.routing.meshSnapRejected++;return fallback();}
        // Keep the public dense-cell path contract used by terrain analysis and
        // legacy callers. Smoothing below reduces it to a few movement waypoints.
        if(!appendRayCells(previous,next,traverse,this.size,path)){this.routing.meshRasterRejected++;return fallback();}
        previous=next;
      }
      // DDA may visit the two cardinal steps of an otherwise legal diagonal.
      // Collapse those pairs so dense-path length/budgets retain grid semantics.
      const compact:number[]=[];
      for(const cell of path){
        while(compact.length&&canTraverse(this.size,compact.length>1?compact[compact.length-2]!:start,cell,traverse))compact.pop();
        compact.push(cell);
      }
      let cost=0,cell=start;
      for(const next of compact){cost+=next%this.size!==cell%this.size&&Math.floor(next/this.size)!==Math.floor(cell/this.size)?1414:1000;cell=next;}
      if(cost>maxCost){this.routing.meshBudgetRejected++;return fallback();}
      this.routing.meshAccepted++;return compact;
    });
  }
  visible(a:Point & {elevation?:number},b:Point & {elevation?:number}){return (this.layers??this.tactical).visible(a,b);}
  private readonly layerViews=new Map<string,readonly number[]>();
  visibleNodes(origin:Point & {elevation?:number},radius:number,ignoreTerrain=false):readonly number[]|Uint32Array{
    if(!this.layers&&!ignoreTerrain)return this.tactical.visibleCells(origin,radius);
    const key=`${origin.x}:${origin.y}:${origin.surface??""}:${radius}:${origin.elevation??0}:${ignoreTerrain}`,cached=this.layerViews.get(key);if(cached)return cached;
    const out:number[]=[];
    for(let y=Math.max(0,Math.ceil(origin.y-radius));y<=Math.min(this.size-1,Math.floor(origin.y+radius));y++)
      for(let x=Math.max(0,Math.ceil(origin.x-radius));x<=Math.min(this.size-1,Math.floor(origin.x+radius));x++){
        if((x-origin.x)**2+(y-origin.y)**2>radius*radius)continue;
        if(!this.layers)out.push(y*this.size+x);
        else for(const id of this.layers.at(x,y))if(ignoreTerrain||this.visible(origin,this.layers.nodes[id]!))out.push(id);
      }
    if(this.layerViews.size>=256)this.layerViews.delete(this.layerViews.keys().next().value!);
    this.layerViews.set(key,out);return out;
  }
  height(p:Point){return this.layers?.height(p)??this.heights[Math.round(p.y)*this.size+Math.round(p.x)]!/100;}
  pointsAt(x:number,y:number):Point[]{return this.layers?this.layers.at(x,y).map(i=>this.point(i)):[{x,y}];}
  footprint(e: Pick<Entity, "definition" | "x" | "y" | "rotation" | "surface">): number[] {
    const b = footprintCellBounds(e, this.registry.get(e.definition).footprint, e.rotation), result: number[] = [];
    for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++)
      result.push(x < 0 || x >= this.size || y < 0 || y >= this.size ? -1 : y * this.size + x);
    return result;
  }

  /** Ground cells a standing resource blocks for movement. Placement, fog and picking keep
   * using `footprint`; only walking and harvest approach see the wider disc. */
  collision(e: Pick<Entity, "definition" | "x" | "y" | "rotation" | "appearance">): number[] {
    const d = this.registry.get(e.definition);
    if (d.collisionRadius === undefined) return this.footprint(e);
    return resourceCollisionCells(e, d.footprint, d.collisionRadius, e.appearance?.scale ?? 1, e.rotation)
      .map(p => p.x < 0 || p.y < 0 || p.x >= this.size || p.y >= this.size ? -1 : p.y * this.size + p.x);
  }
  /** Cells exactly `ring` cells outside a footprint rectangle (Chebyshev), in row-major order.
   * Ring 1 is every cell touching the building, corners included. */
  perimeter(e: Pick<Entity, "definition" | "x" | "y" | "rotation">, ring = 1): Point[] {
    const b = footprintCellBounds(e, this.registry.get(e.definition).footprint, e.rotation);
    const x0 = b.minX - ring, x1 = b.maxX + ring, y0 = b.minY - ring, y1 = b.maxY + ring, out: Point[] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x += y === y0 || y === y1 ? 1 : x1 - x0)
        if (x >= 0 && y >= 0 && x < this.size && y < this.size) out.push({ x, y });
    return out;
  }
  /** WC3/SC2 exit rule: a trained unit appears on the building side nearest where it is
   * headed, spiralling outward ring by ring once bodies fill the edge. Only cells in the
   * door's walk region qualify, so a unit never spawns on an island behind the building. */
  deployment(b: Pick<Entity, "definition" | "x" | "y" | "rotation">, toward: Point, actor?: Actor, maxRing = 8): Point | null {
    const door = this.cell(this.entrance(b));
    for (let ring = 1; ring <= maxRing; ring++) {
      const cells = this.perimeter(b, ring).sort((p, q) => distance2(p, toward) - distance2(q, toward) || p.y - q.y || p.x - q.x);
      for (const p of cells)
        if (this.free(p, undefined, actor) && (this.airborne(actor) || door < 0 || this.sectors.connected(door, this.cell(p)))) return p;
    }
    return null;
  }
  entrance(e: Pick<Entity, "definition" | "x" | "y" | "rotation">): Point {
    const offset = this.registry.get(e.definition).entrance ?? { x: 0, y: 0 },
      r = ((Math.round(e.rotation / 90) % 4) + 4) % 4;
    const x = [offset.x, offset.y, -offset.x, -offset.y][r],
      y = [offset.y, -offset.x, -offset.y, offset.x][r];
    return { x: e.x + x, y: e.y + y };
  }
  /** In-place upgrades can change a definition without changing collision. Keep
   * the occupancy signature current so a later tree removal stays incremental.
   * Verify the actual raster; other transforms still require a full rebuild. */
  refreshOccupancyDefinition(e: Entity) {
    const old=this.occupancyInputs.find(input=>input.id===e.id);
    const building=this.registry.get(e.definition).kind==='building',resource=!!e.resource&&e.resource.amount>0;
    if(!old||!alive(e)||old.x!==e.x||old.y!==e.y||old.rotation!==e.rotation||old.surface!==e.surface||
      old.scale!==(e.appearance?.scale??1)||old.building!==building||old.resource!==resource){this.rebuild();return;}
    const same=(a:readonly number[],b:readonly number[])=>a.length===b.length&&a.every((cell,i)=>cell===b[i]);
    if((building&&!same(this.footprint(old),this.footprint(e)))||
      (resource&&!same(this.collision({...old,appearance:{scale:old.scale}}),this.collision(e)))){this.rebuild();return;}
    old.definition=e.definition;
  }
  /** Removal of a moving actor usually leaves every static blocker unchanged.
   * Compare the complete ordered input, including other actors killed in the
   * same combat batch, before skipping a rebuild. Direct terrain/array editors
   * must still use rebuild(); this fast path assumes occupancy is derived here.
   */
  refreshAfterRemoval(removedId?:number) {
    let index=0,removedIndex=-1;
    for(const e of this.entities())if(alive(e)){
      const building=this.registry.get(e.definition).kind==='building',resource=!!e.resource&&e.resource.amount>0;
      if(!building&&!resource)continue;
      if(removedId!==undefined&&this.occupancyInputs[index]?.id===removedId)removedIndex=index++;
      const previous=this.occupancyInputs[index++];
      if(!previous||previous.id!==e.id||previous.definition!==e.definition||previous.x!==e.x||previous.y!==e.y||
        previous.rotation!==e.rotation||previous.surface!==e.surface||previous.scale!==(e.appearance?.scale??1)||
        previous.building!==building||previous.resource!==resource){this.rebuild();return;}
    }
    if(removedId!==undefined&&this.occupancyInputs[index]?.id===removedId)removedIndex=index++;
    if(index!==this.occupancyInputs.length){this.rebuild();return;}
    if(removedIndex>=0){
      const old=this.occupancyInputs[removedIndex];
      const cells=new Set<number>();
      if(old.building)for(const cell of this.footprint(old))if(cell>=0){this.removeCellOwner(this.occupied,this.occupiedOverlaps,cell,old.id);cells.add(cell);}
      if(old.resource)for(const cell of this.collision({...old,appearance:{scale:old.scale}}))if(cell>=0){this.removeCellOwner(this.resources,this.resourceOverlaps,cell,old.id);cells.add(cell);}
      const changed:number[]=[];
      for(const cell of cells)if(!this.occupied[cell]&&!this.resources[cell]){this.blockedCells.delete(cell);changed.push(cell);}
      this.occupancyInputs.splice(removedIndex,1);
      this.invalidateOccupancy(changed);
    }
    this.revision=++spatialRevisions;this.sectors.prepare();
  }
  private removeCellOwner(grid:Int32Array,overlaps:Map<number,number[]>,cell:number,id:number){
    const owners=overlaps.get(cell);
    if(!owners){if(grid[cell]===id)grid[cell]=0;return;}
    const at=owners.indexOf(id);if(at>=0)owners.splice(at,1);
    grid[cell]=owners.at(-1)??0;
    if(owners.length<=1)overlaps.delete(cell);
  }
  /** A normal build command appends one entity to synchronized occupancy. Touch
   * only its footprint; direct edits to existing blockers still require rebuild.
   * Appending preserves the same last-writer ownership as a full entity scan. */
  appendOccupancy(e:Entity) {
    if(this.entities().at(-1)!==e||(this.occupancyInputs.at(-1)?.id??0)>=e.id){this.rebuild();return;}
    const building=this.registry.get(e.definition).kind==='building',resource=!!e.resource&&e.resource.amount>0;
    const changed:number[]=[];
    if(alive(e)&&(building||resource)){
      this.occupancyInputs.push({id:e.id,definition:e.definition,x:e.x,y:e.y,rotation:e.rotation,
        surface:e.surface,scale:e.appearance?.scale??1,building,resource});
      const occupy=(grid:Int32Array,overlaps:Map<number,number[]>,cells:readonly number[])=>{
        for(const cell of cells)if(cell>=0){
          this.addCellOwner(grid,overlaps,cell,e.id);
          if(!this.blockedCells.has(cell)){this.blockedCells.add(cell);changed.push(cell);}
        }
      };
      if(building)occupy(this.occupied,this.occupiedOverlaps,this.footprint(e));
      if(resource)occupy(this.resources,this.resourceOverlaps,this.collision(e));
    }
    this.revision=++spatialRevisions;
    this.invalidateOccupancy(changed);this.sectors.prepare();
  }
  private addCellOwner(grid:Int32Array,overlaps:Map<number,number[]>,cell:number,id:number){
    if(grid[cell]&&grid[cell]!==id){
      let owners=overlaps.get(cell);
      if(!owners){owners=[grid[cell]!];overlaps.set(cell,owners);}
      owners.push(id);
    }
    grid[cell]=id;
  }
  rebuild() {
    // Explicit full rebuilds include terrain edits and restore. Ordinary entity
    // additions/removals use invalidateOccupancy and never enter this branch.
    const preparedRadii=[...this.groundNavigations.keys()];
    for(const mesh of this.groundNavigations.values())mesh.destroy();
    this.groundNavigations.clear();this.groundWalkable=undefined;
    this.navigation.invalidate();
    this.localTerrainSweeps.clear();
    for(const navigation of this.bodyNavigations.values())navigation.invalidate();
    this.sectors.invalidate();
    const previous=this.blockedCells,next=new Set<number>();
    const inputs:OccupancyInput[]=[];
    this.occupiedOverlaps.clear();this.resourceOverlaps.clear();
    this.revision=++spatialRevisions;
    this.occupied.fill(0);
    this.resources.fill(0);
    for (const e of this.entities())
      if (alive(e)) {
        const building=this.registry.get(e.definition).kind==='building',resource=!!e.resource&&e.resource.amount>0;
        if(!building&&!resource)continue;
        const input:OccupancyInput={id:e.id,definition:e.definition,x:e.x,y:e.y,rotation:e.rotation,
          surface:e.surface,scale:e.appearance?.scale??1,building,resource};
        inputs.push(input);
        if (building)
          for (const i of this.footprint(e))
            if (i >= 0) {
              this.addCellOwner(this.occupied,this.occupiedOverlaps,i,e.id);next.add(i);
            }
        if (resource)
          for (const i of this.collision(e))
            if (i >= 0) {
              this.addCellOwner(this.resources,this.resourceOverlaps,i,e.id);next.add(i);
            }
      }
    this.occupancyInputs=inputs;
    this.blockedCells=next;
    const changed:number[]=[];
    for(const cell of next)if(!previous.has(cell))changed.push(cell);
    for(const cell of previous)if(!next.has(cell))changed.push(cell);
    this.invalidateOccupancy(changed);
    this.sectors.prepare();
    // Prepare the common body while loading, not on its first army order.
    if(!this.layers&&this.unitRadius<=16000)for(const radius of preparedRadii.length?preparedRadii:[this.unitRadius/1000])this.groundNavigation(radius);
  }
  private invalidateOccupancy(changed:readonly number[]){
    for(const cache of this.localTerrainSweeps.values())cache.invalidate(changed);
    if(this.groundWalkable)for(const cell of changed)if(cell<this.groundWalkable.length)this.groundWalkable[cell]=+this.walkable(cell);
    for(const mesh of this.groundNavigations.values())mesh.invalidate(changed);
    this.navigation.invalidate(changed, 1 + Math.floor((this.unitRadius + 500) / 1000));
    for(const navigation of this.bodyNavigations.values())navigation.invalidate(changed,1+Math.floor((this.maxUnitRadius+500)/1000));
    this.sectors.invalidate(changed);
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
  /** Physical clearance at a destination, not just the center terrain cell. */
  unitWalkable(p: Point,actor?:Actor): boolean {
    const position = fixed(p);
    return this.clearSegment(position, position,undefined,actor);
  }
  free(p: Point, except?: number,actor?:Actor,knownUnit?:(e:Entity)=>boolean) {
    const mover = except == null ? undefined : this.unitIndex?.entities.get(except) ?? this.units().find(e => e.id === except);
    return (
      p.x >= 0 &&
      p.x < this.size &&
      p.y >= 0 &&
      p.y < this.size &&
      this.unitWalkable(p,actor??mover) &&
      this.unitSegmentClear(fixed(p), fixed(p), except ?? -1,undefined,actor,knownUnit) &&
      (!!mover && this.ignoresUnits(mover) || !Array.from(this.unitIndex ? [...this.unitIndex.inCell(p.x,p.y),...this.unitIndex.reservedInCell(p.x,p.y)] : this.units()).some(
        (e) =>
          e.unit &&
          alive(e) &&
          !e.unit.contained &&
          !e.unit.release &&
          !this.ignoresUnits(e) &&
          this.sameLocomotion(e,actor??mover) &&
          e.id !== except &&
          (e.surface === p.surface || !!this.layers&&Math.abs(this.height(precise(e))-this.height(p))<Math.max(this.dimensions(e).height,this.dimensions(actor??mover).height)) &&
          ((e.x === p.x && e.y === p.y) ||
            (!!e.unit.detour?.yielding && e.unit.detour.waypoint===this.cell(p))) &&
          (!knownUnit || knownUnit(e)),
      ))
    );
  }
  /** Planning may restrict occupants to observed units. Actual motion always
   * uses the unfiltered physical sweeps, including invisible bodies. */
  nearest(origin: Point, max = 12, except?: number,actor?:Actor,accept?:(p:Point)=>boolean,knownUnit?:(e:Entity)=>boolean): Point | null {
    for (let r = 0; r <= max; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.abs(dx) + Math.abs(dy) === r) {
            const p = { x: origin.x + dx, y: origin.y + dy, ...(origin.surface?{surface:origin.surface}:{}) };
            if (this.free(p, except,actor,knownUnit)&&(!accept||accept(p))) return p;
          }
    return null;
  }
  private probes:{entity:Entity;blocked?:Set<number>;pocket?:ReadonlySet<number>|null}|undefined;
  private corridors:RouteCorridors|undefined;
  /** No corridor survives this pass, including exceptions or nested queries. */
  sharedRoutes<T>(query:()=>T):T {
    const previous=this.corridors;this.corridors=new RouteCorridors();
    try{return query();}finally{this.corridors=previous;}
  }
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
      if(unit.id===entity.id||!unit.unit||!alive(unit)||unit.unit.contained||unit.unit.release||this.ignoresUnits(unit)||!this.sameLocomotion(entity,unit))continue;
      blocked.add(this.cell(unit));
      if(unit.unit.detour?.yielding)blocked.add(unit.unit.detour.waypoint);
    }
    if(this.probes?.entity===entity)this.probes.blocked=blocked;
    return blocked;
  }
  private readonly trafficBudgets=new WeakMap<Entity,{revision:number;x:number;y:number;surface?:string;goal:number;radius:number;height:number;limit:number|null}>();
  /** A safe sub-cell position may round to a center inside the body's obstacle
   * halo. Join a checked neighboring center instead of asking the grid solver
   * to escape an invalid origin. This does not move or snap the actor. */
  private routeOrigin(e:Entity,from:FixedPoint,blocked?:ReadonlySet<number>):number|null {
    const center=this.cell(e);
    if(this.clearSegment(from,fixed(this.point(center)),blocked,e))return center;
    const candidates:{cell:number;point:FixedPoint;distance:number}[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const p={x:e.x+dx,y:e.y+dy,...(e.surface?{surface:e.surface}:{})};
      if(!this.validPoint(p))continue;
      const point=fixed(p);
      candidates.push({cell:this.cell(p),point,distance:lengthCeil(point.x-from.x,point.y-from.y)});
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.cell-b.cell);
    for(const candidate of candidates)
      if(this.clearSegment(from,candidate.point,blocked,e))return candidate.cell;
    return null;
  }
  /** A stationary traffic retry can reuse its terrain-only detour limit. Moving
   * bodies are deliberately excluded: the actual traffic path is searched anew.
   * Position/profile/terrain changes invalidate it; cold restore computes the
   * same number. Keep one scalar record per actor, never a full-world field. */
  private trafficTerrainBudget(e:Entity,destination:Point,from:FixedPoint,goal:number):number|null {
    const body=this.dimensions(e),cacheable=!this.layers&&!this.airborne(e),old=cacheable?this.trafficBudgets.get(e):undefined;
    if(old&&old.revision===this.revision&&old.x===from.x&&old.y===from.y&&old.surface===from.surface&&old.goal===goal&&old.radius===body.radius&&old.height===body.height){
      this.routing.trafficBudgetHits++;return old.limit;
    }
    // Do not derive this from an already diverted route: successive retries
    // could otherwise ratchet the permitted detour around a distant wall end.
    const direct=this.clearSegment(from,fixed(destination),undefined,e);
    const origin=direct?this.cell(e):this.routeOrigin(e,from);
    const searched=origin===null?null:direct?[goal]:this.findPath(origin,goal,undefined,undefined,e);
    const path=searched===null?null:origin!==this.cell(e)?[origin!,...searched]:searched;
    let limit:number|null=null;
    if(path!==null){
      let length=0,anchor=from;
      for(const i of path){const p=fixed(this.point(i));length+=Math.hypot(p.x-anchor.x,p.y-anchor.y);anchor=p;}
      limit=Math.ceil(length*1.25/1000+4)*1000;
    }
    if(cacheable)this.trafficBudgets.set(e,{revision:this.revision,x:from.x,y:from.y,surface:from.surface,goal,radius:body.radius,height:body.height,limit});
    return limit;
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
    this.profile.count(avoidUnits?'Routes avoiding units':'Terrain only routes');
    const goal=this.cell(destination),blocked=this.profile.measure('Route blocker collection',()=>this.routeBlockers(e,avoidUnits));
    this.profile.count('Route blocker cells',blocked.size);
    const from = e.unit.position ?? fixed(e);
    if(avoidUnits&&Number.isFinite(maxCost)){
      const limit=this.trafficTerrainBudget(e,destination,from,goal);
      if(limit===null)return false;
      maxCost=Math.min(maxCost,limit);
    }
    const direct = this.clearSegment(from, fixed(destination), blocked, e);
    this.profile.count(direct?'Direct routes':'Non-direct routes');
    const origin=direct?this.cell(e):this.routeOrigin(e,from,blocked);
    if(origin===null)return false;
    if(!direct&&!this.airborne(e)&&!this.layers&&this.probes?.entity===e&&avoidUnits){
      if(this.probes.pocket===undefined)this.probes.pocket=this.navigationFor(e).reachablePocket(origin,blocked);
      if(this.probes.pocket&&!this.probes.pocket.has(goal))return false;
    }
    const body=this.dimensions(e),corridorKey=this.corridors&&!direct&&!avoidUnits&&maxCost===Infinity&&
      !this.layers&&!this.airborne(e)&&e.unit.order?.type==='move'
      ?`${e.owner}/${body.radius}/${body.height}`:undefined;
    const shared=corridorKey===undefined?null:this.corridors!.find(corridorKey,from,fixed(destination),goal,
      i=>fixed(this.point(i)),(a,b)=>this.clearSegment(a,b,undefined,e));
    if(shared)this.routing.sharedCorridors++;
    const join=origin===this.cell(e)?0:lengthCeil(fixed(this.point(origin)).x-from.x,fixed(this.point(origin)).y-from.y);
    const searched = shared ?? (direct
      ? [goal]
      : join>maxCost?null:this.findPath(origin, goal, blocked, maxCost-join, e));
    if (searched === null){this.profile.count('Route searches failed');return false;}
    const path=shared||origin===this.cell(e)?searched:[origin,...searched];
    this.profile.count('Raw route waypoints',path.length);
    const waypoints: number[] = shared ?? [];
    let anchor = from;
    for (let i = 0; !shared && i < path.length;) {
      if (!this.clearSegment(anchor, fixed(this.point(path[i])), blocked, e)) {
        // A* starts at a cell center, but an interrupted mover may be beside a
        // corner inside that cell. Join the corridor via its checked center
        // instead of rejecting a reachable route or snapping the unit there.
        const center = fixed(this.point(this.cell(e)));
        if (i !== 0 || !this.clearSegment(anchor, center, blocked, e) ||
            !this.clearSegment(center, fixed(this.point(path[i])), blocked, e)) return false;
        waypoints.push(this.cell(e));
        anchor = center;
      }
      // Avoid rescanning almost the same long ray for every grid waypoint.
      // Every shortcut still runs the full terrain/body/portal clearance test.
      const farthest=farthestClearWaypoint(i,path.length-1,index=>
        this.clearSegment(anchor,fixed(this.point(path[index])),blocked,e));
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
    if(corridorKey!==undefined&&!shared)this.corridors!.remember(corridorKey,from,fixed(destination),waypoints);
    e.unit.route = waypoints;
    delete e.unit.detour;
    e.unit.position ??= from;
    e.unit.goal = goal;
    return true;
  }
  /** Local search terrain edges may repeat across actors and retries. Only
   * immutable terrain clearance is reused; live reservations are tested first. */
  clearLocalSegment(from:FixedPoint,to:FixedPoint,blocked:CellReservations,actor:Actor):boolean {
    if(this.layers||this.airborne(actor))return this.clearSegment(from,to,blocked,actor);
    if(!clearRay(from,to,(_a,b)=>!blocked.has(b),this.size))return false;
    const radius=Math.round(this.dimensions(actor).radius*1000);
    let cache=this.localTerrainSweeps.get(radius);
    if(!cache){
      if(this.localTerrainSweeps.size===4)this.localTerrainSweeps.delete(this.localTerrainSweeps.keys().next().value!);
      cache=new LocalTerrainSweeps(this.size,radius,(a,b)=>this.walkable(b)&&Math.abs(this.heights[a]!-this.heights[b]!)<=MAX_GROUND_STEP_CM);
      this.localTerrainSweeps.set(radius,cache);
    }
    return cache.clear(from,to);
  }
  /** Movement distinguishes a broken terrain route from temporary traffic.
   * Once the footprint sweep passed, ordinary terrain needs only the live
   * reservation ray. Layer portals retain their full surface-aware check. */
  movementSegmentBlocker(from:FixedPoint,to:FixedPoint,blocked:ReadonlySet<number>|undefined,actor:Actor):'terrain'|'reservation'|null {
    if(!this.clearSegment(from,to,undefined,actor))return 'terrain';
    if(blocked&&!(this.layers?this.clearSegment(from,to,blocked,actor):clearRay(from,to,(_a,b)=>!blocked.has(b),this.size)))return 'reservation';
    return null;
  }
  clearSegment(
    from: FixedPoint,
    to: FixedPoint,
    blocked?: CellReservations,
    actor?:Actor,
  ) {
    const dimensions=this.dimensions(actor),radius=Math.round(dimensions.radius*1000);
    if(this.airborne(actor))return !from.surface&&!to.surface&&clearSweep(from,to,()=>true,this.size,radius)&&(!blocked||clearRay(from,to,(_a,b)=>!blocked.has(b),this.size));
    if(this.layers){
      return clearLayeredSweep(this.layers,from,to,dimensions.height,radius,id=>this.walkable(id),blocked);
    }
    const terrainStep = (a: number, b: number) =>
      this.walkable(b) && Math.abs(this.heights[a] - this.heights[b]) <= MAX_GROUND_STEP_CM;
    // Traffic often blocks the very first cells of a long shortcut. Reject
    // that center-line reservation before sweeping the entire body corridor.
    // Both predicates are still required; reservations do not replace terrain
    // or corner clearance, and an unreserved route keeps its single sweep.
    return (
      (!blocked ||
        clearRay(
          from,
          to,
          (a, b) => terrainStep(a, b) && !blocked.has(b),
          this.size,
        )) &&
      clearSweep(from, to, terrainStep, this.size, radius)
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
  unitSegmentClear(from: FixedPoint, to: FixedPoint, except: number, blockers?: number[],actor?:Actor,knownUnit?:(e:Entity)=>boolean): boolean {
    const initialCount=blockers?.length ?? 0;
    const mover = this.unitIndex?.entities.get(except) ?? this.units().find(e => e.id === except);
    if (mover && this.ignoresUnits(mover)) return true;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      square = dx * dx + dy * dy;
    const body=this.dimensions(actor??mover),radius=Math.round(body.radius*1000),diameter=radius+this.maxUnitRadius;
    const candidates=this.unitIndex?.within(Math.min(from.x,to.x)-diameter,Math.min(from.y,to.y)-diameter,Math.max(from.x,to.x)+diameter,Math.max(from.y,to.y)+diameter) ?? this.units();
    for (const unit of candidates) {
      if (
        unit.id === except ||
        !unit.unit ||
        !alive(unit) ||
        unit.unit.contained ||
        unit.unit.release
        || this.ignoresUnits(unit) || !this.sameLocomotion(unit,actor??mover)
      )
        continue;
      const other=this.dimensions(unit),separation=radius+Math.round(other.radius*1000);
      if(this.layers){const floor=this.height({x:from.x/1000,y:from.y/1000,surface:from.surface}),otherFloor=this.height(precise(unit));if(floor>=otherFloor+other.height||otherFloor>=floor+body.height)continue;}
      const p = unit.unit.position ?? fixed(unit);
      if (
        p.x < Math.min(from.x, to.x) - diameter ||
        p.x > Math.max(from.x, to.x) + diameter ||
        p.y < Math.min(from.y, to.y) - diameter ||
        p.y > Math.max(from.y, to.y) + diameter
      )
        continue;
      if (bodyBlocksSegment(from,dx,dy,square,p.x,p.y,separation**2)) {
        if(knownUnit&&!knownUnit(unit))continue;
        if (!blockers) return false;
        blockers.push(unit.id);
      }
    }
    return (blockers?.length ?? 0) === initialCount;
  }
  /** Snapshot only the nearby bodies for one synchronous local search. The
   * callback must not mutate actors. No snapshot survives a movement decision.
   * Bounds are a fixed-point square; outside probes retain the live query. */
  withLocalUnitClearance<T>(origin:FixedPoint,extent:number,except:number,query:(clear:(from:FixedPoint,to:FixedPoint)=>boolean)=>T):T {
    const mover=this.unitIndex?.entities.get(except)??this.units().find(e=>e.id===except);
    if(mover&&this.ignoresUnits(mover))return query(()=>true);
    const body=this.dimensions(mover),radius=Math.round(body.radius*1000),diameter=radius+this.maxUnitRadius;
    const minX=origin.x-extent,maxX=origin.x+extent,minY=origin.y-extent,maxY=origin.y+extent;
    const candidates=this.unitIndex?.within(minX-diameter,minY-diameter,maxX+diameter,maxY+diameter)??this.units();
    const airborne=this.airborne(mover),bodies:{x:number;y:number;separation:number;floor:number;height:number}[]=[];
    for(const unit of candidates){
      if(unit.id===except||!unit.unit||!alive(unit)||unit.unit.contained||unit.unit.release||this.ignoresUnits(unit)||this.airborne(unit)!==airborne)continue;
      const p=unit.unit.position??fixed(unit);
      if(p.x<minX-diameter||p.x>maxX+diameter||p.y<minY-diameter||p.y>maxY+diameter)continue;
      const other=this.dimensions(unit);
      bodies.push({x:p.x,y:p.y,separation:(radius+Math.round(other.radius*1000))**2,floor:this.layers?this.height(precise(unit)):0,height:other.height});
    }
    return query((from,to)=>{
      if(from.x<minX||from.x>maxX||from.y<minY||from.y>maxY||to.x<minX||to.x>maxX||to.y<minY||to.y>maxY)return this.unitSegmentClear(from,to,except);
      const dx=to.x-from.x,dy=to.y-from.y,square=dx*dx+dy*dy;
      const floor=this.layers?this.height({x:from.x/1000,y:from.y/1000,surface:from.surface}):0;
      for(const b of bodies){
        if(this.layers&&(floor>=b.floor+b.height||b.floor>=floor+body.height))continue;
        if(b.x<Math.min(from.x,to.x)-diameter||b.x>Math.max(from.x,to.x)+diameter||b.y<Math.min(from.y,to.y)-diameter||b.y>Math.max(from.y,to.y)+diameter)continue;
        if(bodyBlocksSegment(from,dx,dy,square,b.x,b.y,b.separation))return false;
      }
      return true;
    });
  }
  range(a: Entity, b: Entity) { return this.pointRange(precise(a), b); }
  /** Weapon ranges are free space between collision bodies, in world units.
   * Spell ranges, sight and harvesting retain their own point-distance rules. */
  bodyRange(a:Entity,b:Entity,from:Point=precise(a)) {
    const gap=Math.max(0,Math.sqrt(this.pointRange(from,b))-this.dimensions(a).radius-(b.unit?this.dimensions(b).radius:0));
    return gap*gap;
  }
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
