import {expect,it} from 'vitest';
import {Mesh,Vector3} from 'three';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {coreAbilities} from '../../src/content/abilities/core';
import {coreEffects} from '../../src/content/effects/library';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';

it('keeps a drain pulse attached during movement, removes it on real tether cancellation, and reproduces it after restore',()=>{
 const ability=coreAbilities.abilities.find(a=>a.id==='ability.core.life-drain')!,presentation=coreAbilities.presentations.find(p=>p.id===ability.presentation)!;
 const f=createAbilityEncounter(ability,presentation,encounterSettingsSchema.parse({relationship:'enemy',distance:3,casterHealth:100,targetHealth:500}));
 const effects=structuredClone(coreEffects),link=effects.find(e=>e.id==='effect.core.life-drain')!;
 // Exercise follow regardless of future artistic defaults in the published proof.
 for(const l of link.layers)if(l.shape==='beam')l.follow=true;
 const fx=new AbilityEffects(()=>effects);
 const caster=f.game.context.get(f.caster)!,target=f.game.context.get(f.target)!;
 const anchor=(id:number)=>{const e=f.game.context.get(id);return e?{x:e.x,y:e.y,height:0}:undefined;};
 const step=()=>{f.game.tick(undefined,{passiveUnits:true});for(const event of f.game.abilities.drainEvents())fx.consume(event,presentation,()=>0,anchor);fx.update(f.game.state.tick,anchor);};
 try{
  expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();
  while(f.game.state.tick<54)step();expect(caster.hp).toBe(130);expect(target.hp).toBe(470);expect(fx.liveCues).toBeGreaterThan(0);
  const snapshot=f.game.snapshot(),cues=fx.liveCues;
  target.x=caster.x+9;target.y=caster.y;step();expect(fx.liveCues).toBe(cues);
  const beam=fx.root.children.find(r=>r.children.some(m=>m instanceof Mesh&&m.geometry.type==='CylinderGeometry'))!;
  const last=beam.children.at(-1)!;beam.updateMatrixWorld(true);const end=last.localToWorld(new Vector3(0,.5,0));
  expect(end.x).toBeCloseTo(target.x);expect(end.z).toBeCloseTo(target.y);
  target.x=caster.x+12;step();expect(caster.abilities!.pending).toBeNull();expect(fx.liveCues).toBe(0);
  while(f.game.state.tick<120)step();expect(caster.hp).toBe(130);expect(target.hp).toBe(470);
  f.game.restore(snapshot);
  // Restoring the authoritative cast cannot revive a previously cancelled render cue.
  expect(f.game.context.get(f.caster)!.abilities!.pending).not.toBeNull();expect(fx.liveCues).toBe(0);
  while(f.game.state.tick<90)step();expect(f.game.context.get(f.caster)!.hp).toBe(160);expect(f.game.context.get(f.target)!.hp).toBe(440);expect(fx.liveCues).toBeGreaterThan(0);
 }finally{fx.dispose();}
});
