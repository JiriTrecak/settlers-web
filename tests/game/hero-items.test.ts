import { describe, expect, it } from "vitest";
import { game, placed, source } from "./helpers";
import { ItemEffects } from "../../src/sim/game/itemEffects";
import { ContentRegistry } from "../../src/content/registry";
import { testContent } from "../fixtures/content";
import { itemStatusCard } from "../../src/presentation/itemStatus";
import { inventoryCard } from "../../src/presentation/commands";
import { validateItemState } from "../../src/sim/game/itemValidation";
import { isStunned } from "../../src/sim/game/effects";
import type { Entity } from "../../src/sim/game/state";

/** Exercise the item interpreter through test-owned declared items, including persisted state.
 * Expected values are read from the test item declarations, never restated. */
function setup() {
 const g=game(), hero=g.entities.find(e=>e.owner==='player.1'&&e.equipment)!;
 const ally=g.context.create(placed('ally','unit.test.marshal',hero.x+1,hero.y)); ally.readyTick=0;
 const enemy=g.context.create({...placed('enemy','unit.test.marshal',hero.x+2,hero.y),owner:'player.2'});enemy.readyTick=0;
 return {g,hero,ally,enemy,items:g.combat.items};
}
const item=(id:string)=>'item.test.'+id;
const effect=(id:string)=>testContent.get(item(id)).itemEffect!;
function equip(hero:Entity,...ids:string[]) {hero.equipment!.fill(null);hero.equipmentState=hero.equipment!.map(()=>null);ids.forEach((id,i)=>hero.equipment![i]=item(id));}

