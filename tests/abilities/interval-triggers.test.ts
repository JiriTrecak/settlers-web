import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.death-burst')!;
const status={op:'status',id:'clock',target:'caster',amount:200,polarity:'positive',dispel:true,modifiers:{}};
const trigger={id:'pulse',event:'interval',intervalTicks:8,operations:[{op:'heal',target:'caster',amount:25}],manaCost:0};
function fixture(t={},grant=false){
 const a=abilitySchema.parse({...base,ranks:[{}],triggers:[{...trigger,...(grant?{whileStatus:'clock'}:{}),...t}],...(grant?{activation:'targeted',onRelease:[status]}:{})}),p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:4,mana:100})),c=f.game.context.get(f.caster)!;c.hp=100;
 return {...f,a,c};
}
const step=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const grant=(f:ReturnType<typeof fixture>)=>{for(const e of releaseEffects(f.a,1,'ally'))new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,e);};
it('starts passive pulses after one full interval, never on registration, and never twice in a tick',()=>{
 const f=fixture();step(f);expect(f.c.hp).toBe(100);step(f,7);expect(f.c.hp).toBe(100);step(f);expect(f.c.hp).toBe(125);f.game.abilities.resolve();expect(f.c.hp).toBe(125);
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='interval')).toHaveLength(1);
});
it('starts status clocks on application, restarts on refresh and removes them on dispel',()=>{
 const f=fixture({},true);grant(f);step(f,5);grant(f);step(f,7);expect(f.c.hp).toBe(100);step(f);expect(f.c.hp).toBe(125);
 delete f.c.spellStatuses;step(f,20);expect(f.c.hp).toBe(125);expect(f.c.spellTriggerTimers).toBeUndefined();
});
it('uses ranked intervals and bounds invalid policies',()=>{
 for(const patch of [{event:'interval',intervalTicks:undefined},{intervalTicks:0},{intervalTicks:144001},{event:'death',intervalTicks:8}])expect(abilitySchema.safeParse({...base,triggers:[{...trigger,...patch}]}).success).toBe(false);
 const a=abilitySchema.parse({...base,ranks:[{period:4},{period:10}],triggers:[{...trigger,intervalTicks:{rankParameter:'period'}}]});expect(a.triggers![0].intervalTicks).toEqual({rankParameter:'period'});
});
it('counts cadence, mana and trigger cooldowns without changing ordinary spell cooldown',()=>{
 const f=fixture({every:2,manaCost:5,cooldownTicks:20});step(f,17);expect(f.c.hp).toBe(125);expect(f.c.abilities!.mana).toBe(95);step(f,16);expect(f.c.hp).toBe(125);
 step(f,16);expect(f.c.hp).toBe(150);expect(f.c.abilities!.mana).toBe(90);expect(f.c.abilities!.cooldowns).toEqual({});
});
it('skips unavailable actors without catch-up bursts and resets a removed passive',()=>{
 const f=fixture();step(f);f.c.unit!.contained=999;step(f,32);expect(f.c.hp).toBe(100);f.c.unit!.contained=null;step(f,7);expect(f.c.hp).toBe(100);step(f);expect(f.c.hp).toBe(125);
 f.c.abilities!.ranks.preview=0;step(f);expect(f.c.spellTriggerTimers).toBeUndefined();f.c.abilities!.ranks.preview=1;step(f,8);expect(f.c.hp).toBe(125);step(f);expect(f.c.hp).toBe(150);
});
it('replays randomized status pulses and rejects forged clocks atomically',()=>{
 const f=fixture({chancePermille:500},true),g=fixture({chancePermille:500},true);grant(f);step(f,3);g.game.restore(f.game.snapshot());
 for(let i=0;i<100;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());}
 const hash=f.game.checksum();for(const patch of [{nextTick:99999},{rank:10},{grant:99999},{started:99999}]){const save=f.game.snapshot();Object.assign(Object.values(save.state.entities.find(e=>e.id===f.caster)!.spellTriggerTimers!)[0],patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);}
});
it('uses normal operations for periodic bounded summons owned by the timer holder',()=>{
 const f=fixture({operations:[{op:'summon',target:'point',definition:'unit.spell.feral-spirit',amount:1,replace:false,maxActive:2,radius:2,durationTicks:200,endsWithCaster:true}]});step(f,40);
 const children=f.game.entities.filter(e=>e.summoned);expect(children).toHaveLength(2);expect(children.every(e=>e.owner===f.c.owner&&e.summoned!.source===f.c.id)).toBe(true);
 f.game.context.remove(f.c);step(f);expect(f.game.entities.some(e=>e.summoned&&e.hp!>0)).toBe(false);
});
it('does not silently accept a timer on a continuously reapplied aura grant',()=>{
 expect(abilitySchema.safeParse({...base,aura:{radius:5,meleeOnly:false},onRelease:[status],triggers:[{...trigger,whileStatus:'clock'}]}).success).toBe(false);
});
it('silence stops opted-in pulses without delaying the next cadence',()=>{
 const f=fixture({blockedBySilence:true}),silence=coreAbilities.abilities.find(a=>a.id==='ability.core.silence')!;step(f);
 new SpellStatuses(f.game).apply(f.target,f.caster,silence,1,f.game.state.nextCast++,silence.onRelease[0] as never);step(f,8);expect(f.c.hp).toBe(100);delete f.c.spellStatuses;step(f,8);expect(f.c.hp).toBe(125);
});
it('bounds concurrent pulses, serializes the queue and cancels stale grants before execution',()=>{
 const f=fixture({},true),g=fixture({},true);grant(f);
 for(let i=0;i<259;i++){const c=f.game.context.create({id:'',definition:f.c.definition,owner:f.c.owner,position:{x:100+i%20,y:100+Math.floor(i/20)},rotation:0});c.hp=100;
 for(const e of releaseEffects(f.a,1,'ally'))new SpellStatuses(f.game).apply(c.id,c.id,f.a,1,f.game.state.nextCast++,e);}
 step(f,8);expect(f.game.state.spellLifecycleReactions).toHaveLength(132);g.game.restore(f.game.snapshot());
 const queued=f.game.state.spellLifecycleReactions.at(-1)!;const target=f.game.context.get(queued.source)!;delete target.spellStatuses;
 delete g.game.context.get(queued.source)!.spellStatuses;step(f);step(g);step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());expect(target.hp).toBe(100);
 const save=g.game.snapshot();expect(save.state.spellLifecycleReactions).toHaveLength(0);
});
it('rejects invalid pending pulse epochs and prevents an old pulse from reviving after relearning',()=>{
 const f=fixture();step(f);step(f,8);const timers=f.c.spellTriggerTimers!,timer=timers[f.a.id+':pulse'];
 // Preserve a real queued pulse by filling the processing budget with another live holder.
 for(let i=0;i<130;i++){const c=f.game.context.create({id:'',definition:f.c.definition,owner:f.c.owner,position:{x:100+i%20,y:100+Math.floor(i/20)},rotation:0});c.abilities!.ranks.preview=1;c.hp=100;}
 step(f,9);expect(f.game.state.spellLifecycleReactions.length).toBeGreaterThan(0);
 const record=f.game.state.spellLifecycleReactions.at(-1)!,holder=f.game.context.get(record.source)!;
 const hash=f.game.checksum();for(const patch of [{timerStarted:undefined},{timerStarted:f.game.state.tick},{timerGrant:1234}]){const s=f.game.snapshot();Object.assign(s.state.spellLifecycleReactions.at(-1)!,patch);expect(()=>f.game.restore(s)).toThrow();expect(f.game.checksum()).toBe(hash);}
 delete holder.spellTriggerTimers;f.game.abilities.resolve();expect(holder.hp).toBe(100);expect(timer.nextTick).toBeGreaterThan(f.game.state.tick-8);
});

it('refreshes from later waves of the same cast restart a status timer',()=>{
 const f=fixture({},true),cast=f.game.state.nextCast++;const apply=()=>{for(const e of releaseEffects(f.a,1,'ally'))new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,cast,e);};
 apply();step(f,5);apply();step(f,7);expect(f.c.hp).toBe(100);step(f);expect(f.c.hp).toBe(125);f.game.restore(f.game.snapshot());
});
