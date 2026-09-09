import { describe,it,expect } from "vitest";
import { game,placed } from "./helpers";
import { inventoryCard } from "../../src/presentation/commands";

function setup() {
  return game([{...placed("ring","item.test-ring",219,230),owner:"none"},
    {...placed("salve","item.test-salve",217,230),owner:"none"}],draft=>{
      draft.definitions.push({id:"item.test-ring",kind:"item",name:"Ring",description:"Armor and might.",asset:"asset.item.plank",icon:"icon.item.plank",stackLimit:1,
        itemEffect:{type:"equipment",damage:9,armor:2,maxHp:100}},
      {id:"item.test-salve",kind:"item",name:"Salve",description:"Restores health.",asset:"asset.item.plank",icon:"icon.item.plank",stackLimit:1,
        itemEffect:{type:"consumable",heal:100}});
    });
}
describe("hero inventory",()=>{
  it("transfers ground loot atomically, derives bonuses, saves slots and drops without healing exploits",()=>{
    const g=setup(),hero=g.entities.find(e=>e.owner==="player.1"&&e.equipment)!,ring=g.entities.find(e=>e.placement==="ring")!;
    const hp=hero.hp!,damage=g.context.stats(hero).damage;
    expect(g.command("player.1",{type:"pickup",actor:hero.id,target:ring.id}).accepted).toBe(true);
    g.tick();expect(g.context.get(ring.id)).toBeUndefined();expect(hero.equipment![0]).toBe("item.test-ring");
    expect(g.context.stats(hero).damage).toBe(damage+9);expect(hero.hp).toBe(hp);expect(g.context.stats(hero).maxHp).toBe(hp+100);
    const saved=g.snapshot(),restored=setup();restored.restore(saved);expect(restored.context.get(hero.id)!.equipment).toEqual(hero.equipment);
    expect(inventoryCard(g.view("player.1"),hero.id,"player.1",g.registry)[0].drop).toEqual({type:"dropItem",actor:hero.id,slot:0});
    expect(inventoryCard(g.view(),hero.id,"player.2",g.registry)).toEqual([]);
    expect(g.command("player.1",{type:"dropItem",actor:hero.id,slot:0}).accepted).toBe(true);
    expect(hero.hp).toBe(hp);expect(g.context.stats(hero).damage).toBe(damage);
    expect(g.entities.filter(e=>e.definition==="item.test-ring")).toHaveLength(1);
  });
  it("preserves full-inventory loot, consumes healing once and rejects invalid ownership/slots",()=>{
    const g=setup(),hero=g.entities.find(e=>e.owner==="player.1"&&e.equipment)!,salve=g.entities.find(e=>e.placement==="salve")!;
    hero.equipment!.fill("item.test-ring");
    expect(g.command("player.1",{type:"pickup",actor:hero.id,target:salve.id}).reason).toMatch(/full/);expect(g.context.get(salve.id)).toBe(salve);
    hero.equipment!.fill(null);hero.equipment![0]="item.test-salve";
    expect(g.command("player.2",{type:"useItem",actor:hero.id,slot:0}).accepted).toBe(false);
    expect(g.command("player.1",{type:"useItem",actor:hero.id,slot:0}).accepted).toBe(false);
    hero.hp!-=150;expect(g.command("player.1",{type:"useItem",actor:hero.id,slot:0}).accepted).toBe(true);
    expect(hero.hp).toBe(g.context.stats(hero).maxHp-50);expect(hero.equipment![0]).toBeNull();
    expect(g.command("player.1",{type:"useItem",actor:hero.id,slot:0}).accepted).toBe(false);
    expect(g.command("player.1",{type:"dropItem",actor:hero.id,slot:11}).accepted).toBe(false);
  });
  it("leaves exactly one owner when two heroes reach a chest and retains hero loot on death",()=>{
    const g=setup(),hero=g.entities.find(e=>e.owner==="player.1"&&e.equipment)!,ring=g.entities.find(e=>e.placement==="ring")!;
    const other=g.context.create(placed("other","unit.ants.marshal",219,231));other.readyTick=0;
    for(const h of [hero,other])expect(g.command("player.1",{type:"pickup",actor:h.id,target:ring.id}).accepted).toBe(true);
    g.tick();
    expect([hero,other].flatMap(h=>h.equipment!).filter(id=>id==="item.test-ring")).toHaveLength(1);
    const holder=[hero,other].find(h=>h.equipment!.includes("item.test-ring"))!;
    holder.hp=0;g.inventory.onDeath(holder);g.economy.remove(holder);g.revival.retain(holder);
    expect(holder.equipment).toContain("item.test-ring");
    expect(g.entities.filter(e=>e.definition==="item.test-ring")).toHaveLength(0);
  });
});

