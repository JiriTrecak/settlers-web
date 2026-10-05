import {readFileSync} from 'node:fs';
import {beforeAll,describe,expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {projectScene} from '../../src/shared/authoring/project';
import {bridgeSurfaces} from '../../src/shared/map/bridgeSurface';
import {fixed,precise} from '../../src/sim/game/motion';
import type {Entity} from '../../src/sim/game/state';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/the-amber-watch.utcmap','utf8')))!;
const slots=[{player:0,kind:'human' as const},{player:1,kind:'human' as const}];
function actor(g:Game,id:string){return g.entities.find(e=>e.placement===id)!;}
function advance(g:Game,predicate:()=>boolean,limit=1400){for(let n=0;n<limit&&!predicate();n++)g.tick();expect(g.state.mission?.error).toBeNull();expect(predicate()).toBe(true);}
function enter(e:Entity,x:number,y:number){e.x=x;e.y=y;if(e.unit){e.unit.position=fixed({x,y});e.unit.order=null;}}
let g:Game;
describe('The Amber Watch campaign mission',()=>{
 beforeAll(()=>{g=new Game(map,slots);},30_000);
 it('is playable, starts with exactly one hero and three soldiers, and has an unowned ant outpost',()=>{
  expect(playableMapError(map)).toBeNull();
  expect(projectScene(map)!.generated!.issues).toEqual([]);
  const party=g.entities.filter(e=>e.owner==='player.1');expect(party.map(e=>e.placement).sort()).toEqual(['bow-1','rowan','vanguard-1','vanguard-2']);
  expect(party.filter(e=>e.progression)).toHaveLength(1);
  expect(actor(g,'amber-watch').owner).toBe('none');
  expect(g.entities.some(e=>e.placement?.startsWith('siege-'))).toBe(false);
  expect(map.camps).toHaveLength(3);expect(map.camps.every(c=>c.fixedDrops?.length)).toBe(true);
 });
 it('connects the road, recruitment stops, neutral camps and fort through a traversable bridge',()=>{
  const near=(x:number,y:number)=>{for(let r=0;r<=5;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const i=g.spatial.cell({x:x+dx,y:y+dy});if(g.spatial.walkable(i))return i;}throw Error(`No walkable cell at ${x},${y}`);};
  const start=near(36,217);
  for(const [x,y] of [[68,145],[110,128],[140,128],[145,130],[190,86],[213,65],...map.camps.map(c=>[c.home.x,c.home.y])])expect(g.spatial.findPath(start,near(x,y)),`${x},${y}`).not.toBeNull();
  for(const c of map.camps)for(const id of c.members){const e=actor(g,id);expect(g.spatial.walkable(g.spatial.cell(e)),id).toBe(true);}
  const b=bridgeSurfaces(projectScene(map)!.stamps,(x,z)=>projectScene(map)!.field.sample(x,z))[0]!;
  const ends=[-1,1].map(sign=>g.spatial.point(near(Math.round(b.x+b.s*sign*(b.depth/2+2)),Math.round(b.z+b.c*sign*(b.depth/2+2)))));
  const path=g.spatial.findPath(g.spatial.cell(ends[0]!),g.spatial.cell(ends[1]!))!;
  expect(path.length).toBeLessThan(45);expect(path.some(i=>g.spatial.point(i).surface===b.id)).toBe(true);
  const probe=g.context.create({id:'bridge-proof',definition:'unit.ants.settler',owner:'player.1',position:ends[0]!,rotation:0});probe.readyTick=0;
  expect(g.command('player.1',{type:'move',actors:[probe.id],destination:ends[1]!}).accepted).toBe(true);
  let crossed=false;advance(g,()=>{crossed ||=probe.surface===b.id;const p=precise(probe);return crossed&&!probe.surface&&Math.hypot(p.x-ends[1]!.x,p.y-ends[1]!.y)<.2;},900);
 });
 it('recruits both groups, recovers survivors once, announces the siege, and wins only after every attacker dies',()=>{
  advance(g,()=>g.state.mission!.variables.phase==='road'&&!g.state.mission!.dialogue?.cinematic&&g.state.tick>800);
  const hero=actor(g,'rowan');enter(hero,68,145);
  advance(g,()=>g.state.mission!.variables['road-recruits']===true);
  expect(actor(g,'post-warrior').owner).toBe('player.1');expect(actor(g,'post-archer').owner).toBe('player.1');
  advance(g,()=>!g.state.mission!.dialogue?.cinematic||g.state.mission!.dialogue.remaining===0);hero.hp=100;enter(hero,145,130);
  advance(g,()=>g.state.mission!.variables['bridge-recruits']===true);
  expect(hero.hp).toBe(g.context.stats(hero).maxHp);expect(actor(g,'bridge-hunter').owner).toBe('player.1');
  advance(g,()=>!g.state.mission!.dialogue?.cinematic||g.state.mission!.dialogue.remaining===0);enter(hero,190,86);
  advance(g,()=>g.state.mission!.variables.phase==='siege-call');
  expect(g.state.mission!.dialogue!.text).toContain('fort is under siege');
  advance(g,()=>g.state.mission!.variables.phase==='siege-reply');expect(g.state.mission!.dialogue!.text).toContain('going to help them');
  advance(g,()=>g.state.mission!.variables.phase==='siege');
  expect(g.state.mission!.objectiveStates['rally-watch']).toBe('completed');
  const attackers=g.entities.filter(e=>e.placement?.startsWith('siege-'));expect(attackers).toHaveLength(9);
  // Keep one attacker alive to prove the objective does not finish early.
  enter(hero,181,94);for(const e of attackers.slice(1))e.hp=0;
  for(let n=0;n<8;n++)g.tick();expect(g.state.outcome).toBeNull();expect(g.state.mission!.variables.phase).toBe('siege');
  const restored=new Game(map,slots);restored.restore(g.snapshot());expect(restored.checksum()).toBe(g.checksum());
  actor(g,'siege-captain').hp=0;actor(restored,'siege-captain').hp=0;
  advance(g,()=>g.state.mission!.variables.phase==='victory-speech');advance(restored,()=>restored.state.mission!.variables.phase==='victory-speech');
  advance(g,()=>g.state.outcome!==null);advance(restored,()=>restored.state.outcome!==null);
  expect(g.state.outcome!.winner).toBe('player.1');expect(restored.checksum()).toBe(g.checksum());
 });
 it('can finish with the authored patrol using ordinary attack-move orders',()=>{
  const play=new Game(map,slots);
  const march=(x:number,y:number)=>{
   const party=play.entities.filter(e=>e.owner==='player.1'&&e.unit&&e.hp!>0);
   expect(play.command('player.1',{type:'move',actors:party.map(e=>e.id),destination:{x,y},attackMove:true}).accepted).toBe(true);
  };
  advance(play,()=>play.state.mission!.variables.phase==='road');
  for(const [x,y] of [[65,173],[68,145],[110,128],[145,130],[170,106],[190,86]]){
   march(x,y);
   advance(play,()=>Math.hypot(actor(play,'rowan').x-x,actor(play,'rowan').y-y)<6||play.state.outcome!==null,2400);
   expect(play.state.outcome).toBeNull();
   for(let n=0;n<400;n++)play.tick();
  }
  advance(play,()=>play.state.mission!.variables.phase==='siege');
  for(const [x,y] of [[213,77],[214,89],[204,72],[223,72],[214,82]]){
   if(play.state.outcome)break;
   march(x,y);for(let n=0;n<1600&&!play.state.outcome;n++)play.tick();
  }
  expect(play.state.mission!.error).toBeNull();
  expect(play.state.outcome?.winner,JSON.stringify({phase:play.state.mission!.variables.phase,party:play.entities.filter(e=>e.owner==='player.1').map(e=>[e.placement,e.hp,e.x,e.y]),enemies:play.entities.filter(e=>e.owner==='player.2').map(e=>[e.placement,e.hp,e.x,e.y])})).toBe('player.1');
 },40_000);
 it('loses when the only hero falls',()=>{
  const loss=new Game(map,slots);loss.tick();actor(loss,'rowan').hp=0;advance(loss,()=>loss.state.outcome!==null);expect(loss.state.outcome!.defeated).toContain('player.1');
 });
});
