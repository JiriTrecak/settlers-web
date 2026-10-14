import type {AuthoredDefinition} from '../../src/content/schema';
import {Navigation} from '../../src/sim/game/navigation';
import {expect,it,vi} from 'vitest';
import {game,placed} from '../game/helpers';
import {Frame,Geography,ObservedBlockers} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {ObservedNavigation} from '../../src/sim/ai/observedNavigation';
import {TerrainClearance} from '../../src/sim/game/terrainClearance';
import {WalkSurfaces} from '../../src/shared/map/walkSurfaces';
import type {MapBriefing} from '../../src/sim/ai/briefing';

const flat=(size=96):MapBriefing=>({size,fingerprint:'test',heights:Array(size*size).fill(0),land:Array(size*size).fill(1),surfaces:[],starts:[],camps:[],resources:[]});
it('matches exact sweeps with known blockers added and removed from long observed routes',()=>{
 const map={...flat(48),heights:Array<number>(48*48).fill(0)};
 for(let y=8;y<18;y++)for(let x=25;x<33;x++)map.heights[y*48+x]=400;
 const run=()=>{
  const nav=new ObservedNavigation(map,undefined),results:boolean[]=[];
  const wall=new Set(Array.from({length:48},(_,y)=>y*48+24));
  const gate=new Set(wall);for(let y=20;y<29;y++)gate.delete(y*48+24);
  for(const blocked of [new Set<number>(),wall,gate,new Set<number>()]){
   nav.update(blocked);
   for(const radius of [.2,.5,1.5,2.5])for(const from of [{x:5,y:24},{x:5.3,y:10.2}])
    for(const to of [{x:42,y:24},{x:36,y:12},{x:48,y:24},{x:9,y:24},{x:5,y:10}])
     results.push(nav.reachable({...from,radius,height:4.8,air:false},to));
   for(const radius of [.2,.5,1.5,2.5])for(const point of [{x:0,y:0},{x:23.5,y:24},{x:24.5,y:10},{x:32.5,y:17.5},{x:40.2,y:30.7}])
    results.push(nav.fits(point,{...point,radius,height:4.8,air:false}));
  }
  return results;
 };
 const optimized=run(),exact=vi.spyOn(TerrainClearance.prototype,'provesClear').mockReturnValue(false);
 try{expect(run()).toEqual(optimized);expect(exact).toHaveBeenCalled();}
 finally{exact.mockRestore();}
});
it('repairs the final approach to a legal shoreline destination without flooding the grid',()=>{
 const map=flat(32),nav=new ObservedNavigation(map,undefined),blocked=new Set([22*32+18]);
 const from={x:5,y:5,radius:1.5,height:4.8,air:false},to={x:20,y:20};
 nav.update(blocked);nav.prepare([from]);
 const spy=vi.spyOn(Navigation.prototype,'path');
 try{
  expect(nav.fits(to,from)).toBe(true);
  expect(nav.reachable(from,to)).toBe(true);expect(spy).not.toHaveBeenCalled();
  expect(nav.reachable({...from,...to},{x:from.x,y:from.y})).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  // Local blocker changes invalidate the answer; joins never replace the goal.
  nav.update(new Set([...blocked,20*32+20]));expect(nav.reachable(from,to)).toBe(false);
  const cold=new ObservedNavigation(map,undefined);cold.update(new Set([...blocked,20*32+20]));
  expect(cold.reachable(from,to)).toBe(false);
 }finally{spy.mockRestore();}
});
it('uses real body width, updates known blockers, and agrees with cold reconstruction',()=>{
 const map=flat(),nav=new ObservedNavigation(map,undefined),walls=new Set<number>();
 for(let y=0;y<96;y++)if(y<46||y>49)walls.add(y*96+48);
 const from={x:24,y:48,radius:1.5,height:4.8,air:false},to={x:72,y:48};
 nav.update(walls);expect(nav.reachable(from,to)).toBe(true);
 expect(nav.reachable({...from,radius:2.5},to)).toBe(false);
 const opened=new Set(walls);for(let y=44;y<=51;y++)opened.delete(y*96+48);
 nav.update(opened);expect(nav.reachable({...from,radius:2.5},to)).toBe(true);
 const cold=new ObservedNavigation(map,undefined);cold.update(opened);
 expect(cold.reachable({...from,radius:2.5},to)).toBe(nav.reachable({...from,radius:2.5},to));
 nav.update(walls);expect(nav.reachable({...from,radius:2.5},to)).toBe(false);
 expect(nav.reachable({...from,radius:2.5,air:true},to)).toBe(true);
});

it('selects a reachable hero retreat outside an enclosed home service pocket',()=>{
 const entities=[placed('hall','building.ants.fort',129.5,85.5),placed('barracks','building.ants.barracks',109.5,81.5),
  placed('mound.a','building.ants.house',147.5,71.5),placed('mound.b','building.ants.house',151.5,83.5),
  placed('sanctuary','building.ants.sanctuary',105.5,65.5),placed('hero','unit.ants.marshal',180,120),
  placed('observer','unit.ants.settler',129,68),
  ...[117.5,125.5,133.5,141.5].map((x,i)=>({...placed(`amber.${i}`,'building.neutral.amber-mine',x,61.5),owner:'none'}))];
 entities[0].rotation=180;entities[1].rotation=90;entities[2].rotation=entities[3].rotation=270;entities[4].rotation=90;
 // This enclosure is sized for a 2.4-cell body, independent of live hero balance.
 const g=game(entities,src=>{(src.definitions as AuthoredDefinition[]).find(d=>d.id==='unit.ants.marshal')!.dimensions={radius:2.4,height:4.8,formationSpacing:5.5};}),geo=new Geography(createMapBriefing(g.map,g.registry)),cache=new ObservedBlockers();g.tick();
 const make=()=>new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick,cache),f=make();
 const hero=f.own.find(e=>e.definition==='unit.ants.marshal')!,actor=g.context.get(hero.id)!;
 const trapped={x:129,y:73}; expect(g.spatial.unitWalkable(trapped,actor)).toBe(true);
 expect(g.spatial.findPath(g.spatial.cell(actor),g.spatial.cell(trapped),undefined,Infinity,actor)).toBeNull();
 const safe=f.nearestSafe(f.home,[hero]);expect(safe).not.toEqual(trapped);
 expect(g.spatial.route(actor,safe,false)).toBe(true);
 expect(Math.hypot(safe.x-f.home.x,safe.y-f.home.y)).toBeLessThan(24);
 const cold=new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick);
 expect(cold.nearestSafe(cold.home,[hero])).toEqual(safe);
 expect(make().nearestSafe(f.home,[hero])).toEqual(safe);
});