it('retains a pickup order through a stun and transfers the chest only after recovery',()=>{
 const g=setup(),hero=g.entities.find(e=>e.owner==='player.1'&&e.equipment)!,ring=g.entities.find(e=>e.placement==='ring')!;
 hero.effects=[{ability:'spell.marshal.faultline',rank:1,source:hero.id,expires:g.state.tick+10}];
 expect(g.command('player.1',{type:'pickup',actor:hero.id,target:ring.id}).accepted).toBe(true);
 for(let i=0;i<9;i++)g.tick();
 expect(g.context.get(ring.id)).toBe(ring);expect(hero.equipment!.every(x=>x===null)).toBe(true);
 expect(hero.unit!.order).toEqual({type:'pickup',target:ring.id});
 const restored=setup();restored.restore(g.snapshot());
 g.tick();restored.tick();
 expect(g.context.get(ring.id)).toBeUndefined();expect(hero.equipment![0]).toBe('item.test-ring');
 expect(restored.snapshot()).toEqual(g.snapshot());
});

it('revives the same hero with items, XP and skills after real combat death and a queued save/load',()=>{
 const g=setup(),victim=g.context.create(placed('fallen','unit.ants.marshal',230,230,{health:1})),attacker=g.context.create(placed('attacker','unit.ants.warrior',231,230)),shrine=g.context.create(placed('shrine','building.ants.sanctuary',239,230));
 for(const e of [victim,attacker,shrine])e.readyTick=0;
 victim.equipment!.fill('item.test-ring');victim.progression!.experience=100;
 expect(g.spells.learn(victim,'spell.marshal.faultline')).toBeNull();
 g.tick();
 expect(g.command('player.1',{type:'attack',actors:[attacker.id],target:victim.id,force:true}).accepted).toBe(true);
 g.tick();expect(victim.fallen).toBe(true);expect(victim.hp).toBe(0);
 expect(g.view('player.1').entities.some(e=>e.id===victim.id)).toBe(false);
 expect(g.view('player.2').fallenHeroes?.some(e=>e.id===victim.id)).toBe(false);
 expect(g.entities.filter(e=>e.definition==='item.test-ring')).toHaveLength(1);
 const equipment=[...victim.equipment!],learned={...victim.spellcasting!.learned},xp=victim.progression!.experience;
 expect(g.command('player.1',{type:'revive',actor:shrine.id,hero:victim.id}).accepted).toBe(true);
 expect(g.command('player.1',{type:'revive',actor:shrine.id,hero:victim.id}).accepted).toBe(false);
 for(let t=0;t<125;t++)g.tick();
 const restored=setup();restored.restore(g.snapshot());
 for(const sim of [g,restored])for(let t=0;t<275;t++)sim.tick();
 expect(restored.snapshot()).toEqual(g.snapshot());
 expect(victim.fallen).toBeUndefined();expect(victim.hp).toBe(g.context.stats(victim).maxHp);
 expect(victim.equipment).toEqual(equipment);expect(victim.progression!.experience).toBe(xp);expect(victim.spellcasting!.learned).toEqual(learned);
 expect(g.view('player.1').entities.some(e=>e.id===victim.id)).toBe(true);
 expect(shrine.revival!.queue).toEqual([]);
});
