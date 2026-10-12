import {snapPlacement} from '../../src/shared/spatial/placement';
import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
function fixture(name:string){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.ants.'+name)!;
 const f=createAbilityEncounter(spell,coreAbilities.presentations.find(p=>p.id===spell.presentation)!,encounterSettingsSchema.parse({casterDefinition:'unit.ants.warrior',relationship:name==='shield-brace'?'self':'ally',distance:6,mana:1000}));
 return {...f,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function advance(g:ReturnType<typeof fixture>['game'],n:number){for(let i=0;i<n;i++)g.tick(undefined,{passiveUnits:true});}
it('protects nearby allies without stacking copies and removes protection when guards fall',()=>{
 const f=fixture('royal-guard'),base=f.game.context.stats(f.t).armor;
 const other=f.game.context.create({id:'second',definition:'unit.preview.caster',owner:'player.1',position:{x:122,y:120},rotation:0});
 advance(f.game,1);expect(f.game.context.stats(f.t).armor).toBe(base+2);
 f.c.hp=0;advance(f.game,2);expect(f.game.context.stats(f.t).armor).toBe(base+2);
 other.hp=0;advance(f.game,2);expect(f.game.context.stats(f.t).armor).toBe(base);
});
it('excludes enemies, buildings and allies outside the aura',()=>{
 const f=fixture('royal-guard');const entities=[
 f.game.context.create({id:'enemy',definition:'unit.ants.warrior',owner:'player.2',position:{x:123,y:125},rotation:0}),
 f.game.context.create({id:'far',definition:'unit.ants.warrior',owner:'player.1',position:{x:160,y:120},rotation:0}),
 f.game.context.create({id:'house',definition:'building.ants.house',owner:'player.1',position:snapPlacement(f.game.registry.get('building.ants.house'),{x:120,y:126}),rotation:0})];
 const base=entities.map(e=>f.game.context.stats(e).armor);advance(f.game,2);expect(entities.map(e=>f.game.context.stats(e).armor)).toEqual(base);
});
it('trades movement speed for temporary armor, spends mana once, and restores deterministically',()=>{
 const a=fixture('shield-brace'),b=fixture('shield-brace'),base=a.game.context.stats(a.c);
 expect(a.game.abilities.cast(a.caster,'preview',a.caster)).toBeNull();advance(a.game,16);
 expect(a.game.context.stats(a.c).armor).toBe(base.armor+4);expect(a.game.context.stats(a.c).moveSpeedPermille).toBe(600);expect(a.c.abilities!.mana).toBe(975);
 b.game.restore(a.game.snapshot());for(let i=0;i<330;i++){advance(a.game,1);advance(b.game,1);expect(a.game.checksum()).toBe(b.game.checksum());}
 expect(a.game.context.stats(a.c).armor).toBe(base.armor);expect(a.game.context.stats(a.c).moveSpeedPermille).toBe(1000);
});

it('recruits the larger elite guard at barracks after the Great Acorn Hall',async()=>{
 const {game,placed,run}=await import('../game/helpers');
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;
 g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.queensguard'}).accepted).toBe(false);
 const hall=g.registry.get('building.ants.great-mound');
 g.context.create({...placed('hall',hall.id,190,200),position:snapPlacement(hall,{x:190,y:200})});
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.queensguard'}).accepted).toBe(true);run(g,1350);
 const unit=g.entities.find(e=>e.definition==='unit.ants.queensguard')!;expect(unit).toBeDefined();
 const guard=g.registry.get(unit.definition),warrior=g.registry.get('unit.ants.warrior');
 expect(guard.modelScale!/warrior.modelScale!).toBeCloseTo(4/3);
 expect(guard.dimensions!.radius).toBeGreaterThan(warrior.dimensions!.radius);
 expect(guard.behaviors.abilities!.bindings.map(b=>b.ability)).toEqual(['ability.ants.royal-guard','ability.ants.shield-brace']);
 const armor=g.context.stats(unit).armor;expect(g.abilities.cast(unit.id,'shield-brace',unit.id)).toBeNull();advance(g as never,20);expect(g.context.stats(unit).armor).toBe(armor+4);
});
