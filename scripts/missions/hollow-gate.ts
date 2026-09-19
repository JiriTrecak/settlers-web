import {forestWarfareDressing} from '../maps/forest-warfare-dressing';
/** Authored outdoor approach: three crossings, a shaded riverside road and a giant hollow entrance. */
import {readFileSync,writeFileSync} from 'node:fs';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {emptyUtcMap,stringifyUtcMap,parseUtcMap,type MapStamp,type UtcMap} from '../../src/shared/map/utcmap';
import {emptyLandscape,sampleCurve,curveDistance,type CurvePoint} from '../../src/shared/landscape/curve';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {playableMapError} from '../../src/shared/map/playable';
import {clearRoadCover} from '../maps/road-cover';
import {entity} from './canopyMissionMap';
import type {Placement} from '../../src/content/schema';
let seed=60419;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const start={x:76,z:193},gate={x:188,z:93};
const river:CurvePoint[]=[{x:78,z:30,radius:4},{x:96,z:67,radius:5},{x:113,z:102,radius:5.3},{x:110,z:132,radius:7},{x:120,z:155,radius:7},{x:153,z:175,radius:5.2},{x:187,z:183,radius:8},{x:221,z:220,radius:10},{x:254,z:242,radius:12}];
const riverCurve=sampleCurve(river,5,1);
const routes:CurvePoint[][]=[
 [{x:76,z:193},{x:101,z:197},{x:130,z:190},{x:153,z:187},{x:153,z:163},{x:169,z:153},{x:167,z:134},{x:179,z:123},{x:188,z:118},{x:188,z:105}],
 [{x:167,z:134},{x:146,z:124},{x:134,z:112},{x:126,z:102},{x:100,z:102},{x:85,z:91},{x:75,z:75}],
 [{x:134,z:112},{x:129,z:132},{x:134,z:137},{x:158,z:137},{x:167,z:134}],
 [{x:146,z:124},{x:146,z:151},{x:153,z:163}],
 [{x:101,z:197},{x:101,z:218},{x:123,z:228}],
];
const routeCurves=routes.map(p=>sampleCurve(p,1,1));
const road=(x:number,z:number)=>Math.min(...routeCurves.map(c=>curveDistance(x,z,c)));
const clearings=[{...start,r:13},{x:75,z:75,r:12},{x:123,z:228,r:11},{x:146,z:149,r:9},{x:187,z:121,r:13}];
const inClearing=(x:number,z:number,pad=0)=>clearings.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+pad);
const f=new HeightField(256);f.waterLevel=0;
for(let iz=0;iz<f.verts;iz++)for(let ix=0;ix<f.verts;ix++){
 const x=ix+f.origin,z=iz+f.origin,d=curveDistance(x,z,riverCurve);
 let h=2.4;
 if(d<1.6)h=Math.max(-2.8,2.4-(1.6-d)*5.8);
 const boundary=Math.max(0,(Math.hypot((x-143)/113,(z-139)/123)-.78));
 if(d>1.8&&!inClearing(x,z,5)&&road(x,z)>10)h+=Math.min(6,boundary*18)+Math.max(0,Math.sin(x*.047+z*.022)*Math.cos(z*.065))*2.4;
 // Deliberately flat banks at the two constructed crossings. The channel stays below them.
 if(Math.abs(z-102)<6&&Math.abs(x-113)<13){const t=Math.abs(x-113);h=t>=7.5?2.4:Math.max(-2.8,2.4-(7.5-t)*1.15);}
 if(Math.abs(x-153)<6&&Math.abs(z-175)<13){const t=Math.abs(z-175);h=t>=7.5?2.4:Math.max(-2.8,2.4-(7.5-t)*1.15);}
 if(Math.hypot(x-gate.x,z-gate.z)<32)h=2.4;
 f.samples[iz*f.verts+ix]=h;
}
const landscape=emptyLandscape();
landscape.environment={preset:'under-canopy',hour:9.8,season:'summer',playing:false,weather:{kind:'clear',intensity:0,windX:.65,windZ:.25},canopy:{...DEFAULT_CANOPY,enabled:true,height:35,scale:28,coverage:.74,cloudShadow:.26,seed:60419},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:true,color:'#a5b8b0',sunTint:'#ffe0ad',density:.0018,baseHeight:2,heightFalloff:13,sunStrength:2.2,noiseStrength:.45,driftSpeed:.3,regions:[{id:'cool-river-mist',x:117,y:1,z:138,radiusX:15,radiusY:3,radiusZ:42,density:.004},{id:'stump-light',x:186,y:5,z:116,radiusX:18,radiusY:6,radiusZ:16,density:.003}]}};
landscape.water={rippleScale:.12,rippleStrength:.035,cloudStrength:.012,foamStrength:.2,causticStrength:.22,reflectionStrength:.52,shadowStrength:.6,shallowColor:'#688b6c',deepColor:'#143f40',clarity:2.8,flowSpeed:.7};
landscape.rivers=[{points:river,radius:6,depth:2.8}];
for(const points of routes)landscape.strokes.push({points,radius:3.2,layer:'road',opacity:.7});
for(const p of clearings)landscape.strokes.push({points:[p],radius:p.r,layer:'road',opacity:.3});
landscape.strokes.push({points:river,radius:7,layer:'mud',opacity:.65});
type StampDraft={-readonly [K in keyof MapStamp]:MapStamp[K]};
const stamps:StampDraft[]=[];
function prop(asset:string,x:number,y:number,scale=1,yaw=rand()*Math.PI*2,id=`gate.prop.${stamps.length}`){const s:StampDraft={id,asset,x,y,scale,yaw};stamps.push(s);return s;}
prop('hollow-stump-gate',gate.x,gate.z,1.8,0,'hollow-gate');
prop('woodland-timber-bridge',112.5,101.5,1,Math.PI/2,'lantern-crossing').walk={level:1,height:4.15};
prop('moss-stone-bridge',152.5,174.5,1,0,'stone-crossing').walk={level:1,height:4.95};
prop('arched-root-walkway',145.5,136.5,1,Math.PI/2,'root-overlook').walk={level:1,height:8.4};
const giants=[{x:62,z:169,s:1.4},{x:93,z:146,s:1.35},{x:81,z:113,s:1.15},{x:58,z:63,s:1.3},{x:134,z:78,s:1.55},{x:160,z:58,s:1.3},{x:218,z:124,s:1.7},{x:196,z:159,s:1.25},{x:174,z:212,s:1.3},{x:139,z:211,s:1.1},{x:74,z:229,s:1.2}];
for(const p of giants)prop('ancient-canopy-trunk',p.x,p.z,p.s);
prop('fallen-canopy-bough',65,138,1.2,.7);prop('fallen-canopy-bough',196,214,1.1,-.4);
const entities:Placement[]=[entity('marshal','unit.ants.marshal',76,193,'player.1',{initialState:{experience:1050}})];
for(let i=0;i<4;i++)entities.push(entity(`guard-${i}`,'unit.ants.warrior',72+i*2,197));
for(let i=0;i<3;i++)entities.push(entity(`archer-${i}`,'unit.ants.archer',73+i*2,200));
entities.push(entity('root-vein','building.neutral.corrupted-root',128,224,'none'),entity('amber-mine','building.neutral.amber-mine',67,86,'none'));
const camps:UtcMap['camps']=[];
function camp(id:string,x:number,y:number,types:string[],drops:string[]){const members=types.map((definition,i)=>{const name=`${id}.${i}`;entities.push(entity(name,definition,x+i%2*3,y+Math.floor(i/2)*3,'none'));return name;});camps.push({id,members,home:{x,y},aggroRange:8,leash:18,aggression:'players',mapKnowledge:'hidden',fixedDrops:drops});}
camp('gate-wardens',184,119,['unit.neutral.ogre','unit.neutral.thornspitter','unit.neutral.thornspitter'],['item.barkguard']);
camp('river-stalkers',146,149,['unit.neutral.wolf','unit.neutral.wolf','unit.neutral.thornspitter'],[]);
camp('moss-cache',75,73,['unit.neutral.ogre','unit.neutral.wolf'],['item.trailkeeper-flask']);
camp('bitter-cache',119,227,['unit.neutral.elder-thornspitter','unit.neutral.wolf'],['item.thornband']);
const reserved=entities.map(e=>({...e.position,r:e.definition.startsWith('building.')?8:4}));
const crosses=stamps.filter(s=>s.walk);
function occupied(x:number,z:number,pad=0){return reserved.some(p=>Math.hypot(x-p.x,z-p.y)<p.r+pad)||giants.some(p=>Math.hypot(x-p.x,z-p.z)<8.3*p.s+pad)||Math.hypot(x-gate.x,z-gate.z)<28+pad||crosses.some(s=>Math.hypot(x-s.x,z-s.y)<13+pad);}
// The harvested forest forms dense, irregular banks. Routes keep a full army-width corridor.
for(let z=24;z<242;z+=2)for(let x=24;x<240;x+=2){const xx=x+Math.floor(rand()*2),zz=z+Math.floor(rand()*2);
 if(f.sample(xx,zz)<1.4||road(xx,zz)<7.5||inClearing(xx,zz,2)||occupied(xx,zz,1)||rand()<.24)continue;
 entities.push(entity(`gate.tree.${entities.length}`,'resource.forest.tree',xx,zz,'none',{rotation:rand()*360,appearance:{asset:rand()<.72?'asset.resource.tree-primary':'asset.resource.tree-secondary',scale:.42+rand()*.2}}));
}
// Broad lush patches, with smaller leaf and mushroom clusters creating readable edges.
for(let z=42;z<240;z+=7)for(let x=42;x<235;x+=7){const xx=x+rand()*3,zz=z+rand()*3;if(f.sample(xx,zz)<.8||Math.hypot(xx-gate.x,zz-gate.z)<22)continue;
 landscape.cover.push({x:xx,z:zz,radius:5+rand()*2,density:2.7,seed:Math.floor(rand()*100000),flowers:.035,grassScale:.8,broadRatio:.84,palette:'forest'});
 const d=road(xx,zz);if(d<5||inClearing(xx,zz,1)||occupied(xx,zz,1))continue;
 if(d<15||curveDistance(xx,zz,riverCurve)<2.7){
  prop(rand()<.72?'fern-thicket':'bramble-thicket',xx,zz,.75+rand()*.55);
  if(rand()<.48)prop('ochre-mushroom-colony',xx+1.3,zz-1,.5+rand()*.6);
  if(rand()<.7)prop('curled-forest-leaf',xx-1.5,zz+.6,.5+rand()*.55);
 }
}
for(let i=0;i<riverCurve.length;i+=16){const p=riverCurve[i],q=riverCurve[Math.min(i+1,riverCurve.length-1)],a=Math.atan2(q.z-p.z,q.x-p.x);
 for(const side of [-1,1]){const r=p.radius*1.65+rand()*2,x=p.x-Math.sin(a)*side*r,z=p.z+Math.cos(a)*side*r;if(x<16||z<16||x>239||z>239||road(x,z)<6||occupied(x,z,1))continue;
 prop('mossy-boulder-bank',x,z,.45+rand()*.35,a+rand()*.7);
 if(rand()<.5)prop('fern-thicket',x+1,z-1,.7+rand()*.4);
 }}
