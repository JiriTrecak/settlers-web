import {expect,it} from 'vitest';
import {Mesh,Vector3} from 'three';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {testEffects} from '../fixtures/content';
import {encounter,presentationOf,testAbility} from '../abilities/encounter-harness';

it('keeps a drain pulse attached during movement, removes it on real tether cancellation, and reproduces it after restore',()=>{
 const ability=testAbility('ability.test.life-drain'),presentation=presentationOf(ability);
 const f=encounter(ability,{relationship:'enemy',distance:3,casterHealth:100,targetHealth:500});
 const effects=structuredClone(testEffects),link=effects.find(e=>e.id==='effect.test.life-drain')!;
 // Exercise follow regardless of future artistic defaults in the published proof.
 for(const l of link.layers)if(l.shape==='beam')l.follow=true;
 const fx=new AbilityEffects(()=>effects);
 const caster=f.game.context.get(f.caster)!,target=f.game.context.get(f.target)!;
 const anchor=(id:number)=>{const e=f.game.context.get(id);return e?{x:e.x,y:e.y,height:0}:undefined;};
 const step=()=>{f.game.tick(undefined,{passiveUnits:true});for(const event of f.game.abilities.drainEvents())fx.consume(event,presentation,()=>0,anchor);fx.update(f.game.state.tick,anchor);};
 try{
  expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();
  const start={caster:caster.hp!,target:target.hp!};
  while(f.game.state.tick<54)step();expect(caster.hp).toBeGreaterThan(start.caster);expect(target.hp).toBeLessThan(start.target);expect(fx.liveCues).toBeGreaterThan(0);
  const snapshot=f.game.snapshot(),cues=fx.liveCues,drained={caster:caster.hp!,target:target.hp!};
  target.x=caster.x+9;target.y=caster.y;step();expect(fx.liveCues).toBe(cues);
  const beam=fx.root.children.find(r=>r.children.some(m=>m instanceof Mesh&&m.geometry.type==='CylinderGeometry'))!;
  const last=beam.children.at(-1)!;beam.updateMatrixWorld(true);const end=last.localToWorld(new Vector3(0,.5,0));
  expect(end.x).toBeCloseTo(target.x);expect(end.z).toBeCloseTo(target.y);
  target.x=caster.x+12;step();expect(caster.abilities!.pending).toBeNull();expect(fx.liveCues).toBe(0);
  const cancelled={caster:caster.hp!,target:target.hp!};
  while(f.game.state.tick<120)step();expect(caster.hp).toBe(cancelled.caster);expect(target.hp).toBe(cancelled.target);
  f.game.restore(snapshot);
  // Restoring the authoritative cast cannot revive a previously cancelled render cue.
  expect(f.game.context.get(f.caster)!.abilities!.pending).not.toBeNull();expect(fx.liveCues).toBe(0);
  while(f.game.state.tick<90)step();expect(f.game.context.get(f.caster)!.hp).toBeGreaterThan(drained.caster);expect(f.game.context.get(f.target)!.hp).toBeLessThan(drained.target);expect(fx.liveCues).toBeGreaterThan(0);
 }finally{fx.dispose();}
});
