import {expect,it,vi} from 'vitest';
import {game,placed,run,slots,source} from './helpers';
import {Game} from '../../src/sim/game/game';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {heroRoster} from '../../src/content/heroRoster';
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
function setup(tier=1,queueCapacity=4){
 const g=game([placed('altar','building.ants.sanctuary',193.5,237.5),placed('backup','building.ants.sanctuary',165.5,237.5),placed('supply','building.ants.house',245,240)],s=>{
  const defs=s.definitions as AuthoredDefinition[],marshal=defs.find(d=>d.id==='unit.ants.marshal')!;
  for(const [index,id] of [second,third,fourth].entries())defs.push({...structuredClone(marshal),id,name:['Warden','Mender','Scout'][index],displayOrder:index+1});
  const altar=defs.find(d=>d.id==='building.ants.sanctuary')!;
  altar.behaviors!.production!.outputs!.push(second,third,fourth,'unit.ants.settler');
  altar.behaviors!.production!.queueCapacity=queueCapacity;altar.behaviors!.revival!.queueCapacity=queueCapacity;
 });
 const hall=g.context.get(g.state.objectives['player.1'])!,altar=g.entities.find(e=>e.placement==='altar')!,backup=g.entities.find(e=>e.placement==='backup')!;
 hall.definition=['building.ants.fort','building.ants.great-mound','building.ants.elder-hall'][tier-1];
 hall.hp=g.registry.get(hall.definition).body!.maxHp;
 g.state.wallets['player.1']={'item.amber':6000,'item.wood':2000};g.observation.update();
 const hero=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!;
 const train=(definition=second,actor=altar.id)=>g.command('player.1',{type:'produce',actor,definition});
 const fall=()=>{g.economy.remove(hero);g.revival.retain(hero);g.observation.update();};
 const roster=()=>heroRoster(g.context.populationCandidates(),'player.1',g.registry);
 return {g,hall,altar,backup,hero,train,fall,roster};
}
it('counts the highest completed Hall, not their sum or an unfinished upgrade',()=>{
 const {g,hall,roster,train}=setup();
 g.context.create(placed('extra-hall','building.ants.fort',101.5,101.5));
 const future=g.context.create(placed('future-hall','building.ants.elder-hall',61.5,101.5),false);
 expect(roster()).toMatchObject({capacity:1,used:1});expect(train()).toMatchObject({accepted:false,reason:expect.stringContaining('roster full')});
 expect(g.command('player.1',{type:'upgrade',actor:hall.id}).accepted).toBe(true);run(g,3199);
 expect(roster().capacity).toBe(1);g.tick();expect(roster().capacity).toBe(2);expect(train().accepted).toBe(true);
 expect(g.command('player.1',{type:'upgrade',actor:hall.id}).accepted).toBe(true);run(g,3999);expect(roster().capacity).toBe(2);
 g.tick();expect(roster().capacity).toBe(3);expect(train(third).accepted).toBe(true);
 expect(g.state.wallets['player.1']).toEqual({'item.amber':4100,'item.wood':1350});
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
 expect(roster().used).toBe(1);expect(g.state.wallets['player.1']['item.amber']).toBe(6000);
 train();g.economy.remove(altar);expect(roster().used).toBe(1);expect(g.state.wallets['player.1']['item.amber']).toBe(5575);
 expect(train(third,backup.id).accepted).toBe(true);expect(roster().used).toBe(2);
});
it('finishes a paid recruit after Hall loss, holding its reservation behind a blocked exit across restore',()=>{
 const {g,hall,altar,train,roster}=setup(2);train();g.tick();g.economy.remove(hall);
 const nearest=vi.spyOn(g.spatial,'deployment').mockReturnValue(null);run(g,2300);
 expect(altar.production!.active?.progress).toBe(2200);expect(roster()).toMatchObject({used:2,capacity:0});expect(train(third).accepted).toBe(false);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());nearest.mockRestore();g.tick();restored.tick();
 expect(g.entities.filter(e=>e.owner==='player.1'&&e.definition===second)).toHaveLength(1);expect(g.snapshot()).toEqual(restored.snapshot());
});
it.each(['revival','production'] as const)('serializes a mixed Sanctuary queue starting with %s, including pause and cold restore',first=>{
 const {g,altar,hero,train,fall}=setup(2,2);fall();
 const revive=()=>g.command('player.1',{type:'revive',actor:altar.id,hero:hero.id});
 if(first==='revival'){expect(revive().accepted).toBe(true);expect(train().accepted).toBe(true);}else{expect(train().accepted).toBe(true);expect(revive().accepted).toBe(true);}
 expect(train('unit.ants.settler')).toMatchObject({accepted:false,reason:'Queue is full'});
 run(g,100);g.observation.update();const queue=queueCard(g.view('player.1'),altar.id,'player.1',g.registry);
 expect(queue.map(q=>q.name)).toEqual(first==='revival'?['Revive Ant Marshal','Warden']:['Warden','Revive Ant Marshal']);
 expect(queue[0].progress).toBeCloseTo(100/(first==='revival'?1200:2200));expect(queue[1].progress??0).toBe(0);
 const before=structuredClone({p:altar.production,r:altar.revival});g.command('player.1',{type:'pause',actor:altar.id,paused:true});run(g,20);
 expect(altar.revival).toEqual(before.r);expect(altar.production!.active).toEqual(before.p!.active);g.command('player.1',{type:'pause',actor:altar.id,paused:false});
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,3299);run(restored,3299);expect(g.snapshot()).toEqual(restored.snapshot());
 expect(altar.production!.queue.length+altar.revival!.queue.length).toBe(1);g.tick();restored.tick();
 expect(altar.production!.queue.length+altar.revival!.queue.length).toBe(0);expect(g.snapshot()).toEqual(restored.snapshot());
 expect(g.state.wallets['player.1']['item.amber']).toBe(5375);
});
it('rejects forged mixed ordering, identity and duplicate recruitment atomically',()=>{
 const {g,altar,backup,hero,train,fall}=setup(3);fall();train();g.command('player.1',{type:'revive',actor:altar.id,hero:hero.id});train(third);run(g,20);
 const before=g.checksum('full');
 const patches=[
  (s:ReturnType<Game['snapshot']>)=>{s.state.entities.find(e=>e.id===altar.id)!.revival!.queue[0].progress=1;},
  (s:ReturnType<Game['snapshot']>)=>{s.state.entities.find(e=>e.id===altar.id)!.production!.queue.reverse();},
  (s:ReturnType<Game['snapshot']>)=>{s.state.entities.find(e=>e.id===altar.id)!.revival!.queue[0].id=s.state.nextQueue;},
  (s:ReturnType<Game['snapshot']>)=>{const b=s.state.entities.find(e=>e.id===backup.id)!;b.production!.queue.push({id:s.state.nextQueue++,definition:second});b.inventory={'item.amber':425,'item.wood':100};},
 ];
 for(const patch of patches){const saved=g.snapshot();patch(saved);expect(()=>g.restore(saved)).toThrow();expect(g.checksum('full')).toBe(before);}
});
it('upgraded Halls satisfy lower-tier requirements for commands, research and the AI',()=>{
 const {g}=setup(3);const hunter=g.registry.get('unit.ants.hunter');
 expect(prerequisiteReason(hunter,'player.1',g.entities,g.registry)).toBeUndefined();
 const geo=new Geography(createMapBriefing(g.map,g.registry));expect(new Frame(g.view('player.1'),'player.1',g.registry,geo,0).available(hunter)).toBe(true);
 const r=Object.values(g.registry.rules.research).find(r=>r.requires?.includes('building.ants.great-mound'));
 if(r)expect(prerequisiteReason(r,'player.1',g.entities,g.registry)).toBeUndefined();
 expect(g.registry.fulfilledPrerequisites('building.ants.elder-hall')).toEqual(expect.arrayContaining(['building.ants.fort','building.ants.great-mound','building.ants.elder-hall']));
});
it('validates upgrade cycles, building-only capacities and matching workplace policies',()=>{
 for(const mutate of [
  (d:AuthoredDefinition[])=>{const a=d.find(d=>d.id==='building.ants.elder-hall')!,b=structuredClone(a);b.id='building.test.loop';a.upgrade={target:b.id,items:[],workTicks:1};b.upgrade={target:a.id,items:[],workTicks:1};d.push(b);},
  (d:AuthoredDefinition[])=>{d.find(d=>d.id==='unit.ants.marshal')!.heroCapacity=2;},
  (d:AuthoredDefinition[])=>{d.find(d=>d.id==='building.ants.sanctuary')!.behaviors!.production!.queueCapacity=3;},
 ]){const s=source();mutate(s.definitions as AuthoredDefinition[]);expect(()=>new ContentRegistry(s)).toThrow();}
});
it('AI recruits an eligible distinct hero through the normal command interface, never a duplicate',()=>{
 const {g,altar}=setup(2);
 for(let i=0;i<4;i++)g.context.create(placed('extra-worker-'+i,'unit.ants.settler',100+i*4,180));
 for(let i=0;i<4;i++)g.context.create(placed('army-'+i,'unit.ants.warrior',100+i*4,190));
 g.context.create(placed('barracks','building.ants.barracks',141.5,193.5));g.observation.update();
 const geo=new Geography(createMapBriefing(g.map,g.registry));
 const choose=()=>{const actions:Action[]=[];economy(new Frame(g.view('player.1'),'player.1',g.registry,geo,g.state.tick),newAIState(geo.map.fingerprint,1),a=>{actions.push(a);return true;});return actions[0];};
 const action=choose();expect(action).toEqual({type:'produce',actor:altar.id,definition:second});expect(g.command('player.1',action).accepted).toBe(true);
 g.observation.update();expect(choose()).not.toEqual(action);
});
it('keeps independent multiplayer peers identical across tier upgrade, recruitment, cancellation and restore',()=>{
 const a=setup(2),b=setup(2),games=[a.g,b.g];
 const config={...localMatch({mapId:'hero-roster',mapRevision:'hero-roster',seed:1,slotCount:2,me:0,delay:3}),slots};
 const room=new Room(config),channels=[0,1].map(i=>new MemoryChannel(room,i)),peers=channels.map((c,i)=>new Lockstep(c,i,3));
 for(let tick=1;tick<=4300;tick++){
  if(tick===1)peers[0].send({type:'upgrade',actor:a.hall.id});
  if(tick===2||tick===110)peers[0].send({type:'produce',actor:a.altar.id,definition:second});
  if(tick===100)peers[0].send({type:'cancel',actor:a.altar.id,queue:a.altar.production!.queue[0].id});
  if(tick===4100)peers[0].send({type:'produce',actor:a.altar.id,definition:third});
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){const commit=peers[i].take(tick)!;expect(commit).not.toBeNull();for(const slot of commit.slots)for(const action of slot.actions)expect(games[i].command(`player.${slot.player+1}`,action).accepted).toBe(true);games[i].tick();}
  if(tick===1000){const restored=new Game(b.g.map,slots,b.g.registry);restored.restore(games[1].snapshot());games[1]=restored;}
  if(tick%40===0){expect(games[1].checksum('full')).toBe(games[0].checksum('full'));expect(games[1].checksum()).toBe(games[0].checksum());}
 }
 expect(a.hall.definition).toBe('building.ants.elder-hall');expect(a.roster()).toMatchObject({used:3,capacity:3});
});
it('does not recheck Hall tiers when an already-paid waiting hero reaches the front',()=>{
 const {g,hall,train}=setup(2);g.context.create(placed('extra-supply','building.ants.house',145,241));
 expect(train('unit.ants.settler').accepted).toBe(true);expect(train().accepted).toBe(true);g.economy.remove(hall);
 run(g,2800);expect(g.entities.filter(e=>e.owner==='player.1'&&e.definition===second)).toHaveLength(1);
});
it('ignores temporary summons, enemy heroes and duplicate view records in roster admission',()=>{
 const {g,hero}=setup(2),own=g.context.populationCandidates();
 const roster=heroRoster([...own,hero,{...hero,id:990,definition:second,summoned:true},
  {...hero,id:991,definition:third,owner:'player.2'},{...hero,id:992,definition:fourth,remembered:true}],'player.1',g.registry);
 expect(roster).toMatchObject({used:1,capacity:2});expect([...roster.definitions]).toEqual(['unit.ants.marshal']);
});
it('rejects an otherwise compatible circular upgrade chain at registry compilation',()=>{
 const s=source(),d=s.definitions as AuthoredDefinition[],a=d.find(d=>d.id==='building.ants.elder-hall')!,b=structuredClone(a);
 b.id='building.test.cycle';a.upgrade={target:b.id,items:[],workTicks:1};b.upgrade={target:a.id,items:[],workTicks:1};d.push(b);
 expect(()=>new ContentRegistry(s)).toThrow(/upgrade cycle/);
});
