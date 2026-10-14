import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {raceDefinition} from '../../src/content/races';
import {startingUnits} from '../../src/content/startingHero';

// Content validation over whatever races ship: every starting company, with every
// selectable hero, stands clear of its hall footprint and the hall entrance lies outside it.
for(const race of Object.keys(content.rules.races).length?Object.keys(content.rules.races):[undefined]){
 it(`${race??'default'} starting company stands clear of its hall footprint`,()=>{
  const setup=raceDefinition(content.rules,race).startingSetup,hall=content.get(setup.fort);
  const half=hall.footprint!.depth/2;
  expect(Math.abs(hall.entrance!.y)).toBeGreaterThan(half);
  for(const hero of setup.hero?.choices??[undefined])for(const unit of startingUnits(setup,hero)){
   const {radius}=content.get(unit.definition).dimensions!;
   expect(Math.max(Math.abs(unit.offset.x),Math.abs(unit.offset.y))-radius,unit.definition).toBeGreaterThan(half);
  }
 });
}
