import {describe,it,expect,vi} from 'vitest';
import {emptyUtcMap,readUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {projectScene} from '../../src/shared/authoring/project';
import * as generator from '../../src/shared/authoring/generate';

describe('saved maps contain finished editable data only',()=>{
 it('keeps generator previews outside both the map and export; Apply commits normal objects',async()=>{
  const editor=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});editor.replace(emptyUtcMap(256));
  await editor.putLayer({id:'forest',name:'Forest',recipe:'recipe.forest.conifer-edge',seed:14,shape:{type:'region',points:[{x:10,z:10},{x:40,z:10},{x:40,z:40},{x:10,z:40}]}});
  expect(editor.generatedScene!.objects.length).toBeGreaterThan(10);
  const before=JSON.parse(stringifyUtcMap(editor.map));
  expect(before.authoring.objects).toHaveLength(0);expect(before.authoring).not.toHaveProperty('layers');
  await editor.applyGenerators();
  const raw=JSON.parse(stringifyUtcMap(editor.map)),loaded=readUtcMap(raw);
  expect(raw.authoring.objects.length).toBeGreaterThan(10);expect(raw.authoring).not.toHaveProperty('layers');
  expect(raw).not.toHaveProperty('height');expect(raw).not.toHaveProperty('waterLevel');
  expect(raw.landscape).not.toHaveProperty('strokes');expect(raw.landscape).not.toHaveProperty('cover');
  expect(raw.authoring.objects.every((o:Record<string,unknown>)=>!('owner' in o)&&!('bakedFrom' in o)&&!('bakedPlacement' in o))).toBe(true);
  if(!('map' in loaded))throw Error(loaded.error);expect(loaded).toHaveProperty('map');
  const spy=vi.spyOn(generator,'generateScene');expect(projectScene(loaded.map)!.resources.length+projectScene(loaded.map)!.stamps.length).toBeGreaterThan(10);expect(spy).not.toHaveBeenCalled();spy.mockRestore();
  editor.undoLayers();expect(editor.layers.scene.layers).toHaveLength(1);expect(editor.map.authoring!.objects).toHaveLength(0);
  expect(readUtcMap(JSON.parse(stringifyUtcMap(editor.map)))).toHaveProperty('map');
 });
 it('rejects old procedural maps and generator fields instead of silently migrating them',()=>{
  const raw=JSON.parse(stringifyUtcMap(emptyUtcMap(256)));
  expect(readUtcMap({...raw,v:2})).toHaveProperty('error');
  expect(readUtcMap({...raw,authoring:{...raw.authoring,layers:[]}})).toHaveProperty('error');
  expect(readUtcMap({...raw,height:'old'})).toHaveProperty('error');
  expect(readUtcMap({...raw,landscape:{environment:{},strokes:[]}})).toHaveProperty('error');
 });
});
