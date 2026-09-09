import {fixed} from './motion';
import type {GameContext} from './context';
import type {Point} from './state';

/** Stable nearest-first placement; cosmetic separation must never reroll loot. */
export function dropPosition(c:GameContext,origin:Point,except?:number):Point {
 const items=c.state.entities.filter(e=>e.item);
 for(let radius=0;radius<=6;radius++){
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   if(Math.abs(dx)+Math.abs(dy)!==radius)continue;
   const p={x:origin.x+dx,y:origin.y+dy};
   if(c.spatial.free(p,except)&&c.spatial.clearSegment(fixed(origin),fixed(p))&&!items.some(e=>(e.x-p.x)**2+(e.y-p.y)**2<4))return p;
  }
 }
 // A completely crowded death site must still preserve every earned item.
 return {x:origin.x,y:origin.y};
}
