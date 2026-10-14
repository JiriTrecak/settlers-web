/** Ground navigation geometry. Built from simulation collision,
 * not render meshes. Coordinates use the simulation's 1/1000 world-unit lattice.
 * No voxel erosion: the axis cuts include every square-footprint obstacle edge.
 * Bridge decks remain unsupported and must be reported by the caller.
 */
import {ShapeUtils, Vector2} from 'three';
import {MAX_GROUND_STEP_CM} from '../map/tacticalTerrain';
export type GroundMeshInput={size:number;walkable:Uint8Array;heights:Int16Array;radius:number};
export type GroundMeshTile={x:number;z:number;minX:number;minZ:number;maxX:number;maxZ:number;vertices:number[];triangles:number[]};
export type GroundMeshData={size:number;radius:number;tiles:GroundMeshTile[];triangles:number;buildMs:number;rebuiltTiles:number;rebuiltTileIds:number[]};
type SampleAxis={cuts:number[];low:Int32Array;high:Int32Array};
type TileCache={tiles:Map<string,{mask:Uint8Array;tile:GroundMeshTile|null}>;axes:Map<number,SampleAxis>};
/** Optional diagnostics supplied by the caller; never affect geometry. */
type BuildProfile={enabled:boolean;measure<T>(name:string,work:()=>T):T;count(name:string,value?:number):void};
/** Reuse unchanged clearance masks and triangulations. Full debug builds scan
 * the input; production callers can restrict checks to locally invalidated tiles.
 * changedCells must contain EVERY input edit since the supplied tiles were last
 * built. Omit it when that receipt is unavailable to recompute their full masks. */
export class GroundMeshBuilder {
 private cache:TileCache={tiles:new Map(),axes:new Map()};
 private configuration='';
 build(input:GroundMeshInput,tileIds?:readonly number[],changedCells?:readonly number[],profile?:BuildProfile){
  const key=`${input.size}/${input.radius}`;
  if(key!==this.configuration){this.cache.tiles.clear();this.cache.axes.clear();this.configuration=key;}
  return buildGroundMesh(input,this.cache,tileIds,changedCells,profile);
 }
}
export const GROUND_MESH_TILE_SIZE=32;
/** Fixed-point clearance padding; endpoint lookup may bridge only this margin
 * when the caller independently validates the complete physical route. */
export const GROUND_MESH_CLEARANCE_PADDING=2;
const SCALE=1000,TILE=GROUND_MESH_TILE_SIZE;
type Point={x:number;y:number};
function prefix(data:Uint8Array,size:number){
 const stride=size+1,out=new Uint32Array(stride*stride);
 for(let y=0;y<size;y++){let sum=0;for(let x=0;x<size;x++){sum+=data[y*size+x]!;out[(y+1)*stride+x+1]=out[y*stride+x+1]!+sum;}}
 return (x0:number,y0:number,x1:number,y1:number)=>x1<x0||y1<y0?0:out[(y1+1)*stride+x1+1]!-out[y0*stride+x1+1]!-out[(y1+1)*stride+x0]!+out[y0*stride+x0]!;
}
function axis(lo:number,hi:number,radius:number){
 const cuts=new Set<number>([lo,hi]);
 for(let cell=Math.floor((lo-radius)/SCALE)-1;cell<=Math.ceil((hi+radius)/SCALE)+1;cell++)
  for(const v of [cell*SCALE-500-radius,cell*SCALE-500+radius])if(v>lo&&v<hi)cuts.add(v);
 return [...cuts].sort((a,b)=>a-b);
}
/** Footprint bounds depend on the sample lattice, not on terrain edits. Every
 * row/column previously repeated the same midpoint and four floor operations. */
