import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {Game} from '../../src/sim/game/game';
import {precise} from '../../src/sim/game/motion';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/the-amber-watch.utcmap','utf8')))!;
const slots=[{player:0,kind:'human' as const},{player:1,kind:'human' as const}];
const create=()=>new Game(map,slots);
const hero=(g:Game)=>g.entities.find(e=>e.placement==='rowan')!;
function until(g:Game,condition:()=>boolean,limit=4000){
 for(let i=0;i<limit&&!condition()&&!g.state.outcome;i++){g.tick();if(g.state.mission?.error)throw Error(g.state.mission.error);}
 expect(condition(),JSON.stringify({phase:g.state.mission?.variables,hero:precise(hero(g)),health:hero(g).hp,error:g.state.mission?.error,enemies:g.entities.filter(e=>e.owner==='player.2'&&e.unit&&(e.hp??0)>0).map(e=>({id:e.placement,position:precise(e),health:e.hp,order:e.unit?.order}))})).toBe(true);
}
function march(g:Game,x:number,y:number){
 const actors=g.entities.filter(e=>e.unit&&e.owner==='player.1'&&(e.hp??0)>0&&!e.fallen).map(e=>e.id);
 expect(g.command('player.1',{type:'move',actors,destination:{x,y},attackMove:true}).accepted).toBe(true);
}
it('validates the live editor export and has traversable routes for the full-sized hero',()=>{
 expect(playableMapError(map)).toBeNull();const g=create(),body=hero(g),s=g.spatial;
 for(const [a,b]of [[{x:80,y:420},{x:140,y:350}],[{x:140,y:350},{x:265,y:285}],[{x:285,y:265},{x:285,y:224}],[{x:290,y:220},{x:396,y:153}]]){
  expect(s.findPath(s.cell(a),s.cell(b),undefined,Infinity,body)).not.toBeNull();
 }
 expect(g.entities.filter(e=>e.owner==='player.1'&&e.unit)).toHaveLength(4);
 expect(g.entities.filter(e=>e.owner==='player.1'&&e.progression)).toHaveLength(1);
});
it('recruits both patrols, crosses the bridge and wins by real combat against the entire siege',()=>{
 const g=create();until(g,()=>g.state.mission?.variables.phase==='road');
 march(g,140,345);until(g,()=>!!g.state.mission?.variables['road-recruits']);until(g,()=>g.state.mission?.variables.phase==='road');
 march(g,175,290);until(g,()=>!!g.state.mission?.variables.spring);
 expect(hero(g).equipment).toContain('item.resin-salve');
 march(g,265,285);until(g,()=>Math.hypot(hero(g).x-265,hero(g).y-285)<8);
 march(g,285,224);until(g,()=>!!g.state.mission?.variables['bridge-recruits']);until(g,()=>g.state.mission?.variables.phase==='road');
 until(g,()=>g.state.mission?.objectiveStates['rally-watch']==='completed');
 march(g,396,153);until(g,()=>g.state.mission?.variables.phase==='siege');
 march(g,411,146);
 for(let i=0;i<1600&&!g.state.outcome;i++)g.tick();
 // Clear the mortar emplacements after meeting the infantry in the courtyard.
 if(g.state.mission?.variables.phase==='siege')march(g,368,134);
 for(let i=0;i<1000&&!g.state.outcome;i++)g.tick();
 if(g.state.mission?.variables.phase==='siege')march(g,412,131);
 until(g,()=>!!g.state.outcome,6000);
 expect(g.state.outcome?.winner).toBe('player.1');expect(g.state.mission?.objectiveStates['break-siege']).toBe('completed');
 expect(g.state.mission?.variables.relief).toBe(true);
 expect(g.entities.filter(e=>e.owner==='player.2'&&e.unit&&(e.hp??0)>0)).toHaveLength(0);
 expect(hero(g).hp).toBeGreaterThan(0);
},120000);
it('preserves the opening cinematic across a save and loses when Rowan falls',()=>{
 const g=create();g.tick();const copy=create();copy.restore(g.snapshot());
 for(let i=0;i<30;i++){g.tick();copy.tick();}expect(copy.checksum()).toBe(g.checksum());
 expect(g.state.mission?.scene?.camera?.mode).toBe('third-person');
 // Death drives the authored failure callback; skipping dialogue here isolates that rule.
 hero(g).hp=0;g.state.mission!.dialogue=null;for(let i=0;i<8;i++)g.tick();
 expect(g.state.outcome?.winner).toBeNull();expect(g.state.outcome?.defeated).toContain('player.1');
});
