import {MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';
import {GROUND_MESH_CLEARANCE_PADDING} from '../../shared/navigation/groundMesh';
import type {WalkSurfaces} from '../../shared/map/walkSurfaces';
import {adjacentSweep} from '../game/adjacentSweep';
import {GroundNavigation} from '../game/groundNavigation';
import {TerrainClearance} from '../game/terrainClearance';
import {clearLayeredSweep} from '../game/layeredSweep';
import {clearSweep,fixed,type FixedPoint} from '../game/motion';
import {Navigation} from '../game/navigation';
import {snappedMeshGridPath} from '../game/meshGridPath';
import {SectorNavigation} from '../game/sectorNavigation';
import type {Point} from '../game/state';
import {SimulationProfiler} from '../profiling';
import type {MapBriefing} from './briefing';

export type ObservedMover=Point & {radius:number;height:number;air:boolean};
type Profile={radius:number;grid:Navigation;mesh?:GroundNavigation;pockets:Map<number,ReadonlySet<number>>;answers:Map<string,boolean>;clear:(a:FixedPoint,b:FixedPoint)=>boolean;step:(a:number,b:number)=>boolean};
const empty=new Set<number>();
/** Per-controller derived navigation. Only authorized geography and observed
 * static blockers enter it; moving units remain the simulation's responsibility.
 * Reuse the engine's sweeps, mesh and exact grid fallback instead of a second
 * approximation of body clearance. Nothing here is serialized or authoritative. */
export class ObservedNavigation {
 private blocked:ReadonlySet<number>=empty;
 private readonly walkable:Uint8Array;
 private readonly heights:Int16Array;
 private readonly clearance?:TerrainClearance;
 private readonly sectors:SectorNavigation;
 private readonly profiles=new Map<string,Profile>();
 constructor(private readonly map:MapBriefing,private readonly layers:WalkSurfaces|undefined,private readonly profile=new SimulationProfiler()){
  this.fits=this.profile.wrap('Destination body clearance',this.fits.bind(this));
  this.reachable=this.profile.wrap('Destination reachability',this.reachable.bind(this));
  this.update=this.profile.wrap('Known navigation update',this.update.bind(this));
  this.walkable=Uint8Array.from(map.land);this.heights=Int16Array.from(map.heights);
  if(!layers)this.clearance=new TerrainClearance(map.size,this.heights,id=>!!this.walkable[id]);
  this.sectors=new SectorNavigation(map.size,id=>!!this.walkable[id],(a,b)=>!!this.walkable[b]&&Math.abs(this.heights[a]!-this.heights[b]!)<=MAX_GROUND_STEP_CM,undefined,profile);
 }
 /** Optional changed-cell candidates belong to a particular previous immutable
  * snapshot. A stale/missing baseline falls back to full reconciliation. */
 update(blocked:ReadonlySet<number>,delta?:{previous:ReadonlySet<number>;cells:ReadonlySet<number>}){
  if(blocked===this.blocked)return;
  const changed=this.profile.measure('Blocker cell differences',()=>{
   const changed:number[]=[];
   if(delta?.previous===this.blocked){
    this.profile.count('Blocker cells compared',delta.cells.size);
    for(const cell of delta.cells)if(blocked.has(cell)!==this.blocked.has(cell))changed.push(cell);
   }else{
    this.profile.count('Blocker cells compared',blocked.size+this.blocked.size);
    for(const cell of blocked)if(!this.blocked.has(cell))changed.push(cell);
    for(const cell of this.blocked)if(!blocked.has(cell))changed.push(cell);
   }
   return changed;
  });
  this.profile.count('Previous blocked cells',this.blocked.size);
  this.profile.count('Current blocked cells',blocked.size);
  this.profile.count('Changed blocked cells',changed.length);
  this.blocked=blocked;
  if(!changed.length)return;
  for(const cell of changed)if(cell<this.walkable.length)this.walkable[cell]=+(!!this.map.land[cell]&&!blocked.has(cell));
  this.clearance?.invalidate(changed);
  this.sectors.invalidate(changed);
  for(const p of this.profiles.values()){
   p.grid.invalidate(changed,Math.ceil(p.radius)+1);p.mesh?.invalidate(changed);p.pockets.clear();p.answers.clear();
  }
 }
 private body(m:ObservedMover):Profile {
  const key=`${m.radius}/${this.layers?m.height:0}/${m.air}`,old=this.profiles.get(key);if(old)return old;
  const {size,heights}=this.map,radius=Math.round(m.radius*1000);
  const ground=(a:number,b:number)=>!!this.walkable[b]&&Math.abs(heights[a]!-heights[b]!)<=MAX_GROUND_STEP_CM;
  const groundClear=(a:FixedPoint,b:FixedPoint)=>{
   // Wide bodies repeat many footprint rays even on short funnel segments.
   // The same conservative bitplane proof applies there and at endpoints;
   // inconclusive spans still use the exact sweep. Tiny bodies retain their
   // cheaper short-ray path.
   if(radius>=500||Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))>=16000){
    const clear=this.clearance!.provesClear(a,b,radius);
    this.profile.count(clear?'Observed sweeps certified clear':'Observed sweeps requiring exact rays');
    if(clear)return true;
   }
   return clearSweep(a,b,ground,size,radius);
  };
  const clear=(a:FixedPoint,b:FixedPoint)=>m.air? !a.surface&&!b.surface&&clearSweep(a,b,()=>true,size,radius)
   :this.layers?clearLayeredSweep(this.layers,a,b,m.height,radius,id=>this.layers!.walkable(id)&&!this.blocked.has(id))
   :groundClear(a,b);
  const point=(id:number)=>fixed({x:id%size,y:Math.floor(id/size)});
  const step=this.layers&&!m.air?(a:number,b:number)=>clear(point(a),point(b)):adjacentSweep(size,radius,m.air?()=>true:ground);
  const p:Profile={radius:m.radius,clear,step,pockets:new Map(),answers:new Map(),grid:new Navigation(size,step,undefined,true,this.profile)};
  this.profiles.set(key,p);return p;
 }
 prepare(movers:readonly ObservedMover[]){
  this.sectors.prepare();
  if(!this.layers)for(const mover of movers)if(!mover.air){const p=this.body(mover);
   p.mesh??=new GroundNavigation({size:this.map.size,radius:mover.radius,walkable:this.walkable,heights:this.heights},this.profile);p.mesh.prepare();
  }
 }
 fits(p:Point,m:ObservedMover){return this.body(m).clear(fixed(p),fixed(p));}
 /** Conservative positive proof against this controller's known terrain only.
  * False is inconclusive; callers retain their exact sweep for dynamic overlays. */
 provesGroundSweep(from:FixedPoint,to:FixedPoint,radius:number):boolean {
  return this.clearance?.provesClear(from,to,radius)??false;
 }
 reachable(from:ObservedMover,to:Point):boolean {
  const p=this.body(from),key=`${from.x}/${from.y}/${from.surface??''}/${to.x}/${to.y}/${to.surface??''}`;
  const cached=p.answers.get(key);if(cached!==undefined){this.profile.count('Cached answers');return cached;}
  this.profile.count('Reachability searches');
  const result=this.findReachable(from,to,p);
  if(p.answers.size>=1024)p.answers.clear();p.answers.set(key,result);return result;
 }
 private findReachable(from:ObservedMover,to:Point,p:Profile):boolean {
  const a=fixed(from),b=fixed(to);
  if(!this.profile.measure('Destination footprint',()=>p.clear(b,b)))return false;
  if(this.profile.measure('Direct sweep',()=>p.clear(a,b)))return true;
  if(from.air)return false; // Only bounds can block an airborne straight route.
  if(this.layers){
   const origin={x:Math.round(from.x),y:Math.round(from.y),...(from.surface?{surface:from.surface}:{})};
   if(!p.clear(a,fixed(origin)))return false;
   return this.layers.path(origin,to,n=>this.blocked.has(n.id)||!this.layers!.walkable(n.id,Math.round(from.height*100)),Infinity,
    (x,y)=>p.clear(fixed(this.layers!.nodes[x]!),fixed(this.layers!.nodes[y]!)))!==null;
  }
  const {size}=this.map,goal=to.y*size+to.x;
  // A legal fractional position can round into the halo of an obstacle.
  const joins=[{x:Math.round(from.x),y:Math.round(from.y)}];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)joins.push({x:joins[0]!.x+dx,y:joins[0]!.y+dy});
  const origin=this.profile.measure('Origin grid join',()=>joins.find(q=>p.clear(a,fixed(q))));if(!origin)return false;
  const start=origin.y*size+origin.x,pocket=p.pockets.get(goal);
  if((pocket&&!pocket.has(start))||p.grid.knownUnreachable(start,goal))return false;
  this.profile.measure('Observed mesh preparation',()=>{
   p.mesh??=new GroundNavigation({size,radius:from.radius,walkable:this.walkable,heights:this.heights},this.profile);
   p.mesh.prepare();
  });
  const coarse=this.profile.measure('Mesh corridor',()=>p.mesh!.query.computePathWithEndpointPadding(
   {x:origin.x,z:origin.y},{x:to.x,z:to.y},GROUND_MESH_CLEARANCE_PADDING/1000));
  if(coarse.success){
   const valid=this.profile.measure('Corridor body validation',()=>{
    let anchor=fixed(origin);
    for(const point of coarse.path.slice(1)){
     const next=fixed({x:point.x,y:point.z});
     if(this.profile.enabled){
      this.profile.count('Segments checked');
      this.profile.count('Segment distance cells',Math.max(Math.abs(next.x-anchor.x),Math.abs(next.y-anchor.y))/1000);
     }
     if(!p.clear(anchor,next)){this.profile.count('Segments rejected');return false;}anchor=next;
    }
    return true;
   });
   if(valid){this.profile.count('Mesh reachability accepted');return true;}
   this.profile.count('Mesh reachability sweep rejected');
   const repaired=this.profile.measure('Mesh grid repair',()=>snappedMeshGridPath(
    coarse.path.map(point=>fixed({x:point.x,y:point.z})),p.step,size,this.profile));
   if(repaired!==null){this.profile.count('Mesh reachability repaired');return true;}
  }
  else this.profile.count('Mesh reachability missing corridor');
  const corridor=this.sectors.corridor(start,goal);if(corridor===null)return false;
  let route=p.grid.path(start,goal,undefined,Infinity,corridor,1000,512);
  this.profile.count('Grid fallback searches');this.profile.count('Grid fallback nodes',p.grid.lastExpanded);
  if(route===null&&!p.grid.lastDestinationPocket){
   route=p.grid.path(start,goal,undefined,Infinity,undefined,1000,512,true);
   this.profile.count('Grid fallback searches');this.profile.count('Grid fallback nodes',p.grid.lastExpanded);
  }
  if(route===null&&p.grid.lastDestinationPocket){
   if(p.pockets.size>4096)p.pockets.clear();
   for(const id of p.grid.lastDestinationPocket)p.pockets.set(id,p.grid.lastDestinationPocket);
  }
  return route!==null;
 }
}
