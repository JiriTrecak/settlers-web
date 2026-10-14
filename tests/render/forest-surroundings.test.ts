import {describe,expect,it} from 'vitest';
import {Mesh,MeshStandardMaterial,PlaneGeometry,Scene,ShaderLib} from 'three';
import {forestAnchors} from '../../src/shared/landscape/forestSurroundings';
import {BIOMES} from '../../src/content/biomes';
import {FogOfWar} from '../../src/render/visibility/fogOfWar';

// ENGINE-COUPLED: biomes are code-defined (src/content/biomes); the profile is chosen generically, never by name.
describe('biome forest surrounds',()=>{
 const profile=BIOMES.find(b=>b.surroundings)!.surroundings!;
 it.each([256,512,1024,2048])('keeps every trunk outside a %s map and bounds the scenery budget',size=>{
  const anchors=forestAnchors(size,731,profile);
  expect(anchors.length).toBeGreaterThan(0);expect(anchors.length).toBeLessThanOrEqual(384);
  for(const a of anchors){
   const clearance=Math.max(-a.x,a.x-size,-a.z,a.z-size);
   expect(clearance).toBeGreaterThan(a.radius+20);
   expect(a.height).toBeGreaterThan(100);
  }
 });
 it('reproduces positions independent of camera movement and ordinary object edits',()=>{
  expect(forestAnchors(256,731,profile)).toEqual(forestAnchors(256,731,profile));
  expect(forestAnchors(256,731,profile)).not.toEqual(forestAnchors(256,732,profile));
 });
 it('assigns an exterior look to every biome',()=>{
  for(const biome of BIOMES)expect(biome.surroundings?.trunk,biome.id).toBeTruthy();
 });
 it('exempts only explicitly decorative materials from visibility in warmups and live draws',()=>{
  const fog=new FogOfWar(16),scene=new Scene();
  const world=new MeshStandardMaterial(),scenery=new MeshStandardMaterial();scenery.userData.ignoreVisibility=true;
  const a=new Mesh(new PlaneGeometry(),world),b=new Mesh(new PlaneGeometry(),scenery);scene.add(a,b);
  fog.prepare(scene);fog.prepareDraws({opaque:[{object:a,material:world},{object:b,material:scenery}],transparent:[],transmissive:[]});
  const compile=(m:MeshStandardMaterial)=>{const s={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{} as Record<string,{value:unknown}>};m.onBeforeCompile(s as never,{} as never);return s.uniforms;};
  expect(compile(world).utcVisibility?.value).toBe(fog.texture);expect(compile(scenery).utcVisibility).toBeUndefined();fog.dispose();
 });
});
