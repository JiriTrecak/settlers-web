import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {entityStats} from '../../src/sim/game/stats';
import type {Rules} from '../../src/content/schema';

it('resolves research, personal bonuses and slows immediately and returns to base when they are removed',()=>{
 const g=game([placed('subject','unit.test.warrior',100,100)],draft=>{
  (draft.rules as Rules).research['research.bench']={name:'Bench',description:'Test',icon:'icon.test.fort',priority:1,items:[],workTicks:1,effects:[{units:['unit.test.warrior'],damagePermille:200,maxHp:75}]};
 });
 const e=g.entities.find(e=>e.placement==='subject')!,d=g.registry.get(e.definition),research:string[]=[];
 const resolve=()=>entityStats(d,e,g.registry,research),base=resolve();
 research.push('research.bench');const upgraded=resolve();
 expect(upgraded.maxHp).toBe(base.maxHp+75);expect(upgraded.damage).toBe(base.damage*1.2);
 research.length=0;expect(resolve()).toEqual(base);
 e.progression={experience:0,bonuses:{damage:9}};
 expect(resolve().damage).toBe(base.damage+9);
 e.progression.bonuses!.damage=15;expect(resolve().damage).toBe(base.damage+15);
 delete e.progression;expect(resolve()).toEqual(base);
 e.slows=[{permille:300,expires:100}];expect(resolve().moveSpeedPermille).toBe(700);
 e.slows[0].permille=500;expect(resolve().moveSpeedPermille).toBe(500);
 delete e.slows;expect(resolve()).toEqual(base);
});
