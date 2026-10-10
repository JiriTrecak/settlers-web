import {afterEach,describe,expect,it,vi} from 'vitest';
import {mapOverview,mapSourceHash,hasPlayableSlots} from '../../src/shared/map/overview';
import {emptyUtcMap,parseUtcMap} from '../../src/shared/map/utcmap';
import {authoredMaps,loadMap,playableMaps,missionMaps,overviewOf} from '../../src/shared/map/library';
import {projectScene} from '../../src/shared/authoring/project';
vi.mock('../../src/shared/map/utcmap',async original=>({...await original<object>(),parseUtcMap:vi.fn((await original<typeof import('../../src/shared/map/utcmap')>()).parseUtcMap)}));
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
  expect(projectScene).not.toHaveBeenCalled();expect(parseUtcMap).not.toHaveBeenCalled();
 });
 it('opens only the selected map and shares concurrent terrain loads',async()=>{
  const selections=authoredMaps().filter(m=>m.source==='project');
  expect(selections.every(m=>!('map' in m))).toBe(true);
  const [first,second]=await Promise.all([loadMap(selections[0].id),loadMap(selections[0].id)]);
  expect(first).toBe(second);expect(first.map.name).toBe(selections[0].name);
  expect(parseUtcMap).toHaveBeenCalledTimes(1);expect(projectScene).not.toHaveBeenCalled();
  await loadMap(selections[0].id);expect(parseUtcMap).toHaveBeenCalledTimes(1);
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
