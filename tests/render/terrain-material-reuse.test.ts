import {beforeEach,expect,it,vi} from 'vitest';
import {Color,DataArrayTexture,DataTexture,type WebGLProgramParametersWithUniforms} from 'three';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {ImportedTerrainMaterial} from '../../src/render/terrain/importedTerrainMaterial';
import {terrainTileArray} from '../../src/render/terrain/terrainTileArray';
import {groundTextures} from '../../src/shared/authoring/groundTextures';

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

it('updates mask bytes and layer metadata in place for compatible coverage and material edits',async()=>{
 const field=new HeightField(16);field.samples.fill(2);field.grassCoverage=new Float32Array(field.samples.length).fill(.25);
 const source=authoredTerrain(field,[],[]),material=new ImportedTerrainMaterial(source);await material.ready;
 field.grassCoverage=new Float32Array(field.samples.length).fill(1);
 const next=authoredTerrain(field,[],[]);next.layers[1].tiling=.75;next.layers[1].tint='#aabbcc';
 expect(material.update(next)).toBe(true);expect(material.source).toBe(next);
 const after=shader();material.bindUniforms(after);
 const masks=after.uniforms.uSourceMasks.value,slots=after.uniforms.uSourceSlots.value;
 const size=field.samples.length;expect(masks.image.data.slice(size*4,size*8).filter((_:number,i:number)=>i%4===0)).toEqual(new Uint8Array(size).fill(255));
 const at=(after.uniforms.uSourceMetadataOffset.value+8)*4;
 expect(slots.image.data[at]).toBe(.75);
 const tint=new Color('#aabbcc');
 for(const [i,value] of [tint.r,tint.g,tint.b].entries())expect(slots.image.data[at+4+i]).toBeCloseTo(value,6);
 material.dispose();
});

it('refreshes sculpted height and displacement and restores them on undo',async()=>{
 const field=new HeightField(16);field.samples.fill(2);field.grassCoverage=new Float32Array(field.samples.length).fill(.25);field.rockCoverage=new Float32Array(field.samples.length).fill(1);
 const original=authoredTerrain(field,[],[]),originalMask=original.displacement!.mask;
 const material=new ImportedTerrainMaterial(original);await material.ready;
 const before=shader();material.bindUniforms(before);const previousHeight=before.uniforms.uSourceHeight.value;
 field.rockCoverage.fill(0);field.samples.fill(4);
 const next=authoredTerrain(field,[],[]);expect(material.update(next)).toBe(true);
 const after=shader();material.bindUniforms(after,true);
 expect(after.uniforms.uSourceHeight.value).not.toBe(previousHeight);
 expect(next.displacement).toBeUndefined();
 expect(after.uniforms.uSourceHasDisplacement.value).toBe(0);
 expect(after.uniforms.uSourceMasks.value.image.data.slice(0,field.samples.length*4).filter((_:number,i:number)=>i%4===3)).toEqual(new Uint8Array(field.samples.length));
 expect(original.displacement!.mask).toBe(originalMask);
 expect(material.update(original)).toBe(true);material.bindUniforms(after,true);
 expect(after.uniforms.uSourceMasks.value.image.data.slice(0,field.samples.length*4).filter((_:number,i:number)=>i%4===3)).toEqual(new Uint8Array(Buffer.from(originalMask,'base64')));
 material.dispose();
});

it('preserves independent ground masks when displacement coverage shares base alpha',async()=>{
 const field=new HeightField(16);field.samples.fill(2);
 field.grassCoverage=new Float32Array(field.samples.length).fill(.6);
 field.rockCoverage=Float32Array.from({length:field.samples.length},(_,i)=>(i%5)/4);
 const source=authoredTerrain(field,[],[]),material=new ImportedTerrainMaterial(source);await material.ready;
 const view=shader();material.bindUniforms(view);
 const masks=view.uniforms.uSourceMasks.value,n=field.samples.length;
 const alpha=()=>masks.image.data.slice(0,n*4).filter((_:number,i:number)=>i%4===3);
 const coverage=new Uint8Array(Buffer.from(source.displacement!.mask,'base64'));
 expect(alpha()).toEqual(coverage);
 const ground=masks.image.data.slice(n*4);
 const next=structuredClone(source);next.displacement=undefined;
 expect(material.update(next)).toBe(true);
 expect(alpha()).toEqual(new Uint8Array(n));expect(masks.image.data.slice(n*4)).toEqual(ground);
 expect(material.update(source)).toBe(true);expect(alpha()).toEqual(coverage);
 expect(masks.minFilter).toBe(masks.magFilter);material.dispose();
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
 material.dispose();expect(material.update(source)).toBe(false);
});

