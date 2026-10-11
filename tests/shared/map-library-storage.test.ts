import {afterEach,describe,expect,it,vi} from 'vitest';
import {authoredMaps,getMap,loadMap,registerMapPreview,releaseMapPreview} from '../../src/shared/map/library';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
afterEach(()=>vi.unstubAllGlobals());
describe('explicit project maps and temporary previews',()=>{
 it('never reads or writes browser map storage, including when previewing',async()=>{
  const forbidden=()=>{throw Error('Map persistence must be explicit');};
  vi.stubGlobal('indexedDB',{open:forbidden});vi.stubGlobal('localStorage',{getItem:forbidden,setItem:forbidden});
  const before=authoredMaps(),project=getMap('echo-isles');
  const map={...emptyUtcMap(),name:project.name,description:'Unsaved edit'};
  const id=registerMapPreview(map);
  try{
   map.description='Changed after preview started';
   expect((await loadMap(id)).map.description).toBe('Unsaved edit');
   expect(getMap(id).source).toBe('preview');
   expect(authoredMaps()).toEqual(before);expect(getMap('echo-isles')).toBe(project);
   expect(authoredMaps().every(m=>m.source==='project')).toBe(true);
  }finally{releaseMapPreview(id);}
  expect(()=>getMap(id)).toThrow('Map not found');
 });
 it('keeps separate test snapshots independent and releases them individually',async()=>{
  const first=registerMapPreview(emptyUtcMap()),second=registerMapPreview(emptyUtcMap());
  expect(first).not.toBe(second);releaseMapPreview(first);
  try{expect((await loadMap(second)).map.name).toBe(emptyUtcMap().name);}finally{releaseMapPreview(second);}
 });
 it('does not accept old local-copy URLs',()=>{expect(()=>getMap('local:echo-isles-v2-2')).toThrow('Map not found');});
});
