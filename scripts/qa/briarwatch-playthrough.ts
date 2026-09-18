/** Real simulation orders; no teleports, health edits or direct damage. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
const optional=process.argv.includes('--optional');
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-briarwatch.utcmap','utf8')))!;
const g=new Game(map,[{player:0,kind:'human'}]),hero=g.entities.find(e=>e.placement==='marshal')!;
const trace:unknown[]=[];let transport=0,lastStage='';
const actors=()=>g.entities.filter(e=>e.unit&&e.owner==='player.1'&&e.hp!>0).map(e=>e.id);
function tick(){g.tick();transport++;const stage=String(g.state.mission?.variables.stage);if(stage!==lastStage){const captain=g.entities.find(e=>e.placement==='captain-0');if(stage==='captain-scene'&&(!captain||!g.observation.visible('player.1',captain)))throw Error('Captain briefing triggered outside player visibility');trace.push({transport,tick:g.state.tick,stage,hp:hero.hp,x:hero.x,y:hero.y,...(stage==='captain-scene'?{captainVisible:true}:{})});lastStage=stage;}if(g.state.mission?.error)throw new Error(g.state.mission.error);}
function until(test:()=>boolean,max=6000){const start=transport;while(!test()&&!g.state.outcome&&transport-start<max)tick();if(!test()&&!g.state.outcome)throw new Error(`Timed out at ${hero.x},${hero.y}: ${JSON.stringify(g.state.mission?.variables)}`);}
function ready(){until(()=>!g.state.mission?.dialogue?.remaining&&!g.state.mission?.scene);}
function stop(){g.command('player.1',{type:'stop',actors:actors()});}
function walk(x:number,y:number){
 ready();stop();const start=transport;
 while(!g.state.outcome&&transport-start<6000){
  if(transport%40===0&&!hero.unit!.order)g.command('player.1',{type:'move',actors:actors(),destination:{x,y},attackMove:true});
  tick();if(Math.hypot(hero.x-x,hero.y-y)<3&&!g.state.mission?.dialogue?.remaining)break;
 }
 trace.push({waypoint:[x,y],elapsed:transport-start,hp:hero.hp,position:[hero.x,hero.y],order:hero.unit!.order,alive:actors().length});
 if(transport-start>=6000)throw new Error('Route failed');
 ready();stop();
}
function destroy(tag:string){
 ready();const target=g.entities.find(e=>e.placement===tag);if(!target)return;
 const result=g.command('player.1',{type:'attack',actors:actors(),target:target.id,force:true});if(!result.accepted)throw new Error(JSON.stringify(result));
 until(()=>!g.context.get(target.id)||target.hp===0);ready();stop();trace.push({destroyed:tag,tick:g.state.tick});
}
function pickup(definition:string){
 ready();stop();until(()=>g.entities.some(e=>e.definition===definition&&e.item),80);const item=g.entities.find(e=>e.definition===definition&&e.item);if(!item)throw new Error(`Missing item ${definition}`);
 if(!hero.equipment!.includes(null)&&definition!=='item.briar-vigor-seed'){
  const result=g.command('player.1',{type:'dropItem',actor:hero.id,slot:0});if(!result.accepted)throw new Error(JSON.stringify(result));
 }
 const result=g.command('player.1',{type:'pickup',actor:hero.id,target:item.id});if(!result.accepted)throw new Error(JSON.stringify(result));
 until(()=>!g.context.get(item.id));trace.push({picked:definition,equipment:[...hero.equipment!],bonuses:hero.progression?.bonuses});
}
function checkpoint(){const copy=new Game(map,g.slots);copy.restore(g.snapshot());for(let i=0;i<12;i++){tick();copy.tick();}if(copy.checksum()!==g.checksum())throw new Error('Restore divergence');trace.push({checkpoint:g.checksum(),tick:g.state.tick});}
try {
 until(()=>g.state.mission?.variables.stage==='road',2000);
 if(optional){destroy('start-protection');pickup('item.briar-protection-scroll');walk(38,48);destroy('start-heal');pickup('item.briar-healing-draught');}
 for(const p of [[43,75],[49,99],[44,123],[48,139]])walk(...p as [number,number]);
 if(optional){
  walk(66,146);walk(80,145);destroy('rescue-0');destroy('rescue-1');destroy('rescue-2');destroy('rescue-cage');
  until(()=>g.state.mission?.variables['youngling-free']===true);ready();checkpoint();
  walk(66,146);walk(48,139);until(()=>g.state.mission?.objectiveStates.rescue==='completed');ready();checkpoint();
 }
 for(const p of [[56,163],[77,173],[101,173],[128,174]])walk(...p as [number,number]);
 if(optional){
  walk(140,185);walk(152,205);walk(169,207);for(let i=0;i<3;i++)destroy(`thieves-${i}`);
  pickup('item.briar-ledger');checkpoint();walk(152,205);walk(140,185);walk(128,174);
  until(()=>g.state.mission?.objectiveStates.ledger==='completed');ready();pickup('item.briar-vigor-seed');checkpoint();
 }
 for(const p of [[153,170],[183,166],[183,129],[183,113],[157,102],[183,96],[201,96],[183,96],[181,77],[174,63]]){walk(...p as [number,number]);if(g.state.outcome)break;}
 until(()=>!!g.state.outcome,5000);
} catch(error){trace.push({failure:error instanceof Error?error.message:String(error)});process.exitCode=1;}
const result={route:optional?'optional':'direct',outcome:g.state.outcome,error:g.state.mission?.error,transport,simTick:g.state.tick,trace,objectives:g.state.mission?.objectiveStates,variables:g.state.mission?.variables,hero:{hp:hero.hp,experience:hero.progression?.experience,bonuses:hero.progression?.bonuses},survivors:g.entities.filter(e=>e.owner==='player.1'&&e.hp!>0).map(e=>({tag:e.placement,hp:e.hp,x:e.x,y:e.y}))};
mkdirSync('artifacts/briarwatch',{recursive:true});writeFileSync(`artifacts/briarwatch/${optional?'optional':'direct'}-playthrough.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(g.state.outcome?.winner!=='player.1')process.exitCode=1;
