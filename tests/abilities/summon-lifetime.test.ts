import {expect,it,vi} from 'vitest';
import {abilitySchema,resolveEffect} from '../../src/content/abilities/schema';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {SpellSummons} from '../../src/sim/abilities/summons';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {UNTIL_DEATH} from '../../src/sim/abilities/state';
import {UnitOwnership} from '../../src/sim/game/ownership';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.feral-spirit')!;
const look=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
const summon={op:'summon',target:'caster',amount:2,definition:'unit.spell.feral-spirit',radius:3,replace:true};
function fixture(patch={},settings={}){
 const a=abilitySchema.parse({...base,ranks:[{}],cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:[{...summon,...patch}]}),f=createAbilityEncounter(a,look,encounterSettingsSchema.parse({relationship:'enemy',targetCount:1,distance:15,targetHealth:500,...settings}));
 return {...f,a,c:f.game.context.get(f.caster)!};
}
const step=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
const pets=(f:ReturnType<typeof fixture>)=>f.game.entities.filter(e=>e.summoned);
function cast(f:ReturnType<typeof fixture>){expect(f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}}).accepted).toBe(true);step(f);}
it('untimed summons survive their source, save/load and passage of time, but leave no corpses',()=>{
 const f=fixture();cast(f);expect(pets(f)).toHaveLength(2);expect(pets(f).every(e=>e.summoned!.expires===UNTIL_DEATH)).toBe(true);
 const event=f.game.abilities.observedEvents().find(e=>e.event==='summoned')!;expect(event).toMatchObject({untilDeath:true,amount:2,spawned:pets(f).map(e=>e.id)});expect(event.durationTicks).toBeUndefined();
 f.c.hp=0;f.game.onCombatDeath(f.c);const g=fixture();g.game.restore(f.game.snapshot());
 for(let i=0;i<100;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());}expect(pets(f)).toHaveLength(2);
 const pet=pets(f)[0];pet.hp=0;f.game.onCombatDeath(pet);expect(f.game.state.corpses.some(c=>c.id===pet.id)).toBe(false);
});
it.each([undefined,8])('source-linked summons expire after source loss with duration %s',durationTicks=>{
 const f=fixture({endsWithCaster:true,durationTicks});cast(f);expect(pets(f).every(e=>e.summoned!.sourceLink?.owner==='player.1')).toBe(true);
 f.c.hp=0;f.game.onCombatDeath(f.c);const g=fixture({endsWithCaster:true,durationTicks});g.game.restore(f.game.snapshot());step(f);step(g);expect(pets(f)).toHaveLength(0);expect(g.game.checksum()).toBe(f.game.checksum());
});
it('finite linked summons expire while their source remains alive',()=>{
 const f=fixture({endsWithCaster:true,durationTicks:8});cast(f);step(f,7);expect(pets(f)).toHaveLength(2);step(f);expect(pets(f)).toHaveLength(0);expect(f.c.hp).toBe(500);
});
it('conversion of the source breaks the link; conversion of a child does not sever it',()=>{
 const f=fixture({endsWithCaster:true});cast(f);const child=pets(f)[0];expect(new UnitOwnership(f.game).transfer(child,'player.2','allow-over-cap')).toBe(true);step(f);expect(pets(f)).toHaveLength(2);
 expect(new UnitOwnership(f.game).transfer(f.c,'player.2','allow-over-cap')).toBe(true);step(f);expect(pets(f)).toHaveLength(0);
});
it('raw source removal and nested source expiry clear descendants in one tick regardless of array order',()=>{
 const f=fixture({endsWithCaster:true,durationTicks:8});cast(f);const parent=pets(f)[0],op=f.a.onRelease[0];if(op.op!=='summon')throw Error();
 const childEffect=resolveEffect({...op,durationTicks:80,amount:1},1,{});if(childEffect.op!=='summon')throw Error();
 new SpellSummons(f.game).groupsAt({id:parent.id,owner:parent.owner,rotation:0},f.a,1,f.game.state.nextCast++,childEffect,{x:parent.x+4,y:parent.y});expect(pets(f)).toHaveLength(3);
 f.game.state.entities.reverse();step(f,8);expect(pets(f)).toHaveLength(0);
 const g=fixture({endsWithCaster:true});cast(g);g.game.context.remove(g.c);step(g);expect(pets(g)).toHaveLength(0);
});
it('dead sources cannot create linked summons, while independent detached summons still work',()=>{
 for(const linked of [true,false]){const f=fixture({endsWithCaster:linked}),op=f.a.onRelease[0];if(op.op!=='summon')throw Error();f.c.hp=0;f.game.onCombatDeath(f.c);
 const count=new SpellSummons(f.game).at({id:f.caster,owner:'player.1',rotation:0},f.a,1,f.game.state.nextCast++,resolveEffect(op,1,{}) as ReturnType<typeof resolveEffect>&{op:'summon'},f.c);expect(count).toBe(linked?0:2);}
});
it('successful replacement removes only the old owned group; failed placement preserves it',()=>{
 const f=fixture();cast(f);const first=pets(f).map(e=>e.id),nearest=vi.spyOn(f.game.context.spatial,'nearest').mockReturnValue(null);cast(f);expect(pets(f).map(e=>e.id)).toEqual(first);nearest.mockRestore();
 cast(f);expect(pets(f)).toHaveLength(2);expect(pets(f).every(e=>!first.includes(e.id))).toBe(true);
});
it('ordinary hostile dispel damages a permanent summon through the same summon eligibility',()=>{
 const f=fixture();cast(f);const pet=pets(f)[0],enemy=f.game.context.get(f.target)!;const a=coreAbilities.abilities.find(a=>a.id==='ability.core.dismiss-summon')!,op=a.onRelease[0];if(op.op==='branch')throw Error();
 new SpellStatuses(f.game).apply(enemy.id,pet.id,a,1,f.game.state.nextCast++,resolveEffect(op,1,a.ranks[0]));expect(f.game.context.get(pet.id)).toBeUndefined();
});
it('saved lifetime and link policy must match a declared operation and cannot form a cycle',()=>{
 for(const linked of [false,true]){const f=fixture({endsWithCaster:linked});cast(f);const hash=f.game.checksum();
 for(const patch of [{expires:900},{sourceLink:linked?undefined:{owner:'player.1'}},...(linked?[{source:99999}]:[])]){const save=f.game.snapshot();Object.assign(save.state.entities.find(e=>e.summoned)!.summoned!,patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);}
 if(linked){const save=f.game.snapshot(),pet=save.state.entities.find(e=>e.summoned)!;pet.summoned!.source=pet.id;expect(()=>f.game.restore(save)).toThrow();}
 }
});
it('workbench lifetime tracks actual summon membership and rewinds source-loss cleanup',async()=>{
 const f=fixture({endsWithCaster:true}),service=new SpellEditorService('/tmp'),presentation={...look,effects:[],icon:undefined};
 await service.execute({op:'preview.load',document:{definition:f.a,presentation},settings:{relationship:'self'}});await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:10});
 let state=service.state() as PreviewState;expect(state.duration).toBeGreaterThanOrEqual(1200);expect(state.entities.filter(e=>e.eligibility?.summoned)).toHaveLength(2);
 await service.execute({op:'preview.kill',subject:'caster'});await service.execute({op:'preview.seek',tick:12});state=service.state() as PreviewState;expect(state.entities).toHaveLength(0);expect(state.timelineEvents.find(e=>e.event==='summoned')?.endedTick).toBe(11);const hash=state.checksum;
 await service.execute({op:'preview.seek',tick:1});await service.execute({op:'preview.seek',tick:12});expect((service.state() as PreviewState).checksum).toBe(hash);
});