function sampleAxis(lo:number,hi:number,radius:number):SampleAxis {
 const cuts=axis(lo,hi,radius),low=new Int32Array(cuts.length-1),high=new Int32Array(cuts.length-1);
 for(let i=0;i<low.length;i++){
  const center=(cuts[i]!+cuts[i+1]!)/2;
  low[i]=Math.floor((center-radius+500)/SCALE);high[i]=Math.floor((center+radius+500)/SCALE);
 }
 return {cuts,low,high};
}
function area(loop:Point[]){let sum=0;for(let i=0;i<loop.length;i++){const a=loop[i]!,b=loop[(i+1)%loop.length]!;sum+=a.x*b.y-b.x*a.y;}return sum/2;}
function contains(loop:Point[],p:Point){
 let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){
  const a=loop[i]!,b=loop[j]!;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;
}
function contours(mask:Uint8Array,xs:number[],zs:number[]):Point[][]{
 const w=xs.length-1,h=zs.length-1,stride=w+1;
 type Edge={from:number;to:number;dir:number;used:boolean};
 const edges:Edge[]=[],outgoing=new Map<number,number[]>();
 const edge=(from:number,to:number,dir:number)=>{const list=outgoing.get(from)??[];list.push(edges.length);outgoing.set(from,list);edges.push({from,to,dir,used:false});};
 for(let z=0;z<h;z++)for(let x=0;x<w;x++)if(mask[z*w+x]){
  const a=z*stride+x,b=a+1,c=a+stride,d=c+1;
  if(!z||!mask[(z-1)*w+x])edge(a,b,0);
  if(x===w-1||!mask[z*w+x+1])edge(b,d,1);
  if(z===h-1||!mask[(z+1)*w+x])edge(d,c,2);
  if(!x||!mask[z*w+x-1])edge(c,a,3);
 }
 const loops:Point[][]=[];
 for(const first of edges){
  if(first.used)continue;const points:Point[]=[];let e=first;
  for(let guard=0;guard<=edges.length;guard++){
   e.used=true;points.push({x:xs[e.from%stride]!,y:zs[Math.floor(e.from/stride)]!});
   if(e.to===first.from)break;
   const candidates=(outgoing.get(e.to)??[]).map(i=>edges[i]!).filter(q=>!q.used);
   // Keep filled cells on the right, splitting diagonal point contacts.
   const rank=(q:Edge)=>[1,0,3,2].indexOf((q.dir-e.dir+4)%4);
   candidates.sort((a,b)=>rank(a)-rank(b));
   if(!candidates.length)throw Error('Open navigation contour');e=candidates[0]!;
  }
  const simplified=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length]!,b=points[(i+1)%points.length]!;return (p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x);});
  if(simplified.length>=3)loops.push(simplified);
 }
 return loops;
}

/** Supplying tile IDs rebuilds only those tiles and their collision halos. No
 * full-map copy, prefix table or contour scan is performed for a local edit.
 * With a complete changed-cell receipt, small edits also retain unaffected mask
 * samples. Wider bodies use prefix tables even for their local sample ranges. */
