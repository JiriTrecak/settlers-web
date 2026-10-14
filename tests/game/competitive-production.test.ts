import {expect,it} from 'vitest';
import {testContent} from '../fixtures/content';
import {Game} from '../../src/sim/game/game';
import {colonyHome} from '../../src/sim/game/colony';
import {colonySupply} from '../../src/sim/game/supply';
import {observerStats,ObserverIncome} from '../../src/presentation/observerStats';
import {commandCard} from '../../src/presentation/commands';
import {game,placed,run,slots} from './helpers';
const owner='player.1';
const pool=(g:Game)=>colonySupply(g.entities,owner,g.registry);
// Every expectation below is derived from the test world, so the rules (not a balance table) are specified here.
const rules=testContent.rules,setup=rules.startingSetup,hallDef=setup.fort,house='building.test.house',soldier='unit.test.warrior';
const price=(id:string)=>Object.fromEntries(testContent.get(id).creation!.items.map(p=>[p.item,p.amount])) as Record<string,number>;
const workTicks=(id:string)=>testContent.get(id).creation!.workTicks;
const supply=(id:string)=>testContent.get(id).supplyCost??0;
/** The starting wallet after paying for `id`, omitting emptied currencies as the wallet does. */
const afterPaying=(id:string)=>Object.fromEntries(Object.entries(setup.inventory).map(([k,v])=>[k,v-(price(id)[k]??0)]).filter(([,v])=>v));
const startingSupply=setup.units.reduce((n,u)=>n+supply(u.definition),0)+supply(setup.hero!.default);
/** Extra soldiers so the Hall's capacity alone leaves exactly `free` supply open. */
const fill=(free=0)=>(testContent.get(hallDef).supplyProvided!-startingSupply-free)/supply(soldier);

function foundation() {
 const g=game([placed('builder','unit.test.settler',100,100),placed('helper','unit.test.settler',96,100)]);
 const builder=g.entities.find(e=>e.placement==='builder')!,helper=g.entities.find(e=>e.placement==='helper')!;
 expect(g.command(owner,{type:'build',actors:[builder.id],definition:house,position:{x:111.5,y:99.5}}).accepted).toBe(true);
 const project=g.entities.find(e=>e.construction)!;
 for(let i=0;i<300&&project.construction!.progress===0;i++)g.tick();
 expect(project.construction!.progress).toBeGreaterThan(0);
 return {g,builder,helper,project};
}
function production(extra=fill()) {
 const g=game([placed('mound',house,245,240),placed('b','building.test.barracks',160,180),placed('c','building.test.barracks',184,180),
  ...Array.from({length:extra},(_,i)=>placed('extra.'+i,soldier,140+i*4,200))]);
 g.state.wallets[owner]={'item.test.amber':10000,'item.test.wood':10000};
 const b=g.entities.find(e=>e.placement==='b')!,c=g.entities.find(e=>e.placement==='c')!,mound=g.entities.find(e=>e.placement==='mound')!;
 const train=(actor=b.id)=>g.command(owner,{type:'produce',actor,definition:soldier});
 return {g,b,c,mound,train};
}

it('pauses a foundation without its builder and resumes only on an explicit order',()=>{
 const {g,builder,helper,project}=foundation(),before=project.construction!.progress;
 g.command(owner,{type:'stop',actors:[builder.id]});run(g,150);
 expect(project.construction!.progress).toBe(before);
 expect(g.state.jobs.some(j=>j.type==='construct'&&j.target===project.id)).toBe(false);
 const wallet={...g.state.wallets[owner]};
 expect(g.command(owner,{type:'construct',actors:[helper.id],target:project.id}).accepted).toBe(true);
 for(let i=0;i<300&&project.construction!.progress===before;i++)g.tick();
 expect(project.construction!.progress).toBeGreaterThan(before);expect(g.state.wallets[owner]).toEqual(wallet);
 expect(g.command('player.2',{type:'construct',actors:[g.entities.find(e=>e.owner==='player.2'&&e.unit)!.id],target:project.id}).accepted).toBe(false);
});

