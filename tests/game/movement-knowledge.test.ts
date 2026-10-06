import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';
import type {AuthoredDefinition} from '../../src/content/schema';

const placements=[placed('mover','unit.ants.warrior',40,100),
 {...placed('hidden','unit.ants.warrior',140,100),owner:'player.2' as const}];
const find=(g:ReturnType<typeof game>,id:string)=>g.entities.find(e=>e.placement===id)!;

it.each([false,true])('does not reveal distant occupancy through a move route (attack move: %s)',attackMove=>{
 const a=game(placements),b=game(placements);
 find(b,'hidden').hp=0;
 for(const g of [a,b]){
  const mover=find(g,'mover');
  g.command('player.2',{type:'hold',actors:[find(g,'hidden').id]});
  expect(g.observation.visible('player.1',find(g,'hidden'))).toBe(false);
  expect(g.command('player.1',{type:'move',actors:[mover.id],destination:{x:140,y:100},attackMove}).accepted).toBe(true);
 }
 const restored=game(placements);
 for(let tick=0;tick<100;tick++){
  a.tick();b.tick();
  expect(a.observation.visible('player.1',find(a,'hidden'))).toBe(false);
  expect(find(a,'mover').unit).toEqual(find(b,'mover').unit);
  expect(precise(find(a,'mover'))).toEqual(precise(find(b,'mover')));
  if(tick===20)restored.restore(JSON.parse(JSON.stringify(a.snapshot())));
  else if(tick>20){restored.tick();expect(restored.checksum('full')).toBe(a.checksum('full'));}
 }
 expect(precise(find(a,'mover')).x).toBeGreaterThan(60);
});

it('separates planning knowledge from physical collision and still avoids known occupants',()=>{
 const g=game(placements),mover=find(g,'mover'),hidden=find(g,'hidden'),destination={x:140,y:100};
 // Planning can choose an unobserved occupied point, but motion cannot cross it.
 expect(g.spatial.nearest(destination,8,mover.id,undefined,undefined,()=>false)).toEqual(destination);
 expect(g.spatial.unitSegmentClear(fixed({x:135,y:100}),fixed(destination),mover.id)).toBe(false);
 const known=g.spatial.nearest(destination,8,mover.id,undefined,undefined,()=>true)!;
 expect(known).not.toEqual(destination);
 expect(Math.hypot(known.x-hidden.x,known.y-hidden.y)).toBeGreaterThanOrEqual(3);
 expect(g.spatial.free(known,mover.id)).toBe(true);
});

it('can plan scripted neutral movement without requiring a combat behavior',()=>{
 const g=game([{...placed('neutral','unit.ants.settler',100,100),owner:'none'},
  placed('occupant','unit.ants.warrior',105,100)],draft=>{
   const worker=(draft.definitions as AuthoredDefinition[]).find(d=>d.id==='unit.ants.settler')!;
   worker.disabledBehaviors=[...(worker.disabledBehaviors??[]),'combat'];
  });
 const mover=find(g,'neutral');
 expect(g.registry.get(mover.definition).behaviors.combat).toBeUndefined();
 mover.unit!.order={type:'move',destination:{x:105,y:100},attackMove:false};
 expect(()=>g.combat.plan()).not.toThrow();
 expect(mover.unit!.goal).not.toBeNull();
 expect(g.spatial.free(g.spatial.point(mover.unit!.goal!),mover.id)).toBe(true);
});
