import {expect,it} from 'vitest';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import type {AbilityHost} from '../../src/sim/abilities/runtime';
import {precise} from '../../src/sim/game/motion';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {testAbilities} from '../fixtures/content';
import {testSettings,encounterSource} from './encounter-harness';

function fixture(id='ability.test.vampiric-aura',air=false){
 const spell=testAbilities.abilities.find(a=>a.id===id)!;
 const presentation=testAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,presentation,testSettings({
  relationship:spell.targeting.relations.includes('ally')?'ally':'enemy',
  distance:6,targetCount:3,targetSpacing:2,targetHealth:200,combat:false,targetLocomotion:air?'air':'ground',
 }),false,encounterSource());
 const far=f.game.context.create({id:'far',definition:'unit.test.warrior',owner:'player.2',position:{x:220,y:220},rotation:0});
 const host=(f.game.abilities as unknown as {host:AbilityHost}).host;
 return {...f,host,far,spell};
}

it('matches full actor distances, including precise boundaries, buildings, death and live changes',()=>{
 const f=fixture(),c=f.game.context,center=precise(c.get(f.caster)!);
 const position=snapPlacement(c.registry.get('building.test.house'),{x:center.x+5,y:center.y});
 const building=c.create({id:'near-building',definition:'building.test.house',owner:'player.2',position,rotation:0});
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
 const added=c.create({id:'new-body',definition:'unit.test.warrior',owner:'player.1',position:center,rotation:0});
 check(0);expect(f.host.targetsInRadius!(center,0)).toContain(added.id);
});
