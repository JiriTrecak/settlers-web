import {it,expect,vi} from 'vitest';
import type {WebGLProgramParametersWithUniforms} from 'three';
vi.mock('../../src/render/terrain/importedTerrainMaterial',()=>({ImportedTerrainMaterial:class {
 ready=Promise.resolve();constructor(readonly source:unknown){}
 update(){return false;}
 bindUniforms(shader:WebGLProgramParametersWithUniforms){shader.uniforms.currentTerrain={value:this.source};}
 compile(shader:WebGLProgramParametersWithUniforms){this.bindUniforms(shader);}
 compileDepth(shader:WebGLProgramParametersWithUniforms){this.bindUniforms(shader);}
 dispose(){}
}}));
import {TerrainMaterial} from '../../src/render/terrain/terrainMaterial';
import {HeightField} from '../../src/shared/map/height';
import type {ImportedTerrain} from '../../src/shared/map/importedTerrain';
it('rebinds already-compiled color and shadow uniforms when a painted landform is subtracted',()=>{
 const material=new TerrainMaterial(),before=new HeightField(16);before.samples.fill(6);before.rockCoverage=new Float32Array(before.samples.length).fill(1);
 material.update(before,[]);
 const color={uniforms:{}} as WebGLProgramParametersWithUniforms,depth={uniforms:{}} as WebGLProgramParametersWithUniforms;
 material.onBeforeCompile(color,{} as never);material.compileImportedDepth(depth);
 const original=color.uniforms.currentTerrain!.value as ImportedTerrain;expect(original.displacement).toBeDefined();
 const after=new HeightField(16);material.update(after,[]);
 const current=color.uniforms.currentTerrain!.value as ImportedTerrain;
 expect(current).not.toBe(original);expect(current.displacement).toBeUndefined();expect(current.height).not.toEqual(original.height);
 expect(depth.uniforms.currentTerrain!.value).toBe(current);material.dispose();
});

it('reuses geometry sampling for coverage edits but invalidates it after sculpting the same height field',()=>{
 const material=new TerrainMaterial(),field=new HeightField(16);field.samples.fill(2);
 material.update(field,[]);
 const color={uniforms:{}} as WebGLProgramParametersWithUniforms;
 material.onBeforeCompile(color,{} as never);
 const original=color.uniforms.currentTerrain!.value as ImportedTerrain;
 const sample=vi.spyOn(field,'sample');
 field.grassCoverage=new Float32Array(field.samples.length).fill(1);
 material.update(field,[],true);
 const painted=color.uniforms.currentTerrain!.value as ImportedTerrain;
 expect(sample).not.toHaveBeenCalled();expect(painted.height).toBe(original.height);expect(painted.layers).not.toEqual(original.layers);
 field.raise(8,8,5,3);material.update(field,[]);
 const sculpted=color.uniforms.currentTerrain!.value as ImportedTerrain;
 expect(sample).toHaveBeenCalled();expect(sculpted.height).not.toBe(painted.height);
 material.dispose();
});

it('sends independent road and cover masks to the actual color and shadow shader inputs',async()=>{
 const {terrainMaskBytes}=await import('../../src/render/terrain/terrainMasks');
 const material=new TerrainMaterial(),field=new HeightField(16);field.samples.fill(2);field.waterLevel=-2;
 const road={layer:'road' as const,points:[{x:4,z:4},{x:12,z:4}],radius:2,opacity:1};
 material.update(field,[road]);material.setCover([{x:10,z:10,radius:3,density:1,seed:1,flowers:0,palette:'forest'}]);
 const color={uniforms:{}} as WebGLProgramParametersWithUniforms,depth={uniforms:{}} as WebGLProgramParametersWithUniforms;
 material.onBeforeCompile(color,{} as never);material.compileImportedDepth(depth);
 const source=()=>color.uniforms.currentTerrain!.value as ImportedTerrain;
 const at=(x:number,z:number)=>(z-field.origin)*field.verts+x-field.origin;
 const mask=(name:string)=>terrainMaskBytes(source().layers.find(l=>l.name===name)!)!;
 expect(mask('dirt')[at(8,4)]).toBe(255);expect(mask('grass')[at(10,10)]).toBe(255);
 material.setCover([]);
 expect(mask('dirt')[at(8,4)]).toBe(255);expect(mask('grass')[at(10,10)]).toBe(0);
 expect(depth.uniforms.currentTerrain!.value).toBe(source());material.dispose();
});