it('allows only one productive builder even with repeated construction orders, and validates saves',()=>{
 const {g,helper,project}=foundation();
 expect(g.command(owner,{type:'construct',actors:[helper.id],target:project.id}).accepted).toBe(true);
 const before=project.construction!.progress;run(g,100);expect(project.construction!.progress-before).toBe(100);
 expect(g.state.jobs.filter(j=>j.type==='construct'&&j.target===project.id)).toHaveLength(1);
 const saved=g.snapshot(),job=saved.state.jobs.find(j=>j.type==='construct')!;
 const duplicate={...job,id:saved.state.nextJob++,worker:helper.id};saved.state.jobs.push(duplicate);saved.state.entities.find(e=>e.id===helper.id)!.unit!.job=duplicate.id;
 expect(()=>g.restore(saved)).toThrow(/construction assignment/);
});

it('refunds the declared share of construction once, rounds each resource down and records the remainder as loss',()=>{
 const {g,project}=foundation(),share=rules.constructionRefundPermille,cost=price(house);
 const refund=Object.fromEntries(Object.entries(cost).map(([k,v])=>[k,Math.floor(v*share/1000)]));
 const wallet=Object.fromEntries(Object.entries(setup.inventory).map(([k,v])=>[k,v-cost[k]!+refund[k]!]));
 expect(Object.values(cost).some(v=>v*share%1000!==0)).toBe(true); // The fixture exercises rounding.
 expect(commandCard(g.view(owner),[project.id],owner,g.registry)[0].description).toContain(`${share/10}%`);
 expect(g.command(owner,{type:'cancel',actor:project.id}).accepted).toBe(true);
 expect(g.state.wallets[owner]).toEqual(wallet);
 expect(g.state.accounting.lost).toMatchObject(Object.fromEntries(Object.entries(cost).map(([k,v])=>[k,v-refund[k]!])));
 expect(g.command(owner,{type:'cancel',actor:project.id}).accepted).toBe(false);
 expect(g.state.wallets[owner]).toEqual(wallet);
});

it('loses destroyed construction escrow without touching the remaining wallet',()=>{
 const {g,project}=foundation(),before={...g.state.wallets[owner]};
 g.economy.remove(project);expect(g.state.wallets[owner]).toEqual(before);
 expect(g.state.accounting.lost).toMatchObject(price(house));
});

it('rebuilds a lost Hall while another building or foundation survives, preserving wallet and observer status',()=>{
 const g=game([placed('mound',house,245,240)]),old=g.context.get(g.state.objectives[owner])!,position={x:old.x,y:old.y};
 const w=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work)!;
 g.economy.remove(old);g.tick();expect(g.isDefeated(owner)).toBe(false);expect(g.state.outcome).toBeNull();
 expect(observerStats(g.state,slots,g.registry,new ObserverIncome()).players[0].defeated).toBe(false);
 expect(g.command(owner,{type:'build',actors:[w.id],definition:hallDef,position}).accepted).toBe(true);
 const rebuilt=g.entities.find(e=>e.construction)!;expect(g.state.wallets[owner]).toEqual(afterPaying(hallDef));
 g.economy.remove(g.entities.find(e=>e.placement==='mound')!);g.tick();expect(g.isDefeated(owner)).toBe(false);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,workTicks(hallDef)+200);run(restored,workTicks(hallDef)+200);expect(rebuilt.construction).toBeUndefined();expect(g.state.outcome).toBeNull();
 expect(restored.snapshot()).toEqual(g.snapshot());expect(pool(g).capacity).toBe(testContent.get(hallDef).supplyProvided);
 expect(colonyHome(g.view(owner).entities,owner,g.registry,g.state.objectives[owner])?.id).toBe(rebuilt.id);
 g.economy.remove(rebuilt);g.tick();expect(g.isDefeated(owner)).toBe(true);expect(g.state.outcome?.defeated).toContain(owner);
 expect(g.state.wallets[owner]).toEqual(afterPaying(hallDef));
});

it('charges and refunds queued training once and never converts a worker',()=>{
 const {g,b,train}=production(),before=g.state.wallets[owner]['item.test.amber'],workerIds=g.entities.filter(e=>g.registry.get(e.definition).behaviors.work).map(e=>e.id);
 expect(train().accepted).toBe(true);expect(g.state.wallets[owner]['item.test.amber']).toBe(before-price(soldier)['item.test.amber']!);
 run(g,100);const q=b.production!.queue[0].id;
 expect(g.command(owner,{type:'cancel',actor:b.id,queue:q}).accepted).toBe(true);expect(g.state.wallets[owner]['item.test.amber']).toBe(before);
 expect(g.command(owner,{type:'cancel',actor:b.id,queue:q}).accepted).toBe(false);
 train();run(g,workTicks(soldier)-1);expect(b.production!.produced).toBe(0);g.tick();expect(b.production!.produced).toBe(1);
 expect(g.entities.filter(e=>g.registry.get(e.definition).behaviors.work).map(e=>e.id)).toEqual(workerIds);
});

