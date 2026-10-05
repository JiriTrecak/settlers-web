/** Weighted ground corridor search. Authoritative movement validates the result.
 * A small detour is acceptable to avoid exploring distant alternatives. The weight
 * is NOT a proven bound on final path stretch (arrival costs use portal midpoints).
 * Funnel paths tighten the selected corridor before authoritative sweep validation. */
import {GROUND_MESH_TILE_SIZE,type GroundMeshData,type GroundMeshTile} from './groundMesh';
import {convexPolygons,type GroundMeshPoint as P} from './groundMeshPolygons';
type Portal={to:Polygon;a:P;b:P;midpoint:P};
type Region={component:number;links:Set<Region>};
type Polygon={id:number;tile:number;points:P[];portals:Portal[];region?:Region;seen:number;closed:number;cost:number;previous?:Polygon;previousPortal?:Portal};
type Edge={node:Polygon;a:P;b:P};
/** Reusable frontier preserves the f/polygon-ID order without allocating one
 * entry object per discovered portal. Consumed slots release geometry refs. */
class MeshFrontier {
 private nodes:(Polygon|undefined)[]=new Array(256);
 private points:(P|undefined)[]=new Array(256);
 private scores=new Float64Array(256);
 private costs=new Float64Array(256);
 length=0;
 node:Polygon|undefined;
 point:P|undefined;
 cost=0;
 reset(){
  this.nodes.fill(undefined,0,this.length);this.points.fill(undefined,0,this.length);
  this.length=0;this.node=undefined;this.point=undefined;this.cost=0;
 }
 private less(score:number,id:number,index:number){return score<this.scores[index]! || score===this.scores[index]&&id<this.nodes[index]!.id;}
 push(node:Polygon,cost:number,score:number,point:P){
  if(this.length===this.scores.length){
   const n=this.length*2,scores=new Float64Array(n),costs=new Float64Array(n);
   scores.set(this.scores);costs.set(this.costs);this.scores=scores;this.costs=costs;
   this.nodes.length=n;this.points.length=n;
  }
  let i=this.length++;
  while(i){const parent=(i-1)>>1;if(!this.less(score,node.id,parent))break;
   this.nodes[i]=this.nodes[parent];this.points[i]=this.points[parent];this.scores[i]=this.scores[parent]!;this.costs[i]=this.costs[parent]!;i=parent;
  }
  this.nodes[i]=node;this.points[i]=point;this.scores[i]=score;this.costs[i]=cost;
 }
 pop():this {
  this.node=this.nodes[0]!;this.point=this.points[0]!;this.cost=this.costs[0]!;
  const end=--this.length,node=this.nodes[end]!,point=this.points[end]!,score=this.scores[end]!,cost=this.costs[end]!;
  if(end){let i=0;
   while(i*2+1<end){let child=i*2+1;
    if(child+1<end&&this.less(this.scores[child+1]!,this.nodes[child+1]!.id,child))child++;
    if(!(this.scores[child]!<score || this.scores[child]===score&&this.nodes[child]!.id<node.id))break;
    this.nodes[i]=this.nodes[child];this.points[i]=this.points[child];this.scores[i]=this.scores[child]!;this.costs[i]=this.costs[child]!;i=child;
   }
   this.nodes[i]=node;this.points[i]=point;this.scores[i]=score;this.costs[i]=cost;
  }
  this.nodes[end]=undefined;this.points[end]=undefined;
  return this;
 }
}
type QueryTile={nodes:Polygon[];buckets:Map<string,Polygon[]>;borders:Edge[][];regions:Region[];boundary:Polygon[]};
function link(first:Edge,last:Edge,a=first.a,b=first.b){
 const midpoint={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
 first.node.portals.push({to:last.node,a:b,b:a,midpoint});last.node.portals.push({to:first.node,a,b,midpoint});
}
const cross=(a:P,b:P,c:P)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const equal=(a:P,b:P)=>Math.abs(a.x-b.x)<1e-8&&Math.abs(a.z-b.z)<1e-8;
// Integer costs on the same lattice as collision. Correct sqrt rounding rather
// than letting platform libm differences decide near-equal A* priorities.
const distance=(a:P,b:P)=>{
 const dx=Math.round((a.x-b.x)*2000),dz=Math.round((a.z-b.z)*2000),squared=dx*dx+dz*dz;
 let n=Math.floor(Math.sqrt(squared));while(n*n<squared)n++;while(n>0&&(n-1)*(n-1)>=squared)n--;return n;
};
const key=(p:P)=>`${Math.round(p.x*1000)},${Math.round(p.z*1000)}`;
function funnel(start:P,goal:P,portals:Portal[]):P[]{
 const gates=[{a:start,b:start},...portals,{a:goal,b:goal}],out=[start];
 let apex=start,left=start,right=start,li=0,ri=0;
 for(let i=1;i<gates.length;i++){
  const l=gates[i]!.a,r=gates[i]!.b;
  if(cross(apex,right,r)<=0){
   if(equal(apex,right)||cross(apex,left,r)>0){right=r;ri=i;}
   else{out.push(left);apex=left;right=left=apex;i=li;ri=li;continue;}
  }
  if(cross(apex,left,l)>=0){
   if(equal(apex,left)||cross(apex,right,l)<0){left=l;li=i;}
   else{out.push(right);apex=right;left=right=apex;i=ri;li=ri;}
  }
 }
 if(!equal(out[out.length-1]!,goal))out.push(goal);
 const compact:P[]=[];
 for(const p of out){
  if(compact.length&&equal(compact.at(-1)!,p))continue;
  while(compact.length>=2){
   const a=compact.at(-2)!,b=compact.at(-1)!;
   if(Math.abs(cross(a,b,p))>1e-8||(b.x-a.x)*(p.x-b.x)+(b.z-a.z)*(p.z-b.z)<0)break;
   compact.pop();
  }
  compact.push(p);
 }
 return compact;
}
/** Stable tile/polygon identities and tile-local connectivity let obstacle edits
 * replace only their affected polygons. Global connectivity visits tile regions,
 * never every polygon or collision cell after each building/tree change. */
export class GroundMeshQuery {
 private tiles=new Map<number,QueryTile>();
 private epoch=0;
 private readonly frontier=new MeshFrontier();
 private width:number;
 private regions:Region[]=[];
 private touched:Polygon[]=[];
 lastExpanded=0;
 readonly updates={tiles:0,regions:0,polygons:0};
 constructor(data:GroundMeshData,private readonly heuristicWeight=2){
  if(!Number.isFinite(heuristicWeight)||heuristicWeight<1||heuristicWeight>4)throw Error('Invalid navigation heuristic weight');
  this.width=Math.ceil(data.size/GROUND_MESH_TILE_SIZE);
  this.update(data.tiles,Array.from({length:this.width*this.width},(_,i)=>i));
 }
 update(tiles:readonly GroundMeshTile[],changed:readonly number[]){
  this.frontier.reset();
  const affected=new Set<number>();
  const touch=(id:number)=>{affected.add(id);const x=id%this.width,z=Math.floor(id/this.width);
   if(x)affected.add(id-1);if(x+1<this.width)affected.add(id+1);
   if(z)affected.add(id-this.width);if(z+1<this.width)affected.add(id+this.width);
  };
  for(const id of changed){touch(id);this.tiles.delete(id);}
  for(const tile of tiles){const id=tile.z*this.width+tile.x;this.tiles.set(id,this.buildTile(id,tile));}
  // Replace only interfaces incident to changed tiles. A neighbor's other
  // borders have not changed; tearing them down would propagate a local edit
  // into a needless second ring of polygon/portal work.
  const interfaces=new Set<number>();
  for(const id of changed){
   const x=id%this.width,z=Math.floor(id/this.width);
   if(x)interfaces.add((id-1)*2);if(x+1<this.width)interfaces.add(id*2);
   if(z)interfaces.add((id-this.width)*2+1);if(z+1<this.width)interfaces.add(id*2+1);
  }
  for(const code of [...interfaces].sort((a,b)=>a-b)){
   const id=Math.floor(code/2),vertical=code%2===1,otherId=id+(vertical?this.width:1);
   const a=this.tiles.get(id),b=this.tiles.get(otherId);
   const sideA=vertical?3:1,sideB=vertical?2:0,axis=vertical?'x':'z';
   // Clear reverse links even when the replacement tile is completely blocked.
   // Only polygons touching this seam can own such links. Interior polygons
   // and the neighbor's three unrelated borders require no filtering/allocation.
   const unlink=(tile:QueryTile|undefined,side:number,other:number)=>{
    const seen=new Set<Polygon>();
    for(const edge of tile?.borders[side]??[]){const node=edge.node;if(seen.has(node))continue;seen.add(node);
     let keep=0;for(const portal of node.portals)if(portal.to.tile!==other)node.portals[keep++]=portal;
     node.portals.length=keep;
    }
   };
   unlink(a,sideA,otherId);unlink(b,sideB,id);
   if(!a||!b)continue;
   const first=a.borders[sideA]!,last=b.borders[sideB]!;
   let j=0;
   for(const edge of first){
    const lo=Math.min(edge.a[axis],edge.b[axis]),hi=Math.max(edge.a[axis],edge.b[axis]);
    while(j<last.length&&Math.max(last[j]!.a[axis],last[j]!.b[axis])<=lo)j++;
    for(let k=j;k<last.length;k++){
     const other=last[k]!,low=Math.max(lo,Math.min(other.a[axis],other.b[axis])),high=Math.min(hi,Math.max(other.a[axis],other.b[axis]));
     if(Math.min(other.a[axis],other.b[axis])>=hi)break;
     if(high-low<=1e-8)continue;
     const forward=edge.b[axis]>edge.a[axis];
     link(edge,other,{...edge.a,[axis]:forward?low:high},{...edge.b,[axis]:forward?high:low});
    }
   }
  }
  // Stable order makes cold builds, incremental edits and restored saves choose
  // identical ties, independent of map insertion order/cache warmness.
  const sortNodes=new Set<number>(affected);
  for(const code of interfaces){const id=Math.floor(code/2);sortNodes.add(id);sortNodes.add(id+(code%2?this.width:1));}
  const rebuilt=new Set(changed);
  for(const id of sortNodes){const tile=this.tiles.get(id);if(!tile)continue;
   for(const node of rebuilt.has(id)?tile.nodes:tile.boundary)node.portals.sort((a,b)=>a.to.id-b.to.id||a.a.x-b.a.x||a.a.z-b.a.z);
  }
  this.regions=[];this.updates.polygons=0;
  for(const tile of this.tiles.values()){
   this.updates.polygons+=tile.nodes.length;
   for(const region of tile.regions){region.component=0;this.regions.push(region);}
  }
  // Boundary polygons only: no scan of interior polygons on distant tiles.
  // Unchanged region links survive edits too. Re-scanning the whole forest's
  // borders here would undo the benefit of local contour replacement.
  for(const id of sortNodes){const tile=this.tiles.get(id);if(!tile)continue;
   for(const region of tile.regions)region.links.clear();
   for(const node of tile.boundary)for(const portal of node.portals)
    if(portal.to.tile!==node.tile)node.region!.links.add(portal.to.region!);
  }
  let component=0;
  for(const region of this.regions)if(!region.component){
   region.component=++component;const queue=[region];
   for(let at=0;at<queue.length;at++)for(const next of queue[at]!.links)if(!next.component){next.component=component;queue.push(next);}
  }
  this.updates.tiles+=changed.length;this.updates.regions=this.regions.length;
 }
 private buildTile(id:number,tile:GroundMeshTile):QueryTile {
  const nodes:Polygon[]=[],buckets=new Map<string,Polygon[]>(),edges=new Map<string,Edge>();
  const polygons=convexPolygons(tile);
  for(let i=0;i<polygons.length;i++){
   if(i>=65536)throw Error('Navigation tile polygon limit exceeded');
   const points=polygons[i]!;
   const node:Polygon={id:id*65536+i,tile:id,points,portals:[],seen:0,closed:0,cost:0};nodes.push(node);
   const minX=Math.floor(Math.min(...points.map(p=>p.x))/8),maxX=Math.floor(Math.max(...points.map(p=>p.x))/8);
   const minZ=Math.floor(Math.min(...points.map(p=>p.z))/8),maxZ=Math.floor(Math.max(...points.map(p=>p.z))/8);
   for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
    const key=`${x}/${z}`,list=buckets.get(key)??[];list.push(node);buckets.set(key,list);
   }
   for(let e=0;e<points.length;e++){
    const a=points[e]!,b=points[(e+1)%points.length]!,ka=key(a),kb=key(b),k=ka<kb?`${ka}/${kb}`:`${kb}/${ka}`;
    const other=edges.get(k),edge={node,a,b};
    if(other){link(other,edge);edges.delete(k);}else edges.set(k,edge);
   }
  }
  const regions:Region[]=[];
  for(const node of nodes)if(!node.region){
   const region:Region={component:0,links:new Set()};regions.push(region);node.region=region;const queue=[node];
   for(let i=0;i<queue.length;i++)for(const portal of queue[i]!.portals)if(!portal.to.region){portal.to.region=region;queue.push(portal.to);}
  }
  const borders:Edge[][]=[[],[],[],[]],boundary=new Set<Polygon>();
  for(const edge of edges.values()){
   const {a,b}=edge,side=a.x===b.x&&a.x===tile.minX/1000?0:a.x===b.x&&a.x===tile.maxX/1000?1:
    a.z===b.z&&a.z===tile.minZ/1000?2:a.z===b.z&&a.z===tile.maxZ/1000?3:-1;
   if(side<0)continue;borders[side]!.push(edge);boundary.add(edge.node);
  }
  for(let side=0;side<4;side++){const axis=side<2?'z':'x';borders[side]!.sort((a,b)=>Math.min(a.a[axis],a.b[axis])-Math.min(b.a[axis],b.b[axis])||a.node.id-b.node.id);}
  return {nodes,buckets,borders,regions,boundary:[...boundary]};
 }
 private locate(p:P){
  const tx=Math.floor((p.x+.5)/GROUND_MESH_TILE_SIZE),tz=Math.floor((p.z+.5)/GROUND_MESH_TILE_SIZE);
  // Include the preceding tile at an exact seam, retaining the lowest stable ID.
  const xs=(p.x+.5)%GROUND_MESH_TILE_SIZE===0?[tx-1,tx]:[tx],zs=(p.z+.5)%GROUND_MESH_TILE_SIZE===0?[tz-1,tz]:[tz];
  for(const z of zs)for(const x of xs){
   if(x<0||z<0||x>=this.width||z>=this.width)continue;
   for(const node of this.tiles.get(z*this.width+x)?.buckets.get(`${Math.floor(p.x/8)}/${Math.floor(p.z/8)}`)??[])
    if(node.points.every((a,i)=>cross(a,node.points[(i+1)%node.points.length]!,p)<=1e-8))return node;
  }
  return undefined;
 }
 computePath(start:P,goal:P){
  // Do not retain retired tiles through old predecessor chains after edits.
  for(const node of this.touched){node.previous=undefined;node.previousPortal=undefined;}
  this.touched=[];
  this.lastExpanded=0;
  const from=this.locate(start),to=this.locate(goal),heap=this.frontier;heap.reset();
  const failure=(name:string)=>({success:false,error:{name},path:[] as {x:number;y:number;z:number}[]});
  if(!from||!to)return failure('endpoint-outside-mesh');
  if(from.region!.component!==to.region!.component)return failure('disconnected');
  if(++this.epoch===0xffffffff){for(const tile of this.tiles.values())for(const node of tile.nodes){node.seen=0;node.closed=0;}this.epoch=1;}
  const epoch=this.epoch;
  from.seen=epoch;from.cost=0;this.touched.push(from);heap.push(from,0,distance(start,goal),start);
  while(heap.length){
   const current=heap.pop(),node=current.node!;if(current.cost!==node.cost||node.closed===epoch)continue;node.closed=epoch;this.lastExpanded++;
   if(node===to){
    const portals:Portal[]=[];
    for(let at=to;at.previous;at=at.previous)portals.push(at.previousPortal!);
    return {success:true,path:funnel(start,goal,portals.reverse()).map(p=>({...p,y:0}))};
   }
   for(const p of node.portals){
    const next=p.to;if(next.closed===epoch)continue;
    const point=next===to?goal:p.midpoint,cost=current.cost+distance(current.point!,point);
    if(next.seen===epoch&&cost>=next.cost)continue;
    if(next.seen!==epoch)this.touched.push(next);
    next.seen=epoch;next.cost=cost;next.previous=node;next.previousPortal=p;
    heap.push(next,cost,cost+this.heuristicWeight*distance(point,goal),point);
   }
  }
  return failure('disconnected');
 }
 destroy(){this.frontier.reset();this.tiles.clear();this.regions=[];this.touched=[];}
}
export function createGroundMeshQuery(data:GroundMeshData,heuristicWeight=2){return {query:new GroundMeshQuery(data,heuristicWeight)};}
