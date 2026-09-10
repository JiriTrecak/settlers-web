import type { EntityView } from '../../sim/game/observation';
import { ownerSlot } from '../../content/schema';
import { PLAYER_COLORS } from '../../shared/player/player';

/** Footprints follow simulation quarter-turn occupancy, with a one-pixel floor. */
export function footprintPixels(footprint: {width:number;depth:number}, rotation:number, mapSize:number, pixels:number): [number,number] {
  const swap = Math.abs(Math.round(rotation / 90) % 2) === 1;
  return [Math.max(1,(swap?footprint.depth:footprint.width)*pixels/mapSize),Math.max(1,(swap?footprint.width:footprint.depth)*pixels/mapSize)];
}
export function entityMarker(entity: EntityView, definition: {id:string;kind:string;footprint?:{width:number;depth:number}}, mapSize:number, pixels:number) {
  if(entity.unit?.contained || definition.kind==='item') return null;
  const amber=definition.id==='building.neutral.amber-mine';
  if(entity.resource && (!amber || entity.resource.amount<=0)) return null;
  const owner=ownerSlot(entity.owner);
  const dimensions=definition.kind==='building'&&definition.footprint
    ? footprintPixels(definition.footprint,entity.rotation,mapSize,pixels)
    : [2,2];
  const faction=PLAYER_COLORS[owner%PLAYER_COLORS.length]??0;
  // Lift faction luminance on muted terrain without changing model materials.
  const bright=(channel:number)=>Math.min(255,Math.round(channel*1.4));
  const playerColor=(bright(faction>>16)<<16)|(bright((faction>>8)&255)<<8)|bright(faction&255);
  const color=amber?0xffd43b:owner<0?0xa99c78:playerColor;
  return {width:dimensions[0]!,height:dimensions[1]!,fill:'#'+color.toString(16).padStart(6,'0'),alpha:entity.remembered?0.5:1};
}
