import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {routeToAttack} from '../../src/sim/game/attackApproach';
import type {Entity,Point} from '../../src/sim/game/state';

/** Differential oracle for the previous filter-before-sort algorithm. Remove
 * invalid entries before ranking, instead of discovering validity on demand. */
function eagerGeometry(g:ReturnType<typeof game>,actor:()=>Entity,target:Entity){
 const store=g.spatial.approachPositions.set.bind(g.spatial.approachPositions);
 vi.spyOn(g.spatial.approachPositions,'set').mockImplementation((key,entries,bounds)=>{
  const mutable=entries as {point:Point;clear?:boolean}[],a=actor(),combat=g.context.def(a).behaviors.combat!;
  let kept=0;
  for(const entry of mutable)if(g.spatial.unitWalkable(entry.point,a)&&
   g.spatial.attackClear({...entry.point,elevation:g.spatial.elevation(a,entry.point)},target,!!(combat.projectile||combat.shell))){
    entry.clear=true;mutable[kept++]=entry;
   }
  mutable.length=kept;store(key,mutable,bounds);
 });
}

it('shares target terrain checks while retaining each attacker’s position and changing reservations',()=>{
 const placements=[placed('one','unit.ants.archer',100,110),placed('two','unit.ants.archer',101,110),
  {...placed('enemy','unit.ants.warrior',113,110),owner:'player.2'}];
 const cached=game(placements),reference=game(placements);
 const target=cached.entities.find(e=>e.placement==='enemy')!,otherTarget=reference.entities.find(e=>e.placement==='enemy')!;
 const check=vi.spyOn(cached.spatial,'attackClear');
 const eagerCheck=vi.spyOn(reference.spatial,'attackClear'),seen=new Set<string>();
 let eagerActor:Entity;eagerGeometry(reference,()=>eagerActor,otherTarget);
 for(const name of ['one','two']){
  const actor=cached.entities.find(e=>e.placement===name)!,other=reference.entities.find(e=>e.placement===name)!;
  eagerActor=other;
  actor.unit!.target=target.id;other.unit!.target=otherTarget.id;
  reference.spatial.approachPositions.clear();
  expect(routeToAttack(cached.context,actor,target)).toBe(routeToAttack(reference.context,other,otherTarget));
  expect(actor.unit).toEqual(other.unit);
  expect(check.mock.calls.length).toBeLessThan(eagerCheck.mock.calls.length/10);
  for(const [point] of check.mock.calls){const key=JSON.stringify(point);expect(seen.has(key)).toBe(false);seen.add(key);}
  check.mockClear();eagerCheck.mockClear();
 }
});

it('rejects traffic-blocked approaches before tracing long terrain corridors',()=>{
 const g=game([placed('one','unit.ants.archer',100,110),{...placed('enemy','unit.ants.warrior',180,110),owner:'player.2'}]);
 const actor=g.entities.find(e=>e.placement==='one')!,target=g.entities.find(e=>e.placement==='enemy')!;
 // Destination cells are free, but every direct approach crosses a moving body.
 vi.spyOn(g.spatial,'unitSegmentClear').mockImplementation((a,b)=>a.x===b.x&&a.y===b.y);
 vi.spyOn(g.spatial,'withLocalUnitClearance').mockImplementation((_origin,_extent,_id,query)=>query((a,b)=>a.x===b.x&&a.y===b.y));
 const terrain=vi.spyOn(g.spatial,'clearSegment');
 const footprint=vi.spyOn(g.spatial,'unitWalkable');
 const attackLine=vi.spyOn(g.spatial,'attackClear');
 const route=vi.spyOn(g.spatial,'route').mockReturnValue(false);
 expect(routeToAttack(g.context,actor,target)).toBe(false);
 expect(terrain.mock.calls.filter(([a,b])=>a.x!==b.x||a.y!==b.y)).toHaveLength(0);
 // Existing bounded alternate searches remain available, in the same order.
 expect(route).toHaveBeenCalledTimes(8);
 // Beyond these alternatives, blocked direct paths cannot win. Thousands of
 // destination footprints and weapon rays must not be evaluated needlessly.
 expect(footprint.mock.calls.length).toBeLessThan(50);
 expect(attackLine.mock.calls.length).toBeLessThan(50);
 const before=route.mock.calls.map(([,point])=>point);
 footprint.mockClear();attackLine.mockClear();route.mockClear();
 expect(routeToAttack(g.context,actor,target)).toBe(false);
 expect(route.mock.calls.map(([,point])=>point)).toEqual(before);
 expect(footprint).not.toHaveBeenCalled();expect(attackLine).not.toHaveBeenCalled();
});

