import {it,expect} from 'vitest';
import {Mesh,Texture,Group,MeshStandardMaterial,BoxGeometry,type MeshDepthMaterial} from 'three';
import {FoliageWindLayer} from '../../src/render/prop/foliageWind';
import {ReferenceGround} from '../../src/render/prop/referenceGround';
import {HeightField} from '../../src/shared/map/height';

it('preserves cutout alpha and leaf deformation in shadow passes while excluding underlays',()=>{
 const root=new Group(),map=new Texture(),m=new MeshStandardMaterial({map,alphaTest:.5});m.userData.foliage=true;
 const mesh=new Mesh(new BoxGeometry(),m),under=new Mesh(new BoxGeometry(),new MeshStandardMaterial());under.userData.underlay=true;root.add(mesh,under);
 const wind=new FoliageWindLayer();wind.attach(root,{amplitude:.12,speed:.22},12);
 expect((mesh.customDepthMaterial as MeshDepthMaterial).map).toBe(map);expect(mesh.customDepthMaterial!.alphaTest).toBe(.5);expect(under.customDepthMaterial).toBeUndefined();
 // The shadow caster must deform exactly like the visible leaves.
 const shader=()=>({uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:''});
 const color=shader(),depth=shader();m.onBeforeCompile(color as never,{} as never);mesh.customDepthMaterial!.onBeforeCompile(depth as never,{} as never);
 expect(depth.vertexShader).toBe(color.vertexShader);expect(color.vertexShader).not.toBe(shader().vertexShader);wind.dispose();
});

it('updates a shared underlay height texture on terrain edits and map resize',()=>{
 const ground=new ReferenceGround(),field=new HeightField(64);field.samples.fill(2);ground.update(field);
 const first=ground.texture.value;expect(first.image.width).toBe(field.verts);expect(first.image.data![0]).toBe(2);
 field.samples[0]=3;ground.update(field);expect(ground.texture.value.image.data![0]).toBe(3);
 const resized=new HeightField(128);ground.update(resized);expect(ground.texture.value.image.width).toBe(resized.verts);expect(ground.grid.value.y).toBe(resized.verts);ground.dispose();
});
