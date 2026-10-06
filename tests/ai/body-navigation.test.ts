import {expect,it} from 'vitest';
import {game,placed} from '../game/helpers';
import {Frame,Geography,ObservedBlockers} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {ObservedNavigation} from '../../src/sim/ai/observedNavigation';
import {WalkSurfaces} from '../../src/shared/map/walkSurfaces';
import type {MapBriefing} from '../../src/sim/ai/briefing';

const flat=(size=96):MapBriefing=>({size,fingerprint:'test',heights:Array(size*size).fill(0),land:Array(size*size).fill(1),surfaces:[],starts:[],camps:[],resources:[]});
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
 const g=game(entities),geo=new Geography(createMapBriefing(g.map,g.registry)),cache=new ObservedBlockers();g.tick();
 const make=()=>new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick,cache),f=make();
 const hero=f.own.find(e=>e.definition==='unit.ants.marshal')!,actor=g.context.get(hero.id)!;
 const trapped={x:129,y:73};expect(g.spatial.unitWalkable(trapped,actor)).toBe(true);
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
