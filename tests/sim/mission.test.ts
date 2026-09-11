import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {World} from '../../src/sim/world/world';
import {Progression} from '../../src/sim/game/progression';
import {CampLoot} from '../../src/sim/game/campLoot';
import {experienceMeter} from '../../src/presentation/experience';
import {heading,turnDifference} from '../../src/sim/game/facing';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap,stringifyUtcMap,emptyUtcMap} from '../../src/shared/map/utcmap';
import {runMissionLua,validateMissionLua} from '../../src/shared/scenario/lua';
import {playableMapError} from '../../src/shared/map/playable';
import {renameEntity} from '../../src/editor/world/entityAuthoring';
const mission=()=>parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-prologue.utcmap','utf8')))!;
const fixture=()=>{const m=mission();return {...m,entities:m.entities.filter(e=>!e.id.startsWith('tree.'))};};
const game=()=>new Game(fixture(),[{player:0,kind:'human'}]);
const tick=(g:Game,n:number)=>{for(let i=0;i<n;i++)g.tick();};
describe('mission Lua sandbox',()=>{
 it('executes real Lua and exposes only the mission API',()=>{let result:unknown;runMissionLua('function on_start() mission.set("result", (7 * 6) + 1); mission.set("safe", os == nil and io == nil and require == nil and debug == nil and js == nil and math == nil) end','on_start',{set:(k,v)=>{if(k==='result')result=v;else expect(v).toBe(true);}});expect(result).toBe(43);});
 it('rejects syntax and bounds infinite loops',()=>{expect(()=>validateMissionLua('function nope(')).toThrow();expect(()=>runMissionLua('function on_tick() while true do end end','on_tick',{})).toThrow(/instructions/);});
 it('bounds growing strings and rejects top-level API calls',()=>{expect(()=>runMissionLua('function on_tick() local s="x"; for i=1,22 do s=s..s end end','on_tick',{})).toThrow(/64 KiB/);expect(()=>runMissionLua('mission.tick()','on_start',{tick:()=>0})).toThrow(/top level/);});
 it('does not keep hidden Lua globals across dispatches',()=>{let got;const source='counter = (counter or 0) + 1; function on_tick() mission.set(counter) end';for(let i=0;i<3;i++)runMissionLua(source,'on_tick',{set:v=>{got=v;}});expect(got).toBe(1);});
});
describe('Vanguard prologue',()=>{
 it('round trips a mission map with one player, no Mound and dormant reinforcements',()=>{const m=mission();expect(m).toBeTruthy();expect(playableMapError(m)).toBeNull();expect(parseUtcMap(JSON.parse(stringifyUtcMap(m)))).toEqual(m);const g=game();expect(g.entities.filter(e=>e.owner==='player.1')).toHaveLength(3);expect(g.entities.some(e=>e.placement==='ambusher-one')).toBe(false);tick(g,350);expect(g.state.outcome).toBeNull();expect(g.state.mission?.variables.stage).toBe('opening-briefing');expect(g.state.mission?.dialogue?.speaker).toBe('Marshal');});
 it('walks to the trigger, fights both wolves, and completes the mission',()=>{const g=game();tick(g,900);const crew=g.entities.filter(e=>e.owner==='player.1');expect(g.command('player.1',{type:'move',actors:crew.map(e=>e.id),destination:{x:121,y:128},attackMove:true}).accepted).toBe(true);for(let i=0;i<9000&&g.state.mission?.variables.stage!=='find-watch';i++)g.tick();expect(g.state.mission?.variables.stage).toBe('find-watch');g.command('player.1',{type:'move',actors:crew.map(e=>e.id),destination:{x:134,y:106},attackMove:true});for(let i=0;i<9000&&g.state.mission?.variables.stage!=='onward';i++)g.tick();expect(g.state.mission?.variables.stage).toBe('onward');expect(g.entities.some(e=>e.owner==='player.1'&&['watch-captain','watch-ranger'].includes(e.placement??''))).toBe(true);g.command('player.1',{type:'move',actors:g.entities.filter(e=>e.owner==='player.1'&&e.hp!>0).map(e=>e.id),destination:{x:86,y:48},attackMove:true});for(let i=0;i<9000&&!g.state.outcome;i++)g.tick();expect(g.state.mission?.error).toBeNull();expect(g.state.mission?.spawned).toEqual(['ambusher-one','ambusher-two','watch-captain','watch-ranger','watch-pursuer-one','watch-wolf-one','watch-wolf-two','watch-wolf-three']);expect(g.entities.find(e=>e.placement==='marshal')!.progression!.experience).toBe(100);expect(g.state.outcome?.winner).toBe('player.1');});
 it('fails when the hero dies and permits ordinary commands without a fort',()=>{const g=game();tick(g,900);const hero=g.entities.find(e=>e.placement==='marshal')!;expect(g.command('player.1',{type:'move',actors:[hero.id],destination:{x:140,y:146},attackMove:false}).accepted).toBe(true);hero.hp=0;tick(g,4);expect(g.state.outcome).toEqual({winner:null,defeated:['player.1']});});
 it('restores scripted progress deterministically, without rerunning intro/spawns',()=>{const a=game();tick(a,900);a.command('player.1',{type:'move',actors:a.entities.filter(e=>e.owner==='player.1').map(e=>e.id),destination:{x:121,y:128},attackMove:true});for(let i=0;i<9000&&!a.state.mission?.spawned.length;i++)a.tick();expect(a.state.mission?.spawned).toHaveLength(2);const b=game();b.restore(a.snapshot());expect(b.checksum()).toBe(a.checksum());for(let i=0;i<400;i++){a.tick();b.tick();}expect(b.checksum()).toBe(a.checksum());expect(b.state.mission?.spawned).toHaveLength(2);});
 it('reports script errors without partially spawning reinforcements',()=>{const m=mission();m.mission!.script='function on_start() mission.spawn("ambusher-one"); mission.spawn("missing") end';const g=new Game(m,[{player:0,kind:'human'}]);g.tick();expect(g.state.mission?.error).toContain('Unknown entity');expect(g.entities.some(e=>e.placement==='ambusher-one')).toBe(false);});
 it('renames stable IDs and camp references, rejects duplicate IDs',()=>{const m=mission(),next=renameEntity(m,'ambusher-one','wolf-alpha');expect(next.camps[0].members).toContain('wolf-alpha');expect(()=>renameEntity(m,'marshal','vanguard-scout')).toThrow(/already exists/);});
 it('does not allow deferred entities on skirmish maps',()=>{const m=emptyUtcMap();expect(playableMapError({...m,entities:[mission().entities.find(e=>e.activation)!]})).toContain('mission map');});
});

