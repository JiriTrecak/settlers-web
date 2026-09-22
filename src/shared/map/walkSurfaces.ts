import {surfaceHeight,type BridgeSurface} from './bridgeSurface';
import {MAX_GROUND_STEP_CM,SIGHT_HEIGHT_CM,TacticalTerrain} from './tacticalTerrain';

/** Stable map stamp identity selects a deck. Omitted surface means the ground. */
export type SurfacePoint={x:number;y:number;surface?:string;elevation?:number};
export type SurfaceNode=SurfacePoint & {id:number;cell:number;height:number;level:number};
const DIRECTIONS=[[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const;
const BODY_CLEARANCE_CM=200;

/** Ground cells retain their ordinary IDs. Deck cells are sparse extra nodes,
 * ordered by stamp ID, so adding a bridge never replaces the floor beneath it.
 * Heights and movement costs are quantized; topology is immutable for a match.
 */
export class WalkSurfaces {
 readonly nodes:readonly SurfaceNode[];
 private readonly decks=new Map<string,BridgeSurface>();
 private readonly columns=new Map<number,number[]>();
 private readonly layers=new Map<string,Map<number,number>>();
 private readonly groundCount:number;
 private readonly costs:Float64Array;
 private readonly previous:Int32Array;
 private readonly seen:Uint32Array;
 private readonly closed:Uint32Array;
 private search=0;
 lastExpanded=0;
 private readonly regions:Int32Array;
 private readonly regionLinks=new Map<number,Set<number>>();
 private readonly components:number[]=[0];
 private regionCount=0;
 private readonly groundTactical:TacticalTerrain;
 private readonly bounds:{loX:number;hiX:number;loY:number;hiY:number}[]=[];
 constructor(readonly size:number,readonly groundHeights:Int16Array,readonly groundWalkable:Uint8Array,surfaces:readonly BridgeSurface[]){
  this.groundCount=size*size;
  this.groundTactical=new TacticalTerrain(size,groundHeights);
  if(!Number.isInteger(size)||size<2||size>2048||groundHeights.length!==this.groundCount||groundWalkable.length!==this.groundCount)throw new Error('Invalid surface terrain');
  const nodes:SurfaceNode[]=Array.from({length:this.groundCount},(_,id)=>({id,cell:id,x:id%size,y:Math.floor(id/size),height:groundHeights[id]!,level:0}));
  for(const deck of [...surfaces].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
   if(!deck.id||this.decks.has(deck.id)||!Number.isInteger(deck.level)||deck.level<1||deck.level>31)throw new Error('Walk surfaces require unique stamp IDs');
   if(![deck.x,deck.z,deck.base,deck.c,deck.s,deck.width,deck.depth,deck.height,deck.arch,deck.thickness].every(Number.isFinite)||deck.width<=0||deck.depth<=0||deck.thickness<=0)throw new Error('Invalid walk surface');
   this.decks.set(deck.id,deck);const cells=new Map<number,number>();this.layers.set(deck.id,cells);
   const radius=Math.hypot(deck.width,deck.depth)/2;
   this.bounds.push({loX:deck.x-radius,hiX:deck.x+radius,loY:deck.z-radius,hiY:deck.z+radius});
   for(let y=Math.max(0,Math.floor(deck.z-radius));y<=Math.min(size-1,Math.ceil(deck.z+radius));y++)
    for(let x=Math.max(0,Math.floor(deck.x-radius));x<=Math.min(size-1,Math.ceil(deck.x+radius));x++){
     const h=surfaceHeight(deck,x,y);if(h===undefined)continue;
     const cell=y*size+x,id=nodes.length;
     nodes.push({id,cell,x,y,surface:deck.id,level:deck.level,height:Math.round(h*100)});cells.set(cell,id);
     const column=this.columns.get(cell)??[];column.push(id);this.columns.set(cell,column);
    }
  }
  this.nodes=nodes;
  this.costs=new Float64Array(nodes.length);this.previous=new Int32Array(nodes.length);
  this.seen=new Uint32Array(nodes.length);this.closed=new Uint32Array(nodes.length);
  this.regions=new Int32Array(nodes.length);this.buildRegions();
 }
 node(p:SurfacePoint):number|undefined {
  if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=this.size||p.y>=this.size)return undefined;
  const cell=p.y*this.size+p.x;return p.surface?this.layers.get(p.surface)?.get(cell):cell;
 }
 at(x:number,y:number):readonly number[]{
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=this.size||y>=this.size)return [];
  const cell=y*this.size+x;return [cell,...this.columns.get(cell)??[]];
 }
 /** Static, same-level regions connected only by authored, height-valid portals.
  * Built while loading the map, not separately for each ant's command. Dynamic
  * buildings and bodies still participate in the detailed search below. */
 private buildRegions():void {
  const queue=new Int32Array(this.nodes.length),labels=this.regions;
  for(const node of this.nodes){
   if(labels[node.id]||!this.walkable(node.id))continue;
   const region=++this.regionCount;labels[node.id]=region;
   let head=0,tail=1;queue[0]=node.id;
   while(head<tail){const id=queue[head++]!,a=this.nodes[id]!;
    for(const next of this.neighbors(id)){
     if(labels[next]||this.nodes[next]!.level!==a.level)continue;
     labels[next]=region;queue[tail++]=next;
    }
   }
  }
  // Only deck endpoints can contribute cross-level edges. Avoid a second
  // whole-ground scan to discover the handful of authored connections.
  for(let id=this.groundCount;id<this.nodes.length;id++){
   const from=labels[id];if(!from)continue;
   for(const next of this.neighbors(id)){
    const to=labels[next];if(!to||to===from)continue;
    const a=this.regionLinks.get(from)??new Set<number>(),b=this.regionLinks.get(to)??new Set<number>();
    a.add(to);b.add(from);this.regionLinks.set(from,a);this.regionLinks.set(to,b);
   }
  }
  let component=0;
  for(let start=1;start<=this.regionCount;start++){
   if(this.components[start])continue;
   this.components[start]=++component;const open=[start];
   for(let i=0;i<open.length;i++)for(const to of this.regionLinks.get(open[i]!)??[]){
    if(this.components[to])continue;this.components[to]=component;open.push(to);
   }
  }
 }
 connected(from:number,to:number):boolean {
  const target=this.regions[to];if(!target)return false;
  const origin=this.regions[from];
  if(origin)return this.components[origin]===this.components[target];
  // Preserve the established ability to leave a newly obstructed origin.
  return this.neighbors(from).some(id=>this.components[this.regions[id]!]===this.components[target]);
 }
 topology(){return {regions:this.regionCount,connections:[...this.regionLinks.values()].reduce((n,links)=>n+links.size,0)/2};}
 /** A single cardinal edge, also used by the existing fixed-point supercover. */
 step(from:number,to:number,blocked?:(node:SurfaceNode)=>boolean):boolean {
  const a=this.nodes[from],b=this.nodes[to];
  if(!a||!b)return false;
  if(from===to)return this.walkable(to)&&!blocked?.(b);
  const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  if(dx>1||dy>1||!dx&&!dy||dx&&dy&&a.surface!==b.surface)return false;
  return this.edge(a,b,blocked);
 }
 /** Deck undersides block tall bodies, but leave a traversable floor where
  * clearance permits. Pillars and abutments are separate ground blockers. */
 walkable(id:number):boolean {
  const n=this.nodes[id];if(!n||(!n.surface&&!this.groundWalkable[n.cell])||n.height<this.groundHeights[n.cell]!)return false;
  for(const other of this.columns.get(n.cell)??[]){
   if(other===id)continue;const upper=this.nodes[other]!,deck=this.decks.get(upper.surface!)!;
   const bottom=upper.height-Math.round(deck.thickness*100);
   // Adjacent pieces can share a coplanar seam. A solid ending at our feet
   // is supporting floor, not an overhead obstruction.
   if(upper.height>n.height && bottom<n.height+BODY_CLEARANCE_CM)return false;
  }
  return true;
 }
 private connects(n:SurfaceNode,level:number):boolean {
  if(!n.surface)return false;const b=this.decks.get(n.surface)!;
  const z=b.s*(n.x-b.x)+b.c*(n.y-b.z);
  return z<=-b.depth/2+1.5+(b.rampLengths?.[0]??0)&&b.connections?.start===level || z>=b.depth/2-1.5-(b.rampLengths?.[1]??0)&&b.connections?.end===level;
 }
 private edge(a:SurfaceNode,b:SurfaceNode,blocked?:(node:SurfaceNode)=>boolean):boolean {
  if(!this.walkable(b.id)||blocked?.(b)||Math.abs(a.height-b.height)>MAX_GROUND_STEP_CM)return false;
  // Rail edges never become ramps simply because terrain happens to be near.
  return a.level===b.level || this.connects(a,b.level)||this.connects(b,a.level);
 }
 neighbors(id:number,blocked?:(node:SurfaceNode)=>boolean):number[]{
  const a=this.nodes[id];if(!a)return [];
  const result:number[]=[];
  for(const [dx,dy]of DIRECTIONS){
   const x=a.x+dx,y=a.y+dy;if(x<0||y<0||x>=this.size||y>=this.size)continue;
   const cell=y*this.size+x;
   for(const next of [cell,...this.columns.get(cell)??[]]){
    const b=this.nodes[next]!;if(!this.edge(a,b,blocked))continue;
    if(dx&&dy){
     // Cross-layer transitions use cardinal portals, avoiding diagonal leaks
     // through railings and corners where only one ramp entrance is clear.
     if(a.surface!==b.surface)continue;
     const sx=this.node({x:a.x+dx,y:a.y,surface:a.surface}),sy=this.node({x:a.x,y:a.y+dy,surface:a.surface});
     if(sx===undefined||sy===undefined||!this.edge(a,this.nodes[sx]!,blocked)||!this.edge(a,this.nodes[sy]!,blocked)||!this.edge(this.nodes[sx]!,b,blocked)||!this.edge(this.nodes[sy]!,b,blocked))continue;
    }
    result.push(next);
   }
  }
  return result;
 }
 /** Integer A*, stable ties. The optional occupancy query is layer-specific. */
 path(from:SurfacePoint,to:SurfacePoint,blocked?:(node:SurfaceNode)=>boolean,maxCost=Infinity):SurfaceNode[]|null {
  this.lastExpanded=0;
  const start=this.node(from),goal=this.node(to);
  if(start===undefined||goal===undefined||!this.walkable(goal)||blocked?.(this.nodes[goal]!))return null;
  if(start===goal)return [];
  if(!this.connected(start,goal))return null;
  // Reuse sparse-search state. A command must not allocate/fill several arrays
  // proportional to a 512² map for each member of the selection.
  if(++this.search>=0xffffffff){this.seen.fill(0);this.closed.fill(0);this.search=1;}
  const search=this.search,cost=this.costs,prev=this.previous,closed=this.closed,seen=this.seen;
  const target=this.nodes[goal]!,heuristic=(id:number)=>{const p=this.nodes[id]!,dx=Math.abs(p.x-target.x),dy=Math.abs(p.y-target.y);return Math.max(dx,dy)*1000+Math.min(dx,dy)*414;};
  type Entry={id:number;g:number;h:number};const heap:Entry[]=[];
  const better=(a:Entry,b:Entry)=>a.g+a.h<b.g+b.h||(a.g+a.h===b.g+b.h&&(a.h<b.h||a.h===b.h&&a.id<b.id));
  const push=(v:Entry)=>{let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(!better(v,heap[p]!))break;heap[i]=heap[p]!;i=p;}heap[i]=v;};
  const pop=()=>{const top=heap[0]!,v=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&better(heap[c+1]!,heap[c]!))c++;if(!better(heap[c]!,v))break;heap[i]=heap[c]!;i=c;}heap[i]=v;}return top;};
  cost[start]=0;seen[start]=search;push({id:start,g:0,h:heuristic(start)});
  while(heap.length){const cur=pop();if(closed[cur.id]===search||cost[cur.id]!==cur.g)continue;
   if(cur.id===goal){const route:SurfaceNode[]=[];for(let at=goal;at!==start;at=prev[at]!)route.push(this.nodes[at]!);return route.reverse();}
   closed[cur.id]=search;this.lastExpanded++;const a=this.nodes[cur.id]!;
   for(const id of this.neighbors(cur.id,blocked)){
    if(closed[id]===search)continue;const b=this.nodes[id]!,g=cur.g+(a.x!==b.x&&a.y!==b.y?1414:1000);
    const h=heuristic(id);if(g+h>maxCost||seen[id]===search&&g>=cost[id]!)continue;
    seen[id]=search;cost[id]=g;prev[id]=cur.id;push({id,g,h});
   }
  }
  return null;
 }
 height(p:SurfacePoint):number|undefined {
  if(p.surface){const b=this.decks.get(p.surface);return b?surfaceHeight(b,p.x,p.y):undefined;}
  const x=Math.max(0,Math.min(this.size-1,p.x)),y=Math.max(0,Math.min(this.size-1,p.y));
  const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,this.size-1),jy=Math.min(iy+1,this.size-1),u=x-ix,v=y-iy,h=this.groundHeights,n=this.size;
  return ((h[iy*n+ix]!*(1-u)+h[iy*n+jx]!*u)*(1-v)+(h[jy*n+ix]!*(1-u)+h[jy*n+jx]!*u)*v)/100;
 }
 /** Both floor and solid bridge slabs intercept a straight projectile. */
 shotClear(a:SurfacePoint,b:SurfacePoint):boolean {
  if(!a.surface&&!b.surface&&!this.crossesSurface(a,b))return this.groundTactical.shotClear(a,b);
  const ah=this.height(a),bh=this.height(b);if(ah===undefined||bh===undefined)return false;
  const from=ah+(a.elevation??0)+SIGHT_HEIGHT_CM/100,to=bh+(b.elevation??0)+SIGHT_HEIGHT_CM/100,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,to-from)*4));
  if(this.intersectsDeck(a,b,from,to))return false;
  for(let i=1;i<steps;i++){
   const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,height=from+(to-from)*t;
   if(this.height({x,y})!>height)return false;
  }
  return true;
 }
 private intersectsDeck(a:SurfacePoint,b:SurfacePoint,from:number,to:number):boolean {
  for(const d of this.decks.values()){
   const ax=d.c*(a.x-d.x)-d.s*(a.y-d.z),az=d.s*(a.x-d.x)+d.c*(a.y-d.z);
   const dx=d.c*(b.x-a.x)-d.s*(b.y-a.y),dz=d.s*(b.x-a.x)+d.c*(b.y-a.y);
   let enter=0,exit=1;
   for(const [p,v,half] of [[ax,dx,d.width/2],[az,dz,d.depth/2]]){
    if(Math.abs(v!)<1e-10){if(Math.abs(p!)>half!){exit=-1;break;}continue;}
    const t1=(-half!-p!)/v!,t2=(half!-p!)/v!;
    enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
   }
   if(enter>exit)continue;
   const signed=(t:number)=>{const z=az+dz*t;return from+(to-from)*t-(d.triangles?(surfaceHeight(d,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)??-Infinity):(d.base+d.height+d.arch*Math.cos(z*Math.PI/d.depth)+(d.rise??0)*(z/d.depth+.5)));};
   const steps=Math.max(1,Math.ceil((exit-enter)*Math.hypot(dx,dz,to-from)*4));
   let previous=signed(enter);
   if(previous<=0&&previous>=-d.thickness)return true;
   for(let i=1;i<=steps;i++){
    const current=signed(enter+(exit-enter)*i/steps);
    // Crossing the whole slab between samples still counts, even for a very
    // thin plank. Point-only ray marching could miss it entirely.
    if(Number.isFinite(previous)&&Number.isFinite(current)&&Math.min(previous,current)<=0&&Math.max(previous,current)>=-d.thickness)return true;
    previous=current;
   }
  }
  return false;
 }
 visible(a:SurfacePoint,b:SurfacePoint):boolean {
  if(!a.surface&&!b.surface&&!this.crossesSurface(a,b))return this.groundTactical.visible(a,b);
  const ah=this.height(a),bh=this.height(b);return ah!==undefined&&bh!==undefined&&bh+(b.elevation??0)<=ah+(a.elevation??0)+SIGHT_HEIGHT_CM/100&&this.shotClear(a,b);
 }
 meleeClear(a:SurfacePoint,b:SurfacePoint):boolean {
  if(!a.surface&&!b.surface&&!this.crossesSurface(a,b))return this.groundTactical.meleeClear(a,b);
  const ah=this.height(a),bh=this.height(b);return ah!==undefined&&bh!==undefined&&Math.abs(ah-bh)<=MAX_GROUND_STEP_CM/100&&this.shotClear(a,b);
 }
 private crossesSurface(a:SurfacePoint,b:SurfacePoint):boolean {
  const loX=Math.min(a.x,b.x),hiX=Math.max(a.x,b.x),loY=Math.min(a.y,b.y),hiY=Math.max(a.y,b.y);
  return this.bounds.some(r=>hiX>=r.loX&&loX<=r.hiX&&hiY>=r.loY&&loY<=r.hiY);
 }
}