it('disposes texture loads that finish after the material is disposed',async()=>{
 const pending:Array<(texture:DataArrayTexture)=>void>=[];
 vi.mocked(terrainTileArray).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve))).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve)));
 const field=new HeightField(16),material=new ImportedTerrainMaterial(authoredTerrain(field,[],[]));
 field.grassCoverage=new Float32Array(field.samples.length).fill(1);
 expect(material.update(authoredTerrain(field,[],[]))).toBe(true);
 material.dispose();
 const textures=pending.map(resolve=>{const texture=new DataArrayTexture();vi.spyOn(texture,'dispose');resolve(texture);return texture;});
 await material.ready;for(const texture of textures)expect(texture.dispose).toHaveBeenCalledOnce();
});



it('a pending compatible load keeps the newest edit when it finishes',async()=>{
 const pending:Array<(texture:DataArrayTexture)=>void>=[];
 vi.mocked(terrainTileArray).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve))).mockImplementationOnce(()=>new Promise(resolve=>pending.push(resolve)));
 const field=new HeightField(16);field.samples.fill(2);field.grassCoverage=new Float32Array(field.samples.length).fill(.25);const material=new ImportedTerrainMaterial(authoredTerrain(field,[],[]));
 const view=shader();material.bindUniforms(view);
 field.grassCoverage=new Float32Array(field.samples.length).fill(.75);const latest=authoredTerrain(field,[],[]);
 expect(material.update(latest)).toBe(true);material.bindUniforms(view);
 const textures=pending.map(resolve=>{const t=new DataArrayTexture();resolve(t);return t;});await material.ready;
 expect(material.source).toBe(latest);expect(view.uniforms.uSourceAR.value).toBe(textures[0]);
 expect(view.uniforms.uSourceMasks.value.image.data.slice(field.samples.length*4,field.samples.length*8).filter((_:number,i:number)=>i%4===0)).toEqual(new Uint8Array(field.samples.length).fill(191));
 material.dispose();
});


// ENGINE-COUPLED: atlas materials come from the shipped landscape catalogue; any multi-tile atlas will do.
const atlas=[...groundTextures].find(([,a])=>!a.terrain?.projection&&(a.terrain?.atlas.columns??1)*(a.terrain?.atlas.rows??1)>1)![0];
it('uploads atlas variants at their five-unit world positions and keeps the shifted origin in the shader',async()=>{
 const field=new HeightField(16);field.samples.fill(2);field.textureGrid={cellSize:5,origin:[-.5,-.5]};
 field.surfacePaint=[{owner:'terrain',material:atlas,weights:new Float32Array(field.samples.length).fill(1),variants:Uint8Array.from({length:121},(_,i)=>i%2)}];
 const source=authoredTerrain(field,[],[]),material=new ImportedTerrainMaterial(source);await material.ready;
 const view=shader();material.bindUniforms(view);expect(view.uniforms.uSourceAtlasOrigin.value.toArray()).toEqual([-.5,-.5]);
 const bytes=view.uniforms.uSourceMasks.value.image.data,layer=source.layers.findIndex(l=>l.ar===atlas),n=field.samples.length;
 const at=(x:number,z:number,c:number)=>bytes[(layer*n+(z-field.origin)*field.verts+x-field.origin)*4+c];
 // The boundary lies at x=4.5; world x=0 and x=4 share a tile, x=5 does not.
 expect(at(0,0,1)).toBe(31);expect(at(0,0,2)).toBe(at(4,0,2));expect(at(5,0,2)).not.toBe(at(4,0,2));
 const moved={...source,textureGrid:{cellSize:5,origin:[4.5,-.5] as [number,number]}};
 expect(material.update(moved)).toBe(false);material.dispose();
});
