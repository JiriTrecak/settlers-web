import {beforeEach,describe,expect,it,vi} from 'vitest';
import {authoredMaps,getMap,loadMap,rememberAuthoredMap,initializeMapLibrary} from '../../src/shared/map/library';
import {localMapStorage,type StoredMap} from '../../src/shared/map/localMapStorage';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
vi.mock('../../src/shared/map/localMapStorage',()=>({localMapStorage:{read:vi.fn(),write:vi.fn()}}));
let rows:Map<string,StoredMap>;
beforeEach(async()=>{
 rows=new Map();vi.mocked(localMapStorage.read).mockImplementation(async()=>[...rows.values()]);
 vi.mocked(localMapStorage.write).mockImplementation(async row=>{rows.set(row.id,structuredClone(row));});
 await initializeMapLibrary();
});
describe('project and local map identity',()=>{
 it('keeps project maps separate from same-name editable local copies',async()=>{
  const project=getMap('echo-isles'),map={...emptyUtcMap(),name:project.name,description:'Local editing copy'};
  const id=await rememberAuthoredMap(map);
  expect(id).toBe('local:echo-isles-v2-2');expect(getMap('echo-isles')).toBe(project);
  expect((await loadMap(id)).map).toEqual(map);expect(getMap(id).name).toContain('local copy');
 });
 it('persists large terrain documents and hydrates them without web-storage quotas',async()=>{
  const map=(await loadMap('echo-isles')).map,id=await rememberAuthoredMap(map);
  expect(rows.get(id)!.json.length).toBeGreaterThan(10*1024*1024);
  await initializeMapLibrary();expect((await loadMap(id)).map).toEqual(map);
  expect(JSON.parse(rows.get(id)!.json).authoring.layers).toBeUndefined();
 });
 it('saving updates one local copy and preserves other maps',async()=>{
  const map=emptyUtcMap();await rememberAuthoredMap({...map,name:'My river'});
  const id=await rememberAuthoredMap({...map,description:'First'});
  await rememberAuthoredMap({...map,description:'Edited again'});
  expect((await loadMap(id)).map.description).toBe('Edited again');
  expect(authoredMaps().filter(m=>m.source==='local')).toHaveLength(2);
  expect(rows.size).toBe(2);
 });
 it('does not acknowledge a failed write or replace the last saved map',async()=>{
  const map=emptyUtcMap(),id=await rememberAuthoredMap(map);
  vi.mocked(localMapStorage.write).mockRejectedValueOnce(Error('Storage unavailable'));
  await expect(rememberAuthoredMap({...map,name:map.name,description:'Not saved'})).rejects.toThrow('Storage unavailable');
  expect((await loadMap(id)).map.description).toBe(map.description);
  await initializeMapLibrary();expect((await loadMap(id)).map.description).toBe(map.description);
 });
 it('isolates damaged entries and never allows a local record to shadow a project id',async()=>{
  const map=emptyUtcMap(),id=await rememberAuthoredMap(map);
  rows.set('local:broken',{id:'local:broken',json:'not json'});
  rows.set('echo-isles',{id:'echo-isles',json:JSON.stringify({...map,name:'Impostor'})});
  await initializeMapLibrary();expect((await loadMap(id)).map).toEqual(map);
  expect(getMap('echo-isles').source).toBe('project');
  expect(authoredMaps().filter(m=>m.source==='local')).toHaveLength(1);
 });
});
