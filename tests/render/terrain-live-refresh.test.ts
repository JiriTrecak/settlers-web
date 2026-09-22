import {it,expect,vi} from 'vitest';
import type {WebGLProgramParametersWithUniforms} from 'three';
vi.mock('../../src/render/terrain/importedTerrainMaterial',()=>({ImportedTerrainMaterial:class {
 ready=Promise.resolve();constructor(readonly source:unknown){}
 bindUniforms(shader:WebGLProgramParametersWithUniforms){shader.uniforms.currentTerrain={value:this.source};}
 compile(shader:WebGLProgramParametersWithUniforms){this.bindUniforms(shader);}
 compileDepth(shader:WebGLProgramParametersWithUniforms){this.bindUniforms(shader);}
 dispose(){}
}}));
import {TerrainMaterial} from '../../src/render/terrain/terrainMaterial';
import {HeightField} from '../../src/shared/map/height';
import type {ImportedTerrain} from '../../src/shared/map/importedTerrain';
it('rebinds already-compiled color and shadow uniforms when a painted landform is subtracted',()=>{
 const material=new TerrainMaterial(16),before=new HeightField(16);before.samples.fill(6);before.rockCoverage=new Float32Array(before.samples.length).fill(1);
 material.update(before,[]);
 const color={uniforms:{}} as WebGLProgramParametersWithUniforms,depth={uniforms:{}} as WebGLProgramParametersWithUniforms;
 material.onBeforeCompile(color,{} as never);material.compileImportedDepth(depth);
 const original=color.uniforms.currentTerrain!.value as ImportedTerrain;expect(original.displacement).toBeDefined();
 const after=new HeightField(16);material.update(after,[]);
 const current=color.uniforms.currentTerrain!.value as ImportedTerrain;
 expect(current).not.toBe(original);expect(current.displacement).toBeUndefined();expect(current.height).not.toEqual(original.height);
 expect(depth.uniforms.currentTerrain!.value).toBe(current);material.dispose();
});
