import {expect,it,vi} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,MeshDepthMaterial,ShaderLib,type WebGLRenderer} from 'three';
import {ConcealmentVisuals,CONCEALMENT_DISCARD} from '../../src/render/characters/concealment';
it('isolates shared materials per concealed actor and restores ownership on disposal',()=>{
 const original=new MeshStandardMaterial(),geometry=new BoxGeometry(),a=new Group(),b=new Group();
 const one=new Mesh(geometry,original),two=new Mesh(geometry,original);a.add(one);b.add(two);
 const visuals=new ConcealmentVisuals();visuals.set(a,1);expect(one.material).toBe(original);
 visuals.set(a,.28);const owned=one.material,depth=one.customDepthMaterial!;
 expect(owned).not.toBe(original);expect(two.material).toBe(original);
 const disposed=vi.fn(),depthDisposed=vi.fn(),originalDisposed=vi.fn();owned.addEventListener('dispose',disposed);depth.addEventListener('dispose',depthDisposed);original.addEventListener('dispose',originalDisposed);
 visuals.set(a,.6);expect(one.material).toBe(owned);visuals.remove(a);
 expect(one.material).toBe(original);expect(one.customDepthMaterial).toBeUndefined();expect(disposed).toHaveBeenCalledOnce();expect(depthDisposed).toHaveBeenCalledOnce();expect(originalDisposed).not.toHaveBeenCalled();visuals.dispose();
 geometry.dispose();original.dispose();
});
it('preserves existing material hooks and applies the same fade to colour and shadow shaders',()=>{
 const original=new MeshStandardMaterial(),depth=new MeshDepthMaterial(),mesh=new Mesh(new BoxGeometry(),original);mesh.customDepthMaterial=depth;
 original.onBeforeCompile=shader=>{shader.uniforms.existing={value:42};};
 const visuals=new ConcealmentVisuals();visuals.set(mesh,.28);
 const compile=(material:MeshStandardMaterial|MeshDepthMaterial,kind:'standard'|'depth')=>{
  const shader={vertexShader:ShaderLib[kind].vertexShader,fragmentShader:ShaderLib[kind].fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as WebGLRenderer);return shader as typeof shader & {uniforms:Record<string,{value:number}>};
 };
 const color=compile(mesh.material,'standard'),shadow=compile(mesh.customDepthMaterial as MeshDepthMaterial,'depth');
 expect(color.uniforms.existing?.value).toBe(42);expect(color.fragmentShader).toContain(CONCEALMENT_DISCARD);expect(shadow.fragmentShader).toContain(CONCEALMENT_DISCARD);
 expect(color.uniforms.utcConcealment).toBe(shadow.uniforms.utcConcealment);visuals.set(mesh,1);expect(color.uniforms.utcConcealment.value).toBe(1);
 visuals.dispose();expect(mesh.customDepthMaterial).toBe(depth);mesh.geometry.dispose();original.dispose();depth.dispose();
});
