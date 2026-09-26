import {describe,expect,it} from 'vitest';
import {Group,Object3D,Mesh} from 'three';
import {MeleeTrails} from '../../src/render/settlement/meleeTrails';
function fixture(){const scene=new Group(),root=new Group(),base=new Object3D(),tip=new Object3D();base.name='socket_blade_base';tip.name='socket_blade_tip';tip.position.y=1;root.add(base,tip);scene.add(root);const effects=new MeleeTrails(scene);return {scene,root,tip,effects,mesh:scene.getObjectByName('Melee blade ribbons') as Mesh};}
describe('Visible melee ribbons',()=>{
 it('only emits on the strike interval and expires without leaking a hidden unit',()=>{
  const {root,tip,effects,mesh}=fixture();effects.sample(1,root,10,1,.1);effects.sample(1,root,11,1,.2);effects.update(11,new Set([1]));expect(mesh.geometry.drawRange.count).toBe(0);
  effects.sample(1,root,12,1,.48);tip.position.z=1;effects.sample(1,root,12.5,1,.55);effects.update(12.5,new Set([1]));expect(mesh.geometry.drawRange.count).toBe(6);
  effects.update(12.5,new Set());expect(mesh.geometry.drawRange.count).toBe(0);effects.dispose();
 });
 it('does not bridge between attacks, duplicate stalled samples or exceed its bounded pool',()=>{
  const {root,tip,effects,mesh}=fixture();const visible=new Set<number>();
  for(let id=0;id<100;id++){visible.add(id);effects.sample(id,root,1,1,.48);tip.position.z=1;effects.sample(id,root,2,1,.55);effects.sample(id,root,2,1,.55);}
  effects.update(2,visible);expect(mesh.geometry.drawRange.count).toBe(64*6);
  effects.sample(0,root,2.5,2,.48);effects.update(2.5,visible);expect(mesh.geometry.drawRange.count).toBe(63*6);
  effects.update(6,visible);expect(mesh.geometry.drawRange.count).toBe(0);effects.dispose();
 });
});
