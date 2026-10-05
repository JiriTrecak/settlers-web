import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {TargetIndex} from '../../src/sim/game/targetIndex';
import type {Entity} from '../../src/sim/game/state';

it('rejects friendly formation members before distance and weapon checks while retaining stable enemy ties',()=>{
 const g=game([
  ...Array.from({length:24},(_,i)=>placed(`friend-${i}`,'unit.ants.warrior',100+i%6,100+Math.floor(i/6))),
  {...placed('enemy-a','unit.ants.warrior',109,100),owner:'player.2'},
  {...placed('enemy-b','unit.ants.warrior',100,109),owner:'player.2'},
 ]);
 const actor=g.entities.find(e=>e.placement==='friend-0')!,enemies=g.entities.filter(e=>e.placement?.startsWith('enemy-'));
 const targets=new TargetIndex(g.context.liveBodies(),g.registry);
 const range=vi.spyOn(g.spatial,'range');
 const combat=g.combat as unknown as {closestTarget(a:Entity,t:TargetIndex,r:number):Entity|undefined};
 expect(combat.closestTarget(actor,targets,14)?.id).toBe(Math.min(...enemies.map(e=>e.id)));
 expect(range.mock.calls.length).toBeGreaterThan(0);
 expect(range.mock.calls.every(([,target])=>target.owner!==actor.owner)).toBe(true);
});
