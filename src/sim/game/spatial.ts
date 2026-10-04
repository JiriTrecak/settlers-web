import {SimulationProfiler} from '../profiling';
import {formDefinition} from '../abilities/forms';
import {farthestClearWaypoint} from './routeSmoothing';
import {adjacentSweep} from './adjacentSweep';
import {RouteCorridors} from './routeCorridors';
import {locomotion,flightHeight} from './locomotion';
import {sourceHeight} from '../../shared/map/importedTerrain';
import {sourceWater} from '../../shared/map/importedWater';
import {projectScene} from '../../shared/authoring/project';
import {SectorNavigation} from './sectorNavigation';
import {WalkSurfaces} from '../../shared/map/walkSurfaces';
import {TacticalTerrain,MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';
import {UnitIndex} from "./unitIndex";
import {unitDimensions} from '../../content/unitScale';
import {bridgeSurfaces,applyBridgeSurfaces} from '../../shared/map/bridgeSurface';
import {applySceneryBlockers} from '../../shared/map/sceneryCollision';
import {resourceCollisionCells} from '../../shared/map/resourceClearance';
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
let spatialRevisions = 0;
type Body = {radius:number;height:number;formationSpacing:number;locomotion?:'ground'|'air'};
type Actor = Pick<Entity,'definition'> & Partial<Pick<Entity,'spellStatuses'|'unit'>>|Body;
type OccupancyInput = {id:number;definition:string;x:number;y:number;rotation:number;surface?:string;scale:number;building:boolean;resource:boolean};
export class Spatial {
  airborne(actor?:Actor){return !!actor&&('definition' in actor?locomotion(formDefinition(this.registry.get(actor.definition),actor,this.registry))==='air':actor.locomotion==='air');}
  sameLocomotion(a?:Actor,b?:Actor){return this.airborne(a)===this.airborne(b);}
  /** Air units clear every physical floor; this height never changes horizontal navigation cells. */
  airFloor(p:Point){const x=Math.max(0,Math.min(this.size-1,Math.round(p.x))),y=Math.max(0,Math.min(this.size-1,Math.round(p.y))),i=y*this.size+x;
   return Math.max(this.heights[i]!/100,this.waterHeights[i]!/100,...(this.layers?.at(x,y).map(n=>this.layers!.nodes[n]!.height/100)??[]));}
  elevation(e:Pick<Entity,'definition'|'x'|'y'|'surface'> & Partial<Pick<Entity,'spellStatuses'|'unit'>>){return this.airborne(e)?this.airFloor(e)-this.height(e)+flightHeight(formDefinition(this.registry.get(e.definition),e,this.registry)):0;}
  elevatedPoint(e:Entity){const p=precise(e),elevation=this.elevation({...e,...p})+(e.unit?.garrison?.height??0);return elevation?{...p,elevation}:p;}
  private airNavigation:Navigation|undefined;

  dimensions(actor?:Actor):Body {return actor&&'definition' in actor ? this.registry.get(actor.definition).dimensions??unitDimensions(this.registry.rules.unitScale) : actor??unitDimensions(this.registry.rules.unitScale);}
  private readonly bodyNavigations=new Map<string,Navigation>();
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
  private unitIndex:UnitIndex|null=null;
  /** Scoped to one synchronous planning or movement pass; other queries use live entities. */
  beginUnitMovement(){this.unitIndex=new UnitIndex(this.units(),this.size,this.ignoresUnits);}
  updateUnitMovement(e:Entity){this.unitIndex?.update(e);}
  endUnitMovement(){this.unitIndex=null;}

  readonly layers: WalkSurfaces | undefined;
  readonly size: number;
  /** Collision radius in fixed-point units, shared by broad/narrow phase and terrain sweeps. */
  readonly unitRadius: number;
  readonly unitHeight: number;
  readonly heights: Int16Array;
  readonly terrain: Uint8Array;
  readonly sea: number;
  readonly waterHeights:Int16Array;
  readonly decks: Uint8Array;
  readonly occupied: Int32Array;
  readonly resources: Int32Array;
  readonly navigation: Navigation;
  readonly sectors: SectorNavigation;
  readonly routing={searches:0,expanded:0,coarseExpanded:0,fallbacks:0,sharedCorridors:0};
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
    const dimensions = unitDimensions(registry.rules.unitScale);
    this.unitRadius = Math.round(dimensions.radius * 1000);
    this.unitHeight = dimensions.height;
    this.maxUnitRadius=Math.round(Math.max(dimensions.radius,...registry.definitions.filter(d=>d.kind==='unit').map(d=>d.dimensions!.radius))*1000);
    const compiled=projectScene(map);if(compiled)map={...map,stamps:compiled.stamps};
    this.heights = new Int16Array(this.size * this.size);
    this.waterHeights=new Int16Array(this.size*this.size);
    this.terrain = new Uint8Array(this.size * this.size);
    const verts = this.size + 33;
    const h = map.height ? decodeHeight(map.height, this.size) : null,
      sea = Math.round((map.waterLevel ?? 0) * 100);
    this.sea = sea;
    const imported=map.landscape?.importedTerrain,source=compiled?{sample:(x:number,z:number)=>compiled.field.sample(x,z)}:imported?sourceHeight(imported):undefined,water=compiled?{sample:(x:number,z:number)=>compiled.field.waterAt(x,z)}:imported?sourceWater(imported):undefined;
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        const i = y * this.size + x;
        this.heights[i] = Math.round(
          (source?.sample(x,y)??h?.[(y - HEIGHT_ORIGIN) * verts + x - HEIGHT_ORIGIN] ?? 0) * 100,
        );
        this.waterHeights[i]=water?Math.round(water.sample(x,y)*100):sea;
        this.terrain[i] = this.heights[i] >= this.waterHeights[i]! - WADING_DEPTH_CM ? 1 : 0;
      }
    if(imported)for(let z=0;z<this.size;z++)for(let x=0;x<this.size;x++)if(x<imported.origin[0]||z<imported.origin[1]||x>=imported.origin[0]+imported.blocks[0]*16||z>=imported.origin[1]+imported.blocks[1]*16)this.terrain[z*this.size+x]=0;
    const surfaces=bridgeSurfaces(map.stamps,(x,z)=>source?.sample(x,z)??(h?sampleHeight(h,x,z,this.size):0));
    if(surfaces.length){
      applySceneryBlockers(map,this.terrain);
      this.layers=new WalkSurfaces(this.size,this.heights,this.terrain,surfaces,Math.round(Math.min(this.unitHeight,...registry.definitions.filter(d=>d.kind==='unit').map(d=>d.dimensions!.height))*100));
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
  findPath(start:number,goal:number,blocked?:ReadonlySet<number>,maxCost=Infinity,actor?:Actor):number[]|null {
    if(!this.validNode(start)||!this.validNode(goal))return null;
    if(!this.unitWalkable(this.point(goal),actor))return null;
    if(this.airborne(actor)){if(start>=this.size*this.size||goal>=this.size*this.size)return null;this.airNavigation??=new Navigation(this.size,()=>true,()=>true,true,this.profile);return this.airNavigation.path(start,goal,blocked,maxCost);}
    const navigation=this.navigationFor(actor);
    if(!this.layers){
      const dx=Math.abs(start%this.size-goal%this.size),dy=Math.abs(Math.floor(start/this.size)-Math.floor(goal/this.size));
      const corridor=Math.max(dx,dy)>=32?this.sectors.corridor(start,goal):undefined;
      this.routing.coarseExpanded+=corridor?this.sectors.diagnostics.expandedRegions:0;
      if(corridor===null)return null;
      this.routing.searches++;
      const route=navigation.path(start,goal,blocked,maxCost,corridor);
      this.routing.expanded+=navigation.lastExpanded;
      if(route!==null||!corridor)return route;
      // Temporary traffic may block every portal on the preferred corridor.
      // Preserve reachability with a full search instead of reporting failure.
      this.routing.fallbacks++;this.routing.searches++;
      const fallback=navigation.path(start,goal,blocked,maxCost);
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
    const f = this.registry.get(e.definition).footprint,
      swap = Math.round(e.rotation / 90) % 2 !== 0,
      hw = f ? Math.floor((swap ? f.depth : f.width) / 2) : 0,
      hh = f ? Math.floor((swap ? f.width : f.depth) / 2) : 0;
    const x0 = e.x - hw - ring, x1 = e.x + hw + ring, y0 = e.y - hh - ring, y1 = e.y + hh + ring, out: Point[] = [];
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
  }
  private invalidateOccupancy(changed:readonly number[]){
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
  free(p: Point, except?: number,actor?:Actor) {
    const mover = except == null ? undefined : this.unitIndex?.entities.get(except) ?? this.units().find(e => e.id === except);
    return (
      p.x >= 0 &&
      p.x < this.size &&
      p.y >= 0 &&
      p.y < this.size &&
      this.unitWalkable(p,actor??mover) &&
      this.unitSegmentClear(fixed(p), fixed(p), except ?? -1,undefined,actor) &&
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
            (!!e.unit.detour?.yielding && e.unit.detour.waypoint===this.cell(p))),
      ))
    );
  }
  nearest(origin: Point, max = 12, except?: number,actor?:Actor,accept?:(p:Point)=>boolean): Point | null {
    for (let r = 0; r <= max; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.abs(dx) + Math.abs(dy) === r) {
            const p = { x: origin.x + dx, y: origin.y + dy, ...(origin.surface?{surface:origin.surface}:{}) };
            if (this.free(p, except,actor)&&(!accept||accept(p))) return p;
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
      const terrainPath=this.clearSegment(from,fixed(destination), undefined, e)?[goal]:this.findPath(this.cell(e),goal, undefined, undefined, e);
      if(terrainPath===null)return false;
      let length=0,anchor=from;
      for(const i of terrainPath){const p=fixed(this.point(i));length+=Math.hypot(p.x-anchor.x,p.y-anchor.y);anchor=p;}
      maxCost=Math.min(maxCost,Math.ceil(length*1.25/1000+4)*1000);
    }
    const direct = this.clearSegment(from, fixed(destination), blocked, e);
    if(!direct&&!this.airborne(e)&&!this.layers&&this.probes?.entity===e&&avoidUnits){
      if(this.probes.pocket===undefined)this.probes.pocket=this.navigationFor(e).reachablePocket(this.cell(e),blocked);
      if(this.probes.pocket&&!this.probes.pocket.has(goal))return false;
    }
    // Every A* route starts at one of the eight neighboring cell centers.
    // If an interrupted sub-cell position cannot join any of those (or its own
    // center), all resulting routes would be rejected by the smoothing loop.
    // Prove that once up front instead of searching hundreds of tree targets.
    if (!direct && !this.clearSegment(from, fixed(e), blocked, e)) {
      let exit = false;
      for (let dy = -1; dy <= 1 && !exit; dy++)
        for (let dx = -1; dx <= 1 && !exit; dx++) {
          if (!dx && !dy) continue;
          const x = e.x + dx, y = e.y + dy;
          if (x >= 0 && y >= 0 && x < this.size && y < this.size &&
              this.clearSegment(from, fixed({x,y,...(e.surface?{surface:e.surface}:{})}), blocked, e)) exit = true;
        }
      if (!exit) return false;
    }
    const body=this.dimensions(e),corridorKey=this.corridors&&!direct&&!avoidUnits&&maxCost===Infinity&&
      !this.layers&&!this.airborne(e)&&e.unit.order?.type==='move'
      ?`${e.owner}/${body.radius}/${body.height}`:undefined;
    const shared=corridorKey===undefined?null:this.corridors!.find(corridorKey,from,fixed(destination),goal,
      i=>fixed(this.point(i)),(a,b)=>this.clearSegment(a,b,undefined,e));
    if(shared)this.routing.sharedCorridors++;
    const path = shared ?? (direct
      ? [goal]
      : this.findPath(this.cell(e), goal, blocked, maxCost, e));
    if (path === null) return false;
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
  clearSegment(
    from: FixedPoint,
    to: FixedPoint,
    blocked?: ReadonlySet<number>,
    actor?:Actor,
  ) {
    const dimensions=this.dimensions(actor),radius=Math.round(dimensions.radius*1000);
    if(this.airborne(actor))return !from.surface&&!to.surface&&clearSweep(from,to,()=>true,this.size,radius)&&(!blocked||clearRay(from,to,(_a,b)=>!blocked.has(b),this.size));
    if(this.layers){
      const graph=this.layers;
      const layerPoint=(p:FixedPoint)=>({x:Math.floor((p.x+500)/1000),y:Math.floor((p.y+500)/1000),...(p.surface?{surface:p.surface}:{})});
      const start=graph.node(layerPoint(from)),goal=graph.node(layerPoint(to));
      if(start===undefined||goal===undefined)return false;
      const blockedNode=(n:import('../../shared/map/walkSurfaces').SurfaceNode)=>!this.walkable(n.id)||!graph.walkable(n.id,Math.round(dimensions.height*100))||!!blocked?.has(n.id);
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
          if(id!==undefined&&this.walkable(id)&&graph.walkable(id,Math.round(dimensions.height*100))&&!result.includes(id))result.push(id);
        if(!result.length){
          for(const id of graph.at(cell%this.size,Math.floor(cell/this.size)))
            if((graph.step(start,id)||graph.step(goal,id))&&this.walkable(id))result.push(id);
        }
        return result;
      };
      return clearSweep(from,to,(a,b)=>candidates(a).some(na=>candidates(b).some(nb=>graph.step(na,nb,blockedNode))),this.size,radius);

    }
    const terrainStep = (a: number, b: number) =>
      this.walkable(b) && Math.abs(this.heights[a] - this.heights[b]) <= MAX_GROUND_STEP_CM;
    return (
      clearSweep(from, to, terrainStep, this.size, radius) &&
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
  unitSegmentClear(from: FixedPoint, to: FixedPoint, except: number, blockers?: number[],actor?:Actor): boolean {
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
      // Bodies that already interpenetrate (spawn, release, a ghost worker turning solid)
      // may always move apart. Only motion toward the other centre is blocked; otherwise
      // both would be frozen forever because every segment starts inside the separation.
      const sx = p.x - from.x, sy = p.y - from.y;
      if (square && sx * sx + sy * sy < separation ** 2 && sx * dx + sy * dy <= 0) continue;
      const t = square
        ? Math.max(
            0,
            Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / square),
          )
        : 0;
      if (
        (p.x - from.x - t * dx) ** 2 + (p.y - from.y - t * dy) ** 2 <
        separation ** 2
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
