/** Rebuilds the shipped map; runtime Lua is embedded in the .utcmap document. */
import {readFileSync,writeFileSync} from 'node:fs';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {emptyUtcMap,stringifyUtcMap,parseUtcMap,type UtcMap,type MapStamp} from '../../src/shared/map/utcmap';
import {emptyLandscape} from '../../src/shared/landscape/curve';
import {playableMapError} from '../../src/shared/map/playable';
import type {Placement} from '../../src/content/schema';
let seed=3981;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const f=new HeightField(256);f.samples.fill(1);f.waterLevel=0;
// The road winds from the southern gate to Lantern Rise. Three optional loops
// leave it for a convoy, a shrine, and a lakeside den. All routes remain dry.
const road=[{x:218,z:226},{x:199,z:207},{x:191,z:197},{x:178,z:184},{x:162,z:165},{x:145,z:151},{x:135,z:141},{x:121,z:128},{x:129,z:108},{x:151,z:99},{x:174,z:77},{x:161,z:55},{x:133,z:40},{x:103,z:38},{x:82,z:48}];
const branches=[[{x:178,z:184},{x:187,z:171},{x:204,z:165}], [{x:145,z:151},{x:125,z:159},{x:105,z:164}], [{x:174,z:77},{x:188,z:81},{x:204,z:87}]];
const routes=[road,...branches];
const clearings=[{x:190,z:195,r:11},{x:121,z:128,r:10},{x:82,z:48,r:12},{x:204,z:165,r:10},{x:105,z:164,r:10},{x:204,z:87,r:11}];
for(let z=0;z<f.verts;z++)for(let x=0;x<f.verts;x++){
 const wx=x+f.origin,wz=z+f.origin;
 let h=1+Math.max(0,Math.sin(wx*.024)*Math.cos(wz*.018))*.8;
 for(const lake of [{x:106,z:119,rx:14,rz:11},{x:207,z:117,rx:22,rz:19},{x:76,z:98,rx:16,rz:10}]){
  const d=Math.hypot((wx-lake.x)/lake.rx,(wz-lake.z)/lake.rz);
  if(d<1.15)h=Math.min(h,Math.max(-2.8,(d-.92)*8));
 }
 f.samples[z*f.verts+x]=h;
}
const roadDistance=(x:number,z:number)=>Math.min(...routes.flatMap(route=>route.slice(1).map((b,i)=>{const a=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);})) );
const landscape=emptyLandscape();landscape.environment={preset:'forest',hour:11,season:'summer',playing:false,weather:{kind:'rain',intensity:.7,windX:1.2,windZ:.4}};
for(const points of routes)landscape.strokes.push({points,radius:points===road?3.2:2,layer:'road',opacity:points===road?.8:.5});
const entities:Placement[]=[
 {id:'marshal',definition:'unit.ants.marshal',owner:'player.1',position:{x:208,y:213},rotation:225},
 {id:'vanguard-guard',definition:'unit.ants.warrior',owner:'player.1',position:{x:211,y:212},rotation:225},
 {id:'vanguard-scout',definition:'unit.ants.archer',owner:'player.1',position:{x:209,y:215},rotation:225},
 {id:'ambusher-one',definition:'unit.neutral.wolf',owner:'none',position:{x:116,y:124},rotation:45,activation:'script'},
 {id:'ambusher-two',definition:'unit.neutral.wolf',owner:'none',position:{x:123,y:120},rotation:45,activation:'script'},
];
entities.push(
 {id:'watch-captain',definition:'unit.ants.warrior',owner:'none',position:{x:142,y:101},rotation:225,activation:'script'},
 {id:'watch-ranger',definition:'unit.ants.archer',owner:'none',position:{x:145,y:104},rotation:225,activation:'script'},
);
const camps:UtcMap['camps']=[{id:'crossing-wolves',members:['ambusher-one','ambusher-two'],home:{x:120,y:124},aggroRange:12,leash:24,aggression:'players',mapKnowledge:'hidden'}];
function camp(id:string,x:number,y:number,units:string[],drops:string[],deferred=false){
 const members=units.map((definition,i)=>{const name=`${id}-${['one','two','three'][i]}`;entities.push({id:name,definition,owner:'none',position:{x:x+i*3-3,y:y+i%2*3},rotation:135,...(deferred?{activation:'script' as const}:{})});return name;});
 camps.push({id,members,home:{x,y},aggroRange:8,leash:16,aggression:'players',mapKnowledge:'hidden',fixedDrops:drops});
}
camp('convoy-wolf',204,165,['unit.neutral.wolf','unit.neutral.wolf'],['item.barkguard']);
camp('shrine-wolf',105,164,['unit.neutral.wolf','unit.neutral.wolf'],['item.trailkeeper-flask']);
camp('den-ogre',204,87,['unit.neutral.ogre'],['item.thornband']);
camp('watch-pursuer',151,100,['unit.neutral.ogre'],[],true);
// This ogre is pursuing the patrol, not defending a tiny stationary camp.
camps.find(c=>c.id==='watch-pursuer')!.leash=64;
camps.find(c=>c.id==='watch-pursuer')!.aggroRange=24;
camp('watch-wolf',82,45,['unit.neutral.wolf','unit.neutral.wolf','unit.neutral.wolf'],[],true);
const stamps:MapStamp[]=[];
function stamp(asset:string,x:number,y:number,scale=1,yaw=0){stamps.push({id:`prologue.prop.${stamps.length}`,asset,x,y,scale,yaw});}
for(let z=18;z<243;z+=3)for(let x=48;x<240;x+=3){
 const xx=Math.round(x+random()*1.5),zz=Math.round(z+random()*1.5),path=roadDistance(xx,zz),clearing=clearings.some(c=>Math.hypot(xx-c.x,zz-c.z)<c.r);
 if(path<6||clearing||f.sample(xx,zz)<.6||random()<.12 || path>35)continue;
 entities.push({id:`tree.${entities.length}`,definition:'resource.forest.tree',owner:'none',position:{x:xx,y:zz},rotation:random()*360,appearance:{asset:random()<.7?'asset.resource.tree-primary':'asset.resource.tree-secondary',scale:.8+random()*.25}});
 if(random()<.09)stamp('lowpolymushroom_09',xx+.8,zz+.6,.7+random()*.4);
}
for(const route of routes)for(let i=0;i<route.length-1;i++){
 const p=route[i],q=route[i+1],a=Math.atan2(q.z-p.z,q.x-p.x),nx=-Math.sin(a),nz=Math.cos(a);
 for(const side of [-1,1]){
  const x=p.x+nx*side*5,z=p.z+nz*side*5;
  stamp('lantern-post',x,z,.7,a);
  if(i%2===0)stamp('splitrail-fence',x+Math.cos(a)*3,z+Math.sin(a)*3,.7,a);
 }
}
for(let i=0;i<27;i++){
 const a=i*Math.PI*2/27,x=106+Math.cos(a)*13,z=119+Math.sin(a)*10;
 if(roadDistance(x,z)>5)stamp('ant-rock',x,z,.6+random()*.85,a);
}
for(let z=26;z<238;z+=9)for(let x=57;x<233;x+=9){
 if(f.sample(x,z)<.5||roadDistance(x,z)>28)continue;
 const exclusions=routes.flatMap(r=>r.map(p=>({...p,radius:4})));
 landscape.cover.push({x,z,radius:6,density:2.4,seed:Math.floor(random()*100000),flowers:.06,grassScale:.7,broadRatio:.8,palette:'forest',exclusions});
 if(roadDistance(x,z)>4&&roadDistance(x,z)<10){stamp('synty-plant-flowerpatch-01',x,z,.75);if(random()<.45)stamp('ant-rock',x+1,z+1,.55);}
}
// Silhouettes and small human-scale details make each optional clearing distinct.
for(const c of clearings){
 for(let i=0;i<9;i++){const a=i*Math.PI*2/9,x=c.x+Math.cos(a)*(c.r+1),z=c.z+Math.sin(a)*(c.r+1);if(roadDistance(x,z)>4)stamp('ant-rock',x,z,.55+random()*.8,a);}
 stamp('lantern-post',c.x-5,c.z+4,.85);
 stamp('splitrail-fence',c.x-7,c.z+2,.8,Math.PI/2);
 stamp('synty-plant-flowerpatch-01',c.x+6,c.z-3,.9);
}
for(let i=0;i<36;i++){const a=i*Math.PI*2/36;stamp('ant-rock',207+Math.cos(a)*24,117+Math.sin(a)*21,.7+random()*.9,a);}
const map:UtcMap={...emptyUtcMap(),name:'Vanguard Prologue',description:'Follow the lantern road from the southern gate to the lost northern watch. Leave the main trail to discover a moss shrine, an abandoned convoy, and a dangerous lakeside den — each with a guaranteed reward.',playerStarts:[{player:1,x:190,z:195,setup:'setup.ants',mainFort:'marshal'}],waterLevel:0,height:encodeHeight(f.samples,f.size),landscape,entities,stamps,
 camps,
 mission:{campaign:'vanguard',title:'Mission 1 — Prologue',order:1,heroLevelCap:2,objectives:[
 {id:'reach-crossing',title:'Reach the old crossing',description:'Follow the lantern road to the old crossing. Keep the Marshal alive.',optional:false},
 {id:'clear-crossing',title:'Secure the crossing',description:'Defeat the two wolves blocking the road.',optional:false},
 {id:'find-watch',title:'Find the missing watch',description:'Search the road north of the crossing for the surviving watch patrol.',optional:false},
 {id:'rescue-watch',title:'Save the watch',description:'Kill the pursuing ogre. At least one watch soldier and the Marshal must survive.',optional:false},
 {id:'reclaim-rise',title:'Reclaim Lantern Rise',description:'Lead your reinforced army along the northern road and defeat the wolves at Lantern Rise.',optional:false},
 {id:'convoy-cache',title:'Recover the convoy supplies',description:'Defeat the convoy wolves for a Barkguard Charm.',optional:true},
 {id:'shrine-cache',title:'Recover the trailkeepers’ cache',description:'Clear the moss shrine for a Trailkeeper’s Flask.',optional:true},
 {id:'den-cache',title:'Challenge the lakeside ogre',description:'Clear the stone den for a Thornband.',optional:true},
 ],regions:[{id:'old-crossing',x:121,y:128,radius:6},{id:'watch-rescue',x:134,y:106,radius:10},{id:'lantern-rise',x:86,y:48,radius:9},{id:'lost-convoy',x:204,y:165,radius:16},{id:'moss-shrine',x:105,y:164,radius:16},{id:'stone-den',x:204,y:87,radius:17}],script:readFileSync(new URL('./vanguard-prologue.lua',import.meta.url),'utf8')},
};
if(!parseUtcMap(map))throw new Error('Invalid serialized map');const error=playableMapError(map);if(error)throw new Error(error);
writeFileSync(new URL('../../assets/maps/campaign/vanguard-prologue.utcmap',import.meta.url),stringifyUtcMap(map));
console.log(`Vanguard prologue: ${entities.length} entities, ${stamps.length} props.`);
