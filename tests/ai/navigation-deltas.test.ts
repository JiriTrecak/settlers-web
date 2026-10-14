import {expect,it} from 'vitest';
import {testContent} from '../fixtures/content';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {Frame,Geography,ObservedBlockers,footprint,integerPoint} from '../../src/sim/ai/frame';
import {resourceCollisionCells} from '../../src/shared/map/resourceClearance';
import {ObservedNavigation} from '../../src/sim/ai/observedNavigation';
import type {MapBriefing} from '../../src/sim/ai/briefing';
import type {EntityView,SettlementView} from '../../src/sim/game/observation';

const flat=(size=64):MapBriefing=>({size,fingerprint:'delta-test',heights:Array(size*size).fill(0),land:Array(size*size).fill(1),surfaces:[],starts:[{x:10,y:10}],camps:[],resources:[]});
const mover={x:10,y:32,radius:1.5,height:4.8,air:false};

it('applies a supplied cell delta and falls back safely for a stale baseline',()=>{
 const map=flat(),nav=new ObservedNavigation(map,undefined),wall=new Set(Array.from({length:64},(_,y)=>y*64+32));
 nav.update(wall);nav.prepare([mover]);expect(nav.reachable(mover,{x:54,y:32})).toBe(false);
 const gap=new Set(Array.from({length:9},(_,i)=>(28+i)*64+32));
 const opened=new Set([...wall].filter(cell=>!gap.has(cell)));
 nav.update(opened,{previous:wall,cells:gap});
 expect(nav.reachable(mover,{x:54,y:32})).toBe(true);
 // An incomplete change list from another baseline must not conceal this wall.
 nav.update(wall,{previous:new Set<number>(),cells:new Set<number>()});
 expect(nav.reachable(mover,{x:54,y:32})).toBe(false);
 const cold=new ObservedNavigation(map,undefined);cold.update(wall);
 for(const radius of [.2,1.5,3])expect(nav.reachable({...mover,radius},{x:54,y:32})).toBe(cold.reachable({...mover,radius},{x:54,y:32}));
});

it('accumulates changes across placement-only frames, overlapping blockers and old-frame queries',()=>{
 const map=flat(),geo=new Geography(map),cache=new ObservedBlockers();
 const tree=(id:number,x:number):EntityView=>({id,definition:'resource.test.forest-tree',owner:'none',x,y:32,rotation:0,hp:null,resource:{amount:10,growingUntil:null}});
 const entities=[tree(1,30),tree(2,30)];
 const view:SettlementView={revision:0,outcome:null,events:[],objectives:{},entities};
 const frame=()=>new Frame(view,'player.1',testContent,geo,0,cache);
 const initial=frame(),initialCells=new Set(initial.blocked);
 cache.routes(initial);
 const check=(f:Frame)=>{
  const routes=cache.routes(f),cold=new ObservedNavigation(map,undefined);cold.update(f.blocked);
  for(const radius of [.2,1.5,3])for(const x of [20,30,40,45,54]){
   expect(routes.fits({x,y:32},{...mover,radius})).toBe(cold.fits({x,y:32},{...mover,radius}));
   expect(routes.reachable({...mover,radius},{x,y:32})).toBe(cold.reachable({...mover,radius},{x,y:32}));
  }
 };
 entities[0]!.resource!.amount=0;
 expect(frame().blocked.has(32*64+30)).toBe(true); // Still covered by the second tree.
 entities[1]!.resource!.amount=0;
 expect(frame().blocked.has(32*64+30)).toBe(false);
 entities.push(tree(3,45));
 expect(frame().blocked.has(32*64+45)).toBe(true);
 check(frame());
 expect(initial.blocked).toEqual(initialCells);
 check(initial); // Retained snapshot forces full reconciliation.
 check(frame()); // Its delta baseline was deliberately invalidated.
 // Replacing a known blocker at the same footprint has no occupancy delta.
 entities.push(tree(4,45));entities.splice(2,1);
 check(frame());
 entities[2]!.x=42;
 void frame().blocked;
 entities[2]!.x=45;
 void frame().blocked;
 check(frame()); // Changes that cancel before navigation are harmless.
});

it('tracks changed known footprints, preserves overlaps and old frames, and matches full reconstruction',()=>{
 const geo=new Geography(createMapBriefing(emptyUtcMap(),testContent)),cache=new ObservedBlockers();
 const entities:EntityView[]=Array.from({length:100},(_,i)=>({id:i+1,definition:'resource.test.forest-tree',owner:'none',x:50+i%10*3,y:50+Math.floor(i/10)*3,rotation:0,hp:null,resource:{amount:10}} as EntityView));
 const view:SettlementView={revision:0,outcome:null,events:[],objectives:{},entities};
 const frame=()=>new Frame(view,'player.1',testContent,geo,0,cache);
 const oracle=(f:Frame)=>{
  const result=new Set<number>();
  for(const e of entities){const d=f.def(e),p=integerPoint(e);
   const cells=d.kind==='building'?footprint(d,p,e.rotation):e.resource&&e.resource.amount>0?resourceCollisionCells(p,d.footprint,d.collisionRadius,e.appearance?.scale??1,e.rotation):[];
   for(const p of cells)if(geo.inside(p))result.add(geo.index(p));
  }return result;
 };
 const initial=frame().blocked,initialCells=new Set(initial);
 for(let i=0;i<40;i++){
  const e=entities[i%entities.length]!;
  switch(i%6){
   case 0:e.x=entities.at(-1)!.x;e.y=entities.at(-1)!.y;break;
   case 1:e.resource!.amount=0;break;
   case 2:e.appearance={scale:2};break;
   case 3:e.definition='building.test.fort';e.rotation=90;break;
   case 4:entities.splice(i%entities.length,1);break;
   case 5:e.remembered=true;break;
  }
  const f=frame();expect(f.blocked).toEqual(oracle(f));
  expect(initial).toEqual(initialCells);
 }
 // Reappearing/depleted scenery and a fresh controller must agree with warm caches.
 entities[0]!.resource!.amount=8;
 expect(frame().blocked).toEqual(new Frame(view,'player.1',testContent,geo,0).blocked);
});
