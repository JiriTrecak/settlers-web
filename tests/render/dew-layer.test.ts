// Dew beads: baked node extras reach prototype space, and capacity growth survives three's instance cap cache.
import {describe,expect,it} from 'vitest';
import {Group,Mesh,BufferGeometry} from 'three';
import {DewLayer,prototypeDew} from '../../src/render/prop/dewLayer';

describe('dew layer',()=>{
 it('lifts node-space beads into the prototype root, scaling radii',()=>{
  const root=new Group(),pivot=new Group(),node=new Mesh(new BufferGeometry());
  pivot.position.set(0,-2,0);pivot.scale.setScalar(2);node.position.set(1,0,0);
  node.userData.dew=[0,1,0,.5];pivot.add(node);root.add(pivot);
  expect(prototypeDew(root)).toEqual([2,0,0,1]);
  expect(prototypeDew(new Group())).toBeUndefined();
 });
 it('replaces the instanced geometry when beads outgrow it',()=>{
  const dew=new DewLayer(),mesh=dew.scene.children[0] as Mesh,first=mesh.geometry;
  dew.set(1,new Float32Array(4*10));
  expect(mesh.geometry).toBe(first);
  dew.set(2,new Float32Array(4*300));
  expect(mesh.geometry).not.toBe(first);
  expect((mesh.geometry as unknown as {instanceCount:number}).instanceCount).toBe(300);
  expect(mesh.geometry.attributes.dew!.count).toBe(512);
  dew.dispose();
 });
});
