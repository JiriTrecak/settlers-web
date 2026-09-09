import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
describe('visible projectile presentation',()=>{
 it('shows an enemy shot without exposing orders, and preserves it in a snapshot',()=>{
  const g=game([placed('archer','unit.ants.archer',224,230),{...placed('enemy','unit.ants.warrior',228,230),owner:'player.2'}]);
  const a=g.entities.find(e=>e.placement==='archer')!,b=g.entities.find(e=>e.placement==='enemy')!;
  a.unit!.target=b.id;g.combat.resolve();g.observation.update();
  const seen=g.view('player.2').entities.find(e=>e.id===a.id)!;
  expect(seen.unit!.target).toBeNull();expect(seen.unit!.shot).toMatchObject({x:228,y:230,tick:0});
  const save=g.snapshot();g.restore(save);expect(g.snapshot()).toEqual(save);
 });
 it('does not reveal a shot destination to an observer who cannot see both endpoints',()=>{
  const g=game([placed('archer','unit.ants.archer',224,230),{...placed('enemy','unit.ants.warrior',228,230),owner:'player.2'}]);
  const a=g.entities.find(e=>e.placement==='archer')!,b=g.entities.find(e=>e.placement==='enemy')!;
  a.unit!.target=b.id;g.combat.resolve();a.unit!.shot!.viewers=['player.1'];g.observation.update();
  expect(g.view('player.2').entities.find(e=>e.id===a.id)!.unit!.shot).toBeUndefined();
 });
});
