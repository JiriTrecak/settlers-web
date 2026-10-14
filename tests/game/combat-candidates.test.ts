import {expect,it} from 'vitest';
import {game,placed} from './helpers';

it('acquires the lowest-id enemy among equidistant candidates and never a friendly formation member',()=>{
 const g=game([
  ...Array.from({length:24},(_,i)=>placed(`friend-${i}`,'unit.test.warrior',100+i%6,100+Math.floor(i/6))),
  {...placed('enemy-a','unit.test.warrior',109,100),owner:'player.2'},
  {...placed('enemy-b','unit.test.warrior',100,109),owner:'player.2'},
 ]);
 const actor=g.entities.find(e=>e.placement==='friend-0')!,enemies=g.entities.filter(e=>e.placement?.startsWith('enemy-'));
 for(const e of enemies)g.command('player.2',{type:'hold',actors:[e.id]});
 g.observation.update();
 for(let i=0;i<40&&actor.unit!.target===null;i++)g.tick();
 expect(actor.unit!.target).toBe(Math.min(...enemies.map(e=>e.id)));
 for(const friend of g.entities.filter(e=>e.placement?.startsWith('friend-')))
  if(friend.unit!.target!==null)expect(enemies.map(e=>e.id)).toContain(friend.unit!.target);
});
