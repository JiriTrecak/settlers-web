import {expect,it} from 'vitest';
import {game,placed} from './helpers';

function fixture(){
 const g=game([placed('scout','unit.test.warrior',110,110),
  ...Array.from({length:80},(_,i)=>({...placed(`tree-${i}`,'resource.test.forest-tree',104+i%10*2,104+Math.floor(i/10)*2),owner:'none'}))]);
 return {g,scout:g.entities.find(e=>e.placement==='scout')!,tree:g.entities.find(e=>e.placement==='tree-44')!};
}
it('publishes current and remembered foliage exactly as previously observed',()=>{
 const {g,scout}=fixture();
 for(const x of [110,117,127,145,130,115]){
  scout.x=x;scout.unit!.position=null;g.context.motionRevision++;g.observation.update();
  const expected=new Map(g.entities.filter(e=>e.placement?.startsWith('tree-')).map(e=>[e.id,g.observation.previouslyVisible('player.1',e)]));
  const view=g.view('player.1');
  for(const e of view.entities)if(expected.has(e.id))expect(!e.remembered).toBe(expected.get(e.id));
 }
 const saved=g.snapshot(),view=g.view('player.1');g.restore(saved);
 expect(g.view('player.1')).toEqual(view);
});
it('keeps hidden memories until their old location is seen, including moved and removed scenery',()=>{
 for(const remove of [false,true]){
  const {g,scout,tree}=fixture();
  expect(g.view('player.1').entities.find(e=>e.id===tree.id)).toBeDefined();
  scout.x=180;scout.unit!.position=null;g.observation.update();
  expect(g.view('player.1').entities.find(e=>e.id===tree.id)?.remembered).toBe(true);
  if(remove)g.economy.remove(tree);else tree.x=50;
  g.observation.update();
  expect(g.view('player.1').entities.find(e=>e.id===tree.id)).toMatchObject({x:112,remembered:true});
  scout.x=110;g.observation.update();
  expect(g.view('player.1').entities.find(e=>e.id===tree.id)).toBeUndefined();
 }
});

it('matches full coverage through simultaneous sight changes, overlapping edits and restore',()=>{
 const fast=fixture().g,reference=fixture().g;
 for(let step=0;step<24;step++){
  for(const g of [fast,reference]){
   const scout=g.entities.find(e=>e.placement==='scout')!;
   scout.x=100+(step*7)%46;scout.unit!.position=null;
   // Multiple new footprints, including exact overlaps and hidden locations.
   for(let i=0;i<3;i++)g.context.create({...placed(`added-${step}-${i}`,'resource.test.forest-tree',105+(step*13+i)%55,108+(step%3)),owner:'none'});
   if(step>1)for(const e of [...g.entities])if(e.placement?.startsWith(`added-${step-2}-`))g.context.remove(e);
   if(step===4)g.context.create(placed('hall','building.test.fort',120,110));
   if(step===12)g.context.remove(g.entities.find(e=>e.placement==='hall')!);
  }
  fast.observation.update(true);reference.observation.update();
  for(const owner of [undefined,'player.1','player.2'] as const)expect(fast.view(owner)).toEqual(reference.view(owner));
  expect(fast.checksum('full')).toBe(reference.checksum('full'));
  if(step===14){const saved=fast.snapshot();fast.restore(saved);expect(fast.snapshot()).toEqual(saved);}
 }
});
