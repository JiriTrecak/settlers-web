import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {acceptsSpell,matchesSpellFilter,spellImmunity} from '../../src/sim/abilities/eligibility';
import {abilityAimScore} from '../../src/sim/abilities/ai';
const spell=(id:string)=>coreAbilities.abilities.find(a=>a.id==='ability.core.'+id)!;
function fixture(id='holy-light-lite',extra:Record<string,unknown>={},patch={}){
 const a=abilitySchema.parse({...spell(id),...patch});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',targetHealth:500,distance:6,...extra}));
 return {...f,a,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function ticks(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function apply(f:ReturnType<typeof fixture>,id:string,target=f.target){const a=spell(id);for(const op of releaseEffects(a,1,'ally'))new SpellStatuses(f.game).apply(target,target,a,1,f.game.state.nextCast++,op);}
it('rejects hostile direct casts before spending mana and cancels a newly protected windup with refund',()=>{
 const f=fixture(),mana=f.c.abilities!.mana;apply(f,'spell-ward');
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toMatch(/immune/i);expect(f.c.abilities!.mana).toBe(mana);expect(f.c.abilities!.pending).toBeNull();
 delete f.t.spellStatuses;expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();apply(f,'spell-ward');ticks(f,30);
 expect(f.t.hp).toBe(500);expect(f.c.abilities!.mana).toBe(mana);expect(f.game.abilities.observedEvents().some(e=>e.event==='cancelled')).toBe(true);
});
it.each(['hex','mana-burn'])('blocks %s while allowing friendly healing',id=>{
 const f=fixture(id);apply(f,'spell-ward');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toMatch(/immune/i);
 const ally=fixture('holy-light-lite',{relationship:'ally',targetHealth:100});apply(ally,'spell-ward');expect(ally.game.abilities.cast(ally.caster,'preview',ally.target)).toBeNull();ticks(ally,30);expect(ally.t.hp).toBeGreaterThan(100);
});
it('area waves skip protected units but hit ordinary recipients',()=>{
 const f=fixture('blizzard',{targetCount:3,targetSpacing:2});apply(f,'spell-ward');
 expect(f.game.abilities.cast(f.caster,'preview',{x:f.t.x,y:f.t.y})).toBeNull();ticks(f,130);
 expect(f.t.hp).toBe(500);expect(f.game.entities.some(e=>e.id!==f.caster&&e.id!==f.target&&e.hp!<500)).toBe(true);
});
it('rechecks projectile protection after launch',()=>{
 const f=fixture('storm-bolt',{distance:12});expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();
 while(!f.game.state.spellDeliveries.length&&f.game.state.tick<60)ticks(f,1);
 expect(f.game.state.spellDeliveries).toHaveLength(1);apply(f,'spell-ward');ticks(f,100);
 expect(f.t.hp).toBe(500);expect(f.t.spellStatuses?.some(s=>s.ability===f.a.id)).toBe(false);
});
it('piercing is explicit and bypasses the ward for damage and dispel',()=>{
 const f=fixture('holy-light-lite',{}, {piercesSpellImmunity:true});apply(f,'spell-ward');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,30);expect(f.t.hp).toBeLessThan(500);
 const dispel=fixture('dispel-magic',{}, {piercesSpellImmunity:true});apply(dispel,'spell-ward');expect(dispel.game.abilities.cast(dispel.caster,'preview',{x:dispel.t.x,y:dispel.t.y})).toBeNull();ticks(dispel,30);expect(spellImmunity(dispel.t,dispel.game.registry)).toBeUndefined();
});
it('suppresses existing periodic damage, resumes after protection, and replays identically',()=>{
 const f=fixture('entangling-roots');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,30);apply(f,'spell-ward');const hp=f.t.hp;
 const restored=fixture('entangling-roots');restored.game.restore(f.game.snapshot());
 for(let i=0;i<70;i++){ticks(f,1);ticks(restored,1);expect(restored.game.checksum()).toBe(f.game.checksum());}expect(f.t.hp).toBe(hp);
 f.t.spellStatuses=f.t.spellStatuses!.filter(s=>s.ability!=='ability.core.spell-ward');ticks(f,40);expect(f.t.hp).toBeLessThan(hp!);
});
it('validates hero/summon/level targets and exposes summon eligibility in observations',()=>{
 const f=fixture('dismiss-summon');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toMatch(/filters/i);
 f.t.summoned={source:f.caster,ability:'ability.core.feral-spirit',rank:1,cast:1,started:0,expires:500};
 expect(f.game.view('player.1').entities.find(e=>e.id===f.target)?.summoned).toBe(true);
 apply(f,'spell-ward');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,30);expect(f.t.hp).toBe(0);
 expect(matchesSpellFilter({hero:true,summoned:true,level:1},{heroes:false,summoned:true,maxLevel:6})).toBe(false);
 expect(matchesSpellFilter({summoned:true,level:7},{summoned:true,maxLevel:6})).toBe(false);
 expect(abilitySchema.safeParse({...f.a,targeting:{...f.a.targeting,filter:{minLevel:7,maxLevel:2}}}).success).toBe(false);
});
it('shares operation filters and immunity-aware scoring with the AI',()=>{
 const caster={id:1,x:0,y:0,hp:100,maxHp:100,unit:true,alive:true,targetable:true};
 const target={...caster,id:2,x:2,hero:true,spellImmunity:'hostile' as const};
 const a=abilitySchema.parse({...spell('holy-light-lite'),onRelease:[{op:'damage',target:'target',amount:100,damageType:'spell',filter:{heroes:true}}]});
 const relation=(t:{id:number})=>t.id===1?'ally' as const:'enemy' as const;
 expect(abilityAimScore(a,1,caster,target,[caster,target],relation,'enemy')).toBe(0);
 expect(abilityAimScore({...a,piercesSpellImmunity:true},1,caster,target,[caster,target],relation,'enemy')).toBe(200);
 expect(acceptsSpell({spellImmunity:'all'},a,'ally')).toBe(false);
});