for(const p of [{x:93,z:197},{x:140,z:187},{x:160,z:163},{x:173,z:137},{x:183,z:125},{x:124,z:108},{x:96,z:105}]){prop('lantern-post',p.x,p.z,.8,0);prop('splitrail-fence',p.x+2,p.z+2,.8,Math.PI/2);}
for(const p of [{x:179,z:114},{x:199,z:119},{x:173,z:105},{x:209,z:94}]){prop('ochre-mushroom-colony',p.x,p.z,1.3);prop('fern-thicket',p.x+2,p.z+1,1.5);}
landscape.decals=[];
for(const curve of routeCurves)for(let i=0;i<curve.length;i+=12){const p=curve[i];if(f.sample(p.x,p.z)<1)continue;for(const side of [-1,1])landscape.decals.push({id:`road-detail-${landscape.decals.length}`,kind:rand()<.65?'leaf-litter':'pebbles',x:p.x+side*(3+rand()*2),z:p.z+rand()*3-1.5,size:2+rand()*2.5,rotation:rand()*360,opacity:.4+rand()*.35});}
clearRoadCover(landscape.cover,landscape.strokes.filter(s=>s.layer==='road'));
const map:UtcMap={...emptyUtcMap(),name:'The Hollow Gate',description:'An amber-lit doorway in a fallen giant. Cross the river by lantern bridge, take the root overlook, and lead the Vanguard into the heartwood.',height:encodeHeight(f.samples,256),waterLevel:0,entities,stamps,camps,landscape,playerStarts:[{player:1,...start,setup:'setup.ants',mainFort:'mound'}],mission:{campaign:'vanguard',company:['marshal','guard-0','guard-1','guard-2','guard-3','archer-0','archer-1','archer-2'],nextMission:'vanguard-heartwood-vault',order:4,title:'Mission 4 — The Hollow Gate',heroLevelCap:7,objectives:[{id:'crossing',title:'Cross the shaded river',description:'Follow the lantern road to the old stone bridge.'},{id:'gate',title:'Break the gate watch',description:'Defeat the three creatures guarding the hollow entrance.'},{id:'enter',title:'Enter the heartwood',description:'Bring the Marshal through the amber-lit opening.'},{id:'moss-cache',title:'Explore the moss hollow',description:'Take the northern timber bridge and defeat the two guardians for a Trailkeeper’s Flask.',optional:true},{id:'bitter-cache',title:'Search the bitter grove',description:'Clear the southern Root grove for a Thornband.',optional:true}],regions:[{id:'crossing',x:153,y:163,radius:7},{id:'gate',x:188,y:119,radius:15},{id:'entrance',x:188,y:104,radius:5},{id:'moss-cache',x:75,y:75,radius:16},{id:'bitter-cache',x:123,y:227,radius:15}],script:readFileSync(new URL('./hollow-gate.lua',import.meta.url),'utf8')}};
const parsed=parseUtcMap(map);if(!parsed)throw new Error('Invalid Hollow Gate map');const error=playableMapError(parsed);if(error)throw new Error(error);
writeFileSync(new URL('../../assets/maps/campaign/vanguard-hollow-gate.utcmap',import.meta.url),stringifyUtcMap(forestWarfareDressing(map)));
console.log({trees:entities.filter(e=>e.definition==='resource.forest.tree').length,props:stamps.length,cover:landscape.cover.length});
