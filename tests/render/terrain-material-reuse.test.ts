import {beforeEach,expect,it,vi} from 'vitest';
import {DataArrayTexture,DataTexture,type WebGLProgramParametersWithUniforms} from 'three';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {ImportedTerrainMaterial} from '../../src/render/terrain/importedTerrainMaterial';
import {TerrainMaterial} from '../../src/render/terrain/terrainMaterial';
import {terrainTileArray} from '../../src/render/terrain/terrainTileArray';

vi.mock('../../src/render/terrain/terrainTileArray',()=>({terrainTileArray:vi.fn(async()=>new DataArrayTexture(new Uint8Array(4),1,1,1))}));
vi.mock('../../src/render/terrain/referenceTerrain',()=>({macroUrl:'macro',referenceTexture:()=>Object.assign(new DataTexture(new Uint8Array(4),1,1),{referenceReady:Promise.resolve()})}));
vi.mock('../../src/render/prop/referenceGround',()=>({ReferenceGround:class {
 ready=Promise.resolve();texture={value:new DataTexture()};underlay={value:new DataTexture()};
 updateSource(field:unknown){this.texture.value.dispose();this.texture.value=new DataTexture();this.texture.value.userData={field};}
 bindSurfaceUniforms(){}
 dispose(){this.texture.value.dispose();this.underlay.value.dispose();}
}}));
const shader=()=>({uniforms:{}} as WebGLProgramParametersWithUniforms);
beforeEach(()=>vi.clearAllMocks());

it('updates mask bytes and uniforms without refetching tiles or uploading unchanged height/slots',async()=>{
 const field=new HeightField(16);field.samples.fill(2);
 const source=authoredTerrain(field,[],[]),material=new ImportedTerrainMaterial(source);await material.ready;
 const before=shader();material.bindUniforms(before);
 const masks=before.uniforms.uSourceMasks.value,slots=before.uniforms.uSourceSlots.value,height=before.uniforms.uSourceHeight.value;
 const maskVersion=masks.version,slotsVersion=slots.version;
 field.grassCoverage=new Float32Array(field.samples.length).fill(1);
 const next=authoredTerrain(field,[],[]);next.layers[1].tiling=.75;next.layers[1].tint='#aabbcc';
 expect(material.update(next)).toBe(true);
 const after=shader();material.bindUniforms(after);
 expect(terrainTileArray).toHaveBeenCalledTimes(2);
 expect(after.uniforms.uSourceAR).toBe(before.uniforms.uSourceAR);
 expect(after.uniforms.uSourceMasks.value).toBe(masks);expect(masks.version).toBe(maskVersion+1);
 const size=field.samples.length;expect(masks.image.data.slice(size,size*2)).toEqual(new Uint8Array(size).fill(255));
 expect(after.uniforms.uSourceHeight.value).toBe(height);expect(after.uniforms.uSourceSlots.value).toBe(slots);expect(slots.version).toBe(slotsVersion);
 expect(after.uniforms.uSourceParams.value[1].x).toBe(.75);
 expect(after.uniforms.uSourceTints.value[1].getHexString()).toBe('aabbcc');
 expect(material.update(next)).toBe(true);expect(masks.version).toBe(maskVersion+1);
 material.dispose();
});

it('refreshes sculpted height and displacement while keeping the biome texture arrays',async()=>{
 const field=new HeightField(16);field.samples.fill(2);field.rockCoverage=new Float32Array(field.samples.length).fill(1);
 const original=authoredTerrain(field,[],[]),originalMask=original.displacement!.mask;
 const material=new ImportedTerrainMaterial(original);await material.ready;
 const before=shader();material.bindUniforms(before);const previousHeight=before.uniforms.uSourceHeight.value;
 field.rockCoverage.fill(0);field.samples.fill(4);
 const next=authoredTerrain(field,[],[]);expect(material.update(next)).toBe(true);
 const after=shader();material.bindUniforms(after,true);
 expect(after.uniforms.uSourceHeight.value).not.toBe(previousHeight);
 expect(after.uniforms.uSourceDisplacementMask.value.image.data).toEqual(new Uint8Array(Buffer.from(next.displacement!.mask,'base64')));
 expect(original.displacement!.mask).toBe(originalMask);
 expect(material.update(original)).toBe(true);material.bindUniforms(after,true);
 expect(after.uniforms.uSourceDisplacementMask.value.image.data).toEqual(new Uint8Array(Buffer.from(originalMask,'base64')));
 expect(terrainTileArray).toHaveBeenCalledTimes(3);material.dispose();
});

