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

it.each(['generic invalidation','reindex'] as const)(
 'retains the conservative refresh for %s mixed with actor creation',change=>{
  const fast=create(),reference=create(),spy=classify(fast);
  for(const g of [fast,reference]){
   g.context.create(placed('new','unit.ants.warrior',111,111));
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

it('updates overlapping static footprints locally and matches full rebuilds through removal and restore',()=>{
 const fast=create(),reference=create(),spy=classify(fast);
 for(let step=0;step<5;step++){
  for(const g of [fast,reference]){
   if(step===0){
    g.context.create(placed('hall','building.ants.fort',112,110));
    g.context.create({...placed('overlap','resource.forest.tree',112,110),owner:'none'});
    const transient=g.context.create({...placed('transient','resource.forest.tree',111,110),owner:'none'});g.context.remove(transient);
   }
   if(step===1)g.context.remove(g.entities.find(e=>e.placement==='tree')!);
   if(step===2){g.context.remove(g.entities.find(e=>e.placement==='hall')!);g.entities.find(e=>e.placement==='scout')!.x=180;}
   if(step===3)g.context.remove(g.entities.find(e=>e.placement==='overlap')!);
   if(step===4)g.entities.find(e=>e.placement==='scout')!.x=110;
  }
  compare(fast,reference);
 }
 expect(spy).not.toHaveBeenCalled();
 const saved=fast.snapshot(),view=fast.view('player.1');fast.restore(saved);
 expect(fast.snapshot()).toEqual(saved);expect(fast.view('player.1')).toEqual(view);
});

it('adding a building does not query unrelated forest footprints',()=>{
 const g=create();
 g.context.create(placed('hall','building.ants.fort',120,110));
 const footprint=vi.spyOn(g.spatial,'footprint');
 g.observation.update(true);
 expect(footprint.mock.calls.filter(([e])=>e.definition==='resource.forest.tree')).toHaveLength(0);
 expect(g.view('player.1').entities.some(e=>e.definition==='building.ants.fort')).toBe(true);
});
