import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {Game} from '../../src/sim/game/game';
import {colonyHome} from '../../src/sim/game/colony';
import {colonySupply} from '../../src/sim/game/supply';
import {observerStats,ObserverIncome} from '../../src/presentation/observerStats';
import {commandCard} from '../../src/presentation/commands';
import {game,placed,run,slots} from './helpers';
const owner='player.1';
const pool=(g:Game)=>colonySupply(g.entities,owner,g.registry);
const price=(id:string)=>Object.fromEntries(content.get(id).creation!.items.map(p=>[p.item,p.amount]));

function foundation() {
 const g=game([placed('builder','unit.ants.settler',100,100),placed('helper','unit.ants.settler',96,100)]);
 const builder=g.entities.find(e=>e.placement==='builder')!,helper=g.entities.find(e=>e.placement==='helper')!;
 expect(g.command(owner,{type:'build',actors:[builder.id],definition:'building.ants.house',position:{x:111.5,y:99.5}}).accepted).toBe(true);
 const project=g.entities.find(e=>e.construction)!;
 for(let i=0;i<300&&project.construction!.progress===0;i++)g.tick();
 expect(project.construction!.progress).toBeGreaterThan(0);
 return {g,builder,helper,project};
}
function production(extra=5) {
 const g=game([placed('mound','building.ants.house',245,240),placed('b','building.ants.barracks',160,180),placed('c','building.ants.barracks',184,180),
  ...Array.from({length:extra},(_,i)=>placed('extra.'+i,'unit.ants.warrior',140+i*4,200))]);
 g.state.wallets[owner]={'item.amber':10000,'item.wood':10000};
 const b=g.entities.find(e=>e.placement==='b')!,c=g.entities.find(e=>e.placement==='c')!,mound=g.entities.find(e=>e.placement==='mound')!;
 const train=(actor=b.id)=>g.command(owner,{type:'produce',actor,definition:'unit.ants.warrior'});
 return {g,b,c,mound,train};
}

it('declares the full competitive cost/time table and a buildable paid Hall',()=>{
 const entries=[['unit','settler',100,0,0,15],['unit','warrior',135,0,0,20],['unit','archer',150,20,0,24],['unit','hunter',200,40,0,30],['unit','bombardier',220,60,30,32],
  ['building','fort',400,150,0,90],['building','house',100,25,0,25],['building','barracks',200,60,0,50],['building','ironroot-forge',150,75,0,40],['building','sanctuary',180,60,0,40],['building','tower',100,50,0,35],['building','bombardier-workshop',220,120,0,50],['building','rootworks',150,75,0,40]] as const;
 for(const [kind,name,a,w,r,seconds] of entries){
  const id=`${kind}.ants.${name}`,bill=Object.fromEntries([['item.amber',a],['item.wood',w],['item.root',r]].filter(([,n])=>n));
  expect(price(id)).toEqual(bill);expect(content.get(id).creation!.workTicks).toBe(seconds*40);
 }
 expect(content.get('unit.ants.settler').behaviors.work!.builds).toContain('building.ants.fort');
 expect(content.get('building.ants.great-mound').creation).toBeUndefined();
 expect(content.get('building.ants.fort').upgrade).toMatchObject({workTicks:3200,items:[{item:'item.amber',amount:450},{item:'item.wood',amount:200}]});
});

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

it('refunds 75% of construction once, rounds each resource down and records the remainder as loss',()=>{
 const {g,project}=foundation();
 expect(commandCard(g.view(owner),[project.id],owner,g.registry)[0].description).toContain('75%');
 expect(g.command(owner,{type:'cancel',actor:project.id}).accepted).toBe(true);
 expect(g.state.wallets[owner]).toEqual({'item.amber':475,'item.wood':143});
 expect(g.state.accounting.lost).toMatchObject({'item.amber':25,'item.wood':7});
 expect(g.command(owner,{type:'cancel',actor:project.id}).accepted).toBe(false);
 expect(g.state.wallets[owner]).toEqual({'item.amber':475,'item.wood':143});
});

it('loses destroyed construction escrow without touching the remaining wallet',()=>{
 const {g,project}=foundation(),before={...g.state.wallets[owner]};
 g.economy.remove(project);expect(g.state.wallets[owner]).toEqual(before);
 expect(g.state.accounting.lost).toMatchObject({'item.amber':100,'item.wood':25});
});

it('rebuilds a lost Hall while another building or foundation survives, preserving wallet and observer status',()=>{
 const g=game([placed('mound','building.ants.house',245,240)]),old=g.context.get(g.state.objectives[owner])!,position={x:old.x,y:old.y};
 const w=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work)!;
 g.economy.remove(old);g.tick();expect(g.isDefeated(owner)).toBe(false);expect(g.state.outcome).toBeNull();
 expect(observerStats(g.state,slots,g.registry,new ObserverIncome()).players[0].defeated).toBe(false);
 expect(g.command(owner,{type:'build',actors:[w.id],definition:'building.ants.fort',position}).accepted).toBe(true);
 const rebuilt=g.entities.find(e=>e.construction)!;expect(g.state.wallets[owner]).toEqual({'item.amber':100});
 g.economy.remove(g.entities.find(e=>e.placement==='mound')!);g.tick();expect(g.isDefeated(owner)).toBe(false);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,3800);run(restored,3800);expect(rebuilt.construction).toBeUndefined();expect(g.state.outcome).toBeNull();
 expect(restored.snapshot()).toEqual(g.snapshot());expect(pool(g).capacity).toBe(15);
 expect(colonyHome(g.view(owner).entities,owner,g.registry,g.state.objectives[owner])?.id).toBe(rebuilt.id);
 g.economy.remove(rebuilt);g.tick();expect(g.isDefeated(owner)).toBe(true);expect(g.state.outcome?.defeated).toContain(owner);
 expect(g.state.wallets[owner]).toEqual({'item.amber':100});
});

