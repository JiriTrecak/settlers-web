import {it,expect} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {foliageWind,FoliageWindLayer} from '../../src/render/prop/foliageWind';
it('accepts bounded authored wind and rejects malformed imported metadata',()=>{
 expect(foliageWind({amplitude:.12,speed:.18})).toEqual({amplitude:.12,speed:.18});
 for(const v of [null,{}, {amplitude:Infinity,speed:1},{amplitude:1,speed:1},{amplitude:.1,speed:-1}])expect(foliageWind(v)).toBeNull();
});
it('uses the same pinned-root deformation and clock for foliage and its depth shadow',()=>{
 const layer=new FoliageWindLayer(),root=new Group(),m=new MeshStandardMaterial(),mesh=new Mesh(new BoxGeometry(),m);root.add(mesh);
 layer.attach(root,{amplitude:.15,speed:.2},2);layer.tick(2500);
 const shader=()=>({uniforms:{} as Record<string,{value:unknown}>,vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:''});
 const color=shader(),depth=shader();m.onBeforeCompile(color as never,{} as never);mesh.customDepthMaterial!.onBeforeCompile(depth as never,{} as never);
 expect(depth.vertexShader).toBe(color.vertexShader);expect(color.vertexShader).toContain('clamp(position.y/uFoliageWind.z,0.,1.)');
 expect(color.uniforms.uFoliageClock).toBe(depth.uniforms.uFoliageClock);expect(color.uniforms.uFoliageClock.value).toBe(2.5);
 layer.dispose();mesh.geometry.dispose();m.dispose();
});
