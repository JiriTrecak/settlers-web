import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import type {Entity} from '../../src/sim/game/state';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.death-burst')!;
function fixture(patch={},settings={}){
 const a=abilitySchema.parse({...base,...patch}),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:3,combat:false,...settings}));
 return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function die(f:ReturnType<typeof fixture>,e:Entity=f.c){e.hp=0;f.game.onCombatDeath(e);}
function step(f:ReturnType<typeof fixture>,n=1){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
it('captures a passive death reaction before removal and damages queried enemies exactly once',()=>{
 const f=fixture();die(f);expect(f.game.context.get(f.caster)).toBeUndefined();expect(f.game.state.spellLifecycleReactions).toHaveLength(1);
 die(f);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);step(f);
 expect(f.t.hp).toBe(420);expect(f.game.state.spellLifecycleReactions).toEqual([]);step(f,3);expect(f.t.hp).toBe(420);
 const cue=f.game.abilities.observedEvents().find(e=>e.event==='death');expect(cue).toMatchObject({caster:f.caster,target:0,origin:{x:120,y:120},point:{x:120,y:120}});
});
it('resolves chains of lethal death reactions without recursive processing or duplicated deaths',()=>{
 const f=fixture();const make=(owner:'player.1'|'player.2',x:number)=>{const e=f.game.context.create({id:'chain',definition:f.c.definition,owner,position:{x,y:120},rotation:0});e.hp=50;return e;};
 const second=make('player.2',122),third=make('player.1',124);die(f);step(f);
 expect(f.game.context.get(second.id)).toBeUndefined();expect(f.game.context.get(third.id)).toBeUndefined();
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='death')).toHaveLength(3);expect(f.game.state.spellLifecycleReactions).toEqual([]);
});
it('captures applied-status triggers before statuses are removed and ignores expired grants',()=>{
 const status={op:'status',target:'target',id:'volatile',amount:40,polarity:'positive',dispel:true,modifiers:{}};
 const f=fixture({activation:'targeted',targeting:{...base.targeting,kind:'unit',relations:['ally','enemy'],range:16},onRelease:[status],triggers:base.triggers!.map(t=>({...t,whileStatus:'volatile'}))});
 new SpellStatuses(f.game).apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,releaseEffects(f.a,1,'enemy')[0]);die(f,f.t);expect(f.game.state.spellLifecycleReactions).toHaveLength(1);step(f);expect(f.c.hp).toBe(420);
 const g=fixture({activation:'targeted',targeting:{...base.targeting,kind:'unit',relations:['ally','enemy'],range:16},onRelease:[status],triggers:base.triggers!.map(t=>({...t,whileStatus:'volatile'}))});
 new SpellStatuses(g.game).apply(g.caster,g.target,g.a,1,g.game.state.nextCast++,releaseEffects(g.a,1,'enemy')[0]);g.game.state.tick=40;die(g,g.t);expect(g.game.state.spellLifecycleReactions).toEqual([]);
});
it('dispelled status grants do not leave a death hook behind',()=>{
 const a=abilitySchema.parse({...base,activation:'targeted',targeting:{...base.targeting,kind:'unit',relations:['ally','enemy'],range:16},onRelease:[{op:'status',target:'target',id:'volatile',amount:40,polarity:'negative',dispel:true,modifiers:{}}],triggers:base.triggers!.map(t=>({...t,whileStatus:'volatile'}))}),f=fixture(a),statuses=new SpellStatuses(f.game);
 statuses.apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,releaseEffects(f.a,1,'enemy')[0]);statuses.apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,{op:'dispel',target:'target',amount:0,damageType:'spell',polarity:'negative'});die(f,f.t);expect(f.game.state.spellLifecycleReactions).toEqual([]);
});
it('queued ownership, point and rank survive save/load after their source is gone',()=>{
 const f=fixture();f.c.abilities!.ranks.preview=3;die(f);const restored=fixture();restored.game.restore(f.game.snapshot());
 for(let i=0;i<10;i++){step(f);step(restored);expect(restored.game.checksum()).toBe(f.game.checksum());}expect(f.t.hp).toBe(340);
});
it('limits death programs per tick while carrying the durable remainder forward',()=>{
 const f=fixture();for(let i=0;i<140;i++){const e=f.game.context.create({id:'crowd',definition:f.c.definition,owner:'player.1',position:{x:40,y:40},rotation:0});die(f,e);}
 expect(f.game.state.spellLifecycleReactions).toHaveLength(140);const g=fixture();g.game.restore(f.game.snapshot());step(f);step(g);
 expect(f.game.state.spellLifecycleReactions).toHaveLength(12);expect(g.game.checksum()).toBe(f.game.checksum());step(f);step(g);expect(f.game.state.spellLifecycleReactions).toEqual([]);expect(g.game.checksum()).toBe(f.game.checksum());
});
it('rejects malformed queued trigger references and positions atomically',()=>{
 const f=fixture();die(f);const before=f.game.checksum();
 for(const patch of [{trigger:'missing'},{cast:f.game.state.nextCast},{tick:100},{position:{x:999,y:999}},{definition:'item.amber'}]){const save=f.game.snapshot();Object.assign(save.state.spellLifecycleReactions[0],patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(before);}
});
it('hidden deaths do not broadcast an effect to an enemy observer',()=>{
 const f=fixture();f.t.x=180;f.game.observation.update();die(f);expect(f.game.state.spellLifecycleReactions[0].viewers).not.toContain('player.2');step(f);expect(f.game.abilities.observedEvents('player.2').some(e=>e.event==='death')).toBe(false);
});
it('death-triggered point summons retain their dead holder owner and appear around the captured point',()=>{
 const summon={op:'summon',target:'point',amount:1,definition:'unit.spell.feral-spirit',durationTicks:80,replace:false,radius:2};
 const f=fixture({triggers:[{...base.triggers![0],operations:[summon]}]});die(f);step(f);
 const spirit=f.game.entities.find(e=>e.summoned);expect(spirit?.owner).toBe('player.1');expect(spirit?.summoned?.source).toBe(f.caster);expect(Math.hypot(spirit!.x-120,spirit!.y-120)).toBeLessThanOrEqual(4);
});

it('a removed neutral camp member keeps its aggression policy for death damage',()=>{
 const f=fixture({activation:'targeted',targeting:{...base.targeting,kind:'unit',relations:['ally','enemy'],range:16},onRelease:[{op:'status',target:'target',id:'volatile',amount:80,polarity:'negative',dispel:true,modifiers:{}}],triggers:base.triggers!.map(t=>({...t,whileStatus:'volatile'}))},{relationship:'neutral',combat:true});
 new SpellStatuses(f.game).apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,releaseEffects(f.a,1,'enemy')[0]);
 expect(f.t.unit?.camp).toBe('preview-camp');die(f,f.t);step(f);expect(f.c.hp).toBe(420);
});
it('never fires an unlearned passive and does not overflow the pending queue',()=>{
 const f=fixture();f.c.abilities!.ranks.preview=0;die(f);expect(f.game.state.spellLifecycleReactions).toEqual([]);
 for(let i=0;i<520;i++){const e=f.game.context.create({id:'bounded',definition:f.c.definition,owner:'player.1',position:{x:40,y:40},rotation:0});die(f,e);}
 expect(f.game.state.spellLifecycleReactions).toHaveLength(512);expect(()=>f.game.snapshot()).not.toThrow();
});
it('rejects death operations aimed directly at their dead holder instead of a live query',()=>{
 expect(abilitySchema.safeParse({...base,triggers:[{...base.triggers![0],operations:[{op:'heal',target:'caster',amount:100}]}]}).success).toBe(false);
});
