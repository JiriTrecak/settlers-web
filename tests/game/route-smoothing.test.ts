import {expect,it,vi} from 'vitest';
import {farthestClearWaypoint} from '../../src/sim/game/routeSmoothing';
import {game,worker} from './helpers';
import {fixed} from '../../src/sim/game/motion';

it('checks long straight corridors in logarithmic work',()=>{
 const probes:number[]=[];
 expect(farthestClearWaypoint(0,4095,index=>{probes.push(index);return true;})).toBe(4095);
 expect(probes.length).toBeLessThanOrEqual(13);
 expect(probes.at(-1)).toBe(4095);
});

it('only returns checked shortcuts even when visibility is not monotonic',()=>{
 for(let mask=0;mask<1024;mask++){
  const calls=new Set<number>();
  const clear=(index:number)=>!!(mask&(1<<(index-1)));
  const result=farthestClearWaypoint(4,14,index=>{calls.add(index);return clear(index-4);});
  expect(result).toBeGreaterThanOrEqual(4);expect(result).toBeLessThanOrEqual(14);
  if(result!==4){expect(calls.has(result)).toBe(true);expect(clear(result-4)).toBe(true);}
 }
 expect(farthestClearWaypoint(7,7,()=>{throw Error('No query needed');})).toBe(7);
 expect(farthestClearWaypoint(0,100,()=>false)).toBe(0);
});

it('smooths a long interrupted movement order without hundreds of long sweeps',()=>{
 const g=game(),actor=worker(g),spatial=g.spatial;
 actor.x=20;actor.y=21;actor.unit!.position={x:20006,y:20869};
 for(let y=0;y<=180;y++)spatial.occupied[y*spatial.size+105]=999;
 const destination={x:220,y:200},clear=spatial.clearSegment.bind(spatial);
 let longQueries=0;
 const spy=vi.spyOn(spatial,'clearSegment').mockImplementation((from,to,...rest)=>{
  if(Math.hypot(to.x-from.x,to.y-from.y)>5000)longQueries++;
  return clear(from,to,...rest);
 });
 expect(spatial.route(actor,destination,false)).toBe(true);
 expect(longQueries).toBeLessThan(60);
 spy.mockRestore();
 expect(actor.unit!.route.length).toBeGreaterThan(1);
 expect(actor.unit!.route.at(-1)).toBe(spatial.cell(destination));
 let anchor=actor.unit!.position;
 for(const node of actor.unit!.route){const next=fixed(spatial.point(node));expect(clear(anchor,next,undefined,actor)).toBe(true);anchor=next;}
});
