import {expect,it,vi} from 'vitest';
import {game,placed,run,slots,source} from './helpers';
import {Game} from '../../src/sim/game/game';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {revivalTerms} from '../../src/content/revival';
import {commandCard,queueCard} from '../../src/presentation/commands';
import {Room,Lockstep,MemoryChannel} from '../../src/net';
import {localMatch} from '../../src/shared/match/match';
function setup(level=1){
 const g=game([placed('shrine','building.ants.sanctuary',193.5,237.5),placed('supply','building.ants.house',245,240)]);
 const hero=g.entities.find(e=>e.owner==='player.1'&&g.registry.get(e.definition).hero)!,shrine=g.entities.find(e=>e.placement==='shrine')!;
 hero.progression!.experience=g.registry.get(hero.definition).behaviors.progression!.levels[level-1].experience;
 g.economy.remove(hero);g.revival.retain(hero);g.state.wallets['player.1']={'item.amber':2000,'item.wood':500};g.observation.update();
 const cast=()=>g.command('player.1',{type:'revive',actor:shrine.id,hero:hero.id});
 return {g,hero,shrine,cast};
}
it('declares level-based prices and durations once for all consumers',()=>{
 const {g,shrine}=setup(),policy=g.registry.get(shrine.definition).behaviors.revival!;
 expect(revivalTerms(policy,1)).toEqual({items:[{item:'item.amber',amount:200}],workTicks:1200});
 expect(revivalTerms(policy,4)).toEqual({items:[{item:'item.amber',amount:350}],workTicks:1800});
 expect(revivalTerms(policy,10)).toEqual({items:[{item:'item.amber',amount:650}],workTicks:3000});
});
it('pays exactly once, shows held funds and refunds the paid level on cancellation',()=>{
 const {g,shrine,hero,cast}=setup(4);
 const button=commandCard(g.view('player.1'),[shrine.id],'player.1',g.registry).find(c=>c.type==='revive')!;
 expect(button.costs).toMatchObject([{kind:'item',amount:350},{kind:'supply',amount:4}]);expect(button.description).toContain('45s');
 expect(cast().accepted).toBe(true);expect(cast().accepted).toBe(false);run(g,100);
 expect(g.state.wallets['player.1']['item.amber']).toBe(1650);
 expect(g.view('player.1').goods!.find(g=>g.item==='item.amber')).toMatchObject({available:1650,reserved:350,stored:2000});
 const queue=queueCard(g.view('player.1'),shrine.id,'player.1',g.registry);expect(queue[0].progress).toBeCloseTo(100/1800);expect(queue[0].costs[0].amount).toBe(350);
 expect(g.command('player.1',{type:'cancelRevival',actor:shrine.id,hero:hero.id}).accepted).toBe(true);
 expect(g.command('player.1',{type:'cancelRevival',actor:shrine.id,hero:hero.id}).accepted).toBe(false);
 expect(g.state.wallets['player.1']['item.amber']).toBe(2000);expect(hero.fallen).toBe(true);
});
it('rejects unaffordable revival atomically and displays the same reason',()=>{
 const {g,shrine,cast}=setup(4);g.state.wallets['player.1']['item.amber']=349;g.observation.update();
 expect(cast()).toMatchObject({accepted:false,reason:'Insufficient resources'});expect(shrine.revival!.queue).toEqual([]);
 expect(g.state.wallets['player.1']['item.amber']).toBe(349);
 expect(commandCard(g.view('player.1'),[shrine.id],'player.1',g.registry).find(c=>c.type==='revive')).toMatchObject({enabled:false,reason:'Insufficient resources'});
});
it('finishes at the declared tick, preserving identity, XP and learned state across restore',()=>{
 const {g,shrine,hero,cast}=setup(4),id=hero.id,xp=hero.progression!.experience,ranks={...hero.abilities!.ranks};
 cast();run(g,500);const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,1299);run(restored,1299);expect(hero.fallen).toBe(true);g.tick();restored.tick();
 expect(hero.id).toBe(id);expect(hero.fallen).toBeUndefined();expect(hero.progression!.experience).toBe(xp);expect(hero.abilities!.ranks).toEqual(ranks);
 expect(shrine.revival!.queue).toEqual([]);expect(g.state.accounting.consumed['item.amber']).toBe(350);expect(restored.snapshot()).toEqual(g.snapshot());
});
it('loses paid revival escrow on sanctuary destruction without erasing the hero or wallet',()=>{
 const {g,hero,shrine,cast}=setup(4);cast();run(g,20);g.economy.remove(shrine);
 expect(hero.fallen).toBe(true);expect(g.state.wallets['player.1']['item.amber']).toBe(1650);expect(g.state.accounting.lost['item.amber']).toBe(350);
 const backup=g.context.create(placed('backup','building.ants.sanctuary',193.5,237.5));
 expect(g.command('player.1',{type:'revive',actor:backup.id,hero:hero.id}).accepted).toBe(true);expect(g.state.wallets['player.1']['item.amber']).toBe(1300);
});
it('holds a finished revival behind blocked exits and resumes the same reservation',()=>{
 const {g,shrine,hero,cast}=setup();cast();const nearest=vi.spyOn(g.spatial,'nearest').mockReturnValue(null);
 run(g,1300);expect(hero.fallen).toBe(true);expect(shrine.revival!.queue[0].progress).toBe(1200);
 expect(g.state.accounting.consumed['item.amber']??0).toBe(0);expect(()=>new Game(g.map,slots,g.registry).restore(g.snapshot())).not.toThrow();
 nearest.mockRestore();g.tick();expect(hero.fallen).toBeUndefined();expect(g.state.accounting.consumed['item.amber']).toBe(200);
});
it('rejects invalid paid levels/progress without modifying live state',()=>{
 const {g,shrine,cast}=setup();cast();const before=g.checksum('full');
 for(const patch of [{level:2},{level:0},{progress:1201}]){
  const saved=g.snapshot();Object.assign(saved.state.entities.find(e=>e.id===shrine.id)!.revival!.queue[0],patch);
  expect(()=>g.restore(saved)).toThrow();expect(g.checksum('full')).toBe(before);
 }
});
it('validates declared revival prices as unique currencies',()=>{
 for(const items of [[{item:'unit.ants.warrior',amount:1}],[{item:'item.amber',amount:1},{item:'item.amber',amount:2}]]){
  const s=source(),d=(s.definitions as AuthoredDefinition[]).find(d=>d.id==='building.ants.sanctuary')!;
  d.behaviors!.revival!.items=items;expect(()=>new ContentRegistry(s)).toThrow();
 }
});
it('retains a paid revival after capacity loss once its work has started',()=>{
 const {g,hero,shrine,cast}=setup();
 for(let i=0;i<6;i++)g.context.create(placed('extra-'+i,'unit.ants.warrior',100+i*4,100));
 expect(cast().accepted).toBe(true);g.tick();expect(shrine.revival!.queue[0].progress).toBe(1);
 g.economy.remove(g.entities.find(e=>e.placement==='supply')!);
 const restored=new Game(g.map,slots,g.registry);restored.restore(g.snapshot());
 run(g,1199);run(restored,1199);expect(hero.fallen).toBeUndefined();expect(restored.snapshot()).toEqual(g.snapshot());
 expect(g.view('player.1').supply).toMatchObject({used:16,capacity:15,reserved:0});
});

