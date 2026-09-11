import {heading} from '../../src/sim/game/facing';
import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
function setup(){
 const g=game([placed('archer','unit.ants.archer',224,230),{...placed('enemy','unit.ants.warrior',228,230),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='archer')!,b=g.entities.find(e=>e.placement==='enemy')!;
 a.rotation=heading(a,b);a.unit!.target=b.id;g.combat.resolve();
 g.state.tick=a.unit!.attack!.impact;g.combat.resolve();g.observation.update();
 return {g,a,b};
}
describe('authoritative projectiles',()=>{
 it('releases a visible missile without instant damage and preserves it in a snapshot',()=>{
  const {g,a,b}=setup();
  expect(b.hp).toBe(g.registry.get(b.definition).body!.maxHp);
  const seen=g.view('player.2').entities.find(e=>e.id===a.id)!;
  expect(seen.unit!.target).toBeNull();
  expect(g.view('player.2').missiles?.[0]).toMatchObject({destination:{x:228,y:230},source:a.id,target:b.id});
  const save=g.snapshot();g.restore(save);expect(g.snapshot()).toEqual(save);
 });
 it('does not reveal a destination to an observer who did not see both endpoints',()=>{
  const {g}=setup();g.state.missiles[0].viewers=['player.1'];g.observation.update();
  expect(g.view('player.2').missiles).toEqual([]);
 });
 it('hits a moving target at impact, even after the shooter dies, and never hits twice',()=>{
  const {g,a,b}=setup(),m=g.state.missiles[0],hp=b.hp!;
  a.hp=0;b.unit!.position={x:229000,y:230000};
  g.state.tick=m.impact-1;g.combat.resolve();expect(b.hp).toBe(hp);
  expect(m.destination.x).toBe(229);
  g.state.tick++;g.combat.resolve();expect(b.hp).toBeLessThan(hp);
  const after=b.hp;g.combat.resolve();expect(b.hp).toBe(after);
 });
});
