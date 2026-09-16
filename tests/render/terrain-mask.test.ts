import {it,expect,vi} from 'vitest';
import {Texture,TextureLoader,DataTexture} from 'three';
import {TerrainMaterial} from '../../src/render/terrain/terrainMaterial';
import {HeightField,HEIGHT_ORIGIN} from '../../src/shared/map/height';
it('edits roads and moss independently in their shared texture channels',()=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture());
 const m=new TerrainMaterial(16),field=new HeightField(16);
 try{
  const shader={uniforms:{} as Record<string,{value:unknown}>,vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <map_fragment>'};
  m.onBeforeCompile(shader as never,{} as never);
  const mask=shader.uniforms.uRoadMask.value as DataTexture,data=mask.image.data as Uint8Array;
  m.setCover([{x:10,z:10,radius:3,density:1,seed:1,flowers:0,palette:'forest'}]);
  const moss=(Math.round(10-HEIGHT_ORIGIN)*field.verts+Math.round(10-HEIGHT_ORIGIN))*2+1;
  expect(data[moss]).toBe(255);
  m.update(field,[{layer:'road',points:[{x:4,z:4},{x:12,z:4}],radius:2,opacity:1}]);
  const road=(Math.round(4-HEIGHT_ORIGIN)*field.verts+Math.round(8-HEIGHT_ORIGIN))*2;
  expect(data[road]).toBe(255);expect(data[moss]).toBe(255);
  m.setCover([]);expect(data[road]).toBe(255);expect(data[moss]).toBe(0);
 }finally{m.dispose();loader.mockRestore();}
});
