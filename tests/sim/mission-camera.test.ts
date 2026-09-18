import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {Game} from '../../src/sim/game/game';
function game(script:string){const source=parseUtcMap(JSON.parse(readFileSync('assets/maps/campaign/vanguard-prologue.utcmap','utf8')))!;return new Game({...source,entities:source.entities.filter(e=>!e.id.startsWith('tree.')),mission:{...source.mission!,script}},[{player:0,kind:'human'}]);}
it('saves scripted unit shots deterministically and ends the scene',()=>{
 const script='function on_start() mission.camera("third-person", "marshal", "vanguard-scout", 6, 1.8, 60, 0.5) end\nfunction on_tick() if mission.tick() >= 12 then mission.end_scene() end end';
 const a=game(script);a.tick();expect(a.state.mission?.error).toBeNull();expect(a.state.mission?.scene?.camera).toMatchObject({entity:'marshal',lookAt:'vanguard-scout',transitionMs:500});
 const b=game(script);b.restore(a.snapshot());expect(a.checksum()).toBe(b.checksum());
 for(let n=0;n<20;n++){a.tick();b.tick();}expect(a.checksum()).toBe(b.checksum());expect(a.state.mission?.scene).toBeNull();
});
it('rejects unknown targets and invalid lens settings transactionally',()=>{
 for(const args of ['"first-person", "missing"','"third-person", "marshal", nil, 6, 1.8, 200']){const g=game(`function on_start() mission.camera(${args}) end`);g.tick();expect(g.state.mission?.error).toBeTruthy();expect(g.state.mission?.scene).toBeNull();}
});
it('persists the explicit speaker and dialogue duration through save and restore',()=>{
 const a=game('function on_start() mission.say("Marshal", "unit.ants.marshal", "Follow me.", 8, true, "marshal") end');a.tick();
 expect(a.state.mission?.error).toBeNull();expect(a.state.mission?.dialogue).toMatchObject({actor:a.entities.find(e=>e.placement==='marshal')!.id,durationTicks:320});
 const b=game(a.map.mission!.script);b.restore(a.snapshot());expect(b.state.mission?.dialogue).toEqual(a.state.mission?.dialogue);
 a.timings['Orders · movement']=123;a.tick();expect(a.timings['Orders · movement']).toBe(0);expect(a.timings.Observation).toBeGreaterThanOrEqual(0);
});
it('rejects nonexistent or mismatched dialogue actors',()=>{
 for(const tag of ['missing','vanguard-scout']){
  const g=game(`function on_start() mission.say("Marshal", "unit.ants.marshal", "Follow me.", 8, true, "${tag}") end`);g.tick();expect(g.state.mission?.error).toMatch(/Dialogue actor|Unknown entity ID/);expect(g.state.mission?.dialogue).toBeNull();
 }
});
