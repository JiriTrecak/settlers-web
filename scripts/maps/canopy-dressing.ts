import {clearRoadCover} from './road-cover';
/** A reproducible environment pass over an authored strategic layout. */
import {HeightField,decodeHeight} from '../../src/shared/map/height';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import type {UtcMap,MapStamp} from '../../src/shared/map/utcmap';
import type {Placement} from '../../src/content/schema';
export function dressCanopyMap(source:UtcMap,seed=7143):UtcMap {
 const map=structuredClone(source),landscape=map.landscape??emptyLandscape(),f=new HeightField(map.size);
 if(map.height)f.load(decodeHeight(map.height,map.size)!,map.waterLevel??0);
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const routes=landscape.strokes.filter(s=>s.layer==='road'||s.layer==='sand');
 const pathDistance=(x:number,y:number)=>routes.length?Math.min(...routes.flatMap(r=>r.points.slice(1).map((b,i)=>{const a=r.points[i],dx=b.x-a.x,dy=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.z)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a.x-t*dx,y-a.z-t*dy)-r.radius;}))):100;
 const trees=map.entities.filter(e=>e.definition==='resource.forest.tree'),other=map.entities.filter(e=>e.definition!=='resource.forest.tree');
 const safe=(x:number,y:number,r:number)=>pathDistance(x,y)>r&&map.playerStarts.every(p=>Math.hypot(x-p.x,y-p.z)>r+26)&&map.camps.every(c=>Math.hypot(x-c.home.x,y-c.home.y)>r+14)&&other.every(e=>Math.hypot(x-e.position.x,y-e.position.y)>r+10);
 const trunks:{x:number,y:number,s:number}[]=[];
 for(const t of trees){const {x,y}=t.position;
  if(x<18||y<18||x>map.size-18||y>map.size-18||!safe(x,y,10)||trunks.some(p=>Math.hypot(x-p.x,y-p.y)<29)||trees.filter(p=>Math.hypot(x-p.position.x,y-p.position.y)<10).length<12)continue;
  // Roots need genuinely flat ground, not a ramp or a cliff lip.
  const heights=[f.sample(x,y),f.sample(x+7,y),f.sample(x-7,y),f.sample(x,y+7),f.sample(x,y-7)];
  if(Math.max(...heights)-Math.min(...heights)>.8||Math.min(...heights)<.5)continue;
  trunks.push({x,y,s:.85+random()*.3});
 }
 const entities:Placement[]=map.entities.filter(e=>e.definition!=='resource.forest.tree'||!trunks.some(p=>Math.hypot(e.position.x-p.x,e.position.y-p.y)<8*p.s)).map(e=>e.definition==='resource.forest.tree'?{...e,appearance:{...e.appearance,scale:.48+random()*.15}}:e);
 const stamps:MapStamp[]=map.stamps.map(s=>{
  if(s.asset==='ant-fern')return {...s,asset:'fern-thicket',scale:(s.scale??1)*.55};
  if(s.asset==='ant-broadleaf')return {...s,asset:'bramble-thicket',scale:(s.scale??1)*.5};
  if(s.asset.startsWith('lowpolymushroom'))return {...s,asset:'ochre-mushroom-colony',scale:(s.scale??1)*.35};
  return s;
 });
 const prop=(asset:string,x:number,y:number,scale:number,yaw=random()*6.28)=>stamps.push({id:`canopy.dressing.${stamps.length}`,asset,x,y,scale,yaw});
 for(const t of trunks){
  prop('ancient-canopy-trunk',t.x,t.y,t.s);
  for(let i=0;i<8;i++){const a=random()*6.28,r=8*t.s+random()*3,x=t.x+Math.cos(a)*r,y=t.y+Math.sin(a)*r;
   if(f.sample(x,y)<.3||pathDistance(x,y)<2)continue;
   prop(['fern-thicket','bramble-thicket','curled-forest-leaf','ochre-mushroom-colony','fallen-acorn','forest-splinter-pile'][i%6],x,y,.5+random()*.6);
  }
 }
 // Every starting clearing gets quiet edge details; build pads stay free of blockers.
 for(const p of map.playerStarts)for(let i=0;i<14;i++){
  const a=i/14*Math.PI*2,r=23+random()*5,x=p.x+Math.cos(a)*r,y=p.z+Math.sin(a)*r;
  if(f.sample(x,y)<.3||pathDistance(x,y)<2||other.some(e=>Math.hypot(x-e.position.x,y-e.position.y)<7))continue;
  prop(['fern-thicket','bramble-thicket','curled-forest-leaf','fallen-acorn'][i%4],x,y,.7+random()*.4);
 }
 for(const cover of landscape.cover){cover.density=Math.min(2.4,Math.max(1.8,cover.density));cover.grassScale=.7;cover.broadRatio=.8;cover.flowers=Math.min(.06,cover.flowers);}
 landscape.environment={...landscape.environment,preset:'under-canopy',hour:10,canopy:{...DEFAULT_CANOPY,enabled:true,height:map.size===512?46:30,scale:48,coverage:.75,seed:7143},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:true,color:'#a5b3a5',density:.0035,heightFalloff:10,sunStrength:2.4,noiseStrength:.45,driftSpeed:.45}};
 clearRoadCover(landscape.cover,landscape.strokes);
 return {...map,entities,stamps,landscape};
}