describe('mission caps, rewards and cinematics',()=>{
 it('caps awards exactly at level two, without banking overflow',()=>{
  const g=game(),hero=g.entities.find(e=>e.placement==='marshal')!,victim=g.entities.find(e=>e.definition==='unit.neutral.ogre')!;
  victim.x=hero.x;victim.y=hero.y;
  const progression=new Progression(g.context);progression.award(victim,e=>e.id===hero.id);progression.award(victim,e=>e.id===hero.id);
  expect(hero.progression!.experience).toBe(100);expect(g.context.stats(hero).level).toBe(2);
  const view={...hero,stats:g.context.stats(hero)};expect(experienceMeter(view as any,g.context.def(hero),2)?.label).toBe('Mission maximum level 2');
  const uncapped=fixture();delete uncapped.mission!.heroLevelCap;const other=new Game(uncapped,[{player:0,kind:'human'}]);const h=other.entities.find(e=>e.progression)!,v=other.entities.find(e=>e.definition==='unit.neutral.ogre')!;v.x=h.x;v.y=h.y;new Progression(other.context).award(v,()=>true);expect(h.progression!.experience).toBe(120);
 });
 it('drops the authored items exactly once, without consuming random rolls',()=>{
  const g=game(),camp=g.map.camps.find(c=>c.id==='convoy-wolf')!,loot=new CampLoot(g.context,g.map.camps),members=g.entities.filter(e=>e.unit?.camp===camp.id),random=g.state.random;
  members[0].hp=0;expect(loot.onDeath(members[0])).toEqual([]);members[1].hp=0;
  expect(loot.onDeath(members[1]).map(e=>e.definition)).toEqual(['item.barkguard']);expect(loot.onDeath(members[1])).toEqual([]);expect(g.state.random).toBe(random);
  const bad=fixture();bad.camps[0].fixedDrops=['unit.ants.warrior'];expect(playableMapError(bad)).toContain('must be an item');
 });
 it('freezes gameplay time and orders during cinematics, including a world save/restore',()=>{
  const map=fixture(),a=new World({map,slots:[{player:0,kind:'human'}],seed:99});for(let i=0;i<600&&!a.settlement.state.mission?.dialogue?.remaining;i++)a.tick();
  const frozenTick=a.settlement.state.tick,transportTick=a.clock.tickIndex;
  const hero=a.settlement.entities.find(e=>e.progression)!;hero.spellcasting!.cooldowns['ability.marshal.faultline']=100;
  const before=structuredClone(hero);for(let i=0;i<100;i++)a.tick();
  expect(a.settlement.state.tick).toBe(frozenTick);expect(a.clock.tickIndex).toBe(transportTick+100);expect(hero).toEqual(before);
  expect(a.settlement.command('player.1',{type:'move',actors:[hero.id],destination:{x:200,y:200},attackMove:false}).accepted).toBe(false);
  // Use a valid cooldown ID authored on this hero for snapshot validation.
  delete hero.spellcasting!.cooldowns['ability.marshal.faultline'];
  const b=new World({map,slots:[{player:0,kind:'human'}],seed:99});b.restore(a.snapshot());expect(b.checksum()).toBe(a.checksum());
  for(let i=0;i<305;i++){a.tick();b.tick();}expect(b.checksum()).toBe(a.checksum());expect(a.settlement.state.tick).toBe(frozenTick+5);expect(a.settlement.state.mission!.dialogue!.remaining).toBe(0);
 });
 it('inline speech does not pause movement or simulation time',()=>{
  const map=fixture();map.mission!.script='function on_start() mission.say("Scout", "unit.ants.archer", "Keep moving.", 3) end';const g=new Game(map,[{player:0,kind:'human'}]);g.tick();tick(g,40);expect(g.state.tick).toBe(41);expect(g.state.mission!.pausedTicks).toBe(0);
 });
});

