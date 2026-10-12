import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {game,placed,run} from '../game/helpers';
import {heading} from '../../src/sim/game/facing';
const a=coreAbilities.abilities.find(a=>a.id==='ability.ants.silken-snare')!;
const p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
function fixture(mode:'ground'|'air'='ground'){
 return createAbilityEncounter(a,p,encounterSettingsSchema.parse({casterDefinition:'unit.ants.silkwarden',relationship:'enemy',targetLocomotion:mode,distance:10,targetHealth:1000,mana:1000}));
}
it.each(['ground','air'] as const)('binds %s targets only on projectile arrival and restores locomotion after expiry',mode=>{
 const f=fixture(mode),t=f.game.context.get(f.target!)!;
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();
 for(let i=0;i<10;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(f.game.state.spellDeliveries).toHaveLength(1);expect(t.spellStatuses?.some(s=>s.status==='webbed')??false).toBe(false);
 for(let i=0;i<30;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(t.spellStatuses?.some(s=>s.status==='webbed')).toBe(true);expect(f.game.spatial.airborne(t)).toBe(false);
 const other=fixture(mode);other.game.restore(f.game.snapshot());
 for(let i=0;i<180;i++){f.game.tick(undefined,{passiveUnits:true});other.game.tick(undefined,{passiveUnits:true});}
 expect(t.spellStatuses?.some(s=>s.status==='webbed')??false).toBe(false);
 expect(f.game.spatial.airborne(t)).toBe(mode==='air');expect(f.game.checksum()).toBe(other.game.checksum());
});
it('trains the declared Silkwarden from barracks with its actual snare binding',()=>{
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;
 g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.silkwarden'}).accepted).toBe(true);
 run(g,1050);const unit=g.entities.find(e=>e.definition==='unit.ants.silkwarden');expect(unit).toBeDefined();
 expect(g.registry.get(unit!.definition).behaviors.abilities!.bindings[0].ability).toBe(a.id);expect(a.autocast?.enabledByDefault).toBe(true);
});
it('releases a real basic silk missile and applies damage only at contact',()=>{
 const g=game([placed('caster','unit.ants.silkwarden',220,230),{...placed('enemy','unit.ants.warrior',232,230),owner:'player.2'}]);
 const c=g.entities.find(e=>e.placement==='caster')!,t=g.entities.find(e=>e.placement==='enemy')!,hp=t.hp;
 c.rotation=heading(c,t);c.unit!.target=t.id;g.combat.resolve();g.state.tick=c.unit!.attack!.impact;g.combat.resolve();
 expect(g.state.missiles).toHaveLength(1);expect(t.hp).toBe(hp);
 g.state.tick=g.state.missiles[0].impact;g.combat.resolve();expect(t.hp).toBeLessThan(hp!);
});
it('autocasts from normal ranged-attack distance without closing into melee',()=>{
 const g=game([placed('caster','unit.ants.silkwarden',215,230),{...placed('enemy','unit.ants.warrior',232,230),owner:'player.2'}]);
 const c=g.entities.find(e=>e.placement==='caster')!,t=g.entities.find(e=>e.placement==='enemy')!;t.unit!.order={type:'hold'};
 let launched=false,bound=false;
 for(let i=0;i<100;i++){g.tick();launched ||= g.state.spellDeliveries.some(d=>d.source===c.id&&d.ability===a.id);bound ||= t.spellStatuses?.some(s=>s.status==='webbed')??false;}
 expect(launched).toBe(true);expect(bound).toBe(true);
});
it('uses the shorter two-second root on heroes',()=>{
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({casterDefinition:'unit.ants.silkwarden',relationship:'enemy',targetHero:true,distance:10,targetHealth:1000,mana:1000}));
 const t=f.game.context.get(f.target!)!;expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();
 let applied=0,expired=0;
 for(let i=0;i<180;i++){
  f.game.tick(undefined,{passiveUnits:true});const active=t.spellStatuses?.some(s=>s.status==='webbed');
  if(active&&!applied)applied=f.game.state.tick;
  if(applied&&!active){expired=f.game.state.tick;break;}
 }
 expect(applied).toBeGreaterThan(10);expect(expired-applied).toBe(80);
});
