import {expect,it,vi} from 'vitest';
import {alive} from '../../src/sim/game/state';
import {game,placed} from './helpers';

const create=()=>game(Array.from({length:12},(_,i)=>({...placed(`tree-${i}`,'resource.forest.tree',80+i*5,100,{amount:0}),owner:'none' as const})));

it('tracks pending resource timers in authoritative order through rescheduling, removal and reindex',()=>{
 const g=create(),c=g.context,trees=g.entities.filter(e=>e.resource);
 for(const e of [...trees].reverse())c.setRegrowth(e,20);
 expect(c.regrowingResources()).toEqual(trees);
 c.setRegrowth(trees[2]!,null);c.setRegrowth(trees[4]!,80);c.remove(trees[6]!);
 const expected=()=>g.entities.filter(e=>alive(e)&&e.resource?.growingUntil!=null);
 expect(c.regrowingResources()).toEqual(expected());
 // Loaded entity order need not be ID order or timer insertion order.
 g.state.entities.reverse();c.reindex();expect(c.regrowingResources()).toEqual(expected());
 const late=c.create({...placed('late','resource.forest.tree',180,100,{amount:0}),owner:'none'});
 c.setRegrowth(late,2);expect(c.regrowingResources()).toEqual(expected());
 c.setRegrowth(trees[2]!,1);expect(c.regrowingResources()).toEqual(expected());
});

it('does not enumerate unrelated entities to check timer expiry',()=>{
 const g=create(),tree=g.entities.find(e=>e.placement==='tree-0')!;
 g.context.setRegrowth(tree,1);g.state.tick=1;
 const scan=vi.spyOn(g.context,'live').mockImplementation(()=>{throw Error('Unexpected forest scan');});
 const economy=g.economy as unknown as {advanceRegrowth():void;canRegrow(e:typeof tree):boolean};
 const clearance=vi.spyOn(economy,'canRegrow').mockReturnValue(false);
 economy.advanceRegrowth();expect(scan).not.toHaveBeenCalled();expect(clearance).toHaveBeenCalledExactlyOnceWith(tree);
 scan.mockRestore();clearance.mockRestore();
});

it('matches a full timer scan through blocked maturation, cancellation and cold restoration',()=>{
 const fast=create(),reference=create();
 reference.context.regrowingResources=()=>reference.entities.filter(e=>alive(e)&&e.resource?.growingUntil!=null);
 for(const g of [fast,reference]){
  const trees=g.entities.filter(e=>e.resource);
  for(let i=trees.length-1;i>=0;i--)g.context.setRegrowth(trees[i]!,i*3+2);
  g.context.create(placed('blocker','building.ants.fort',80,100));
  g.spatial.rebuild();
 }
 for(let tick=0;tick<80;tick++){
  if(tick===10)for(const g of [fast,reference])g.context.setRegrowth(g.entities.find(e=>e.placement==='tree-8')!,null);
  if(tick===20)for(const g of [fast,reference]){
   const b=g.entities.find(e=>e.placement==='blocker')!;g.context.remove(b);g.spatial.refreshAfterRemoval(b.id);
  }
  if(tick===30)fast.restore(fast.snapshot());
  fast.tick();reference.tick();
  expect(fast.snapshot()).toEqual(reference.snapshot());
 }
});
