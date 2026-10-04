import {expect,it,vi} from 'vitest';
import {game,placed,worker} from './helpers';

it('removes moving actors without rebuilding unchanged static navigation',()=>{
 const g=game(),spy=vi.spyOn(g.spatial,'rebuild'),before=g.spatial.occupied.slice(),revision=g.spatial.revision;
 g.economy.remove(worker(g));
 expect(spy).not.toHaveBeenCalled();expect(g.spatial.revision).toBeGreaterThan(revision);
 expect(g.spatial.occupied.every((id,i)=>id===before[i])).toBe(true);
});

it('still clears other dead blockers when the first casualty removed was a unit',()=>{
 const g=game(),w=worker(g),hall=g.context.get(g.state.objectives[w.owner])!;
 const cells=g.spatial.footprint(hall),spy=vi.spyOn(g.spatial,'rebuild');
 hall.hp=0;g.economy.remove(w);
 expect(spy).toHaveBeenCalledTimes(1);
 expect(cells.every(cell=>g.spatial.occupied[cell]!==hall.id)).toBe(true);
});

it('removes an isolated building incrementally and invalidates previously cached routes',()=>{
 const fast=game(),reference=game();
 const hall=(g:ReturnType<typeof game>)=>g.context.get(g.state.objectives[worker(g).owner])!;
 const target=hall(fast),start=fast.spatial.cell({x:target.x-15,y:target.y}),goal=fast.spatial.cell({x:target.x+15,y:target.y});
 const before=fast.spatial.findPath(start,goal)!;reference.spatial.findPath(start,goal);
 const spy=vi.spyOn(fast.spatial,'rebuild');
 fast.context.remove(target);fast.spatial.refreshAfterRemoval(target.id);
 reference.context.remove(hall(reference));reference.spatial.rebuild();
 expect(spy).not.toHaveBeenCalled();
 expect(fast.spatial.occupied.every((id,i)=>id===reference.spatial.occupied[i])).toBe(true);
 const after=fast.spatial.findPath(start,goal)!;
 expect(after).toEqual(reference.spatial.findPath(start,goal));expect(after.length).toBeLessThan(before.length);
});

it.each(['tree-a','tree-b'])('falls back when removing overlapping resource %s, preserving the remaining owner',id=>{
 const g=game(['tree-a','tree-b'].map(id=>({...placed(id,'resource.forest.tree',110,110),owner:'none' as const})));
 const removed=g.entities.find(e=>e.placement===id)!,remaining=g.entities.find(e=>e.resource&&e.id!==removed.id&&e.x===110)!;
 const spy=vi.spyOn(g.spatial,'rebuild');g.economy.remove(removed);
 expect(spy).toHaveBeenCalledTimes(1);expect(g.spatial.resources[g.spatial.cell(remaining)]).toBe(remaining.id);
});

it('preserves resource blocking beneath an incrementally removed building',()=>{
 const g=game(),hall=g.context.get(g.state.objectives[worker(g).owner])!;
 const tree=g.context.create({...placed('under-hall','resource.forest.tree',hall.x,hall.y),owner:'none'});
 g.spatial.rebuild();const spy=vi.spyOn(g.spatial,'rebuild');
 g.context.remove(hall);g.spatial.refreshAfterRemoval(hall.id);
 expect(spy).not.toHaveBeenCalled();expect(g.spatial.resources[g.spatial.cell(tree)]).toBe(tree.id);
 expect(g.spatial.walkable(g.spatial.cell(tree))).toBe(false);
 const occupied=g.spatial.occupied.slice(),resources=g.spatial.resources.slice();
 g.spatial.rebuild();
 expect(g.spatial.occupied.every((id,i)=>id===occupied[i])).toBe(true);
 expect(g.spatial.resources.every((id,i)=>id===resources[i])).toBe(true);
});

it('matches forced rebuilds through resource geometry, depletion, overlap order and removal changes',()=>{
 const create=()=>game(['tree-a','tree-b'].map(id=>({...placed(id,'resource.forest.tree',110,110),owner:'none' as const})));
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
