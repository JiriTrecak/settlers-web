import {expect,it,vi} from 'vitest';
import {game,placed,worker} from './helpers';

/** Incremental occupancy updates must leave exactly the state a full rebuild would produce. */
function expectMatchesRebuild(g:ReturnType<typeof game>){
 const occupied=g.spatial.occupied.slice(),resources=g.spatial.resources.slice();
 g.spatial.rebuild();
 expect(g.spatial.occupied.every((id,i)=>id===occupied[i])).toBe(true);
 expect(g.spatial.resources.every((id,i)=>id===resources[i])).toBe(true);
}

it('places a building incrementally and matches the forced-rebuild replay',()=>{
 const make=()=>game([{...placed('distant-tree','resource.test.forest-tree',110,110),owner:'none'}]);
 const fast=make(),reference=make();
 vi.spyOn(reference.spatial,'appendOccupancy').mockImplementation(()=>reference.spatial.rebuild());
 for(const g of [fast,reference])expect(g.command('player.1',{type:'build',actors:[worker(g).id],definition:'building.test.house',position:placed('site','building.test.house',205,210).position}).accepted).toBe(true);
 expect(fast.spatial.occupied).toEqual(reference.spatial.occupied);
 expect(fast.spatial.resources).toEqual(reference.spatial.resources);
 for(let tick=0;tick<200;tick++){fast.tick();reference.tick();}
 expect(fast.snapshot()).toEqual(reference.snapshot());
});

it('invalidates previously searched routes when an appended building blocks the path',()=>{
 const fast=game(),reference=game(),start=fast.spatial.cell({x:100,y:110}),goal=fast.spatial.cell({x:120,y:110});
 const before=fast.spatial.findPath(start,goal);expect(reference.spatial.findPath(start,goal)).toEqual(before);
 for(const g of [fast,reference]){
  const b=g.context.create(placed('blocker','building.test.house',110,110));
  if(g===fast)g.spatial.appendOccupancy(b);else g.spatial.rebuild();
 }
 const after=fast.spatial.findPath(start,goal);
 expect(after).not.toEqual(before);expect(after).toEqual(reference.spatial.findPath(start,goal));
});

it('preserves overlapping ownership through successive local additions and removals',()=>{
 const g=game(),reference=game();
 for(const definition of ['building.test.house','resource.test.forest-tree','building.test.house','resource.test.forest-tree']){
  const e=g.context.create(placed('',definition,110,110));g.spatial.appendOccupancy(e);
  reference.context.create(placed('',definition,110,110));reference.spatial.rebuild();
  expect(g.spatial.occupied).toEqual(reference.spatial.occupied);expect(g.spatial.resources).toEqual(reference.spatial.resources);
 }
 for(let i=0;i<4;i++){
  const e=g.entities.at(-1)!;g.context.remove(e);g.spatial.refreshAfterRemoval(e.id);
  reference.context.remove(reference.entities.at(-1)!);reference.spatial.rebuild();
  expect(g.spatial.occupied).toEqual(reference.spatial.occupied);expect(g.spatial.resources).toEqual(reference.spatial.resources);
 }
});

it('indexes additions that are not the final entity or are already indexed',()=>{
 const g=game(),first=g.context.create(placed('first','building.test.house',110,110));
 const second=g.context.create(placed('second','building.test.house',120,110));
 g.spatial.appendOccupancy(first);g.spatial.appendOccupancy(second);
 expect(g.spatial.occupied[g.spatial.cell(first)]).toBe(first.id);
 expect(g.spatial.occupied[g.spatial.cell(second)]).toBe(second.id);
 expectMatchesRebuild(g);
});

it('depletes a harvested tree and matches the forced-rebuild replay',()=>{
 const create=()=>game([{...placed('harvest','resource.test.forest-tree',205,215),owner:'none'}]);
 const fast=create(),reference=create();
 vi.spyOn(reference.spatial,'refreshAfterRemoval').mockImplementation(()=>reference.spatial.rebuild());
 for(const g of [fast,reference]){
  const w=worker(g),tree=g.entities.find(e=>e.placement==='harvest')!;
  expect(g.command(w.owner,{type:'gather',actors:[w.id],target:tree.id}).accepted).toBe(true);
 }
 for(let i=0;i<2400;i++){fast.tick();reference.tick();}
 expect(fast.entities.find(e=>e.placement==='harvest')!.resource!.amount).toBe(0);
 expect(fast.snapshot()).toEqual(reference.snapshot());
 expect(fast.spatial.resources).toEqual(reference.spatial.resources);
});

