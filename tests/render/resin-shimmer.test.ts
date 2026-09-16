import {expect,it} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
import {resinShimmer,ResinShimmerLayer} from '../../src/render/prop/resinShimmer';
it('rejects malformed imported shimmer metadata',()=>{
 expect(resinShimmer({strength:.3,speed:.2})).toEqual({strength:.3,speed:.2});
 for(const v of [null,{}, {strength:2,speed:1},{strength:.3,speed:Infinity},{strength:.3,speed:-1}])expect(resinShimmer(v)).toBeNull();
});
it('shares a visual clock, preserves existing shader hooks and leaves unrelated materials unchanged',()=>{
 const layer=new ResinShimmerLayer(),root=new Group(),resin=new MeshStandardMaterial(),wood=new MeshStandardMaterial();
 resin.userData.resinShimmer={strength:.3,speed:.2};const original=wood.onBeforeCompile;
 resin.onBeforeCompile=s=>{s.uniforms.existing={value:1};};
 root.add(new Mesh(new BoxGeometry(),resin),new Mesh(new BoxGeometry(),wood));
 layer.attach(root);layer.attach(root);layer.tick(2000);
 const shader={uniforms:{} as Record<string,{value:unknown}>,vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'};
 resin.onBeforeCompile(shader as never,{} as never);
 expect(shader.uniforms.existing.value).toBe(1);expect(shader.uniforms.uResinClock.value).toBe(2);
 expect(shader.fragmentShader.match(/float resinTime=/g)).toHaveLength(1);
 layer.tick(3250);expect(shader.uniforms.uResinClock.value).toBe(3.25);expect(wood.onBeforeCompile).toBe(original);
 root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});resin.dispose();wood.dispose();
});
