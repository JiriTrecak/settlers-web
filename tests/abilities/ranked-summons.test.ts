import {expect,it} from 'vitest';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
const ids=['unit.spell.shadow-spirit-lesser','unit.spell.shadow-spirit-standard','unit.spell.shadow-spirit-greater'];
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!;
function definition(patch={}){return abilitySchema.parse({...base,ranks:[{count:1,duration:40},{count:2,duration:80},{count:3,duration:120}],cast:{...base.cast,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:[{op:'summon',target:'caster',definition:{byRank:ids},amount:{rankParameter:'count'},durationTicks:{rankParameter:'duration'},replace:true,radius:3}],...patch});}
function fixture(rank=1,a=definition()){
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'self',combat:false,mana:1000}));
 const c=f.game.context.get(f.caster)!;c.abilities!.ranks.preview=rank;
 return {...f,a,c};
}
const step=(f:ReturnType<typeof fixture>,n:number)=>{for(let i=0;i<n;i++)f.game.tick();};
const summons=(f:ReturnType<typeof fixture>)=>f.game.entities.filter(e=>e.summoned);
function cast(f:ReturnType<typeof fixture>){expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();step(f,11);}
it.each([1,2,3])('rank %i resolves creature, quantity, body and expiration from the same release',rank=>{
 const f=fixture(rank);cast(f);const group=summons(f);expect(group).toHaveLength(rank);
 for(const e of group){expect(e.definition).toBe(ids[rank-1]);expect(e.hp).toBe([215,290,405][rank-1]);expect(e.summoned).toMatchObject({rank,source:f.caster,ability:f.a.id});expect(e.summoned!.expires-e.summoned!.started).toBe(rank*40);expect(f.game.registry.get(e.definition).supplyCost).toBe(0);}
 expect(f.game.abilities.observedEvents().find(e=>e.event==='summoned')?.durationTicks).toBe(rank*40);
 const expiry=group[0].summoned!.expires;step(f,expiry-f.game.state.tick-1);expect(summons(f)).toHaveLength(rank);step(f,1);expect(summons(f)).toHaveLength(0);
});
it('replacement removes the old rank group before creating the new one',()=>{
 const f=fixture();cast(f);const old=summons(f)[0].id;step(f,20);f.c.abilities!.ranks.preview=3;cast(f);expect(summons(f)).toHaveLength(3);expect(summons(f).every(e=>e.definition===ids[2]&&e.id!==old)).toBe(true);
});
it('save/load retains original summon rank and expiration after source death',()=>{
 const f=fixture(2);cast(f);f.c.hp=0;f.game.onCombatDeath(f.c);const g=fixture(2);g.game.restore(f.game.snapshot());
 for(let i=0;i<90;i++){step(f,1);step(g,1);expect(g.game.checksum()).toBe(f.game.checksum());}expect(summons(f)).toHaveLength(0);
});
it('rejects forged rank, lifetime, cast, creature or start tick before changing the world',()=>{
 const f=fixture(1);cast(f);const hash=f.game.checksum();f.game.restore(f.game.snapshot());
 for(const patch of [{rank:3},{expires:9999},{started:99},{cast:9999},{source:9999}]){const save=f.game.snapshot(),e=save.state.entities.find(e=>e.summoned)!;Object.assign(e.summoned!,patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);}
 const save=f.game.snapshot();save.state.entities.find(e=>e.summoned)!.definition=ids[2];expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
});
it('requires exactly one valid unit per rank and a bounded positive ranked duration',()=>{
 const a=definition(),op=a.onRelease[0];
 for(const patch of [{definition:{byRank:[ids[0]]}},{definition:{byRank:[...ids,ids[0]]}},{durationTicks:0},{durationTicks:144001},{durationTicks:{rankParameter:'absent'}}])expect(abilitySchema.safeParse({...a,onRelease:[{...op,...patch}]}).success).toBe(false);
 for(const id of ['unit.missing.missing','building.ants.acorn-hall'])expect(()=>fixture(1,definition({onRelease:[{...op,definition:{byRank:[ids[0],id,ids[2]]}}]}))).toThrow(/summons require/);
});
it('fixed definitions remain valid for all ranks and resolve without mutating declarations',()=>{
 const a=definition({onRelease:[{op:'summon',target:'caster',definition:ids[0],amount:1,durationTicks:60,replace:false,radius:3}]});const original=JSON.stringify(a);
 expect(releaseEffects(a,3,'ally')[0]).toMatchObject({definition:ids[0],durationTicks:60});expect(JSON.stringify(a)).toBe(original);
});
it.each([1,2,3])('published Black Arrow rank %i raises the corresponding spirit through its death mark',rank=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.black-arrow')!;
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({combat:true,relationship:'enemy',casterDefinition:'unit.ants.archer',distance:10,targetHealth:5,mana:40}));
 f.game.context.get(f.caster)!.abilities!.ranks.preview=rank;expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();
 for(let i=0;i<150&&!f.game.entities.some(e=>e.summoned);i++)f.game.tick();
 const e=f.game.entities.find(e=>e.summoned)!;expect(e.definition).toBe(ids[rank-1]);expect(e.summoned!.rank).toBe(rank);expect(e.summoned!.expires-e.summoned!.started).toBe(3200);
});
