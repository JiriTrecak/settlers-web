import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import type {AbilityHost} from '../../src/sim/abilities/runtime';
import {precise} from '../../src/sim/game/motion';
import {snapPlacement} from '../../src/shared/spatial/placement';

function fixture(id='ability.marshal.rally',air=false){
 const spell=coreAbilities.abilities.find(a=>a.id===id)!;
 const presentation=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({
  relationship:spell.targeting.relations.includes('ally')?'ally':'enemy',
  distance:6,targetCount:3,targetSpacing:2,targetHealth:200,combat:false,targetLocomotion:air?'air':'ground',
 }));
 const far=f.game.context.create({id:'far',definition:'unit.ants.warrior',owner:'player.2',position:{x:220,y:220},rotation:0});
 const host=(f.game.abilities as unknown as {host:AbilityHost}).host;
 return {...f,host,far,spell};
}

it('matches full actor distances, including precise boundaries, buildings, death and live changes',()=>{
 const f=fixture(),c=f.game.context,center=precise(c.get(f.caster)!);
 const position=snapPlacement(c.registry.get('building.ants.house'),{x:center.x+5,y:center.y});
 const building=c.create({id:'near-building',definition:'building.ants.house',owner:'player.2',position,rotation:0});
 const target=c.get(f.target)!;
 const check=(radius:number)=>{
  const expected=f.host.targets!().map(id=>f.host.get(id)!).filter(a=>(a.x-center.x)**2+(a.y-center.y)**2<=radius**2).map(a=>a.id);
  expect(f.host.targetsInRadius!(center,radius)).toEqual(expected);
 };
 target.x=center.x+10;target.y=center.y;target.unit!.position=null;
 check(10);expect(f.host.targetsInRadius!(center,10)).toContain(target.id);
 expect(f.host.targetsInRadius!(center,10)).toContain(building.id);
 target.unit!.position={x:(center.x+10)*1000+1,y:center.y*1000};
 check(10);expect(f.host.targetsInRadius!(center,10)).not.toContain(target.id);
 target.unit!.position.x=(center.x+10)*1000-1;check(10);
 target.hp=0;check(10);expect(f.host.targetsInRadius!(center,10)).not.toContain(target.id);
 c.remove(building);check(10);check(0);check(1000);
 const added=c.create({id:'new-body',definition:'unit.ants.warrior',owner:'player.1',position:center,rotation:0});
 check(0);expect(f.host.targetsInRadius!(center,0)).toContain(added.id);
});

it('does not materialize distant aura actors or reject recipients by owner before spell filtering',()=>{
 const f=fixture(),get=vi.spyOn(f.host,'get');
 f.game.abilities.tick();
 expect(get.mock.calls.some(([id])=>id===f.far.id)).toBe(false);
 expect(f.game.context.get(f.target)!.spellStatuses?.some(s=>s.ability===f.spell.id)).toBe(true);
 f.far.x=120;f.far.y=120;f.far.unit!.position=null;
 expect(f.host.targetsInRadius!({x:120,y:120},1)).toContain(f.far.id);
});

it.each(['ability.marshal.rally','ability.core.chain-lightning','ability.core.healing-wave','ability.core.shockwave'])(
 '%s matches unfiltered actor enumeration for ground and flying targets',id=>{
 for(const air of [false,true]){
  const fast=fixture(id,air),reference=fixture(id,air);
  delete reference.host.targetsInRadius;
  for(const f of [fast,reference])if(f.spell.activation!=='passive'){
   const aim=f.spell.targeting.kind==='self'?f.caster:f.spell.targeting.kind==='point'?precise(f.game.context.get(f.target)!):f.target;
   expect(f.game.abilities.cast(f.caster,'preview',aim)).toBeNull();
  }
  for(let tick=0;tick<80;tick++){
   for(const f of [fast,reference]){
    if(tick===30){f.far.x=124;f.far.y=120;f.far.unit!.position=null;}
    if(tick===50){f.far.x=220;f.far.y=220;f.far.unit!.position=null;}
    f.game.tick(undefined,{passiveUnits:true});
   }
   expect(fast.game.checksum('full'),`tick ${tick}`).toBe(reference.game.checksum('full'));
   expect(fast.game.abilities.observedEvents()).toEqual(reference.game.abilities.observedEvents());
  }
  expect(fast.game.snapshot()).toEqual(reference.game.snapshot());
 }
});
