import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '../../src/content/registry';
import { Game } from '../../src/sim/game/game';
import { colonySupply } from '../../src/sim/game/supply';
import { commandCard, costs } from '../../src/presentation/commands';
import { game, placed, run, slots, source } from './helpers';

const pool=(g:Game,owner='player.1')=>colonySupply(g.entities,owner,g.registry);
function setup(){
 const g=game([placed('mound','building.ants.house',245,240),placed('b','building.ants.barracks',205,210),placed('c','building.ants.barracks',235,210)]);
 const b=g.entities.find(e=>e.placement==='b')!,c=g.entities.find(e=>e.placement==='c')!,mound=g.entities.find(e=>e.placement==='mound')!,hall=g.context.get(g.state.objectives['player.1'])!;
 hall.inventory={'item.amber':10000,'item.wood':10000,'item.root':1000};
 const train=(actor=b.id,definition='unit.ants.warrior')=>g.command('player.1',{type:'produce',actor,definition});
 return {g,b,c,mound,hall,train};
}

describe('definition-driven colony supply and direct training',()=>{
 it('starts at 12/12 and has no automatic births; mounds only add capacity',()=>{
  const g=game();expect(pool(g)).toMatchObject({used:12,reserved:0,capacity:12,available:0,limit:100});
  run(g,1000);expect(pool(g).used).toBe(12);
  const h=g.context.create(placed('mound','building.ants.house',245,240));
  expect(h.production).toBeUndefined();expect(pool(g).capacity).toBe(18);
  expect(pool(g,'player.2').capacity).toBe(12);
 });
 it('counts only completed living providers and clamps capacity at the declared maximum',()=>{
  const {g,mound}=setup();mound.construction={progress:0,supportedHp:1};expect(pool(g).capacity).toBe(12);
  delete mound.construction;mound.hp=0;expect(pool(g).capacity).toBe(12);mound.hp=100;
  const copy=Array.from({length:30},(_,i)=>({...mound,id:10000+i}));
  expect(colonySupply([...g.entities,...copy],'player.1',g.registry)).toMatchObject({capacity:100,provided:198});
 });
 it('reserves every queued unit, rejects overbooking atomically and exposes the same UI reason',()=>{
  const {g,b,c,hall,train}=setup();for(let i=0;i<6;i++)expect(train().accepted).toBe(true);
  expect(pool(g)).toMatchObject({used:12,reserved:6,committed:18,available:0});
  const inventory=structuredClone(hall.inventory),next=g.state.nextQueue;
  expect(train(c.id)).toMatchObject({accepted:false});expect(hall.inventory).toEqual(inventory);expect(g.state.nextQueue).toBe(next);
  expect(commandCard(g.view('player.1'),[c.id],'player.1',g.registry).find(c=>c.targetDefinition==='unit.ants.warrior')).toMatchObject({enabled:false,reason:expect.stringContaining('supply')});
  const q=b.production!.queue[5].id;g.command('player.1',{type:'cancel',actor:b.id,queue:q});
  expect(pool(g).available).toBe(1);expect(train(c.id).accepted).toBe(true);
 });
 it('trains at a distant barracks without claiming or converting any worker',()=>{
  const {g,b,train}=setup();const workers=g.entities.filter(e=>e.definition==='unit.ants.settler');
  for(const w of workers)w.unit!.order={type:'hold'};
  b.x=128;b.y=128;g.spatial.rebuild();
  const ids=new Set(g.entities.map(e=>e.id));expect(train().accepted).toBe(true);run(g,40);
  expect(b.production!.produced).toBe(1);
  expect(g.entities.filter(e=>!ids.has(e.id))).toMatchObject([{definition:'unit.ants.warrior',owner:'player.1'}]);
  expect(workers.every(w=>w.definition==='unit.ants.settler'&&w.unit!.order?.type==='hold')).toBe(true);
  expect(g.state.jobs.some(j=>j.target===b.id)).toBe(false);
  expect(pool(g)).toMatchObject({used:13,reserved:0});
 });
 it('finishes active training after capacity loss but blocks the next unit until supply is restored',()=>{
  const {g,b,mound,train}=setup();train();train();run(g,10);expect(b.production!.active?.progress).toBe(10);
  g.economy.remove(mound);expect(pool(g)).toMatchObject({capacity:12,used:12,reserved:2});
  run(g,30);expect(b.production!.produced).toBe(1);expect(pool(g)).toMatchObject({used:13,reserved:1});
  run(g,20);expect(b.production!.active).toBeNull();expect(b.production!.status).toContain('Supply blocked');
  g.context.create(placed('replacement','building.ants.house',245,240));run(g,40);expect(b.production!.produced).toBe(2);
 });
 it('rechecks supply between enqueue and training start, admitting only as many simultaneous starts as fit',()=>{
  const {g,b,c,mound,train}=setup();train();train(c.id);g.economy.remove(mound);
  const warrior=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!;g.economy.remove(warrior);
  g.tick();expect([b,c].filter(e=>e.production!.active)).toHaveLength(1);expect(pool(g)).toMatchObject({used:11,training:1,reserved:2});
  run(g,80);expect(b.production!.produced+c.production!.produced).toBe(1);
 });
 it('does not reclaim a paused active reservation after capacity loss',()=>{
  const {g,b,mound,train}=setup();train();run(g,10);g.economy.pause(b,true);g.economy.remove(mound);
  run(g,50);expect(b.production!.active?.progress).toBe(10);expect(pool(g).training).toBe(1);
  g.economy.pause(b,false);run(g,30);expect(b.production!.produced).toBe(1);
 });
 it('releases supply on unit death and trainer destruction without affecting other players',()=>{
  const {g,b,train}=setup();train();train();expect(pool(g).reserved).toBe(2);
  g.economy.remove(b);expect(pool(g).reserved).toBe(0);
  const w=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!;g.economy.remove(w);
  expect(pool(g).used).toBe(11);expect(pool(g,'player.2')).toMatchObject({used:12,reserved:0});
 });
 it('hall worker escrow cannot be spent twice and cancel makes it available exactly once',()=>{
  const {g,b,hall,train}=setup();hall.inventory={'item.amber':150};
  expect(train(hall.id,'unit.ants.settler').accepted).toBe(true);
  expect(g.economy.available(hall,'item.amber')).toBe(75);
  expect(train(b.id).accepted).toBe(false);
  const id=hall.production!.queue[0].id;expect(g.command('player.1',{type:'cancel',actor:hall.id,queue:id}).accepted).toBe(true);
  expect(g.economy.available(hall,'item.amber')).toBe(150);
  expect(g.command('player.1',{type:'cancel',actor:hall.id,queue:id}).accepted).toBe(false);
  expect(train(b.id).accepted).toBe(true);
 });
 it('trains paid workers at the hall and obeys its rally point',()=>{
  const {g,hall,train}=setup();hall.production!.rally={x:230,y:233};
  expect(train(hall.id,'unit.ants.settler').accepted).toBe(true);run(g,479);expect(hall.production!.produced).toBe(0);
  g.tick();expect(hall.production!.produced).toBe(1);expect(g.state.accounting.consumed['item.amber']).toBe(75);
  expect(g.entities.at(-1)!.unit!.order).toMatchObject({type:'move',destination:{x:230,y:233}});
 });
 it('sets and clears the rally through the command channel',()=>{
  const {g,hall}=setup();
  expect(g.command('player.1',{type:'rally',actor:hall.id,destination:{x:228,y:231}}).accepted).toBe(true);
  expect(hall.production!.rally).toEqual({x:228,y:231});
  expect(g.command('player.1',{type:'rally',actor:hall.id,destination:null}).accepted).toBe(true);
  expect(hall.production!.rally).toBeNull();
 });
 it('counts garrisoned units and reserves fallen hero revival once; started revival survives supply loss',()=>{
  const {g,mound}=setup();const hero=g.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.marshal')!;
  hero.hp=0;hero.fallen=true;expect(pool(g).used).toBe(7);
  const altar=g.context.create(placed('altar','building.ants.sanctuary',200,240));altar.readyTick=0;
  expect(g.revival.enqueue(altar,hero.id)).toBeNull();expect(pool(g)).toMatchObject({used:7,reserved:5});
  expect(g.revival.enqueue(altar,hero.id)).toContain('already');
  g.revival.tick();expect(pool(g).training).toBe(5);g.economy.remove(mound);
  const fort=g.context.get(g.state.objectives['player.1'])!;fort.construction={progress:0,supportedHp:1};
  const ticks=g.registry.get(altar.definition).behaviors.revival!.workTicks;
  for(let i=0;i<ticks;i++)g.revival.tick();
  expect(hero.fallen).toBeUndefined();expect(pool(g)).toMatchObject({used:12,reserved:0,capacity:0});
  hero.unit!.contained=altar.id;expect(pool(g).used).toBe(12);
 });
 it('restores ongoing over-capacity training and pending reservations deterministically',()=>{
  const {g,b,mound,train}=setup();train();train();run(g,10);g.economy.remove(mound);
  const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
  run(g,100);run(restored,100);expect(restored.snapshot()).toEqual(g.snapshot());expect(pool(restored)).toEqual(pool(g));expect(b.production!.produced).toBe(1);
 });
 it('validates supply declarations and exposes costs without worker inputs',()=>{
  const draft=source();const warrior=(draft.definitions as any[]).find(d=>d.id==='unit.ants.warrior');
  delete warrior.supplyCost;expect(()=>new ContentRegistry(draft)).toThrow(/supplyCost/);
  const g=game();expect(costs(g.registry,'unit.ants.archer').at(-1)).toMatchObject({kind:'supply',amount:1});
  for(const d of g.registry.definitions){if(d.kind==='unit')expect(d.supplyCost).toBeGreaterThanOrEqual(0);expect(d.creation??{}).not.toHaveProperty('unitInput');}
 });
});
