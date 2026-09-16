import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,MeshStandardMaterial} from 'three';
import {SceneryCutaway} from '../../src/render/visibility/sceneryCutaway';
function camera(){const c=new PerspectiveCamera(45,16/9,.1,100);c.position.set(0,8,18);c.lookAt(0,1,0);c.updateProjectionMatrix();c.updateMatrixWorld();return c;}
function data(s:SceneryCutaway){return s.texture.image.data as Float32Array;}
describe('scenery camera cutaways',()=>{
 it('projects a visible unit with depth and a soft edge, then clears vanished subjects',()=>{
  const s=new SceneryCutaway();s.update(camera(),[{position:{x:0,y:0,z:0},height:2}]);
  const values=data(s),depths=values.filter((_,i)=>i%4===0),weights=values.filter((_,i)=>i%4===1);
  expect(Math.max(...depths)).toBeGreaterThan(15);expect(Math.max(...weights)).toBe(1);
  expect(weights.some(v=>v>0&&v<1)).toBe(true);
  s.update(camera(),[]);expect(data(s).some(v=>v!==0)).toBe(false);s.dispose();
 });
 it('ignores subjects behind the camera and avoids redundant uploads for an idle army',()=>{
  const s=new SceneryCutaway(),c=camera();s.update(c,[{position:{x:0,y:12,z:30},height:2}]);expect(data(s).some(v=>v!==0)).toBe(false);
  const units=[{position:{x:0,y:0,z:0},height:2}];s.update(c,units);const version=s.texture.version;s.update(c,units);expect(s.texture.version).toBe(version);s.dispose();
 });
 it('keeps all units in a large visible army without a fixed subject limit',()=>{
  const s=new SceneryCutaway(),c=camera();const units=Array.from({length:200},(_,i)=>({position:{x:i<199?1000:0,y:0,z:0},height:2}));
  s.update(c,units);expect(data(s).some(v=>v>0)).toBe(true);s.dispose();
 });
 it('hooks only the color material, preserves earlier shader hooks and leaves shadow options untouched',()=>{
  const s=new SceneryCutaway(),m=new MeshStandardMaterial();let called=0;m.onBeforeCompile=()=>{called++;};
  s.attach(m);s.attach(m);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'};
  m.onBeforeCompile(shader as never,{} as never);expect(called).toBe(1);expect(shader.fragmentShader).toContain('cut.r-vCutawayDepth');expect(m.transparent).toBe(false);expect(m.alphaTest).toBe(0);s.dispose();m.dispose();
 });
});
it('lets interior terrain cutaways be disabled without recompiling the shared material',()=>{
 const s=new SceneryCutaway(),m=new MeshStandardMaterial(),scope={value:0};s.attach(m,16,scope);
 const shader={uniforms:{} as Record<string,{value:unknown}>,vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'};
 m.onBeforeCompile(shader as never,{} as never);expect(shader.uniforms.uCutawayScope).toBe(scope);
 scope.value=1;expect(shader.uniforms.uCutawayScope.value).toBe(1);expect(shader.fragmentShader).toContain('uCutawayScope>.5');s.dispose();m.dispose();
});
