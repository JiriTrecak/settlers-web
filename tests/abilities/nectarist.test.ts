import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {game,placed,run} from '../game/helpers';
const heal=coreAbilities.abilities.find(a=>a.id==='ability.ants.nectar-mend')!;
const presentation=coreAbilities.presentations.find(p=>p.id===heal.presentation)!;
function fixture(){const f=createAbilityEncounter(heal,presentation,encounterSettingsSchema.parse({casterDefinition:'unit.ants.nectarist',relationship:'ally',targetHealth:1000,mana:1000,distance:12}));const t=f.game.context.get(f.target!)!;t.hp=200;return {...f,t};}
it('delivers healing on arrival, spends mana once and restores an in-flight heal deterministically',()=>{
 const f=fixture(),c=f.game.context.get(f.caster)!,mana=c.abilities!.mana;
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();
 for(let i=0;i<12;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(f.t.hp).toBe(200);expect(f.game.state.spellDeliveries).toHaveLength(1);expect(c.abilities!.mana).toBeLessThan(mana);
 const b=fixture();b.game.restore(f.game.snapshot());
 for(let i=0;i<40;i++){f.game.tick(undefined,{passiveUnits:true});b.game.tick(undefined,{passiveUnits:true});}
 expect(f.t.hp).toBe(290);expect(f.game.checksum()).toBe(b.game.checksum());
});
it('rejects full-health allies and enemies, and caps healing at maximum health',()=>{
 const f=fixture();f.t.hp=500;
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).not.toBeNull();f.t.hp=490;
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();for(let i=0;i<60;i++)f.game.tick(undefined,{passiveUnits:true});expect(f.t.hp).toBe(500);
 const e=fixture();e.t.owner='player.2';expect(e.game.abilities.cast(e.caster,'preview',e.target!)).not.toBeNull();
});
it('autocasts on wounded allies from behind the front line',()=>{
 const g=game([placed('healer','unit.ants.nectarist',215,230),placed('ally','unit.ants.warrior',232,230)]);
 const t=g.entities.find(e=>e.placement==='ally')!,c=g.entities.find(e=>e.placement==='healer')!;t.hp=100;t.unit!.order={type:'hold'};c.unit!.order={type:'hold'};
 for(let i=0;i<100;i++)g.tick();expect(t.hp).toBeGreaterThanOrEqual(190);expect(c.x).toBe(215);
});
it('trains the Nectarist at barracks with heal and manual cleanse commands',()=>{
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;
 g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.nectarist'}).accepted).toBe(true);run(g,1050);
 const u=g.entities.find(e=>e.definition==='unit.ants.nectarist')!;expect(u).toBeDefined();expect(g.registry.get(u.definition).behaviors.abilities!.bindings.map(b=>b.ability)).toEqual(['ability.ants.nectar-mend','ability.ants.nectar-cleanse']);
});
it('cleanses a harmful snare without damaging the ally',()=>{
 const g=game([placed('healer','unit.ants.nectarist',215,230),placed('ally','unit.ants.warrior',224,230),{...placed('enemy','unit.ants.silkwarden',230,230),owner:'player.2'}]);
 const c=g.entities.find(e=>e.placement==='healer')!,t=g.entities.find(e=>e.placement==='ally')!,e=g.entities.find(e=>e.placement==='enemy')!;
 expect(g.abilities.cast(e.id,'silken-snare',t.id)).toBeNull();for(let i=0;i<40;i++)g.tick(undefined,{passiveUnits:true});expect(t.spellStatuses?.some(s=>s.status==='webbed')).toBe(true);
 const hp=t.hp;expect(g.abilities.cast(c.id,'nectar-cleanse',t.id)).toBeNull();for(let i=0;i<40;i++)g.tick(undefined,{passiveUnits:true});expect(t.spellStatuses?.length??0).toBe(0);expect(t.hp).toBe(hp);
});
