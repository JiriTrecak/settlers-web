import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {entityStats} from '../../src/sim/game/stats';
import type {Rules} from '../../src/content/schema';

it('shares only immutable unmodified stats and observes in-place research and personal changes immediately',()=>{
 const g=game([placed('subject','unit.ants.warrior',100,100)],draft=>{
  (draft.rules as Rules).research['research.bench']={name:'Bench',description:'Test',icon:'icon.ants.fort',priority:1,items:[],workTicks:1,effects:[{units:['unit.ants.warrior'],damagePermille:200,maxHp:75}]};
 });
 const e=g.entities.find(e=>e.placement==='subject')!,d=g.registry.get(e.definition),research:string[]=[];
 const resolve=()=>entityStats(d,e,g.registry,research),base=resolve();
 expect(resolve()).toBe(base);expect(Object.isFrozen(base)).toBe(true);
 research.push('research.bench');const upgraded=resolve();
 expect(upgraded.maxHp).toBe(base.maxHp+75);expect(upgraded.damage).toBe(base.damage*1.2);
 expect(resolve()).toBe(upgraded);research.length=0;expect(resolve()).toBe(base);
 e.progression={experience:0,bonuses:{damage:9}};
 expect(resolve().damage).toBe(base.damage+9);
 e.progression.bonuses!.damage=15;expect(resolve().damage).toBe(base.damage+15);
 delete e.progression;expect(resolve()).toBe(base);
 e.slows=[{permille:300,expires:100}];expect(resolve().moveSpeedPermille).toBe(700);
 e.slows[0].permille=500;expect(resolve().moveSpeedPermille).toBe(500);
 delete e.slows;expect(resolve()).toBe(base);
 // A shallow-frozen external definition is not registry-owned immutable data.
 const mutable=Object.freeze(structuredClone(d)),first=entityStats(mutable,e,g.registry);
 mutable.body!.maxHp+=20;expect(entityStats(mutable,e,g.registry).maxHp).toBe(first.maxHp+20);
});
