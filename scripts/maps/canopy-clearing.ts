/** Reproducible playable art-direction showcase: ant-scale settlement under a giant forest. */
import {writeFileSync} from 'node:fs';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {emptyUtcMap,stringifyUtcMap,parseUtcMap,type UtcMap,type MapStamp} from '../../src/shared/map/utcmap';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {playableMapError} from '../../src/shared/map/playable';
import type {Placement} from '../../src/content/schema';
let seed=91723;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const f=new HeightField(256);f.waterLevel=0;
const starts=[{x:100,z:160},{x:158,z:85}];
const routes=[[{x:103,z:155},{x:113,z:138},{x:119,z:116},{x:140,z:101},{x:157,z:94}],[{x:112,z:164},{x:135,z:176},{x:171,z:168},{x:182,z:135},{x:174,z:105},{x:158,z:94}]];
const distance=(x:number,z:number)=>Math.min(...routes.flatMap(r=>r.slice(1).map((b,i)=>{const a=r[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);} )));
for(let z=0;z<f.verts;z++)for(let x=0;x<f.verts;x++){
 const wx=x+f.origin,wz=z+f.origin;const edge=Math.hypot((wx-133)/100,(wz-131)/110);
 let h=1+Math.max(0,Math.min(1,(edge-.83)*12))*6;
 const pond=Math.hypot((wx-150)/20,(wz-137)/23);
 if(pond<1.12)h=Math.min(h,Math.max(-3.6,(pond-.98)*10));
 f.samples[z*f.verts+x]=h;
}
const landscape=emptyLandscape();landscape.environment={preset:'under-canopy',hour:9.2,season:'summer',playing:false,weather:{kind:'clear',intensity:0,windX:.7,windZ:.25},canopy:{...DEFAULT_CANOPY,enabled:true,height:27,scale:42,coverage:.78,seed:811},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:true,density:.0035,baseHeight:2,heightFalloff:10,sunStrength:2.4,color:'#a5b3a5',noiseStrength:.45,driftSpeed:.45,regions:[{id:'pond-mist',x:150,y:1,z:137,radiusX:22,radiusY:3,radiusZ:24,density:.012}]}};
for(const points of routes)landscape.strokes.push({points,radius:2.1,layer:'road',opacity:.38});
const entities:Placement[]=[];const stamps:MapStamp[]=[];
const add=(id:string,definition:string,x:number,y:number,owner:Placement['owner']='none')=>{entities.push({id,definition,position:{x,y},rotation:0,owner});};
const stamp=(asset:string,x:number,y:number,scale=1,yaw=0)=>stamps.push({id:`canopy.prop.${stamps.length}`,asset,x,y,scale,yaw});
for(const [i,p] of starts.entries()){
 add(`canopy.mine.${i}`,'building.neutral.amber-mine',p.x-12,p.z+17);
 add(`canopy.barracks.${i}`,'building.ants.barracks',p.x+13,p.z-8,`player.${i+1}` as Placement['owner']);
 add(`canopy.house.${i}`,'building.ants.house',p.x+12,p.z+9,`player.${i+1}` as Placement['owner']);
 add(`canopy.house-second.${i}`,'building.ants.house',p.x+21,p.z+6,`player.${i+1}` as Placement['owner']);
 for(let j=0;j<6;j++)add(`canopy.army.${i}.${j}`,j<3?'unit.ants.warrior':'unit.ants.archer',p.x+5+j%3*2,p.z+12+Math.floor(j/3)*3,`player.${i+1}` as Placement['owner']);
}
add('canopy.lookout','unit.ants.warrior',100,124,'player.1');
for(const [i,p] of [{x:132,z:182},{x:188,z:125}].entries())add(`canopy.root.${i}`,'building.neutral.corrupted-root',p.x,p.z);
const giants=[{x:91,z:133,s:1.25},{x:121,z:140,s:1.05},{x:67,z:165,s:1.2},{x:130,z:198,s:1.35},{x:185,z:155,s:1.25},{x:196,z:85,s:1.4},{x:138,z:65,s:1.1},{x:103,z:102,s:1.3}];
for(const t of giants){stamp('ancient-canopy-trunk',t.x,t.z,t.s,random()*Math.PI*2);}
stamp('fallen-canopy-bough',81,145,.85,-.3);
stamp('fallen-canopy-bough',174,179,1.1,.45);
const reserved=(x:number,z:number,r=0)=>entities.some(e=>e.definition!=='resource.forest.tree'&&Math.hypot(x-e.position.x,z-e.position.y)<6+r)||starts.some(p=>Math.hypot(x-p.x,z-p.z)<14+r)||giants.some(p=>Math.hypot(x-p.x,z-p.z)<7.5*p.s+r);
// Low harvestable conifers form distinct groves, separate from permanent canopy trunks.
for(let z=48;z<215;z+=2)for(let x=57;x<211;x+=2){
 const xx=x+Math.floor(random()*2),zz=z+Math.floor(random()*2);
 if(f.sample(xx,zz)<.6||f.sample(xx,zz)>3||reserved(xx,zz)||distance(xx,zz)<7||random()<.33)continue;
 const nearHome=starts.some(p=>Math.hypot(xx-p.x,zz-p.z)<29);
 const band=Math.sin(xx*.13)*Math.cos(zz*.11)+Math.sin(xx*.047+zz*.06);
 if(!nearHome&&band<.5)continue;
 const grove=starts.some(p=>Math.hypot((xx-(p.x-16))/9,(zz-(p.z+4))/10)<1||Math.hypot((xx-(p.x-3))/12,(zz-(p.z+24))/7)<1);
 if(nearHome&&!grove)continue;
 entities.push({id:`canopy.tree.${entities.length}`,definition:'resource.forest.tree',owner:'none',position:{x:xx,y:zz},rotation:random()*360,appearance:{asset:random()<.7?'asset.resource.tree-primary':'asset.resource.tree-secondary',scale:.48+random()*.14}});
}
// Tall clumps collect at roots and grove margins; main roads and construction pads stay legible.
const exclusions=[{x:110,z:178,radius:9},...starts.map(p=>({...p,radius:11})),...entities.filter(e=>e.definition.startsWith('building.')).map(e=>({x:e.position.x,z:e.position.y,radius:5}))];
for(let z=58;z<205;z+=11)for(let x=66;x<203;x+=11){
 if(f.sample(x,z)<.6||f.sample(x,z)>3||distance(x,z)<3)continue;
 landscape.cover.push({x:x+random()*3,z:z+random()*3,radius:7+random()*2,density:4.5,seed:Math.floor(random()*1000000),flowers:.025,grassScale:.9+random()*.25,broadRatio:1,palette:'forest',exclusions});
 if(!reserved(x,z,2)&&distance(x,z)>7){stamp('bramble-thicket',x,z,.8+random()*.6,random()*6.28);if(random()<.6)stamp('fern-thicket',x+2,z+1,1.1,random()*6.28);}
}
for(const t of giants)for(let i=0;i<10;i++){
 const a=random()*Math.PI*2,r=(5+random()*3)*t.s,x=t.x+Math.cos(a)*r,z=t.z+Math.sin(a)*r;
 if(f.sample(x,z)<.5||reserved(x,z,-2)||distance(x,z)<4)continue;
 stamp(i%3===0?'ochre-mushroom-colony':i%3===1?'fern-thicket':'bramble-thicket',x,z,i%3===0?.7:1.15,random()*6.28);
}
// Broken rock shelves rather than a uniform necklace around the water.
for(const a of [.1,.45,1.35,2.7,3.15,4.6,5.5]){
 const x=150+Math.cos(a)*23,z=137+Math.sin(a)*26;
 if(distance(x,z)>6&&!reserved(x,z,2)){
  stamp('mossy-boulder-bank',x,z,.55+random()*.45,a+Math.PI/2);
  for(let j=0;j<3;j++)stamp('river-rock-2',x+(random()-.5)*7,z+(random()-.5)*5,.35+random()*.4,random()*6.28);
 }
}
for(const t of giants){
 for(let j=0;j<7;j++){
  const a=random()*6.28,r=(5+random()*4)*t.s,x=t.x+Math.cos(a)*r,z=t.z+Math.sin(a)*r;
  if(f.sample(x,z)<.6||distance(x,z)<4||reserved(x,z,-1))continue;
  stamp(j%3===0?'curled-forest-leaf':j%3===1?'fallen-acorn':'forest-splinter-pile',x,z,.5+random()*.7,random()*6.28);
 }
}
add('canopy.rootworks','building.ants.rootworks',142,187,'player.1');
for(const p of starts){stamp('lantern-post',p.x+4,p.z+11,.8);stamp('splitrail-fence',p.x+15,p.z+15,.9,0);}
const map:UtcMap={...emptyUtcMap(256),name:'Canopy Clearing',description:'An ant colony beneath ancient buttress roots. Low timber groves and amber seams supply the clearings; two paths circle a forest puddle toward contested corrupted roots. A playable lighting and environment showcase.',playerStarts:starts.map((p,i)=>({player:i+1,...p,setup:'setup.ants',mainFort:`start.player.${i+1}/main-fort`})),waterLevel:0,height:encodeHeight(f.samples,256),landscape,entities,stamps,camps:[]};
if(!parseUtcMap(map))throw Error('Invalid map schema');const error=playableMapError(map);if(error)throw Error(error);
writeFileSync('assets/maps/skirmish/canopy-clearing.utcmap',stringifyUtcMap(map));console.log({entities:entities.length,stamps:stamps.length,cover:landscape.cover.length});