it('rejects incompatible tiles, dimensions or displacement assets before changing resources',async()=>{
 const source=authoredTerrain(new HeightField(16),[],[]),material=new ImportedTerrainMaterial(source);await material.ready;
 for(const mutate of [
  (s:typeof source)=>{s.layers[0].ar='other';},
  (s:typeof source)=>{s.layers[1].nh='other';},
  (s:typeof source)=>{s.maskSize[0]++;},
  (s:typeof source)=>{s.blocks[0]++;},
  (s:typeof source)=>{s.layers.pop();},
  (s:typeof source)=>{s.displacement={texture:'other',tiling:1,mask:s.layers[1].mask!};},
 ]){const next=structuredClone(source);mutate(next);expect(material.update(next)).toBe(false);expect(material.source).toBe(source);}
 expect(terrainTileArray).toHaveBeenCalledTimes(2);material.dispose();expect(material.update(source)).toBe(false);
});

it('keeps one set of pending loads across edits and disposes late results once',async()=>{
 const pending:Array<(texture:DataArrayTexture)=>void>=[];
 vi.mocked(terrainTileArray).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve))).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve)));
 const field=new HeightField(16),material=new ImportedTerrainMaterial(authoredTerrain(field,[],[]));
 field.grassCoverage=new Float32Array(field.samples.length).fill(1);
 expect(material.update(authoredTerrain(field,[],[]))).toBe(true);expect(terrainTileArray).toHaveBeenCalledTimes(2);
 material.dispose();
 const textures=pending.map(resolve=>{const texture=new DataArrayTexture();vi.spyOn(texture,'dispose');resolve(texture);return texture;});
 await material.ready;for(const texture of textures)expect(texture.dispose).toHaveBeenCalledOnce();
});

it('reuses terrain tiles through real coverage updates and rebinds the existing shadow shader',async()=>{
 const field=new HeightField(16);field.samples.fill(2);const material=new TerrainMaterial();material.update(field,[]);await material.ready;
 // Depth compilation needs only the source vertex chunk; color binding is verified above.
 const depth=shader();depth.vertexShader='#include <common>\n#include <begin_vertex>';material.compileImportedDepth(depth);
 const masks=depth.uniforms.uSourceMasks.value,ar=depth.uniforms.uSourceAR.value;
 field.grassCoverage=new Float32Array(field.samples.length).fill(1);material.update(field,[],true);await material.ready;
 expect(depth.uniforms.uSourceMasks.value).toBe(masks);expect(depth.uniforms.uSourceAR.value).toBe(ar);
 expect(terrainTileArray).toHaveBeenCalledTimes(2);material.dispose();
});

it('rewrites changed subblock slots while retaining the GPU texture',async()=>{
 const source=authoredTerrain(new HeightField(16),[],[]),material=new ImportedTerrainMaterial(source);await material.ready;
 const before=shader();material.bindUniforms(before);const slots=before.uniforms.uSourceSlots.value,version=slots.version;
 const next=structuredClone(source),raw=Buffer.from(next.layerSlots,'base64');raw[7]=5;next.layerSlots=raw.toString('base64');
 expect(material.update(next)).toBe(true);
 const after=shader();material.bindUniforms(after);
 expect(after.uniforms.uSourceSlots.value).toBe(slots);expect(slots.image.data[9]).toBe(5);
 expect(slots.image.data[14]).toBe(255);expect(slots.image.data[15]).toBe(255);expect(slots.version).toBe(version+1);
 material.dispose();
});

it('a pending compatible load keeps the newest edit when it finishes',async()=>{
 const pending:Array<(texture:DataArrayTexture)=>void>=[];
 vi.mocked(terrainTileArray).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve))).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve)));
 const field=new HeightField(16);field.samples.fill(2);const material=new ImportedTerrainMaterial(authoredTerrain(field,[],[]));
 const view=shader();material.bindUniforms(view);
 field.grassCoverage=new Float32Array(field.samples.length).fill(.75);const latest=authoredTerrain(field,[],[]);
 expect(material.update(latest)).toBe(true);material.bindUniforms(view);
 const textures=pending.map(resolve=>{const t=new DataArrayTexture();resolve(t);return t;});await material.ready;
 expect(material.source).toBe(latest);expect(view.uniforms.uSourceAR.value).toBe(textures[0]);
 expect(view.uniforms.uSourceMasks.value.image.data.slice(field.samples.length,field.samples.length*2)).toEqual(new Uint8Array(field.samples.length).fill(191));
 material.dispose();
});