it('replays paid cancellation and revival through independent multiplayer mailboxes and a cold restore',()=>{
 const a=setup(4),b=setup(4),games=[a.g,b.g];
 const config={...localMatch({mapId:'revival-test',mapRevision:'revival-test',seed:1,slotCount:2,me:0,delay:3}),slots};
 const room=new Room(config),channels=[0,1].map(i=>new MemoryChannel(room,i)),peers=channels.map((c,i)=>new Lockstep(c,i,3));
 for(let tick=1;tick<=2000;tick++){
  if(tick===1||tick===120)peers[0].send({type:'revive',actor:a.shrine.id,hero:a.hero.id});
  if(tick===100)peers[0].send({type:'cancelRevival',actor:a.shrine.id,hero:a.hero.id});
  peers[tick%2].confirm(tick);peers[1-tick%2].confirm(tick);
  for(let i=0;i<2;i++){
   const commit=peers[i].take(tick)!;expect(commit).not.toBeNull();
   for(const slot of commit.slots)for(const action of slot.actions)expect(games[i].command(`player.${slot.player+1}`,action).accepted).toBe(true);
   games[i].tick();
  }
  if(tick===800){const restored=new Game(b.g.map,slots,b.g.registry);restored.restore(games[1].snapshot());games[1]=restored;}
  if(tick%40===0)expect(games[1].checksum('full')).toBe(games[0].checksum('full'));
 }
 expect(a.hero.fallen).toBeUndefined();expect(a.g.state.wallets['player.1']['item.amber']).toBe(1650);
 expect(a.g.state.accounting.consumed['item.amber']).toBe(350);expect(games[1].snapshot()).toEqual(games[0].snapshot());
 channels.forEach(c=>c.destroy());
});
