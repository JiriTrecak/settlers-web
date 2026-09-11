import type {Point} from './state';
type Member=Point & {id:number};
/** Compact walkable destinations, assigned spatially rather than by selection order.
 * Pair exchanges reduce travel/crossing without an unbounded per-order assignment solver.
 */
export function formationDestinations(members:readonly Member[], destination:Point, size:number, walkable:(p:Point)=>boolean,straight:(from:Point,to:Point)=>boolean=()=>true):Map<number,Point>{
 const result=new Map<number,Point>();if(!members.length)return result;
 // Preserve an already compact footprint through a clear translation. A
 // routine micro order should not reshuffle neighbors into a new diamond.
 if(members.length>1){
  const actors=[...members].sort((a,b)=>a.x-b.x||a.y-b.y||a.id-b.id);
  const rounded=actors.map(a=>({x:Math.round(a.x),y:Math.round(a.y)}));
  const width=Math.max(...rounded.map(p=>p.x))-Math.min(...rounded.map(p=>p.x))+1;
  const height=Math.max(...rounded.map(p=>p.y))-Math.min(...rounded.map(p=>p.y))+1;
  const maxSpan=Math.ceil(Math.sqrt(actors.length))*2;
  if(width*height<=actors.length*2&&width<=maxSpan&&height<=maxSpan){
   const center={x:Math.round(actors.reduce((sum,a)=>sum+a.x,0)/actors.length),y:Math.round(actors.reduce((sum,a)=>sum+a.y,0)/actors.length)};
   const translated=rounded.map(p=>({x:p.x+destination.x-center.x,y:p.y+destination.y-center.y}));
   if(new Set(translated.map(p=>p.y*size+p.x)).size===actors.length&&translated.every((p,i)=>
    p.x>=0&&p.y>=0&&p.x<size&&p.y<size&&walkable(p)&&straight(actors[i],p))){
    actors.forEach((a,i)=>result.set(a.id,translated[i]));return result;
   }
  }
 }
 const slots:Point[]=[];
 const searchRadius=Math.min(size-1,Math.max(12,Math.ceil(Math.sqrt(members.length))*3));
 for(let radius=0;slots.length<members.length && radius<=searchRadius;radius++){
  const ring:Point[]=[];
  const consider=(x:number,y:number)=>{
   const p={x:destination.x+x,y:destination.y+y};
   if(p.x>=0&&p.y>=0&&p.x<size&&p.y<size&&walkable(p))ring.push(p);
  };
  if(radius===0)consider(0,0);
  else {
   for(let x=-radius;x<=radius;x++){consider(x,-radius);consider(x,radius);}
   for(let y=1-radius;y<radius;y++){consider(-radius,y);consider(radius,y);}
  }
  ring.sort((a,b)=>(a.x-destination.x)**2+(a.y-destination.y)**2-((b.x-destination.x)**2+(b.y-destination.y)**2)||a.y-b.y||a.x-b.x);
  slots.push(...ring.slice(0,members.length-slots.length));
 }
 const actors=[...members].sort((a,b)=>a.x-b.x||a.y-b.y||a.id-b.id);
 slots.sort((a,b)=>a.x-b.x||a.y-b.y);
 const cost=(a:Member,b:Point)=>Math.round((a.x-b.x)*1000)**2+Math.round((a.y-b.y)*1000)**2;
 const count=Math.min(actors.length,slots.length);
 for(let pass=0;pass<3;pass++){
  let changed=false;
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
   if(cost(actors[i],slots[j])+cost(actors[j],slots[i])<cost(actors[i],slots[i])+cost(actors[j],slots[j])){
    [slots[i],slots[j]]=[slots[j],slots[i]];changed=true;
   }
  }
  if(!changed)break;
 }
 for(let i=0;i<count;i++)result.set(actors[i].id,slots[i]);
 return result;
}