it('caps retained summons across casts and restores capacity after death or conversion',()=>{
 const f=fixture({replace:false,maxActive:3});cast(f);cast(f);cast(f);expect(pets(f)).toHaveLength(3);
 const g=fixture({replace:false,maxActive:3});g.game.restore(f.game.snapshot());cast(f);cast(g);expect(g.game.checksum()).toBe(f.game.checksum());
 const pet=pets(f)[0];pet.hp=0;f.game.onCombatDeath(pet);cast(f);expect(pets(f)).toHaveLength(3);
 expect(new UnitOwnership(f.game).transfer(pets(f)[0],'player.2','allow-over-cap')).toBe(true);cast(f);expect(pets(f).filter(e=>e.owner==='player.1')).toHaveLength(3);expect(pets(f)).toHaveLength(4);
});
it('ranked caps resolve and replacement can fill its cap without deleting the old group on failure',()=>{
 expect(abilitySchema.safeParse({...base,onRelease:[{...summon,maxActive:0}]}).success).toBe(false);
 expect(abilitySchema.safeParse({...base,onRelease:[{...summon,maxActive:129}]}).success).toBe(false);
 const op=resolveEffect({...summon,op:'summon',target:'caster',maxActive:{rankParameter:'cap'}},1,{cap:3});expect(op).toHaveProperty('maxActive',3);
 const f=fixture({maxActive:1});cast(f);const old=pets(f)[0].id;
 const blocked=vi.spyOn(f.game.context.spatial,'nearest').mockReturnValue(null);cast(f);expect(pets(f)[0].id).toBe(old);blocked.mockRestore();
 cast(f);expect(pets(f)).toHaveLength(1);expect(pets(f)[0].id).not.toBe(old);
});
it('AI scores only available summon capacity using observed provenance',()=>{
 const f=fixture({replace:false,maxActive:2});cast(f);
 const actors=f.game.context.liveBodies().map(e=>({id:e.id,owner:e.owner,x:e.x,y:e.y,hp:e.hp!,maxHp:f.game.context.stats(e).maxHp,alive:true,targetable:true,unit:!!e.unit,...(e.summoned?{summonOrigin:{source:e.summoned.source,ability:e.summoned.ability}}:{})})),caster=actors.find(e=>e.id===f.caster)!,relation=(e:typeof caster)=>e.owner===caster.owner?'ally' as const:'enemy' as const;
 expect(abilityAimScore(f.a,1,caster,caster,actors,relation,'enemy')).toBe(0);
 expect(abilityAimScore(f.a,1,caster,caster,actors.filter(e=>e.id!==pets(f)[0].id),relation,'enemy')).toBeGreaterThan(0);
 const own=f.game.view('player.1').entities.find(e=>e.id===pets(f)[0].id);expect(own?.summonOrigin).toEqual({source:f.caster,ability:f.a.id});
});