describe('watch rescue and objective stages',()=>{
 it('spawns a fleeing patrol with an ogre chasing it, then joins the survivors after the briefing',()=>{
  const map=fixture();map.mission!.script='function on_start() mission.set("stage", "find-watch"); mission.begin_objective("find-watch") end\n'+map.mission!.script.slice(map.mission!.script.indexOf('function on_tick()'));
  const g=new Game(map,[{player:0,kind:'human'}]),hero=g.entities.find(e=>e.progression)!;
  g.tick();g.command('player.1',{type:'move',actors:[hero.id],destination:{x:134,y:106},attackMove:true});
  for(let i=0;i<6000&&g.state.mission?.variables.stage!=='rescue';i++)g.tick();
  expect(g.state.mission?.error).toBeNull();expect(g.state.mission?.variables.stage).toBe('rescue');
  const captain=g.entities.find(e=>e.placement==='watch-captain')!,ranger=g.entities.find(e=>e.placement==='watch-ranger')!,ogre=g.entities.find(e=>e.placement==='watch-pursuer-one')!;
  expect(captain.owner).toBe('none');expect(captain.unit!.order?.type).toBe('move');expect(ogre.unit!.order).toEqual({type:'attack',target:captain.id,force:true});
  const start={x:captain.x,y:captain.y};tick(g,80);expect(Math.hypot(captain.x-hero.x,captain.y-hero.y)).toBeLessThan(Math.hypot(start.x-hero.x,start.y-hero.y));
  ogre.hp=0;tick(g,4);expect(g.state.mission!.dialogue!.cinematic).toBe(true);expect(g.state.mission!.variables.stage).toBe('watch-briefing');expect(captain.owner).toBe('none');
  const b=new Game(map,[{player:0,kind:'human'}]);b.restore(g.snapshot());
  const hp=captain.hp,id=captain.id;for(let i=0;i<490;i++){g.tick();b.tick();}expect(b.checksum()).toBe(g.checksum());
  expect(captain.owner).toBe('player.1');expect(ranger.owner).toBe('player.1');expect(captain.id).toBe(id);expect(captain.hp).toBe(hp);expect(captain.unit!.order).toBeNull();
  expect(g.state.mission!.objectiveStates).toMatchObject({'find-watch':'completed','rescue-watch':'completed','reclaim-rise':'active'});
  expect(g.command('player.1',{type:'move',actors:[id],destination:{x:130,y:105},attackMove:false}).accepted).toBe(true);
 });
 it('fails the rescue when both watch soldiers die, without a stuck objective',()=>{
  const map=fixture();map.mission!.script='function on_start() mission.spawn("watch-captain"); mission.spawn("watch-ranger"); mission.spawn("watch-pursuer-one"); mission.begin_objective("rescue-watch"); mission.set("stage", "rescue") end\n'+map.mission!.script.slice(map.mission!.script.indexOf('function on_tick()'));
  const g=new Game(map,[{player:0,kind:'human'}]);g.tick();for(const e of g.entities)if(['watch-captain','watch-ranger'].includes(e.placement??''))e.hp=0;tick(g,4);expect(g.state.outcome?.defeated).toEqual(['player.1']);expect(g.state.mission!.objectiveStates['rescue-watch']).toBe('failed');
 });
 it('validates objective transitions and ownership destinations atomically',()=>{
  const map=fixture();map.mission!.script='function on_start() mission.begin_objective("find-watch"); mission.begin_objective("rescue-watch") end';let g=new Game(map,[{player:0,kind:'human'}]);g.tick();expect(g.state.mission!.error).toContain('Complete the current');expect(g.state.mission!.objectiveStates).toEqual({});
  map.mission!.script='function on_start() mission.spawn("watch-captain"); mission.transfer("watch-captain", "player.2") end';g=new Game(map,[{player:0,kind:'human'}]);g.tick();expect(g.state.mission!.error).toContain('Missing owner slot');expect(g.entities.some(e=>e.placement==='watch-captain')).toBe(false);
 });
});

 describe('scripted entrance scenes',()=>{
 it('runs the party from screen-right, waits for arrival, turns inward and releases controls after dialogue',()=>{
  const g=new Game(mission(),[{player:0,kind:'human'}]),crew=g.entities.filter(e=>e.owner==='player.1');g.tick();
  expect(g.state.mission?.scene).toEqual({x:190,y:195});
  expect(crew.every(e=>e.x+e.y>420)).toBe(true);
  expect(g.command('player.1',{type:'move',actors:crew.map(e=>e.id),destination:{x:150,y:150},attackMove:false}).accepted).toBe(false);
  tick(g,60);expect(crew.every(e=>e.x+e.y<420)).toBe(true);
  const restored=new Game(mission(),[{player:0,kind:'human'}]);restored.restore(g.snapshot());
  for(let i=0;i<700&&g.state.mission?.variables.stage!=='journey';i++){g.tick();restored.tick();}
  expect(g.checksum()).toBe(restored.checksum());expect(g.state.mission?.variables.stage).toBe('journey');expect(g.state.mission?.error).toBeNull();
  for(const e of crew){expect(e.unit?.order).toBeNull();expect(Math.abs(turnDifference(e.rotation,heading(e,{x:190,y:195})))).toBeLessThanOrEqual(1);}
  expect(g.state.mission?.scene).toBeNull();expect(g.command('player.1',{type:'move',actors:crew.map(e=>e.id),destination:{x:180,y:185},attackMove:false}).accepted).toBe(true);
  expect(mission().landscape?.environment.weather).toMatchObject({kind:'rain',intensity:.7});
 });
 });
