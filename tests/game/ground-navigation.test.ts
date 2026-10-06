import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed} from '../../src/sim/game/motion';

it('uses the live mesh for long orders and preserves every adjacent collision step',()=>{
 const g=game([placed('obstacle','building.ants.house',110,110)]),s=g.spatial;
 const start=s.cell({x:70,y:110}),goal=s.cell({x:150,y:110}),path=s.findPath(start,goal)!;
 expect(s.routing.meshAccepted).toBe(1);expect(s.routing.searches).toBe(0);
 expect(path.at(-1)).toBe(goal);
 let previous=start;
 for(const id of path){
  expect(Math.max(Math.abs(s.point(id).x-s.point(previous).x),Math.abs(s.point(id).y-s.point(previous).y))).toBe(1);
  expect(s.clearSegment(fixed(s.point(previous)),fixed(s.point(id)))).toBe(true);previous=id;
 }
});

it('changes only nearby tiles after placement/removal and matches a rebuilt replica',()=>{
 const live=game(),replica=game(),a={x:70,y:110},b={x:150,y:110};
 const route=(g:ReturnType<typeof game>)=>g.spatial.findPath(g.spatial.cell(a),g.spatial.cell(b));
 expect(route(live)).toEqual(route(replica));
 const before=live.spatial.routing.meshRebuiltTiles;
 const obstacle=live.context.create(placed('obstacle','building.ants.house',110,110));live.spatial.appendOccupancy(obstacle);
 replica.context.create(placed('obstacle','building.ants.house',110,110));replica.spatial.rebuild();
 expect(route(live)).toEqual(route(replica));
 expect(live.spatial.routing.meshRebuiltTiles-before).toBeGreaterThan(0);
 expect(live.spatial.routing.meshRebuiltTiles-before).toBeLessThanOrEqual(4);
 live.context.remove(obstacle);live.spatial.refreshAfterRemoval(obstacle.id);
 const other=replica.entities.find(e=>e.placement==='obstacle')!;replica.context.remove(other);replica.spatial.rebuild();
 expect(route(live)).toEqual(route(replica));
});

it('honors cost bounds and temporary blockers without putting them into the static mesh',()=>{
 const g=game(),s=g.spatial,a={x:60,y:90},b={x:100,y:90},start=s.cell(a),goal=s.cell(b);
 expect(s.findPath(start,goal,undefined,39_999)).toBeNull();
 const before=s.routing.meshRebuiltTiles;
 const blocked=new Set([s.cell({x:80,y:90})]),path=s.findPath(start,goal,blocked)!;
 expect(path).not.toContain([...blocked][0]);expect(path.at(-1)).toBe(goal);
 expect(s.routing.meshRebuiltTiles).toBe(before);
 expect(s.findPath(start,goal)).toContain([...blocked][0]);
});

it('invalidates both mesh and fallback caches after an explicit terrain rebuild',()=>{
 const g=game(),s=g.spatial,start=s.cell({x:60,y:90}),goal=s.cell({x:100,y:90});
 expect(s.findPath(start,goal)).not.toBeNull();expect(s.findGridPath(start,goal)).not.toBeNull();
 for(let y=0;y<s.size;y++)s.terrain[y*s.size+80]=0;
 s.rebuild();expect(s.findPath(start,goal)).toBeNull();expect(s.findGridPath(start,goal)).toBeNull();
});

it('keeps cold and warm replicas identical through orders, obstacle edits and restore',()=>{
 const placements=[placed('walker','unit.ants.warrior',60,90),placed('obstacle','building.ants.house',110,90)];
 const live=game(placements),replica=game(placements);
 const move=(g:ReturnType<typeof game>,x:number,y:number)=>{
  const e=g.entities.find(e=>e.placement==='walker')!;
  expect(g.command(e.owner,{type:'move',actors:[e.id],destination:{x,y}}).accepted).toBe(true);
 };
 // Different non-authoritative query histories must not change tie breaking.
 for(let i=0;i<12;i++)live.spatial.findPath(live.spatial.cell({x:70,y:70+i}),live.spatial.cell({x:160,y:115}));
 for(const g of [live,replica])move(g,160,90);
 for(let tick=0;tick<240;tick++){
  if(tick===60){
   for(const g of [live,replica]){const e=g.context.create(placed('new','building.ants.house',135,90));g.spatial.appendOccupancy(e);}
  }
  if(tick===100)replica.restore(JSON.parse(JSON.stringify(live.snapshot())));
  if(tick===110)for(const g of [live,replica])move(g,160,100);
  live.tick();replica.tick();
  if(tick%30===0)expect(live.checksum('full')).toBe(replica.checksum('full'));
 }
 expect(live.snapshot()).toEqual(replica.snapshot());
 expect(live.spatial.routing.meshAccepted).toBeGreaterThan(0);
});

it('retains the optimized mesh and warm cache for each declared body radius',()=>{
 const g=game(),s=g.spatial,start=s.cell({x:60,y:90}),goal=s.cell({x:140,y:90});
 for(const radius of [1.5,2,2.5]){
  const body={radius,height:4.8,formationSpacing:radius*2+.25},before=s.routing.meshAccepted;
  const path=s.findPath(start,goal,undefined,Infinity,body)!;
  expect(path.at(-1)).toBe(goal);expect(s.routing.meshAccepted).toBe(before+1);
  let previous=start;
  for(const id of path){expect(s.clearSegment(fixed(s.point(previous)),fixed(s.point(id)),undefined,body)).toBe(true);previous=id;}
  const tiles=s.routing.meshRebuiltTiles;
  expect(s.findPath(start,goal,undefined,Infinity,body)).toEqual(path);
  expect(s.routing.meshRebuiltTiles).toBe(tiles);
 }
});
