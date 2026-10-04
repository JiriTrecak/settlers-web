import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilityAimScore,strategicAbilityAims} from '../../src/sim/abilities/ai';
const actor=(id:number,x:number,hp=200)=>({id,x,y:0,hp,maxHp:500,alive:true,targetable:true,unit:true});
const caster=actor(1,0),enemy=actor(2,3),ally=actor(3,2);
const spell=(name:string)=>coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!;
const relation=(a:{id:number})=>a.id===2?'enemy' as const:'ally' as const;
it('scores a self area spell from nearby enemies and does not cast into an empty area',()=>{
 const a=spell('war-stomp');
 expect(abilityAimScore(a,1,caster,caster,[caster,ally],relation,'enemy')).toBe(0);
 expect(abilityAimScore(a,1,caster,caster,[caster,enemy,ally],relation,'enemy')).toBeGreaterThan(0);
 expect(abilityAimScore(a,1,caster,caster,[caster,{...enemy,x:100}],relation,'enemy')).toBe(0);
});
it('scores Tranquility from wounds on queried allies, not the full-health caster',()=>{
 const a=spell('tranquility'),full={...caster,hp:500};
 expect(abilityAimScore(a,1,full,full,[full,{...ally,hp:500}],relation,'wounded-ally')).toBe(0);
 expect(abilityAimScore(a,1,full,full,[full,ally],relation,'wounded-ally')).toBeGreaterThan(0);
});
it('scores mixed branch operations per recipient and penalizes friendly damage',()=>{
 const a=spell('frost-nova');
 expect(abilityAimScore(a,1,caster,enemy,[caster,enemy,ally],relation,'enemy')).toBeGreaterThan(0);
 const fire=spell('flame-strike');
 expect(abilityAimScore(fire,1,caster,{id:0,x:3,y:0},[caster,enemy,ally],relation,'enemy')).toBeGreaterThan(0);
 expect(abilityAimScore(fire,1,caster,{id:0,x:100,y:0},[caster,enemy,ally],relation,'enemy')).toBe(0);
});
it('never assumes invisible enemies supplied by neither the observer nor its candidates',()=>{
 expect(abilityAimScore(spell('immolation'),1,caster,caster,[caster],relation,'enemy')).toBe(0);
});
it('does not spend mana-burning spells on targets with no mana capacity',()=>{
 const a=spell('mana-burn');
 expect(abilityAimScore(a,1,caster,enemy,[caster,{...enemy,maxMana:0}],relation,'enemy')).toBe(0);
 expect(abilityAimScore(a,1,caster,enemy,[caster,{...enemy,maxMana:200}],relation,'enemy')).toBeGreaterThan(0);
});
const knowledge={valid:(p:{x:number;y:number})=>Math.abs(p.x)<=256&&Math.abs(p.y)<=256,visible:()=>true,explored:()=>false};
it('escape AI requires injury and an observed threat, then chooses a safer visible point',()=>{
 const a=spell('blink');
 expect(strategicAbilityAims('escape',a,1,{...caster,hp:500},[enemy],relation,knowledge)).toEqual([]);
 expect(strategicAbilityAims('escape',a,1,caster,[],relation,knowledge)).toEqual([]);
 expect(strategicAbilityAims('escape',a,1,caster,[enemy],relation,{...knowledge,visible:()=>false})).toEqual([]);
 const candidates=strategicAbilityAims('escape',a,1,caster,[enemy],relation,knowledge) as {x:number;y:number}[];
 expect(candidates.length).toBeGreaterThan(0);expect(candidates.length).toBeLessThanOrEqual(32);
 expect(candidates[0].x).toBeLessThan(caster.x);
 expect(strategicAbilityAims('escape',a,1,caster,[enemy],relation,knowledge)).toEqual(candidates);
});
it('scout AI prioritizes unexplored points without needing or guessing hidden enemies',()=>{
 const a=spell('far-sight'),k={...knowledge,visible:()=>false,explored:(p:{x:number;y:number})=>p.x>=0};
 const aims=strategicAbilityAims('scout',a,1,caster,[],relation,k) as {x:number;y:number}[];
 expect(aims.length).toBeGreaterThan(0);expect(aims[0].x).toBeLessThan(0);
 expect(strategicAbilityAims('scout',a,1,caster,[],relation,knowledge)).toEqual([]);
});
it('reinforcement AI targets threatened distant allies rather than arbitrary friendly units',()=>{
 const a=spell('mass-teleport'),remote={...ally,x:50},threat={...enemy,x:54};
 expect(strategicAbilityAims('reinforce',a,1,caster,[caster,ally,remote],relation,knowledge)).toEqual([]);
 expect(strategicAbilityAims('reinforce',a,1,caster,[caster,remote,threat],relation,knowledge)).toEqual([remote.id]);
 expect(strategicAbilityAims('reinforce',a,1,caster,[caster,ally,enemy],relation,knowledge)).toEqual([]);
});
