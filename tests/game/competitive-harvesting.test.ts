import {describe, expect, it} from 'vitest';
import type {Rules} from '../../src/content/schema';
import {Game} from '../../src/sim/game/game';
import {game, placed, run, slots} from './helpers';

const owner='player.1';
function site(count=8, amount?:number) {
 const g=game([205.5,213.5,221.5,229.5].map((x,i)=>({...placed(`node.${i}`,'building.neutral.amber-mine',x,241.5,amount===undefined?undefined:{amount}),owner:'none' as const})), draft => {
  for(const u of (draft.rules as Rules).startingSetup.units)u.offset.y=-u.offset.y;
  (draft.rules as Rules).startingSetup.hero!.offset={x:16,y:-16};
 });
 const nodes=g.entities.filter(e=>e.placement?.startsWith('node.'));
 const workers=g.entities.filter(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work);
 for(let i=workers.length;i<count;i++)workers.push(g.context.create(placed('extra.'+i,'unit.ants.settler',200+(i%8)*4,253-Math.floor(i/8)*4)));
 g.spatial.rebuild();g.observation.update();
 for(const w of workers)expect(g.spatial.unitWalkable(w,w)).toBe(true);
 expect(g.command(owner,{type:'gather',actors:workers.slice(0,count).map(w=>w.id),target:nodes[1].id}).actors).toHaveLength(count);
 return {g,nodes,workers:workers.slice(0,count)};
}
function queued() {
 const result=site(12);
 for(let i=0;i<500&&!result.g.state.jobs.some(j=>j.phase==='wait');i++)result.g.tick();
 expect(result.g.state.jobs.some(j=>j.phase==='wait')).toBe(true);
 return result;
}

