import {forestWarfareDressing} from '../maps/forest-warfare-dressing';
/** A roof-cutaway heartwood dungeon, with a raised root over a second route. */
import {readFileSync,writeFileSync} from 'node:fs';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap,type MapStamp,type UtcMap} from '../../src/shared/map/utcmap';
import {emptyLandscape,sampleCurve,curveDistance,type CurvePoint} from '../../src/shared/landscape/curve';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {playableMapError} from '../../src/shared/map/playable';
import {entity} from './canopyMissionMap';
import type {Placement} from '../../src/content/schema';
let seed=7905;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const rooms=[{x:79,z:188,rx:20,rz:19},{x:128,z:145,rx:32,rz:27},{x:181,z:136,rx:21,rz:20},{x:165,z:77,rx:24,rz:23},{x:77,z:110,rx:19,rz:17}];
const paths:CurvePoint[][]=[[{x:79,z:188},{x:101,z:176},{x:119,z:172},{x:130,z:163},{x:130,z:127},{x:153,z:124},{x:181,z:136}],[{x:101,z:176},{x:102,z:153},{x:112,z:143},{x:148,z:143},{x:169,z:148},{x:181,z:136}],[{x:181,z:136},{x:189,z:111},{x:177,z:95},{x:165,z:77}],[{x:130,z:127},{x:110,z:112},{x:93,z:107},{x:77,z:110}]];
const pathsCurved=paths.map(p=>sampleCurve(p,7,1));
const pathDistance=(x:number,z:number)=>Math.min(...pathsCurved.map(c=>curveDistance(x,z,c)));
const roomDistance=(x:number,z:number,r:typeof rooms[number])=>Math.hypot((x-r.x)/r.rx,(z-r.z)/r.rz);
const floorDistance=(x:number,z:number)=>Math.min(pathDistance(x,z),...rooms.map(r=>roomDistance(x,z,r)));
const stream:CurvePoint[]=[{x:110,z:151,radius:2.3},{x:125,z:153,radius:2.6},{x:141,z:157,radius:2.9},{x:154,z:161,radius:2.1},{x:159,z:169,radius:2}];
const streamCurve=sampleCurve(stream,2.5,1),f=new HeightField(256);f.waterLevel=0;
for(let iz=0;iz<f.verts;iz++)for(let ix=0;ix<f.verts;ix++){
 const x=ix+f.origin,z=iz+f.origin,d=floorDistance(x,z),water=curveDistance(x,z,streamCurve);
 let h=d<=1?2.4:2.4+Math.min(1,(d-1)*9)*9.6;
 if(d<.95&&water<1.55)h=Math.min(h,Math.max(-2.3,2.4-(1.55-water)*5));
 f.samples[iz*f.verts+ix]=h;
}
const landscape=emptyLandscape();landscape.environment={interior:true,ceilingHeight:18,floorMaterial:'heartwood',preset:'heartwood-interior',hour:10,season:'summer',playing:false,weather:{kind:'spores',intensity:.5,windX:.12,windZ:-.08},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:true,color:'#8a8e9f',sunTint:'#e6cfab',density:.0015,baseHeight:0,heightFalloff:6,sunStrength:.3,noiseStrength:.3,driftSpeed:.12,regions:[{id:'underground-stream',x:132,y:1,z:155,radiusX:24,radiusY:2,radiusZ:9,density:.007}]}};
landscape.water={rippleScale:.12,rippleStrength:.025,cloudStrength:0,foamStrength:.12,causticStrength:.1,reflectionStrength:.7,shallowColor:'#424f4c',deepColor:'#152a33',clarity:2.5,flowSpeed:.3};landscape.rivers=[{points:stream,radius:2.5,depth:2.3}];
type StampDraft={-readonly [K in keyof MapStamp]:MapStamp[K]};
const stamps:StampDraft[]=[];function prop(asset:string,x:number,y:number,scale=1,yaw=random()*Math.PI*2){const s:StampDraft={id:`vault.prop.${stamps.length}`,asset,x,y,scale,yaw};stamps.push(s);return s;}
const root=prop('arched-root-walkway',129.5,144.5,1.5,0);root.id='vault-root';root.walk={level:1,height:11.4};
// The terrain is solid heartwood. These modular faces add grain and shelf fungi
// along carved rooms, with deliberate gaps wherever a corridor enters.
for(const room of rooms){const count=Math.ceil(Math.PI*(room.rx+room.rz)/13);
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,x=room.x+Math.cos(a)*(room.rx+1.6),z=room.z+Math.sin(a)*(room.rz+1.6);
  if(pathDistance(x,z)<1.45||rooms.some(other=>other!==room&&roomDistance(x,z,other)<1.12))continue;
  const wall=prop('heartwood-wall',x,z,.9,-a-Math.PI/2);wall.elevation=2.4-f.sample(x+.5,z+.5);wall.heightScale=.75+random()*.25;
  if(room!==rooms[4]&&(room!==rooms[3]||Math.sin(a)>.25)){const lamp=prop('amber-resin-sconce',room.x+Math.cos(a)*(room.rx-3),room.z+Math.sin(a)*(room.rz-3),.8,-a-Math.PI/2);lamp.elevation=2.4-f.sample(lamp.x+.5,lamp.y+.5);}
 }}