it('ordinary area dispel leaves the hostile ward intact',()=>{const f=fixture('dispel-magic');apply(f,'spell-ward');expect(f.game.abilities.cast(f.caster,'preview',{x:f.t.x,y:f.t.y})).toBeNull();ticks(f,30);expect(spellImmunity(f.t,f.game.registry)).toBe('hostile');});
it('protected neighbors do not consume a chain hop or a queried recipient cap',()=>{
 const f=fixture('chain-lightning',{targetCount:3,targetSpacing:2});const protectedUnit=f.game.entities.find(e=>e.id!==f.caster&&e.id!==f.target)!;apply(f,'spell-ward',protectedUnit.id);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,100);
 expect(protectedUnit.hp).toBe(500);expect(f.game.entities.filter(e=>e.id!==f.caster&&e.id!==protectedUnit.id).every(e=>e.hp!<500)).toBe(true);
 const q=fixture('holy-light-lite',{targetCount:3,targetSpacing:2},{onRelease:[{op:'damage',target:'target',amount:50,damageType:'spell',query:{center:'target',radius:6,relations:['enemy'],maxTargets:1}}]});
 const primary=q.game.entities.find(e=>e.id===q.target)!;
 // Protect after cast acceptance so the direct aim is valid at acceptance; use an unprotected aim instead.
 apply(q,'spell-ward',primary.id);const other=q.game.entities.find(e=>e.id!==q.target&&e.id!==q.caster)!;
 expect(q.game.abilities.cast(q.caster,'preview',other.id)).toBeNull();ticks(q,30);expect(primary.hp).toBe(500);expect(other.hp).toBeLessThan(500);
});
it('target immunity interrupts a maintained drain and stops further transfers',()=>{
 const f=fixture('life-drain');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,40);apply(f,'spell-ward');const hp=f.t.hp;ticks(f,80);
 expect(f.t.hp).toBe(hp);expect(f.c.abilities!.pending).toBeNull();expect(f.game.state.spellInstances).toHaveLength(0);
});
it('operation-only filters prevent effects without forbidding the broader aim',()=>{
 const f=fixture('holy-light-lite',{}, {onRelease:[{op:'damage',target:'target',amount:100,damageType:'spell',filter:{heroes:true}}]});
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();ticks(f,30);expect(f.t.hp).toBe(500);
});