it('completes started training after supply loss but holds subsequent work until capacity returns',()=>{
 const {g,b,mound,train}=production();train();train();run(g,20);
 const capacity=testContent.get(hallDef).supplyProvided!,cost=supply(soldier);
 expect(b.production!.active!.progress).toBe(20);g.economy.remove(mound);expect(pool(g)).toMatchObject({used:capacity,capacity,reserved:2*cost});
 run(g,workTicks(soldier)-20);expect(b.production!.produced).toBe(1);run(g,80);expect(b.production!.active).toBeNull();expect(pool(g)).toMatchObject({used:capacity+cost,reserved:cost});
 g.context.create(placed('replacement',house,245,240));run(g,workTicks(soldier));expect(b.production!.produced).toBe(2);
});

it('rechecks supply for simultaneous starts and preserves the result across a cold restore',()=>{
 const {g,b,c,mound,train}=production(fill(supply(soldier)));train();train(c.id);g.economy.remove(mound);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 g.tick();restored.tick();expect([b,c].filter(e=>e.production!.active)).toHaveLength(1);expect(pool(g)).toMatchObject({used:testContent.get(hallDef).supplyProvided!-supply(soldier),training:1});
 run(g,1000);run(restored,1000);expect(b.production!.produced+c.production!.produced).toBe(1);expect(restored.snapshot()).toEqual(g.snapshot());
});

it('upgrades the Hall, retains its footprint and supply, accepts deliveries, and pauses worker production',()=>{
 const g=game(),hall=g.context.get(g.state.objectives[owner])!;g.state.wallets[owner]={'item.test.amber':2000,'item.test.wood':2000};
 expect(g.command(owner,{type:'produce',actor:hall.id,definition:'unit.test.settler'}).accepted).toBe(true);run(g,10);
 expect(g.command(owner,{type:'upgrade',actor:hall.id}).accepted).toBe(true);
 const cells=g.spatial.footprint(hall),before=g.state.wallets[owner]['item.test.amber'];
 const w=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work)!;
 const began=g.state.tick;w.unit!.cargo={item:'item.test.amber',amount:10};
 for(let i=0;i<500&&g.state.wallets[owner]['item.test.amber']===before;i++)g.tick();
 const upgrade=testContent.get(hallDef).upgrade!;
 expect(g.state.wallets[owner]['item.test.amber']).toBe(before+10);run(g,upgrade.workTicks-(g.state.tick-began));
 expect(hall.definition).toBe(upgrade.target);expect(g.spatial.footprint(hall)).toEqual(cells);expect(pool(g).capacity).toBe(testContent.get(hallDef).supplyProvided);
 expect(hall.production!.active?.progress).toBe(10);run(g,workTicks('unit.test.settler')-10);expect(hall.production!.produced).toBe(1);
});

for(const append of [false,true])it(`rebuilds a drop-off with a loaded worker (${append?'queued':'immediate'} order) without deleting or crediting cargo early`,()=>{
 const g=game([placed('mound',house,245,240)]),old=g.context.get(g.state.objectives[owner])!,position={x:old.x,y:old.y};
 const w=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work)!;
 g.economy.remove(old);w.unit!.cargo={item:'item.test.amber',amount:10};
 expect(g.command(owner,{type:'build',actors:[w.id],definition:hallDef,position,append}).accepted).toBe(true);
 const project=g.entities.find(e=>e.construction)!;run(g,500);
 expect(project.construction!.progress).toBeGreaterThan(0);expect(w.unit!.cargo).toEqual({item:'item.test.amber',amount:10});
 const paid=afterPaying(hallDef)['item.test.amber']??0;
 expect(g.state.wallets[owner]['item.test.amber']).toBe(paid);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,workTicks(hallDef));run(restored,workTicks(hallDef));expect(restored.snapshot()).toEqual(g.snapshot());
 expect(project.construction).toBeUndefined();expect(w.unit!.cargo).toBeNull();expect(g.state.wallets[owner]['item.test.amber']).toBe(paid+10);
});
