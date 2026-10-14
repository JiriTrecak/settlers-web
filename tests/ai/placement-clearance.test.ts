import {expect,it} from 'vitest';
import {game,placed} from '../game/helpers';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import type {EntityView} from '../../src/sim/game/observation';

const MINE='building.test.neutral-amber-mine';
/** AI placement keeps the declared construction clearance around observed resource deposits. */
it('rejects foundations inside an observed resource construction clearance and re-evaluates each observation',()=>{
 const g=game([placed('hall','building.test.fort',129.5,129.5),placed('worker','unit.test.settler',105,140),
  {...placed('resource',MINE,172.5,149.5),owner:'none'}]);
 g.tick();
 const geo=new Geography(createMapBriefing(g.map,g.registry)),house=g.registry.get('building.test.house');
 expect(g.registry.get(MINE).constructionClearance).toBeGreaterThan(0);
 const frame=(edit:(mine:EntityView)=>EntityView=m=>m)=>{
  const view=g.view('player.1');
  view.fog={...view.fog!,cells:new Uint8Array(g.map.size*g.map.size).fill(2)};
  view.entities=view.entities.map(e=>e.definition===MINE?edit(e):e);
  return new Frame(view,'player.1',g.registry,geo,g.state.tick);
 };
 // The candidate at x=167.5 does not overlap the mine footprint, only its clearance buffer.
 const inside={x:167.5,y:147.5},outside={x:163.5,y:147.5};
 const observed=frame();
 expect(observed.placeable(house,outside,0)).toBe(true);
 expect(observed.placeable(house,inside,0)).toBe(false);
 // A newer observation of the deposit elsewhere releases the old buffer.
 expect(frame(m=>({...m,x:m.x+40})).placeable(house,inside,0)).toBe(true);
 // A depleted deposit no longer reserves construction clearance.
 expect(frame(m=>({...m,resource:{...m.resource!,amount:0}})).placeable(house,inside,0)).toBe(true);
});
