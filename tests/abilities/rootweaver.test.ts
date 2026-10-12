import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {itemFlag} from '../../src/sim/game/itemModifiers';
import {spellControl} from '../../src/sim/abilities/statuses';
import {fixed} from '../../src/sim/game/motion';
function fixture(name:string){
 const spell=coreAbilities.abilities.find(a=>a.id==='ability.ants.'+name)!;
 const f=createAbilityEncounter(spell,coreAbilities.presentations.find(p=>p.id===spell.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',distance:3,targetHealth:500,mana:1000}));
 return {...f,c:f.game.context.get(f.caster)!,t:f.game.context.get(f.target)!};
}
function advance(g:ReturnType<typeof fixture>['game'],n:number){for(let i=0;i<n;i++)g.tick(undefined,{passiveUnits:true});}
it('Root Bind restricts ground movement and attacks, deals periodic damage and then expires',()=>{
 const f=fixture('root-bind');expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();advance(f.game,12);
 expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(true);expect(f.t.spellStatuses?.some(s=>s.status==='rooted')).toBe(true);expect(spellControl(f.t,f.game.registry,'disarm')).toBe(true);
 const hp=f.t.hp!;advance(f.game,40);expect(f.t.hp!).toBeLessThan(hp);expect(f.c.abilities!.mana).toBe(955);
 advance(f.game,200);expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(false);
});
it('Root Bind rejects flying units',()=>{
 const f=fixture('root-bind');const air=f.game.context.create({id:'air',definition:'unit.ants.winglancer',owner:'player.2',position:{x:123,y:121},rotation:0});
 expect(f.game.abilities.cast(f.caster,'preview',air.id)).not.toBeNull();
});
it('Briar Patch slows and damages ground enemies, excludes allies and air, and persists after caster death',()=>{
 const f=fixture('briar-patch'),g=f.game;
 const ally=g.context.create({id:'ally',definition:'unit.ants.warrior',owner:'player.1',position:{x:123,y:122},rotation:0}),air=g.context.create({id:'air',definition:'unit.ants.winglancer',owner:'player.2',position:{x:123,y:121},rotation:0});
 const ah=ally.hp,fh=air.hp;expect(g.abilities.cast(f.caster,'preview',{x:123,y:120})).toBeNull();advance(g,12);
 expect(g.context.stats(f.t).moveSpeedPermille).toBe(650);expect(f.t.hp).toBe(497);expect(ally.hp).toBe(ah);expect(air.hp).toBe(fh);expect(g.context.stats(air).moveSpeedPermille).toBe(1000);
 f.c.hp=0;g.onCombatDeath(f.c);advance(g,21);expect(f.t.hp).toBe(494);expect(g.state.spellInstances).toHaveLength(1);
 f.t.x=150;f.t.unit!.position=fixed(f.t);advance(g,25);expect(g.context.stats(f.t).moveSpeedPermille).toBe(1000);
 advance(g,240);expect(g.state.spellInstances).toHaveLength(0);
});
it('Briar Patch resumes identically from a saved mid-cast field',()=>{
 const a=fixture('briar-patch'),b=fixture('briar-patch');expect(a.game.abilities.cast(a.caster,'preview',{x:123,y:120})).toBeNull();advance(a.game,35);b.game.restore(a.game.snapshot());
 for(let i=0;i<250;i++){advance(a.game,1);advance(b.game,1);expect(a.game.checksum()).toBe(b.game.checksum());}
});

it('recruits Rootweavers at barracks after the hall upgrade with both declared spells available',async()=>{
 const {game,placed,run}=await import('../game/helpers');const {snapPlacement}=await import('../../src/shared/spatial/placement');
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;
 g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.rootweaver'}).accepted).toBe(false);
 const hall=g.registry.get('building.ants.great-mound');g.context.create({...placed('hall',hall.id,190,200),position:snapPlacement(hall,{x:190,y:200})});
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.rootweaver'}).accepted).toBe(true);run(g,1300);
 const unit=g.entities.find(e=>e.definition==='unit.ants.rootweaver')!;expect(unit).toBeDefined();expect(unit.abilities!.mana).toBeGreaterThan(65);
 expect(g.registry.get(unit.definition).behaviors.abilities!.bindings.map(b=>b.ability)).toEqual(['ability.ants.root-bind','ability.ants.briar-patch']);
 const enemy=g.context.create({...placed('enemy','unit.ants.warrior',unit.x+7,unit.y),owner:'player.2'});run(g,32);expect(itemFlag(enemy,g.registry,'rooted')).toBe(true);
});
