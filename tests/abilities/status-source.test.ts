import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {UNTIL_DEATH} from '../../src/sim/abilities/state';
import type {Entity} from '../../src/sim/game/state';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.doom')!;
function fixture(patch={},settings={}){
 const a=abilitySchema.parse({...base,...patch}),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:85,distance:3,combat:false,mana:200,...settings}));
 return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function step(f:ReturnType<typeof fixture>,n=1){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function cast(f:ReturnType<typeof fixture>){expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();step(f,20);expect(f.t.spellStatuses?.[0].sourceContext?.source).toBe(f.caster);}
function die(f:ReturnType<typeof fixture>,e:Entity=f.t){e.hp=0;f.game.onCombatDeath(e);}
const spirit=(f:ReturnType<typeof fixture>)=>f.game.entities.find(e=>e.summoned);
it('Doom persists until death and periodic damage manifests exactly one summon for the original owner',()=>{
 const f=fixture();cast(f);expect(f.c.abilities!.mana).toBe(50);expect(f.t.spellStatuses?.[0].expires).toBe(UNTIL_DEATH);
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'statusApplied',untilDeath:true}));
 step(f,150);expect(f.game.context.get(f.target)).toBeUndefined();expect(spirit(f)).toMatchObject({owner:'player.1',summoned:{source:f.caster,ability:f.a.id}});
 expect(f.game.entities.filter(e=>e.summoned)).toHaveLength(1);expect(f.game.abilities.observedEvents().filter(e=>e.event==='death')).toHaveLength(1);
 expect(f.game.abilities.observedEvents()).toContainEqual(expect.objectContaining({event:'summoned',durationTicks:7200}));
});
it('original applier ownership survives caster death and victim conversion',()=>{
 for(const change of ['sourceDead','sourceConverted','victimConverted']){const f=fixture();cast(f);
 if(change==='sourceDead')die(f,f.c);else if(change==='sourceConverted')f.c.owner='player.2';else f.t.owner='player.1';
 die(f);step(f);expect(spirit(f)?.owner).toBe('player.1');expect(spirit(f)?.summoned?.source).toBe(f.caster);}
});
it('a third party may kill the cursed victim without stealing the manifestation',()=>{
 const f=fixture();cast(f);const killer=f.game.context.create({id:'ally',definition:f.t.definition,owner:'player.2',position:{x:126,y:120},rotation:0});
 const hit=f.game.combat.abilityHit({source:killer.id,target:f.target,damage:1000,damageType:'spell'});for(const d of hit.dead)f.game.onCombatDeath(d);step(f);expect(spirit(f)?.owner).toBe('player.1');
});
it('nondispellable Doom remains, while a dispellable variant cancels its pending death grant',()=>{
 for(const dispel of [false,true]){const status=structuredClone(base.onRelease[0]);if(status.op!=='status')throw Error();status.dispel=dispel;
 const f=fixture({onRelease:[status]});cast(f);new SpellStatuses(f.game).apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,{op:'dispel',target:'target',amount:0,damageType:'spell',polarity:'negative'});die(f);step(f);expect(!!spirit(f)).toBe(!dispel);}
});
it('a refreshed curse replaces the source context and grants only the latest owner',()=>{
 const f=fixture();cast(f);const other=f.game.context.create({id:'other',definition:f.c.definition,owner:'player.2',position:{x:126,y:120},rotation:0});
 new SpellStatuses(f.game).apply(other.id,f.target,f.a,1,f.game.state.nextCast++,releaseEffects(f.a,1,'enemy')[0]);die(f);step(f);expect(spirit(f)?.owner).toBe('player.2');expect(f.game.entities.filter(e=>e.summoned)).toHaveLength(1);
});
it('resumes both a detached status and a queued manifestation deterministically',()=>{
 const f=fixture();cast(f);die(f,f.c);const g=fixture();g.game.restore(f.game.snapshot());
 for(let i=0;i<150;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());}
 const h=fixture();cast(h);die(h,h.c);die(h);const j=fixture();j.game.restore(h.game.snapshot());step(h);step(j);expect(h.game.checksum()).toBe(j.game.checksum());
});
it('a projectile can apply the source-owned curse after its caster was removed',()=>{
 const f=fixture({delivery:{kind:'projectile',speed:3}},{distance:10});expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();step(f,20);expect(f.game.state.spellDeliveries).toHaveLength(1);
 die(f,f.c);const g=fixture({delivery:{kind:'projectile',speed:3}},{distance:10});g.game.restore(f.game.snapshot());
 for(let i=0;i<270;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());}expect(spirit(f)?.owner).toBe('player.1');
});
it('source-owned grants do not expose applier positions through observation or hidden death cues',()=>{
 const f=fixture();cast(f);f.c.x=180;f.game.observation.update();const observed=f.game.view('player.2').entities.find(e=>e.id===f.target)!;expect(observed.spellStatuses?.[0].sourceContext).toBeUndefined();
 die(f);step(f);const event=f.game.abilities.observedEvents('player.2').find(e=>e.event==='death')!;expect(event).toBeDefined();expect(event.origin).toEqual({x:f.t.x,y:f.t.y});
 const g=fixture();cast(g);g.t.x=180;g.game.observation.update();die(g);step(g);expect(g.game.abilities.observedEvents('player.1').some(e=>e.event==='death')).toBe(false);
});
it('rejects corrupted saved ownership contexts atomically',()=>{
 const f=fixture();cast(f);const before=f.game.checksum();for(const patch of [{owner:'player.2'},{source:f.game.state.nextId},{definition:'item.amber'},{position:{x:999,y:999}}]){const save=f.game.snapshot();Object.assign(save.state.entities.find(e=>e.id===f.target)!.spellStatuses![0].sourceContext!,patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(before);}
 const missing=f.game.snapshot();delete missing.state.entities.find(e=>e.id===f.target)!.spellStatuses![0].sourceContext;expect(()=>f.game.restore(missing)).toThrow();
 const expiry=f.game.snapshot();expiry.state.entities.find(e=>e.id===f.target)!.spellStatuses![0].expires=9999;expect(()=>f.game.restore(expiry)).toThrow();expect(f.game.checksum()).toBe(before);
});
it('validates source contexts on travelling and persistent applications',()=>{
 for(const patch of [{delivery:{kind:'projectile',speed:3}},{persistent:{anchor:'point',durationTicks:400,intervalTicks:40,endsWithCaster:false}}]){
  const f=fixture(patch,{distance:10});expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();step(f,20);
  const save=f.game.snapshot(),records=patch.delivery?save.state.spellDeliveries:save.state.spellInstances;expect(records).toHaveLength(1);
  const hash=f.game.checksum();records[0].sourceContext!.owner='player.2';expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
  delete records[0].sourceContext;expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
 }
});
it('a persistent application retains its applier after caster removal and save/load',()=>{
 const patch={persistent:{anchor:'point',durationTicks:80,intervalTicks:40,endsWithCaster:false}},f=fixture(patch);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();step(f,20);die(f,f.c);
 const g=fixture(patch);g.game.restore(f.game.snapshot());for(let i=0;i<170;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());}
 expect(spirit(f)?.owner).toBe('player.1');expect(spirit(f)?.summoned?.source).toBe(f.caster);
});
it('rejects incompatible executor and until-death declarations',()=>{
 for(const patch of [{event:'kill'},{whileStatus:undefined},{manaCost:1}])expect(abilitySchema.safeParse({...base,triggers:[{...base.triggers![0],...patch}]}).success).toBe(false);
 const status=base.onRelease[0];if(status.op!=='status')throw Error();for(const patch of [{amount:100},{heroDuration:50}])expect(abilitySchema.safeParse({...base,onRelease:[{...status,...patch}]}).success).toBe(false);
});
it('cannot target heroes, mechanical units or high-level units',()=>{
 const f=fixture({},{targetNature:'mechanical'});expect(f.game.abilities.cast(f.caster,'preview',f.target)).not.toBeNull();
 // Preview clones deliberately strip hero progression; use real definitions for these gates.
 for(const definition of ['unit.ants.marshal','unit.neutral.hollow-stag']){
  const g=fixture(),target=g.game.context.create({id:'ineligible',definition,owner:'player.2',position:{x:125,y:122},rotation:0});g.game.observation.update();
  expect(g.game.abilities.cast(g.caster,'preview',target.id)).not.toBeNull();
 }
});
it('cleans the manifested summon through the ordinary expiry path',()=>{
 const f=fixture();cast(f);die(f);step(f);const s=spirit(f)!;f.game.state.tick=s.summoned!.expires-1;step(f);expect(f.game.context.get(s.id)).toBeUndefined();
});
