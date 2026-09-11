import {heading} from '../../src/sim/game/facing';
import {describe,it,expect} from 'vitest';
import {game,placed} from './helpers';
const setup=()=>{
 const g=game([placed('attacker','unit.ants.warrior',200,210),{...placed('target','unit.ants.warrior',201,210),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='attacker')!,b=g.entities.find(e=>e.placement==='target')!;
 a.rotation=heading(a,b);
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

it('captures faster attack phases and preserves the committed contact after the bonus is removed',()=>{
 const g=game([placed('hero','unit.ants.marshal',100,100),{...placed('victim','unit.ants.warrior',101,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='hero')!, b=g.entities.find(e=>e.placement==='victim')!;
 a.equipment![0]='item.stormwing-spurs';a.rotation=heading(a,b);
 const base=g.registry.get(a.definition).behaviors.combat!,cycle=g.context.stats(a).cooldownTicks;
 g.command('player.1',{type:'attack',actors:[a.id],target:b.id});g.combat.resolve();
 const phase={...a.unit!.attack!},hp=b.hp!;
 expect(phase.cycleTicks).toBe(cycle);expect(cycle).toBeLessThan(base.cooldownTicks);
 expect(phase.impact).toBe(Math.round(base.attack.windupTicks*cycle/base.cooldownTicks));
 expect(phase.ends-phase.impact).toBe(Math.round(base.attack.recoveryTicks*cycle/base.cooldownTicks));
 a.equipment![0]=null;
 const saved=g.snapshot();g.restore(saved);
 const target=g.entities.find(e=>e.id===b.id)!;
 expect(g.entities.find(e=>e.id===a.id)!.unit!.attack).toEqual(phase);
 g.state.tick=phase.impact-1;g.combat.resolve();expect(target.hp).toBe(hp);
 g.state.tick++;g.combat.resolve();expect(target.hp).toBeLessThan(hp);
});

it('rejects a saved attack whose impact disagrees with its captured speed',()=>{
 const {g,a}=setup();g.combat.resolve();a.unit!.attack!.impact++;
 expect(()=>g.restore(g.snapshot())).toThrow(/attack/i);
});
