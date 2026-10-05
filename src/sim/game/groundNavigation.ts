import {GroundMeshBuilder,GROUND_MESH_TILE_SIZE,type GroundMeshInput} from '../../shared/navigation/groundMesh';
import {GroundMeshQuery} from '../../shared/navigation/groundMeshQuery';
import {SimulationProfiler} from '../profiling';

/** Derived per-body navigation; never serialized or checksummed. Collision input
 * is shared between profiles. Local edits invalidate only the footprint halo. */
export class GroundNavigation {
 readonly query:GroundMeshQuery;
 private dirty=new Set<number>();
 private dirtyCells=new Set<number>();
 private readonly builder=new GroundMeshBuilder();
 readonly diagnostics={rebuiltTiles:0,builds:1};
 constructor(private readonly input:GroundMeshInput,private readonly profile=new SimulationProfiler()){
  const data=this.builder.build(input);
  // The more aggressive prototype bias produced unequal starting routes and
  // camp pulls. Retain a modest bias, with map-level route-quality checks.
  // This weight is not a bound on final funnel-path stretch.
  this.query=new GroundMeshQuery(data,1.2);
  this.diagnostics.rebuiltTiles=data.rebuiltTiles;
 }
 invalidate(cells:readonly number[]){
  const {size,radius}=this.input,width=Math.ceil(size/GROUND_MESH_TILE_SIZE),halo=Math.ceil(radius)+1;
  for(const cell of cells){
   this.dirtyCells.add(cell);
   const x=cell%size,z=Math.floor(cell/size);
   for(let tz=Math.max(0,Math.floor((z-halo)/GROUND_MESH_TILE_SIZE));tz<=Math.min(width-1,Math.floor((z+halo)/GROUND_MESH_TILE_SIZE));tz++)
    for(let tx=Math.max(0,Math.floor((x-halo)/GROUND_MESH_TILE_SIZE));tx<=Math.min(width-1,Math.floor((x+halo)/GROUND_MESH_TILE_SIZE));tx++)this.dirty.add(tz*width+tx);
  }
 }
 prepare(){
  if(!this.dirty.size)return;
  const ids=[...this.dirty].sort((a,b)=>a-b);
  const data=this.profile.measure('Collision contours',()=>this.builder.build(this.input,ids,[...this.dirtyCells]));
  // A conservative footprint halo can touch tiles whose usable area did not
  // change. Keep their geometry and graph links, not merely their cell input.
  if(data.rebuiltTiles){
   const changed=new Set(data.rebuiltTileIds),width=Math.ceil(this.input.size/GROUND_MESH_TILE_SIZE);
   this.profile.measure('Polygon links and connectivity',()=>this.query.update(data.tiles.filter(t=>changed.has(t.z*width+t.x)),data.rebuiltTileIds));
  }
  this.diagnostics.rebuiltTiles+=data.rebuiltTiles;this.diagnostics.builds++;this.dirty.clear();this.dirtyCells.clear();
 }
 destroy(){this.query.destroy();}
}
