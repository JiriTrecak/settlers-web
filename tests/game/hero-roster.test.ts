import {expect,it,vi} from 'vitest';
import {game,placed,run,slots,source} from './helpers';
import {Game} from '../../src/sim/game/game';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {heroRoster} from '../../src/content/heroRoster';
import {revivalTerms} from '../../src/content/revival';
import {prerequisiteReason} from '../../src/content/prerequisites';
import {commandCard,queueCard} from '../../src/presentation/commands';
import {Frame,Geography} from '../../src/sim/ai/frame';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {newAIState} from '../../src/sim/ai/state';
import {economy} from '../../src/sim/ai/economy';
import type {Action} from '../../src/shared/types/types';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {localMatch} from '../../src/shared/match/match';
const second='unit.test.warden',third='unit.test.mender',fourth='unit.test.scout';
const amber='item.test.amber',wood='item.test.wood',funds={[amber]:6000,[wood]:2000};
type Cost=readonly {item:string;amount:number}[]|undefined;
const cost=(items:Cost,item:string)=>items?.find(i=>i.item===item)?.amount??0;
function setup(tier=1,queueCapacity=4){
 const g=game([placed('altar','building.test.sanctuary',193.5,237.5),placed('backup','building.test.sanctuary',165.5,237.5),placed('supply','building.test.house',245,240)],s=>{
  const defs=s.definitions as AuthoredDefinition[],marshal=defs.find(d=>d.id==='unit.test.marshal')!;
  for(const [index,id] of [second,third,fourth].entries())defs.push({...structuredClone(marshal),id,name:['Warden','Mender','Scout'][index],displayOrder:index+1});
  const altar=defs.find(d=>d.id==='building.test.sanctuary')!;
  altar.behaviors!.production!.outputs=['unit.test.marshal',second,third,fourth,'unit.test.settler'];
  altar.behaviors!.production!.queueCapacity=queueCapacity;altar.behaviors!.revival!.queueCapacity=queueCapacity;
 });
 const hall=g.context.get(g.state.objectives['player.1'])!,altar=g.entities.find(e=>e.placement==='altar')!,backup=g.entities.find(e=>e.placement==='backup')!;
 hall.definition=['building.test.fort','building.test.great-mound','building.test.elder-hall'][tier-1];
 hall.hp=g.registry.get(hall.definition).body!.maxHp;
 g.state.wallets['player.1']={...funds};g.observation.update();
 const hero=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!;
 const train=(definition=second,actor=altar.id)=>g.command('player.1',{type:'produce',actor,definition});
 const fall=()=>{g.economy.remove(hero);g.revival.retain(hero);g.observation.update();};
 const roster=()=>heroRoster(g.context.populationCandidates(),'player.1',g.registry);
 return {g,hall,altar,backup,hero,train,fall,roster};
}
it('counts the highest completed Hall, not their sum or an unfinished upgrade',()=>{
 const {g,hall,roster,train}=setup();
 const first=g.registry.get('building.test.fort').upgrade!,next=g.registry.get('building.test.great-mound').upgrade!,hire=g.registry.get(second).creation!.items;
 g.context.create(placed('extra-hall','building.test.fort',101.5,101.5));
 const future=g.context.create(placed('future-hall','building.test.elder-hall',61.5,101.5),false);
 expect(roster()).toMatchObject({capacity:1,used:1});expect(train()).toMatchObject({accepted:false,reason:expect.stringContaining('roster full')});
 expect(g.command('player.1',{type:'upgrade',actor:hall.id}).accepted).toBe(true);run(g,first.workTicks-1);
 expect(roster().capacity).toBe(1);g.tick();expect(roster().capacity).toBe(2);expect(train().accepted).toBe(true);
 expect(g.command('player.1',{type:'upgrade',actor:hall.id}).accepted).toBe(true);run(g,next.workTicks-1);expect(roster().capacity).toBe(2);
 g.tick();expect(roster().capacity).toBe(3);expect(train(third).accepted).toBe(true);
 const spent=(item:string)=>cost(first.items,item)+cost(next.items,item)+2*cost(hire,item);
 expect(g.state.wallets['player.1']).toEqual({[amber]:funds[amber]-spent(amber),[wood]:funds[wood]-spent(wood)});
 expect(future.construction).toBeDefined();
});
it('reserves distinct heroes across trainers immediately, including fallen veterans, and shows the same UI reason',()=>{
 const {g,altar,backup,hero,train,fall,roster}=setup(2);fall();
 expect(roster()).toMatchObject({capacity:2,used:1});expect(train(hero.definition).accepted).toBe(false);
 expect(train().accepted).toBe(true);const paid=structuredClone(g.state.wallets['player.1']);
 expect(train(second,backup.id)).toMatchObject({accepted:false,reason:expect.stringContaining('already belongs')});
 expect(train(third,backup.id)).toMatchObject({accepted:false,reason:expect.stringContaining('roster full')});expect(g.state.wallets['player.1']).toEqual(paid);
 g.observation.update();const buttons=commandCard(g.view('player.1'),[altar.id],'player.1',g.registry);
 expect(buttons.find(b=>b.targetDefinition===second)).toMatchObject({enabled:false,reason:expect.stringContaining('already belongs')});
 expect(buttons.find(b=>b.targetDefinition===third)).toMatchObject({enabled:false,reason:expect.stringContaining('roster full')});
 expect(g.command('player.1',{type:'revive',actor:backup.id,hero:hero.id}).accepted).toBe(true);expect(roster().used).toBe(2);
});
it('cancellation and destruction release unborn reservations but never a fallen hero slot',()=>{
 const {g,altar,backup,train,fall,roster}=setup(2);fall();train();
 expect(g.command('player.1',{type:'cancel',actor:altar.id,queue:altar.production!.queue[0].id}).accepted).toBe(true);
 expect(roster().used).toBe(1);expect(g.state.wallets['player.1'][amber]).toBe(funds[amber]);
 train();g.economy.remove(altar);expect(roster().used).toBe(1);expect(g.state.wallets['player.1'][amber]).toBe(funds[amber]-cost(g.registry.get(second).creation!.items,amber));
 expect(train(third,backup.id).accepted).toBe(true);expect(roster().used).toBe(2);
});
it('finishes a paid recruit after Hall loss, holding its reservation behind a blocked exit across restore',()=>{
 const {g,hall,altar,train,roster}=setup(2);train();g.tick();g.economy.remove(hall);
 const work=g.registry.get(second).creation!.workTicks;
 const nearest=vi.spyOn(g.spatial,'deployment').mockReturnValue(null);run(g,work+100);
 expect(altar.production!.active?.progress).toBe(work);expect(roster()).toMatchObject({used:2,capacity:0});expect(train(third).accepted).toBe(false);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());nearest.mockRestore();g.tick();restored.tick();
 expect(g.entities.filter(e=>e.owner==='player.1'&&e.definition===second)).toHaveLength(1);expect(g.snapshot()).toEqual(restored.snapshot());
});
it.each(['revival','production'] as const)('serializes a mixed Sanctuary queue starting with %s, including pause and cold restore',first=>{
 const {g,altar,hero,train,fall}=setup(2,2);fall();
 const revive=()=>g.command('player.1',{type:'revive',actor:altar.id,hero:hero.id});
 const revival=revivalTerms(g.registry.get(altar.definition).behaviors.revival!,g.context.stats(hero).level),recruit=g.registry.get(second).creation!;
 const reviveName=`Revive ${g.registry.get(hero.definition).name}`,recruitName=g.registry.get(second).name;
 if(first==='revival'){expect(revive().accepted).toBe(true);expect(train().accepted).toBe(true);}else{expect(train().accepted).toBe(true);expect(revive().accepted).toBe(true);}
 expect(train('unit.test.settler')).toMatchObject({accepted:false,reason:'Queue is full'});
 run(g,100);g.observation.update();const queue=queueCard(g.view('player.1'),altar.id,'player.1',g.registry);
 expect(queue.map(q=>q.name)).toEqual(first==='revival'?[reviveName,recruitName]:[recruitName,reviveName]);
 expect(queue[0].progress).toBeCloseTo(100/(first==='revival'?revival.workTicks:recruit.workTicks));expect(queue[1].progress??0).toBe(0);
 const before=structuredClone({p:altar.production,r:altar.revival});g.command('player.1',{type:'pause',actor:altar.id,paused:true});run(g,20);
 expect(altar.revival).toEqual(before.r);expect(altar.production!.active).toEqual(before.p!.active);g.command('player.1',{type:'pause',actor:altar.id,paused:false});
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 const remaining=revival.workTicks+recruit.workTicks-100-1;run(g,remaining);run(restored,remaining);expect(g.snapshot()).toEqual(restored.snapshot());
 expect(altar.production!.queue.length+altar.revival!.queue.length).toBe(1);g.tick();restored.tick();
 expect(altar.production!.queue.length+altar.revival!.queue.length).toBe(0);expect(g.snapshot()).toEqual(restored.snapshot());
 expect(g.state.wallets['player.1'][amber]).toBe(funds[amber]-cost(recruit.items,amber)-cost(revival.items,amber));
});
it('rejects forged mixed ordering, identity and duplicate recruitment atomically',()=>{
 const {g,altar,backup,hero,train,fall}=setup(3);fall();train();g.command('player.1',{type:'revive',actor:altar.id,hero:hero.id});train(third);run(g,20);
 const before=g.checksum('full');
 const patches=[
  (s:ReturnType<Game['snapshot']>)=>{s.state.entities.find(e=>e.id===altar.id)!.revival!.queue[0].progress=1;},
  (s:ReturnType<Game['snapshot']>)=>{s.state.entities.find(e=>e.id===altar.id)!.production!.queue.reverse();},
  (s:ReturnType<Game['snapshot']>)=>{s.state.entities.find(e=>e.id===altar.id)!.revival!.queue[0].id=s.state.nextQueue;},
  (s:ReturnType<Game['snapshot']>)=>{const b=s.state.entities.find(e=>e.id===backup.id)!;b.production!.queue.push({id:s.state.nextQueue++,definition:second});b.inventory=Object.fromEntries(g.registry.get(second).creation!.items.map(i=>[i.item,i.amount]));},
 ];
 for(const patch of patches){const saved=g.snapshot();patch(saved);expect(()=>g.restore(saved)).toThrow();expect(g.checksum('full')).toBe(before);}
});
it('upgraded Halls satisfy lower-tier requirements for commands, research and the AI',()=>{
 const {g}=setup(3);const hunter=g.registry.get('unit.test.hunter');
 expect(prerequisiteReason(hunter,'player.1',g.entities,g.registry)).toBeUndefined();
 const geo=new Geography(createMapBriefing(g.map,g.registry));expect(new Frame(g.view('player.1'),'player.1',g.registry,geo,0).available(hunter)).toBe(true);
 const r=Object.values(g.registry.rules.research).find(r=>r.requires?.includes('building.test.great-mound'));
 if(r)expect(prerequisiteReason(r,'player.1',g.entities,g.registry)).toBeUndefined();
 expect(g.registry.fulfilledPrerequisites('building.test.elder-hall')).toEqual(expect.arrayContaining(['building.test.fort','building.test.great-mound','building.test.elder-hall']));
});
it('validates upgrade cycles, building-only capacities and matching workplace policies',()=>{
 for(const [mutate,error] of [
  [(d:AuthoredDefinition[])=>{const a=d.find(d=>d.id==='building.test.elder-hall')!,b=structuredClone(a);b.id='building.test.loop';a.upgrade={target:b.id,items:[],workTicks:1};b.upgrade={target:a.id,items:[],workTicks:1};d.push(b);},/upgrade cycle/],
  [(d:AuthoredDefinition[])=>{d.find(d=>d.id==='unit.test.marshal')!.heroCapacity=2;},undefined],
  [(d:AuthoredDefinition[])=>{d.find(d=>d.id==='building.test.sanctuary')!.behaviors!.production!.queueCapacity=3;},undefined],
 ] as const){const s=source();mutate(s.definitions as AuthoredDefinition[]);expect(()=>new ContentRegistry(s)).toThrow(error);}
});
it('AI recruits an eligible distinct hero through the normal command interface, never a duplicate',()=>{
 const {g,altar}=setup(2);
 for(let i=0;i<4;i++)g.context.create(placed('extra-worker-'+i,'unit.test.settler',100+i*4,180));
 for(let i=0;i<4;i++)g.context.create(placed('army-'+i,'unit.test.warrior',100+i*4,190));
 g.context.create(placed('barracks','building.test.barracks',141.5,193.5));g.observation.update();
 const geo=new Geography(createMapBriefing(g.map,g.registry));
 const choose=()=>{const actions:Action[]=[];economy(new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick),newAIState(geo.map.fingerprint,1),a=>{actions.push(a);return true;});return actions[0];};
 const action=choose();expect(action).toEqual({type:'produce',actor:altar.id,definition:second});expect(g.command('player.1',action).accepted).toBe(true);
 g.observation.update();expect(choose()).not.toEqual(action);
});
it('keeps independent multiplayer peers identical across tier upgrade, recruitment, cancellation and restore',()=>{
 const a=setup(2),b=setup(2),games=[a.g,b.g],upgrade=a.g.registry.get('building.test.great-mound').upgrade!.workTicks;
 const config={...localMatch({mapId:'hero-roster',mapRevision:'hero-roster',seed:1,slotCount:2,me:0,delay:3}),slots};
 const room=new Room(config),channels=[0,1].map(i=>new MemoryChannel(room,i)),peers=channels.map((c,i)=>new Lockstep(c,i,3));
 for(let tick=1;tick<=upgrade+300;tick++){
  if(tick===1)peers[0].send({type:'upgrade',actor:a.hall.id});
  if(tick===2||tick===110)peers[0].send({type:'produce',actor:a.altar.id,definition:second});
  if(tick===100)peers[0].send({type:'cancel',actor:a.altar.id,queue:a.altar.production!.queue[0].id});
  if(tick===upgrade+100)peers[0].send({type:'produce',actor:a.altar.id,definition:third});
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){const commit=peers[i].take(tick)!;expect(commit).not.toBeNull();for(const slot of commit.slots)for(const action of slot.actions)expect(games[i].command(`player.${slot.player+1}`,action).accepted).toBe(true);games[i].tick();}
  if(tick===1000){const restored=new Game(b.g.map,slots,b.g.registry);restored.restore(games[1].snapshot());games[1]=restored;}
  if(tick%40===0){expect(games[1].checksum('full')).toBe(games[0].checksum('full'));expect(games[1].checksum()).toBe(games[0].checksum());}
 }
 expect(a.hall.definition).toBe('building.test.elder-hall');expect(a.roster()).toMatchObject({used:3,capacity:3});
});
it('does not recheck Hall tiers when an already-paid waiting hero reaches the front',()=>{
 const {g,hall,train}=setup(2);g.context.create(placed('extra-supply','building.test.house',145,241));
 expect(train('unit.test.settler').accepted).toBe(true);expect(train().accepted).toBe(true);g.economy.remove(hall);
 run(g,g.registry.get('unit.test.settler').creation!.workTicks+g.registry.get(second).creation!.workTicks);expect(g.entities.filter(e=>e.owner==='player.1'&&e.definition===second)).toHaveLength(1);
});
it('ignores temporary summons, enemy heroes and duplicate view records in roster admission',()=>{
 const {g,hero}=setup(2),own=g.context.populationCandidates();
 const roster=heroRoster([...own,hero,{...hero,id:990,definition:second,summoned:true},
  {...hero,id:991,definition:third,owner:'player.2'},{...hero,id:992,definition:fourth,remembered:true}],'player.1',g.registry);
 expect(roster).toMatchObject({used:1,capacity:2});expect([...roster.definitions]).toEqual(['unit.test.marshal']);
});
