import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {precise,fixed} from '../../src/sim/game/motion';
const map=()=>parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-hollow-gate.utcmap','utf8')))!;
it('reaches all Hollow Gate objectives and all three crossing crowns through the authored forest',()=>{
 const m=map();expect(playableMapError(m)).toBeNull();
 const g=new Game(m,[{player:0,kind:'human'}]),s=g.spatial,hero=g.entities.find(e=>e.placement==='marshal')!;
 for(const r of m.mission!.regions)expect(s.findPath(s.cell(hero),s.cell({x:r.x,y:r.y})),r.id).not.toBeNull();
 for(const stamp of m.stamps.filter(p=>p.walk))expect(s.findPath(s.cell(hero),s.cell({x:Math.round(stamp.x),y:Math.round(stamp.y),surface:stamp.id})),stamp.id).not.toBeNull();
 const route=s.findPath(s.cell(hero),s.cell({x:153,y:163}))!;
 expect(route.some(i=>s.point(i).surface==='stone-crossing')).toBe(true);
 expect(m.entities.filter(e=>e.definition==='resource.forest.tree').length).toBeGreaterThan(3000);
});
it('takes the complete eight-ant squad over the stone bridge without stranding anyone at its landings',()=>{
 const g=new Game(map(),[{player:0,kind:'human'}]);const army=g.entities.filter(e=>e.owner==='player.1'&&e.unit);
 expect(army).toHaveLength(8);
 expect(g.command('player.1',{type:'move',actors:army.map(e=>e.id),destination:{x:153,y:163}}).accepted).toBe(true);
 const crossed=new Set<number>();
 for(let i=0;i<1600;i++){if(g.state.mission)g.state.mission.dialogue=null;g.tick();for(const e of army)if(e.surface==='stone-crossing')crossed.add(e.id);}
 expect(crossed.size).toBe(8);
 for(const e of army){expect(e.surface,e.placement??undefined).toBeUndefined();expect(Math.hypot(precise(e).x-153,precise(e).y-163),e.placement??undefined).toBeLessThan(7);}
});
it('runs the outdoor chapter through staged objectives and a deterministic mid-mission save',()=>{
 const g=new Game(map(),[{player:0,kind:'human'}]);
 const advance=()=>{for(let i=0;i<8;i++){if(g.state.mission)g.state.mission.dialogue=null;g.tick();}expect(g.state.mission?.error).toBeNull();};
 advance();expect(g.state.mission?.variables.stage).toBe('crossing');
 const hero=g.entities.find(e=>e.placement==='marshal')!;
 hero.x=153;hero.y=163;hero.unit!.position=fixed(hero);g.spatial.rebuild();advance();expect(g.state.mission?.variables.stage).toBe('gate');
 const copy=new Game(map(),[{player:0,kind:'human'}]);copy.restore(g.snapshot());g.tick();copy.tick();expect(copy.checksum()).toBe(g.checksum());
 for(const id of ['gate-wardens.0','gate-wardens.1','gate-wardens.2'])g.entities.find(e=>e.placement===id)!.hp=0;
 advance();expect(g.state.mission?.variables.stage).toBe('enter');
 hero.x=188;hero.y=104;hero.unit!.position=fixed(hero);g.spatial.rebuild();advance();expect(g.state.outcome?.winner).toBe('player.1');
});
