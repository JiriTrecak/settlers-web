import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';

const create=()=>game([
 placed('scout','unit.ants.warrior',110,110),
 {...placed('tree','resource.forest.tree',112,110),owner:'none'},
]);
type TestGame=ReturnType<typeof create>;
const classify=(g:TestGame)=>vi.spyOn(g.observation as unknown as {projectEntities():unknown},'projectEntities');
const compare=(fast:TestGame,reference:TestGame)=>{
 fast.observation.update(true);reference.observation.update();
 expect(fast.snapshot()).toEqual(reference.snapshot());
 for(const owner of [undefined,'player.1','player.2'] as const)expect(fast.view(owner)).toEqual(reference.view(owner));
 expect(fast.checksum('full')).toBe(reference.checksum('full'));
};

it('updates actor membership without reclassifying scenery, including transient actors and resource receipts',()=>{
 const fast=create(),reference=create(),spy=classify(fast),oldView=fast.view();
 const oldIds=oldView.entities.map(e=>e.id);
 for(const g of [fast,reference]){
  g.context.create(placed('new','unit.ants.warrior',111,111));
  const transient=g.context.create(placed('transient','unit.ants.warrior',114,110));
  g.context.remove(transient);
  g.context.remove(g.entities.find(e=>e.placement==='scout')!);
  const tree=g.entities.find(e=>e.placement==='tree')!;
  tree.resource!.amount--;g.context.changedResources.add(tree);
 }
 compare(fast,reference);expect(spy).not.toHaveBeenCalled();
 expect(oldView.entities.map(e=>e.id)).toEqual(oldIds);
 const saved=fast.snapshot(),view=fast.view();fast.restore(saved);
 expect(fast.snapshot()).toEqual(saved);expect(fast.view()).toEqual(view);
});

it.each(['add static','remove static','generic invalidation','reindex'] as const)(
 'retains the conservative refresh for %s mixed with actor creation',change=>{
  const fast=create(),reference=create(),spy=classify(fast);
  for(const g of [fast,reference]){
   g.context.create(placed('new','unit.ants.warrior',111,111));
   if(change==='add static')g.context.create({...placed('new-tree','resource.forest.tree',114,110),owner:'none'});
   if(change==='remove static')g.context.remove(g.entities.find(e=>e.placement==='tree')!);
   if(change==='generic invalidation'){
    g.entities.find(e=>e.placement==='tree')!.appearance={scale:1.4};g.context.observationRevision++;
   }
   if(change==='reindex')g.context.reindex();
  }
  compare(fast,reference);expect(spy).toHaveBeenCalledTimes(1);
 });

it('explicit editor refreshes still discover changes without receipts',()=>{
 const g=create(),spy=classify(g),tree=g.entities.find(e=>e.placement==='tree')!;
 tree.appearance={scale:1.8};g.observation.update();
 expect(spy).toHaveBeenCalledTimes(1);
 expect(g.view().entities.find(e=>e.id===tree.id)!.appearance?.scale).toBe(1.8);
});
