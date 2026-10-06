import {afterEach,describe,expect,it,vi} from 'vitest';
import {authoredMaps,getMap,rememberAuthoredMap,LOCAL_MAPS_KEY} from '../../src/shared/map/library';
afterEach(()=>vi.unstubAllGlobals());
function storage(initial:string='[]'){
 const data=new Map([[LOCAL_MAPS_KEY,initial]]);
 vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
 return data;
}
describe('project and local map identity',()=>{
 it('keeps the project version when an older same-name local save exists',()=>{
  storage();const project=getMap('amberwake-basin');
  const old={...project.map,description:'Old browser map',authoring:{...project.map.authoring!,layers:[],objects:[]}};
  const data=storage(JSON.stringify([{id:'amberwake-basin',map:old}]));
  expect(getMap('amberwake-basin').map).toEqual(project.map);
  expect(getMap('local:amberwake-basin').map).toEqual(old);
  expect(getMap('local:amberwake-basin').name).toContain('local copy');
  expect(JSON.parse(data.get(LOCAL_MAPS_KEY)!)[0].map).toEqual(old);
 });
 it('saving updates the local copy while preserving the project and other local maps',()=>{
  storage();const project=getMap('amberwake-basin').map;
  rememberAuthoredMap({...project,name:'My river'});
  rememberAuthoredMap({...project,description:'Edited locally'});
  rememberAuthoredMap({...project,description:'Edited again'});
  expect(getMap('amberwake-basin').map).toEqual(project);
  expect(getMap('local:amberwake-basin').map.description).toBe('Edited again');
  expect(authoredMaps().filter(m=>m.source==='local')).toHaveLength(2);
 });
});