for(const p of [{x:110,z:170},{x:147,z:127},{x:159,z:143},{x:181,z:112},{x:163,z:97},{x:93,z:106}])prop('amber-resin-sconce',p.x,p.z,.95,0);
// A single readable landmark explains the recovery beat. Keep its solid basin
// against the chamber margin, clear of the guards and both passage mouths.
const wellspring=prop('heartwood-resin-font',192,140,1.4,-Math.PI/2);wellspring.id='vault-wellspring';
// The optional alcove reads as a cool fungal nursery rather than another
// amber-lit chamber. Its two groves frame the reward fight from the margins.
const grove=prop('lanterncap-grove',65,115,1.1,.35);grove.id='vault-fungal-grove';
const nursery=prop('lanterncap-grove',83,100,.75,-.7);nursery.id='vault-fungal-nursery';
// A unique living landmark anchors the northern fight. Its long roots stay
// behind the guards; only the southern chamber lamps compete with its light.
const heart=prop('bitter-heart',166,65,1.3,0);heart.id='vault-bitter-heart';
const landmarkClearance=(x:number,z:number)=>Math.hypot(x-wellspring.x,z-wellspring.y)<6||Math.hypot(x-grove.x,z-grove.y)<5.8||Math.hypot(x-nursery.x,z-nursery.y)<4||Math.hypot(x-heart.x,z-heart.y)<9.5;
const entities:Placement[]=[entity('marshal','unit.ants.marshal',79,188,'player.1',{initialState:{experience:1400}})];
for(let i=0;i<4;i++)entities.push(entity(`guard-${i}`,'unit.ants.warrior',75+i*2,192));for(let i=0;i<3;i++)entities.push(entity(`archer-${i}`,'unit.ants.archer',76+i*2,195));
const camps:UtcMap['camps']=[];
function camp(id:string,x:number,y:number,types:string[],drops:string[]){const members=types.map((definition,i)=>{const name=`${id}.${i}`;entities.push(entity(name,definition,x+i%2*3,y+Math.floor(i/2)*3,'none'));return name;});camps.push({id,members,home:{x,y},aggroRange:8,leash:15,aggression:'players',mapKnowledge:'hidden',fixedDrops:drops});}
camp('root-sentries',142,140,['unit.neutral.wolf','unit.neutral.wolf','unit.neutral.thornspitter'],[]);
camp('resin-guard',180,134,['unit.neutral.ogre','unit.neutral.thornspitter'],['item.trailkeeper-flask']);
camp('fungal-cache',76,107,['unit.neutral.elder-thornspitter','unit.neutral.wolf'],['item.barkguard']);
camp('heart-keeper',164,80,['unit.neutral.thornblade-matriarch','unit.neutral.thornspitter','unit.neutral.thornspitter'],['item.thornband']);
for(const room of rooms)for(let i=0;i<26;i++){const a=random()*Math.PI*2,r=.76+random()*.19,x=room.x+Math.cos(a)*room.rx*r,z=room.z+Math.sin(a)*room.rz*r;
 if(f.sample(x,z)<1.9||f.sample(x,z)>3||pathDistance(x,z)<.8||landmarkClearance(x,z)||entities.some(e=>Math.hypot(e.position.x-x,e.position.y-z)<5))continue;
 prop(i%3?'ochre-mushroom-colony':'forest-splinter-pile',x,z,.45+random()*.8);
 if(i%4===0)landscape.cover.push({x,z,radius:2.3,density:1.4,seed:i+room.x,flowers:0,grassScale:.4,broadRatio:.8,palette:'forest'});
}
// Damp chamber margins grow dense colonies, leaving the main travel lanes bare.
for(const room of rooms)for(let i=0;i<150;i++){
 const a=random()*Math.PI*2,r=.72+random()*.26,x=room.x+Math.cos(a)*room.rx*r,z=room.z+Math.sin(a)*room.rz*r;
 if(f.sample(x,z)<1.9||f.sample(x,z)>3||pathDistance(x,z)<1.15||landmarkClearance(x,z)||entities.some(e=>Math.hypot(e.position.x-x,e.position.y-z)<4))continue;
 const palette=['synty-plant-mushrooms-01','ochre-mushroom-colony','synty-plant-fern-02','forest-splinter-pile','curled-forest-leaf'];
 prop(palette[i%palette.length],x,z,.3+random()*.55);
 if(i%2===0)landscape.cover.push({x,z,radius:1.8+random()*1.4,density:2,seed:i*7+room.x,flowers:0,grassScale:.3,broadRatio:.85,palette:'forest'});
}
landscape.decals=[];for(let i=0;i<60;i++){const room=rooms[i%rooms.length],a=random()*Math.PI*2,r=random()*.8,x=room.x+Math.cos(a)*room.rx*r,z=room.z+Math.sin(a)*room.rz*r;if(f.sample(x,z)>1.5)landscape.decals.push({id:`vault-litter-${i}`,kind:'leaf-litter',x,z,size:1+random()*2,rotation:random()*360,opacity:.25});}
// Large porous beds connect the existing small foliage clusters. Keep the
// centre lanes and chamber entrances open; the northern rot owns its own palette.
for(const room of rooms.slice(0,4).filter(room=>room.x!==165)){
 const count=Math.ceil((room.rx+room.rz)/4);
 for(let i=0;i<count;i++){
  const angle=i/count*Math.PI*2+.19,x=room.x+Math.cos(angle)*room.rx*.84,z=room.z+Math.sin(angle)*room.rz*.84;
  if(pathDistance(x,z)<1.1||landmarkClearance(x,z))continue;
  landscape.decals.push({id:`vault-mycelium-${room.x}-${i}`,kind:'mycelium-bed',x,z,size:10+random()*5,rotation:random()*360,opacity:.72});
 }
}
// Cooler, denser growth defines the optional fungal nursery.
for(const [i,x,z,size] of [[0,70,119,13],[1,85,116,11],[2,81,101,12]] as const)
 landscape.decals.push({id:`vault-nursery-bed-${i}`,kind:'mycelium-bed',x,z,size,rotation:i*113,opacity:.85});
