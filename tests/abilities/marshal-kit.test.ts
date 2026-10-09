import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {isStunned} from '../../src/sim/game/effects';
import {previewModelDefinition} from '../../tooling/spell-editor/shared/view';
import {content} from '../../src/content/builtin';
const step=(g:ReturnType<typeof fixture>['game'],n:number)=>{for(let i=0;i<n;i++)g.tick();};
function fixture(name:string,rank=1,settings:Record<string,unknown>={}){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.marshal.'+name)!;
 const presentation=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({casterDefinition:'unit.ants.marshal',targetHealth:500,mana:1000,relationship:'enemy',...settings}));
 const c=f.game.context.get(f.caster)!;c.abilities!.ranks.preview=rank;

 return {...f,spell,c,t:f.game.context.get(f.target)!,cast:()=>f.game.command('player.1',{type:'castAbility',actor:c.id,binding:'preview',target:spell.targeting.kind==='self'?{kind:'unit',entity:c.id}:{kind:'point',position:{x:126,y:120}}})};
}
it.each([1,2,3])('Faultline rank %i travels, hits each ground enemy once and applies the correct stun',rank=>{
 const f=fixture('faultline',rank,{targetCount:3,targetSpacing:2});expect(f.cast().accepted).toBe(true);
 step(f.game,14);expect(f.t.hp).toBe(500);expect(f.game.state.spellDeliveries.length).toBe(1);
 step(f.game,16);expect(f.t.hp).toBe(500-[70,110,150][rank-1]);
 const s=f.t.spellStatuses![0];expect(s.expires-s.started).toBe([16,20,24][rank-1]);expect(isStunned(f.t,f.game.registry)).toBe(true);
 step(f.game,70);const hits=f.game.abilities.observedEvents().filter(e=>e.event==='damaged');expect(new Set(hits.map(e=>e.target)).size).toBe(hits.length);expect(f.t.spellStatuses).toBeUndefined();
 const air=fixture('faultline',rank,{targetLocomotion:'air'});air.cast();step(air.game,85);expect(air.t.hp).toBe(500);
});
it.each([1,2,3])('Rally rank %i continuously grants speed, follows range and ends with its source',rank=>{
 const f=fixture('rally',rank,{relationship:'ally',targetCount:3});
 const base=f.game.context.stats(f.t);step(f.game,1);
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000+[80,120,160][rank-1]);
 expect(f.game.context.stats(f.t).cooldownTicks).toBe(Math.round(base.cooldownTicks/(1+[.1,.15,.2][rank-1])));
 expect(f.game.context.stats(f.c).moveSpeedPermille).toBe(1000+[80,120,160][rank-1]);
 expect(f.c.spellStatuses?.some(s=>s.status==='standard')).toBe(true);
 expect(f.t.spellStatuses?.some(s=>s.status==='standard')).toBe(false);
 const mana=f.c.abilities!.mana;step(f.game,350);expect(f.c.abilities!.mana).toBe(mana);
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000+[80,120,160][rank-1]);
 expect(f.game.command('player.1',{type:'move',actors:[f.target],destination:{x:145,y:120}}).accepted).toBe(true);step(f.game,180);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000);expect(f.t.spellStatuses).toBeUndefined();
 expect(f.game.command('player.1',{type:'move',actors:[f.target],destination:{x:126,y:120}}).accepted).toBe(true);step(f.game,180);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000+[80,120,160][rank-1]);
 f.c.hp=0;step(f.game,2);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000);expect(f.t.spellStatuses).toBeUndefined();
});
it('Rally only applies its strongest learned copy and excludes enemies',()=>{
 const f=fixture('rally',1,{relationship:'ally'});
 const second=f.game.context.create({id:'second-standard',definition:'unit.preview.caster',owner:'player.1',position:{x:122,y:122},rotation:0});
 second.abilities!.ranks.preview=3;second.unit!.order={type:'hold'};
 const enemy=f.game.context.create({id:'enemy',definition:'unit.ants.warrior',owner:'player.2',position:{x:128,y:120},rotation:0});enemy.unit!.order={type:'hold'};
 step(f.game,2);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1160);
 expect(f.t.spellStatuses?.filter(s=>s.status==='cadence')).toHaveLength(1);
 expect(enemy.spellStatuses).toBeUndefined();
 second.hp=0;step(f.game,2);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1080);
 f.c.abilities!.ranks.preview=0;step(f.game,1);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000);
});
it.each([1,2,3])('Carapace rank %i reduces damage, exposes reflection and expires without trapping movement',rank=>{
 const f=fixture('carapace',rank);f.cast();step(f.game,13);
 const before=f.c.hp!;f.game.combat.abilityHit({source:f.target,target:f.caster,damage:100,damageType:'spell'});
 expect(before-f.c.hp!).toBe([56,49,42][rank-1]);expect(f.game.context.stats(f.c).meleeReflectionPermille).toBe([150,250,350][rank-1]);
 expect(f.game.command('player.1',{type:'move',actors:[f.caster],destination:{x:116,y:120}}).accepted).toBe(true);
 step(f.game,241);expect(f.c.spellStatuses).toBeUndefined();expect(f.c.x).toBeLessThan(120);
});
it.each([1,2])('Crownfall rank %i damages enemies, protects allies, and halves hero stun',rank=>{
 const f=fixture('crownfall',rank,{targetCount:3,targetHero:true});
 const ally=f.game.context.create({id:'ally',definition:'unit.ants.warrior',owner:'player.1',position:{x:126,y:124},rotation:0});ally.unit!.order={type:'hold'};
 f.cast();step(f.game,31);expect(f.t.hp).toBe(500);step(f.game,2);
 expect(f.t.hp).toBe(500-[180,260][rank-1]);const s=f.t.spellStatuses![0];expect(s.expires-s.started).toBe([20,28][rank-1]);
 expect(ally.hp).toBe(300);expect(ally.spellStatuses![0].shield).toBe([100,160][rank-1]);
 expect(f.t.spellStatuses!.some(s=>s.status==='crownWard')).toBe(false);
 step(f.game,240);expect(ally.spellStatuses).toBeUndefined();expect(f.t.spellStatuses).toBeUndefined();
});
it.each(['faultline','rally','carapace','crownfall'])('%s survives an in-flight save and deterministic cold continuation',name=>{
 const a=fixture(name),b=fixture(name);if(a.spell.activation!=='passive')expect(a.cast().accepted).toBe(true);step(a.game,18);b.game.restore(JSON.parse(JSON.stringify(a.game.snapshot())));
 for(let tick=0;tick<360;tick++){a.game.tick();b.game.tick();expect(a.game.checksum('full')).toBe(b.game.checksum('full'));}
 expect(a.game.snapshot()).toEqual(b.game.snapshot());
});
it('all preview clones resolve the original model and its authored scale',()=>{
 const settings=encounterSettingsSchema.parse({casterDefinition:'unit.ants.marshal'});
 for(const [definition,modelDefinition]of [['unit.preview.caster','unit.ants.marshal'],['unit.preview.target-4','unit.ants.warrior'],['unit.preview.target-2','unit.neutral.twigcaster']]){
  const entity={id:1,owner:'player.1',x:120,y:120,rotation:0,hp:500,maxHp:500,definition,modelDefinition};
  expect(content.get(previewModelDefinition(entity,settings))).toBe(content.get(modelDefinition));
 }
});
