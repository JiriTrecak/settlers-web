import {slotOwner} from '../../src/content/schema';
import type {SimulationRuntime} from '../../src/session/worker/runtime';

/** Explicit staged-army fixture, never run in ordinary matches. Production AI,
 * fog, collision and command delivery remain enabled. Setup is outside timing. */
export function stageHumanArmy(runtime:SimulationRuntime,count:number){
 if(!Number.isSafeInteger(count)||count<1||count>96)throw Error('Human army must contain 1–96 units');
 const game=runtime.world.settlement,c=game.context,owner=slotOwner(runtime.me);
 const hall=c.get(game.state.objectives[owner]);if(!hall)throw Error('Human hall missing');
 const enemies=runtime.match.slots.filter(s=>s.player!==runtime.me).flatMap(s=>{
  const e=c.get(game.state.objectives[slotOwner(s.player)]);return e?[e]:[];
 }).sort((a,b)=>(a.x-hall.x)**2+(a.y-hall.y)**2-((b.x-hall.x)**2+(b.y-hall.y)**2)||a.id-b.id);
 if(!enemies.length)throw Error('Enemy hall missing');
 const target=enemies[0],roles=['warrior','warrior','archer','archer','bombardier','marshal'];
 const units=[];
 for(let i=0;i<count;i++){
  const definition=`unit.ants.${roles[i%roles.length]}`;
  const spot=game.spatial.nearest({x:hall.x+(i%8-4)*2,y:hall.y+14+Math.floor(i/8)*2},48,undefined,{definition});
  if(!spot)throw Error(`No safe placement for staged soldier ${i}`);
  const entity=c.create({id:`benchmark-human-${i}`,definition,owner,position:spot,rotation:0});
  units.push(entity.id);
 }
 game.observation.update();
 return {
  units,target:{x:target.x,y:target.y},
  issue:()=>runtime.send({type:'move',actors:units.filter(id=>(c.get(id)?.hp??0)>0),destination:{x:target.x,y:target.y},attackMove:true}),
 };
}
