import {describe,it,expect} from 'vitest';
import {game,placed,worker,run,slots} from './helpers';
import {Game} from '../../src/sim/game/game';
import {resourceStamps} from '../../src/presentation/scenery';
import {testContent} from '../fixtures/content';

const treeDefinition=testContent.get('resource.test.forest-tree'),harvest=testContent.get('item.test.wood').creation!;
if(harvest.method!=='harvest')throw Error('Wood must be a harvested item');
const YIELD=treeDefinition.yield!,LOAD=harvest.amount!,CONTACT=harvest.animationTicks!,WORK=harvest.workTicks,FALL=treeDefinition.felling!.fallTicks;

function setup() {
 const appearance={asset:'asset.test.scenery-woodland-pine-a',scale:.65};
 const g=game([{...placed('tree','resource.test.forest-tree',200,230),owner:'none',appearance}]);
 const w=worker(g),tree=g.entities.find(e=>e.placement==='tree')!;
 expect(g.command(w.owner,{type:'gather',actors:[w.id],target:tree.id}).accepted).toBe(true);
 return {g,w,tree};
}

describe('finite forest harvesting',()=>{
 it('takes whole loads and only fells the tree on its final depletion',()=>{
  const {g,w,tree}=setup(),before=g.state.wallets[w.owner]['item.test.wood'];
  expect(tree.resource!.amount).toBe(YIELD);
  const loads:number[]=[];let previous=YIELD;
  for(let i=0;i<5000&&tree.resource!.amount;i++){
   g.tick();
   if(tree.resource!.amount!==previous){
    loads.push(previous-tree.resource!.amount);previous=tree.resource!.amount;
    expect(w.unit!.cargo).toEqual({item:'item.test.wood',amount:LOAD});
    if(previous){
     expect(tree.resource!.felling!.hp).toBe(Math.ceil(treeDefinition.felling!.maxHp*previous/YIELD));
     expect(tree.resource!.felling!.fallTick).toBeNull();
     expect(g.view(w.owner).entities.find(e=>e.id===tree.id)?.resource?.felling?.fallTick).toBeNull();
    }
   }
  }
  expect(loads).toEqual(Array(YIELD/LOAD).fill(LOAD));
  const f=tree.resource!.felling!,job=g.state.jobs.find(j=>j.worker===w.id)!;
  expect(f.hp).toBe(0);expect(f.lastHitTick).toBe(f.fallTick);expect(job.phase).toBe('fall');
  const position=structuredClone(w.unit!.position);run(g,FALL-1);
  expect(job.phase).toBe('fall');expect(w.unit!.position).toEqual(position);g.tick();expect(job.phase).toBe('return');
  for(let i=0;i<800&&w.unit!.cargo;i++)g.tick();
  expect(g.state.wallets[w.owner]['item.test.wood']).toBe(before+YIELD);
  expect(resourceStamps(g.view(w.owner).entities).some(s=>s.id===`resource-${tree.id}`)).toBe(false);
 });
 it('keeps regular axe contacts during one extraction and idles queued workers',()=>{
  const {g,w,tree}=setup(),other=g.entities.find(e=>e.id!==w.id&&e.owner===w.owner&&g.registry.get(e.definition).behaviors.work)!;
  g.command(w.owner,{type:'gather',actors:[other.id],target:tree.id});
  let first:number|undefined,previous:number|undefined,contacts=0;
  for(let i=0;i<800&&tree.resource!.amount===YIELD;i++){
   g.tick();const active=g.state.jobs.find(j=>j.source===tree.id&&j.phase==='work');
   if(active&&first===undefined)first=g.state.tick;
   const hit=tree.resource!.felling!.lastHitTick;
   if(hit!==null&&hit!==previous){if(previous!==undefined)expect(hit-previous).toBe(CONTACT);previous=hit;contacts++;}
   for(const waiting of g.state.jobs.filter(j=>j.phase==='wait'))expect(g.view(w.owner).entities.find(e=>e.id===waiting.worker)?.unit?.work).toBeUndefined();
  }
  expect(contacts).toBe(WORK/CONTACT);expect(g.state.tick-first!+1).toBe(WORK);expect(tree.resource!.amount).toBe(YIELD-LOAD);
 });
 it('saves queued, partially depleted, and falling trees with identical future receipts',()=>{
  const {g,w,tree}=setup(),before=g.state.wallets[w.owner]['item.test.wood'];
  for(let i=0;i<1200&&tree.resource!.amount===YIELD;i++)g.tick();
  expect(tree.resource!.amount).toBe(YIELD-LOAD);
  const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
  for(let i=0;i<4000&&tree.resource!.amount;i++){g.tick();restored.tick();}
  expect(restored.snapshot()).toEqual(g.snapshot());
  expect(restored.context.get(tree.id)!.appearance).toEqual(tree.appearance);
  const falling=new Game(g.map,slots,g.registry);falling.restore(g.snapshot());
  run(g,600);run(falling,600);expect(falling.snapshot()).toEqual(g.snapshot());
  expect(g.state.wallets[w.owner]['item.test.wood']).toBe(before+YIELD);
 });
 it('does not reveal axe contacts to an observer after the tree leaves vision',()=>{
  const {g,tree}=setup();
  const scout=g.context.create({...placed('scout','unit.test.settler',204,230),owner:'player.2'});
  g.observation.update();expect(g.view(1).entities.find(e=>e.id===tree.id)?.resource?.felling?.lastHitTick).toBeNull();
  scout.x=32;scout.y=32;scout.unit!.position=null;g.observation.update();run(g,240);
  expect(tree.resource!.felling!.lastHitTick).not.toBeNull();
  expect(g.view(1).entities.find(e=>e.id===tree.id)).toMatchObject({remembered:true,resource:{amount:YIELD,felling:{lastHitTick:null}}});
 });
});
