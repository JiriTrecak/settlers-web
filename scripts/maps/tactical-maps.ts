/** Reproducible tactical elevation lab and four-player FFA. Run with npx tsx. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {HeightField,encodeHeight} from '../../src/shared/map/height';
import {sculptPlateau,sculptRamp} from '../../src/shared/landscape/tacticalAuthoring';
import {emptyLandscape,type CurvePoint} from '../../src/shared/landscape/curve';
import {emptyUtcMap,stringifyUtcMap,parseUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {content} from '../../src/content/builtin';
import type {Placement} from '../../src/content/schema';

export function terrainLab():UtcMap {
 const f=new HeightField();f.samples.fill(1);f.waterLevel=0;
 sculptPlateau(f,[{x:100,z:85},{x:149,z:85},{x:158,z:103},{x:149,z:150},{x:100,z:150}],7);
 sculptRamp(f,[{x:86,z:130},{x:118,z:130}],5);
 sculptPlateau(f,[{x:71,z:91},{x:76,z:91},{x:76,z:114},{x:71,z:114}],5);
 const landscape=emptyLandscape();landscape.environment={preset:'forest',hour:11,season:'summer',playing:false};
 landscape.strokes=[{points:[{x:50,z:130},{x:85,z:130},{x:118,z:130},{x:135,z:130}],radius:4,layer:'road',opacity:.8}];
 return {...emptyUtcMap(),name:'Terrain Proving Ground',description:'A focused cliff, ramp and ridge laboratory. Player 1 starts below; Player 2 holds the upper plateau. Use debug reveal to compare terrain with tactical vision.',waterLevel:0,height:encodeHeight(f.samples,f.size),landscape,
 playerStarts:[{player:1,x:53,z:130,setup:'setup.ants',mainFort:'start.player.1/main-fort'},{player:2,x:132,z:116,setup:'setup.ants',mainFort:'start.player.2/main-fort'}],
 entities:[{id:'lab.low-archer',definition:'unit.ants.archer',position:{x:97,y:106},rotation:90,owner:'player.1'},
 {id:'lab.high-warrior',definition:'unit.ants.warrior',position:{x:100,y:106},rotation:270,owner:'player.2'},
 {id:'lab.low-mine',definition:'building.neutral.amber-mine',position:{x:42,y:114},rotation:0,owner:'none'},
 {id:'lab.high-mine',definition:'building.neutral.amber-mine',position:{x:133,y:137},rotation:0,owner:'none'}]};
}
const polar=(r:number,a:number)=>({x:256+Math.cos(a)*r,z:256+Math.sin(a)*r});
const circle=(x:number,z:number,r:number):CurvePoint[]=>Array.from({length:64},(_,i)=>({x:x+Math.cos(i*Math.PI/32)*r,z:z+Math.sin(i*Math.PI/32)*r}));
const round=(v:number)=>Math.round(v*1000)/1000;
export function fourCrowns():UtcMap {
 let state=731942;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const f=new HeightField(512);f.waterLevel=0;
 const lakeRadius=(a:number)=>100+7*Math.cos(a*4)+3*Math.cos(a*8);
 for(let iz=0;iz<f.verts;iz++)for(let ix=0;ix<f.verts;ix++){
  const x=ix+f.origin-256,z=iz+f.origin-256,r=Math.hypot(x,z),a=Math.atan2(z,x),edge=r-lakeRadius(a);
  let h=edge<0?Math.max(-6,edge*.27):Math.min(3,edge*.23);
  if(r>=168)h=9;if(r>=230)h=15;
  if(r>322)h=15+Math.min(7,(r-322)*.15);
  f.samples[iz*f.verts+ix]=h;
 }
 const landscape=emptyLandscape();landscape.environment={preset:'forest',hour:11,season:'summer',playing:true};
 landscape.water={rippleScale:.13,rippleStrength:.045,foamStrength:.18,cloudStrength:.025,causticStrength:.35};
 const roads:{points:CurvePoint[];radius:number}[]=[];
 const road=(points:CurvePoint[],radius=5)=>{roads.push({points,radius});landscape.strokes.push({points,radius,layer:'road',opacity:.75});};
 // Two continuous circulation rings, with four broad descents through each cliff band.
 road([...circle(256,256,121),polar(121,0)],5);
 road([...circle(256,256,193),polar(193,0)],4.5);
 const starts=Array.from({length:4},(_,i)=>{const p=polar(Math.sqrt(2)*180,Math.PI/4+i*Math.PI/2);return {x:Math.round(p.x),z:Math.round(p.z)};});
 for(let q=0;q<4;q++){
  const a=Math.PI/4+q*Math.PI/2,start=starts[q];
  sculptPlateau(f,circle(start.x,start.z,45),18);
  const first=[polar(236,a),polar(202,a)],second=[polar(185,a),polar(145,a)];
  sculptRamp(f,first,9);sculptRamp(f,second,9);
  road([polar(266,a),...first,...second,polar(121,a)],7);
  // Flanking ramp down the side of each crown, plus an outer shelf crossing.
  const flank=[{x:start.x+Math.cos(a+.95)*30,z:start.z+Math.sin(a+.95)*30},{x:start.x+Math.cos(a+.95)*61,z:start.z+Math.sin(a+.95)*61}];
  sculptRamp(f,flank,6);road(flank,4);
  const axis=q*Math.PI/2;
  const pass=[polar(249,axis),polar(212,axis)];sculptRamp(f,pass,8);road([...pass,polar(193,axis)],5);
  const inner=[polar(185,axis),polar(146,axis)];sculptRamp(f,inner,7);road([...inner,polar(121,axis)],5);
 }
 const m:UtcMap={...emptyUtcMap(512),name:'Four Crowns',description:'Four highland colonies descend through slate escarpments to the Sunken Heart. Circle the lake, contest amber and root, and challenge 48 woodland camps, including eight T3 boss lairs. Four-player free-for-all; rich home forests and multiple approaches reward expansion and large armies.',waterLevel:0,height:encodeHeight(f.samples,f.size),landscape,playerStarts:starts.map((p,i)=>({player:i+1,...p,setup:'setup.ants',mainFort:`start.player.${i+1}/main-fort`})),entities:[],stamps:[],camps:[]};
 const entities:Placement[]=[],occupied=new Set<number>();const stamps:UtcMap['stamps'][number][]=[],camps:UtcMap['camps'][number][]=[];
 const clearings:{x:number;z:number;radius:number}[]=starts.map(p=>({...p,radius:23}));
 for(const p of starts)for(let z=p.z-7;z<=p.z+10;z++)for(let x=p.x-7;x<=p.x+7;x++)occupied.add(z*512+x);
 function entity(id:string,definition:string,x:number,z:number,appearance?:Placement['appearance']):boolean {
  x=Math.round(x);z=Math.round(z);const def=content.get(definition),w=Math.floor((def.footprint?.width??1)/2),d=Math.floor((def.footprint?.depth??1)/2),cells:number[]=[];
  for(let zz=z-d;zz<=z+d;zz++)for(let xx=x-w;xx<=x+w;xx++){
   const i=zz*512+xx;if(xx<2||zz<2||xx>509||zz>509||occupied.has(i)||f.sample(xx,zz)<.2)return false;cells.push(i);
  }
  cells.forEach(i=>occupied.add(i));entities.push({id,definition,position:{x,y:z},rotation:0,owner:'none',...(appearance?{appearance}:{})});return true;
 }
 const deposit=(id:string,type:'amber-mine'|'corrupted-root',p:CurvePoint)=>{
  if(!entity(id,`building.neutral.${type}`,p.x,p.z))throw new Error(`Cannot place ${id}`);
  clearings.push({...p,radius:10});
 };
 for(let q=0;q<4;q++){
  const a=Math.PI/4+q*Math.PI/2,p=starts[q];
  deposit(`crown.${q}.home-amber`,'amber-mine',{x:p.x+Math.cos(a+Math.PI/2)*18,z:p.z+Math.sin(a+Math.PI/2)*18});
 }
 const sites:[number,number,'easy'|'medium'|'hard'|'t3'][]=[
  [135,-30,'t3'],[135,30,'t3'],[153,0,'hard'],[202,-32,'medium'],[202,32,'medium'],[210,-12,'easy'],[210,12,'easy'],[254,-20,'medium'],[254,20,'medium'],[300,-8,'hard'],[300,8,'hard'],[195,0,'easy']];
 for(let q=0;q<4;q++)for(let k=0;k<sites.length;k++){
  const [r,degrees,tier]=sites[k],a=Math.PI/4+q*Math.PI/2+degrees*Math.PI/180,p=polar(r,a),home={x:Math.round(p.x),y:Math.round(p.z)};
  const id=`crown.${q}.camp.${k}.${tier}`;
  const types=tier==='easy'?['wolf','wolf']:tier==='medium'?['ogre','thornspitter','wolf']:tier==='hard'?['ogre','elder-thornspitter','thornspitter','wolf']: [k%2?'thornblade-matriarch':'amberjaw-staglord','elder-thornspitter','ogre','thornspitter'];
  const offsets=[[-3,0],[3,0],[0,4],[0,-4]],members:string[]=[];
  for(let j=0;j<types.length;j++){const [dx,dz]=offsets[j],member=`${id}.${j}`;if(!entity(member,`unit.neutral.${types[j]}`,home.x+dx,home.y+dz))throw new Error(`Camp overlap ${member}`);members.push(member);}
  // Eight T3 encounters, two unique legendary rewards: preserve the game's cap of three.
  const legendary=tier==='t3',reward=legendary&&k===0&&q%2===0?'legendary':tier==='t3'?'hard':tier;
  camps.push({id,members,home,aggroRange:tier==='easy'?7:10,leash:tier==='t3'?20:16,aggression:'players',lootPool:`loot.camp.${reward}`,...(legendary?{legendary:true}:{})});
  clearings.push({x:home.x,z:home.y,radius:tier==='t3'?13:10});
  if(k===0||k===1||k===5)deposit(`${id}.root`,'corrupted-root',polar(r+11,a));
  if(k===3||k===4||k===7)deposit(`${id}.amber`,'amber-mine',polar(r+12,a));
 }
 function roadDistance(x:number,z:number):number {
  let best=Infinity;
  for(const road of roads)for(let i=0;i<road.points.length-1;i++){
   const a=road.points[i],b=road.points[i+1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
   best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t)-road.radius);
  }return best;
 }
 const clear=(x:number,z:number,padding=0)=>clearings.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+padding);
 const gentle=(x:number,z:number)=>Math.max(Math.abs(f.sample(x+1,z)-f.sample(x-1,z)),Math.abs(f.sample(x,z+1)-f.sample(x,z-1)))<.8;
 function stamp(asset:string,x:number,z:number,scale=1,yaw=random()*Math.PI*2,id=`crown.prop.${stamps.length}`){stamps.push({id,asset,x:round(x),y:round(z),yaw:round(yaw),scale:round(scale)});}
 // Dense overlapping woodland islands; keep roads, foundations and camp arenas open.
 for(let z=9;z<504;z+=3.2)for(let x=9;x<504;x+=3.2){
  const xx=x+(random()-.5)*2,zz=z+(random()-.5)*2,r=Math.hypot(xx-256,zz-256);
  if(r<118||f.sample(xx,zz)<1||!gentle(xx,zz)||clear(xx,zz)||roadDistance(xx,zz)<2.5)continue;
  const homeDistance=Math.min(...starts.map(p=>Math.hypot(xx-p.x,zz-p.z)));
  const clump=Math.sin(xx*.046+Math.sin(zz*.035)*2)*Math.cos(zz*.043)+Math.sin((xx+zz)*.11)*.25;
  if(homeDistance>55&&clump<-.05)continue;
  if(random()<.10)continue;
  const secondary=random()<.23;
  entity(`crown.tree.${entities.length}`,'resource.forest.tree',xx,zz,{asset:secondary?'asset.resource.tree-secondary':'asset.resource.tree-primary',scale:round(.82+random()*.30)});
  if(random()<.065)stamp(['lowpolymushroom_01','lowpolymushroom_09','lowpolymushroom_20'][Math.floor(random()*3)],xx+1,zz+.4,.7+random()*.6);
  if(random()<.08)stamp('ant-fern',xx+.7,zz+1,.55+random()*.55);
 }
 // Ground cover in broad patches, sparse through roads and absent on cliff faces.
 for(let z=14;z<502;z+=22)for(let x=14;x<502;x+=22){
  if(f.sample(x,z)<1||!gentle(x,z))continue;
  const exclusions=clearings.filter(p=>Math.hypot(p.x-x,p.z-z)<p.radius+17).map(p=>({x:p.x,z:p.z,radius:Math.min(32,p.radius)}));
  landscape.cover.push({x,z,radius:16,density:1.15,seed:Math.floor(random()*1000000),flowers:.025,grassScale:.65,broadRatio:.8,palette:'forest',exclusions});
  if(!clear(x,z)&&roadDistance(x,z)>4&&random()<.55){stamp('synty-plant-flowerpatch-01',x+2,z, .7+random()*.5);stamp('ant-rock',x,z+3,.65+random()*.6);}
 }
 // Broken shoreline clusters: exposed stretches alternate with reed coves.
 for(let i=0;i<52;i++){
  const a=i*Math.PI/26+(random()-.5)*.08;
  if(random()<.32)continue;
  for(let j=0;j<2+Math.floor(random()*4);j++){
   const angle=a+(random()-.5)*.055,r=lakeRadius(angle)-1+random()*6,p=polar(r,angle);
   stamp('ant-rock',p.x,p.z,.5+random()*1.8);
   const reed=polar(r+2+random()*3,angle+.02);stamp('ant-reeds',reed.x,reed.z,.5+random()*.7);
  }
  if(random()<.6)for(let j=0;j<3;j++){const lily=polar(lakeRadius(a)-5-random()*7,a+(random()-.5)*.08);stamp('ant-lily',lily.x,lily.z,.5+random()*.7);}
 }
 for(let i=0;i<32;i++){
  const a=i*Math.PI/16,p=polar(128,a);stamp('lantern-post',p.x,p.z,.85,a);
  if(!clear(p.x,p.z,4)){const fence=polar(130,a+.035);stamp('splitrail-fence',fence.x,fence.z,1,a+Math.PI/2);}
 }
 // Weathered shoulders and fallen branches at the escarpment, away from routes.
 for(let i=0;i<96;i++){
  const a=i*Math.PI/48;
  for(const r of [171,233]){
   const p=polar(r,a);if(clear(p.x,p.z,4)||roadDistance(p.x,p.z)<9||p.x<12||p.z<12||p.x>500||p.z>500)continue;
   stamp('ant-rock',p.x,p.z,1.4+random()*.8,a);
   if(i%3===0)stamp('waystone-outcrop',p.x+1,p.z+1,.75,a);
   if(i%4===0)stamp('ant-driftwood',p.x-2,p.z-2,.75,a);
  }
 }
 for(let q=0;q<4;q++){
  const a=Math.PI/4+q*Math.PI/2;
  for(const r of [185,205,230])for(const side of [-1,1]){const p=polar(r,a+side*.045);if(roadDistance(p.x,p.z)>0)stamp('lantern-post',p.x,p.z,.9,a);}
 }
 // Dress the home clearings after the world pass so existing resources, camps
 // and forests retain their exact seeded layout. Decoration is concentrated in
 // pockets; the Mound, army arrival area and mine approach remain open.
 for(let q=0;q<4;q++){
  const start=starts[q],a=Math.PI/4+q*Math.PI/2;
  const local=(u:number,v:number)=>({x:start.x-Math.sin(a)*u+Math.cos(a)*v,z:start.z+Math.cos(a)*u+Math.sin(a)*v});
  let prop=0;
  const homeStamp=(asset:string,u:number,v:number,scale=1,yaw=a)=>{
   const p=local(u,v);stamp(asset,p.x,p.z,scale,yaw,`crown.home.${q}.${prop++}`);
  };
  const mine=local(18,0),front={x:start.x,z:start.z+8};
  landscape.strokes.push({points:[front,local(7,-3),local(13,-1)],radius:1.8,layer:'road',opacity:.82});
  // Soft green islands, with the two main travel corridors cut out of them.
  const exclusions=[{...start,radius:8},{...front,radius:4},{...mine,radius:7}];
  for(let v=-28;v<=28;v+=4)exclusions.push({...local(0,v),radius:6.5});
  for(let u=6;u<=18;u+=3)exclusions.push({...local(u,-1),radius:2.8});
  const beds=[[-13,-10,6.5],[-16,2,6],[-12,13,7],[10,13,6.5],[17,11,5.5],[-20,-17,6],[15,-16,6.5],[7,21,5.5]];
  for(let i=0;i<beds.length;i++){
   const [u,v,radius]=beds[i],p=local(u,v);
   landscape.cover.push({...p,radius,density:3.2,seed:81000+q*101+i,flowers:q===0?.1:.06,grassScale:.78,broadRatio:.8,palette:'forest',exclusions});
   landscape.strokes.push({points:[local(u-1.5,v),p,local(u+1,v+2)],radius:radius*.75,layer:'grass',opacity:.55});
  }
  // Paired arrival lamps and a pair beside the garden, never across an entrance.
  for(const [u,v] of [[-9,-12],[9,-12],[-10,10],[10,10]])homeStamp('lantern-post',u,v,.78,a+Math.PI/2);
  // Broken fence runs frame the planted side. No closed pens or movement gates.
  for(const [u,v,yaw] of [[-19,5,a+Math.PI/2],[-18.2,8.1,a+Math.PI/2],[-14,18,a],[12,19,a]])
   homeStamp('splitrail-fence',u,v,.85,yaw);
  for(const [u,v,size] of [[-18,-11,1.1],[-16.4,-12.2,.6],[-19.4,-9.3,.45],[17,14,.95],[18.6,13,.55],[-10,20,.6]])
   homeStamp('ant-rock',u,v,size*(q===1?1.15:1),a+u*.1);
  // White-flower crown, fern/stone crown, mushroom crown, and mixed meadow crown.
  const mushrooms=['lowpolymushroom_01','lowpolymushroom_09','lowpolymushroom_20'];
  for(const [i,bed] of beds.entries()){
   const [u,v]=bed;
   homeStamp('ant-fern',u+.9,v-.7,.6+(i%3)*.12,a+i);
   if(q!==2||i%2===0)homeStamp('synty-plant-flowerpatch-01',u-1,v+1,q===0?1.05:.7,a+i*.7);
   if(q===2||i%3===0)homeStamp(mushrooms[(q+i)%3],u+2,v+.4,q===2?1:.7,a-i);
  }
  // A few close accents are visible at normal play zoom, not only at the
  // forest rim. Keep the front spawn apron and foundation entirely clear.
  for(const side of [-1,1]){
   const p={x:start.x+side*9,z:start.z-2};
   landscape.cover.push({...p,radius:3.5,density:3.8,seed:92000+q*11+side,flowers:.12,grassScale:.68,broadRatio:.8,palette:'forest',exclusions:[{...start,radius:6.5},{...front,radius:4},{...mine,radius:7}]});
   landscape.strokes.push({points:[p],radius:3,layer:'grass',opacity:.5});
   for(const [dx,dz,size] of [[0,0,.58],[side*1.1,1,.35]]){
    stamp('ant-rock',p.x+dx,p.z+dz,size,q+side,`crown.home.${q}.${prop++}`);
   }
   stamp('synty-plant-flowerpatch-01',p.x,p.z+1.6,.65,a,`crown.home.${q}.${prop++}`);
  }
  homeStamp('ant-driftwood',-20,13,.7,a+.3);
  // Surface detail gives the paths texture without extra collision or meshes.
  landscape.decals??=[];
  for(let i=0;i<6;i++){
   const p=local(i<3?-11+i*3:8+(i-3)*3,i<3?-7:5);
   landscape.decals.push({id:`crown.home.${q}.decal.${i}`,kind:i%2?'leaf-litter':'pebbles',...p,size:3.5+i%3,rotation:q*90+i*17,opacity:.42});
  }
 }
 return {...m,entities,stamps,camps};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 mkdirSync('assets/maps/skirmish',{recursive:true});
 for(const [id,map] of [['terrain-proving-ground',terrainLab()],['four-crowns',fourCrowns()]] as const){
  if(!parseUtcMap(JSON.parse(stringifyUtcMap(map))))throw new Error(`${id}: invalid serialized map schema`);
  const error=playableMapError(map);if(error)throw new Error(`${id}: ${error}`);
  writeFileSync(`assets/maps/skirmish/${id}.utcmap`,stringifyUtcMap(map)+'\n');
  console.log(`${id}: ${map.size}², ${map.playerStarts.length} players, ${map.entities.length} entities, ${map.stamps.length} scenery, ${map.camps.length} camps`);
 }
}
