import {heading} from '../../src/sim/game/facing';
import {describe, expect, it} from 'vitest';
import {content} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {resolveDamage, armorMultiplier} from '../../src/sim/game/damage';
import {Progression} from '../../src/sim/game/progression';
import {entityStats} from '../../src/sim/game/stats';
import {game, placed, run, source} from './helpers';

const heroOf = (g: ReturnType<typeof game>) => g.entities.find(e => e.owner==='player.1' && g.context.def(e).hero)!;

describe('first combat balance', () => {
  it('uses class matchups, percentage armor and protection, rounding only the final hit', () => {
    const rules=content.rules;
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
  it('publishes one complete stat table through level ten, including item and percentage bonuses', () => {
    const d=content.get('unit.ants.marshal');
    expect(entityStats(d,{},content)).toEqual({moveSpeedPermille:1000,cooldownReductionPermille:0,lifestealPermille:0,meleeReflectionPermille:0,level:1,maxHp:700,damage:31,armor:2,cooldownTicks:73,maxMana:225,healthRegenPerSecond:1.45,manaRegenPerSecond:.76});
    const e={progression:{experience:3200},equipment:Array(6).fill('item.royal-crest')};
    expect(entityStats(d,e,content)).toMatchObject({level:10,maxHp:1975,damage:118,armor:24,cooldownTicks:60,maxMana:420,healthRegenPerSecond:2.8,manaRegenPerSecond:1.41});
  });
  it('accumulates fractional regeneration exactly across saves, without banking recovery at full pools', () => {
    const g=game(),h=heroOf(g);h.hp=500;h.abilities!.mana=0;
    run(g,133);
    const restored=game();restored.restore(g.snapshot());
    run(g,3867);run(restored,3867);
    expect(h.hp).toBe(645);expect(h.abilities!.mana).toBe(76);
    expect(restored.snapshot()).toEqual(g.snapshot());
    h.hp=700;h.abilities!.mana=225;run(g,40);
    expect(h.regeneration).toEqual({health:0,mana:0});
    h.hp=0;h.abilities!.mana=0;run(g,200);
    expect(h.hp).toBe(0);expect(h.abilities!.mana).toBe(0);
  });
  it('preserves damage and spent mana on level-up, and uses the new attack interval in combat', () => {
    const g=game([ {...placed('target','unit.ants.warrior',222,202),owner:'player.2'} ]),h=heroOf(g);
    const target=g.entities.find(e=>e.placement==='target')!;
    h.progression!.experience=95;h.hp=500;h.abilities!.mana=100;
    new Progression(g.context).award(target,e=>e.id===h.id);
    expect(g.context.stats(h).level).toBe(2);expect(h.hp).toBe(575);expect(h.abilities!.mana).toBe(115);
    h.progression!.experience=3200;
    target.x=h.x+4;target.y=h.y;g.observation.update();g.state.tick++;
    h.rotation=heading(h,target);h.unit!.target=target.id;const before=target.hp!;
    g.combat.resolve();
    expect(target.hp).toBe(before);expect(h.unit!.cooldown).toBe(60);
    g.state.tick=h.unit!.attack!.impact;g.combat.resolve();
    expect(before-target.hp!).toBe(52);
  });


  it('validates complete damage tables and a consistent level-one declaration', () => {
    const draft=source();delete (draft.rules as Rules).damageMultipliers.spell.hero;
    expect(()=>new ContentRegistry(draft)).toThrow(/cover the armor classes/);
    const bad=source();const hero=bad.definitions.find((d:any)=>d.id==='unit.ants.marshal') as any;
    hero.behaviors.progression.levels[0].damage++;
    expect(()=>new ContentRegistry(bad)).toThrow(/level-one stats/);
  });
});
