import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {routeToAttack} from '../../src/sim/game/attackApproach';
import type {Point} from '../../src/sim/game/state';

it('shares target terrain checks while retaining each attacker’s position and changing reservations',()=>{
 const placements=[placed('one','unit.ants.archer',100,110),placed('two','unit.ants.archer',101,110),
  {...placed('enemy','unit.ants.warrior',113,110),owner:'player.2'}];
 const cached=game(placements),reference=game(placements),geometry=new Map<string,readonly Point[]>();
 const target=cached.entities.find(e=>e.placement==='enemy')!,otherTarget=reference.entities.find(e=>e.placement==='enemy')!;
 const check=vi.spyOn(cached.spatial,'attackClear');
 for(const name of ['one','two']){
  const actor=cached.entities.find(e=>e.placement===name)!,other=reference.entities.find(e=>e.placement===name)!;
  actor.unit!.target=target.id;other.unit!.target=otherTarget.id;
  expect(routeToAttack(cached.context,actor,target,geometry)).toBe(routeToAttack(reference.context,other,otherTarget));
  expect(actor.unit).toEqual(other.unit);
  if(name==='one'){expect(check).toHaveBeenCalled();check.mockClear();}
  else expect(check).not.toHaveBeenCalled();
 }
});
