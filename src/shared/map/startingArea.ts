import {content} from '../../content/builtin';
import {startingUnits,startingUnitPosition} from '../../content/startingHero';
import {footprintHalfExtents} from './resourceClearance';
import type {PlayerStart} from './utcmap';
/** Full starting formation, including every selectable hero's body. */
export function startingArea(start:PlayerStart){
 const setup=content.rules.startingSetup,half=footprintHalfExtents(content.get(setup.fort).footprint,start.rotation??0);
 const formation=setup.hero?setup.hero.choices.flatMap(hero=>startingUnits(setup,hero)):setup.units;
 const positions=formation.map(u=>({...startingUnitPosition(start,u.offset),radius:content.get(u.definition).dimensions!.radius}));
 return {
  minX:Math.floor(Math.min(start.x-half.x,...positions.map(p=>p.x-p.radius))),
  maxX:Math.ceil(Math.max(start.x+half.x,...positions.map(p=>p.x+p.radius))),
  minZ:Math.floor(Math.min(start.z-half.y,...positions.map(p=>p.y-p.radius))),
  maxZ:Math.ceil(Math.max(start.z+half.y,...positions.map(p=>p.y+p.radius))),
 };
}
