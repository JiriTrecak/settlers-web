/** Reproducible AI smoke match using the shipped map, rules and fog-limited brains. */
import {readFileSync} from 'node:fs';
import {parseUtcMap} from '../src/shared/map/utcmap';
import {World} from '../src/sim/world/world';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/showcase/mosswater-divide.utcmap','utf8')))!;
const world=new World({map,slots:[{player:0,kind:'ai'},{player:1,kind:'ai'}],seed:42});
for(let tick=1;tick<=16000;tick++){
 world.tick();
 if(tick%2400===0||tick===16000){
  const g=world.settlement!;
  console.log(JSON.stringify({tick,seconds:tick/40,players:['player.1','player.2'].map(owner=>{
   const own=g.entities.filter(e=>e.owner===owner&&e.hp!==0),hero=own.find(e=>g.registry.get(e.definition).hero);
   return {owner,workers:own.filter(e=>g.registry.get(e.definition).behaviors.work).length,army:own.filter(e=>g.registry.get(e.definition).behaviors.combat).length,buildings:own.filter(e=>g.registry.get(e.definition).kind==='building').map(e=>e.definition),hero:hero?{level:g.context.stats(hero).level,hp:hero.hp}:null,bank:g.context.get(g.state.objectives[owner])?.inventory};
  }),cleared:g.state.clearedCamps,outcome:g.state.outcome}));
 }
}