it('respects bridge portals, body width and under-deck headroom',()=>{
 const map={...flat(32),surfaces:[{id:'arch',level:1,connections:{start:0,end:0},x:16,z:16,c:1,s:0,base:0,width:5,depth:24,height:0,arch:5,thickness:.8}]};
 const layers=new WalkSurfaces(32,Int16Array.from(map.heights),Uint8Array.from(map.land),map.surfaces,200);
 const nav=new ObservedNavigation(map,layers),small={x:16,y:2,radius:1,height:2,air:false};
 expect(nav.reachable(small,{x:16,y:16,surface:'arch'})).toBe(true);
 expect(nav.reachable({...small,radius:3},{x:16,y:16,surface:'arch'})).toBe(false);
 expect(nav.fits({x:16,y:16},{...small,height:6})).toBe(false);
 expect(nav.fits({x:16,y:16},small)).toBe(true);
});

it.each([0,90,180,270])('reserves future large-unit service lanes when placing a base, rotation %i',rotation=>{
 const rotate=(x:number,y:number)=>{for(let i=0;i<rotation/90;i++)[x,y]=[259-y,x];return {x,y};};
 const hall=placed('hall','building.ants.fort',129.5,129.5);hall.rotation=rotation;
 const worker=placed('builder','unit.ants.settler',105,140),g=game([hall,worker]);g.tick();
 const view=g.view('player.1');view.fog={...view.fog!,cells:new Uint8Array(g.map.size*g.map.size).fill(2)};
 const f=new Frame(view,'player.1',g.registry,new Geography(createMapBriefing(g.map,g.registry)),g.state.tick),mound=g.registry.get('building.ants.house');
 // The larger bombardier is not trained yet. Its declared body still matters.
 expect(f.army.some(e=>e.definition==='unit.ants.bombardier')).toBe(false);
 expect(f.placeable(mound,rotate(147.5,131.5),rotation)).toBe(false);
 expect(f.placeable(mound,rotate(155.5,131.5),rotation)).toBe(true);
});

it('bounds repeated destination probing from an isolated origin and reopens it after blockers change',()=>{
 const map=flat(96),routes=new ObservedNavigation(map,undefined),wall=new Set(Array.from({length:96},(_,y)=>y*96+32));
 wall.delete(48*96+32); // point-sized opening; the real body still cannot pass
 routes.update(wall);const mover={x:12,y:48,radius:1.5,height:4.8,air:false};routes.prepare([mover]);
 const spy=vi.spyOn(Navigation.prototype,'path');
 try{
  for(let y=35;y<55;y++)for(let x=60;x<80;x++)expect(routes.reachable(mover,{x,y})).toBe(false);
  // The first unrestricted failure proves the entire origin side. No repeated A* floods.
  expect(spy.mock.calls.length).toBe(2);
  const opened=new Set(wall);for(let y=40;y<=56;y++)opened.delete(y*96+32);routes.update(opened);
  expect(routes.reachable(mover,{x:70,y:48})).toBe(true);
  const cold=new ObservedNavigation(map,undefined);cold.update(opened);
  expect(cold.reachable(mover,{x:70,y:48})).toBe(true);
 }finally{spy.mockRestore();}
});

it('rejects an obstructed squad origin once instead of searching every destination, and recovers after removal',()=>{
 const g=game([placed('hall','building.ants.fort',129.5,129.5),placed('hero','unit.ants.marshal',180,180)]);
 g.tick();
 const view=g.view('player.1'),hero=view.entities.find(e=>e.definition==='unit.ants.marshal')!;
 const hall=view.entities.find(e=>e.definition==='building.ants.fort')!;
 // Center is just outside the building; the larger body's edge overlaps it.
 hero.x=hall.x+g.registry.get(hall.definition).footprint!.width/2+1;hero.y=hall.y;
 const geo=new Geography(createMapBriefing(g.map,g.registry)),cache=new ObservedBlockers();
 const frame=new Frame(view,'player.1',g.registry,geo,g.state.tick,cache);
 const fit=vi.spyOn(ObservedNavigation.prototype,'fits'),reach=vi.spyOn(ObservedNavigation.prototype,'reachable');
 try{
  expect(frame.nearestSafe({x:200,y:200},[hero])).toEqual({x:Math.round(hero.x),y:Math.round(hero.y)});
  expect(fit).toHaveBeenCalledTimes(1);expect(reach).not.toHaveBeenCalled();
  const opened={...view,entities:view.entities.filter(e=>e.id!==hall.id)};
  const next=new Frame(opened,'player.1',g.registry,geo,g.state.tick+1,cache);
  expect(next.nearestSafe({x:200,y:200},[hero])).toEqual({x:200,y:200});
  expect(reach).toHaveBeenCalled();
 }finally{fit.mockRestore();reach.mockRestore();}
});
