import {SECTOR_SIZE} from '../../shared/spatial/sectors';
import {canTraverse} from './navigation';
const directions=[[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const;
type Region={sector:number;links:Set<number>};
export type SectorTopology={count:number;cell:(node:number)=>number;neighbors:(node:number)=>readonly number[]};
/** 16×16 terrain clusters. Each disconnected piece gets its own portal node,
 * so a river through a sector never becomes an imaginary crossing. Only dirty
 * clusters and their boundary links rebuild when trees/buildings change. */
export class SectorNavigation {
 readonly width:number;
 readonly labels:Int32Array;
 readonly diagnostics={rebuiltSectors:0,expandedRegions:0,corridorSectors:0};
 private readonly regions=new Map<number,Region>();
 private readonly sectorRegions:number[][];
 private readonly dirty=new Set<number>();
 private readonly networks=new Map<number,number>();
 private readonly nodesBySector:number[][]|undefined;
 private readonly regionStride:number;
 private readonly plans=new Map<string,readonly number[]|null>();
 constructor(readonly size:number,private readonly walkable:(id:number)=>boolean,
  private readonly step:(a:number,b:number)=>boolean,private readonly topology?:SectorTopology){
  this.width=Math.ceil(size/SECTOR_SIZE);this.labels=new Int32Array(topology?.count??size*size).fill(-1);
  this.sectorRegions=Array.from({length:this.width*this.width},()=>[]);
  if(topology){this.nodesBySector=Array.from({length:this.width*this.width},()=>[]);for(let id=0;id<topology.count;id++)this.nodesBySector[this.sector(id)]!.push(id);}
  this.regionStride=this.nodesBySector?Math.max(...this.nodesBySector.map(nodes=>nodes.length))+1:SECTOR_SIZE*SECTOR_SIZE;
  this.invalidate();
 }
 sector(node:number){const cell=this.topology?.cell(node)??node;return Math.floor(Math.floor(cell/this.size)/SECTOR_SIZE)*this.width+Math.floor((cell%this.size)/SECTOR_SIZE);}
 invalidate(cells?:Iterable<number>){
  if(!cells){for(let i=0;i<this.sectorRegions.length;i++)this.dirty.add(i);return;}
  for(const cell of cells)if(cell>=0&&cell<this.labels.length)this.dirty.add(this.sector(cell));
 }
 private *nodesIn(sector:number):Iterable<number>{
  if(this.nodesBySector){yield* this.nodesBySector[sector]!;return;}
  const b=this.bounds(sector);for(let y=b.y;y<b.endY;y++)for(let x=b.x;x<b.endX;x++)yield y*this.size+x;
 }
 private bounds(sector:number){const x=(sector%this.width)*SECTOR_SIZE,y=Math.floor(sector/this.width)*SECTOR_SIZE;return {x,y,endX:Math.min(this.size,x+SECTOR_SIZE),endY:Math.min(this.size,y+SECTOR_SIZE)};}
 prepare(){
  this.diagnostics.rebuiltSectors=this.dirty.size;if(!this.dirty.size)return;
  this.plans.clear();const boundary=new Set<number>();
  for(const sector of this.dirty){
   const sx=sector%this.width,sy=Math.floor(sector/this.width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(sx+dx>=0&&sy+dy>=0&&sx+dx<this.width&&sy+dy<this.width)boundary.add((sy+dy)*this.width+sx+dx);
   for(const id of this.sectorRegions[sector]!)this.regions.delete(id);
   const list:number[]=this.sectorRegions[sector]=[],b=this.bounds(sector);
   for(const node of this.nodesIn(sector))this.labels[node]=-1;
   for(const start of this.nodesIn(sector)){
    if(this.labels[start]!==-1||!this.walkable(start))continue;
    const id=sector*this.regionStride+list.length;list.push(id);this.regions.set(id,{sector,links:new Set()});
    const queue=[start];this.labels[start]=id;
    for(let at=0;at<queue.length;at++){
     const a=queue[at]!;
     if(this.topology){
      for(const next of this.topology.neighbors(a))if(this.sector(next)===sector&&this.labels[next]===-1){this.labels[next]=id;queue.push(next);}
      continue;
     }
     const ax=a%this.size,ay=Math.floor(a/this.size);
     for(let d=0;d<4;d++){
      const [dx,dy]=directions[d]!,nx=ax+dx,ny=ay+dy,next=ny*this.size+nx;
      if(nx<b.x||nx>=b.endX||ny<b.y||ny>=b.endY||this.labels[next]!==-1||!this.step(a,next))continue;
      this.labels[next]=id;queue.push(next);
     }
    }
   }
  }
  // All endpoints adjacent to changed clusters are rebuilt together. Links
  // farther away continue referring to unchanged region IDs.
  for(const sector of boundary)for(const id of this.sectorRegions[sector]!)this.regions.get(id)!.links.clear();
  for(const sector of boundary){
   const b=this.bounds(sector);
   for(const from of this.nodesIn(sector)){
    const cell=this.topology?.cell(from)??from,x=cell%this.size,y=Math.floor(cell/this.size);
    if(x>b.x&&x<b.endX-1&&y>b.y&&y<b.endY-1)continue;
    const id=this.labels[from]!;if(id<0)continue;
    if(this.topology){
     for(const to of this.topology.neighbors(from))if(this.sector(to)!==sector&&this.labels[to]!>=0)this.regions.get(id)!.links.add(this.labels[to]!);
     continue;
    }
    for(const [dx,dy] of directions){
     const nx=x+dx,ny=y+dy,to=ny*this.size+nx;
     if(nx<0||ny<0||nx>=this.size||ny>=this.size||this.sector(to)===sector)continue;
     const other=this.labels[to]!;
     if(other>=0&&canTraverse(this.size,from,to,this.step))this.regions.get(id)!.links.add(other);
    }
   }
  }
  this.networks.clear();let component=0;
  for(const start of this.regions.keys()){
   if(this.networks.has(start))continue;
   const queue=[start];this.networks.set(start,++component);
   for(let at=0;at<queue.length;at++)for(const next of this.regions.get(queue[at]!)!.links){
    if(this.networks.has(next))continue;this.networks.set(next,component);queue.push(next);
   }
  }
  this.dirty.clear();
 }
 connected(start:number,goal:number){
  if(!Number.isInteger(start)||!Number.isInteger(goal)||start<0||goal<0||start>=this.labels.length||goal>=this.labels.length)return false;
  this.prepare();const target=this.labels[goal]!;if(target<0)return false;
  const origin=this.labels[start]!;if(origin>=0)return this.networks.get(origin)===this.networks.get(target);
  if(this.topology)return this.topology.neighbors(start).some(next=>this.networks.get(this.labels[next]!)===this.networks.get(target));
  const x=start%this.size,y=Math.floor(start/this.size);
  // Units may exit a cell newly covered by construction.
  return directions.slice(0,4).some(([dx,dy])=>{const nx=x+dx,ny=y+dy,next=ny*this.size+nx;return nx>=0&&ny>=0&&nx<this.size&&ny<this.size&&this.step(start,next)&&this.networks.get(this.labels[next]!)===this.networks.get(target);});
 }
 /** Null means disconnected. Undefined requests the ordinary local search. */
 corridor(start:number,goal:number):Uint8Array|null|undefined {
  this.prepare();this.diagnostics.expandedRegions=0;this.diagnostics.corridorSectors=0;
  if(!this.connected(start,goal))return null;
  const source=this.labels[start]!,target=this.labels[goal]!;if(source<0)return undefined;
  const key=`${source}:${target}`;let plan=this.plans.get(key);
  if(plan===undefined){
   const goalSector=this.regions.get(target)!.sector,gx=goalSector%this.width,gy=Math.floor(goalSector/this.width);
   const heuristic=(id:number)=>{const sector=this.regions.get(id)!.sector,dx=Math.abs(sector%this.width-gx),dy=Math.abs(Math.floor(sector/this.width)-gy);return Math.max(dx,dy)*1000+Math.min(dx,dy)*414;};
   const costs=new Map<number,number>([[source,0]]),previous=new Map<number,number>(),closed=new Set<number>();
   type Entry={id:number;g:number;h:number};const heap:Entry[]=[];
   const better=(a:Entry,b:Entry)=>a.g+a.h<b.g+b.h||(a.g+a.h===b.g+b.h&&(a.h<b.h||(a.h===b.h&&a.id<b.id)));
   const push=(e:Entry)=>{let i=heap.length;heap.push(e);while(i){const p=(i-1)>>1;if(!better(e,heap[p]!))break;heap[i]=heap[p]!;i=p;}heap[i]=e;};
   const pop=()=>{const top=heap[0]!,last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&better(heap[c+1]!,heap[c]!))c++;if(!better(heap[c]!,last))break;heap[i]=heap[c]!;i=c;}heap[i]=last;}return top;};
   push({id:source,g:0,h:heuristic(source)});plan=null;
   while(heap.length){
    const current=pop();if(closed.has(current.id)||costs.get(current.id)!==current.g)continue;
    this.diagnostics.expandedRegions++;
    if(current.id===target){const path=[target];for(let id=target;id!==source;){id=previous.get(id)!;path.push(id);}plan=path.map(id=>this.regions.get(id)!.sector);break;}
    closed.add(current.id);const sector=this.regions.get(current.id)!.sector;
    for(const next of this.regions.get(current.id)!.links){
     if(closed.has(next))continue;const other=this.regions.get(next)!.sector;
     const diagonal=sector%this.width!==other%this.width&&Math.floor(sector/this.width)!==Math.floor(other/this.width),g=current.g+(diagonal?1414:1000);
     if(g>=(costs.get(next)??Infinity))continue;costs.set(next,g);previous.set(next,current.id);push({id:next,g,h:heuristic(next)});
    }
   }
   if(this.plans.size>=128)this.plans.delete(this.plans.keys().next().value!);this.plans.set(key,plan);
  }
  if(!plan)return null;
  // One neighboring sector keeps room for smooth approaches and local traffic.
  const allowed=new Uint8Array(this.width*this.width);
  for(const sector of plan){const x=sector%this.width,y=Math.floor(sector/this.width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&y+dy>=0&&x+dx<this.width&&y+dy<this.width)allowed[(y+dy)*this.width+x+dx]=1;
  }
  this.diagnostics.corridorSectors=allowed.reduce((a,b)=>a+b,0);return allowed;
 }
}
