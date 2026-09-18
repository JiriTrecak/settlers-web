/** Original ant adaptation of the route and encounter structure of WC3 Human 01. */
import {buildChapter,entity,type Chapter} from './canopyMissionMap';
import type {Placement} from '../../src/content/schema';
import type {UtcMap} from '../../src/shared/map/utcmap';
import {HeightField,decodeHeight,encodeHeight} from '../../src/shared/map/height';
const entities:Placement[]=[entity('marshal','unit.ants.marshal',43,48),entity('elder','unit.ants.marshal',39,43,'none')];
for(let i=0;i<4;i++)entities.push(entity(`guard-${i}`,'unit.ants.warrior',40+i%2*4,54+Math.floor(i/2)*3));
const npc=(id:string,x:number,y:number,extra:Partial<Placement>={})=>entities.push(entity(id,'unit.ants.civilian',x,y,'none',extra));
npc('volunteer-one',41,122);npc('volunteer-two',47,124);npc('caretaker',48,139);npc('traveler',93,160);npc('merchant',128,174);
entities.push(entity('youngling','unit.ants.youngling',86,148,'none',{activation:'script',appearance:{asset:'asset.briar.civilian',scale:.65}}));
for(const [id,x,y] of [['hamlet-west',35,131],['hamlet-east',56,128],['hamlet-south',40,146],['town-west',164,111],['town-east',199,110],['town-north',186,81],['town-burned',205,92]] as const)entities.push(entity(id,'building.briar.cottage',x,y,'none'));
entities.push(entity('cottage-ruins','building.briar.ruined-cottage',205,92,'none',{activation:'script'}));
entities.push(entity('rescue-cage','building.briar.cage',86,145,'none'));
for(const [id,x,y] of [['start-heal',33,46],['start-protection',52,43],['town-mana',207,86]] as const)entities.push(entity(id,'building.briar.supply-crate',x,y,'none'));
for(const [id,definition,x,y] of [['start-heal-drop','item.briar-healing-draught',33,46],['start-protection-drop','item.briar-protection-scroll',52,43],['town-mana-drop','item.briar-mana-draught',207,86]] as const)entities.push(entity(id,definition,x,y,'none',{activation:'script'}));
for(let i=0;i<3;i++)entities.push(entity(`defender-${i}`,'unit.ants.warrior',155+i*3,102,'none',{initialState:{health:220}}));
npc('fleeing-villager',182,123,{activation:'script'});npc('town-villager-one',179,105,{activation:'script'});npc('town-villager-two',199,93,{activation:'script'});
npc('captive-one',162,61);npc('captive-two',164,58);npc('messenger',192,76,{activation:'script'});
entities.push(entity('merchant-reward','item.briar-vigor-seed',126,175,'none',{activation:'script'}));
const camps:UtcMap['camps']=[];
function camp(id:string,x:number,y:number,types:string[],drops:string[]=[],deferred=false){
 const members=types.map((type,i)=>{const idn=`${id}-${i}`;entities.push(entity(idn,`unit.briar.${type}`,x+i%2*3,y+Math.floor(i/2)*3,'none',{...(deferred?{activation:'script' as const}:{})}));return idn;});
 camps.push({id,members,home:{x,y},aggroRange:7,leash:18,aggression:'players',mapKnowledge:'hidden',fixedDrops:drops});
}
camp('rescue',80,145,['scavenger','scavenger','slinger'],['item.briar-healing-draught']);
camp('ambush',91,155,['cutthroat','cutthroat','cutthroat','cutthroat'],['item.briar-healing-scroll'],true);
camp('thieves',169,207,['raider','cutthroat','cutthroat'],['item.briar-ledger','item.briar-mana-draught'],true);
// The thieves are authored at the cart but their camp is their retreat destination.
for(let i=0;i<3;i++){const e=entities.find(e=>e.id===`thieves-${i}`)!;e.position={x:131+i*2,y:177};}camps.find(c=>c.id==='thieves')!.leash=64;
camp('gate',183,121,['raider','raider'],[],true);
camp('town',183,103,['raider','slinger'],[],true);
camp('west',156,96,['raider','raider'],[],true);
camp('house',204,89,['raider','raider'],[],true);
camp('captain',174,61,['chieftain','raider','raider']);
const main=[{x:43,z:48},{x:43,z:75},{x:49,z:99},{x:44,z:123},{x:48,z:139},{x:56,z:163},{x:77,z:173},{x:101,z:173},{x:128,z:174},{x:153,z:170},{x:183,z:166},{x:183,z:148},{x:183,z:129},{x:183,z:113},{x:183,z:96},{x:181,z:77},{x:174,z:63}];
const routes=[main,[{x:48,z:139},{x:66,z:146},{x:84,z:146}],[{x:91,z:173},{x:93,z:160}],[{x:128,z:174},{x:140,z:185},{x:152,z:205},{x:169,z:207}],[{x:183,z:108},{x:170,z:105},{x:157,z:102}],[{x:183,z:96},{x:201,z:96},{x:208,z:86}]];
const regions=[['hamlet',44,126,10],['caretaker',48,139,8],['rescue',85,145,12],['ambush',93,171,9],['merchant',128,174,9],['gate',183,127,9],['town',183,110,12],['defenders',157,102,12],['house',201,96,9],['captain',178,76,10]] as const;
const c:Chapter={id:'vanguard-briarwatch',name:'The Defense of Briarwatch',description:'A Marshal, four guards, and a forest village in danger. Follow the old road, rally the villagers, uncover optional rescues and stolen supplies, then break the raiders holding Briarwatch.',seed:91826,start:{x:43,z:48},routes,clearings:[{x:43,z:48,r:14},{x:44,z:129,r:18},{x:85,z:145,r:11},{x:93,z:160,r:8},{x:128,z:174,r:10},{x:169,z:207,r:13},{x:183,z:109,r:28},{x:174,z:65,r:18}],lakes:[{x:160,z:140,rx:19,rz:9},{x:209,z:140,rx:22,rz:9}],entities,camps,order:6,cap:2,regions:regions.map(([id,x,y,radius])=>({id,x,y,radius})),objectives:[
 {id:'defend',title:'Defend Briarwatch',description:'Reach Briarwatch and defeat the raiders. The Marshal must survive.',optional:false},
 {id:'captain',title:'Break the raider command',description:'Defeat the Briar Captain and his escorts in the northern square.',optional:false},
 {id:'rescue',title:'The missing youngling',description:'Defeat the scavengers, break the twig cage, and bring the youngling back to the caretaker.',optional:true},
 {id:'ledger',title:'The stolen ledger',description:'Defeat the thieves, pick up the Merchant’s Leaf Ledger, and return it to Pell at his cart.',optional:true},
 ],decorate(map){
  map.stamps!.push({id:'merchant-cart',asset:'briarwatch-merchant-cart',x:122,y:178,scale:1,yaw:-.5});
  map.stamps!.push({id:'watch-tent-west',asset:'briarwatch-watch-bivouac',x:34,y:54,scale:1,yaw:.5},{id:'watch-tent-east',asset:'briarwatch-watch-bivouac',x:52,y:54,scale:1,yaw:-.5});
  // A marching camp needs soft foliage margins, unlike a base-building pad.
  for(const patch of map.landscape!.cover)patch.exclusions=patch.exclusions?.filter(e=>!(e.x===43&&e.z===48&&e.radius===15));
  for(const [x,z] of [[32,48],[35,63],[54,61],[54,47],[38,39],[47,38]])map.landscape!.cover.push({x,z,radius:3.5,density:1.6,seed:x*100+z,flowers:.10,grassScale:.6,broadRatio:.75,palette:'forest',exclusions:[]});
  // Fenced cottage gardens and a broad, unmistakable south entrance.
  // Posts never occupy the central combat lane or the bridge exits.
  const detail=(asset:string,x:number,y:number,scale=1,yaw=0)=>map.stamps!.push({id:`briar-town-detail-${map.stamps!.length}`,asset,x,y,scale,yaw});
  for(const [x,y] of [[176,126],[190,126]])detail('lantern-post',x,y,1.5);
  for(const x of [163,166,169,172,194,197,200,203])detail('splitrail-fence',x,126,1);
  for(const [cx,cy] of [[164,111],[199,110],[186,81],[35,131],[56,128]]){
   for(const dx of [-3.4,0,3.4])detail('splitrail-fence',cx+dx,cy-4.5,.95);
   for(const dx of [-3,0,3])detail('synty-plant-flowerpatch-01',cx+dx,cy-3,.65,dx);
   detail('synty-prop-roadsign-01',cx+4,cy+3,.7);
  }
  detail('briarwatch-merchant-cart',196,102,.85,.5);
  map.playerStarts[0].mainFort='marshal';map.mission!.title='Reference — The Defense of Briarwatch';
  map.mission!.company=['marshal','guard-0','guard-1','guard-2','guard-3'];
  // The dry banks are at 1m. A real walk surface spans the continuous stream.
  const f=new HeightField(256);f.load(decodeHeight(map.height!,256)!,0);
  for(let z=0;z<f.verts;z++)for(let x=0;x<f.verts;x++){
   const wx=x+f.origin,wz=z+f.origin;if(wx<141||wx>233||Math.abs(wz-140.5)>11)continue;
   if(Math.abs(wx-183.5)<6){const d=Math.abs(wz-140.5);f.samples[z*f.verts+x]=d>=8.5?1:Math.max(-2,1-(8.5-d)*1.5);}
  }
  map.height=encodeHeight(f.samples,256);
  map.stamps!.push({id:'briarwatch-bridge',asset:'moss-stone-bridge',x:183.5,y:140.5,scale:1,yaw:0,walk:{level:1,height:3.55}});
  // No random fence or lantern is allowed in the bridge approaches or settlement streets.
  map.stamps=map.stamps!.filter(s=>s.id==='briarwatch-bridge'||!(Math.abs(s.x-183.5)<9&&Math.abs(s.y-140.5)<15));
  map.entities=map.entities!.filter(e=>!e.id.includes('.tree.')||!(Math.abs(e.position.x-183.5)<10&&Math.abs(e.position.y-140.5)<17));
 }};
buildChapter(c);