landscape.decals.push({id:'vault-heart-rot',kind:'root-rot',x:166,z:67,size:28,rotation:18,opacity:.85});
landscape.decals.push({id:'vault-heart-rot-trail',kind:'root-rot',x:165,z:79,size:16,rotation:117,opacity:.35});
const map:UtcMap={...emptyUtcMap(),name:'The Heartwood Vault',description:'Below the hollow gate, amber lights reveal chambers carved through living wood. Lead a small company across the root crown, through the lower gallery, and into the corrupted heart.',height:encodeHeight(f.samples,256),waterLevel:0,landscape,stamps,entities,camps,playerStarts:[{player:1,x:79,z:188,setup:'setup.ants',mainFort:'mound'}],mission:{campaign:'vanguard',company:['marshal','guard-0','guard-1','guard-2','guard-3','archer-0','archer-1','archer-2'],order:5,title:'Mission 5 — The Heartwood Vault',heroLevelCap:8,regions:[{id:'gallery',x:130,y:143,radius:15},{id:'resin-room',x:180,y:136,radius:15},{id:'heart',x:165,y:80,radius:18},{id:'fungal-cache',x:77,y:110,radius:17}],objectives:[{id:'gallery',title:'Explore the root gallery',description:'Lead the Marshal into the great chamber. The root crown and the lower gallery are separate paths.'},{id:'resin-room',title:'Secure the resin chamber',description:'Defeat both guardians in the eastern amber-lit room.'},{id:'heart',title:'Silence the Heart Keeper',description:'Defeat the matriarch and its two guards in the northern vault. Keep the Marshal alive.'},{id:'fungal-cache',title:'Search the fungal alcove',description:'Clear the western side chamber to recover a Barkguard.',optional:true}],script:readFileSync(new URL('./heartwood-vault.lua',import.meta.url),'utf8')}};
const parsed=parseUtcMap(map);if(!parsed)throw new Error('Invalid Heartwood Vault');const error=playableMapError(parsed);if(error)throw new Error(error);
writeFileSync(new URL('../../assets/maps/campaign/vanguard-heartwood-vault.utcmap',import.meta.url),stringifyUtcMap(forestWarfareDressing(map)));console.log({rooms:rooms.length,props:stamps.length,units:entities.length});
