import {slotOwner} from '../../src/content/schema';
import type {SimulationRuntime} from '../../src/session/worker/runtime';

/** Explicit staged-army fixture, never run in ordinary matches. Production AI,
 * fog, collision and command delivery remain enabled. Setup is outside timing. */
function stageArmy(runtime:SimulationRuntime,count:number,player:number,balanced=false){
 if(!Number.isSafeInteger(count)||count<1||count>96)throw Error('Staged army must contain 1–96 units');
 const game=runtime.world.settlement,c=game.context,owner=slotOwner(player);
 const hall=c.get(game.state.objectives[owner]);if(!hall)throw Error('Staged player hall missing');
 const enemies=runtime.match.slots.filter(s=>s.player!==player).flatMap(s=>{
  const e=c.get(game.state.objectives[slotOwner(s.player)]);return e?[e]:[];
 }).sort((a,b)=>(a.x-hall.x)**2+(a.y-hall.y)**2-((b.x-hall.x)**2+(b.y-hall.y)**2)||a.id-b.id);
 if(!enemies.length)throw Error('Enemy hall missing');
 const target=enemies[0],roles=['warrior','warrior','archer','archer','bombardier','marshal'];
 const units=[];
 for(let i=0;i<count;i++){
  const role=balanced?(i===count-1?'marshal':['warrior','warrior','archer','archer','bombardier'][i%5]):roles[i%roles.length];
  const definition=`unit.ants.${role}`;
  // Buildings can sit between cell centres; authored unit spawns cannot.
  const spot=game.spatial.nearest({x:Math.round(hall.x)+(i%8-4)*2,y:Math.round(hall.y)+14+Math.floor(i/8)*2},48,undefined,{definition});
  if(!spot)throw Error(`No safe placement for staged soldier ${i}`);
  const entity=c.create({id:balanced?`benchmark-player-${player}-${i}`:`benchmark-human-${i}`,definition,owner,position:spot,rotation:0});
  units.push(entity.id);
 }
 game.observation.update();
 return {units,target:{x:Math.round(target.x),y:Math.round(target.y)}};
}

function attackOrder(runtime:SimulationRuntime,army:ReturnType<typeof stageArmy>){
 return {...army,issue:()=>runtime.send({type:'move',actors:army.units.filter(id=>(runtime.world.settlement.context.get(id)?.hp??0)>0),destination:army.target,attackMove:true})};
}
export function stageHumanArmy(runtime:SimulationRuntime,count:number){return attackOrder(runtime,stageArmy(runtime,count,runtime.me));}

/** Equal mixed starting armies with one hero each. Only the human receives a
 * scripted order; the opponent keeps its normal production AI and economy. */
export function stageBattleArmies(runtime:SimulationRuntime,count:number){
 if(runtime.match.slots.length!==2||runtime.match.slots.filter(s=>s.kind==='ai').length!==1)throw Error('Balanced fixture requires one human and one AI');
 const human=stageArmy(runtime,count,runtime.me,true);
 const opponent=runtime.match.slots.find(s=>s.player!==runtime.me)!;
 const enemy=stageArmy(runtime,count,opponent.player,true);
 return {...attackOrder(runtime,human),opponent:{player:opponent.player,units:enemy.units}};
}
