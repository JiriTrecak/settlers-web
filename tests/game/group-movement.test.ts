import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {precise} from '../../src/sim/game/motion';
it('moves a compact army through open ground without leaving members stalled behind',()=>{
 const g=game(Array.from({length:16},(_,i)=>placed(`army${i}`,'unit.ants.warrior',100+i%4,100+Math.floor(i/4))));
 const army=g.entities.filter(e=>e.placement?.startsWith('army'));
 g.command('player.1',{type:'move',actors:army.map(e=>e.id),destination:{x:120,y:112}});
 g.tick();
 expect(army.every(e=>e.unit!.position !== null)).toBe(true);
 for(let i=0;i<400;i++){g.tick();}
 const stalled=army.filter(e=>Math.hypot(precise(e).x-120,precise(e).y-112)>4);
 expect(stalled.map(e=>({id:e.id,pos:{x:precise(e).x,y:precise(e).y},route:e.unit!.route}))).toEqual([]);
});
