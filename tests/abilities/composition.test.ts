import {it,expect} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {isStunned} from '../../src/sim/game/effects';
function fixture(name:string,settings:Record<string,unknown>={}){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!;
 const look=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,look,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:250,...settings}));
 const cast=()=>f.game.abilities.cast(f.caster,'preview',spell.targeting.kind==='point'?{x:126,y:120}:spell.targeting.kind==='self'?f.caster:f.target);
 return {...f,cast};
}
function advance(f:ReturnType<typeof fixture>,ticks:number){for(let i=0;i<ticks;i++)f.game.tick(undefined,{passiveUnits:true});}
it('Healing Wave uses the chain delivery for allies, attenuates and terminates',()=>{
 const f=fixture('healing-wave',{relationship:'ally',targetCount:4,targetSpacing:2});f.cast();advance(f,60);
 const heals=f.game.abilities.drainEvents().filter(e=>e.event==='healed');
 expect(heals.map(e=>e.amount)).toEqual([100,85,72,61]);expect(new Set(heals.map(e=>e.target)).size).toBe(4);
 expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it('War Stomp queries enemies around the caster without applying the stun to self',()=>{
 const f=fixture('war-stomp',{distance:3,targetCount:3,targetSpacing:2});f.cast();advance(f,12);
 expect(isStunned(f.game.context.get(f.caster)!,f.game.registry)).toBe(false);
 expect(isStunned(f.game.context.get(f.target)!,f.game.registry)).toBe(true);
 expect(f.game.context.get(f.target)!.hp).toBe(200);
});
it('Frost Nova distinguishes the primary hit from surrounding splash',()=>{
 const f=fixture('frost-nova',{targetCount:3,targetSpacing:2});f.cast();advance(f,12);
 const damage=f.game.abilities.drainEvents().filter(e=>e.event==='damaged');
 expect(damage.filter(e=>e.target===f.target).map(e=>e.amount)).toEqual([100]);
 expect(damage.filter(e=>e.target!==f.target).map(e=>e.amount)).toEqual([50,50]);
 expect(f.game.entities.filter(e=>e.id!==f.caster).every(e=>e.spellStatuses?.length===1)).toBe(true);
});
it.each([0,1,5])('Inferno spawns exactly once with %i ground-area victims',count=>{
 const f=fixture('inferno',{targetCount:count});expect(f.cast()).toBeNull();advance(f,12);
 expect(f.game.entities.filter(e=>e.summoned)).toHaveLength(1);
 expect(f.game.abilities.drainEvents().filter(e=>e.event==='summoned').map(e=>e.amount)).toEqual([1]);
});
it.each(['healing-wave','war-stomp','frost-nova','inferno'])('%s is deterministic across save/load',name=>{
 const a=fixture(name,{relationship:name==='healing-wave'?'ally':'enemy',distance:3,targetCount:3});
 const b=fixture(name,{relationship:name==='healing-wave'?'ally':'enemy',distance:3,targetCount:3});
 a.cast();advance(a,12);b.game.restore(a.game.snapshot());
 for(let i=0;i<80;i++){advance(a,1);advance(b,1);expect(a.game.checksum()).toBe(b.game.checksum());}
});
it('bounds recipient queries and forbids multiplying point operations through a unit query',()=>{
 const base=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.inferno')!);
 const bad:any=base;bad.onRelease[0].query={center:'point',radius:5,relations:['enemy']};
 expect(abilitySchema.safeParse(bad).success).toBe(false);
 delete bad.onRelease[0].query;bad.onRelease[1].query.radius=33;
 expect(abilitySchema.safeParse(bad).success).toBe(false);
});
it('Healing Wave skips full-health bounce candidates',()=>{
 const f=fixture('healing-wave',{relationship:'ally',targetCount:4,targetSpacing:2});
 const full=f.game.entities.find(e=>e.id!==f.caster&&e.id!==f.target)!;full.hp=f.game.context.stats(full).maxHp;
 f.cast();advance(f,60);
 const heals=f.game.abilities.drainEvents().filter(e=>e.event==='healed');
 expect(heals.some(e=>e.target===full.id)).toBe(false);
 expect(heals).toHaveLength(3);
});
