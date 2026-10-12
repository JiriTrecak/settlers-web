import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {isStunned} from '../../src/sim/game/effects';
function fixture(name:string,rank=1,settings:Record<string,unknown>={}){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.rootbreaker.'+name)!;
 const presentation=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({casterDefinition:'unit.ants.rootbreaker',targetHealth:500,mana:1000,relationship:'enemy',distance:6,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;c.abilities!.ranks.preview=rank;
 return {...f,spell,c,t,step:(n:number)=>{for(let i=0;i<n;i++)f.game.tick();},cast:()=>f.game.command('player.1',{type:'castAbility',actor:c.id,binding:'preview',target:spell.targeting.kind==='self'?{kind:'unit',entity:c.id}:spell.targeting.kind==='unit'?{kind:'unit',entity:t.id}:{kind:'point',position:{x:t.x,y:t.y}}})};
}
it.each([1,2,3])('Skullcrack %i connects once after windup, with half stun against heroes',rank=>{
 const f=fixture('skullcrack',rank,{targetHero:true});expect(f.cast().accepted).toBe(true);
 f.step(27);expect(f.t.hp).toBe(500);f.step(2);
 // The fixture has two armor: physical strikes must use armor mitigation.
 expect(f.t.hp).toBe(500-[107,170,232][rank-1]);
 const stun=f.t.spellStatuses!.find(s=>s.status==='stunned')!;expect(stun.expires-stun.started).toBe([24,32,40][rank-1]);
 expect(isStunned(f.t,f.game.registry)).toBe(true);f.step(50);expect(f.t.spellStatuses).toBeUndefined();
 const air=fixture('skullcrack',rank,{targetLocomotion:'air'});expect(air.cast().accepted).toBe(false);
});
it.each([1,2,3])('Crushing Presence %i weakens enemies, retains its marker and ends immediately when unlearned',rank=>{
 const f=fixture('presence',rank),armor=f.game.context.stats(f.t).armor;f.step(1);
 expect(f.game.context.stats(f.t).armor).toBe(armor-[2,3,4][rank-1]);
 expect(f.c.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 f.t.x+=40;f.step(1);expect(f.t.spellStatuses).toBeUndefined();expect(f.c.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 f.c.abilities!.ranks.preview=0;f.step(1);expect(f.c.spellStatuses).toBeUndefined();
});
it.each([1,2,3])('Challenge Roar %i applies taunt and armor independently, then restores orders',rank=>{
 const f=fixture('roar',rank,{combat:true,targetHero:true});f.c.unit!.order={type:'hold'};f.t.unit!.order={type:'hold'};
 const armor=f.game.context.stats(f.c).armor;expect(f.cast().accepted).toBe(true);f.step(17);
 expect(f.t.unit!.taunt?.source).toBe(f.caster);expect(f.t.unit!.order).toEqual({type:'hold'});
 const taunt=f.t.spellStatuses!.find(s=>s.status==='challenged')!;expect(taunt.expires-taunt.started).toBe([40,50,60][rank-1]);
 expect(f.game.context.stats(f.c).armor).toBe(armor+[4,6,8][rank-1]);
 f.step(61);expect(f.t.unit!.taunt).toBeUndefined();expect(f.t.unit!.order).toEqual({type:'hold'});expect(f.game.context.stats(f.c).armor).toBe(armor+[4,6,8][rank-1]);
 f.step(140);expect(f.game.context.stats(f.c).armor).toBe(armor);
});
it.each([1,2])('Uproot %i hits ground enemies in its area, stuns and slows, without repeated impact damage',rank=>{
 const f=fixture('uproot',rank,{targetCount:3,targetSpacing:2,targetHero:true});expect(f.cast().accepted).toBe(true);f.step(35);expect(f.t.hp).toBe(500);f.step(2);
 expect(f.t.hp).toBe(500-[196,295][rank-1]);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(650);
 const stun=f.t.spellStatuses!.find(s=>s.status==='uprooted')!;expect(stun.expires-stun.started).toBe([16,24][rank-1]);
 f.step(130);expect(f.t.hp).toBe(500-[196,295][rank-1]);expect(f.t.spellStatuses).toBeUndefined();
 const air=fixture('uproot',rank,{targetLocomotion:'air'});air.cast();air.step(40);expect(air.t.hp).toBe(500);
});
it.each(['presence','skullcrack','roar','uproot'])('%s survives save/restore during its active phase',name=>{
 const a=fixture(name),b=fixture(name);if(a.spell.activation!=='passive')expect(a.cast().accepted).toBe(true);a.step(18);b.game.restore(JSON.parse(JSON.stringify(a.game.snapshot())));
 for(let tick=0;tick<220;tick++){a.game.tick();b.game.tick();expect(b.game.checksum('full')).toBe(a.game.checksum('full'));}
});
