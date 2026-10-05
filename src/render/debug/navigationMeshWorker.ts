/** Opt-in debug work only. No game-state mutation, rendering, or simulation timing. */
import {GroundMeshBuilder} from '../../shared/navigation/groundMesh';
import {convexPolygons} from '../../shared/navigation/groundMeshPolygons';
import type {GroundMeshTile} from '../../shared/navigation/groundMesh';
import type {NavigationMeshSnapshot} from '../../sim/game/navigationDebug';
export type MeshReply={revision:number;radius:number;decks:number;triangles:number;polygons:number;buildMs:number;rebuiltTiles:number;edges:Float32Array;error?:string};
const builder=new GroundMeshBuilder();
const tilePolygons=new WeakMap<GroundMeshTile,ReturnType<typeof convexPolygons>>();
const port=self as unknown as {onmessage:((e:MessageEvent<NavigationMeshSnapshot>)=>void)|null;postMessage(value:MeshReply,transfer?:Transferable[]):void};
port.onmessage=({data})=>{
 try{
  const start=performance.now(),mesh=builder.build(data),edges:number[]=[],seen=new Set<string>();let polygons=0;
  for(const tile of mesh.tiles){
   let regions=tilePolygons.get(tile);if(!regions){regions=convexPolygons(tile);tilePolygons.set(tile,regions);}polygons+=regions.length;
   for(const points of regions)for(let j=0;j<points.length;j++){
   const a=points[j]!,b=points[(j+1)%points.length]!,ax=a.x,az=a.z,bx=b.x,bz=b.z;
   const ka=`${ax}/${az}`,kb=`${bx}/${bz}`,key=ka<kb?`${ka}:${kb}`:`${kb}:${ka}`;
   if(seen.has(key))continue;seen.add(key);
   // Short segments follow terrain instead of cutting through hills.
   const steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/2));
   for(let s=0;s<steps;s++)edges.push(ax+(bx-ax)*s/steps,az+(bz-az)*s/steps,ax+(bx-ax)*(s+1)/steps,az+(bz-az)*(s+1)/steps);
  }}
  const out=new Float32Array(edges);
  port.postMessage({revision:data.revision,radius:data.radius,decks:data.decks,triangles:mesh.triangles,polygons,buildMs:performance.now()-start,rebuiltTiles:mesh.rebuiltTiles,edges:out},[out.buffer]);
 }catch(error){port.postMessage({revision:data.revision,radius:data.radius,decks:data.decks,triangles:0,polygons:0,buildMs:0,rebuiltTiles:0,edges:new Float32Array(),error:String(error)});}
};
