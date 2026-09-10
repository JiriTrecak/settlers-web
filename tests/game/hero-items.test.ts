import { describe, expect, it } from "vitest";
import { game, placed } from "./helpers";
import { ItemEffects } from "../../src/sim/game/itemEffects";
import { ContentRegistry } from "../../src/content/registry";
import { builtinSource } from "../../src/content/builtin";
import { itemStatusCard } from "../../src/presentation/itemStatus";
import { inventoryCard } from "../../src/presentation/commands";
import { validateItemState } from "../../src/sim/game/itemValidation";
import { isStunned } from "../../src/sim/game/effects";
import type { Entity } from "../../src/sim/game/state";

/** Exercise the interpreter through real declared items, including persisted state. */
function setup() {
 const g=game(), hero=g.entities.find(e=>e.owner==='player.1'&&e.equipment)!;
 const ally=g.context.create(placed('ally','unit.ants.marshal',hero.x+1,hero.y)); ally.readyTick=0;
 const enemy=g.context.create({...placed('enemy','unit.ants.marshal',hero.x+2,hero.y),owner:'player.2'});enemy.readyTick=0;
 return {g,hero,ally,enemy,items:g.combat.items};
}
function equip(hero:Entity,...ids:string[]) {hero.equipment!.fill(null);hero.equipmentState=hero.equipment!.map(()=>null);ids.forEach((id,i)=>hero.equipment![i]='item.'+id);}

