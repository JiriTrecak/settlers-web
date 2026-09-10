import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
const setup=()=>{
 const g=game([placed('attacker','unit.ants.warrior',200,210),{...placed('target','unit.ants.warrior',201,210),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='attacker')!,b=g.entities.find(e=>e.placement==='target')!;
 g.command('player.1',{type:'attack',actors:[a.id],target:b.id});
 return {g,a,b,policy:g.registry.get(a.definition).behaviors.combat!};
};
describe('authoritative attack timing',()=>{
 it('winds up before applying damage exactly once at contact and exposes the same timeline',()=>{
  const {g,a,b,policy}=setup(),hp=b.hp!;
  g.combat.resolve();expect(b.hp).toBe(hp);
  expect(g.view('player.1').entities.find(e=>e.id===a.id)?.unit?.attack).toMatchObject({started:0,impact:policy.attack.windupTicks,released:false});
  g.state.tick=policy.attack.windupTicks-1;g.combat.resolve();expect(b.hp).toBe(hp);
  g.state.tick++;g.combat.resolve();expect(b.hp).toBeLessThan(hp);
  const hitHp=b.hp;g.combat.resolve();expect(b.hp).toBe(hitHp);
 });
 it('lands a committed strike when the target steps slightly outside the acquisition range',()=>{
  const {g,a,b,policy}=setup(),hp=b.hp!;g.combat.resolve();
  b.unit!.position={x:Math.round((a.x+policy.range+.2)*1000),y:a.y*1000};
  g.state.tick=policy.attack.windupTicks;g.combat.resolve();expect(b.hp).toBeLessThan(hp);
 });
 it('does not stretch a melee hit to a target that genuinely escaped',()=>{
  const {g,a,b,policy}=setup(),hp=b.hp!;g.combat.resolve();
  b.unit!.position={x:Math.round((a.x+policy.range+policy.attack.rangeBuffer+.1)*1000),y:a.y*1000};
  g.state.tick=policy.attack.windupTicks;g.combat.resolve();expect(b.hp).toBe(hp);
 });
 it('an explicit move cancels windup without resetting cooldown',()=>{
  const {g,a,b,policy}=setup(),hp=b.hp!;g.combat.resolve();const cooldown=a.unit!.cooldown;
  g.command('player.1',{type:'move',actors:[a.id],destination:{x:198,y:210}});
  expect(a.unit!.attack).toBeUndefined();expect(a.unit!.cooldown).toBe(cooldown);
  g.state.tick=policy.attack.windupTicks;g.combat.resolve();expect(b.hp).toBe(hp);
 });
 it('snapshots retain a committed attack phase',()=>{
  const {g,a}=setup();g.combat.resolve();
  const snapshot=g.snapshot();g.restore(snapshot);
  expect(g.entities.find(e=>e.id===a.id)?.unit?.attack).toEqual(a.unit!.attack);
 });
});
