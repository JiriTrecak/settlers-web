import {describe,it,expect} from 'vitest';
import {Scene,Mesh,PlaneGeometry,MeshStandardMaterial,ShaderMaterial,ShaderLib} from 'three';
import {FogOfWar} from '../../src/render/visibility/fogOfWar';
import {ReferenceGround} from '../../src/render/prop/referenceGround';
import {sourceWaterVertex,sourceWaterFragment} from '../../src/render/water/sourceWaterShaders';
import {batchStaticMaterials} from '../../src/render/prop/staticBatch';
describe('Fog across custom environment surfaces',()=>{
 it('patches a terrain-conforming underlay after its projection was replaced',()=>{
  const ground=new ReferenceGround(),m=new MeshStandardMaterial();m.userData.sourceShader='plant';ground.attach(m);
  const scene=new Scene();scene.add(new Mesh(new PlaneGeometry(),m));const fog=new FogOfWar(16);fog.prepare(scene);
  const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{} as Record<string,{value:unknown}>};m.onBeforeCompile(shader as never,{} as never);
  expect(shader.vertexShader).toContain('vec4 mvPosition=viewMatrix*referenceWorld');
  expect(shader.vertexShader).toContain('utcFogPosition=transpose(mat3(viewMatrix))*mvPosition.xyz+cameraPosition');
  expect(shader.fragmentShader).toContain('utcLight*=inside');expect(shader.uniforms.utcVisibility.value).toBe(fog.texture);
  fog.dispose();ground.dispose();
 });
 it('applies the same visibility atlas to the complete custom river output',()=>{
  const m=new ShaderMaterial({vertexShader:sourceWaterVertex,fragmentShader:sourceWaterFragment}),scene=new Scene();scene.add(new Mesh(new PlaneGeometry(),m));const fog=new FogOfWar(16);fog.prepare(scene);
  const shader={vertexShader:sourceWaterVertex,fragmentShader:sourceWaterFragment,uniforms:{} as Record<string,{value:unknown}>};m.onBeforeCompile(shader as never,{} as never);
  expect(shader.vertexShader).toContain('utcFogPosition=p;');expect(shader.fragmentShader.indexOf('utcLight*=inside')).toBeGreaterThan(shader.fragmentShader.indexOf('gl_FragColor=vec4(finalColor,1.)'));
  expect(shader.uniforms.utcVisibility.value).toBe(fog.texture);fog.dispose();
 });
 it('never writes albedo into the source shader occlusion channel when batching',()=>{
  const root=new Scene();for(const color of [0xcc8800,0x774400]){const m=new MeshStandardMaterial({color});m.userData.referenceEnvironment=true;root.add(new Mesh(new PlaneGeometry(),m));}
  const dispose=batchStaticMaterials(root);expect(root.children).toHaveLength(2);expect((root.children[0] as Mesh).geometry.hasAttribute('color')).toBe(false);dispose();
 });
});