describe('declarative hero items',()=>{
 it('ships exactly ten items per tier, with all loot strictly bounded',()=>{
  const registry=new ContentRegistry(builtinSource);
  for(const tier of [1,2,3])expect(registry.definitions.filter(d=>d.itemTier===tier)).toHaveLength(10);
  for(const [id,pool] of Object.entries(registry.rules.lootPools))for(const entry of pool.entries)if(entry.item) {
   expect(registry.get(entry.item).itemTier).toBeLessThanOrEqual(pool.maxTier!);
   if(id!=='loot.camp.legendary')expect(registry.get(entry.item).itemTier).not.toBe(3);
  }
  const draft=structuredClone(builtinSource) as any;
  draft.rules.lootPools['loot.camp.medium'].entries[0].item='item.worldroot-heart';
  expect(()=>new ContentRegistry(draft)).toThrow(/tier/);
 });
 it('applies every passive modifier through resolved stats, with bounded percentage bonuses',()=>{
  const {g,hero}=setup(),base=g.context.stats(hero);
  equip(hero,'ancient-heartwood','moonwell-chalice','stormwing-spurs','predator-talon');
  const stats=g.context.stats(hero);
  expect(stats.maxHp).toBe(base.maxHp+280);expect(stats.maxMana).toBe(base.maxMana+140);
  expect(stats.healthRegenPerSecond).toBe(base.healthRegenPerSecond+2);
  expect(stats.manaRegenPerSecond).toBe(base.manaRegenPerSecond+1.5);
  expect(stats.moveSpeedPermille).toBe(1100);expect(stats.cooldownTicks).toBeLessThan(base.cooldownTicks);
  expect(stats.lifestealPermille).toBe(100);
  equip(hero,'worldroot-heart','worldroot-heart');expect(g.context.stats(hero).maxHp).toBe(base.maxHp+900);
 });
 it('restores mana without consuming a full hero potion, and expends charges exactly once',()=>{
  const {g,hero}=setup();equip(hero,'moon-dew');
  expect(g.inventory.use(hero,0)).toMatch(/full/);expect(hero.equipment![0]).toBe('item.moon-dew');
  hero.spellcasting!.mana-=90;expect(g.inventory.use(hero,0)).toBeNull();expect(hero.equipment![0]).toBeNull();
  equip(hero,'trailkeeper-flask');hero.hp!-=200;
  for(let n=0;n<3;n++) {g.state.tick=n*400;hero.hp!-=20;expect(g.inventory.use(hero,0)).toBeNull();if(n<2)expect(g.inventory.use(hero,0)).toMatch(/cooling/);}
  expect(hero.equipment![0]).toBeNull();
 });
 it('preserves charges and cooldowns on drop, pickup and save/load',()=>{
  const {g,hero}=setup();equip(hero,'trailkeeper-flask');hero.hp!-=200;g.inventory.use(hero,0);
  expect(g.inventory.drop(hero,0)).toBeNull();
  const loot=g.entities.find(e=>e.definition==='item.trailkeeper-flask')!;
  expect(loot.item!.runtime).toMatchObject({charges:2,readyTick:400});
  hero.unit!.order={type:'pickup',target:loot.id};hero.unit!.position=null;hero.x=loot.x;hero.y=loot.y;
  g.inventory.advance();expect(hero.equipmentState![0]).toMatchObject({charges:2,readyTick:400});
  expect(g.inventory.use(hero,0)).toMatch(/cooling/);
  const restored=game();restored.restore(g.snapshot());
  expect(restored.context.get(hero.id)!.equipmentState).toEqual(hero.equipmentState);
  expect(restored.snapshot()).toEqual(g.snapshot());
 });
 it('applies auras to allied recipients, never enemies, and removes on departure/death',()=>{
  const {g,hero,ally,enemy,items}=setup();equip(hero,'warcaller-standard');equip(ally,'warcaller-standard');
  const base=g.registry.get(ally.definition).behaviors.progression!.levels[0].damage;
  items.tick();expect(g.context.stats(ally).damage).toBeCloseTo(base*1.1);
  expect(ally.itemStatuses!.filter(s=>s.item==='item.warcaller-standard')).toHaveLength(1);
  expect(enemy.itemStatuses).toBeUndefined();
  equip(ally);ally.x+=30;items.tick();expect(ally.itemStatuses).toBeUndefined();
  ally.x=hero.x+1;items.tick();expect(ally.itemStatuses).toHaveLength(1);
  hero.hp=0;items.tick();expect(ally.itemStatuses).toBeUndefined();
 });
 it('respects shared teams and publishes recipient information without exposing inventory',()=>{
  const {g,hero,enemy}=setup();equip(hero,'broodkeeper-lantern');
  const items=new ItemEffects(g.context,new Map([['player.1',0],['player.2',0]]));items.tick();
  expect(enemy.itemStatuses).toHaveLength(1);g.observation.update();
  const view=g.view('player.1'), recipient=view.entities.find(e=>e.id===enemy.id)!;
  expect(recipient.equipment).toBeUndefined();expect(itemStatusCard(recipient,view.revision,g.registry)[0].description).toMatch(/health\/sec/);
 });
 it('enemy roots stop movement but immunity suppresses roots and spell stuns',()=>{
  const {g,hero,enemy,items}=setup();equip(hero,'rootbinder-idol');
  expect(g.inventory.use(hero,0)).toBeNull();expect(enemy.itemStatuses?.[0].item).toBe('item.rootbinder-idol');
  const before={x:enemy.x,y:enemy.y};g.context.spatial.rebuild();g.context.spatial.route(enemy,{x:enemy.x+4,y:enemy.y});g.context.move();
  expect({x:enemy.x,y:enemy.y}).toEqual(before);
  equip(enemy,'endless-brood-banner');g.inventory.use(enemy,0);
  enemy.effects=[{ability:'spell.marshal.faultline',rank:1,source:hero.id,expires:100}];
  expect(isStunned(enemy,g.registry)).toBe(false);
  g.state.tick=161;items.tick();expect(isStunned(enemy,g.registry)).toBe(true);
 });
 it('shields absorb damage and lethal rescue fires once without a death',()=>{
  const {g,hero,enemy,items}=setup();equip(hero,'amber-carapace');g.inventory.use(hero,0);
  expect(items.absorb(hero,100)).toBe(0);expect(items.absorb(hero,100)).toBe(20);
  equip(hero,'phoenix-chrysalis');
  const dead=g.combat.resolve([{source:enemy.id,target:hero.id,damage:100000,damageType:'hero'}]);
  expect(dead).not.toContain(hero);expect(hero.hp).toBeGreaterThan(0);expect(hero.equipment![0]).toBeNull();
  expect(items.absorb(hero,10000)).toBe(0);g.state.tick+=61;items.tick();
  expect(g.combat.resolve([{source:enemy.id,target:hero.id,damage:100000,damageType:'hero'}])).toContain(hero);
 });
 it('triggers every N basic hits without recursive procs, and caps lifesteal to target health',()=>{
  const {hero,enemy,items}=setup();equip(hero,'tempest-antennae','predator-talon');hero.hp!-=100;enemy.hp=10;const hp=hero.hp!;
  expect(items.onHit(hero,enemy,100,'hero')).toEqual([]);expect(hero.hp).toBe(hp+1);
  expect(items.onHit(hero,enemy,100,'hero')).toEqual([]);
  const hits=items.onHit(hero,enemy,100,'hero');expect(hits).toHaveLength(1);expect(hits[0].damage).toBe(45);
  expect(items.onHit(hero,enemy,100,'hero')).toEqual([]);
 });
 it('reduces spell cooldowns declaratively and never resets item cooldowns',()=>{
  const {g,hero}=setup();equip(hero,'deep-moon-scepter','amber-hourglass');
  g.spells.learn(hero,'spell.marshal.faultline');const rank=g.registry.rules.spells['spell.marshal.faultline'].ranks[0];
  expect(g.spells.cast(hero,'spell.marshal.faultline',{x:hero.x,y:hero.y})).toBeNull();
  expect(hero.spellcasting!.cooldowns['spell.marshal.faultline']).toBe(Math.round(rank.cooldownTicks*.8));
  hero.spellcasting!.pending=null;g.inventory.use(hero,1);
  expect(hero.spellcasting!.cooldowns['spell.marshal.faultline']).toBe(Math.max(0,Math.round(rank.cooldownTicks*.8)-480));
  expect(g.inventory.use(hero,1)).toMatch(/cooling/);
 });
 it('has usable HUD actions, tier and charge/cooldown labels and validates corrupted saves',()=>{
  const {g,hero}=setup();equip(hero,'amber-carapace');g.observation.update();
  expect(inventoryCard(g.view('player.1'),hero.id,'player.1',g.registry)[0]).toMatchObject({tier:2,use:{type:'useItem'}});
  g.inventory.use(hero,0);g.observation.update();expect(inventoryCard(g.view('player.1'),hero.id,'player.1',g.registry)[0]).toMatchObject({cooldown:45,use:null});
  hero.equipmentState![0]!.charges=999;expect(()=>validateItemState(hero,g.registry)).toThrow(/charges/);
 });
});

it.each(new ContentRegistry(builtinSource).definitions.filter(d=>d.itemTier).map(d=>[d.id]))('activates or equips declared item %s without identity-specific handling',(id)=>{
 const {g,hero,items}=setup();equip(hero,id.slice(5));hero.hp=100;hero.spellcasting!.mana=0;
 const effect=g.registry.get(id).itemEffect!;
 if(effect.active || effect.type==='consumable')expect(g.inventory.use(hero,0)).toBeNull();
 items.tick();expect(g.context.stats(hero).maxHp).toBeGreaterThan(0);
 validateItemState(hero,g.registry);
});

it('keeps item effects and queued damage deterministic across a resumed battle',()=>{
 const {g,hero}=setup();equip(hero,'winter-heart','warcaller-standard','trailkeeper-flask');
 hero.hp=300;g.inventory.use(hero,0);g.inventory.use(hero,2);g.combat.items.tick();
 const restored=game();restored.restore(g.snapshot());
 for(let i=0;i<240;i++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
});
