import {expect,it} from 'vitest';
import {game,placed} from './helpers';

const create=()=>game([
 placed('scout','unit.test.warrior',110,110),
 {...placed('tree','resource.test.forest-tree',112,110),owner:'none'},
]);
type TestGame=ReturnType<typeof create>;
const compare=(fast:TestGame,reference:TestGame)=>{
 fast.observation.update(true);reference.observation.update();
 expect(fast.snapshot()).toEqual(reference.snapshot());
 for(const owner of [undefined,'player.1','player.2'] as const)expect(fast.view(owner)).toEqual(reference.view(owner));
 expect(fast.checksum('full')).toBe(reference.checksum('full'));
};

it('retains fallen heroes locally and matches a full index rebuild through removal, revival and restore',()=>{
 const fast=create(),reference=create();
 for(const g of [fast,reference]){
  const hero=g.entities.find(e=>e.equipment&&e.owner==='player.1')!;
  hero.hp=0;g.economy.remove(hero);g.revival.retain(hero);
  g.context.create(placed('after','unit.test.warrior',115,115));
  if(g===reference)g.context.reindex();
 }
 compare(fast,reference);
 expect(fast.context.indexedUnits().map(e=>e.id)).toEqual(reference.context.indexedUnits().map(e=>e.id));
 for(const g of [fast,reference]){
  const hero=g.entities.find(e=>e.fallen)!;hero.hp=100;delete hero.fallen;
  g.context.create(placed('later','unit.test.warrior',116,116));
 }
 compare(fast,reference);
 const saved=fast.snapshot(),view=fast.view('player.1');fast.restore(saved);
 expect(fast.view('player.1')).toEqual(view);expect(fast.snapshot()).toEqual(saved);
});

it('matches a full rebuild through actor membership changes, transient actors and resource receipts',()=>{
 const fast=create(),reference=create(),oldView=fast.view();
 const oldIds=oldView.entities.map(e=>e.id);
 for(const g of [fast,reference]){
  g.context.create(placed('new','unit.test.warrior',111,111));
  const transient=g.context.create(placed('transient','unit.test.warrior',114,110));
  g.context.remove(transient);
  g.context.remove(g.entities.find(e=>e.placement==='scout')!);
  const tree=g.entities.find(e=>e.placement==='tree')!;
  tree.resource!.amount--;g.context.changedResources.add(tree);
 }
 compare(fast,reference);
 expect(oldView.entities.map(e=>e.id)).toEqual(oldIds);
 const saved=fast.snapshot(),view=fast.view();fast.restore(saved);
 expect(fast.snapshot()).toEqual(saved);expect(fast.view()).toEqual(view);
});

it.each(['generic invalidation','reindex'] as const)(
 'matches a full rebuild for %s mixed with actor creation',change=>{
  const fast=create(),reference=create();
  for(const g of [fast,reference]){
   g.context.create(placed('new','unit.test.warrior',111,111));
   if(change==='generic invalidation'){
    g.entities.find(e=>e.placement==='tree')!.appearance={scale:1.4};g.context.observationRevision++;
   }
   if(change==='reindex')g.context.reindex();
  }
  compare(fast,reference);
 });

it('explicit editor refreshes still discover changes without receipts',()=>{
 const g=create(),tree=g.entities.find(e=>e.placement==='tree')!;
 tree.appearance={scale:1.8};g.observation.update();
 expect(g.view().entities.find(e=>e.id===tree.id)!.appearance?.scale).toBe(1.8);
});

it('matches full rebuilds through overlapping static footprint edits, removal and restore',()=>{
 const fast=create(),reference=create();
 for(let step=0;step<5;step++){
  for(const g of [fast,reference]){
   if(step===0){
    g.context.create(placed('hall','building.test.fort',112,110));
    g.context.create({...placed('overlap','resource.test.forest-tree',112,110),owner:'none'});
    const transient=g.context.create({...placed('transient','resource.test.forest-tree',111,110),owner:'none'});g.context.remove(transient);
   }
   if(step===1)g.context.remove(g.entities.find(e=>e.placement==='tree')!);
   if(step===2){g.context.remove(g.entities.find(e=>e.placement==='hall')!);g.entities.find(e=>e.placement==='scout')!.x=180;}
   if(step===3)g.context.remove(g.entities.find(e=>e.placement==='overlap')!);
   if(step===4)g.entities.find(e=>e.placement==='scout')!.x=110;
  }
  compare(fast,reference);
 }
 const saved=fast.snapshot(),view=fast.view('player.1');fast.restore(saved);
 expect(fast.snapshot()).toEqual(saved);expect(fast.view('player.1')).toEqual(view);
});
