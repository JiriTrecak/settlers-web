// Dew beads: baked node extras reach prototype space.
import {describe,expect,it} from 'vitest';
import {Group,Mesh,BufferGeometry} from 'three';
import {prototypeDew} from '../../src/render/prop/dewLayer';

describe('dew layer',()=>{
 it('lifts node-space beads into the prototype root, scaling radii',()=>{
  const root=new Group(),pivot=new Group(),node=new Mesh(new BufferGeometry());
  pivot.position.set(0,-2,0);pivot.scale.setScalar(2);node.position.set(1,0,0);
  node.userData.dew=[0,1,0,.5];pivot.add(node);root.add(pivot);
  expect(prototypeDew(root)).toEqual([2,0,0,1]);
  expect(prototypeDew(new Group())).toBeUndefined();
 });
});
