import {forestWarfareDressing} from '../maps/forest-warfare-dressing';
import {clearRoadCover} from '../maps/road-cover';
/** Shared terrain/forest authoring for the Vanguard's settlement chapters. */
import {readFileSync,writeFileSync} from 'node:fs';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {emptyUtcMap,stringifyUtcMap,parseUtcMap,type UtcMap,type MapStamp} from '../../src/shared/map/utcmap';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {PROLOGUE_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import type {Placement} from '../../src/content/schema';
import {content} from '../../src/content/builtin';
import {playableMapError} from '../../src/shared/map/playable';
import {validatePlacements} from '../../src/content/map';
export type Point={x:number,z:number};
type Clearing=Point&{r:number};
export interface Chapter {
 id:string;name:string;description:string;seed:number;start:Point;routes:Point[][];clearings:Clearing[];
 lakes:(Point&{rx:number;rz:number})[];entities:Placement[];camps:UtcMap['camps'];
 objectives:NonNullable<UtcMap['mission']>['objectives'];regions:NonNullable<UtcMap['mission']>['regions'];order:number;cap:number;decorate?:(map:UtcMap)=>void;
}
export const entity=(id:string,definition:string,x:number,y:number,owner:Placement['owner']='player.1',extra:Partial<Placement>={}):Placement=>({id,definition,owner,position:{x,y},rotation:0,...extra});
export function buildChapter(c:Chapter){
 let seed=c.seed;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const f=new HeightField(256);f.samples.fill(1);f.waterLevel=0;
 for(let z=0;z<f.verts;z++)for(let x=0;x<f.verts;x++){
  const wx=x+f.origin,wz=z+f.origin;let h=1+Math.max(0,Math.sin(wx*.02)*Math.cos(wz*.025))*.7;
  for(const l of c.lakes){const d=Math.hypot((wx-l.x)/l.rx,(wz-l.z)/l.rz);if(d<1.15)h=Math.min(h,Math.max(-3,(d-.92)*8));}
  f.samples[z*f.verts+x]=h;
 }
 const distance=(x:number,z:number)=>Math.min(...c.routes.flatMap(route=>route.slice(1).map((b,i)=>{const a=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);})));
 const clearing=(x:number,z:number,pad=0)=>c.clearings.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+pad);
 const landscape=emptyLandscape();
 landscape.environment={preset:'under-canopy',hour:c.order===2?10.2:9.4,season:'summer',playing:false,weather:{kind:'clear',intensity:0,windX:.8,windZ:.3},canopy:{...DEFAULT_CANOPY,enabled:true,height:30,scale:48,coverage:.76,seed:c.seed},atmosphere:{...PROLOGUE_ATMOSPHERE,density:.0035,heightFalloff:10,sunStrength:2.4,regions:c.lakes.map((l,i)=>({id:`pond-${i}`,x:l.x,y:1,z:l.z,radiusX:l.rx,radiusY:3,radiusZ:l.rz,density:.005}))}};
 for(const points of c.routes)landscape.strokes.push({points,radius:3.5,layer:'road',opacity:.65});
 const stamps:MapStamp[]=[];const prop=(asset:string,x:number,y:number,scale=1,yaw=rand()*6.28)=>stamps.push({id:`${c.id}.prop.${stamps.length}`,asset,x,y,scale,yaw});
 const trunks:(Point&{s:number})[]=[];
 for(let z=24;z<238;z+=24)for(let x=24;x<238;x+=24){const xx=x+rand()*10,zz=z+rand()*10;
  if(distance(xx,zz)>45||distance(xx,zz)<15||clearing(xx,zz,10)||f.sample(xx,zz)<.7||rand()<.25)continue;
  const s=.85+rand()*.3;trunks.push({x:xx,z:zz,s});prop('ancient-canopy-trunk',xx,zz,s);
 }
 const entities=[...c.entities];
 const reserved=c.entities.map(e=>{const fp=content.get(e.definition).footprint;return {...e.position,r:fp?Math.max(fp.width,fp.depth)/2+2:2};});
 const overlapsEntity=(x:number,y:number)=>reserved.some(e=>Math.hypot(x-e.x,y-e.y)<e.r);
 for(let z=16;z<243;z+=2)for(let x=16;x<243;x+=2){const xx=x+Math.floor(rand()*2),zz=z+Math.floor(rand()*2),d=distance(xx,zz);
  if(d<6||d>45||overlapsEntity(xx,zz)||clearing(xx,zz)||f.sample(xx,zz)<.6||trunks.some(t=>Math.hypot(xx-t.x,zz-t.z)<8*t.s)||rand()<.22)continue;
  entities.push(entity(`${c.id}.tree.${entities.length}`,'resource.forest.tree',xx,zz,'none',{rotation:rand()*360,appearance:{asset:rand()<.75?'asset.resource.tree-primary':'asset.resource.tree-secondary',scale:.43+rand()*.18}}));
 }
 // Base groves sit just outside the generous construction pad; they are actual timber.
 for(let z=c.start.z-30;z<=c.start.z+30;z+=2)for(let x=c.start.x-30;x<=c.start.x+30;x+=2){
  const r=Math.hypot(x-c.start.x,z-c.start.z);if(r<25||r>33||overlapsEntity(x,z)||distance(x,z)<7||f.sample(x,z)<.6||trunks.some(t=>Math.hypot(x-t.x,z-t.z)<8*t.s)||entities.some(e=>Math.hypot(e.position.x-x,e.position.y-z)<1.8)||rand()<.25)continue;
  entities.push(entity(`${c.id}.base-tree.${entities.length}`,'resource.forest.tree',x,z,'none',{rotation:rand()*360,appearance:{asset:'asset.resource.tree-primary',scale:.48+rand()*.12}}));
 }
 for(const t of trunks)for(let j=0;j<7;j++){const a=rand()*6.28,r=8*t.s+rand()*3,x=t.x+Math.cos(a)*r,z=t.z+Math.sin(a)*r;if(distance(x,z)<5||clearing(x,z)||f.sample(x,z)<.6)continue;prop(['fern-thicket','bramble-thicket','ochre-mushroom-colony','curled-forest-leaf','fallen-acorn'][j%5],x,z,.6+rand()*.5);}
 for(const route of c.routes)for(let i=0;i<route.length-1;i++){
  const p=route[i],q=route[i+1],a=Math.atan2(q.z-p.z,q.x-p.x);
  for(const side of [-1,1]){
   prop('lantern-post',p.x-Math.sin(a)*side*5,p.z+Math.cos(a)*side*5,.7,a);
   for(let j=0;j<4;j++){const t=(j+.5)/4,x=p.x+(q.x-p.x)*t-Math.sin(a)*side*7,z=p.z+(q.z-p.z)*t+Math.cos(a)*side*7;if(clearing(x,z)||f.sample(x,z)<.6)continue;prop(j%2?'bramble-thicket':'fern-thicket',x,z,.65+rand()*.4);}
  }
 }
 for(let z=24;z<238;z+=9)for(let x=24;x<238;x+=9){if(distance(x,z)>38||f.sample(x,z)<.6)continue;
  landscape.cover.push({x,z,radius:6,density:2.4,seed:Math.floor(rand()*100000),flowers:.06,grassScale:.7,broadRatio:.8,palette:'forest',exclusions:[...c.routes.flatMap(r=>r.map(p=>({...p,radius:4}))),{...c.start,radius:15}]});
  if(distance(x,z)>7&&distance(x,z)<12&&!clearing(x,z)){prop('curled-forest-leaf',x,z,.5+rand()*.4);if(rand()<.4)prop('forest-splinter-pile',x+1,z+1,.6);}
 }
 // Small irregular shore groups leave the shallow margin legible.
 for(const l of c.lakes)for(let i=0;i<12;i++){const a=i/12*Math.PI*2+rand()*.2,x=l.x+Math.cos(a)*(l.rx+2),z=l.z+Math.sin(a)*(l.rz+2);if(distance(x,z)>9&&!clearing(x,z))prop('mossy-boulder-bank',x,z,.35+rand()*.3,a);}
 for(const p of c.clearings){prop('lantern-post',p.x-6,p.z+6,.8);prop('splitrail-fence',p.x-8,p.z+5,.7,Math.PI/2);prop('synty-plant-flowerpatch-01',p.x+9,p.z+4,.9);}
 clearRoadCover(landscape.cover,landscape.strokes);
const map:UtcMap={...emptyUtcMap(),name:c.name,description:c.description,height:encodeHeight(f.samples,f.size),waterLevel:0,playerStarts:[{player:1,x:c.start.x,z:c.start.z,setup:'setup.ants',mainFort:'mound'}],landscape,entities,stamps,camps:c.camps,mission:{campaign:'vanguard',title:`Mission ${c.order} — ${c.name}`,order:c.order,heroLevelCap:c.cap,objectives:c.objectives,regions:c.regions,script:readFileSync(new URL(`./${c.id}.lua`,import.meta.url),'utf8')}};
 c.decorate?.(map);
 const parsed=parseUtcMap(map);if(!parsed)throw new Error(`Invalid map ${c.id}`);validatePlacements(parsed,content);const error=playableMapError(parsed);if(error)throw new Error(`${c.id}: ${error}`);
 writeFileSync(new URL(`../../assets/maps/campaign/${c.id}.utcmap`,import.meta.url),stringifyUtcMap(forestWarfareDressing(map)));console.log(`${c.name}: ${entities.length} entities, ${stamps.length} props.`);
}
