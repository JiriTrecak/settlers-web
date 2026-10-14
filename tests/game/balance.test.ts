import {heading} from '../../src/sim/game/facing';
import {describe, expect, it} from 'vitest';
import {testContent} from '../fixtures/content';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {resolveDamage, armorMultiplier} from '../../src/sim/game/damage';
import {Progression} from '../../src/sim/game/progression';
import {entityStats} from '../../src/sim/game/stats';
import {game, placed, run, source} from './helpers';

const heroOf = (g: ReturnType<typeof game>) => g.entities.find(e => e.owner==='player.1' && g.context.def(e).hero)!;

describe('first combat balance', () => {
  it('uses class matchups, percentage armor and protection, rounding only the final hit', () => {
    const rules=testContent.rules; // Test-owned class table and armor coefficient.
    expect(resolveDamage(rules,{armor:5,armorType:'heavy'},100,'melee')).toBe(77);
    expect(resolveDamage(rules,{armor:5,armorType:'heavy',reductionPermille:200},100,'melee')).toBe(62);
    expect(resolveDamage(rules,{armor:0,armorType:'light'},100,'melee')).toBe(150);
    expect(resolveDamage(rules,{armor:2,armorType:'heavy'},15,'piercing')).toBe(12);
    expect(resolveDamage(rules,{armor:13,armorType:'hero'},9,'melee')).toBe(5);
    expect(resolveDamage(rules,{armor:100,armorType:'hero'},100,'spell')).toBe(70);
    expect(resolveDamage(rules,{armor:100,armorType:'structure'},100,'spell')).toBe(25);
    const immune=structuredClone(rules);immune.damageMultipliers.melee.light=0;
    expect(resolveDamage(immune,{armor:0,armorType:'light'},100,'melee')).toBe(0);
    expect(resolveDamage(rules,{armor:100,armorType:'hero'},1,'melee')).toBe(1);
    expect(resolveDamage(rules,{armor:-5,armorType:'heavy'},100,'melee')).toBe(123);
    expect(armorMultiplier(rules,-1000)).toBeLessThan(2);
    expect(armorMultiplier(rules,-5)).toBeGreaterThan(armorMultiplier(rules,-1));
  });
  it('resolves level stats from the declared table and adds flat equipment bonuses at any level', () => {
    const d=testContent.get('unit.test.marshal'),levels=d.behaviors.progression!.levels,first=levels[0],last=levels.at(-1)!;
    const {experience:_e,...base}=first;
    expect(entityStats(d,{},testContent)).toEqual({moveSpeedPermille:1000,cooldownReductionPermille:0,lifestealPermille:0,meleeReflectionPermille:0,level:1,...base});
    const item='item.test.royal-crest',bonus=testContent.get(item).itemEffect as {maxHp:number;damage:number;armor:number};
    const e={progression:{experience:last.experience},equipment:Array(6).fill(item)};
    expect(entityStats(d,e,testContent)).toMatchObject({level:levels.length,maxHp:last.maxHp+6*bonus.maxHp,damage:last.damage+6*bonus.damage,
      armor:last.armor+6*bonus.armor,cooldownTicks:last.cooldownTicks,maxMana:last.maxMana,healthRegenPerSecond:last.healthRegenPerSecond,manaRegenPerSecond:last.manaRegenPerSecond});
  });
  it('accumulates fractional regeneration exactly across saves, without banking recovery at full pools', () => {
    const g=game(),h=heroOf(g),level=g.context.def(h).behaviors.progression!.levels[0];h.hp=500;h.abilities!.mana=0;
    run(g,133);
    const restored=game();restored.restore(g.snapshot());
    run(g,3867);run(restored,3867);
    // 4000 ticks are 100 seconds: fractional per-tick recovery must add up exactly.
    expect(h.hp).toBe(500+Math.floor(level.healthRegenPerSecond*100+1e-9));expect(h.abilities!.mana).toBe(Math.floor(level.manaRegenPerSecond*100+1e-9));
    expect(restored.snapshot()).toEqual(g.snapshot());
    h.hp=level.maxHp;h.abilities!.mana=level.maxMana;run(g,40);
    expect(h.regeneration).toEqual({health:0,mana:0});
    h.hp=0;h.abilities!.mana=0;run(g,200);
    expect(h.hp).toBe(0);expect(h.abilities!.mana).toBe(0);
  });
  it('preserves damage and spent mana on level-up, and uses the new attack interval in combat', () => {
    const g=game([ {...placed('target','unit.test.warrior',222,202),owner:'player.2'} ]),h=heroOf(g);
    const target=g.entities.find(e=>e.placement==='target')!,levels=g.context.def(h).behaviors.progression!.levels;
    h.progression!.experience=levels[1].experience-5;h.hp=500;h.abilities!.mana=100;
    new Progression(g.context).award(target,h.owner,e=>e.id===h.id);
    expect(g.context.stats(h).level).toBe(2);expect(h.hp).toBe(500+levels[1].maxHp-levels[0].maxHp);expect(h.abilities!.mana).toBe(100+levels[1].maxMana-levels[0].maxMana);
    const high=levels[9];h.progression!.experience=high.experience;
    target.x=h.x+4;target.y=h.y;g.observation.update();g.state.tick++;
    h.rotation=heading(h,target);h.unit!.target=target.id;const before=target.hp!;
    g.combat.resolve();
    expect(target.hp).toBe(before);expect(h.unit!.cooldown).toBe(high.cooldownTicks);
    g.state.tick=h.unit!.attack!.impact;g.combat.resolve();
    const body=g.context.def(target).body!,weapon=g.context.def(h).behaviors.combat!;
    expect(before-target.hp!).toBe(resolveDamage(g.registry.rules,{armor:body.armor,armorType:body.armorType},high.damage,weapon.damageType));
  });


  it('validates complete damage tables and a consistent level-one declaration', () => {
    const draft=source();delete (draft.rules as Rules).damageMultipliers.spell.hero;
    expect(()=>new ContentRegistry(draft)).toThrow(/cover the armor classes/);
    const bad=source();const hero=bad.definitions.find((d:any)=>d.id==='unit.test.marshal') as any;
    hero.behaviors.progression.levels[0].damage++;
    expect(()=>new ContentRegistry(bad)).toThrow(/level-one stats/);
  });
});
