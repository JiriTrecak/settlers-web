import {expect,it} from 'vitest';
import {abilitySchema} from '../../src/content/abilities/schema';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {encounter,testAbility} from './encounter-harness';

// Passive aura abilities: recipients, ranked strength across several sources, source markers and unlearning.
const ally=abilitySchema.parse({...testAbility('ability.test.marshal-rally'),ranks:[{movement:80,attack:100},{movement:120,attack:150},{movement:160,attack:200}]});
const hostile=abilitySchema.parse({...testAbility('ability.test.rootbreaker-presence'),ranks:[{armor:-2},{armor:-3},{armor:-4}]});
const guard=abilitySchema.parse({...testAbility('ability.test.royal-guard'),ranks:[{armor:2}]});
const step=(f:ReturnType<typeof encounter>,n:number)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};

it('applies only the strongest learned copy, falls back when it dies and clears when unlearned',()=>{
 const f=encounter(ally,{relationship:'ally'}),target=f.game.context.get(f.target)!,caster=f.game.context.get(f.caster)!;
 const second=f.game.context.create({id:'second-source',definition:'unit.preview.caster',owner:'player.1',position:{x:122,y:122},rotation:0});
 second.abilities!.ranks.preview=3;second.unit!.order={type:'hold'};
 const enemy=f.game.context.create({id:'enemy',definition:'unit.test.warrior',owner:'player.2',position:{x:128,y:120},rotation:0});enemy.unit!.order={type:'hold'};
 step(f,2);expect(f.game.context.stats(target).moveSpeedPermille).toBe(1160);
 expect(target.spellStatuses?.filter(s=>s.status==='cadence')).toHaveLength(1);expect(enemy.spellStatuses).toBeUndefined();
 expect(caster.spellStatuses?.some(s=>s.status==='standard')).toBe(true);
 second.hp=0;step(f,2);expect(f.game.context.stats(target).moveSpeedPermille).toBe(1080);
 caster.abilities!.ranks.preview=0;step(f,1);expect(f.game.context.stats(target).moveSpeedPermille).toBe(1000);expect(target.spellStatuses).toBeUndefined();
});

it.each([1,2,3])('a hostile aura at rank %i weakens enemies in range, marks its source, and ends when unlearned',rank=>{
 const f=encounter(hostile,{relationship:'enemy',targetHealth:500,distance:6}),target=f.game.context.get(f.target)!,caster=f.game.context.get(f.caster)!;
 caster.abilities!.ranks.preview=rank;const armor=f.game.context.stats(target).armor;step(f,1);
 expect(f.game.context.stats(target).armor).toBe(armor+(hostile.ranks[rank-1].armor as number));
 expect(caster.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 target.x+=40;step(f,1);expect(target.spellStatuses).toBeUndefined();expect(caster.spellStatuses?.map(s=>s.status)).toEqual(['presence']);
 caster.abilities!.ranks.preview=0;step(f,1);expect(caster.spellStatuses).toBeUndefined();
});

it('an allied aura excludes enemies, buildings and allies outside its radius',()=>{
 const f=encounter(guard,{relationship:'ally',distance:6}),c=f.game.context,target=c.get(f.target)!,base=c.stats(target).armor;
 const outside=[
  c.create({id:'enemy',definition:'unit.test.warrior',owner:'player.2',position:{x:123,y:125},rotation:0}),
  c.create({id:'far',definition:'unit.test.warrior',owner:'player.1',position:{x:160,y:120},rotation:0}),
  c.create({id:'house',definition:'building.test.house',owner:'player.1',position:snapPlacement(c.registry.get('building.test.house'),{x:120,y:126}),rotation:0})];
 const before=outside.map(e=>c.stats(e).armor);step(f,2);
 expect(c.stats(target).armor).toBe(base+2);expect(outside.map(e=>c.stats(e).armor)).toEqual(before);
});
