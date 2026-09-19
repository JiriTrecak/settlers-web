import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
import {createSkirmishMatch,defaultSlots} from '../../src/shared/match/skirmish';
import {expandMap} from '../../src/content/map';
import {content} from '../../src/content/builtin';
import {Game} from '../../src/sim/game/game';
const map=parseUtcMap(JSON.parse(readFileSync('assets/maps/skirmish/texture-test-1.utcmap','utf8')))!;
const slots=defaultSlots(map.playerStarts);
it('round trips a single-player custom testbed with exactly one hero',()=>{
 expect(map.name).toBe('Texture Test 1');expect(map.mission).toBeUndefined();expect(map.sandbox).toBe(true);
 expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
 expect(playableMapError(map)).toBeNull();
 expect(expandMap(map,content)).toEqual(map.entities);expect(map.entities).toHaveLength(1);
 expect(map.entities[0].definition).toBe('unit.ants.marshal');expect(map.camps).toHaveLength(0);
});
it('requires explicit testbed mode for one human and rejects AI-only testbeds',()=>{
 const setup={mapId:'texture-test-1',slots};
 expect(()=>createSkirmishMatch(setup,map.playerStarts,'rev')).toThrow();
 expect(createSkirmishMatch(setup,map.playerStarts,'rev','You',1,true).player).toBe(0);
 expect(()=>createSkirmishMatch({...setup,slots:[{player:0,kind:'ai'}]},map.playerStarts,'rev','',1,true)).toThrow();
 expect(parseUtcMap({...map,sandbox:undefined})).toBeNull();
 expect(parseUtcMap({...map,playerStarts:[...map.playerStarts,{...map.playerStarts[0],player:2}]})).toBeNull();
});
it('runs and restores without a fort, opponents, automatic defeat, or additional units',()=>{
 const game=new Game(map,slots,content);
 for(let i=0;i<240;i++)game.tick();
 expect(game.entities).toHaveLength(1);expect(game.state.outcome).toBeNull();expect(game.isDefeated('player.1')).toBe(false);
 const saved=game.snapshot(),restored=new Game(map,slots,content);restored.restore(saved);
 expect(restored.snapshot()).toEqual(saved);restored.tick();expect(restored.state.outcome).toBeNull();
});
it('starts revealed in the worker and saves under custom games',async()=>{
 const {SimulationRuntime}=await import('../../src/session/worker/runtime');
 const {match}=createSkirmishMatch({mapId:'texture-test-1',slots},map.playerStarts,'rev','You',1,true);
 const runtime=new SimulationRuntime({map,match,player:0,remote:false});
 try{
  expect(runtime.project().visual.settlement.fog!.cells.every(v=>v===2)).toBe(true);
  for(let i=0;i<40;i++)runtime.advance(50);
  const save=runtime.snapshotLocal();expect(save.mode).toBe('skirmish');
  runtime.restoreLocal(save);expect(runtime.world.settlement.entities).toHaveLength(1);
  expect(runtime.world.settlement.state.outcome).toBeNull();
 }finally{runtime.destroy();}
});
