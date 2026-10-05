import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {Frame,Geography,ObservedBlockers,footprint,integerPoint} from '../../src/sim/ai/frame';
import {resourceCollisionCells} from '../../src/shared/map/resourceClearance';
import type {EntityView,SettlementView} from '../../src/sim/game/observation';

it('updates only changed known footprints, preserves overlaps and old frames, and matches full reconstruction',()=>{
 const geo=new Geography(createMapBriefing(emptyUtcMap(),content)),cache=new ObservedBlockers();
 const entities:EntityView[]=Array.from({length:100},(_,i)=>({id:i+1,definition:'resource.forest.tree',owner:'none',x:50+i%10*3,y:50+Math.floor(i/10)*3,rotation:0,hp:null,resource:{amount:10}} as EntityView));
 const view:SettlementView={revision:0,outcome:null,events:[],objectives:{},entities};
 const frame=()=>new Frame(view,'player.1',content,geo,0,cache);
 const oracle=(f:Frame)=>{
  const result=new Set<number>();
  for(const e of entities){const d=f.def(e),p=integerPoint(e);
   const cells=d.kind==='building'?footprint(d,p,e.rotation):e.resource&&e.resource.amount>0?resourceCollisionCells(p,d.footprint,d.collisionRadius,e.appearance?.scale??1,e.rotation):[];
   for(const p of cells)if(geo.inside(p))result.add(geo.index(p));
  }return result;
 };
 const initial=frame().blocked,initialCells=new Set(initial);
 expect(cache.work.rebuilt).toBe(100);expect(frame().blocked).toBe(initial);expect(cache.work.rebuilt).toBe(0);
 for(let i=0;i<40;i++){
  const e=entities[i%entities.length]!;
  switch(i%6){
   case 0:e.x=entities.at(-1)!.x;e.y=entities.at(-1)!.y;break;
   case 1:e.resource!.amount=0;break;
   case 2:e.appearance={scale:2};break;
   case 3:e.definition='building.ants.fort';e.rotation=90;break;
   case 4:entities.splice(i%entities.length,1);break;
   case 5:e.remembered=true;break;
  }
  const f=frame();expect(f.blocked).toEqual(oracle(f));expect(cache.work.rebuilt).toBeLessThanOrEqual(1);
  expect(initial).toEqual(initialCells);
 }
 // Reappearing/depleted scenery and a fresh controller must agree with warm caches.
 entities[0]!.resource!.amount=8;
 expect(frame().blocked).toEqual(new Frame(view,'player.1',content,geo,0).blocked);
});