it('finishes construction and matches the forced-rebuild replay',()=>{
 const fast=game(),reference=game();
 for(const g of [fast,reference])expect(g.command('player.1',{type:'build',actors:[worker(g).id],definition:'building.test.house',position:placed('site','building.test.house',205,210).position}).accepted).toBe(true);
 const building=fast.entities.at(-1)!;
 vi.spyOn(reference.spatial,'refreshAfterRemoval').mockImplementation(()=>reference.spatial.rebuild());
 for(let i=0;i<2400&&building.construction;i++){fast.tick();reference.tick();}
 expect(building.construction).toBeUndefined();
 expect(fast.snapshot()).toEqual(reference.snapshot());
 expect(fast.spatial.occupied).toEqual(reference.spatial.occupied);
});

it('removes moving actors without changing static occupancy, advancing the collision revision',()=>{
 const g=game(),before=g.spatial.occupied.slice(),revision=g.spatial.revision;
 g.economy.remove(worker(g));
 expect(g.spatial.revision).toBeGreaterThan(revision);
 expect(g.spatial.occupied.every((id,i)=>id===before[i])).toBe(true);
});

it('still clears other dead blockers when the first casualty removed was a unit',()=>{
 const g=game(),w=worker(g),hall=g.context.get(g.state.objectives[w.owner])!;
 const cells=g.spatial.footprint(hall);
 hall.hp=0;g.economy.remove(w);
 expect(cells.every(cell=>g.spatial.occupied[cell]!==hall.id)).toBe(true);
});

it('removes an isolated building incrementally and invalidates previously cached routes',()=>{
 const fast=game(),reference=game();
 const hall=(g:ReturnType<typeof game>)=>g.context.get(g.state.objectives[worker(g).owner])!;
 const target=hall(fast),start=fast.spatial.cell({x:target.x-15,y:target.y}),goal=fast.spatial.cell({x:target.x+15,y:target.y});
 const before=fast.spatial.findPath(start,goal)!;reference.spatial.findPath(start,goal);
 fast.context.remove(target);fast.spatial.refreshAfterRemoval(target.id);
 reference.context.remove(hall(reference));reference.spatial.rebuild();
 expect(fast.spatial.occupied.every((id,i)=>id===reference.spatial.occupied[i])).toBe(true);
 const after=fast.spatial.findPath(start,goal)!;
 expect(after).toEqual(reference.spatial.findPath(start,goal));expect(after.length).toBeLessThan(before.length);
});

it.each(['tree-a','tree-b'])('removes overlapping resource %s locally, preserving the remaining owner',id=>{
 const g=game(['tree-a','tree-b'].map(id=>({...placed(id,'resource.test.forest-tree',110,110),owner:'none' as const})));
 const removed=g.entities.find(e=>e.placement===id)!,remaining=g.entities.find(e=>e.resource&&e.id!==removed.id&&e.x===110)!;
 g.economy.remove(removed);
 expect(g.spatial.resources[g.spatial.cell(remaining)]).toBe(remaining.id);
 expectMatchesRebuild(g);
});

it.each([[0,1,2],[2,0,1],[1,2,0]])('preserves three overlapping resource owners through removal order %j',(...order)=>{
 const create=()=>game([0,1,2].map(i=>({...placed(`tree${i}`,'resource.test.forest-tree',110,110),owner:'none' as const})));const g=create(),reference=create();
 const trees=[0,1,2].map(i=>g.entities.find(e=>e.placement===`tree${i}`)!);
 for(const i of order){
  const tree=trees[i]!;tree.resource!.amount=0;
  g.spatial.refreshAfterRemoval(tree.id);
  reference.entities.find(e=>e.placement===tree.placement)!.resource!.amount=0;
  reference.spatial.rebuild();expect(g.spatial.resources).toEqual(reference.spatial.resources);
 }
 expect(g.spatial.resources[g.spatial.cell(trees[0]!)]).toBe(0);
});

it('restores overlapped building owners locally without disturbing resource blockers',()=>{
 const g=game(),hall=g.context.get(g.state.objectives[worker(g).owner])!;
 const second=g.context.create({...placed('second-hall',hall.definition,hall.x,hall.y)});
 const tree=g.context.create({...placed('under-both','resource.test.forest-tree',hall.x,hall.y),owner:'none'});
 g.spatial.rebuild();
 g.context.remove(second);g.spatial.refreshAfterRemoval(second.id);
 expect(g.spatial.occupied[g.spatial.cell(hall)]).toBe(hall.id);
 expect(g.spatial.resources[g.spatial.cell(hall)]).toBe(tree.id);
 expectMatchesRebuild(g);
});