it('charges and refunds queued training once and never converts a worker',()=>{
 const {g,b,train}=production(),before=g.state.wallets[owner]['item.amber'],workerIds=g.entities.filter(e=>g.registry.get(e.definition).behaviors.work).map(e=>e.id);
 expect(train().accepted).toBe(true);expect(g.state.wallets[owner]['item.amber']).toBe(before-135);
 run(g,100);const q=b.production!.queue[0].id;
 expect(g.command(owner,{type:'cancel',actor:b.id,queue:q}).accepted).toBe(true);expect(g.state.wallets[owner]['item.amber']).toBe(before);
 expect(g.command(owner,{type:'cancel',actor:b.id,queue:q}).accepted).toBe(false);
 train();run(g,799);expect(b.production!.produced).toBe(0);g.tick();expect(b.production!.produced).toBe(1);
 expect(g.entities.filter(e=>g.registry.get(e.definition).behaviors.work).map(e=>e.id)).toEqual(workerIds);
});

it('completes started training after supply loss but holds subsequent work until capacity returns',()=>{
 const {g,b,mound,train}=production();train();train();run(g,20);
 expect(b.production!.active!.progress).toBe(20);g.economy.remove(mound);expect(pool(g)).toMatchObject({used:15,capacity:15,reserved:2});
 run(g,780);expect(b.production!.produced).toBe(1);run(g,80);expect(b.production!.active).toBeNull();expect(pool(g)).toMatchObject({used:16,reserved:1});
 g.context.create(placed('replacement','building.ants.house',245,240));run(g,800);expect(b.production!.produced).toBe(2);
});

it('rechecks supply for simultaneous starts and preserves the result across a cold restore',()=>{
 const {g,b,c,mound,train}=production(4);train();train(c.id);g.economy.remove(mound);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 g.tick();restored.tick();expect([b,c].filter(e=>e.production!.active)).toHaveLength(1);expect(pool(g)).toMatchObject({used:14,training:1});
 run(g,1000);run(restored,1000);expect(b.production!.produced+c.production!.produced).toBe(1);expect(restored.snapshot()).toEqual(g.snapshot());
});

it('upgrades without Root, retains its footprint and supply, accepts deliveries, and pauses worker production',()=>{
 const g=game(),hall=g.context.get(g.state.objectives[owner])!;g.state.wallets[owner]={'item.amber':2000,'item.wood':2000};
 expect(g.command(owner,{type:'produce',actor:hall.id,definition:'unit.ants.settler'}).accepted).toBe(true);run(g,10);
 expect(g.command(owner,{type:'upgrade',actor:hall.id}).accepted).toBe(true);
 const cells=g.spatial.footprint(hall),before=g.state.wallets[owner]['item.amber'];
 const w=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work)!;
 const began=g.state.tick;w.unit!.cargo={item:'item.amber',amount:10};
 for(let i=0;i<500&&g.state.wallets[owner]['item.amber']===before;i++)g.tick();
 expect(g.state.wallets[owner]['item.amber']).toBe(before+10);run(g,3200-(g.state.tick-began));
 expect(hall.definition).toBe('building.ants.great-mound');expect(g.spatial.footprint(hall)).toEqual(cells);expect(pool(g).capacity).toBe(15);
 expect(hall.production!.active?.progress).toBe(10);run(g,590);expect(hall.production!.produced).toBe(1);
});

for(const append of [false,true])it(`rebuilds a drop-off with a loaded worker (${append?'queued':'immediate'} order) without deleting or crediting cargo early`,()=>{
 const g=game([placed('mound','building.ants.house',245,240)]),old=g.context.get(g.state.objectives[owner])!,position={x:old.x,y:old.y};
 const w=g.entities.find(e=>e.owner===owner&&g.registry.get(e.definition).behaviors.work)!;
 g.economy.remove(old);w.unit!.cargo={item:'item.amber',amount:10};
 expect(g.command(owner,{type:'build',actors:[w.id],definition:'building.ants.fort',position,append}).accepted).toBe(true);
 const project=g.entities.find(e=>e.construction)!;run(g,500);
 expect(project.construction!.progress).toBeGreaterThan(0);expect(w.unit!.cargo).toEqual({item:'item.amber',amount:10});
 expect(g.state.wallets[owner]['item.amber']).toBe(100);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,3600);run(restored,3600);expect(restored.snapshot()).toEqual(g.snapshot());
 expect(project.construction).toBeUndefined();expect(w.unit!.cargo).toBeNull();expect(g.state.wallets[owner]['item.amber']).toBe(110);
});