it('reuses geometry across retries but invalidates local blockers, moving targets and full terrain rebuilds',()=>{
 const placements=[placed('one','unit.ants.archer',100,110),{...placed('enemy','unit.ants.warrior',140,110),owner:'player.2'}];
 const cached=game(placements),reference=game(placements);
 const actor=cached.entities.find(e=>e.placement==='one')!,target=cached.entities.find(e=>e.placement==='enemy')!;
 const other=reference.entities.find(e=>e.placement==='one')!,otherTarget=reference.entities.find(e=>e.placement==='enemy')!;
 eagerGeometry(reference,()=>other,otherTarget);
 const query=vi.spyOn(cached.spatial,'attackClear');
 const terrain=vi.spyOn(cached.spatial,'unitWalkable');
 const route=vi.spyOn(cached.spatial,'route').mockReturnValue(false),otherRoute=vi.spyOn(reference.spatial,'route').mockReturnValue(false);
 const check=(rebuild:boolean)=>{
  query.mockClear();terrain.mockClear();route.mockClear();otherRoute.mockClear();reference.spatial.approachPositions.clear();
  expect(routeToAttack(cached.context,actor,target)).toBe(routeToAttack(reference.context,other,otherTarget));
  expect(route.mock.calls.map(([,point])=>point)).toEqual(otherRoute.mock.calls.map(([,point])=>point));
  expect(query.mock.calls.length>0).toBe(rebuild);
  expect(terrain.mock.calls.length>0).toBe(rebuild);
 };
 check(true);
 cached.state.tick+=6;reference.state.tick+=6;check(false);
 for(const g of [cached,reference])g.context.create(placed('moving-body','unit.ants.warrior',103,110));
 check(false);
 for(const g of [cached,reference]){const e=g.context.create(placed('distant','building.ants.house',220,220));g.spatial.appendOccupancy(e);}
 check(false);
 for(const g of [cached,reference]){const e=g.context.create(placed('nearby','building.ants.house',130,110));g.spatial.appendOccupancy(e);}
 check(true);
 for(const g of [cached,reference]){const e=g.entities.find(e=>e.placement==='nearby')!;g.context.remove(e);g.spatial.refreshAfterRemoval(e.id);}
 check(true);
 target.x++;otherTarget.x++;check(true);
 actor.definition='unit.ants.warrior';other.definition='unit.ants.warrior';check(true);
 for(const g of [cached,reference]){g.spatial.terrain[115*g.spatial.size+130]=0;g.spatial.rebuild();}
 check(true);check(false);
});

it('reconsiders skipped destinations when traffic clears, preserving ranked route attempts',()=>{
 const placements=[placed('one','unit.ants.archer',100,110),
  {...placed('enemy','unit.ants.warrior',180,110),owner:'player.2'}];
 const optimized=game(placements),reference=game(placements);
 const actors=[optimized,reference].map(g=>g.entities.find(e=>e.placement==='one')!);
 const targets=[optimized,reference].map(g=>g.entities.find(e=>e.placement==='enemy')!);
 eagerGeometry(reference,()=>actors[1],targets[1]);
 let open=false;
 const routes=[optimized,reference].map(g=>{
  vi.spyOn(g.spatial,'withLocalUnitClearance').mockImplementation((_origin,_extent,_id,query)=>
   query((a,b)=>open||a.x===b.x&&a.y===b.y));
  return vi.spyOn(g.spatial,'route').mockReturnValue(false);
 });
 const attempts=(i:number)=>routes[i].mock.calls.map(([,point])=>point);
 expect(routeToAttack(optimized.context,actors[0],targets[0])).toBe(false);
 expect(routeToAttack(reference.context,actors[1],targets[1])).toBe(false);
 expect(attempts(0)).toEqual(attempts(1));expect(attempts(0)).toHaveLength(8);
 open=true;
 routes.forEach(route=>{route.mockClear();route.mockImplementation(()=>route.mock.calls.length===20);});
 expect(routeToAttack(optimized.context,actors[0],targets[0])).toBe(true);
 expect(routeToAttack(reference.context,actors[1],targets[1])).toBe(true);
 expect(attempts(0)).toEqual(attempts(1));expect(attempts(0)).toHaveLength(20);
});