export function buildGroundMesh(input:GroundMeshInput,cache?:TileCache,tileIds?:readonly number[],changedCells?:readonly number[],profile?:BuildProfile):GroundMeshData{
 const began=performance.now(),{size,walkable,heights}=input,n=size*size;
 const measure=<T>(name:string,work:()=>T):T=>profile?.enabled?profile.measure(name,work):work();
 if(!Number.isSafeInteger(size)||size<2||size>2048||walkable.length!==n||heights.length!==n||!Number.isFinite(input.radius)||input.radius<0||input.radius>16)throw Error('Invalid navigation input');
 // Two fixed-point steps keep paths off exact collision boundary contacts.
 const radius=Math.round(input.radius*SCALE)+GROUND_MESH_CLEARANCE_PADDING,tiles:GroundMeshTile[]=[],width=Math.ceil(size/TILE);
 // X and Z use the same lattice. Retain one axis per tile coordinate, not two
 // copies per tile; storage grows with map width rather than map area.
 const axes=cache?.axes??new Map<number,SampleAxis>();
 const samplesAt=(index:number,lo:number,hi:number)=>{
  let samples=axes.get(index);
  if(!samples){samples=sampleAxis(lo,hi,radius);axes.set(index,samples);profile?.count('Sampling lattices built');}
  return samples;
 };
 const tables=(ox:number,oz:number,span:number)=>{
  const blocked=new Uint8Array(span*span),badX=new Uint8Array(span*span),badZ=new Uint8Array(span*span);
  for(let z=0;z<span;z++)for(let x=0;x<span;x++){
   const wx=x+ox,wz=z+oz,i=wz*size+wx,j=z*span+x;
   if(wx<0||wz<0||wx>=size||wz>=size){blocked[j]=1;continue;}
   blocked[j]=walkable[i]?0:1;
   if(wx<size-1)badX[j]=Math.abs(heights[i]!-heights[i+1]!)>MAX_GROUND_STEP_CM?1:0;
   if(wz<size-1)badZ[j]=Math.abs(heights[i]!-heights[i+size]!)>MAX_GROUND_STEP_CM?1:0;
  }
  const queries=[blocked,badX,badZ].map(data=>prefix(data,span));
  return queries.map(query=>(x0:number,z0:number,x1:number,z1:number)=>query(x0-ox,z0-oz,x1-ox,z1-oz));
 };
 const global=tileIds?undefined:measure('Global collision tables',()=>tables(0,0,size));
 const ids=tileIds??Array.from({length:width*width},(_,i)=>i);
 const rebuiltTileIds:number[]=[];
 for(const id of ids){
  if(!Number.isInteger(id)||id<0||id>=width*width)throw Error('Invalid navigation tile');
  const tx=id%width,tz=Math.floor(id/width),halo=Math.ceil(input.radius)+2;
  const minX=tx*TILE*SCALE-500,minZ=tz*TILE*SCALE-500,maxX=Math.min(size,(tx+1)*TILE)*SCALE-500,maxZ=Math.min(size,(tz+1)*TILE)*SCALE-500;
  const key=`${tx}/${tz}`,previous=cache?.tiles.get(key);
  const sampleX=samplesAt(tx,minX,maxX),sampleZ=samplesAt(tz,minZ,maxZ);
  const xs=sampleX.cuts,zs=sampleZ.cuts,w=xs.length-1,h=zs.length-1;
  const mask=measure('Clearance masks',()=>{
   let mask:Uint8Array;
   let local=false,lx=0,lz=0,rx=w-1,rz=h-1;
   if(previous&&changedCells){
    // A mask sample only reads cells inside its swept footprint. Extra one-cell
    // padding includes neighboring height-step tests and exact cell contacts.
    const reach=radius+1500;
    let loX=Infinity,loZ=Infinity,hiX=-Infinity,hiZ=-Infinity;
    for(const cell of changedCells){
     const x=cell%size*SCALE,z=Math.floor(cell/size)*SCALE;
     if(x+reach<minX||x-reach>maxX||z+reach<minZ||z-reach>maxZ)continue;
     loX=Math.min(loX,x-reach);hiX=Math.max(hiX,x+reach);loZ=Math.min(loZ,z-reach);hiZ=Math.max(hiZ,z+reach);
    }
    while(lx<w&&(xs[lx]!+xs[lx+1]!)/2<loX)lx++;
    while(rx>=lx&&(xs[rx]!+xs[rx+1]!)/2>hiX)rx--;
    while(lz<h&&(zs[lz]!+zs[lz+1]!)/2<loZ)lz++;
    while(rz>=lz&&(zs[rz]!+zs[rz+1]!)/2>hiZ)rz--;
    local=(rx-lx+1)*(rz-lz+1)<w*h;
   }
   const samples=Math.max(0,rx-lx+1)*Math.max(0,rz-lz+1);
   // Direct reads scale with both samples and body footprint, whereas prefix
   // construction scales with the tile plus its halo. Use an upper bound on
   // footprint cells so medium edits for wide units do not repeatedly scan
   // thousands of cells. This only selects an equivalent sampling algorithm.
   const footprintSide=Math.ceil(radius*2/SCALE)+1;
   if(local&&samples*footprintSide*footprintSide<=(TILE+halo*2)**2){
    profile?.count('Local mask samples',samples);
    profile?.count('Direct footprint samples',samples);
    mask=previous!.mask.slice();
    for(let z=lz;z<=rz;z++)for(let x=lx;x<=rx;x++){
     const x0=sampleX.low[x]!,x1=sampleX.high[x]!,z0=sampleZ.low[z]!,z1=sampleZ.high[z]!;
     let clear=x0>=0&&z0>=0&&x1<size&&z1<size;
     for(let zz=z0;clear&&zz<=z1;zz++)for(let xx=x0;xx<=x1;xx++){
      const i=zz*size+xx;
      if(!walkable[i]||(xx<x1&&Math.abs(heights[i]!-heights[i+1]!)>MAX_GROUND_STEP_CM)||(zz<z1&&Math.abs(heights[i]!-heights[i+size]!)>MAX_GROUND_STEP_CM)){clear=false;break;}
     }
     mask[z*w+x]=+clear;
    }
   }else{
    profile?.count(local?'Local mask samples':'Full mask samples',local?samples:w*h);
    profile?.count('Prefix mask samples',local?samples:w*h);
    mask=local?previous!.mask.slice():new Uint8Array(w*h);
    if(local&&(rx<lx||rz<lz))return mask;
    const [occupancy,xSteps,zSteps]=global??measure('Local collision tables',()=>tables(tx*TILE-halo,tz*TILE-halo,TILE+halo*2));
    for(let z=local?lz:0;z<=(local?rz:h-1);z++)for(let x=local?lx:0;x<=(local?rx:w-1);x++){
     const x0=sampleX.low[x]!,x1=sampleX.high[x]!,z0=sampleZ.low[z]!,z1=sampleZ.high[z]!;
     // Local masks start from the previous result, so clear stale samples too.
     mask[z*w+x]=+(x0>=0&&z0>=0&&x1<size&&z1<size&&
      !occupancy!(x0,z0,x1,z1)&&!xSteps!(x0,z0,x1-1,z1)&&!zSteps!(x0,z0,x1,z1-1));
    }
   }
   return mask;
  });
  if(previous&&previous.mask.length===mask.length&&mask.every((v,i)=>v===previous.mask[i])){
   profile?.count('Unchanged mesh tiles');
   if(previous.tile)tiles.push(previous.tile);
   continue;
  }
  rebuiltTileIds.push(id);
  profile?.count('Rebuilt mesh tiles');
  const loops=measure('Boundary extraction',()=>contours(mask,xs,zs)),outers=loops.filter(p=>area(p)>0),holes=loops.filter(p=>area(p)<0);
  // A walkable island can itself contain an obstacle. Assign each hole to the
  // smallest containing contour, not also to its island's distant ancestor.
  const outerAreas=outers.map(area),assigned=outers.map(()=>[] as Point[][]);
  for(const hole of holes){
   let owner=-1;
   for(let i=0;i<outers.length;i++)if((owner<0||outerAreas[i]!<outerAreas[owner]!)&&contains(outers[i]!,hole[0]!))owner=i;
   if(owner>=0)assigned[owner]!.push(hole);
  }
  const vertices:number[]=[],triangles:number[]=[],vertexIds=new Map<string,number>();
  for(let oi=0;oi<outers.length;oi++){
   const outer=outers[oi]!,ownHoles=assigned[oi]!,flat=[outer,...ownHoles].flat();
   const faces=measure('Polygon triangulation',()=>ShapeUtils.triangulateShape(outer.map(p=>new Vector2(p.x,p.y)),ownHoles.map(hole=>hole.map(p=>new Vector2(p.x,p.y)))));
   const ids=flat.map(p=>{const key=`${p.x}/${p.y}`;let id=vertexIds.get(key);if(id===undefined){id=vertices.length/2;vertices.push(p.x,p.y);vertexIds.set(key,id);}return id;});
   for(const face of faces){
    const [a,b,c]=face.map(i=>ids[i]!) as [number,number,number];
    const cross=(vertices[b*2]!-vertices[a*2]!)*(vertices[c*2+1]!-vertices[a*2+1]!)-(vertices[b*2+1]!-vertices[a*2+1]!)*(vertices[c*2]!-vertices[a*2]!);
    if(cross)triangles.push(...(cross<0?[a,b,c]:[a,c,b]));
   }
  }
  const tile=triangles.length?{x:tx,z:tz,minX,minZ,maxX,maxZ,vertices,triangles}:null;
  if(tile)tiles.push(tile);
  cache?.tiles.set(key,{mask,tile});
 }
 return {size,radius:input.radius,tiles,triangles:tiles.reduce((sum,t)=>sum+t.triangles.length/3,0),buildMs:performance.now()-began,rebuiltTiles:rebuiltTileIds.length,rebuiltTileIds};
}
