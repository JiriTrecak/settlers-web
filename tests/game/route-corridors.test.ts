import {expect,it,vi} from 'vitest';
import {RouteCorridors} from '../../src/sim/game/routeCorridors';
import {fixed,precise} from '../../src/sim/game/motion';
import {game,worker,placed} from './helpers';

const point=(cell:number)=>({x:cell*1000,y:0});
it('adapts destinations, owns route copies and checks every segment including the new start',()=>{
 const pool=new RouteCorridors(),route=[20,80];
 pool.remember('body',point(0),point(80),route);route[0]=900;
 const clear=vi.fn(()=>true),result=pool.find('body',point(1),point(84),84,point,clear)!;
 expect(result).toEqual([20,84]);
 expect(clear).toHaveBeenCalledWith(point(1),point(20));
 expect(clear).toHaveBeenCalledWith(point(20),point(84));
 result[0]=900;
 expect(pool.find('body',point(1),point(84),84,point,()=>true)).toEqual([20,84]);
 expect(pool.find('body',point(1),point(84),84,point,(a)=>a.x!==1000)).toBeNull();
 expect(pool.find('body',point(1),point(84),84,point,(_a,b)=>b.x!==84000)).toBeNull();
});

it('rejects incompatible bodies/owners, distant groups, short trips and excessive detours',()=>{
 const pool=new RouteCorridors();pool.remember('body',point(0),point(80),[20,80]);
 for(const [key,from,target] of [['other',0,80],['body',17,80],['body',0,89],['body',0,8]] as const)
  expect(pool.find(key,point(from),point(target),target,point,()=>true)).toBeNull();
 const winding=new RouteCorridors();winding.remember('body',point(0),point(80),[100,20,80]);
 expect(winding.find('body',point(0),point(80),80,point,()=>true)).toBeNull();
});

function scenario(){
 const g=game(),e=worker(g),sp=g.spatial,destination={x:220,y:200};
 e.x=20;e.y=21;e.unit!.position={x:20006,y:20869};
 e.unit!.order={type:'move',destination,attackMove:false};
 for(let y=0;y<=180;y++)sp.occupied[y*sp.size+105]=999;
 return {g,e,sp,destination};
}

it('reuses an actual obstacle corridor only within the pass, including exception cleanup',()=>{
 const {e,sp,destination}=scenario(),search=vi.spyOn(sp,'findPath');
 const check=()=>{let anchor=e.unit!.position!;for(const cell of e.unit!.route){const next=fixed(sp.point(cell));expect(sp.clearSegment(anchor,next,undefined,e)).toBe(true);anchor=next;}};
 sp.sharedRoutes(()=>{
  expect(sp.route(e,destination,false)).toBe(true);check();
  expect(search).toHaveBeenCalledTimes(1);
  expect(sp.route(e,{x:221,y:200},false)).toBe(true);check();
  expect(search).toHaveBeenCalledTimes(1);
 });
 expect(sp.route(e,destination,false)).toBe(true);expect(search).toHaveBeenCalledTimes(2);
 expect(()=>sp.sharedRoutes(()=>{expect(sp.route(e,destination,false)).toBe(true);throw Error('interrupted');})).toThrow('interrupted');
 expect(sp.route(e,destination,false)).toBe(true);expect(search).toHaveBeenCalledTimes(4);
});

it('does not reuse terrain-only corridors for traffic avoidance, cost budgets or a blocked destination',()=>{
 const {e,sp,destination}=scenario(),search=vi.spyOn(sp,'findPath');
 sp.sharedRoutes(()=>{
  expect(sp.route(e,destination,false)).toBe(true);
  search.mockClear();sp.route(e,destination,true);expect(search).toHaveBeenCalled();
  search.mockClear();sp.route(e,destination,false,1000);expect(search).toHaveBeenCalled();
  sp.occupied[sp.cell(destination)]=999;
  expect(sp.route(e,destination,false)).toBe(false);
 });
});

it('moves a group around terrain without overlap and replays identically after a cold restore',()=>{
 const placements=Array.from({length:8},(_,i)=>placed(`army-${i}`,'unit.ants.warrior',40+i%2*3,74+Math.floor(i/2)*3));
 // Direct fixture terrain edits must invalidate the mesh prepared at load.
 const terrain=(g:ReturnType<typeof game>)=>{for(let y=62;y<=95;y++)g.spatial.terrain[y*g.spatial.size+75]=0;g.spatial.rebuild();};
 const g=game(placements),replica=game(placements);terrain(g);terrain(replica);
 const army=g.entities.filter(e=>e.placement?.startsWith('army-')),ids=army.map(e=>e.id);
 for(const world of [g,replica])expect(world.command('player.1',{type:'move',actors:ids,destination:{x:130,y:82}}).accepted).toBe(true);
 const share=vi.spyOn(RouteCorridors.prototype,'find');let reused=false;
 for(let tick=0;tick<1000;tick++){
  if(tick===100){replica.restore(g.snapshot());terrain(replica);}
  const before=army.map(e=>fixed(precise(e)));
  g.tick();replica.tick();expect(g.checksum()).toBe(replica.checksum());
  for(let i=0;i<army.length;i++){
   expect(g.spatial.clearSegment(before[i],fixed(precise(army[i])),undefined,army[i])).toBe(true);
   for(let j=0;j<i;j++)expect(Math.hypot(precise(army[i]).x-precise(army[j]).x,precise(army[i]).y-precise(army[j]).y))
    .toBeGreaterThanOrEqual(g.spatial.unitRadius*2/1000-.001);
  }
  reused ||= share.mock.results.some(result=>result.type==='return'&&result.value!==null);
  share.mockClear();
 }
 share.mockRestore();
 expect(reused).toBe(true);expect(army.every(e=>e.unit!.order===null)).toBe(true);
 for(const e of army)expect(e.x).toBeGreaterThan(120);
},20000);
