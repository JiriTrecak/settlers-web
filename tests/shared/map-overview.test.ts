import {afterEach,describe,expect,it,vi} from 'vitest';
import {mapOverview,mapSourceHash,hasPlayableSlots} from '../../src/shared/map/overview';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {authoredMaps,playableMaps,missionMaps,overviewOf} from '../../src/shared/map/library';
import {projectScene} from '../../src/shared/authoring/project';
vi.mock('../../src/shared/authoring/project',async importOriginal=>({...await importOriginal<object>(),projectScene:vi.fn(()=>{throw Error('Browsing must not generate a world');})}));
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
describe('published map browsing',()=>{
 it('lists project maps and metadata without compiling any world',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});
  const maps=playableMaps();
  expect(maps.length).toBeGreaterThan(0);
  expect(maps.every(m=>m.previewUrl&&overviewOf(m).playable)).toBe(true);
  for(const m of authoredMaps())expect(overviewOf(m).size).toBeGreaterThan(0);
  missionMaps();
  expect(projectScene).not.toHaveBeenCalled();
 });
 it('checks source freshness without a simulation fingerprint',()=>{
  const map=emptyUtcMap(),raw=JSON.stringify(map);
  expect(mapOverview(map,raw).sourceHash).toBe(mapSourceHash(raw));
  expect(mapSourceHash(raw)).not.toBe(mapSourceHash(raw+' '));
 });
 it('honors published validation and permits older local saves with valid slots',()=>{
  const info=mapOverview(emptyUtcMap());
  expect(hasPlayableSlots({...info,playable:false})).toBe(false);
  expect(hasPlayableSlots({...info,starts:[]})).toBe(false);
  expect(hasPlayableSlots({...info,starts:[{player:1,x:30,z:30,setup:'default',mainFort:'building.ants.hall'},{player:2,x:90,z:90,setup:'default',mainFort:'building.ants.hall'}]})).toBe(true);
  expect(hasPlayableSlots({...info,sandbox:true,starts:[{player:1,x:30,z:30,setup:'default',mainFort:'building.ants.hall'}]})).toBe(true);
 });
});