it('preserves resource blocking beneath an incrementally removed building',()=>{
 const g=game(),hall=g.context.get(g.state.objectives[worker(g).owner])!;
 const tree=g.context.create({...placed('under-hall','resource.test.forest-tree',hall.x,hall.y),owner:'none'});
 g.spatial.rebuild();
 g.context.remove(hall);g.spatial.refreshAfterRemoval(hall.id);
 expect(g.spatial.resources[g.spatial.cell(tree)]).toBe(tree.id);
 expect(g.spatial.walkable(g.spatial.cell(tree))).toBe(false);
 expectMatchesRebuild(g);
});

it('matches forced rebuilds through resource geometry, depletion, overlap order and removal changes',()=>{
 const create=()=>game(['tree-a','tree-b'].map(id=>({...placed(id,'resource.test.forest-tree',110,110),owner:'none' as const})));
 const fast=create(),reference=create();
 const tree=(g:ReturnType<typeof game>,id='tree-a')=>g.entities.find(e=>e.placement===id)!;
 const actions:((g:ReturnType<typeof game>)=>void)[]=[
  g=>{tree(g).appearance={scale:2};},
  g=>{tree(g).x+=3;tree(g).rotation=90;},
  g=>{tree(g).resource!.amount=0;},
  g=>{tree(g).resource!.amount=100;tree(g).x=110;},
  g=>{const a=tree(g),b=tree(g,'tree-b'),i=g.state.entities.indexOf(a),j=g.state.entities.indexOf(b);g.state.entities[i]=b;g.state.entities[j]=a;},
  g=>{g.context.remove(tree(g));},
  g=>{g.context.remove(tree(g,'tree-b'));},
 ];
 for(const action of actions){
  action(fast);action(reference);fast.spatial.refreshAfterRemoval();reference.spatial.rebuild();
  expect(fast.spatial.occupied.every((id,i)=>id===reference.spatial.occupied[i])).toBe(true);
  expect(fast.spatial.resources.every((id,i)=>id===reference.spatial.resources[i])).toBe(true);
  expect(fast.spatial.findPath(fast.spatial.cell({x:100,y:110}),fast.spatial.cell({x:120,y:110})))
   .toEqual(reference.spatial.findPath(reference.spatial.cell({x:100,y:110}),reference.spatial.cell({x:120,y:110})));
 }
});

it('keeps upgraded Hall occupancy current through later tree depletion, matching forced rebuilds',()=>{
 const make=()=>game([{...placed('tree','resource.test.forest-tree',110,110),owner:'none'}],draft=>{
  for(const d of draft.definitions as any[])if(d.upgrade)d.upgrade={...d.upgrade,items:[],workTicks:1};
 });
 const fast=make(),reference=make();
 vi.spyOn(reference.spatial,'refreshOccupancyDefinition').mockImplementation(()=>reference.spatial.rebuild());
 vi.spyOn(reference.spatial,'refreshAfterRemoval').mockImplementation(()=>reference.spatial.rebuild());
 for(const tier of ['building.test.great-mound','building.test.elder-hall']){
  for(const g of [fast,reference]){
   const hall=g.context.get(g.state.objectives['player.1'])!;
   expect(g.command(hall.owner,{type:'upgrade',actor:hall.id}).accepted).toBe(true);g.tick();
   expect(hall.definition).toBe(tier);
  }
  expect(fast.spatial.occupied).toEqual(reference.spatial.occupied);
 }
 for(const g of [fast,reference]){
  const tree=g.entities.find(e=>e.placement==='tree')!;tree.resource!.amount=0;g.spatial.refreshAfterRemoval(tree.id);
 }
 expect(fast.spatial.occupied).toEqual(reference.spatial.occupied);
 expect(fast.spatial.resources).toEqual(reference.spatial.resources);
 for(let i=0;i<100;i++){fast.tick();reference.tick();}
 expect(fast.snapshot()).toEqual(reference.snapshot());
});

it('updates occupancy when a definition transform changes the physical footprint',()=>{
 const g=game(),hall=g.context.get(g.state.objectives['player.1'])!,old=g.spatial.footprint(hall);
 hall.definition='building.test.house';g.spatial.refreshOccupancyDefinition(hall);
 const next=new Set(g.spatial.footprint(hall));
 expect(old.filter(cell=>!next.has(cell)).every(cell=>g.spatial.occupied[cell]!==hall.id)).toBe(true);
 expectMatchesRebuild(g);
});
