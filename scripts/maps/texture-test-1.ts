/** Reproducible, camera-aligned terrain study. Run: node --import tsx scripts/maps/texture-test-1.ts */
import {writeFileSync} from 'node:fs';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {emptyUtcMap,stringifyUtcMap,parseUtcMap,type UtcMap,type MapStamp} from '../../src/shared/map/utcmap';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {playableMapError} from '../../src/shared/map/playable';
let seed=74019;
const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
// u is screen-right; v is away from the camera, toward the lake.
const pos=(u:number,v:number)=>({x:128+(u+v)*Math.SQRT1_2,z:128+(u-v)*Math.SQRT1_2});
const shore=(u:number)=>17+Math.sin(u*.14)*2.5+Math.cos(u*.32)*.8;
const f=new HeightField(256);
for(let z=0;z<f.verts;z++)for(let x=0;x<f.verts;x++){
 const dx=x+f.origin-128,dz=z+f.origin-128,u=(dx+dz)*Math.SQRT1_2,v=(dx-dz)*Math.SQRT1_2;
 const bank=shore(u)-v;
 f.samples[z*f.verts+x]=bank<4?Math.max(-3.5,Math.min(1,bank*.32)):1;
}
const landscape=emptyLandscape();
landscape.environment={preset:'forest-warfare',hour:11,season:'summer',playing:false,weather:{kind:'clear',intensity:0,windX:.25,windZ:.12},canopy:{...DEFAULT_CANOPY,enabled:false},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:false}};
landscape.water={rippleScale:.16,rippleStrength:.035,cloudStrength:.01,foamStrength:.12,reflectionStrength:.3,shadowStrength:.6,shallowColor:'#687a67',deepColor:'#233b3d',clarity:2.6,flowSpeed:.22};
// Quiet warm dirt, interrupted by broad irregular patches of fine grass.
for(let v=-42;v<=18;v+=10)landscape.strokes.push({points:[pos(-40,v),pos(40,v)],radius:9,layer:'sand',opacity:.9});
const clearing=(u:number,v:number)=>Math.hypot((u-2-Math.sin(v*.16)*2)/9,(v+1)/13);
for(let v=-32;v<18;v+=3.2)for(let u=-33;u<34;u+=3.2){
 const uu=u+(rand()-.5)*2.4,vv=v+(rand()-.5)*2.4,p=pos(uu,vv);
 if(vv>shore(uu)-1.7)continue;
 const edge=clearing(uu,vv),noise=Math.sin(uu*.8+vv*.4)*Math.cos(vv*.6);
 if(edge<.8 || (edge<1.25&&rand()<.7) || (noise<-.6&&rand()<.6))continue;
 const radius=2+rand()*2;
 landscape.strokes.push({points:[p],radius:radius*1.1,layer:'grass',opacity:.48+rand()*.25});
 landscape.cover.push({...p,radius,density:4.4+rand()*2,seed:Math.floor(rand()*1000000),flowers:rand()<.13?.13:0,grassScale:.68+rand()*.3,broadRatio:1,palette:'forest'});
}
const stamps:MapStamp[]=[];
const stamp=(asset:string,u:number,v:number,scale:number)=>{const p=pos(u,v);stamps.push({id:`texture-test.prop.${stamps.length}`,asset,x:p.x,y:p.z,scale,yaw:rand()*Math.PI*2});};
// Pines form a readable forest wall, with young trees interrupting its silhouette.
for(let v=-28;v<23;v+=4)for(let u=-33;u<=34;u+=4){
 const uu=u+(rand()-.5)*2,vv=v+(rand()-.5)*2;
 const boundary=16+Math.sin(vv*.18)*2;
 if(Math.abs(uu)<boundary || vv>shore(uu)-3 || rand()<.13)continue;
 stamp(rand()<.5?'synty-tree-pine-01':'synty-tree-pine-02',uu,vv,.78+rand()*.38);
}
for(let i=0;i<100;i++){
 const u=(rand()-.5)*60,v=-30+rand()*46;
 if(v>shore(u)-2||clearing(u,v)<.65)continue;
 stamp('pebbles-pale',u,v,.18+rand()*.24);
}
for(const [u,v] of [[-11,-8],[-14,3],[12,-14],[-8,12],[17,9]])stamp('synty-plant-flowerpatch-01',u,v,.55);
for(const [u,v] of [[-12,-15],[13,2],[-17,8]])stamp('canopy-twig-log',u,v,.4);
for(let i=0;i<14;i++){const u=-20+rand()*44;stamp('river-rock-2',u,shore(u)-1.6,.2+rand()*.25);}
const map:UtcMap={...emptyUtcMap(256),name:'Texture Test 1',description:'A quiet terrain study: warm earth, olive grass, pine groves, and a still lake. One Marshal, full visibility, fixed midday lighting. No opponents or victory conditions.',sandbox:true,playerStarts:[{player:1,x:128,z:128,setup:'setup.ants',mainFort:'unused'}],waterLevel:0,height:encodeHeight(f.samples,256),landscape,stamps,entities:[{id:'texture-test.hero',definition:'unit.ants.marshal',owner:'player.1',position:{x:128,y:128},rotation:135}],camps:[]};
if(!parseUtcMap(map))throw Error('Invalid map schema');
const error=playableMapError(map);if(error)throw Error(error);
writeFileSync('assets/maps/skirmish/texture-test-1.utcmap',stringifyUtcMap(map));
console.log({stamps:stamps.length,grassPatches:landscape.cover.length});