describe('declarative hero items',()=>{
 it('rejects a loot pool that offers an item above its tier cap',()=>{
  const draft=source() as any,pool=Object.values(draft.rules.lootPools as Record<string,{maxTier?:number;entries:{item:string|null}[]}>).find(p=>p.maxTier===1)!;
  const tooRare=(draft.definitions as {id:string;itemTier?:number}[]).find(d=>(d.itemTier??0)>1)!;
  expect(()=>new ContentRegistry(draft)).not.toThrow();
  pool.entries[0]!.item=tooRare.id;
  expect(()=>new ContentRegistry(draft)).toThrow(/tier/);
 });
 it('applies every passive modifier through resolved stats, with bounded percentage bonuses',()=>{
  const {g,hero}=setup(),base=g.context.stats(hero);
  const passive=['ancient-heartwood','moonwell-chalice','stormwing-spurs','predator-talon'];
  const sum=(read:(e:ReturnType<typeof effect>)=>number|undefined)=>passive.reduce((n,id)=>n+(read(effect(id))??0),0);
  equip(hero,...passive);
  const stats=g.context.stats(hero);
  expect(stats.maxHp).toBe(base.maxHp+sum(e=>"maxHp" in e?e.maxHp:0));expect(stats.maxMana).toBe(base.maxMana+sum(e=>e.modifiers?.maxMana));
  expect(stats.healthRegenPerSecond).toBe(base.healthRegenPerSecond+sum(e=>e.modifiers?.healthRegenPerSecond));
  expect(stats.manaRegenPerSecond).toBe(base.manaRegenPerSecond+sum(e=>e.modifiers?.manaRegenPerSecond));
  expect(stats.moveSpeedPermille).toBe(1000+sum(e=>e.modifiers?.moveSpeedPermille));expect(stats.cooldownTicks).toBeLessThan(base.cooldownTicks);
  expect(stats.lifestealPermille).toBe(sum(e=>e.modifiers?.lifestealPermille));
  equip(hero,'worldroot-heart','worldroot-heart');expect(g.context.stats(hero).maxHp).toBe(base.maxHp+2*(effect('worldroot-heart') as {maxHp:number}).maxHp);
 });
 it('restores mana without consuming a full hero potion, and expends charges exactly once',()=>{
  const {g,hero}=setup();equip(hero,'moon-dew');
  expect(g.inventory.use(hero,0)).toMatch(/full/);expect(hero.equipment![0]).toBe(item('moon-dew'));
  hero.abilities!.mana-=90;expect(g.inventory.use(hero,0)).toBeNull();expect(hero.equipment![0]).toBeNull();
  const flask=effect('trailkeeper-flask').active!;
  equip(hero,'trailkeeper-flask');hero.hp!-=200;
  for(let n=0;n<flask.charges!;n++) {g.state.tick=n*flask.cooldownTicks;hero.hp!-=20;expect(g.inventory.use(hero,0)).toBeNull();if(n<flask.charges!-1)expect(g.inventory.use(hero,0)).toMatch(/cooling/);}
  expect(hero.equipment![0]).toBeNull();
 });
 it('preserves charges and cooldowns on drop, pickup and save/load',()=>{
  const {g,hero}=setup(),flask=effect('trailkeeper-flask').active!;equip(hero,'trailkeeper-flask');hero.hp!-=200;g.inventory.use(hero,0);
  const runtime={charges:flask.charges!-1,readyTick:flask.cooldownTicks};
  expect(g.inventory.drop(hero,0)).toBeNull();
  const loot=g.entities.find(e=>e.definition===item('trailkeeper-flask'))!;
  expect(loot.item!.runtime).toMatchObject(runtime);
  hero.unit!.order={type:'pickup',target:loot.id};hero.unit!.position=null;hero.x=loot.x;hero.y=loot.y;
  g.inventory.advance();expect(hero.equipmentState![0]).toMatchObject(runtime);
  expect(g.inventory.use(hero,0)).toMatch(/cooling/);
  const restored=game();restored.restore(g.snapshot());
  expect(restored.context.get(hero.id)!.equipmentState).toEqual(hero.equipmentState);
  expect(restored.snapshot()).toEqual(g.snapshot());
 });
 it('applies auras to allied recipients, never enemies, and removes on departure/death',()=>{
  const {g,hero,ally,enemy,items}=setup();equip(hero,'warcaller-standard');equip(ally,'warcaller-standard');
  const base=g.registry.get(ally.definition).behaviors.progression!.levels[0].damage;
  const bonus=effect('warcaller-standard').aura!.modifiers.damagePermille!;
  items.tick();expect(g.context.stats(ally).damage).toBeCloseTo(base*(1000+bonus)/1000);
  expect(ally.itemStatuses!.filter(s=>s.item===item('warcaller-standard'))).toHaveLength(1);
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
  expect(g.inventory.use(hero,0)).toBeNull();expect(enemy.itemStatuses?.[0].item).toBe(item('rootbinder-idol'));
  const before={x:enemy.x,y:enemy.y};g.context.spatial.rebuild();g.context.spatial.route(enemy,{x:enemy.x+4,y:enemy.y});g.context.move();
  expect({x:enemy.x,y:enemy.y}).toEqual(before);
  equip(enemy,'endless-brood-banner');g.inventory.use(enemy,0);
  enemy.stunnedUntil=100;
  expect(isStunned(enemy,g.registry)).toBe(false);
  g.state.tick=effect('endless-brood-banner').active!.status!.durationTicks+1;items.tick();expect(isStunned(enemy,g.registry)).toBe(true);
 });
 it('shields absorb damage and lethal rescue fires once without a death',()=>{
  const {g,hero,enemy,items}=setup();equip(hero,'amber-carapace');g.inventory.use(hero,0);
  const shield=effect('amber-carapace').active!.status!.shield!;
  expect(items.absorb(hero,shield-20)).toBe(0);expect(items.absorb(hero,100)).toBe(80);
  equip(hero,'phoenix-chrysalis');
  const dead=g.combat.resolve([{source:enemy.id,target:hero.id,damage:100000,damageType:'hero'}]);
  expect(dead).not.toContain(hero);expect(hero.hp).toBeGreaterThan(0);expect(hero.equipment![0]).toBeNull();
  expect(items.absorb(hero,10000)).toBe(0);g.state.tick+=effect('phoenix-chrysalis').rescue!.invulnerableTicks+1;items.tick();
  expect(g.combat.resolve([{source:enemy.id,target:hero.id,damage:100000,damageType:'hero'}])).toContain(hero);
 });
 it('triggers every N basic hits without recursive procs, and caps lifesteal to target health',()=>{
  const {hero,enemy,items}=setup();equip(hero,'tempest-antennae','predator-talon');hero.hp!-=100;enemy.hp=10;const hp=hero.hp!;
  const proc=effect('tempest-antennae').onHit!,lifesteal=effect('predator-talon').modifiers!.lifestealPermille!;
  expect(items.onHit(hero,enemy,100,'hero')).toEqual([]);expect(hero.hp).toBe(hp+Math.floor(10*lifesteal/1000));
  for(let n=1;n<proc.every-1;n++)expect(items.onHit(hero,enemy,100,'hero')).toEqual([]);
  const hits=items.onHit(hero,enemy,100,'hero');expect(hits).toHaveLength(1);expect(hits[0].damage).toBe(proc.damage);
  expect(items.onHit(hero,enemy,100,'hero')).toEqual([]);
 });
 it('reduces spell cooldowns declaratively and never resets item cooldowns',()=>{
  const {g,hero}=setup();equip(hero,'deep-moon-scepter','amber-hourglass');
  const reduce=effect('amber-hourglass').active!.reduceAbilityCooldownTicks!;
  hero.abilities!.cooldowns['ability.test.holy-light-lite']=reduce+120;
  expect(g.inventory.use(hero,1)).toBeNull();
  expect(hero.abilities!.cooldowns['ability.test.holy-light-lite']).toBe(120);
 });
 it('has usable HUD actions, tier and charge/cooldown labels and validates corrupted saves',()=>{
  const {g,hero}=setup();equip(hero,'amber-carapace');g.observation.update();
  expect(inventoryCard(g.view('player.1'),hero.id,'player.1',g.registry)[0]).toMatchObject({tier:testContent.get(item('amber-carapace')).itemTier,use:{type:'useItem'}});
  g.inventory.use(hero,0);g.observation.update();
  expect(inventoryCard(g.view('player.1'),hero.id,'player.1',g.registry)[0]).toMatchObject({cooldown:effect('amber-carapace').active!.cooldownTicks/40,use:null});
  hero.equipmentState![0]!.charges=999;expect(()=>validateItemState(hero,g.registry)).toThrow(/charges/);
 });
});

it.each(testContent.definitions.filter(d=>d.itemTier).map(d=>[d.id]))('activates or equips declared item %s without identity-specific handling',(id)=>{
 const {g,hero,items}=setup();equip(hero,id.slice('item.test.'.length));hero.hp=100;hero.abilities!.mana=0;
 const declared=g.registry.get(id).itemEffect!;
 if(declared.active || declared.type==='consumable')expect(g.inventory.use(hero,0)).toBeNull();
 items.tick();expect(g.context.stats(hero).maxHp).toBeGreaterThan(0);
 validateItemState(hero,g.registry);
});

it('keeps item effects and queued damage deterministic across a resumed battle',()=>{
 const {g,hero}=setup();equip(hero,'winter-heart','warcaller-standard','trailkeeper-flask');
 hero.hp=300;g.inventory.use(hero,0);g.inventory.use(hero,2);g.combat.items.tick();
 const restored=game();restored.restore(g.snapshot());
 for(let i=0;i<240;i++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
});
