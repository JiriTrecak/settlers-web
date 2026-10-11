import {content} from '../../content/builtin';
import {raceDefinition} from '../../content/races';
import {startingUnits,startingUnitPosition,startingFormationRotation} from '../../content/startingHero';
import type {Placement} from '../../content/schema';
import {footprintHalfExtents} from './resourceClearance';
import type {PlayerStart} from './utcmap';
/** Reserve the complete formation for every race and selectable hero. */
export function startingArea(start:PlayerStart,resources:readonly Placement[]=[]){
 const setups=Object.keys(content.rules.races).map(race=>raceDefinition(content.rules,race).startingSetup);
 if(!setups.length)setups.push(content.rules.startingSetup);
 const areas=setups.map(setup=>{
  const half=footprintHalfExtents(content.get(setup.fort).footprint,start.rotation??0);
  const facing={...start,rotation:startingFormationRotation(start,setup,resources,content)};
  const formation=setup.hero?setup.hero.choices.flatMap(hero=>startingUnits(setup,hero)):setup.units;
  const positions=formation.map(u=>({...startingUnitPosition(facing,u.offset),radius:content.get(u.definition).dimensions!.radius}));
  return {
   minX:Math.floor(Math.min(start.x-half.x,...positions.map(p=>p.x-p.radius))),
   maxX:Math.ceil(Math.max(start.x+half.x,...positions.map(p=>p.x+p.radius))),
   minZ:Math.floor(Math.min(start.z-half.y,...positions.map(p=>p.y-p.radius))),
   maxZ:Math.ceil(Math.max(start.z+half.y,...positions.map(p=>p.y+p.radius))),
  };
 });
 return {minX:Math.min(...areas.map(a=>a.minX)),maxX:Math.max(...areas.map(a=>a.maxX)),minZ:Math.min(...areas.map(a=>a.minZ)),maxZ:Math.max(...areas.map(a=>a.maxZ))};
}