describe('competitive harvesting',()=>{
 it('declares four independent finite nodes, one active miner, and no assignment cap',()=>{
  const {g,nodes}=site(16),d=g.registry.get(nodes[0].definition);
  expect(nodes.map(n=>n.resource!.amount)).toEqual([4500,4500,4500,4500]);
  expect(d.footprint).toEqual({width:4,depth:4});
  expect(d.harvesting).toEqual({activeWorkers:1,recommendedWorkers:2,searchRadius:24});
  expect(g.registry.get('item.amber').creation).toMatchObject({workTicks:80,amount:10});
  run(g,160);
  for(const node of nodes)expect(g.state.jobs.filter(j=>j.source===node.id&&j.phase==='work').length).toBeLessThanOrEqual(1);
  expect(g.view(owner).entities.filter(e=>nodes.some(n=>n.id===e.id)).reduce((n,e)=>n+e.gathering!.workers,0)).toBe(16);
 });
 it('distributes eight workers over four nodes and lets only active workers progress',()=>{
  const {g,nodes}=site();run(g,600);
  for(const node of nodes)expect(g.entities.filter(e=>e.unit?.order?.type==='gather'&&e.unit.order.target===node.id)).toHaveLength(2);
  for(let i=0;i<400&&!g.state.jobs.some(j=>j.phase==='wait');i++)g.tick();
  const before=new Map(g.state.jobs.filter(j=>j.phase==='wait').map(j=>[j.id,j.progress]));
  expect(before.size).toBeGreaterThan(0);g.tick();
  for(const j of g.state.jobs)if(j.phase==='wait'&&before.has(j.id))expect(j.progress).toBe(before.get(j.id));
 });
 it('admits waiting workers in saved arrival order and releases a stopped miner slot',()=>{
  const {g}=queued();
  const active=g.state.jobs.find(j=>j.phase==='work'&&g.state.jobs.some(other=>other.source===j.source&&other.phase==='wait'))!;
  const waiting=g.state.jobs.filter(j=>j.source===active.source&&j.phase==='wait').sort((a,b)=>a.arrivedTick!-b.arrivedTick!||a.id-b.id);
  expect(waiting.length).toBeGreaterThan(0);
  g.command(owner,{type:'stop',actors:[active.worker]});g.tick();
  expect(g.state.jobs.find(j=>j.id===waiting[0].id)?.phase).toBe('work');
  expect(g.state.jobs.find(j=>j.id===active.id)).toBeUndefined();
 });
 it('restores active and waiting harvesters to the same full simulation/checksums',()=>{
  const {g}=queued(),restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
  for(let i=0;i<600;i++){g.tick();restored.tick();if(i%40===0)expect(restored.checksum()).toBe(g.checksum());}
  expect(restored.snapshot()).toEqual(g.snapshot());expect(restored.checksum('full')).toBe(g.checksum('full'));
 });
 it('releases a killed active miner and a cancelled waiting job without retaining phantom queue entries',()=>{
  const {g}=queued();
  const active=g.state.jobs.find(j=>j.phase==='work'&&g.state.jobs.some(other=>other.source===j.source&&other.phase==='wait'))!;
  const waiting=g.state.jobs.find(j=>j.source===active.source&&j.phase==='wait')!;
  g.command(owner,{type:'stop',actors:[waiting.worker]});
  g.context.get(active.worker)!.hp=0;run(g,3);
  expect(g.state.jobs.some(j=>j.id===active.id||j.id===waiting.id)).toBe(false);
  const source=g.context.get(active.source)!,before=source.resource!.amount;run(g,240);
  expect(source.resource!.amount).toBeLessThan(before);
  expect(g.state.jobs.filter(j=>j.source===active.source&&j.phase==='work').length).toBeLessThanOrEqual(1);
 });
 it('shares extraction capacity across opposing players and replays their commands identically',()=>{
  const {g,nodes}=site(8);
  const rival=g.context.create({...placed('rival','unit.ants.settler',nodes[1].x+.5,253),owner:'player.2'});
  g.spatial.rebuild();g.observation.update();
  const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
  for(const instance of [g,restored])expect(instance.command('player.2',{type:'gather',actors:[rival.id],target:nodes[1].id}).accepted).toBe(true);
  let extracted=false;
  for(let i=0;i<800;i++){
   g.tick();restored.tick();
   if(rival.unit!.cargo)extracted=true;
   for(const node of nodes)expect(g.state.jobs.filter(j=>j.source===node.id&&j.phase==='work').length).toBeLessThanOrEqual(1);
   if(i%40===0)expect(restored.checksum()).toBe(g.checksum());
  }
  expect(extracted).toBe(true);expect(restored.snapshot()).toEqual(g.snapshot());
 });
 it('rejects missing/future queue arrival and overbooked extraction in saves',()=>{
  const {g}=queued();
  for(const change of ['missing','future','overbook'] as const){
   const saved=g.snapshot(),wait=saved.state.jobs.find(j=>j.phase==='wait')!;
   if(change==='missing')delete wait.arrivedTick;
   if(change==='future')wait.arrivedTick=saved.state.tick+1;
   if(change==='overbook')wait.phase='work';
   expect(()=>g.restore(saved)).toThrow(/harvesting queue|extraction capacity/);
  }
 });
 it('conserves a final partial node load with oversaturation and drains exhausted queues',()=>{
  const {g,nodes}=site(12,17),before=g.state.wallets[owner]['item.amber'];run(g,1400);
  expect(nodes.every(n=>n.resource!.amount===0)).toBe(true);
  expect(g.state.wallets[owner]['item.amber']).toBe(before+68);
  expect(g.state.jobs.filter(j=>nodes.some(n=>n.id===j.source))).toHaveLength(0);
 });
 it('measures saturation instead of multiplying income by assigned worker count',()=>{
  const measured:number[]=[];
  for(const count of [4,8,12]){
   const {g}=site(count);run(g,400);const start=g.state.wallets[owner]['item.amber'];run(g,2400);
   measured.push(g.state.wallets[owner]['item.amber']-start);
  }
  expect(measured).toEqual([610,1200,1200]);
  expect(measured[1]).toBeGreaterThan(measured[0]);
  expect(measured[2]).toBeLessThanOrEqual(1200);
  expect(measured[2]-measured[1]).toBeLessThanOrEqual(60);
 },30000);
});