it.each([1,2,3])('published Carrion Spirits rank %i consumes corpses, caps at five and survives source death',rank=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.carrion-spirits')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({fallenTargets:true,targetCount:6,targetSpacing:1,distance:8})),c=f.game.context.get(f.caster)!;
 c.abilities!.ranks.preview=rank;
 for(let i=0;i<6;i++){c.abilities!.mana=1000;c.abilities!.cooldowns={};expect(f.game.command('player.1',{type:'castAbility',actor:c.id,binding:'preview',target:{kind:'point',position:{x:128,y:120}}}).accepted).toBe(true);for(let t=0;t<25;t++)f.game.tick(undefined,{passiveUnits:true});}
 const pets=f.game.entities.filter(e=>e.summoned);expect(pets).toHaveLength(5);expect(f.game.state.corpses).toHaveLength(1);expect(pets.every(e=>e.summoned!.expires===UNTIL_DEATH)).toBe(true);
 expect(pets.every(e=>e.definition===['unit.spell.shadow-spirit-lesser','unit.spell.shadow-spirit-standard','unit.spell.shadow-spirit-greater'][rank-1])).toBe(true);
 c.hp=0;f.game.onCombatDeath(c);f.game.tick(undefined,{passiveUnits:true});expect(f.game.entities.filter(e=>e.summoned)).toHaveLength(5);f.game.restore(f.game.snapshot());
});
it('published companion rewinds its entire source-dependent lifetime and repeated casts',async()=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.spirit-companion')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!,service=new SpellEditorService(process.cwd());
 await service.execute({op:'preview.load',document:{definition:a,presentation:p},settings:{relationship:'self'}});
 for(let i=0;i<3;i++){
  await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:40});expect((service.state() as PreviewState).entities.filter(e=>e.eligibility?.summoned)).toHaveLength(1);
  await service.execute({op:'preview.kill',subject:'caster'});await service.execute({op:'preview.seek',tick:42});expect((service.state() as PreviewState).entities).toHaveLength(0);const hash=(service.state() as PreviewState).checksum;
  await service.execute({op:'preview.seek',tick:0});await service.execute({op:'preview.seek',tick:42});expect((service.state() as PreviewState).checksum).toBe(hash);
 }
});

it('source-linked neutral summons inherit camp allegiance and end when the source changes camp',()=>{
 const f=fixture({endsWithCaster:true},{relationship:'neutral',combat:true}),source=f.game.context.get(f.target)!,op=f.a.onRelease[0];if(op.op!=='summon')throw Error();
 const created=new SpellSummons(f.game).groupsAt({id:source.id,owner:'none',rotation:0,camp:source.unit!.camp!},f.a,1,f.game.state.nextCast++,resolveEffect(op,1,{}) as ReturnType<typeof resolveEffect>&{op:'summon'},source);
 expect(created).toHaveLength(1);expect(pets(f).every(e=>e.unit?.camp==='preview-camp'&&e.summoned?.sourceLink?.camp==='preview-camp')).toBe(true);f.game.restore(f.game.snapshot());
 const restored=f.game.context.get(source.id)!;restored.unit!.camp=null;step(f);expect(pets(f)).toHaveLength(0);
});
it('changing ranks does not open a separate summon-cap pool',()=>{
 const a=abilitySchema.parse({...base,ranks:[{cap:2},{cap:3}],cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0},cooldown:{...base.cast.cooldown,ticks:0}},onRelease:[{...summon,replace:false,maxActive:{rankParameter:'cap'}}]}),raw=createAbilityEncounter(a,look,encounterSettingsSchema.parse({relationship:'self'})),f={...raw,a,c:raw.game.context.get(raw.caster)!};
 cast(f);expect(pets(f)).toHaveLength(2);f.c.abilities!.ranks.preview=2;cast(f);expect(pets(f)).toHaveLength(3);expect(pets(f).map(e=>e.summoned!.rank)).toEqual([1,1,2]);
 f.c.abilities!.ranks.preview=1;cast(f);expect(pets(f)).toHaveLength(3);f.game.restore(f.game.snapshot());
});
