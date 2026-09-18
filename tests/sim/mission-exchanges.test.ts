import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {placed} from '../game/helpers';
function game(script:string){return new Game({...emptyUtcMap(),entities:[placed('hero','unit.ants.marshal',60,60),{...placed('volunteer','unit.ants.settler',64,60),owner:'none'}],mission:{campaign:'test',title:'Quest exchanges',order:1,regions:[],script}},[{player:0,kind:'human'}]);}
it('exchanges items in one callback with read-your-writes and no duplicate removal',()=>{
 const g=game(`function on_start()
 mission.give_item('hero','item.barkguard')
 mission.set('has',mission.has_item('hero','item.barkguard'))
 mission.set('taken',mission.take_item('hero','item.barkguard'))
 mission.set('twice',mission.take_item('hero','item.barkguard'))
 mission.give_item('hero','item.thornband')
 end`);g.tick();
 expect(g.state.mission?.error).toBeNull();expect(g.state.mission?.variables).toMatchObject({has:true,taken:true,twice:false});
 expect(g.entities[0].equipment).toEqual(['item.thornband',null,null,null]);
});
it('refuses a full inventory without losing or overwriting items and restores deterministically',()=>{
 const g=game(`function on_start() for i=1,4 do mission.give_item('hero','item.barkguard') end end
 function on_tick() mission.set('reward',mission.give_item('hero','item.thornband')) end`);g.tick();
 const b=game(g.map.mission!.script);b.restore(g.snapshot());for(let i=0;i<8;i++){g.tick();b.tick();}
 expect(g.checksum()).toBe(b.checksum());expect(g.state.mission?.variables.reward).toBe(false);expect(g.entities[0].equipment).toEqual(Array(4).fill('item.barkguard'));
});
it('rolls inventory changes back when the callback fails',()=>{
 const g=game(`function on_start() mission.give_item('hero','item.barkguard');mission.take_item('hero','missing') end`);g.tick();
 expect(g.state.mission?.error).toContain('Expected a hero inventory item');expect(g.entities[0].equipment).toEqual([null,null,null,null]);
});
it('transforms a wounded civilian into a controllable soldier without changing its identity',()=>{
 const g=game(`function on_start() end function on_tick() if not mission.get('joined') then mission.set('joined',mission.transform('volunteer','unit.ants.warrior','player.1')) end end`);g.tick();
 const e=g.entities.find(e=>e.placement==='volunteer')!,id=e.id,max=g.context.stats(e).maxHp;e.hp=Math.floor(max/2);
 for(let i=0;i<4;i++)g.tick();
 expect(g.state.mission?.error).toBeNull();expect(e.id).toBe(id);expect(e.owner).toBe('player.1');expect(e.definition).toBe('unit.ants.warrior');expect(e.hp).toBeCloseTo(g.context.stats(e).maxHp/2,0);
 expect(g.command('player.1',{type:'move',actors:[id],destination:{x:70,y:60},attackMove:false}).accepted).toBe(true);
 const b=game(g.map.mission!.script);b.restore(g.snapshot());for(let i=0;i<40;i++){g.tick();b.tick();}expect(g.checksum()).toBe(b.checksum());
});
it('does not transform a civilian if another API call invalidates the callback',()=>{
 const g=game(`function on_start() mission.transform('volunteer','unit.ants.warrior','player.1');mission.spawn('missing') end`);g.tick();
 expect(g.state.mission?.error).toContain('Unknown entity ID');expect(g.entities.find(e=>e.placement==='volunteer')!.definition).toBe('unit.ants.settler');
});
it('lets a neutral civilian escort the hero without granting the player control or requiring a combat sensor',()=>{
 const g=game(`function on_start() mission.follow('volunteer','hero');mission.move('hero',78,60) end`);g.tick();
 const child=g.entities.find(e=>e.placement==='volunteer')!;
 const copy=game(g.map.mission!.script);copy.restore(g.snapshot());for(let i=0;i<300;i++){g.tick();copy.tick();}
 expect(g.state.mission?.error).toBeNull();expect(child.x).toBeGreaterThan(72);expect(child.owner).toBe('none');expect(g.checksum()).toBe(copy.checksum());
 expect(g.command('player.1',{type:'move',actors:[child.id],destination:{x:60,y:60},attackMove:false}).accepted).toBe(false);
});
it('reveals a disguised civilian as a hostile camp member and retains the allegiance after loading',()=>{
 const source=game('function on_start() end').map;
 const base={...source,entities:[...source.entities],camps:[...source.camps],mission:{...source.mission!}};
 base.entities.push({...placed('bandit','unit.briar.cutthroat',66,64),owner:'none'});
 base.camps=[{id:'ambush',members:['bandit'],home:{x:64,y:60},aggroRange:10,leash:18,aggression:'players',mapKnowledge:'hidden',fixedDrops:['item.briar-healing-scroll']}];
 base.mission!.script="function on_start() mission.transform('volunteer','unit.briar.cutthroat','none','ambush'); mission.attack('volunteer','hero') end";
 const g=new Game(base,[{player:0,kind:'human'}]);g.tick();const disguised=g.entities.find(e=>e.placement==='volunteer')!,hero=g.entities.find(e=>e.placement==='hero')!;
 expect(g.state.mission?.error).toBeNull();expect(disguised.unit!.camp).toBe('ambush');expect(g.combat.hostile(hero,disguised)).toBe(true);
 const b=new Game(base,g.slots);b.restore(g.snapshot());for(let i=0;i<100;i++){g.tick();b.tick();}expect(g.checksum()).toBe(b.checksum());expect(hero.hp).toBeLessThan(700);
});
