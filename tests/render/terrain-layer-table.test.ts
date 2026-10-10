import {expect,it} from 'vitest';
import {Color} from 'three';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {terrainLayerTable} from '../../src/render/terrain/terrainLayerTable';
import {groundTextures} from '../../src/shared/authoring/groundTextures';
import {sourceTerrainGLSL} from '../../src/render/terrain/sourceTerrainShader';

it('preserves every declared ground atlas and fractional material settings in a large palette',()=>{
 const source=authoredTerrain(new HeightField(16),[],[]);
 for(const [id,a] of groundTextures)if(!a.terrain?.projection)source.layers.push({name:id,ar:id,nh:id,tiling:.375,blend:-.25,verticality:.125,edge:.75,tint:'#aabbcc',desaturation:.325,breakup:.45});
 expect(source.layers.length).toBeGreaterThan(100);
 const table=terrainLayerTable(source);
 expect(table.height*table.width*4).toBe(table.data.length);
 source.layers.forEach((layer,index)=>{
  const at=(table.metadataOffset+index*8)*4,g=groundTextures.get(layer.ar)?.terrain;
  [layer.tiling,layer.blend,layer.verticality,layer.edge].forEach((v,i)=>expect(table.data[at+i]).toBeCloseTo(v,6));
  const tint=new Color(layer.tint??'#ffffff').multiplyScalar(g?.reflectance??1);
  [tint.r,tint.g,tint.b,layer.desaturation].forEach((v,i)=>expect(table.data[at+4+i]).toBeCloseTo(v,6));
  expect(table.data[at+12]).toBeCloseTo(layer.breakup??0,6);
  if(g){
   expect([...table.data.slice(at+8,at+12)]).toEqual([g.atlas.columns,g.atlas.rows,g.tileWorldSize,g.atlas.fullTiles[0]]);
   expect([...table.data.slice(at+16,at+32)]).toEqual(g.atlas.corners?.map(c=>c??0)??Array(16).fill(0));
  }
 });
 // Metadata no longer grows the shader uniform arrays or sampler count.
 const glsl=sourceTerrainGLSL(source.layers.length,true);
 expect(glsl).not.toMatch(/uniform\s+(?:float|int|vec[234])\s+\w+\[/);
 expect(glsl).toContain('texelFetch(uSourceSlots');
});

it('keeps all rectangular-map subblock slots distinct from material metadata',()=>{
 const source=authoredTerrain(new HeightField(16),[],[]);source.blocks=[3,2];
 const slots=Uint8Array.from({length:3*2*16*6},(_,i)=>i%251);source.layerSlots=Buffer.from(slots).toString('base64');
 const table=terrainLayerTable(source);
 for(let bz=0;bz<2;bz++)for(let bx=0;bx<3;bx++)for(let j=0;j<16;j++){
  const at=((bz*4+Math.floor(j/4))*table.width+bx*8+j%4*2)*4;
  expect([...table.data.slice(at,at+6)]).toEqual([...slots.slice(((bz*3+bx)*16+j)*6,((bz*3+bx)*16+j+1)*6)]);
  expect([...table.data.slice(at+6,at+8)]).toEqual([255,255]);
 }
 expect(table.metadataOffset).toBe(24*8);
});
